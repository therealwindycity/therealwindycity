#!/usr/bin/env python3
"""Index conservative disagreement/correction and Miller-support text candidates.

This is a caption-search aid only. It does not determine who is speaking,
which side of an exchange a person occupies, whether a statement is support,
or whether any legal claim is correct. Every candidate needs audiovisual review.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = Path("cheyenne-2026-transcripts/meetings.json")
DEFAULT_OUTDIR = Path("video-production/phase-04-institutional-disagreement")
CUE_RE = re.compile(r"^\[(\d{2,}:\d{2}:\d{2})\]\s*(.*)$")
VIDEO_RE = re.compile(r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})")
MILLER_RE = re.compile(r"\b(?:Charles\s+Miller|Mr\.?\s+Miller|Miller(?:['’]s)?)\b", re.I)
MILLER_LANE_RE = re.compile(r"\bMiller\s+Lane\b", re.I)

# Keep the disagreement pattern narrow. Negated constructions and explicit
# disclaimers such as "I don't disagree" or "not here to disagree" are not hits.
DISAGREEMENT_PATTERNS = {
    "first_person_disagreement": re.compile(
        r"\b(?:I|we|you|they|he|she)\s+(?:(?:strongly|respectfully|simply)\s+)?"
        r"(?:disagree(?:d|s)?(?:\s+with)?|do\s+not\s+agree|don['’]t\s+agree|"
        r"cannot\s+agree|can['’]t\s+agree)\b",
        re.I,
    ),
    "disagreement_with_target": re.compile(
        r"\b(?:(?:I|we|they|he|she)\s+)?(?:respectfully\s+|strongly\s+)?"
        r"disagree(?:d|s)?\s+with\s+(?:the\s+)?"
        r"(?:staff|the\s+staff|the\s+city|the\s+mayor|the\s+council|"
        r"the\s+chair|the\s+committee|the\s+commission|the\s+administration|"
        r"(?:Mr\.?\s+)?[A-Z][A-Za-z'’.-]+|that\s+conclusion|that\s+position|"
        r"that\s+assessment|the\s+decision|the\s+recommendation)\b",
        re.I,
    ),
}
CORRECTION_RE = re.compile(
    r"\b(?:"
    r"(?:that|this|the\s+(?:statement|claim|assertion|information|answer|description|"
    r"account|conclusion|position|finding|report))\s+(?:is|was|seems)\s+"
    r"(?:not\s+(?:correct|accurate|true|right)|incorrect|wrong|false)"
    r"|(?:that['’]s|that\s+is|this\s+is|you['’]re|you\s+are|he['’]s|he\s+is|"
    r"she['’]s|she\s+is|they['’]re|they\s+are)\s+(?:not\s+(?:correct|accurate|true|right)|wrong|incorrect)"
    r"|(?:I|we|staff|the\s+city|the\s+attorney)\s+(?:need|want|have|would\s+like)?\s*"
    r"(?:to\s+)?correct\s+(?:that|this|the\s+(?:record|statement|claim|information|error))"
    r"|(?:factually\s+)?(?:inaccurate|incorrect|not\s+accurate|not\s+true|not\s+correct)"
    r")\b",
    re.I,
)

# High-specificity endorsement phrases. Generic "exactly", "correct", praise,
# or agreement can be about an unrelated point, so these are not sufficient.
MILLER_DIRECT_SUPPORT_RE = re.compile(
    r"\b(?:"
    r"(?:I|we)\s+(?:agree|support|back|endorse)\s+(?:with\s+)?"
    r"(?:Charles\s+Miller|Mr\.?\s+Miller|Miller)\b"
    r"|\b(?:Charles\s+Miller|Mr\.?\s+Miller|Miller)\b[^!?]{0,80}?"
    r"\b(?:is|was|seems|has\s+been)\s+(?:right|correct|accurate|valid)\b"
    r"|\b(?:Charles\s+Miller|Mr\.?\s+Miller|Miller)\b[^!?]{0,80}?"
    r"\b(?:makes\s+(?:a\s+)?(?:good|valid|fair)\s+point|is\s+making\s+sense)\b"
    r")",
    re.I,
)
# Response-shaped agreement phrases are only usable if Miller's name appears
# later in the same cue (e.g. "you're right, Mr. Miller") or in the immediately
# preceding cue. Never search for generic "exactly" or bare correctness.
NEARBY_SUPPORT_RE = re.compile(
    r"\b(?:"
    r"I\s+agree\s+with\s+you|we\s+agree\s+with\s+you|"
    r"I\s+agree\s+with\s+him|we\s+agree\s+with\s+him|"
    r"you['’]re\s+right|you\s+are\s+right|"
    r"you['’]re\s+correct|you\s+are\s+correct|"
    r"I\s+think\s+you['’]re\s+right|I\s+think\s+you\s+are\s+right"
    r")\b",
    re.I,
)
SUPPORT_NEGATIVE_CONTEXT_RE = re.compile(
    r"\b(?:out\s+of\s+order|misinformation|wrong|inaccurate|incorrect|"
    r"don't\s+agree|do\s+not\s+agree|disagree|opposed\s+to\s+him)\b",
    re.I,
)
NEGATED_DISAGREEMENT_CONTEXT_RE = re.compile(
    r"\b(?:"
    r"not\s+here\s+to\s+(?:say\s+or\s+to\s+)?disagree"
    r"|(?:haven't|have\s+not|hadn't|had\s+not)\s+(?:seen|heard|found)"
    r"\b[^.!?]{0,80}\b(?:I|we|you|they|he|she)\s+disagreed?\b"
    r"|(?:I|we|you|they|he|she)\s+(?:don't|do\s+not)\s+think"
    r"\s+(?:I|we|you|they|he|she)\s+disagreed?\b"
    r")",
    re.I,
)
CORRECTION_QUESTION_RE = re.compile(
    r"\b(?:am|is|are|was|were|do|does|did|can|could|would|should|will|have|has|had)\s+"
    r"(?:I|we|you|they|he|she|it|that|this|these|those|the\s+[A-Za-z'-]+)\s+"
    r"(?:not\s+)?(?:be\s+)?(?:correct|incorrect|accurate|true|right|wrong)\b",
    re.I,
)
CORRECTION_CONDITIONAL_RE = re.compile(
    r"\b(?:if|unless|assuming|supposing)\b[^.!?]{0,100}"
    r"\b(?:incorrect|wrong|inaccurate|not\s+correct|not\s+true)\b",
    re.I,
)


def parse_seconds(value: str) -> int:
    hours, minutes, seconds = map(int, value.split(":"))
    return hours * 3600 + minutes * 60 + seconds


def parse_cues(text: str) -> list[dict]:
    cues: list[dict] = []
    current: dict | None = None
    for line_number, line in enumerate(text.splitlines(), 1):
        match = CUE_RE.match(line.strip())
        if match:
            if current is not None:
                current["text"] = " ".join(current.pop("parts")).strip()
                cues.append(current)
            timestamp = match.group(1)
            current = {
                "time": timestamp,
                "seconds": parse_seconds(timestamp),
                "line": line_number,
                "parts": [match.group(2)],
            }
        elif current is not None and line.strip():
            current["parts"].append(line.strip())
    if current is not None:
        current["text"] = " ".join(current.pop("parts")).strip()
        cues.append(current)
    return cues


def person_mention_spans(text: str) -> list[re.Match]:
    spans: list[re.Match] = []
    for match in MILLER_RE.finditer(text):
        if MILLER_LANE_RE.match(text, match.start()) or re.match(r"\s+Lane\b", text[match.end():], re.I):
            continue
        if re.match(r"^(?:Charles|Mr\.?)\s+", match.group(0), re.I):
            spans.append(match)
            continue
        previous_word = re.search(r"\b([A-Z][a-z]+)\s+$", text[:match.start()])
        if previous_word and previous_word.group(1).lower() not in {"mr", "charles"}:
            # Do not conflate another named Miller (e.g. Brandt Miller) with
            # Charles Miller merely because both share a surname.
            continue
        spans.append(match)
    return spans


def person_mentions_miller(text: str) -> list[str]:
    return [match.group(0) for match in person_mention_spans(text)]


def find_support_match(cues: list[dict], index: int, miller_indices: set[int]) -> dict | None:
    """Return only a tightly anchored support-shaped candidate, never a finding."""
    text = cues[index]["text"]
    name_spans = person_mention_spans(text)
    direct = MILLER_DIRECT_SUPPORT_RE.search(text) if name_spans else None
    nearby = NEARBY_SUPPORT_RE.search(text)

    def negative_near(match: re.Match) -> bool:
        window = text[max(0, match.start() - 35):min(len(text), match.end() + 180)]
        return SUPPORT_NEGATIVE_CONTEXT_RE.search(window) is not None

    if direct and not negative_near(direct):
        return {"match": direct, "pattern": "explicit_named_support"}
    if not nearby or negative_near(nearby):
        return None

    # A same-cue response is only retained when the Miller name follows the
    # response-shaped phrase; a name before it could be Miller speaking himself.
    if any(span.start() >= nearby.end() for span in name_spans):
        return {"match": nearby, "pattern": "response_phrase_before_miller_name_in_same_cue"}
    # Otherwise require the immediately preceding cue to name Miller. A later
    # name or a generic word such as "exactly" is not enough.
    if not name_spans and index > 0 and index - 1 in miller_indices:
        return {"match": nearby, "pattern": "response_phrase_after_miller_name_in_preceding_cue"}
    return None


def context_cues(cues: list[dict], index: int, radius: int = 2) -> list[dict]:
    return [
        {"time": cues[i]["time"], "line": cues[i]["line"], "text": cues[i]["text"]}
        for i in range(max(0, index - radius), min(len(cues), index + radius + 1))
    ]


def clause_prefix(text: str, position: int) -> str:
    """Return text since the last sentence/clause boundary before position."""
    boundary = max(text.rfind(mark, 0, position) for mark in ".!?;")
    return text[boundary + 1:position]


def correction_phrase_matches(text: str) -> list[re.Match]:
    """Reject confirmation questions and conditional/self-hedging uses."""
    matches: list[re.Match] = []
    for match in CORRECTION_RE.finditer(text):
        prefix = clause_prefix(text, match.start())
        lead_in = prefix + match.group(0)
        if CORRECTION_QUESTION_RE.search(lead_in):
            continue
        if CORRECTION_CONDITIONAL_RE.search(lead_in):
            continue
        matches.append(match)
    return matches


def explicit_disagreement_matches(text: str) -> list[dict]:
    matches: list[dict] = []
    for label, pattern in DISAGREEMENT_PATTERNS.items():
        for match in pattern.finditer(text):
            prefix = clause_prefix(text, match.start())
            context = prefix + match.group(0)
            # Exclude explicit negation and statements that disclaim disagreement
            # (e.g. "I haven't seen anything I disagreed with" or "not here to
            # say or to disagree"). Keep a later affirmative disagreement in a
            # separate sentence/cue.
            if re.search(r"\b(?:do\s+not|don['’]t|never|not)\s*$", prefix, re.I):
                continue
            if NEGATED_DISAGREEMENT_CONTEXT_RE.search(context):
                continue
            matches.append({"category": "explicit_disagreement_language", "pattern": label,
                            "text": match.group(0)})
    return matches


def scan_meeting(meeting: dict) -> tuple[list[dict], dict | None, dict | None]:
    transcript_name = meeting.get("file")
    if not transcript_name:
        return [], None, {
            "date": meeting.get("date"), "body": meeting.get("body"),
            "youtube_id": meeting.get("youtube_id"), "status": "no_transcript_available",
            "reason": meeting.get("note", "catalog has no transcript path"),
        }

    transcript_path = ROOT / "cheyenne-2026-transcripts" / transcript_name
    if not transcript_path.is_file():
        return [], {"date": meeting.get("date"), "file": transcript_name,
                    "error": "transcript file missing"}, None

    text = transcript_path.read_text(encoding="utf-8", errors="replace")
    cues = parse_cues(text)
    if not cues:
        return [], {"date": meeting.get("date"), "file": transcript_name,
                    "error": "no timestamp cues"}, None

    video_match = VIDEO_RE.search(text)
    video_id = meeting.get("youtube_id") or (video_match.group(1) if video_match else None)
    if video_match and meeting.get("youtube_id") and meeting["youtube_id"] != video_match.group(1):
        return [], {"date": meeting.get("date"), "file": transcript_name,
                    "error": f"catalog video ID {meeting['youtube_id']} differs from transcript header {video_match.group(1)}"}, None

    miller_indices = {i for i, cue in enumerate(cues) if person_mentions_miller(cue["text"])}
    events: list[dict] = []
    date_value = meeting.get("date", "")
    body = meeting.get("body", "unknown")
    title = text.splitlines()[0].lstrip("# ").strip() if text.splitlines() else ""

    for i, cue in enumerate(cues):
        content = cue["text"]
        patterns = explicit_disagreement_matches(content)
        correction_matches = [
            {"category": "possible_factual_correction_or_contradiction",
             "pattern": "correction_or_contradiction", "text": match.group(0)}
            for match in correction_phrase_matches(content)
        ]
        miller_refs_here = person_mentions_miller(content)
        nearby_miller_refs = [
            {"time": cues[j]["time"], "line": cues[j]["line"],
             "mentions": person_mentions_miller(cues[j]["text"])}
            for j in range(max(0, i - 1), min(len(cues), i + 2))
            if j in miller_indices
        ]
        support_info = find_support_match(cues, i, miller_indices)
        support_match = support_info["match"] if support_info else None

        categories = [row["category"] for row in patterns + correction_matches]
        if support_match:
            categories.append("possible_supportive_reaction_near_miller_reference")
        categories = list(dict.fromkeys(categories))
        if not categories:
            continue

        seconds = cue["seconds"]
        source_url = f"https://www.youtube.com/watch?v={video_id}&t={seconds}s" if video_id else None
        pattern_matches = patterns + correction_matches
        if support_match:
            pattern_matches.append({
                "category": "possible_supportive_reaction_near_miller_reference",
                "pattern": support_info["pattern"],
                "text": support_match.group(0),
            })
        events.append({
            "event_id": f"{date_value}:{body}:{transcript_path.relative_to(ROOT)}:{cue['time']}:{cue['line']}",
            "status": "machine_candidate_requires_video_review",
            "date": date_value,
            "body": body,
            "meeting_title": title,
            "youtube_id": video_id,
            "timestamp": cue["time"],
            "timestamp_seconds": seconds,
            "source_link": source_url,
            "transcript": str(transcript_path.relative_to(ROOT)),
            "source_line": cue["line"],
            "categories": categories,
            "pattern_matches": pattern_matches,
            "explicit_miller_name_in_cue": bool(miller_refs_here),
            "miller_name_forms_in_cue": miller_refs_here,
            "explicit_miller_reference_within_one_cue": nearby_miller_refs,
            "speaker_attribution": "not inferred from caption cue",
            "statement_target_or_relationship": "not inferred from caption cue",
            "cue_text": content,
            "context_cues": context_cues(cues, i, radius=2),
            "review_note": (
                "Check the linked original video, identify each speaker and the statement being answered, "
                "and preserve the full exchange. A disagreement/correction keyword is not automatically "
                "an administration disagreement. A supportive phrase within one caption cue of a Miller "
                "name is not proof it responds to Miller. Captions alone do not establish motive, legal "
                "accuracy, or a verified event."
            ),
        })

    return events, None, None


def write_outputs(events: list[dict], errors: list[dict], unavailable: list[dict],
                  outdir: Path, catalog_count: int, transcript_count: int) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    events.sort(key=lambda row: (row["date"], row["body"], row["timestamp_seconds"], row["source_line"]))
    ledger = outdir / "candidate_events.jsonl"
    with ledger.open("w", encoding="utf-8") as fp:
        for event in events:
            fp.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")

    by_category: Counter = Counter(category for event in events for category in event["categories"])
    by_meeting: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for event in events:
        by_meeting[(event["date"], event["body"])].append(event)

    queue_lines = [
        "# Phase 4 — institutional disagreement/support review queue",
        "",
        "This queue contains caption-pattern leads only. It does not identify the speakers, determine whether a cue is public testimony or administrative speech, or decide that a response was directed at Charles Miller. Use the exact source link and adjacent cues in `candidate_events.jsonl`.",
        "",
    ]
    for event in events:
        excerpt = " ".join(event["cue_text"].split())
        if len(excerpt) > 420:
            excerpt = excerpt[:417] + "…"
        excerpt = excerpt.replace("|", "\\|")
        cats = ", ".join(f"`{cat}`" for cat in event["categories"])
        video = f"[source video {event['timestamp']}]({event['source_link']})" if event.get("source_link") else event["timestamp"]
        transcript = f"[transcript line {event['source_line']}](../../{event['transcript']}#L{event['source_line']})"
        queue_lines.append(
            f"- **{event['date']} · {event['body']} · {event['timestamp']}** — {cats}; {video}; {transcript}. Caption cue: “{excerpt}”"
        )
    if not events:
        queue_lines.append("- No phrases matched. This is not evidence that no disagreement or supportive reaction occurred.")
    queue_lines.extend([
        "",
        "## Verification before any classification",
        "",
        "1. Open the official recording; confirm words, audiovisual speaker identity, and the start/end of the complete turn.",
        "2. Identify the statement or question to which a response refers. Do not use name proximity as a substitute for a demonstrated connection.",
        "3. Use meeting agenda/minutes and the speaker's actual role before labeling the exchange administration-to-administration, administration-to-public, staff-to-administration, or support for Miller.",
        "4. Preserve surrounding discussion and any caption correction as a separate logged layer. Do not infer viewpoint, motive, truth, or legal effect from transcript text.",
        "",
    ])
    (outdir / "targeted_review_queue.md").write_text("\n".join(queue_lines), encoding="utf-8")

    summary = [
        "# Phase 4 — institutional disagreement/support candidate inventory",
        "",
        "Generated by `video-production/scan_institutional_disagreement.py` from the 2026 meeting catalog and timestamped caption transcripts. The scanner indexes explicit language candidates; it does not count verified events or attribute a disagreement to the administration.",
        "",
        f"- Meeting catalog entries: **{catalog_count}**",
        f"- Transcript-bearing entries scanned: **{transcript_count}**",
        f"- Candidate timestamp cues: **{len(events)}**",
        f"- Meetings/bodies with candidates: **{len(by_meeting)}**",
        f"- Transcript scan errors: **{len(errors)}**",
        f"- Catalog entries unavailable to transcript search: **{len(unavailable)}**",
        "- Full source-linked candidate ledger: [`candidate_events.jsonl`](candidate_events.jsonl)",
        "- Timestamped review queue: [`targeted_review_queue.md`](targeted_review_queue.md)",
        "- Text-only post-scan screening and residual-noise notes: [`candidate_screening_notes.md`](candidate_screening_notes.md)",
        "",
        "## Category counts (pattern hits, not event counts)",
        "",
        "| Category | Cue records |",
        "|---|---:|",
    ]
    for category, count in sorted(by_category.items()):
        summary.append(f"| `{category}` | {count} |")
    summary.extend([
        "",
        "## Reading the candidates",
        "",
        "- `explicit_disagreement_language` records narrow first-person or explicitly targeted disagreement wording. Negated/disclaimed forms such as “I don't disagree,” “I haven't seen anything I disagreed with,” and “not here to say or to disagree” are excluded; overlapping pattern labels are deduplicated per cue.",
        "- `possible_factual_correction_or_contradiction` records a limited set of direct correction/error phrases. Confirmation questions and conditional/hedged uses such as “Am I correct that…?” and “if I'm incorrect…” are filtered, but self-corrections, pronunciation, policy/value judgments, and unrelated facts can still match. The target is not assigned automatically; see `candidate_screening_notes.md`.",
        "- `possible_supportive_reaction_near_miller_reference` requires an explicit named endorsement, or a response-shaped phrase such as “you're right” in the same cue before a Miller name, or in a cue immediately following a Miller-name cue. Generic “exactly,” standalone “correct,” and bare “I agree” are excluded; nearby disagreement/negative wording suppresses the candidate. Even these narrower cues are only review leads—not proof of a response, supportive stance, or speaker identity.",
        "- The scan does not decide whether any speaker is an elected official, City employee, member of the public, applicant, or advocate. It does not assess viewpoint, motive, accuracy, legality, or the balance of all favorable/unfavorable reactions.",
        "",
        "## Meeting-level queue",
        "",
        "| Date | Body | Candidate cues | Category types | Transcript(s) |",
        "|---|---|---:|---|---|",
    ])
    for (meeting_date, body), rows in sorted(by_meeting.items()):
        categories = sorted({category for row in rows for category in row["categories"]})
        transcripts = sorted({row["transcript"] for row in rows})
        links = "; ".join(f"[`{Path(name).name}`](../../{name})" for name in transcripts)
        summary.append(f"| {meeting_date} | {body} | {len(rows)} | {', '.join(f'`{cat}`' for cat in categories)} | {links} |")
    if unavailable:
        summary.extend(["", "## Catalog entries unavailable to transcript search", ""])
        for row in unavailable:
            link = f" — [source video](https://www.youtube.com/watch?v={row['youtube_id']})" if row.get("youtube_id") else ""
            summary.append(f"- {row.get('date')} {row.get('body')}: {row.get('reason', 'no transcript')}" + link)
    if errors:
        summary.extend(["", "## Scan errors", ""])
        for row in errors:
            summary.append(f"- {row.get('date')} `{row.get('file')}`: {row.get('error')}")
    summary.append("")
    (outdir / "summary.md").write_text("\n".join(summary), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", default=str(DEFAULT_CATALOG), help="meeting catalog path relative to repository root")
    parser.add_argument("--outdir", default=str(DEFAULT_OUTDIR), help="output directory relative to repository root")
    args = parser.parse_args()
    catalog = (ROOT / args.catalog).resolve()
    outdir = (ROOT / args.outdir).resolve()
    if not catalog.is_relative_to(ROOT) or not outdir.is_relative_to(ROOT):
        parser.error("catalog and output directory must remain under repository root")
    meetings = json.loads(catalog.read_text(encoding="utf-8"))
    events: list[dict] = []
    errors: list[dict] = []
    unavailable: list[dict] = []
    transcript_count = 0
    for meeting in meetings:
        if meeting.get("file"):
            transcript_count += 1
        try:
            found, error, skipped = scan_meeting(meeting)
        except Exception as exc:
            found, error, skipped = [], {
                "date": meeting.get("date"), "file": meeting.get("file"),
                "error": f"unexpected scanner error: {exc}",
            }, None
        events.extend(found)
        if error:
            errors.append(error)
        if skipped:
            unavailable.append(skipped)
    write_outputs(events, errors, unavailable, outdir, len(meetings), transcript_count)
    print(f"Scanned {transcript_count} transcript-bearing catalog entries; wrote {len(events)} candidate cues")
    print(f"Summary: {(outdir / 'summary.md').relative_to(ROOT)}")
    if errors:
        print(f"Warning: {len(errors)} transcript errors")
    if unavailable:
        print(f"Unavailable to transcript search: {len(unavailable)} catalog entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
