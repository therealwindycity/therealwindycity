# Phase 4 — post-scan transcript-only screening notes

**Reviewed:** 2026-10-02  
**Input:** current 91-row `candidate_events.jsonl` plus candidate cue text, matched pattern, and adjacent caption context where the trigger or target was ambiguous.  
**Limit:** this is a text-only screen. No source video/audio was watched. It cannot verify the words, speaker, target, response, role, relevance, or whether separate cues are one event.

## What changed before this screen

A text review of the previous 107-cue run exposed clear search noise: “I haven't seen anything that I disagreed with,” “I'm not here to say or to disagree,” confirmation questions such as “Am I correct that…?” / “Is that not correct?”, and conditional/self-hedging statements such as “Unless I'm incorrect…” were being presented as opposition or correction candidates. The scanner now excludes those constructions, and regression tests cover them. It also excludes a surname-only match when the immediately preceding capitalized word makes the reference a different person, including “Brandt Miller”; “Miller Lane” remains excluded. A legitimate response-shaped cue is retained despite the words “time is up.”

The current run contains **91 candidate cue records** (33 disagreement-pattern hits, 58 possible correction/contradiction hits, and one possible-support hit). The categories can overlap. Filtering obvious language-level false matches is not the same as adjudicating the remaining cues.

## Residual noise found in the transcript text

The following are examples of why the remaining records must stay labeled as candidates. They are **not** removed from the source-linked ledger because some may still matter in their full exchange, but the trigger alone does not support a finding of institutional disagreement or factual contradiction.

| Source cue | Text-only caution |
|---|---|
| [2026-01-14, 01:00:49](https://www.youtube.com/watch?v=tUTtHJp87Iw&t=3649s) | “Cobb can explain to me why I'm incorrect…” sounds like an invitation to correct the speaker / a hedge, not necessarily a contradiction already made. |
| [2026-03-09, 00:54:35](https://www.youtube.com/watch?v=19tQtLA8klo&t=3275s) | “We can't boo the people you don't agree with” is a general moderation statement, not automatically a disagreement between identified institutional speakers. |
| [2026-03-23, 01:17:04](https://www.youtube.com/watch?v=ey_oCFcK7Cs&t=4624s) | “Even if they don't agree with you” is a generic statement about representing the community; the target/exchange is not established by that phrase. |
| [2026-04-20, 02:22:27](https://www.youtube.com/watch?v=t17ft4xMMx4&t=8547s) | “The statement was inaccurate; I knew you were here and would be able to correct me” may be the speaker correcting their own earlier statement. |
| [2026-05-26, 06:08:45](https://www.youtube.com/watch?v=bGt1XMfaTTw&t=22125s) | “That's not right that the city should be going and paying for that” reads as a policy/value objection, not necessarily a factual correction. |
| [2026-07-14, 01:03:20](https://www.youtube.com/watch?v=YMsVe6JHm3k&t=3800s) | “De Granier? Incorrect. De Granier, just making sure I'm pronouncing it correctly” is a pronunciation/name check, not an institutional factual dispute. |
| [2026-07-27, 00:39:46](https://www.youtube.com/watch?v=S49bb5GfUro&t=2386s) | “I knew there was a word … I was going to say bonus, but I knew that was wrong. Preference” is apparent self-correction of word choice. |
| [2026-09-14, 03:47:36](https://www.youtube.com/watch?v=-zBOAUpDE3E&t=13656s) | “Maybe the number I have is incorrect” concerns contact information for a phone call, not necessarily the public-policy discussion. |

Some surviving cues are short fragments (for example, a single “incorrect,” “inaccurate,” or “not true”), while others group multiple speakers or repeated words in one auto-caption cue. Nearby review context reduces but does not eliminate these risks. Corrections may also be legitimate clarifications, factual answers, or self-corrections rather than disagreement; a public speaker's disagreement is not automatically an administration/public exchange.

## Review status and next step

- **Text search and a post-run text screen:** complete for this pass; scanner rules now suppress the obvious negation, confirmation-question, conditional, and name-collision cases above.
- **Audio/video verification:** not started. For each retained cue, inspect the official recording, confirm the spoken words and speaker, identify the statement being answered, review the whole exchange and agenda item, and classify the speaker's institutional/public role from reliable records. Record any caption correction separately rather than silently rewriting the transcript.
- **Counts:** do not describe the 91 cues as 91 events, 33 verified disagreements, 58 factual errors, or a balance-of-viewpoints tally. Do not describe the one possible-support cue as confirmed support.
