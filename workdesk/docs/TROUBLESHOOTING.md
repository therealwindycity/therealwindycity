# WorkDesk — troubleshooting

Every symptom below was either reproduced by the test harness in `workdesk/tests/` or is a
documented consequence of how the platforms work. If your problem is not here, the fastest
route to a fix is **⋯ → Advance the program** inside the app: it packages your real setup
state into a pre-filled GitHub issue.

First stop, always: **⋯ → Diagnostics**. It runs sixteen self-tests against your actual
browser and tells you which subsystem is broken. Everything below assumes you have done that.

---

## The Sidekick captures nothing

**Symptom** — you are on a Field Nation or WorkMarket listings page, the ⚡ pill is there,
but its count stays at 0.

1. **Is the userscript actually running on this page?** Click the Tampermonkey icon. The
   WorkDesk entry must show `1` (enabled) *and* be listed as running on this page. If it
   shows as installed but not running, the `@match` patterns did not cover the host — note
   the exact URL and report it.
2. **Did the page load before the script?** The Sidekick runs at `document-start`, so this
   is rare. A hard reload fixes the rest.
3. **Is the data even there?** The Sidekick only captures responses that look like work
   orders — at least three of title / pay / location / id / date / description. If a
   platform serves a page with none of that (a login wall, a marketing page), there is
   nothing to capture. Log in first, then browse to the listings.
4. **Markup changed.** This is the usual cause. Click on one listing card, then press
   **Teach me the page** in the pill. It learns the selector for that card, remembers it,
   and rescans. This exists precisely so a platform redesign is a ten-second fix rather
   than a dead end.
5. **Still nothing?** Open the browser devtools console. The Sidekick logs what it hooked
   and what it skipped. Copy the last few lines into an issue.

## The Sidekick captures, but WorkDesk stays empty

**Symptom** — the pill shows a count, WorkDesk does not change.

- **Pop-ups are blocked.** The handoff opens a WorkDesk tab when one is not already open,
  and browsers block that unless you initiated it. Use **Copy code** in the pill, then
  **⋯ → Import work orders → paste a sync code**. That path has no pop-up dependency.
- **You have two WorkDesk tabs open.** Data goes to the one that announced itself first.
  Close the extras and press the pill's **Board** button.
- **The board URL is wrong.** Tampermonkey → **⚡ WorkDesk settings → Board URL**. If you
  spun WorkDesk off into your own repo, this still points at the old one.
- **Different browser profile.** The Sidekick and WorkDesk must be in the same browser
  profile; a userscript installed in your default profile does not run in a work profile.

## The board is empty on a first load

WorkDesk loads 24 sample orders on a genuinely first run so you can see ranking behave
before any real data arrives. If even those do not appear:

- **Are you on `file://`?** Double-clicking `index.html` will not work: the browser blocks
  `fetch()` of a local file. Serve the directory instead:
  ```bash
  cd workdesk && python3 -m http.server 8848
  # then open http://localhost:8848/
  ```
- **Is `data/workorders.sample.json` present?** It ships with the app. If you copied
  `workdesk/` somewhere by hand, that directory is easy to miss.
- **Check ⋯ → Diagnostics → "sample board"**. It reports the HTTP status it actually got.

## Distances are wrong, or missing

- **Your base is not set.** Everything is measured from your home base. Open **⋯ → My
  profile** and confirm the city/state resolved to coordinates — the field shows the
  lat/lng it settled on.
- **A listing posted only a state.** WorkDesk falls back to the state centroid and badges
  the card **rough**, then scores the distance component down. This is deliberate: a
  Wyoming-wide job could be 20 miles away or 400, and pretending otherwise would put it at
  the top of your board.
- **The city is not in the table.** The built-in table has 1,467 cities, dense across
  WY/CO/NE/UT/ID/MT/SD/NM/AZ/NV/TX/ND plus every state capital, every US metro over 150k,
  and Canada. Typo tolerance is built in (`Cheynne, WY` resolves). If a real city is
  missing, set exact coordinates on your profile or report the city — adding a row is a
  one-line change to `assets/geo.js`.
- **You want a real road distance.** WorkDesk computes great-circle distance × 1.22 as a
  road approximation. That is good enough to rank; it is not a routing engine, and using
  one would require a map API key and would send your job locations to a third party.

## $/hr is missing or looks wrong

- **No window and no duration posted.** A flat fee with no hours cannot become an hourly
  rate without an assumption, so WorkDesk says *Cannot derive $/hr* rather than inventing
  one. Set **Typical job length** in your profile and it will use that as the divisor,
  labelled as an estimate.
- **A posted range.** WorkDesk scores on the low end and shows the range. Optimistic
  readings of `$45–$65/hr` are how people end up driving 90 miles for $45.
- **The platform fee.** Net $/hr is after your configured haircut — Field Nation defaults
  to 10%, WorkMarket to 0%. If your contract differs, change it in **⋯ → My profile**.

## An order mapped wrong

Wrong company, wrong city, pay attached to the wrong field, dates off by a year.

1. Open the order's drawer and expand **Raw capture & diagnostics**. It shows exactly which
   fields the adapter mapped and the original payload beside it.
