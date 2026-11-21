# READ-FIRST.md — read this before touching anything

If you are an agent, assistant, bot, or human starting work in this repo, this
file is your mandatory entry point. It exists because multiple agents have
worked here simultaneously before, and the repo got flattened more than once.
Coordination is not optional here.

## The short version

1. **Read this whole file.** It tells you the repo state and who is doing what.
2. **Claim your work** — add an entry under *Active claims* before you start.
3. **Update your claim's `stage:` line at every major step** you make.
4. **Finish cleanly** — set your status to `done`, summarize the change, and
   move your entry to the *Work log*.
5. **Never modify files inside another active claim's scope.** If your task
   conflicts with one, you wait for it, or you coordinate via notes in their
   claim (see *Etiquette*).

## Hard rules (each of these exists because something broke)

- **Additive only.** Never delete or rewrite content you didn't create. Never
  force-push. Never reset or rewrite history.
- **The entry files are identical twins**: `streamlit_app.py` and
  `Transparency_Index_App.py` must always have identical content — change both
  or neither. Streamlit Cloud boots whichever one the settings point at.
- Never touch without an active claim naming them: the twins,
  `requirements.txt`, `data/`, `.github/`, `engine/`, `README.md`,
  `READ-FIRST.md` (protocol edits: propose in a claim first).
- No committed file over ~50 MB (GitHub's blob limit is 100 MB; the 22 MB
  tape master in `pipeline/renders/` is already the largest thing in here).
- **Credentials never go in files, commits, or this file.** Tokens live in
  Colab Secrets (`GH_PAT`) or GitHub repo secrets. A token pasted into a chat
  is a burned token.
- Pull-rebase before every push. One logical change per commit. Commit under
  the owner identity (`bartimoussmith-oss`); your worker name belongs in your
  claim below, not in git.
- Don't report success you didn't verify against the live repo or API. Two
  different bots have previously announced "deployed" for work that never
  landed. Verify, then say so.

## Etiquette for concurrent work

- A claim is **active** when its status is `proposed`, `active`, or `blocked`
  and its `updated:` stamp is less than **6 hours** old.
- If your scope overlaps an active claim: the earlier `started:` timestamp has
  right of way. You append a note to their claim ("waiting on you — I need X",
  or "I'll take the non-overlapping part"), adjust your scope, and let them
  finish. Politely. That's the whole system.
- A claim untouched for 6+ hours is assumed abandoned: append a dated note
  saying so, then you may proceed with its scope.
- Before every push, pull and re-read this file — someone may have claimed
  while you worked.

### Claim template (copy this into *Active claims*)

```markdown
### claim: short-slug — one-line description of the task
- worker: your-distinct-name
- status: proposed   # proposed | active | blocked | done | abandoned
- stage: what step you are on RIGHT NOW (update me at every major step)
- scope: paths this claim covers
- started: 2026-09-10T09:20Z
- updated: 2026-09-10T09:20Z
- notes: (coordination messages append here as "- 09:20Z name: ...")
```

## Active claims

