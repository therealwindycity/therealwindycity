# Phase 2 — record-interaction search candidates

**Status:** The corpus scan is complete as an automated transcript search. None of the candidate events has been verified against footage. This is an indexing/review aid, not a fact-finding report or legal conclusion.

## Files

- [`summary.md`](summary.md) — scan coverage, category counts, meeting-level queue, legacy-index overlap, and exclusions.
- [`candidate_events.jsonl`](candidate_events.jsonl) — one JSON object per candidate timestamp cue. Each record includes the official-video link with a start time, catalog date/body, transcript path and source line, cue text, up to two neighboring cues on each side, search categories, and review cautions.
- [`targeted_review_queue.md`](targeted_review_queue.md) — focused, timestamp-linked shortlist for physical-attendance and greeting/recognition candidates.
- [`../scan_interactions.py`](../scan_interactions.py) — deterministic, standard-library scanner used to generate the ledger and summary.

Rerun from the repository root with:

```sh
python3 video-production/scan_interactions.py
```

## Coverage and overlap

The catalog has 85 meeting entries. The scanner processed the 84 entries with a transcript file. One Board of Adjustment meeting (June 18, 2026) is listed by the catalog as having no YouTube captions, so it could not be searched; its official video and catalog note are listed in `summary.md`.

The previous `main`-branch Miller index was audited as 616 caption-aligned records on 20 recording dates through July 27, 2026. The prior JSON index is not present in this checkout, so this pass marks **date overlap only**. Of 2,250 candidate cue records, 1,968 fall on those 20 dates. This is not an event-level duplicate check and does not mean all those cues occur in an existing video.

## Reading the categories

- `explicit_miller_reference`: the cue text contains “Charles Miller,” “Mr. Miller,” or “Miller” (with Miller Lane excluded as a place-name).
- `interaction_context_near_explicit_reference`: the cue falls within two timestamp cues of an explicit name reference. It may preserve an answer, question, interruption, or transition, but is **not** automatically a response to Miller.
- `possible_staff_recognition`, `possible_floor_recognition`, `possible_greeting_phrase_near_miller`, and `possible_self_introduction_or_record_identification`: recall-oriented text patterns for possible Jennifer/staff recognition, floor-granting, greeting phrases, and Miller's own identification. A greeting phrase near Miller may be his own words; the scanner does not infer the speaker or who was greeting whom.
- `possible_direct_in_person_request_or_preference`: a narrower phrase pattern tied to a nearby explicit Miller reference or a close caption-split lead-in. It is not a finding that a particular official demanded in-person attendance or that Zoom participation was prohibited.
- `remote_attendance_procedure_or_reference_near_miller` and `in_person_procedure_near_miller`: broad procedure/format language near a reference. Generic roll-call or room/online transitions can appear here.
- `possible_time_limit_or_interruption_near_miller`, `possible_out_of_order_or_relevance_ruling_near_miller`, `possible_timer_adjustment_near_miller`, and `possible_reply_or_correction_near_miller`: nearby-keyword candidates. A cue can concern someone else or be a caption error; check the text and surrounding cues, then the recording.
- `possible_remote_attendance_objection`: a stricter text-pattern candidate. Its small count is not evidence that no other relevant exchange occurred; the search may miss paraphrases and caption errors.

## Required verification

Before using an item in a video, exhibit, chronology, or legal argument:

1. Open the linked official recording and verify the words, speaker, agenda item, and beginning/end time; do not infer identity or speaker from captions alone.
2. Preserve the full surrounding exchange and log caption corrections separately from the source transcript.
3. Distinguish an interruption, ruling, time-limit call, and technical issue. For time-loss or credit claims, inspect the visible timer/clock and measure the actual start, stop, and restart on video. Captions alone cannot establish timer accounting.
4. Keep machine-found, footage-verified, and legally assessed statuses separate. No legality, motive, or timer-credit conclusion is made by this scan.
