# ⚡ WorkDesk

**One ranked board for Field Nation and WorkMarket work orders.** Both platforms in a single
feed, scored against your base location, pay floor, skills and radius, with application
tracking — no account, no server, no telemetry.

WorkDesk lives in `workdesk/` inside the [`therealwindycity`](https://github.com/therealwindycity/therealwindycity)
repo, which is otherwise a civic-transparency project for Cheyenne / Laramie County. It shares
nothing with that code. See **[Moving it to its own repo](#moving-it-to-its-own-repo)**.

---

## Read this first: there is no API key to enter

This shapes every design decision below, so it is worth two minutes.

| Platform | What its API actually is | Available to a technician? |
|---|---|---|
| **Field Nation** | The **Client (buyer) REST API**. Published prerequisites: an active *Buyer* account, a signed integration contract, and credentials issued by Field Nation. OAuth 2.0 password grant, 1-hour token, no refresh token, token appended as a query parameter. | **No.** There is no provider-side endpoint for browsing available work orders. |
| **WorkMarket** | The **Open API** for *client companies* — create/manage assignments, labour pools, webhooks, bulk upload. ADP-owned; the ADP Marketplace "work assignment" APIs are unrelated HR systems. | **No.** There is no public contributor-side API for browsing available assignments. |

Calling either API from a static site would fail twice over anyway: CORS, and credentials
exposed in public JavaScript.

**So WorkDesk does not pretend.** Instead:

- **The Sidekick** — a userscript that runs inside your *own* logged-in browser session and
  hands over the listings your browsing already loaded. No credentials read, stored, or sent.
- **Manual paths** — paste text, drop a CSV/JSON, paste a sync code. All three use the same
  normalizer as the Sidekick.
- **A dormant API poller** — `worker/poll.py` plus a GitHub Actions workflow, fully built and
  green with no secrets, ready for the day buyer-side credentials exist.
  See **[SETUP → The API poller](docs/SETUP.html#api-poller)**.

And WorkDesk **never submits an application**. It copies your pitch, opens the real work
order in a new tab, and tracks the outcome. You press submit. Both platforms prohibit
automated session activity, and this repo's [`LEGAL.md`](../LEGAL.md) requires a human on
every outbound action.

---

## What it does

- **One board.** Both platforms side by side, deduplicated, ranked by a WorkScore (0–100)
  with the reason printed on every card.
- **Net $/hr, not posted pay.** A `$340 flat` job with a posted 6-hour window is compared
  honestly against a `$51/hr` job — after the platform fee.
- **Real distance from your base.** A built-in **1,467-city** coordinate table runs offline:
  no map API key, nothing sent anywhere. Dense across WY, CO, NE, UT, ID, MT, SD, NM, AZ, NV,
  TX, ND, plus every state capital, every US metro over 150k, and Canada. Typo tolerant —
  `Cheynne, WY` resolves.
- **Application tracking.** Available / New / Saved / Applied / Outcomes / Ignored, with
  notes, follow-ups and won/lost. Outcomes feed back into ranking, so buyers who actually
  award you work drift up.
- **Guided setup.** Seven stages, each verified before it advances, each with a pop-up that
  tells you exactly what to fix — and a 🚀 button that packages your real state into a
  pre-filled issue when you need the program advanced.
- **Offline-first.** IndexedDB (with a `localStorage` fallback), gzip sync codes, and no
  runtime network dependency beyond the data you bring in.

## Layout

```
workdesk/
├── index.html                     SPA shell — declares the asset load order
├── assets/
│   ├── util.js                    DOM, format, date, geo-math, b64+gzip, toast, modal
│   ├── geo.js                     offline city table, geocode, state centroids
│   ├── normalize.js               schema + platform-agnostic ingest (the interesting one)
│   ├── score.js                   WorkScore ranking and its explanations
│   ├── store.js                   IndexedDB store, settings, buyer history
│   ├── bridge.js                  4 ingest channels, sync codes, relay, export/restore
│   ├── wizard.js                  7-stage guided setup, diagnostics, advance-the-program
│   ├── app.js                     the board: feed, filters, drawer, tracking, settings
│   └── workdesk.css               dark dispatch-board theme
├── sidekick/
│   ├── workdesk-sidekick.user.js  the userscript bridge
│   └── install.md                 install + permission-by-permission explanation
├── data/
│   └── workorders.sample.json     24 demo orders in 3 different payload shapes
├── worker/poll.py                 dormant API poller (pure stdlib, no dependencies)
├── docs/
│   ├── SETUP.html                 the guide the app links to
│   └── TROUBLESHOOTING.md         symptom → fix
├── tests/
│   ├── core.test.mjs              82 checks — dev only, not published
│   └── boot.test.mjs              114 checks — dev only, not published
└── spin-off.sh                    move WorkDesk into its own standalone repo
```

Assets load in that order: each file is an IIFE that hangs its API off one global,
`window.WorkDesk`. No bundler, no build step, no dependencies — `index.html` is the whole
deployment.

## Try it in thirty seconds

```bash
cd workdesk
python3 -m http.server 8848
# open http://localhost:8848/
```

It auto-loads 24 sample orders on a first run so you can see ranking behave before any real
data arrives. Then press **⋯ → Guided setup wizard**.

`file://` will not work — browsers block `fetch()` of a local file, so the sample data
cannot load. Any static server will do.

## The normalized schema

Everything that arrives — Sidekick network capture, Sidekick DOM scrape, CSV, pasted text,
a poller response — is flattened into one shape, `workdesk.order.v1`:

```
schema, dedupe, id, platform (fieldnation|workmarket|unknown),
title, company, contact, description, description_html,
address1, address2, city, state, zip, country, lat, lng, geo_precision (city|state),
pay {raw, type (hourly|flat|per_unit|unknown), amount, min, max, units, currency,
     unit_label, source},
hourly, hourly_basis, start, end, posted_at,
work_types[], skills[], requirements[], status, url, apply_url,
distance_mi, drive_min, duration_hint, source, captured_at,
harvest {method, page_url, endpoint, ok, notes, fields[], first_seen, last_seen, seen_count},
raw,
my {state (open|saved|applied|ignored|won|lost), applied_at, pitch, note, outcome,
    saved_at, ignored_at, seen_at, followups[]}
```

Two deliberate choices:

- **`dedupe` is the storage key.** `platform + ':' + hash(platform + id)` when an id exists,
  otherwise a hash of platform/title/city/state/start/pay. Re-ingesting the same listing
  refreshes it and **preserves `my`** — your tracking state survives every sync.
- **The Sidekick ships raw captures; WorkDesk does all the interpreting.** When a platform
  redesigns its payload, the fix lands in `assets/normalize.js` and reaches everyone on the
  next page load. Nobody has to reinstall a userscript.

## WorkScore

Five weighted components, normalised to 0–100:

| Component | Default weight | Notes |
|---|---|---|
| Pay | 34 | Scored on **net** $/hr against your floor and target |
| Distance | 24 | 1.0 inside your ideal radius, 0.05 past your max |
| Timing | 16 | Starts today beats 45 days out; stale postings drop hard |
| Skill match | 18 | Your skills against title, description, work types, requirements |
| Buyer history | 8 | Won here → 1.0. Ignored here → 0.35. Never seen → 0.55 |

Then multipliers: a blocked keyword costs 75% of the score, a missing required keyword 60%,
and Field Nation takes a 10% platform haircut by default (configurable). Every card shows
the score *and* why; every drawer shows all five bars with their reasons. Flags surface the
uncertain cases rather than hiding them — `distance is a rough state-level estimate`,
`no pay posted`, `under pay floor`, `past max miles`.

Weights are yours to change in **⋯ → Ranking weights**.

## Deploying

Two GitHub Actions workflows, both additive:

- **`.github/workflows/workdesk-pages.yml`** — publishes `workdesk/` as the Pages site root
  and `public/` under `/ledger/`, so turning Pages on for WorkDesk takes nothing away from
  the existing civic build. Triggers on `workdesk/**`, `public/**`, and manual dispatch.
- **`.github/workflows/workdesk-poll.yml`** — runs `poll.py selftest`, `check`, then `once`
  on a `23 */4 * * *` cron, committing `data/feed.json` only when it changes. Optional
  `NTFY_TOPIC` secret for phone push. Dormant and green with no secrets set.

**One manual step remains:** repo **Settings → Pages → Source: GitHub Actions**. That
setting can only be changed by a repository admin through the web UI — a workflow cannot
enable Pages for itself, and the Actions API returns 403 for a repo-scoped installation
token.

Every URL in WorkDesk is relative, so it works at `/`, at `/<repo>/`, or at
`/<repo>/workdesk/` without a rebuild.

## Tests

Dev-only, excluded from the published artifact.

```bash
node tests/core.test.mjs    # 82 checks — pure logic, no DOM
node tests/boot.test.mjs    # 114 checks — boots the real index.html and every real
                            # asset in jsdom, then drives the actual UI
```

`boot.test.mjs` needs jsdom:

```bash
mkdir -p ~/wdtest && cd ~/wdtest && npm install jsdom
```

It boots the unmodified files, then clicks through tabs, search, filters, sort, the drawer,
the apply flow, all seven wizard stages, all nine settings sheets, sync-code round trips,
CSV and pasted-text import, backup export, and accessibility. Any console error, unhandled
rejection or missing render fails the run. That is how an infinite recursion in the date
formatter, a set of dead card buttons, and a first-paint-empty board were all caught before
release.

```
core.test.mjs   ALL GREEN  82 passed, 0 failed
boot.test.mjs   ALL GREEN  114 passed, 0 failed, 0 runtime error(s)
```

## Privacy

- No account. No server. No analytics. No telemetry. Static files.
- No field anywhere in WorkDesk accepts a Field Nation or WorkMarket password.
- The Sidekick never reads cookies or password fields, and never calls an endpoint your
  browsing did not already call.
- Exports strip relay tokens. Diagnostics contain settings *shapes* and counts, never
  credentials or order contents.

## Moving it to its own repo

```bash
cd workdesk
./spin-off.sh --help
./spin-off.sh --owner YOUR_GITHUB_USERNAME --repo workdesk
```

The script copies the app into a clean directory, starts a fresh git history, rewrites the
Sidekick's default board URL, regenerates both workflows for the new repo, and prints the
two commands to create and push it. It does not touch this repo, and it does not need any
permission it does not have. Afterwards, change one setting in the Sidekick:
**⚡ WorkDesk settings → Board URL**.

## Docs

- **[docs/SETUP.html](docs/SETUP.html)** — the full guide. This is what **⋯ → Setup guide**
  opens inside the app.
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — symptom → fix.
- **[sidekick/install.md](sidekick/install.md)** — installing the userscript, and what each
  permission is for.