2. Press **🩺 Not mapped right?** — it copies a diagnostic JSON (keys and mapped values
   only, never the full order contents) and opens a pre-filled issue.
3. Paste the diagnostic into the issue. That is usually enough to fix the adapter in one
   pass, and the fix lands in `assets/normalize.js` — no userscript reinstall needed,
   because the Sidekick ships raw captures and WorkDesk does all the interpreting.

**Dates landing in the wrong year** were a real bug here and are fixed: a posting that says
only `Jul 20` used to be read by JavaScript as the year 2001. Year-less dates are now
anchored to the current year, and are *not* rolled forward — if that puts the date in the
past, the listing genuinely is stale, and the ranking says so instead of inventing a job
twelve months away.

## Applying does not open the work order

- **Deep link could not be built.** WorkDesk links `app.fieldnation.com/workorder/<id>` and
  `app.workmarket.com/assignments/<id>`. If the capture did not include an id, the link
  falls back to the platform's search page — the drawer says so. Re-capture the listing
  from a page that shows the id.
- **The platform moved the id.** If a deep link 404s, report the URL; `LINKS` in
  `assets/normalize.js` is a small table and is easy to correct.
- **Your clipboard was blocked.** Some browsers only allow a copy during a user gesture.
  The pitch is still in the drawer's text box — select and copy it manually.

## Data disappeared

WorkDesk keeps everything in IndexedDB (falling back to `localStorage` when IndexedDB is
unavailable — ⋯ → Diagnostics tells you which one you are on). That means:

- **Private/incognito windows lose everything on close.** Do not use one as your daily board.
- **"Clear site data" deletes it.** So does uninstalling the browser.
- **A different browser or device is a different board.** Use a sync code or a relay.

Take a backup: **⋯ → Export & backup**. It writes a JSON file containing every order plus
your settings, with any relay token stripped. Restore from the same sheet.

## Notifications never fire

- **Permission.** **⋯ → Notifications** must show *granted*. If the browser blocked it,
  reset the permission for the site in the address bar.
- **The board must be open.** A static site has no server to push from, so notifications
  fire when orders arrive while the board is open, or on a manual refresh.
- **Your thresholds are too tight.** Minimum score, minimum pay and maximum miles all apply.
  A minimum score of 90 will almost never fire.
- **You want alerts with the board closed.** Use the **ntfy relay**: the Sidekick pushes to
  a private topic on `ntfy.sh`, and the ntfy phone app delivers it whether or not anything
  is open. See [SETUP.html#relay](SETUP.html#relay).

## GitHub Pages specifics

- **The workflow ran but the site 404s.** Pages must be set to **Source: GitHub Actions**
  in repo Settings → Pages. Adding the workflow file is not enough; that setting can only
  be changed by a repository admin through the web UI.
- **Assets 404 but `index.html` loads.** Every URL WorkDesk uses is relative, so it works
  at `/`, at `/<repo>/`, and at `/<repo>/workdesk/`. If you moved files, keep the directory
  structure intact.
- **The civic ledger vanished.** It did not — `workdesk-pages.yml` publishes `public/` under
  `/ledger/`. Check `https://<org>.github.io/<repo>/ledger/`.
- **Changes are not appearing.** Pages deployments take a minute or two, and the CDN caches.
  Check the `workdesk-pages` run in the Actions tab, then hard-reload.

## The API poller

See **[SETUP.html#api-poller](SETUP.html#api-poller)** for the full story. The short
version: it is dormant on purpose, because neither Field Nation nor WorkMarket issues API
credentials to technicians. `python3 workdesk/worker/poll.py selftest` passes offline today,
and `python3 workdesk/worker/poll.py check` prints which credentials are missing. Neither
one can hurt anything.

---

## Reporting a problem

**⋯ → Advance the program** (or the 🚀 button on any failed wizard step) builds a
diagnostic bundle and opens a pre-filled GitHub issue. The bundle contains your WorkDesk
version, browser, storage backend, order counts, bridge counts, settings *shapes*, and
recent error messages.

It never contains passwords, API tokens, relay tokens, or the contents of your work orders.
If you want to include an order, the drawer's **🩺 Not mapped right?** button copies a
separate, scrubbed diagnostic for that one order — paste it in deliberately.

## Running the tests

Both harnesses are dev-only and are excluded from the published site.

```bash
cd workdesk
node tests/core.test.mjs    # 82 checks: geo, pay parsing, all four normalizers,
                            # dedupe/merge, ranking, the real sample board, static
                            # checks on the Sidekick and the poller
node tests/boot.test.mjs    # 114 checks: boots the real index.html and every real
                            # asset in jsdom, then drives tabs, filters, sort, the
                            # drawer, apply, the wizard pop-ups, all nine settings
                            # sheets, sync codes, CSV and pasted-text import
```

`boot.test.mjs` needs jsdom:

```bash
mkdir -p ~/wdtest && cd ~/wdtest && npm install jsdom
```

Any console error, unhandled rejection, or missing render fails the run — which is how the
infinite recursion in the date formatter and the dead card buttons were caught before this
guide was written.
