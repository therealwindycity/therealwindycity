# Handoff instructions — produce the new video suite

**Use this file as the task brief for the next agent.** The current project index is [`README.md`](README.md); the numbered deliverables table there is the canonical scope. Produce one new, separately sourced video for each of items 1–17. Do not treat the nine older MP4s in `existing-video-delivery.zip` as the new suite.

## Objective

Turn the already-prepared transcripts, candidate ledgers, cut sheets, and legal/records matrix into **17 separate, source-footage-based MP4s**, with source/caption sidecars, edit-decision lists, and QA notes. Work in small batches (one or two videos at a time) to limit timeout risk and preserve progress.

## First: acquire and verify public recordings

1. Read `cheyenne-2026-transcripts/meetings.json` and the relevant transcript headers for official YouTube IDs, meeting dates/bodies, and source links. Candidate JSONL records contain exact source timestamps and links.
2. The Phase 1 manifest `phase-01-position-timelines/clip_manifest.json` identifies nine review windows for the Lawrence J. Wolfe and Pete Laybourn timelines. Use it as a cut plan, not as proof that the captions or identities are correct.
3. Retrieve public recordings from their official City/YouTube/Granicus links. The current sandbox's attempt to fetch a public YouTube watch page and the Granicus host ended in TLS EOF before downloading media. If this next environment has egress, retry with public links. Do not rely on personal browser-cookie files or place credentials/cookies in project outputs. If video-host access is unavailable, stop and report the exact missing URLs rather than fabricating clips.
4. Preserve original source files, source URLs, retrieval date, file hashes, and source timestamps. Keep downloaded source media out of Git unless specifically requested; use workspace storage conventions and link the provenance manifest.
5. Before selecting any quote, watch/listen to the actual recording at the cue and review enough lead/lag to understand the complete exchange. Confirm the words, speaker, agenda item, role, and speaker identity. Correct caption errors in a separate logged transcript layer; never silently rewrite captions and present them as source audio.

## New-video list

Create one separate MP4 for each corresponding row in the `Requested deliverables — coverage and next action` table in `README.md`:

1. Lawrence J. Wolfe position timeline.
2. Pete Laybourn position timeline.
3. Requests that Miller attend in person / criticism of Zoom participation.
4. Cheyenne LEADS multiple-comment opportunities versus public-comment cap.
5. Developer/applicant comment opportunities versus public comment.
6. Off-topic/over-three-minute comments, compared only with a defensible speaker/item/rule denominator.
7. Administration members disagreeing among themselves.
8. Administration disagreement with the public or staff.
9. Non-Miller public comments criticizing administration conduct or legality.
10. Cox Ranch annexation/zoning/PlanCheyenne legal-record issue overview.
11. Jennifer/staff introductions of Miller and mayor/chair greetings.
12. Miller interruptions.
13. Responses, mentions, and questions about Miller.
14. Equal enforcement of time limits.
15. Out-of-order rulings against Miller compared with other speakers, verifying the named comparator.
16. Interruptions that consumed Miller’s time without time credit.
17. Favorable/supportive reactions toward Miller.

Use descriptive filenames such as `01_wolfe_positions.mp4` through `17_supportive_reactions.mp4`; keep these distinct from the legacy renders. If a requested comparison cannot be made fairly from the accessible footage/rules, deliver a clearly labeled “not established” research video or a sourced explanation—not a forced conclusion.

## Existing work to use, not duplicate