### claim: exhibit-video-pipeline — build all 18 POE exhibit videos (statutory cards + real meeting tape + gallery + per-row source kit)
- worker: arena-agent-poe-exhibit
- status: done
- stage: shipped — 18/18 MP4s (1080×1920, 27–38 s, libx264+aac, 34.4 MB) + gallery `exhibit/videos/index.html` + 18 cards `exhibit/cards/` + **per-row source kit beside every video** (`videos/POE-XX.txt` proposed narration, `POE-XX.card.png` card layer, `POE-XX.footage.mp4` raw footage layer — independent, re-cuttable). **Tape's own audio only: no synthesized VO, no burned karaoke captions** (owner directive 2026-11-21; word timings still drive pacing/duration and the `READ Ns` card footer); GRANICUS provenance drawtext burned over the footage half; **all 18 rows render real meeting tape** (the 6 rows whose own sitting has no recording — POE-02/04/05/06/07/13 — show the closest verified sitting in the row's source chain, gallery notes say so); POE-13 long header title auto-fits (was overflowing into RECORD AUDIT). `node exhibit/tests/video-pipeline.test.mjs` → 22/22, core 46/46; on branch → **PR #7**
- scope: NEW PATHS ONLY — `exhibit/pipeline/**` (builder script + tts.js), `exhibit/videos/**` (18 MP4s + 54 kit files + gallery index.html), `exhibit/cards/**` (1080×960 statutory exhibit cards), `exhibit/.gitignore` for build intermediates, additive links from `exhibit/index.html`/`exhibit/README.md`, tests under `exhibit/tests/`, **additive staged cuts under `pipeline/videos/` (16 new date-verified files; no existing file modified)**, and this claim entry in READ-FIRST.md. Explicitly NOT touching: streamlit twins, requirements.txt, data/, engine/, existing pipeline/ footage, .github/, public/, README.md, workdesk/, uploads/.
- started: 2026-11-21T08:05Z
- updated: 2026-11-21T16:41Z
- notes: Owner asked for the full video generation pipeline over all 18 matrix rows: verify/install ffmpeg+edge-tts+pillow (yt-dlp only if needed), render 1080x960 statutory cards + narrator VO per row, composite 1080x1920 vertical videos using any Granicus footage in repo (pipeline/videos/, pipeline/renders/ — read-only) or synthesized evidence frames where none exists, and ship all 18 MP4s with a downloadable gallery in exhibit/. Dependencies installed via pip only (pypi allowed); no repo-level requirements.txt change. **Follow-up directive (2026-11-21): "Remove the robot voice and the captions from that narration and just include the proposed narration in a file alongside the video file for each" + "include with each video the different original source layers independent of one another" → tape-audio-only videos + per-row narration/card/footage kits, implemented same day.**

### claim: civic-pipeline-and-ci-repair — unblock civic scheduler, snapshot resolution, selftest isolation, Python 3.11 syntax, and failing CI workflows
- worker: arena-agent-pipeline-repair
- status: done
- stage: all fixes verified locally (15/15 unittest, run.py selftest, poll.py selftest, 82/82 workdesk core tests, all active .py compile on Python 3.11, twin parity); ready for push and PR to main (remote CI run and GitHub Pages enablement not verified)
- scope: `engine/db.py`, `engine/extract.py`, `engine/detect.py`, `engine/ingest.py`, `engine/scheduler.py`, `engine/records.py`, `run.py`, `miller_theater.py`, `.github/workflows/workdesk-poll.yml`, `.github/workflows/civic-cycle.yml`, `public/index.html`, `tests/test_engine_pipeline.py`, and this claim/work-log entry in `READ-FIRST.md`. Explicitly NOT touching: `streamlit_app.py`, `Transparency_Index_App.py` (twins), `data/`, `requirements.txt`, `README.md`.
- started: 2026-11-20T21:50Z
- updated: 2026-11-20T21:53Z
- notes: Found five concrete repo defects: (1) `engine/scheduler.py` crashed on every `civic-cycle` / `meeting-watch` run due to `from . import publish` relative import when run as a script, while swallowing the exception and exiting 0; (2) `engine/extract.py` and `engine/detect.py` failed on legacy `/home/user/civic-engine/data/snapshots/...` paths stored in `data/engine.db` even though the snapshot files exist in `data/snapshots/`; (3) `run.py selftest` mutated production `data/engine.db` and `run.py request comment` missed `--body-name`; (4) `.github/workflows/workdesk-poll.yml` failed every 4 hours with exit 128 on `git add workdesk/data/feed.json` when dormant, and `civic-cycle.yml` checked step-level `env.NTFY_TOPIC` in `if:`; (5) `miller_theater.py` line 228 had a Python 3.11 f-string backslash `SyntaxError`. All fixed with regression tests in `tests/test_engine_pipeline.py`; `public/index.html` regenerated. Note: `workdesk-pages` still requires the owner to enable GitHub Pages (Settings -> Pages -> Source: GitHub Actions) in the web UI.

