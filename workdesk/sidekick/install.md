# Installing the WorkDesk Sidekick

The Sidekick is the bridge between your logged-in Field Nation / WorkMarket sessions and
your WorkDesk board. It is a **userscript** — about 49 KB of JavaScript that runs in your own
browser, in your own session, only on those two domains.

There is no extension to publish, no store review, and nothing installed on a server.

---

## 1 · Install a userscript manager

Pick one. Tampermonkey is the recommended default because it is the most widely maintained
and handles `document-start` and `GM_xmlhttpRequest` consistently.

| Browser | Tampermonkey | Alternatives |
|---|---|---|
| Chrome / Edge / Brave | [Chrome Web Store](https://chromewebstore.google.com/) → search "Tampermonkey" | Violentmonkey |
| Firefox | [addons.mozilla.org](https://addons.mozilla.org/) → search "Tampermonkey" | Violentmonkey, Greasemonkey |
| Safari | Mac App Store → "Tampermonkey" (paid, by the same author) | Userscripts (free) |

Chrome 138+ requires **Developer mode** to be on for userscript managers to inject. Tampermonkey
will tell you if this is needed: `chrome://extensions` → toggle **Developer mode**.

## 2 · Install the Sidekick

**Easiest:** open [`workdesk-sidekick.user.js`](workdesk-sidekick.user.js) in a new tab.
Userscript managers intercept `.user.js` URLs and show an install screen. Check that the
name reads *WorkDesk Sidekick — Field Nation + WorkMarket* and the version reads `1.0.0`,
then confirm.

**Or from the dashboard:** Tampermonkey → **Utilities** → **Install from URL**, and paste the
absolute URL of the file. On the deployed site that is:

```
https://<org>.github.io/<repo>/workdesk/sidekick/workdesk-sidekick.user.js
```

The setup guide fills this in for your actual host — see
[docs/SETUP.html → Install the Sidekick](../docs/SETUP.html#sidekick).

**Or from disk:** Tampermonkey → **Utilities** → **Import** → choose the file.

## 3 · Point it at your board

Click the Tampermonkey icon → **⚡ WorkDesk settings**.

| Setting | Default | Notes |
|---|---|---|
| **Board URL** | this repo's Pages URL | Change it once if you [spin WorkDesk off](../spin-off.sh) into your own repo |
| **Auto-send** | off | When on, every capture is pushed to the board as you browse |
| **Capture DOM cards too** | on | The fallback for pages with no capturable JSON call |
| **Relay** | off | `ntfy.sh` topic, GitHub Gist, or a custom URL — see below |
| **Pitch template** | blank | What **⚡ Fill my pitch** types into a platform text box |

## 4 · Confirm it works

1. Log in to Field Nation or WorkMarket normally and open the available-work / assignments page.
2. The ⚡ pill appears in the corner with a **live count** of captured orders.
3. Press **Send** — or **Board** to open WorkDesk first.
4. Back in WorkDesk, the setup pill turns green for the Sidekick step. The userscript checks
   in with a version stamp, and that check-in alone is enough to verify the handshake.

If the count stays at 0, click a listing card and press **🎯 Teach me the page**. See
[TROUBLESHOOTING](../docs/TROUBLESHOOTING.md#the-sidekick-captures-nothing).

---

## The pill

| Button | What it does |
|---|---|
| **Send** | Pushes captures to an open WorkDesk tab, or opens one |
| **Copy code** | A gzipped, checksummed sync code for the clipboard — the pop-up-blocker-proof path |
| **Teach** | Learn the selector for the card you click, and remember it |
| **Settings** | The panel above |
| **Board** | Open WorkDesk |
| **Auto-send** | Toggle continuous sending |

Tampermonkey menu commands mirror all of these: **⚡ Send captures to WorkDesk**,
**📋 Copy sync code**, **🎯 Teach me the page**, **⚙️ Sidekick settings**,
**🗑 Clear captures**, **📖 Open my WorkDesk board**.

## How the handoff works

The Sidekick tries four transports in order, so a blocked pop-up is never a dead end:

1. **`postMessage`** to an already-open WorkDesk tab. WorkDesk mints a one-time nonce and
   only accepts a message that echoes it, comes from its own opener, or matches a trusted
   origin (`*.fieldnation.com`, `*.workmarket.com`, localhost, same-origin).
2. **Open WorkDesk with the payload in the URL fragment** (`#ingest=…`), when the code is
   under ~46 KB — Firefox caps address-bar length, so this is size-checked first.
3. **Open WorkDesk with a handshake fragment** (`#wdhandoff=1`), then post the payload every
   500 ms up to twenty times until the board acknowledges.
4. **Clipboard sync code**, if pop-ups are blocked outright.

Nothing is stored in between. The capture ring buffer is capped at 6 MB and lives in memory.

---

## Every permission, and why

The install screen lists these. Here is what each one is actually for.

### `@match`

```
https://app.fieldnation.com/*     https://*.fieldnation.com/*
https://www.fieldnation.com/*     https://app.workmarket.com/*
https://*.workmarket.com/*        https://www.workmarket.com/*
```

The script only runs on those two domains. It does not run on your bank, your email, or
anywhere else. HTTPS only.

### `@grant`

| Grant | Used for |
|---|---|
| `GM_setValue` / `GM_getValue` / `GM_deleteValue` | Remembering your board URL, taught selectors, relay config and pitch template. Falls back to `localStorage` when unavailable. Stored in your browser only. |
| `GM_registerMenuCommand` | The six menu commands above. |
| `GM_xmlhttpRequest` | Two things only: pushing to a relay **you** configured, and reading it back. Ordinary `fetch` would be blocked by CORS. Never used to contact a platform. |
| `GM_setClipboard` | Copying the sync code. |
| `GM_notification` | A desktop notification when a capture round completes. |
| `GM_addStyle` | The pill's CSS, scoped so it cannot restyle the platform's page. |

### `@connect`

```
github.com  gist.github.com  api.github.com  gist.githubusercontent.com  ntfy.sh  *
```

The named hosts are for the two built-in relays. The wildcard `*` is there because your
**Board URL** can be any origin you choose — your own Pages domain, a local server, a custom
domain — and the script must be able to reach it.

If you would rather lock that down, delete the `*` line and add your board's origin
explicitly:

```
// @connect     therealwindycity.github.io
```

Nothing else changes. Tampermonkey will otherwise prompt you the first time a new origin is
contacted, which is a reasonable middle ground.

### `@run-at document-start`, `@noframes`

`document-start` is required to hook `fetch`, `XMLHttpRequest` and `WebSocket` before the
platform's own bundle runs — otherwise the first listing response is missed. `@noframes`
keeps a second copy out of any iframe on the page.

---

## What the Sidekick captures

**Network responses.** It hooks `fetch`, `XMLHttpRequest.open/send` and `WebSocket`, and keeps
JSON responses that look like work-order listings — at least three of *title, pay, location,
id, date, description*. Everything else is discarded at the door.

**Rendered cards.** When a platform renders without a capturable JSON call, it walks the DOM
for the smallest repeated element containing a money value and a state code or ZIP, and reads
title, city, state, zip, pay, start, url, id, description and company off each one.

It ships **raw captures**. It does not interpret them. WorkDesk's `assets/normalize.js` owns
every adapter, which means when a platform changes its payload shape the fix lands on the
website and reaches you on the next page load — you never reinstall the userscript.

## What the Sidekick will never do

- Read, store, or transmit your username, password, or session cookie. There is no code path
  that touches a password field or `document.cookie`.
- Submit an application, accept an assignment, or click anything on your behalf.
  **⚡ Fill my pitch** types into a text box and dispatches `input`/`change` so the platform's
  own validation sees it — then stops. You press submit.
- Call a platform endpoint your browsing did not already call.
- Phone home. There is no telemetry endpoint in the file. Grep it yourself.

The only thing it sends anywhere is what **you** press a button to send, to a destination
**you** configured.

## Relays (optional)

A relay lets the Sidekick push captures somewhere WorkDesk can poll, which is how you get data
across devices without a server.

| Relay | Setup | Notes |
|---|---|---|
| **ntfy.sh** | Invent a topic name. That is the whole setup. | Free, no account. Captures are chunked to 3,800 characters and sent 700 ms apart with a `Title: WorkDesk <platform> i/n` header. **The topic name is the only protection** — pick something unguessable, not `fieldnation-jobs`. |
| **GitHub Gist** | Create a secret Gist, then a fine-grained PAT with the **`gist` scope only**. | The token is stored in your browser and used for `PATCH api.github.com/gists/<id>`. Scope it to that one Gist. WorkDesk's own export strips it before writing a backup. |
| **Custom URL** | Any endpoint you control that accepts and returns JSON. | Your problem, your server. |

Relays are off by default and are never required — the sync code covers everything.

## Uninstalling

Tampermonkey dashboard → **WorkDesk Sidekick** → **Delete**. To also remove its stored
settings: **⚙️ Sidekick settings → 🗑 Clear everything** first, or clear
`GM_*` storage for that script from the dashboard. WorkDesk's own data is untouched and lives
in the browser's IndexedDB under the board's origin.

## Updating

Reinstalling the same URL updates in place and keeps your settings (taught selectors, board
URL, relay config, pitch template) — they are stored under keys prefixed `wd_`, separate from
the script body.

The Sidekick sends its version with every capture. If WorkDesk sees an older version than it
expects, it says so in **⋯ → Diagnostics** rather than failing quietly.

---

**Problems?** [docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md) — start with
*The Sidekick captures nothing*.