- Project-wide audit, definitions, prior assets, safeguards, and the complete 17-row scope: [`README.md`](README.md).
- Phase 1 cut plans: [`phase-01-position-timelines/storyboards.md`](phase-01-position-timelines/storyboards.md) and [`phase-01-position-timelines/clip_manifest.json`](phase-01-position-timelines/clip_manifest.json).
- Phase 2 source-linked candidates: [`phase-02-record-interactions/summary.md`](phase-02-record-interactions/summary.md), [`candidate_events.jsonl`](phase-02-record-interactions/candidate_events.jsonl), and [`targeted_review_queue.md`](phase-02-record-interactions/targeted_review_queue.md). It covers 84 transcript-bearing meetings; the 2,250 cue records include adjacent context-only cues. The 1,968 overlap with the legacy 616-row index is date-only, not event-level deduplication. No Phase 2 event is yet footage-verified.
- Phase 3 public-comment comparators: [`phase-03-public-comment-comparators/README.md`](phase-03-public-comment-comparators/README.md), [`summary.md`](phase-03-public-comment-comparators/summary.md), and [`candidate_events.jsonl`](phase-03-public-comment-comparators/candidate_events.jsonl). Its captions-only proximity window and limitations are documented there; retain the stated **300-second proximity caveat** and do not count scanner cues as speakers, comment slots, or events.
- Phase 4 institutional disagreement/support: [`phase-04-institutional-disagreement/summary.md`](phase-04-institutional-disagreement/summary.md), [`candidate_events.jsonl`](phase-04-institutional-disagreement/candidate_events.jsonl), [`candidate_screening_notes.md`](phase-04-institutional-disagreement/candidate_screening_notes.md), and [`targeted_review_queue.md`](phase-04-institutional-disagreement/targeted_review_queue.md). Current scan: 91 cues, with 33 explicit-disagreement pattern hits, 58 possible correction/contradiction hits, and 1 possible-support hit; categories can overlap. These are candidates, not verified events. Known residual false-positive examples are documented in the screening notes.
- Phase 5 legal/records issue spotting: [`phase-05-cox-ranch-issues/issue_matrix.md`](phase-05-cox-ranch-issues/issue_matrix.md), [`source_register.md`](phase-05-cox-ranch-issues/source_register.md), and [`record_requests.md`](phase-05-cox-ranch-issues/record_requests.md). It is not a legal opinion. City packet drafts are unsigned; the September 28 vote/final instruments/maps/notice proofs were not verified. Do not call draft acreage final, or characterize an action as illegal.
- Legacy project renders are bundled in [`existing-video-delivery.zip`](existing-video-delivery.zip); provenance and limits are in [`available-existing-videos/README.md`](available-existing-videos/README.md). Do not rebuild these unless the new video has a clearly different scope.

## Required editorial and evidentiary rules

- Use official-name spellings **Lawrence J. Wolfe** and **Pete Laybourn** in graphics only after confirming identity from the recording and/or reliable contemporaneous records. Caption spelling alone is not enough.
- Keep unlike agenda items separate. In particular, do not conflate the June 22 Swan Ranch/Industrial Siting Act exchange, the July 6 Microsoft item, the August 28 Cox Ranch work session, and the September Cox Ranch Council readings. A no vote or a negotiation proposal does not prove adoption of Miller's legal position.
- Preserve complete turns, questions/prompts, chair rulings, responses, relevant roll call/outcome, and enough context before and after each cut. Avoid juxtaposing separate dates/items as one conversation. Put source date, body, item, original URL, and source in/out time on-screen or in an accompanying end slate/description.
- Never infer identity, motive, truth, legality, viewpoint discrimination, support, or who answered whom from transcript proximity alone. An automated phrase match is a review lead only.
- For timing claims, inspect the actual visible timer and the chair's ruling; log time actually consumed, stops/resets, interruptions, technical delay, and any restored time. Captions cannot establish timer credit.
- For public-comment comparisons, distinguish a public-comment slot from applicant presentation, staff response, council questioning, work-session comment, and other participation. Record the written rule in force and establish the denominator before comparing speakers/viewpoints.
- For Phase 5, show source status and contrary authority. Keep each acreage/contiguity figure attached to its document; distinguish staff analysis, draft ordinance, secondary reporting, signed instrument, and recorded map. Include the relevant Wyoming cases/statutes with pin cites and effective dates, and get counsel review before a legal conclusion.
- The City archive showed no linked minutes for September 28 at the October 2, 2026 check; the reported 8–2 outcome is secondary until confirmed by certified minutes/journal, signed action, publication, and final map. The September 28 Granicus recording exists but has not been reviewed.

## Render and delivery requirements

For each finished video, deliver:

1. A standalone H.264/AAC MP4 (or source-compatible codec), with no upscaling and clear audio.
2. An SRT and/or VTT sidecar. Correct caption errors only against audio; keep a separate change log.
3. An edit-decision list: source URL, source file hash, source in/out, clip order, trim/fade/overlay, caption correction, and any gap/card.
4. A short source/provenance README identifying reviewed recordings, retrieval date, review date, known gaps, and whether every quote/identity was verified.
5. A QA record confirming the file opens, full start/end plays, no black/frozen/audio gaps at cuts, caption timing, spelling/names, citations, and no omitted response that changes meaning. Calculate a SHA-256 for each final file.

Keep project/source files and large downloaded assets outside Git unless asked otherwise. No video may be labeled “final,” “complete,” or “verified” until those checks are actually done. If time or access limits prevent all 17, work in numbered batches, deliver completed videos and their evidence logs, and mark the remaining rows blocked; do not replace missing footage with transcript-card videos unless the user explicitly approves that format.