### claim: calendar-ci-repair-package — safe cross-repository test repair
- worker: arena-calendar-audit
- status: done
- stage: calendar and SEO patches packaged; CI tests through SEO pass locally; browser tests, target branch, remote CI, and deployment not verified
- scope: `cross-repo/TheReelWindyCity-calendar-ci/**` and this coordination entry/work log in `READ-FIRST.md`.
- started: 2026-10-28T20:17Z
- updated: 2026-10-28T20:17Z
- notes: Reproduced calendar-test failures at target head 71981922. Existing test deletes tracked meeting inputs; patch isolates fixture data and preserves inputs. A later local SEO audit failed eight checks; a second candidate patch repairs the homepage summary and reconciles SEO assertions with five intentionally undated pages. Local lint, typecheck, nine CI test suites, build, and SEO passed; browser test, remote CI and deployment not verified.

### claim: workdesk — merged Field Nation + WorkMarket work-order board (owner-requested, separate app)
- worker: arena-agent-workdesk
- status: done
- stage: complete on branch arena/01a10a60-therealwindycity — 9 web assets + Sidekick userscript + dormant API poller + docs + spin-off script; both harnesses green (82 core / 114 jsdom boot checks, 0 runtime errors); both Pages builds simulated successfully. Pages enablement and any repo secrets still require the owner in the web UI.
- scope: NEW PATHS ONLY — `workdesk/**` (index.html, assets/, sidekick/, worker/poll.py, data/workorders.sample.json, docs/, tests/, README.md, spin-off.sh) and TWO NEW workflow files `.github/workflows/workdesk-pages.yml` + `.github/workflows/workdesk-poll.yml`; READ-FIRST.md (this claim only). `public/**` is READ-ONLY here: workdesk-pages.yml copies it verbatim into the Pages artifact under `/ledger/` and never modifies it. Explicitly NOT touching: streamlit_app.py, Transparency_Index_App.py (twins), requirements.txt, data/, engine/, pipeline/, rag/, youtube-archive/, uploads/, Entity_Database/, public/, README.md, DEPLOY.md, PERSISTENCE.md, LEGAL.md, civic-cycle.yml, or any other existing workflow.
- started: 2026-10-04T00:00Z
- updated: 2026-10-05T07:00Z
- notes: Owner-requested in chat: merge their Field Nation + WorkMarket provider accounts into one feed of available work orders, apply from there, deploy via GitHub Pages. Owner directed the whole package plus pop-up-driven progression (the 7-stage guided wizard, each stage verified before it advances). Owner chose a brand-new separate public repo — `gh repo create` fails with `Resource not accessible by integration (createRepository)` on this token, so `workdesk/spin-off.sh` is the owner's path to a standalone repo; it is verified end-to-end and the spun-off copy passes both harnesses. No credentials were requested, stored, or committed: neither platform offers a provider-side API for browsing available work (Field Nation's is buyer-side and contract-gated; WorkMarket's is company-side), so ingestion is a userscript bridge inside the owner's own logged-in session, plus paste/CSV/sync-code paths. `workdesk-poll.yml` is dormant-by-design and green with no secrets; the Actions API and `gh secret list` both 403 here, so secrets and Settings → Pages → Source: GitHub Actions must be set by the owner. Nothing was deleted or rewritten; the two new workflows are additive and leave the civic build intact.

