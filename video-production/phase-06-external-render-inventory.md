# Phase 6 — externally hosted rendered candidates

**Checked:** 2026-10-02. **Status: research pointers only—not accepted as completed project deliverables.** While following the handoff, I found three already-rendered MP4s in the related public repository [`bartimoussmith-oss/therealwindycity`](https://github.com/bartimoussmith-oss/therealwindycity), at its `main` tree as of commit [`b50fe362bd0752778687cae8453c64adfc3eb4c2`](https://github.com/bartimoussmith-oss/therealwindycity/commit/b50fe362bd0752778687cae8453c64adfc3eb4c2). These are not part of this checkout and were not created in this pass. Their source masters, retrieval logs, edit-decision lists, separate SRT/VTT sidecars, caption-change logs, and complete QA records were not present in that repository tree.

## Candidate files

| Requested row | External cut | Duration / size | Exact-revision download | Git blob at revision | SHA-256 |
|---:|---|---:|---|---|---|
| 1 | `01-wolfe-evolution.mp4` | 14:52.32 / 35,495,562 bytes | [Download MP4](https://raw.githubusercontent.com/bartimoussmith-oss/therealwindycity/b50fe362bd0752778687cae8453c64adfc3eb4c2/video/01-wolfe-evolution.mp4) | `af6fd8701ecb1b2396c48410c441a20e31299102` | `e36f78ce893b9c8b3d7a586f0b4c5baac0c40a62e3c0806cca49829596ca41d9` |
| 3 | `03-come-down-here-in-person.mp4` | 7:52.12 / 18,397,534 bytes | [Download MP4](https://raw.githubusercontent.com/bartimoussmith-oss/therealwindycity/b50fe362bd0752778687cae8453c64adfc3eb4c2/video/03-come-down-here-in-person.mp4) | `c338992a3ea6f5a2e8d499400bf91b64b6792e88` | `d4f3e78eb1766483237a4fe2cf0d09162f2eb024094a99213ca20a782a178772` |
| 4 | `04-one-time-for-everybody.mp4` | 6:28.35 / 22,613,589 bytes | [Download MP4](https://raw.githubusercontent.com/bartimoussmith-oss/therealwindycity/b50fe362bd0752778687cae8453c64adfc3eb4c2/video/04-one-time-for-everybody.mp4) | `643ddec19a5a7eb97270eb6ed26de422841082e6` | `dbf9a15074364fe508d2599d1d8770728fe93ea32379256e46b35dba10d5f2db` |

All three files are H.264/AAC, 1280×720, 30 fps, with stereo 48 kHz audio. Their complete streams decoded with FFmpeg without reported errors in this pass. That is a **container/decode check only**; it is not full playback QA, quote verification, source authentication, or a check that the output resolution avoids upscaling from the original camera feed. The SHA-256 values above identify the externally hosted rendered files, not their missing original source recordings.

## Scope and limitations

- **Row 1, Wolfe:** the sampled title/source cards describe a February–July sequence, including the February 9, June 8, June 22, July 13, and July 27 Council meetings. It does not include the August 28 Cox Ranch work session or September 14 Cox Ranch vote in the Phase 1 cut plan. The included legal cards and their project-specific application remain unreviewed by counsel. It is a selected cut, not the complete requested record.
- **Row 3, in-person/Zoom:** the cut selects several moments from April–July, including Finance Committee, Public Services Committee, and Council excerpts. It is not an exhaustive search of the caption-bearing meeting set, and it does not establish a written attendance rule, equal application, motive, or a legal violation.
- **Row 4, LEADS/comment opportunities:** the cut selects May 26 and July 13 examples and a September 14 Miller comment. It does not supply the written rule or a verified denominator, nor does it establish that a proxy reading, applicant presentation, organizational speaker, and resident second request are equivalent comment slots. Treat its comparisons as questions to review, not findings.

The cuts contain burned-in titles/source labels, but no separate subtitle file was found in the `video/` tree at the cited revision. The visible labels are not a substitute for an edit-decision list or a transcript correction log. During this pass, I extracted representative frames, checked selected on-screen text against the transcript windows, inspected codec/duration metadata, and decoded the files. I did **not** listen to or watch every excerpt end-to-end, compare every cue against the original City recording, verify every identity/agenda item, check the applicable written rules, or obtain/verify source-master hashes. No retrieval date for the City source recordings is recorded in the external tree.

The burned-in labels point to these official recording IDs; they are review leads, not proof that each video uses the complete or correct source window:

- **Row 1:** [Feb 9 Council](https://www.youtube.com/watch?v=OxeCnRnBLkU), [Apr 13 Council](https://www.youtube.com/watch?v=mPv73_3Clls), [Jun 8 Council](https://www.youtube.com/watch?v=69FQxIr9sJA), [Jun 22 Council](https://www.youtube.com/watch?v=RjSGlhh4q9s), [Jul 13 Council](https://www.youtube.com/watch?v=6dPLuulCpbI), and [Jul 27 Council](https://www.youtube.com/watch?v=S49bb5GfUro).
- **Row 3:** [Apr 20 Public Services](https://www.youtube.com/watch?v=t17ft4xMMx4), [Apr 21 Finance](https://www.youtube.com/watch?v=9pXvzw-Aut4), [Apr 27 Council](https://www.youtube.com/watch?v=y9vnXtjZpR0), [May 11 Council](https://www.youtube.com/watch?v=vBJi7WeZ4C0), [Jun 22 Council](https://www.youtube.com/watch?v=RjSGlhh4q9s), and [Jul 6 Public Services](https://www.youtube.com/watch?v=7BwdzgyTD2Y).
- **Row 4:** [May 26 Council](https://www.youtube.com/watch?v=bGt1XMfaTTw), [Jul 13 Council](https://www.youtube.com/watch?v=6dPLuulCpbI), and [Sep 14 Council](https://www.youtube.com/watch?v=-zBOAUpDE3E).

## Handling recommendation

Use these MP4s as leads and possible reference cuts only. Do not label them “final,” “complete,” or “verified,” and do not count them as fulfillment of rows 1, 3, or 4 without obtaining their source/provenance package and completing the missing review. They have not been copied into this repository; keeping them as stable external links avoids duplicating roughly 76 MB of generated video while the source masters and editorial records are absent.
