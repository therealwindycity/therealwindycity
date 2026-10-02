# Video evidence project — work plan and prior-work audit

**Status (2026-10-02):** Phase 0 audit complete. Phase 1 is a source-linked planning/cut-sheet package, not rendered new MP4s. Phases 2–4 are corpus-wide transcript candidate searches, not footage-verified events. Phase 5 is a source-linked preliminary legal/records matrix and checklist—not a legal opinion or verified final-action record. Nine pre-existing renders are packaged in [`existing-video-delivery.zip`](existing-video-delivery.zip); provenance and checksums are in [`available-existing-videos/README.md`](available-existing-videos/README.md). Three related-repository rendered cuts analogous to requested rows 1, 3, and 4 were also located, but they are external, selected edits without local source masters, separate captions, EDLs, or complete QA; see [`phase-06-external-render-inventory.md`](phase-06-external-render-inventory.md). None is accepted as a completed deliverable in the requested new suite. No local meeting source recordings are present; the temporary downloader/FFmpeg tools could not reach the public YouTube or Granicus hosts from this sandbox. No Phase 2–4 cue has been footage-verified; the searches do not characterize motive, establish a legal violation, or determine timer credit. Official September 28 final action, signed instruments, final maps, and publication/recording proof remain to be obtained.

## Scope boundary

The working tree for this session is a 2026 transcript archive. Its catalog has **85 meetings**, dated in 2026, with the latest entry September 22; the City Council transcripts currently end September 14. It contains official-video links and timestamped captions, including auto-generated captions, but no local source-meeting recordings. A temporary `yt-dlp`/FFmpeg toolset was tried, but sandbox TLS connections to public YouTube and Granicus hosts close before any recording is downloaded. Nine pre-existing render MP4s have been bundled in [`existing-video-delivery.zip`](existing-video-delivery.zip) from an audited prior Git commit; two are Miller-related selected legacy edits. The new clip manifests remain reviewable edit plans, not finished evidentiary exhibits, so this pass cannot claim to have rendered or verified the requested complete videos.

The audit read the repository's `main` ref at `b6e707a249912a0d076d4e28714bdbc913e6766d` **read-only** to avoid repeating work. No source code or manifests from that ref were merged; all nine prior rendered MP4s were copied unchanged into `existing-video-delivery.zip` so they can be downloaded together from this branch.

## What already exists (do not remake)

| Existing asset on the audited `main` ref | Existing scope | Limit that matters to this request |
|---|---|---|
| `pipeline/renders/THE_CALLER_TAPE.mp4` + `pipeline/montage_caller_tape.py` | 13:51 tape montage using selected March 9 and April 27 footage: a March 9 mic interruption, several April 27 moments, and selected points of order / time calls. | A selected montage, **not** every Miller interruption or every later meeting. Not a matched treatment/time-limit study. |
| `pipeline/renders/THE_CALLER.mp4` + `pipeline/montage_miller.py` | 1:59 card-led account of selected Miller incidents and later references. | Mostly cards; it is not a complete real-footage timeline. Some lines rely on supplied transcript material. |
| `pipeline/miller_interventions.json` + Miller Tapes page/index | 616 caption-aligned records across 20 meeting recordings dated Jan 12–Jul 27, 2026. The current index has 219 `interrupted`, 38 `mic_cut`, 90 `point_of_order`, and 119 `time_called` flags. | Caption-alignment/classification data are leads, not a manually adjudicated, complete count. It ends July 27, does not cover every committee, and is not an audit of how long a timer actually ran or whether time was restored. |
| `pipeline/videos/` | Nine selected source clips, principally March 9 and April 27, plus two other topic clips. | Selected moments only; no exhaustive source reel. |
| `pipeline/renders/CONTENTION_REEL.mp4`, `S1_48_HOURS.mp4`, `S2_THE_74M_LIST.mp4`, `S3_THE_TWO_TIES.mp4`, `S4_THE_214.mp4`, `S5_ONE_NIGHT_IN_APRIL.mp4`, `THE_RECORD_SPEAKS_VOICES.mp4` | Existing civic montages. The voice montage is described by the app as Nemecek and Moody. | None is a dedicated, exhaustive Wolfe/Laybourn position timeline, public-comment parity audit, Cox Ranch legal matrix, or Miller-introduction/support-reaction catalogue. |
| `2026-09-14-council/COX_HISTORY_COMPARISON.md` and `redteam-2026-08-27-cox-corpus.md` | Cox/data-center docket comparison and a red-team review of several proposed claims. The red-team itself flags weak or unverified claims and corrects overstatements. | Useful prior work, but not a complete primary-law/case-law issue matrix, and not proof that any ordinance violated law. Recheck source documents and current law before any legal overlay. |

