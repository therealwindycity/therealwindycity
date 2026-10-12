# Phase 4 — institutional disagreement/support cues

**Status:** corpus-wide transcript-pattern search complete; no candidate has been checked against its recording. This is an index for later review, not an institutional-conduct finding, a balanced tally, or a legal conclusion.

## Files

- [`summary.md`](summary.md) — coverage, pattern-hit totals, meeting/date queue, and the transcript-unavailable entry.
- [`candidate_events.jsonl`](candidate_events.jsonl) — source-linked caption candidates with timestamp, transcript line, exact cue, two cues of context on each side, and review cautions.
- [`targeted_review_queue.md`](targeted_review_queue.md) — human-readable timestamp/source queue.
- [`candidate_screening_notes.md`](candidate_screening_notes.md) — text-only post-scan screening, examples of residual noise, and the remaining audiovisual-review requirements.
- [`../scan_institutional_disagreement.py`](../scan_institutional_disagreement.py) — deterministic standard-library scanner.
- [`../test_scan_institutional_disagreement.py`](../test_scan_institutional_disagreement.py) — regression checks for negated disagreement, Miller Lane/other surname handling, narrow support cues, and timestamp parsing.

## Current run (2026-10-02)

- Catalog entries: **85**; transcript-bearing entries scanned: **84**.
- Candidate cue records: **91** across **30** meetings/bodies.
- Pattern-hit records: **33** narrow explicit-disagreement cues; **58** correction/contradiction cues; **1** response-shaped, possible-support cue near a Charles/Mr. Miller reference. Category counts can overlap and are not event counts.
- Scan errors: **0**. One catalog entry, the June 18 Board of Adjustment, has no transcript/caption text available to this scan.
- Local transcript coverage ends September 22; the September 28 City Council meeting has no local transcript in this corpus.

Reproduce from the repository root:

```sh
python -B video-production/scan_institutional_disagreement.py
python -B -m unittest discover -s video-production -p 'test_scan_institutional_disagreement.py' -v
```

## Interpretation and review

- `explicit_disagreement_language` is limited to explicit first-person or targeted disagreement phrases. Negated/disclaimed constructions such as “I don't disagree,” “I haven't seen anything I disagreed with,” and “not here to say or to disagree” are excluded. A match can still be routine, hypothetical, unrelated to City administration, or directed at a different speaker.
- `possible_factual_correction_or_contradiction` uses a narrow list of correction/error phrases; confirmation questions and conditional/hedged uses are filtered. Residual self-corrections, pronunciation checks, policy/value judgments, and unrelated factual matters can still match. See [`candidate_screening_notes.md`](candidate_screening_notes.md). It does not identify the disputed assertion or whether a correction is right.
- `possible_supportive_reaction_near_miller_reference` requires named endorsement or a response-shaped phrase tied to an adjacent explicit Charles/Mr. Miller cue. Standalone “exactly,” “correct,” or “I agree” does not qualify; cues about being “out of order” or similar negative language suppress a support candidate. Even a retained cue may refer to another point, may contain caption-merged speakers, or may be part of Miller's own caption segment. Review audio/video before classifying it.
- The scanner does not infer speakers, elected/employee/public status, who was answering whom, the subject of a disagreement, viewpoint, motive, accuracy, or legal effect. “Administration disagreement” is therefore a human classification to be made only after roles and the complete exchange are verified.
- Phase 4 may intersect with Phase 2 at a timestamp because the phases index different kinds of language. Do not add cue totals across packages or call overlaps distinct events.

**Video review remains outstanding.** Open each linked source recording and verify identity, exact words, preceding prompt, response, agenda item, and enough lead/lag to preserve context. Captions are search aids only. The package does not claim any clip has been viewed, authenticated, or rendered.
