# Point-of-Order Exhibit (POE)

Volume II of the viral-exhibit dossier: an interactive static app holding the
**2026 Cheyenne Transcript-vs-Document Contradiction Matrix** — 18 rows, each with a
per-occurrence **IRAC** analysis and an interactive **30-second podium rebuttal**.

Same dossier skin as `build_viral_exhibits.py` exhibit cards: bone paper `#EDE7D9`,
oxblood stamp `#A62B1C`, pencil blue `#24456B`, carbon ink `#181614`.

## Run it

No build step, no dependencies, no network:

```bash
# either open the file directly…
open index.html            # (or double-click)

# …or serve the folder
python3 -m http.server 8080 --directory exhibit
```

## What's inside

| Path | Purpose |
|---|---|
| `index.html` | Page shell: masthead, sticky search/tag controls, matrix/cards stage, rebuttal dialog |
| `data/matrix.js` | The 18 rows + IRAC + rebuttal scripts + integrity helpers (`validate`, `filterRows`, `rebuttalTimeline`) |
| `assets/exhibit.css` | Dossier aesthetic (palette locked to the video pipeline) |
| `assets/exhibit.js` | UI controller: search, tag chips, matrix ⇄ cards, IRAC expand, 30 s karaoke teleprompter |
| `tests/core.test.mjs` | Dependency-free Node harness (46 checks) |
| `videos/` | **18 vertical MP4s (1080×1920) + `index.html` gallery + per-row source kit** (narration `.txt`, `.card.png`, `.footage.mp4`) |
| `cards/` | The 18 statutory exhibit cards (1080×960 PNG) composited into every video |
| `pipeline/` | Rebuild chain: word timings (`tts.js`), card renderer (`cards.py`), ffmpeg compositor + gallery (`build.py`) |
| `tests/video-pipeline.test.mjs` | Dependency-free Node harness for the video deliverables (22 checks) |

## The matrix

- **Rows 1–6** come from the owner-supplied contradiction matrix (Microsoft/Ord. 4687
  ownership, Bally's dual-site licensing, WY Fresh annexation sequence, UDC §§ 5.7.1/5.7.14
  vesting gap, Contract 7782 Mod. 2, police sole-source waivers).
- **Rows 7–18** are reconstructed from this repo's verified records: the three video
  pipeline seed cases (Pumphouse, exec-session vote, out-of-order ruling), the Highlands
  PC-overrule sequence, Orchard Hills, the Bloom statute confession, "color of the map,"
  Skybox unwritten commitment, CheyenneNext sequencing, the "19 agencies" record rebuttal,
  and the May 26 comment restriction.

**Citation discipline** (enforced by the harness):

- every row cites meeting **body + date + speaker/document + statute**;
- no invented verbatim video timestamps — the harness rejects `\d{1,2}:\d{2}:\d{2}`
  patterns in claim/record fields;
- where the repo's legal audit corrected a pin-cite (OMA mapping, row 8), the correction
  is carried **in the row itself**;
- every row lists repo source files, spot-checked to exist on disk.

## The 30-second rebuttal

Click **▶ Run 30s rebuttal** on any row (or `#POE-08` deep-link → open row → run):

- teleprompter paces one word per tick across exactly 30 s (`rebuttalTimeline`);
- current word highlights gold; statute/dollar tokens render red;
- Space = start/pause, Esc = close, Restart/Reset controls;
- scripts live in a machine-validated **55–90 word** band (deliberate podium pace).

## Video gallery (`videos/`)

All 18 rows also ship as **1080×1920 MP4s** with a downloadable gallery at
`videos/index.html` (also linked from the app's toolbar and footer):

- **top half** = the 1080×960 statutory exhibit card (dollar figures oxblood,
  statutes pencil blue);
- **bottom half** = verified Granicus/YouTube meeting footage for **all 18
  rows**, playing with the **tape's own audio** — no synthesized voice, no
  burned-in captions. Each cut is date-verified against the burned-in caption
  of the staged clip and provenance-labeled on screen
  (`GRANICUS TAPE · <body> · <date>`). Where a row's own sitting was never
  recorded in this corpus, the tape is the closest verified sitting in the
  row's source chain and the gallery says so (e.g. `POE-05`/`POE-07` show the
  Finance Committee's Apr 21 sitting, `POE-13` shows the Aug 24 GB — the
  nearest tape to its Aug 21 work session);
- **per-row source kit beside every video** — independent, re-cuttable layers
  for each row, linked from the gallery:
  - `POE-XX.txt` — the proposed narration (the row's 55–90 word podium
    rebuttal) as plain text;
  - `POE-XX.card.png` — the 1080×960 card layer on its own;
  - `POE-XX.footage.mp4` — the raw footage layer on its own (the whole staged
    Granicus cut; `POE-09`'s POO moment sits at +122 s inside that file);
- no invented verbatim clock timestamps anywhere — same citation discipline
  as the matrix.

### Rebuilding the videos

```bash
# 0. one-time: node deps for word-timing synthesis (mespeak, in package.json)
cd exhibit/pipeline && npm install && cd ../..

# 1. word timings (pacing + durations)  (work/timings.json)
node exhibit/pipeline/tts.js

# 2. statutory cards                 (cards/*.png)
.venv/bin/python exhibit/pipeline/cards.py

# 3. composite 18 MP4s + source kit + gallery
#    (videos/*.mp4, videos/POE-XX.{txt,card.png,footage.mp4}, videos/index.html)
.venv/bin/python exhibit/pipeline/build.py
```

ffmpeg comes from `imageio-ffmpeg` (bundled binary); fonts are system DejaVu
via `fontsdir` (no fontconfig needed). `pipeline/work/` is git-ignored.

## Tests

```bash
node exhibit/tests/core.test.mjs
node exhibit/tests/video-pipeline.test.mjs
```

46 + 22 checks: matrix shape, citation discipline, IRAC coverage, rebuttal
timing, filtering, provenance, offline-safety (no external subresources),
palette lock, controller boot in a vm + DOM stub — plus MP4 specs
(1080×1920 / 15–60 s / tape audio), card sizes, per-row narration text +
card/footage source layers, gallery completeness and layer links, and the
honesty/provenance labels.

## Notes

- Additive-only path: nothing outside `exhibit/` is touched by this app.
- Rows are data, not markup — add a row by appending to `rows` in `data/matrix.js`;
  `validate()` will fail the build if fields, sources, or rebuttal length are off.