The audited ref contains nine existing rendered files under `pipeline/renders/` and nine selected clips under `pipeline/videos/`. This branch exposes the nine pre-existing renders unchanged in [`available-existing-videos/`](available-existing-videos/); the new research packages remain separate and have not been incorporated into them.

## Requested deliverables — coverage and next action

“Not located” means no dedicated, complete deliverable was found in the audited video/index inventory; it does not prove that no related sentence or partial clip exists anywhere in the archive.

| # | Requested video | Prior-work status | Planned work |
|---:|---|---|---|
| 1 | Lawrence J. Wolfe: statements about Miller, delegated state authority, and later local negotiating choices | No dedicated timeline located. | Phase 1 candidate storyboard in `phase-01-position-timelines/`; separate statements by subject and date. |
| 2 | Pete Laybourn: early criticism of Miller and later statements/actions | No dedicated timeline located. | Phase 1 candidate storyboard in `phase-01-position-timelines/`; keep unlike agenda items clearly labeled. |
| 3 | Every request/demand that Miller attend in person or criticism of Zoom participation | No complete prior ledger located. | Phase 2 added 11 targeted in-person wording candidates plus nearby remote/in-person procedure cues. See `phase-02-record-interactions/summary.md`; all are unverified caption-search leads requiring video/rule review. |
| 4 | Cheyenne LEADS multiple public-comment slots on one item versus a one-comment public cap | No dedicated comparison located. | Phase 3 found three number/opportunity phrase cues in a 2026 panel whose exact date is not cataloged, plus LEADS references elsewhere. These do not establish that anyone received multiple comment slots; verify the proceeding, speaker, item, and rule. |
| 5 | Developers/private applicants receiving multiple public-comment slots | No dedicated comparison located. | Phase 3 returns 27 possible applicant/developer-affiliation cues near public-comment gate cues. They are leads only; separate applicant presentations, staff responses, council questions, and actual public-comment periods by footage, agenda, and written rule. |
| 6 | Off-topic or over-three-minute comments, compared by speaker and viewpoint | No complete matched comparison located. | Phase 3 returns 32 time-limit/call and 31 topic/relevance keyword cues outside three cues of an explicit Miller reference. They are not verified calls/rulings or speaker-level comparisons; build a denominator and compare actual timing/rules without inferring motive. |
| 7 | Administration members disagreeing among themselves | No footage-verified full-reel/index located. | Phase 4 now indexes 33 explicit-disagreement caption cues corpus-wide; verify roles, target, exact exchange, and whether it is disagreement rather than routine clarification. |
| 8 | Administration disagreement with the public or other staff | Partial moments may occur in existing montages; no footage-verified complete index located. | Phase 4 indexes explicit disagreement/correction wording but does not infer roles or targets. Human review must preserve the response and statement answered. |
| 9 | Non-Miller public comments criticizing administration conduct or legality | No dedicated complete reel located. | Phase 3 returns 102 criticism/legal-language cues near comment-gate cues and outside three cues of an explicit Miller reference. Verify that each is a public comment, identify its target and response, and assess legal claims separately. |
| 10 | Cox Ranch annexation, ordinances, zoning and plan changes juxtaposed with law/cases | Partial historical comparison/red-team exists. | Phase 5 now has a source-linked issue matrix, source register, and records checklist. It distinguishes draft packet material from final action and flags acreage, notice, petition, contiguity, zoning, plan-map, industrial-siting, and records gaps. It is not a legal opinion; no “illegal” label or final vote claim is made. |
| 11 | All Miller introductions by Jennifer and greetings by mayor/chair | No exhaustive prior catalogue located. | Phase 2 search adds 20 possible Jennifer/staff recognition cues, 9 greeting-phrase cues near Miller, and floor-recognition leads. Captions do not establish who is speaking or who is greeting whom; verify each against footage. |
| 12 | Every interruption Miller faced | Partial: selected tape montage and 616 caption-aligned entries. | Phase 2 extends transcript search across 84 caption-bearing meetings and adds 125 nearby time-limit/interruption keyword cues. These are not confirmed interruptions; distinguish overlapping speech, rulings, timer events, and caption artifacts on video. |
| 13 | Every response, mention, or question about Miller | Partial: the legacy index is centered on Miller's turns, not every response about him. | Phase 2 records 594 explicit-name caption cues, two-cue context on either side, and 97 possible reply/correction keyword cues. The context cues are not automatically responses; verify them on video. |
| 14 | Equal enforcement of time limits | No matched, complete proof package located. | Phase 2 supplies keyword leads only. No matched comparison or actual start/stop/extension audit has been performed; compare the written rule and visible timers across similarly situated speakers. |
| 15 | Out-of-order rulings against Miller compared with other speakers (including the named comparator to be verified) | Partial Miller point-of-order records; no comparator study located. | Phase 2 adds 46 nearby out-of-order/relevance keyword cues, not verified rulings. Comparator identity, meeting/item, governing rule, actual ruling, and context remain to be established. |
| 16 | Interruptions that consumed Miller's time and were not credited back | Partial selected clips/flags; no complete timer accounting located. | Phase 2 has nearby interruption/time-limit candidates, but no timer stop/restart/credit or lost-time finding. Measure the visible clock on source footage; do not infer credit from captions. |
| 17 | Favorable reactions/support for Miller | No dedicated, exhaustive, footage-verified reel located. | Phase 4 found one narrow response-shaped caption cue near an explicit Miller-name cue. It is a review lead only; collect exact words, speaker, antecedent, and context from the recording. Do not treat silence as support. |

