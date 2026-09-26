# Transcript stitching + cleanup toolchain (vendored)

This directory contains the **video-transcript stitching and cleanup toolchain**
ported from the civic-transparency project:

**Upstream:** `bartimoussmith-oss/therealwindycity` — `rag/` directory
(`text_extract.py`, `clean_transcripts.py`, `build_glossary.py`,
`glossary.json`, `glossary_manual.json`).

Vendored 2026-09-26. The upstream repo carries no LICENSE file; these files
are reproduced here with attribution for the same non-commercial civic
transparency purpose. If upstream adds a license, mirror its terms here.

## What it does

1. **Stitch** — `parse_rolling_transcript()` collapses rolling-caption windows
   into deduplicated, timestamped segments (longest-overlap word stitching,
   sentence segmentation, ~45s/~700-char grouping).
2. **Correct** — literal confusion pairs + regexes first, then fuzzy glossary
   matching (people / places / ordinances / resolutions / terms) with per-change
   logging and context snippets. Single-token terms require ≥0.92 similarity so
   bare surnames can't eat common words.
3. **Re-split** — corrected text is re-aligned onto the original timestamps
   proportionally, snapped to word starts.

## Files

| File | Origin | Notes |
|---|---|---|
| `text_extract.py` | upstream verbatim | shared parsing / stitching primitives |
| `clean_transcripts.py` | upstream verbatim | reference: their end-to-end cleaner (wired to their `pipeline/corpus` layout; not run directly here) |
| `build_glossary.py` | upstream verbatim | reference: rebuilds the glossary from minutes + docs |
| `glossary.json` | upstream verbatim | canonical spellings (people, places, terms, ordinances, resolutions, confusions) |
| `glossary_manual.json` | upstream verbatim | curated overrides — **edit this file to add fixes** |

## How we use it

`scripts/stitch_transcripts.py` (our adapter) runs the stitcher + corrector over
this archive's per-body `*.md` files (as listed in `meetings.json`) and writes
reviewed sidecars:

- `<meeting>.clean.md` — same format as the original, corrections applied
- `<meeting>.changes.json` — every change with kind/before/after/score/context
- `stitch_report.md` — run summary table

```bash
# dry run over everything (counts only, no writes)
python3 scripts/stitch_transcripts.py --check

# clean two meetings
python3 scripts/stitch_transcripts.py --only 2026-08-03-public-services 2026-07-13-city-council

# clean everything missing sidecars (skips files that already have them)
python3 scripts/stitch_transcripts.py

# redo everything
python3 scripts/stitch_transcripts.py --force
```

Review the `.changes.json` sidecars before treating any `.clean.md` as
authoritative — fuzzy correction is conservative, but human review is the point
of the logged context.