### claim: miller-tapes — auto-playing theater for every Miller intervention
- worker: arena-agent
- status: done
- stage: PR #3 merged (e1bf0ac); branch deleted; theater live on front door
- scope: pages/2_Miller_Tapes.py (now thin wrapper), miller_theater.py (new shared module), pipeline/build_miller_index.py, pipeline/miller_interventions.json, twins (identical front-door chapter add); READ-FIRST.md (this claim + stage updates). Caption tracks (pipeline/miller_captions/, refetchable) stay OUT of git. Explicitly NOT touching: streamlit twins, engine/, data/, pipeline/* (existing), uploads/, requirements.txt, .github/, rag/, youtube-archive/
- started: 2026-09-11T20:45Z
- updated: 2026-09-11T20:45Z
- notes: 616/616 blocks cued (median match 0.97, gold-checked); AppTest + JS syntax verified; PR to main for owner merge, no direct main pushes beyond this claim

### claim: comic-universe — comic-book hero-universe re-theme of the website
- worker: arena-agent
- status: done
- stage: PR #2 merged to main 8fcfd1c (2026-09-11); branch deleted
- scope: streamlit_app.py + Transparency_Index_App.py (IDENTICAL twins — copy, never diverge), pages/1_Screening_Room.py, engine/publish.py (static-ledger theme only), public/index.html (regenerated output); READ-FIRST.md (this claim + stage updates). Copy/CSS/labels ONLY — zero logic, data, or behavior changes. Explicitly NOT touching: engine/ (except publish.py theme), data/, pipeline/, uploads/, Entity_Database/, requirements.txt, .github/, rag/, youtube-archive/, README.md
- started: 2026-09-11T18:35Z
- updated: 2026-09-11T18:45Z
- notes: owner-directed override of twin protection (re-theme authorized by repo owner 2026-09-11); twins stay byte-identical; original hero characters only (no Marvel/DC IP, no named-person villains); PR to main for owner merge, no direct main pushes beyond this claim

### claim: rag-vector-db — RAG vector DB + transcript cleanup + YouTube-archive wing
- worker: arena-agent
- status: done
- stage: PR #1 merged to main 56af0c6 (2026-09-11); branch deleted
- scope: NEW DIRS/FILES ONLY: rag/, youtube-archive/, pipeline/corpus_clean/ (sample outputs); READ-FIRST.md (this claim + stage updates). Explicitly NOT touching: streamlit twins, requirements.txt, data/, .github/, engine/, existing pipeline/*, uploads/, Entity_Database/, README.md
- started: 2026-09-10T11:20Z
- updated: 2026-09-11T18:45Z
- notes: additive-only; videos stay out of git per repo rule (YouTube + Releases); PR to main for owner merge, no direct main pushes beyond this claim

### claim: streamlit-freshness-guard — prevent stale cached Ledger HQ previews from appearing current
- worker: arena-agent
- status: done
- stage: replacement PR #4 open from the latest session-branch tip; no CI checks reported; deployment/public revision not verified
- scope: `streamlit_app.py`, `Transparency_Index_App.py` (identical twins), `rwc_views.py`, `engine/publish.py`, generated `public/index.html`, `tests/test_publish_freshness.py`, and this claim/work-log entry in `READ-FIRST.md`. No edits to `data/`, `.github/`, `requirements.txt`, or `README.md` without expanding this claim first.
- started: 2026-10-21T14:58Z
- updated: 2026-10-21T15:14Z
- notes: The committed ledger's latest per-document check is `2026-09-06T14:20:57Z` (45 days old at render). Streamlit builds its preview from the stored ledger in a temporary directory, shows a prominent stale/unknown warning, and recalculates the election metric in America/Denver with an as-of date. Static output gives a machine-readable 48-hour freshness deadline and explicitly says when the window ended; unknown timestamps have no invented deadline. Six deterministic tests (including the Nov. 1 Denver DST repeated hour), compilation, generated-page checks, and twin parity pass. `run.py selftest` is blocked by a pre-existing fixture path `/home/user/civic-engine/data/snapshots/c63daae848d0_gview` absent in this checkout; Streamlit is not installed in this sandbox, so no interactive runtime smoke was run. Commits `23c116e`, `a9308e0`, `8839784`, and `88427df` are pushed. PR #3 was closed because its head ref remained pinned at `23c116e`; replacement PR #4 includes the latest branch tip. No checks, deployment, or public-revision verification.

## Current repo state (updated 2026-09-10T11:05Z)

**What this is:** a civic-transparency console for Cheyenne / Laramie County —
an automated public-records watchdog plus a research archive. One Streamlit
app, two faces, sidebar-switched; deploys on push (Streamlit Community Cloud
auto-redeploys from `main`).

- **Site:** https://therealwindycity.streamlit.app — public. (curl sees a 303
  to `share.streamlit.io` first; that's the normal session handshake, not a
  login wall.)
- **App structure:** ledger face opens on the 🔥 contention reel (17-minute autoplay looping compilation of the nine most contentious spoken moments, chapter-sourced to the full meeting tapes, with a three-column context pane: meeting card, ordinance histories (engine/ordinance_index.py -> pipeline/ordinance_history.json, 153 ordinances / 309 mentions), and clickable timestamped captions; rebuild the reel via pipeline/build_reel.py); a 📼 Recordings & captions view driven by pipeline/media_manifest.json (media backfill cell at tools/colab_media_backfill.py: auto-captions to git, full-meeting audio to GitHub Releases), then the 🧭 Start Here wizard (six adaptive stages, per-topic follow-ups, weighted scoring with match bars, profile archetype, next-step chains, fired-rules audit panel), then six sidebar sections (Overview / Live
  operations / The record / Video vault / Intake / Legacy vault — the legacy
  vault rows stay behind leads-not-facts banners until auto-verified against
  the transcript corpus) + Transparency Index face (entity dossiers).
- **Multipage:** `pages/1_Screening_Room.py` — theater for the 8 produced
  montages (`pipeline/renders/`, captioned), separate from the Video Vault
  section in the app.
- **Engine:** `engine/` (pure stdlib), `run.py`, scheduler runs one
  crawl→extract→digest→publish cycle per Action run and commits ledger
  changes back to `main` as `civic-engine-bot`.
- **Actions (both green):** `civic-cycle` every 6 h at :17 UTC (first green
  run 2026-09-10T08:14Z); `meeting-watch` hourly :37 during Tue/Wed 00:00–
  05:59 UTC meeting windows. Manual "Run workflow" available on both.
- **Data:** `data/engine.db` (FTS5), recovered vault db (`cheyenne_watchdog.db`),
  `pipeline/corpus/` = 17 years of minutes + `extra/` transcripts of the three
  verified-tape meetings; `pipeline/cityvideos.json` = 260 indexed city
  YouTube meetings incl. verified-tape timestamps; `uploads/` ≈ 225 files
  (kept out of the app reader on purpose); RSS at `public/feed.xml`.
- **Invariants:** public documents only; robots.txt honored; legacy data is
  leads-not-facts until verified; PRAs are drafted for a human to send; no
  impersonation; verbatim quotes + source URL + fetch timestamp on alerts.
- **Known deferred:** live Granicus captions (no VTT served), check-register
  verification, Turnstile on the tips form, moving `uploads/` to release
  assets.
- **Owner todo:** rotate the GitHub PAT currently circulating in chats.

## Work log (append when you finish; newest last)

- 2026-09-10 05:04Z — windycity-deploy: v5 mega console + intel_index.json +
  prebuilt artifacts landed via the Colab cell (repo rebuilt after the Sept-7
  flattening).
- 2026-09-10 08:04Z — windycity-deploy: civic-cycle workflow YAML fixed
  (unterminated block scalar; GitHub had been silently rejecting the file).
- 2026-09-10 08:14Z — civic-engine-bot: first green data cycle; engine.db,
  vault verification, and feed.xml refreshed.
- 2026-09-10 08:18Z — windycity-deploy (Screening Room worker): multipage
  theater for the 8 montages + THE_CALLER_TAPE master + tape-meeting
  transcripts into `pipeline/corpus/extra/`.
- 2026-09-10 08:47Z — windycity-deploy (console worker): Video Vault section —
  captioned segments, evidence clips with verified-tape links, 260-meeting
  index.
- 2026-09-10 09:15Z — bartimoussmith-oss: 14-tab strip replaced with sidebar
  sections; README quickstart synced with the real tree.
- 2026-09-10 09:20Z — bartimoussmith-oss: READ-FIRST.md created (this file) +
  pointers added to README and both entry files.
- 2026-09-10 09:55Z — console-worker: Start Here guide shipped — question-driven routing (roles, topics, five booleans) into the existing sections, with because-of copy on every card and search prefills for the minutes archive and canon library.
- 2026-09-10 10:00Z — console-worker: guide v2 shipped — six-stage adaptive wizard with snapshot-backed answers (Streamlit prunes unrendered widget state; caught in harness, fixed with the Next-button snapshot pattern), weighted scoring, profiles, and the fired-rules audit panel.
- 2026-09-10 10:20Z — console-worker: contention reel shipped — CONTENTION_REEL.mp4 (17:25, 25 MB, nine clips, autoplay-mute-loop opener) with chapter links to the source meetings; pipeline/build_reel.py committed so the reel stays rebuildable.
- 2026-09-10 10:45Z — console-worker: context pane shipped under the reel — meeting cards (tape + transcript links), ordinance-history column with per-mention tape jumps, caption lines that link to the exact tape second, and a minute-jumping full-transcript viewer; ordinance index builder committed with its built JSON.
- 2026-09-10 11:05Z — console-worker: media backfill shipped — resumable Colab cell (captions → pipeline/captions/, audio → Releases, optional video) + Recordings & captions view in the Video vault; release-asset upload path live-verified. Video-in-git rejected: 260 meetings ≈ 130 GB vs the 100 MB blob cap.
- 2026-10-21 15:03Z — arena-agent: Streamlit Ledger HQ no longer embeds a frozen `public/index.html`; it renders the stored ledger to a temporary preview, surfaces source-check age/unknown status, and recalculates the Nov. 3 countdown in America/Denver with a visible as-of date. Regenerated `public/index.html` now shows the actual 2026-09-06 check (45 days old) and 13 days until election as of Oct. 21. Five deterministic `unittest` cases, Python compilation, HTML assertions, and twin identity pass. Full `run.py selftest` remains blocked by its stale absolute fixture path; Streamlit is absent from the local sandbox.
- 2026-10-21 15:06Z — arena-agent: committed as `23c116e`, pushed `arena/51771bde-therealwindycity`, and opened [PR #3](https://github.com/therealwindycity/therealwindycity/pull/3). No CI checks are reported; deployment and public-revision verification remain outstanding.
- 2026-10-21 15:12Z — arena-agent: added a machine-readable 48-hour freshness deadline, visible expiration/unknown wording, and a regression test for the Denver Nov. 1 DST repeat (00:30 MDT, 01:30 MDT, 01:30 MST). Six unit tests, compilation, twin parity, and regenerated-page assertions pass. Updating PR #3; its head reference currently lags the pushed branch.
- 2026-10-21 15:13Z — arena-agent: verified PR #3 still points to `23c116e` after commits `a9308e0` and `8839784` were pushed; its PR ref omits the freshness-expiry change. Will replace it with a new PR from the latest branch tip. No checks, deployment, or public-revision verification.
- 2026-10-21 15:14Z — arena-agent: closed stale-head PR #3 and opened replacement PR #4 from the complete session branch, including the explicit freshness deadline and DST tests. No CI checks are reported; deployment and public-revision verification remain outstanding.

- 2026-10-28 20:17Z — arena-calendar-audit: packaged an isolated-fixture
  candidate for TheReelWindyCity PR #26 under
  `cross-repo/TheReelWindyCity-calendar-ci/`. Reproduced CI calendar failures;
  calendar 10/10 and transcript 7/7 pass in a disposable source copy, and
  meeting-input hashes remain unchanged. No target writes or deployment.

- 2026-10-28 20:23Z — arena-calendar-audit: full local target build exposed
  eight SEO audit failures; added `seo-ci.patch` to the repair package. Local
  lint, typecheck, nine pre-build CI suites, static export and SEO audit pass;
  negative SEO checks catch a missing summary and missing required lastmod.
  Dependencies installed with scripts disabled; no Playwright or remote CI.

- 2026-11-20 21:53Z — arena-agent-pipeline-repair: unblocked `engine/scheduler.py`
  (`from . import publish` -> `from engine import publish`, and raise errors in
  `--once` mode so CI cannot silently pass on crash); added portable snapshot
  resolution (`db.resolve_snapshot_path`) used by `engine/extract.py`,
  `engine/detect.py`, and relative storage in `engine/ingest.py` so legacy
  `/home/user/civic-engine/data/snapshots/...` DB rows drain cleanly; isolated
  `run.py selftest` in a temporary directory and added `--body-name` to
  `run.py request comment` (+ fixed `DRAFT` typo in `engine/records.py`); fixed
  Python 3.11 f-string backslash `SyntaxError` in `miller_theater.py`; guarded
  dormant `git add workdesk/data/feed.json` in `.github/workflows/workdesk-poll.yml`
  (exit 128 fix) and fixed step-level `NTFY_TOPIC` check in `civic-cycle.yml`;
  regenerated `public/index.html` and added `tests/test_engine_pipeline.py`.
  Verified locally: 15/15 unittest, `run.py selftest`, `poll.py selftest`,
  82/82 WorkDesk core tests, all active `.py` files compile on Python 3.11,
  twins identical. Remote Actions runs, Streamlit runtime, and GitHub Pages
  enablement (still needed in repo Settings for `workdesk-pages`) not verified.

- 2026-11-21 07:05Z — arena-agent-poe-exhibit: shipped `exhibit/` — additive
  static Point-of-Order Exhibit (no build, no network): 18-row transcript-vs-
  document contradiction matrix (rows 1–6 from owner-supplied matrix, rows 7–18
  from repo-verified records incl. the three video seed cases and the OMA pin-cite
  correction carried in-row), per-occurrence IRAC on every row, interactive
  30-second podium rebuttal with word-paced karaoke teleprompter, dossier palette
  (#EDE7D9/#A62B1C/#24456B). Citation discipline enforced by harness: body+date+
  source+statute on every row, no invented clock timestamps, repo source files
  spot-checked on disk. `node exhibit/tests/core.test.mjs` → 46/46; static smoke
  on :8091 all-200. Scope: `exhibit/**` + this entry only; twins byte-identical
  (md5 match), nothing else touched. Remote Pages enablement not attempted.

- 2026-11-21 10:28Z — arena-agent-poe-exhibit: shipped the full video pipeline
  over all 18 rows (claim `exhibit-video-pipeline`). Chain: `pipeline/tts.js`
  (offline meSpeak @132, prefix-synthesis word timings, engine recycled every
  40 calls — emscripten FS bug "Bad data: en_dict" after ~60 synths; espeak-ng
  wheel and edge-tts abandoned: former too slow/mult-word broken, latter
  network-blocked) → `pipeline/cards.py` (18 statutory cards 1080×960 +
  18 synthesized record frames with honesty label) → `pipeline/build.py`
  (vstack 1080×1920, ASS karaoke burn via `fontsdir` (no fontconfig), gold
  live word #E5A100, sidechaincompress duck on the 2 footage rows, libx264+aac).
  Deliverables: `exhibit/videos/POE-01..18.mp4` (27–38 s, 34.4 MB total) +
  `exhibit/videos/index.html` gallery (posters, per-row download links, no
  external subresources) + `exhibit/cards/` + additive toolbar/footer links in
  `exhibit/index.html`, README rebuild docs. Footage: POE-03 = mar9_cut.mp4,
  POE-09 = apr27_hand.mp4 @+122s (lands on the 02:46:12 POO); remaining 16
  rows carry labeled synthesized frames — no invented clock timestamps.
  Tests: `video-pipeline.test.mjs` 19/19, `core.test.mjs` 46/46, all gallery
  routes 200 on :8091. Scope: NEW PATHS only (`exhibit/pipeline|videos|cards|
  tests|README|index.html|.gitignore` + this entry); `pipeline/**` read-only.

- 2026-11-21 14:45Z — arena-agent-poe-exhibit: upgraded the exhibit pipeline
  so ALL 18 rows render real meeting footage instead of static frames (same
  claim `exhibit-video-pipeline`). Egress recon: youtube/youtu.be/granicus/
  archive.org/objects.githubusercontent all curl 000 (allowlist = github,
  npm, pypi only) → yt-dlp/ffmpeg download route impossible in-sandbox; took
  the wire-to-repo-footage route. Source mining: TheReelWindyCity `video/`
  (25 compilations, 1280×720, burned per-segment date+time captions),
  `videos/gaveled-down-miller-montage` (README maps its 10 segments), local
  `pipeline/videos` canon cuts; every branch of TheReelWindyCity +
  bartimoussmith-oss/therealwindycity + all other org repos scanned for media
  (none beyond these; Releases empty on all three repos). Staged 16 new
  date-verified cuts into `pipeline/videos/` (39 MB): jul13_wolfe,
  sep14_dais, apr13_cox, apr21_finance_a/b, sep14_interrupt, aug10_gb
  (concat of two Aug 10 windows), jun22_clock, jun22_wolfe, sep14_cox_a/b/c,
  aug24_gb, jun8_wolfe, sep14_entered, may26_comment — each offset chosen
  where the source's burned caption reads exactly the provenance label
  (verified by full-res caption-strip extraction; scene-cut maps per clip).
  `build.py` FOOTAGE now maps 18/18 rows; TAPE_NOTES documents the six rows
  whose cited sitting has no recording (POE-02 → Sep 14 docket origin,
  POE-04 → Apr 13 root hearing, POE-05/07 → Finance Apr 21 same body,
  POE-06 → Sep 14 in-range GB, POE-13 → Aug 24 nearest sitting) — burned +
  drawn labels always state the tape's true meeting. Re-rendered 18/18 MP4s
  (38.8 MB) + gallery; tests reworked to assert 18/18 GRANICUS TAPE labels,
  FOOTAGE coverage, no synthesized-frame text → 46/46 + 20/20; QA frames
  verified on :8091 (all 200). Scope: `exhibit/**` + 16 additive
  `pipeline/videos/` cuts + this entry; no existing pipeline file modified.

- 2026-11-21 16:41Z — arena-agent-poe-exhibit: stripped the synthesized VO +
  burned karaoke captions from all 18 exhibit videos and shipped per-row
  source kits (same claim `exhibit-video-pipeline`), per owner directive:
  "Remove the robot voice and the captions … include the proposed narration
  in a file alongside the video file for each" + "include with each video the
  different original source layers independent of one another." `build.py`
  rewritten: filter = card loop + clip (`-ss/-t`, durations still paced from
  work/timings.json) → scale 1080/letterbox pad 960 → drawtext GRANICUS
  TAPE label → vstack → fades; audio = tape only (`volume=0.9`, afade,
  atrim — no adelay/sidechain/amix, no `ass=`); ASS/GOLD/chunk helpers,
  FRAMES/VO paths removed. Per row now also writes `videos/POE-XX.txt`
  (row rebuttal, plain text), copies `POE-XX.card.png` + `POE-XX.footage.mp4`
  (whole staged clip; POE-09's POO moment at +122 s — gallery notes it).
  Gallery: sub "CARD + REAL MEETING TAPE · SOURCE LAYERS INCLUDED", per-row
  Narration/Footage/Card layer download links, lede/footer/meta no longer
  claim karaoke/VO. `cards.py`: retired legacy `render_frame` (the
  SYNTHESIZED RECORD FRAME slate — all rows are footage now), card footer
  `VO Ns` → `READ Ns`, header date/body auto-fit (POE-13's long window title
  pre-existingly overflowed into RECORD AUDIT; fixed). `tts.js` header doc
  updated to timings-only role (logic untouched — pacing must stay stable).
  README + exhibit/index.html copy updated. Tests: dropped ASS/gold checks →
  narration .txt 55–90 words, card layer 1080×960, footage layer ftyp ≥100 KB,
  gallery links all 18 layer files (22 checks; MP4 specs + 18/18 GRANICUS +
  FOOTAGE coverage kept). Rebuilt cards + 18 MP4s (34.4 MB) + 54 kit files +
  gallery; core 46/46 + video-pipeline 22/22; QA frames (POE-04/09/13)
  confirm provenance label + no burned captions; volumedetect mean
  −19.7/−35.1 dB = live tape audio; static smoke :8095 gallery/txt/card/
  footage → 200. Scope: `exhibit/**` only; branch commit updates PR #7.