## Work split

1. **Phase 0 — inventory and safeguards (this file):** map prior work and set evidence standards.
2. **Phase 1 — Wolfe/Laybourn position timelines (this turn):** candidate footage windows, date/item labels, and a narrow statutory research note. The cut sheets do **not** claim a judicial “vindication.”
3. **Phase 2 — Miller record interactions (candidate scan complete):** source-linked corpus-wide caption search and date-only legacy-index overlap are in `phase-02-record-interactions/`. Original-video review is still outstanding; the scan does not establish speakers, interruptions, rulings, legal claims, or timer credit.
4. **Phase 3 — public-comment comparators (candidate scan complete):** source-linked cues for LEADS/applicant affiliations, public-comment gates, possible caps/opportunity statements, time/topic phrases, and criticism keywords are in `phase-03-public-comment-comparators/`. Footage, agenda, speaker/slot status, written-rule review, and any matched parity analysis remain outstanding.
5. **Phase 4 — institutional disagreement/support (transcript search complete):** 91 timestamped candidate cues from 84 transcript-bearing catalog entries; 33 explicit-disagreement, 58 correction/contradiction, and 1 narrow possible-support pattern hits (categories can overlap). These are not verified events, balanced counts, role/target findings, or proof of an administration/public response. Human review of source recordings remains outstanding.
6. **Phase 5 — Cox Ranch legal/records issue matrix (preliminary package complete):** source-linked issue matrix, source register, and prioritized records checklist are in `phase-05-cox-ranch-issues/`. The September 28 vote, signed final ordinances/resolution, final legal description/map, notice/publication proof, and current statutory text remain unverified. This package is not a legal opinion or finding of illegality.
7. **Phase 6 — recording verification, rendering, and QA:** not started. Public-source retrieval was attempted without cookies; sandbox TLS to YouTube and Granicus closes before downloading any media. Provide local source recordings or enable network egress, then verify candidates against footage and render with an edit-decision list, exact citations, preserved source masters, and per-file hashes.

## Evidence handling rules for every later cut

