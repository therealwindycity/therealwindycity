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

## Tests

```bash
node exhibit/tests/core.test.mjs
```

46 checks: matrix shape, citation discipline, IRAC coverage, rebuttal timing,
filtering, provenance, offline-safety (no external subresources), palette lock,
and controller boot in a vm + DOM stub.

## Notes

- Additive-only path: nothing outside `exhibit/` is touched by this app.
- Rows are data, not markup — add a row by appending to `rows` in `data/matrix.js`;
  `validate()` will fail the build if fields, sources, or rebuttal length are off.
