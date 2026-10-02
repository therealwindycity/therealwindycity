# Phase 3 — public-comment comparator search candidates

**Status:** Corpus-wide caption search and source-linked candidate files are generated. No candidate has been verified against the official recording. This is a review index—not a count of speakers, comment slots, rule applications, or events, and not a legal or equal-treatment finding.

## Files

- [`summary.md`](summary.md) — scan coverage, pattern-hit totals, meeting-level review queue, and the transcript-unavailable catalog entry.
- [`candidate_events.jsonl`](candidate_events.jsonl) — one object per candidate timestamp cue, with the catalog date/body, official-video URL and timestamp, transcript path/line, matched phrase, adjacent caption context, nearby item-caption leads, category labels, and review cautions.
- [`targeted_review_queue.md`](targeted_review_queue.md) — focused LEADS/name/possible-affiliation cues plus possible cap and opportunity statements.
- [`../scan_public_comment_comparators.py`](../scan_public_comment_comparators.py) — deterministic standard-library scanner.
- [`../test_scan_public_comment_comparators.py`](../test_scan_public_comment_comparators.py) — regression checks for cross-cue opportunity ranges, cap false positives, and caption-name patterns.

Run from the repository root:

```sh
python3 video-production/scan_public_comment_comparators.py
python3 -m unittest discover -s video-production -p 'test_scan_public_comment_comparators.py'
```

## Coverage and current machine-found leads

The catalog has 85 meeting entries. The scanner processed the 84 entries with timestamped transcript files; the June 18, 2026 Board of Adjustment entry has no caption transcript and is not searchable here. This pass generated 1,451 candidate cue records across 77 meetings/bodies. Pattern-dependent category totals are in `summary.md` and overlap because a single cue can match multiple patterns.

Selected totals are:

- 68 Cheyenne LEADS/associated-name reference cues. These include mentions by other speakers and are not a speaker or appearance count.
- 27 possible applicant/developer-affiliation cues near public-comment gate phrases, and 145 possible speaker-identification cues near such phrases. Neither establishes the person's identity, role, agenda appearance type, or comment status.
- 1,066 possible gate/transition phrase cues. Many may be prompts or transitions; they are not 1,066 verified public-comment opportunities.
- 17 possible cap/time-rule phrase cues and 3 numerical opportunity-claim cues. The three number/opportunity cues come from the 2026 data-center panel, cataloged with year only and not an exact meeting date. They are contextual statements, not proof of the number of public-comment slots on any item.
- 32 time-limit/call cues, 31 topic/relevance cues, and 102 critical/legal-language cues near a gate, each outside three timestamp cues of an explicit Miller reference. These are review leads, not verified time calls, rulings, public comments, administration-targeted criticism, legal allegations, or statements by a different speaker.

The full ledger retains source-video start links and caption context so a reviewer can check exact words and surrounding exchanges. Nearby agenda-item text is a caption-based lead, not an independently verified item assignment. Speaker names are regex extractions from captions, not audiovisual identifications.

## Reading the categories and limitations

- `possible_public_comment_gate_or_transition` is based on public-comment prompt/transition phrases. It may capture the chair, staff, a question, a transition, or a caption artifact; it does not establish that a person received a speaking slot.
- `cheyenne_leads_or_associated_person_reference` catches known organization/name variants in the cue. It includes references about the organization as well as possible self-identifications.
- `possible_speaker_identification_near_comment_gate` and `possible_applicant_or_developer_affiliation_near_comment_gate` use caption name/role/entity patterns and a nearest gate phrase within 300 seconds. That timing proximity is not a same-turn or same-speaker link. Applicant presentations, staff presentations, council questions, invited responses, public testimony, and repeated turns must be separated by watching the video and checking the agenda and governing rule.
- `possible_comment_cap_or_time_rule_statement` and `possible_number_of_public_comment_opportunities_claim` are text-pattern leads. Cap language and “already spoken” prompts can describe a proposed policy, a repeat-speaker check, or debate/speaking limits rather than a public-comment rule. A stated number of opportunities is not a verified number of slots or proof of access for any speaker.
- `possible_time_limit_or_call_outside_miller_window` and `possible_topic_or_relevance_ruling_outside_miller_window` retain time/topic keyword cues outside a three-cue window of explicit Miller-name captions. `possible_public_comment_criticism_near_gate_outside_miller_window` similarly requires a critical/legal-language keyword near a gate phrase. The Miller-window boundary is a search/deduplication choice only: it does not identify a non-Miller speaker. Phase 2 retains the Miller-centered candidates.
- The scan does not establish the applicable written rule, whether it was in force, whether different speakers were similarly situated, actual speaking time, viewpoint, motive, unequal treatment, or the truth/legal accuracy of any statement.

## Required verification before comparison or use

1. Open the linked official recording. Verify words, audiovisual speaker identity, exact beginning/end of each turn, agenda item, procedure, and surrounding context; keep transcript corrections separate from the source captions.
2. Check the agenda/minutes and written rules for the relevant body, hearing type, public-comment period, cap, exceptions, and any action allowing an additional turn. Do not count an applicant presentation, council exchange, or staff response as a public-comment slot without evidence.
3. For repeated-opportunity comparisons, identify the same item/proceeding, each actual speaker/representative, who they represented, each granted turn, the rule applied, and relevant differences in role or procedure. These keyword results provide no denominator or matched comparison.
4. For time or off-topic comparisons, inspect the source clock/timer and the applicable rule; distinguish a time announcement, expired-time call, interruption, question, relevance ruling, or caption error. Do not infer timer credit from the transcript.
5. Preserve candidate, footage-verified, and legally assessed statuses separately. No footage has been verified or rendered in this phase.