- Treat allegations such as “illegal,” “viewpoint discrimination,” “aversion,” “false,” and “vindicated” as **questions to test**, not as established facts or motives.
- Use the official recording as the audiovisual source. The Markdown transcripts are timestamped caption-derived text; they can mishear names and words. Verify every quote against the recording and correct any transcript errors in a separate, logged layer rather than silently rewriting the source.
- Keep source date/body/item visible. Link each clip to the official full recording and exact source time; preserve enough surrounding context to show what prompted the response.
- For a legal overlay, show the exact current statute/rule/case text, jurisdiction, pin cite and holding, effective date, and contrary authority. A transcript quotation is not a legal holding. A law's applicability to a particular parcel/project is a separate fact/legal question.
- For timing claims, the transcript is not enough: measure timer display/start/stop on the footage. Separate time taken by the speaker from time consumed by questions, rulings, interruptions, technical delay, or chair discretion.
- Preserve the full source and an edit-decision list. A montage is a demonstrative aid, not a substitute for the complete official recording or authenticated court exhibit. Counsel should review anything offered as evidence.

## Phase 1 files

- [`phase-01-position-timelines/storyboards.md`](phase-01-position-timelines/storyboards.md) — two cautious, source-led story outlines.
- [`phase-01-position-timelines/clip_manifest.json`](phase-01-position-timelines/clip_manifest.json) — timestamped source windows and explicit context notes.
- [`validate_manifest.py`](validate_manifest.py) — stdlib-only structural/source-link validator; it does not render or authenticate footage.

## Phase 2 files — candidate scan only

- [`phase-02-record-interactions/summary.md`](phase-02-record-interactions/summary.md) — coverage, categories, review queue, legacy-date overlap, and the no-captions exclusion.
- [`phase-02-record-interactions/candidate_events.jsonl`](phase-02-record-interactions/candidate_events.jsonl) — source-linked candidate cues with transcript line, exact start timestamp, text, and up to two adjacent cues on each side.
- [`phase-02-record-interactions/targeted_review_queue.md`](phase-02-record-interactions/targeted_review_queue.md) — focused list of in-person requests, remote-objection phrases, staff-recognition, and greeting candidates.
- [`phase-02-record-interactions/README.md`](phase-02-record-interactions/README.md) — field/category interpretation and verification requirements.
- [`scan_interactions.py`](scan_interactions.py) — deterministic, standard-library transcript scanner.

The scan processed 84 transcript-bearing catalog entries out of 85. It produced 2,250 cue records, including adjacent context-only cues; 1,968 fall on dates represented in the prior 616-row index. That overlap is **date-only**, not event-level deduplication. None of the candidate events has been checked against footage.

## Phase 3 files — comparator candidate search only

- [`phase-03-public-comment-comparators/README.md`](phase-03-public-comment-comparators/README.md) — category definitions, run/test instructions, and verification limits.
- [`phase-03-public-comment-comparators/summary.md`](phase-03-public-comment-comparators/summary.md) — coverage, category cue totals, meeting-level review queue, and the transcript-unavailable entry.
- [`phase-03-public-comment-comparators/candidate_events.jsonl`](phase-03-public-comment-comparators/candidate_events.jsonl) — source-linked timestamp candidates with transcript lines, neighboring caption cues, pattern matches, and Miller-window flags.
- [`phase-03-public-comment-comparators/targeted_review_queue.md`](phase-03-public-comment-comparators/targeted_review_queue.md) — LEADS/applicant/name-reference leads and possible cap/opportunity statements.
- [`scan_public_comment_comparators.py`](scan_public_comment_comparators.py) — deterministic, standard-library scanner. Regression checks: [`test_scan_public_comment_comparators.py`](test_scan_public_comment_comparators.py).

The scan processed 84 transcript-bearing catalog entries out of 85 and produced 1,451 machine-found candidate cue records across 77 meetings/bodies. The counts are pattern hits, not speakers, public-comment slots, distinct rule statements, or events. Three numeric opportunity cues occur in a work-session transcript whose date is cataloged only as `2026`; the panel is contextual material, not a verified public-comment event. No Phase 3 cue has been checked against footage.

## Phase 4 files — institutional disagreement/support candidates

- [`phase-04-institutional-disagreement/README.md`](phase-04-institutional-disagreement/README.md) — scope, current run, reproduction, and interpretation limits.
- [`phase-04-institutional-disagreement/summary.md`](phase-04-institutional-disagreement/summary.md) — corpus coverage, overlapping pattern-hit totals, meeting-level queue, and unavailable entry.
- [`phase-04-institutional-disagreement/candidate_events.jsonl`](phase-04-institutional-disagreement/candidate_events.jsonl) — source-linked caption candidates with timestamps, exact cues, surrounding context, and cautions.
- [`phase-04-institutional-disagreement/targeted_review_queue.md`](phase-04-institutional-disagreement/targeted_review_queue.md) — human-readable review queue.
- [`phase-04-institutional-disagreement/candidate_screening_notes.md`](phase-04-institutional-disagreement/candidate_screening_notes.md) — transcript-only re-screen and examples of remaining noise; source-video verification is still outstanding.
- [`scan_institutional_disagreement.py`](scan_institutional_disagreement.py) and [`test_scan_institutional_disagreement.py`](test_scan_institutional_disagreement.py) — deterministic scanner and regression tests.

Current run: **91** cues from **84** transcript-bearing entries (**85** catalog entries total), across **30** meetings/bodies; zero scan errors; one catalog entry without searchable transcript/captions. Category hit counts: 33 explicit disagreement, 58 correction/contradiction, 1 narrow possible-support cue. Counts can overlap and are not verified events. All thirteen Phase 4 regression tests pass. The named-person filter excludes Miller Lane and a separately named Brandt Miller; that prevents a common false-reference class but does not authenticate speaker identity.

## Phase 5 files — Cox Ranch record/legal issue spotting

- [`phase-05-cox-ranch-issues/README.md`](phase-05-cox-ranch-issues/README.md) — package status and scope limits.
- [`phase-05-cox-ranch-issues/issue_matrix.md`](phase-05-cox-ranch-issues/issue_matrix.md) — separately identifies annexation, assigned zoning, BP zoning, and Future Land Use/Urban Service Boundary actions; lists unresolved acreage, contiguity, petition, notice, protest, review-period, and industrial-siting questions; summarizes relevant case law without concluding legality.
- [`phase-05-cox-ranch-issues/source_register.md`](phase-05-cox-ranch-issues/source_register.md) — official City/Legislature source links, provenance notes, case citations, and explicit limits of secondary statute reproductions/draft materials.
- [`phase-05-cox-ranch-issues/record_requests.md`](phase-05-cox-ranch-issues/record_requests.md) — prioritized checklist and concise Clerk request.

Official September 28 minutes/final action, signed final ordinances/resolution, recorded boundary map, petition/certification, and mailing/publication proof remain outstanding in this workspace. The 8–2 vote is recorded only as a secondary news report. Do not use draft packet acreage, the substitute ordinance hosted by a news site, staff's 5.26% analysis, or the report's 15% alternative as final official findings. No footage was reviewed for Phase 5.

## Videos available now

[Download all nine pre-existing MP4s and their subtitle sidecars](existing-video-delivery.zip) (about 73 MB). Contents: CONTENTION_REEL, S1_48_HOURS, S2_THE_74M_LIST, S3_THE_TWO_TIES, S4_THE_214, S5_ONE_NIGHT_IN_APRIL, THE_CALLER, THE_CALLER_TAPE, and THE_RECORD_SPEAKS_VOICES. See the [provenance and checksums](available-existing-videos/README.md); none has been updated with the new transcript package.

Three additional rendered candidate cuts for rows 1, 3, and 4 are hosted in a related public repository, but are **not bundled or accepted as finished deliverables**. Their exact-revision download links, hashes, limited technical checks, and substantive gaps are in [`phase-06-external-render-inventory.md`](phase-06-external-render-inventory.md).

The nine bundled cuts are partial legacy edits, and the three external cuts are selected excerpts. None is the requested complete, verified suite. New evidence-led videos remain blocked on access to source recordings and full audiovisual review; do not represent any prior cuts as exhaustive or as incorporating Phases 2–5.

## Phase 6 source-access status

- [`NEW_VIDEO_AGENT_HANDOFF.md`](NEW_VIDEO_AGENT_HANDOFF.md) is the complete brief for producing all 17 new videos from official public recordings, with verification, source, editing, and QA requirements.
- [`phase-06-recording-status.md`](phase-06-recording-status.md) documents the public-source download attempt, network/TLS failure, and what would unblock rendering.
- [`phase-06-external-render-inventory.md`](phase-06-external-render-inventory.md) records three externally hosted candidate cuts and why they do not clear the delivery gate.
