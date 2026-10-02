#!/usr/bin/env python3
"""Build a transcript-search candidate ledger for Phase 2.

The output is an index for audiovisual review, not a complete factual finding.
Captions can omit speakers, merge voices, and mis-transcribe words. The tool
labels hits as candidates and never decides legal questions or timer accounting.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = Path("cheyenne-2026-transcripts/meetings.json")
DEFAULT_OUTDIR = Path("video-production/phase-02-record-interactions")
CUE_RE = re.compile(r"^\[(\d{2,}:\d{2}:\d{2})\]\s*(.*)$")
VIDEO_RE = re.compile(r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})")
MILLER_RE = re.compile(r"\b(?:Charles\s+Miller|Mr\.?\s+Miller|Miller(?:['’]s)?)\b", re.I)
MILLER_LANE_RE = re.compile(r"\bMiller\s+Lane\b", re.I)

# Broad, recall-oriented patterns. Hits are searchable candidates only; a match
# does not identify the speaker or establish that an event occurred as captioned.
PATTERNS = {
    "remote": re.compile(
        r"\b(?:zoom|online|remote|virtual|phone|telephone|unmute|mute|hand\s+(?:is\s+)?raised|"
        r"can\s+you\s+hear|hear\s+me|join(?:ed|ing)?\s+(?:the\s+)?meeting|webex|call\s+in)\b",
        re.I,
    ),
    "in_person_procedure": re.compile(
        r"\b(?:in\s+person|in-person|physically|come\s+(?:down|in|here)|come\s+visit|"
        r"show\s+up|appear\s+in\s+person|attend\s+in\s+person|in\s+the\s+room|face\s+to\s+face)\b",
        re.I,
    ),
    "remote_objection": re.compile(
        r"\b(?:zoom|online|remote|phone|telephone)\b.{0,90}\b(?:"
        r"not\s+(?:allowed|permitted|appropriate)|in\s+person\s+only|wrong\s+format|"
        r"problem\s+with|issue\s+with|cannot\s+(?:speak|comment|participate)|"
        r"can't\s+(?:speak|comment|participate)|must\s+appear\s+in\s+person|"
        r"have\s+to\s+appear\s+in\s+person|should\s+appear\s+in\s+person)\b|"
        r"\b(?:not\s+(?:allowed|permitted|appropriate)|in\s+person\s+only|"
        r"cannot\s+(?:speak|comment|participate)|can't\s+(?:speak|comment|participate)|"
        r"must\s+appear\s+in\s+person|have\s+to\s+appear\s+in\s+person|"
        r"should\s+appear\s+in\s+person|not\s+a\s+(?:radio|phone|television)\s+talk\s+show)\b",
        re.I,
    ),
    "time_limit_or_interruption": re.compile(
        r"\b(?:your\s+time|time\s+(?:is|has|was)\s+up|time's\s+up|time\s+expired|"
        r"three\s*[- ]?minute|three\s+minutes|3\s*[- ]?minute|time\s+limit|timer|clock|"
        r"interruption|interrupted|interrupt|cut\s+off|cut\s+(?:the\s+)?mic|microphone|"
        r"point\s+of\s+order|out\s+of\s+order|gavel|time\s+is\s+running)\b",
        re.I,
    ),
    "out_of_order_or_relevance": re.compile(
        r"\b(?:out\s+of\s+order|not\s+germane|germane|point\s+of\s+order|"
        r"off\s+(?:the\s+)?topic|off\s+subject|back\s+to\s+the\s+topic)\b",
        re.I,
    ),
    "timer_adjustment": re.compile(
        r"\b(?:credit\s+(?:me|him|Miller)|restart(?:ed|ing)?\s+(?:your\s+)?time|"
        r"resume\s+(?:your\s+)?time|stop\s+(?:the\s+)?(?:clock|timer|time)|"
        r"pause\s+(?:the\s+)?(?:clock|timer|time)|time\s+(?:restarted|credited|restored)|"
        r"give\s+(?:him|Miller)\s+(?:his\s+)?time\s+back)\b",
        re.I,
    ),
    "possible_reply_or_correction": re.compile(
        r"\b(?:not\s+accurate|not\s+true|factually\s+false|false|wrong|misinformation|"
        r"off\s+base|no\s+standing|I\s+disagree|we\s+disagree|I\s+correct|correct(?:ion)?|"
        r"you\s+are\s+wrong|that\s+isn't\s+right|that\s+is\s+not\s+right|"
        r"this\s+individual|his\s+comments|his\s+claim|his\s+argument)\b",
        re.I,
    ),
}

GREETING_FOR_MILLER_RE = re.compile(
    r"\b(?:(?:welcome(?:\s+back)?|good\s+(?:evening|afternoon|morning)|hello|hi|"
    r"how\s+are\s+you|glad\s+to\s+(?:see|hear)|nice\s+to\s+see)\b"
    r"[^.!?]{0,90}\b(?:Mr\.?\s+Miller|Charles\s+Miller)\b|"
    r"\b(?:Mr\.?\s+Miller|Charles\s+Miller)\b[^.!?]{0,90}"
    r"\b(?:welcome(?:\s+back)?|good\s+(?:evening|afternoon|morning)|hello|hi|"
    r"how\s+are\s+you|glad\s+to\s+(?:see|hear)|nice\s+to\s+see)\b)",
    re.I,
)
SELF_INTRO_RE = re.compile(
    r"\b(?:(?:my\s+name\s+is|I\s+am|this\s+is)\s+Charles\s+Miller|"
    r"Charles\s+Miller[^.!?]{0,80}\bfor\s+the\s+(?:permanent\s+)?record|"
    r"for\s+the\s+(?:permanent\s+)?record[^.!?]{0,80}Charles\s+Miller)\b",
    re.I,
)
STAFF_MILLER_RE = re.compile(
    r"\bJennifer\b[^.!?]{0,120}\b(?:Mr\.?\s+Miller|Charles\s+Miller)\b|"
    r"\b(?:Mr\.?\s+Miller|Charles\s+Miller)\b[^.!?]{0,120}\bJennifer\b",
    re.I,
)
FLOOR_FOR_MILLER_RE = re.compile(
    r"\b(?:Mr\.?\s+Miller|Charles\s+Miller)\b[^.!?]{0,90}"
    r"\b(?:go\s+ahead|unmute|speak|you\s+have\s+the\s+floor)\b|"
    r"\b(?:go\s+ahead|unmute|speak|you\s+have\s+the\s+floor)\b[^.!?]{0,90}"
    r"\b(?:Mr\.?\s+Miller|Charles\s+Miller)\b",
    re.I,
)

# Specific physical-attendance actions. This excludes generic transitions such
# as "public comment in the room" and routine "come back to you" phrases.
DIRECT_IN_PERSON_ACTION_RE = re.compile(
    r"\b(?:come\s+(?:down|here|in\s+person|up(?:\s+to)?|visit(?:\s+with)?\s+us|meet\s+(?:with\s+)?(?:us|the\s+staff)|to\s+(?:our|the)\s+"
    r"(?:meetings?|meeting|committee|council|chambers?|office))|"
    r"appear(?:ing)?\s+(?:in\s+person|before|in\s+front\s+of)|show\s+up|"
    r"attend\s+in\s+person|(?:come\s+)?visit\s+us)\b",
    re.I,
)
PRONOUN_RE = re.compile(r"\b(?:he|him|his)\b", re.I)
INVITATION_RE = re.compile(
    r"\b(?:open\s+invite|invite(?:d|s)?|invitation|would\s+love\s+to\s+have)\b"
    r"[^.!?]{0,100}\b(?:come|visit|Miller|him|here)\b", re.I
)
CLAUSE_SPLIT_RE = re.compile(r"(?:>>|(?<=[.!?])\s+|[;\n]+)")

# Recording dates visible in the prior audit of pipeline/miller_interventions.json
# on main. A matching date marks possible overlap only, not event-level dedupe.
LEGACY_MILLER_INDEX_DATES = {
    "2026-01-12", "2026-01-14", "2026-01-20", "2026-01-26", "2026-02-09",
    "2026-03-09", "2026-04-13", "2026-04-20", "2026-04-21", "2026-04-27",
    "2026-05-05", "2026-05-11", "2026-05-26", "2026-06-01", "2026-06-08",
    "2026-06-15", "2026-06-22", "2026-07-06", "2026-07-13", "2026-07-27",
}


def parse_seconds(value: str) -> int:
    hours, minutes, secs = map(int, value.split(":"))
    return hours * 3600 + minutes * 60 + secs


def parse_cues(text: str) -> list[dict]:
    cues: list[dict] = []
    current: dict | None = None
    for line_number, line in enumerate(text.splitlines(), 1):
        match = CUE_RE.match(line.strip())
        if match:
            if current is not None:
                current["text"] = " ".join(current.pop("parts")).strip()
                cues.append(current)
            timecode = match.group(1)
            current = {
                "time": timecode,
                "seconds": parse_seconds(timecode),
                "line": line_number,
                "parts": [match.group(2)],
            }
        elif current is not None and line.strip():
            current["parts"].append(line.strip())
    if current is not None:
        current["text"] = " ".join(current.pop("parts")).strip()
        cues.append(current)
    return cues


def person_mentions(text: str) -> list[str]:
    mentions = []
    for match in MILLER_RE.finditer(text):
        # Miller Lane is a street/place reference in this corpus, not Charles Miller.
        if MILLER_LANE_RE.match(text, match.start()) or re.match(r"\s+Lane\b", text[match.end():], re.I):
            continue
        mentions.append(match.group(0))
    return mentions


def indices_near_references(reference_indices: set[int], size: int, radius: int) -> set[int]:
    near: set[int] = set()
    for reference in reference_indices:
        near.update(range(max(0, reference - radius), min(size, reference + radius + 1)))
    return near


def direct_in_person_relation(cues: list[dict], index: int, reference_indices: set[int]) -> bool:
    """True only for a targeted physical-attendance phrase near Miller context."""
    content = cues[index]["text"]
    clauses = [part.strip() for part in CLAUSE_SPLIT_RE.split(content) if part.strip()]
    prior_refs = [ref for ref in reference_indices if 0 < index - ref <= 3]
    prior_context = " ".join(cues[ref]["text"] for ref in range(max(0, index - 3), index))
    has_ask_you_lead = bool(re.search(
        r"\b(?:ask(?:ed)?\s+you|invite(?:d)?\s+you|please.{0,40}ask\s+you)\b",
        prior_context, re.I
    ))
    has_named_conditional_lead = bool(re.search(
        r"\b(?:Mr\.?\s+Miller|Charles\s+Miller|Miller)\b[^.!?]{0,70}"
        r"\b(?:want(?:s|ed)?\s+to|would\s+like\s+to|if\s+he)\b",
        prior_context, re.I
    ))
    for clause in clauses:
        if not DIRECT_IN_PERSON_ACTION_RE.search(clause):
            continue
        if person_mentions(clause):
            return True
        # Third-person references can carry forward a recently named subject.
        if any(0 < index - ref <= 2 for ref in reference_indices) and PRONOUN_RE.search(clause):
            return True
        # Keep second-person questions/requests and caption-split lead-ins narrow.
        if any(0 < index - ref <= 1 for ref in reference_indices) and re.search(
            r"\b(?:you\s+from|you\s+to|you\s+(?:can|could|should|must|need))\b",
            clause, re.I
        ):
            return True
        if prior_refs and has_named_conditional_lead:
            return True
        if prior_refs and has_ask_you_lead:
            return True
    # An explicit invitation may put Miller and the invitation in separate
    # clauses of the same auto-caption cue.
    return bool(person_mentions(content) and INVITATION_RE.search(content)
                and DIRECT_IN_PERSON_ACTION_RE.search(content))


def context_snippet(cues: list[dict], index: int, radius: int = 2) -> list[dict]:
    return [
        {"time": cues[i]["time"], "line": cues[i]["line"], "text": cues[i]["text"]}
        for i in range(max(0, index - radius), min(len(cues), index + radius + 1))
    ]


def classify_meeting(meeting: dict) -> tuple[list[dict], dict | None, dict | None]:
    transcript_name = meeting.get("file")
    if not transcript_name:
        return [], None, {
            "date": meeting.get("date"), "body": meeting.get("body"),
            "youtube_id": meeting.get("youtube_id"), "status": "no_transcript_available",
            "reason": meeting.get("note", "catalog has no transcript path"),
        }

    transcript_path = ROOT / "cheyenne-2026-transcripts" / transcript_name
    if not transcript_path.is_file():
        return [], {"date": meeting.get("date"), "file": transcript_name, "error": "transcript file missing"}, None

    text = transcript_path.read_text(encoding="utf-8", errors="replace")
    cues = parse_cues(text)
    if not cues:
        return [], {"date": meeting.get("date"), "file": transcript_name, "error": "no timestamp cues"}, None

    video_match = VIDEO_RE.search(text)
    video_id = meeting.get("youtube_id") or (video_match.group(1) if video_match else None)
    if video_match and meeting.get("youtube_id") and meeting["youtube_id"] != video_match.group(1):
        return [], {
            "date": meeting.get("date"), "file": transcript_name,
            "error": f"catalog video ID {meeting['youtube_id']} differs from transcript header {video_match.group(1)}",
        }, None

    reference_indices = {i for i, cue in enumerate(cues) if person_mentions(cue["text"])}
    if not reference_indices:
        return [], None, None
    context_window = indices_near_references(reference_indices, len(cues), radius=2)
    search_window = indices_near_references(reference_indices, len(cues), radius=3)

    events: list[dict] = []
    date_value = meeting.get("date", "")
    body = meeting.get("body", "unknown")
    title = text.splitlines()[0].lstrip("# ").strip() if text.splitlines() else ""
    for i, cue in enumerate(cues):
        content = cue["text"]
        mentions = person_mentions(content)
        categories: list[str] = []
        if mentions:
            categories.append("explicit_miller_reference")
        elif i in context_window:
            # Preserve nearby turns even when captions do not repeat the name;
            # this is context, not a machine finding that the turn is a reply.
            categories.append("interaction_context_near_explicit_reference")

        if mentions and SELF_INTRO_RE.search(content):
            categories.append("possible_self_introduction_or_record_identification")
        if mentions and GREETING_FOR_MILLER_RE.search(content) and not SELF_INTRO_RE.search(content):
            categories.append("possible_greeting_phrase_near_miller")
        if i in search_window and STAFF_MILLER_RE.search(content):
            categories.append("possible_staff_recognition")
        if i in search_window and FLOOR_FOR_MILLER_RE.search(content):
            categories.append("possible_floor_recognition")

        if i in search_window and PATTERNS["remote"].search(content):
            categories.append("remote_attendance_procedure_or_reference_near_miller")
        if i in search_window and PATTERNS["in_person_procedure"].search(content):
            categories.append("in_person_procedure_near_miller")
        if i in search_window and direct_in_person_relation(cues, i, reference_indices):
            categories.append("possible_direct_in_person_request_or_preference")
        if i in search_window and PATTERNS["remote_objection"].search(content):
            categories.append("possible_remote_attendance_objection")

        for label, output_label in (
            ("time_limit_or_interruption", "possible_time_limit_or_interruption_near_miller"),
            ("out_of_order_or_relevance", "possible_out_of_order_or_relevance_ruling_near_miller"),
            ("timer_adjustment", "possible_timer_adjustment_near_miller"),
            ("possible_reply_or_correction", "possible_reply_or_correction_near_miller"),
        ):
            if i in search_window and PATTERNS[label].search(content):
                categories.append(output_label)

        categories = list(dict.fromkeys(categories))
        if not categories:
            continue

        seconds = cue["seconds"]
        source_url = f"https://www.youtube.com/watch?v={video_id}&t={seconds}s" if video_id else None
        events.append({
            "event_id": f"{date_value}:{body}:{cue['time']}:{cue['line']}",
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
            "explicit_name_forms_in_cue": mentions,
            "name_is_in_this_cue": bool(mentions),
            "within_three_cues_of_explicit_reference": i in search_window,
            "speaker_attribution": "not inferred from caption cue",
            "legacy_miller_index_date_overlap": date_value in LEGACY_MILLER_INDEX_DATES,
            "cue_text": content,
            "context_cues": context_snippet(cues, i, radius=2),
            "review_note": "Confirm the speaker, complete sentence, agenda item, audiovisual timing, and whether this concerns Charles Miller rather than a caption error. Proximity is not proof that a ruling, timer phrase, or response was directed at him. Captions alone do not establish motive, a legal violation, or timer credit."
        })

    return events, None, None


def write_outputs(events: list[dict], errors: list[dict], unavailable: list[dict], outdir: Path,
                  catalog_count: int, transcript_count: int) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    events.sort(key=lambda e: (e["date"], e["body"], e["timestamp_seconds"], e["source_line"]))
    jsonl_path = outdir / "candidate_events.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as output:
        for event in events:
            output.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")

    by_category: Counter = Counter(category for event in events for category in event["categories"])
    by_date: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for event in events:
        by_date[(event["date"], event["body"])].append(event)

    direct_in_person = [e for e in events if "possible_direct_in_person_request_or_preference" in e["categories"]]
    remote_objections = [e for e in events if "possible_remote_attendance_objection" in e["categories"]]
    recognition = [e for e in events if set(e["categories"]) & {
        "possible_staff_recognition", "possible_greeting_phrase_near_miller"
    }]
    targeted = outdir / "targeted_review_queue.md"
    targeted_lines = [
        "# Phase 2 — focused audiovisual review queue",
        "",
        "All items below are transcript-search candidates only. Speaker identity and event status are not verified. Use the linked official recording and the full context in `candidate_events.jsonl`.",
        "",
        f"## Possible targeted in-person requests/preferences ({len(direct_in_person)})",
        "",
    ]
    def append_candidate_list(rows: list[dict]) -> None:
        if not rows:
            targeted_lines.append("- No candidate cues matched this text pattern. This is not proof that none occurred.")
            targeted_lines.append("")
            return
        for row in rows:
            cue = " ".join(row["cue_text"].split())
            excerpt = cue if len(cue) <= 420 else cue[:417] + "…"
            excerpt = excerpt.replace("|", "\\|")
            video = f"[official video {row['timestamp']}]({row['source_link']})" if row.get("source_link") else f"{row['timestamp']} (no video ID in catalog)"
            transcript = f"[transcript line {row['source_line']}](../../{row['transcript']}#L{row['source_line']})"
            categories = ", ".join(f"`{c}`" for c in row["categories"] if c in {
                "possible_direct_in_person_request_or_preference", "possible_remote_attendance_objection",
                "possible_staff_recognition", "possible_greeting_phrase_near_miller"
            })
            targeted_lines.append(
                f"- **{row['date']} · {row['body']} · {row['timestamp']}** — {categories}; {video}; {transcript}. "
                f"Caption cue: “{excerpt}”"
            )
        targeted_lines.append("")

    append_candidate_list(direct_in_person)
    targeted_lines.extend([f"## Possible remote-attendance objections ({len(remote_objections)})", ""])
    append_candidate_list(remote_objections)
    targeted_lines.extend([f"## Possible staff recognition / greeting phrases near Miller ({len(recognition)})", ""])
    append_candidate_list(recognition)
    targeted.write_text("\n".join(targeted_lines), encoding="utf-8")

    overlapping_cues = sum(e["legacy_miller_index_date_overlap"] for e in events)
    overlap_meetings = sum(rows[0]["legacy_miller_index_date_overlap"] for rows in by_date.values())
    summary = [
        "# Phase 2 — Miller record-interaction candidate ledger",
        "",
        "Generated by `video-production/scan_interactions.py` from `cheyenne-2026-transcripts/meetings.json` and the timestamped Markdown transcripts.",
        "",
        f"- Meeting catalog entries: **{catalog_count}**",
        f"- Transcript-bearing entries scanned: **{transcript_count}**",
        f"- Machine candidate cue records (including adjacent context-only cues): **{len(events)}**",
        f"- Meetings with candidate records: **{len(by_date)}**",
        f"- Candidate records on dates represented in the prior 616-row index: **{overlapping_cues}** (date overlap only; not event-level deduplication)",
        f"- Meetings with candidate records on one of the prior index's 20 dates: **{overlap_meetings}**",
        f"- Transcript scan errors: **{len(errors)}**",
        f"- Catalog entries unavailable to caption search: **{len(unavailable)}**",
        "- Detailed source-linked ledger: [`candidate_events.jsonl`](candidate_events.jsonl)",
        "- Focused in-person/recognition shortlist: [`targeted_review_queue.md`](targeted_review_queue.md)",
        "",
        "## Candidate-category counts",
        "",
        "| Category | Candidate cues |",
        "|---|---:|",
    ]
    for category, count in sorted(by_category.items()):
        summary.append(f"| `{category}` | {count} |")
    timer_adjustments = [e for e in events if "possible_timer_adjustment_near_miller" in e["categories"]]
    if timer_adjustments:
        summary.extend([
            "",
            "**Timer-keyword caution:** The only timer-adjustment keyword cue in the Miller-proximity window names Councilman Laybourn and says “credit me a little bit of time.” On caption text alone it appears to concern Laybourn, not Miller; it is not evidence of Miller receiving or losing time.",
        ])
    summary.extend([
        "",
        "## Meeting-level review queue",
        "",
        "| Date | Body | Candidate cues | Category types | Legacy-date overlap | Source transcript |",
        "|---|---|---:|---|---|---|",
    ])
    for (meeting_date, body), rows in sorted(by_date.items()):
        categories = sorted({category for row in rows for category in row["categories"]})
        transcript = rows[0]["transcript"]
        summary.append(
            f"| {meeting_date} | {body} | {len(rows)} | {', '.join(f'`{c}`' for c in categories)} | "
            f"{'yes' if rows[0]['legacy_miller_index_date_overlap'] else 'no'} | [`{Path(transcript).name}`](../../{transcript}) |"
        )
    summary.extend([
        "",
        "## Legacy-index overlap interpretation",
        "",
        "The previously audited `main` index contains 616 caption-aligned records on 20 recording dates from January 12 through July 27, 2026. This checkout does not contain that JSON file, so the comparison here uses those 20 dates only. `legacy_miller_index_date_overlap` means a candidate is on one of those dates; it does **not** establish that the exact cue, response, or moment is already in the index or in a rendered video. The date-level overlap is useful for prioritizing deduplication against the prior montage/index.",
        "",
        "The ledger retains the explicit-reference cue and nearby caption cues (up to two before and after) to preserve possible question/response context when the name is not repeated. These neighboring records are **not** automatically classified as replies. `remote_attendance_procedure_or_reference_near_miller`, `in_person_procedure_near_miller`, timer, ruling, and reply categories are proximity-based unless their cue text directly makes the relationship clear; read the cue and context before assigning an event.",
        "",
        "## Limits and review requirements",
        "",
        "This is a broad **candidate search**, not an exhaustive human finding. Auto-captions can miss speakers, merge voices, mishear names, and place multiple turns in a single cue. A reference cue or nearby timer phrase does not prove an interruption, a rule's application, who caused elapsed time, or whether time was restored. `possible_direct_in_person_request_or_preference` is a text-search lead, not a finding that an official demanded anything or that remote participation was improper.",
        "",
        "For court-facing work, review each candidate against the original recording, note the agenda item and exact beginning/end, identify the speaker only when visually/audibly supported, capture timer behavior where present, and record the source master hash. Do not promote caption-derived language into verified fact. Timer credit, lost time, legality, and motive cannot be inferred from captions alone.",
        "",
    ])
    if unavailable:
        summary.extend(["## Catalog entries unavailable to caption search", ""])
        for row in unavailable:
            youtube = f"https://www.youtube.com/watch?v={row['youtube_id']}" if row.get("youtube_id") else ""
            source = f" — [official video]({youtube})" if youtube else ""
            summary.append(f"- {row.get('date')} {row.get('body')}: {row.get('reason', 'no transcript available')}{source}")
        summary.append("")
    if errors:
        summary.extend(["## Scan errors", ""])
        for error in errors:
            summary.append(f"- {error.get('date')} `{error.get('file')}`: {error.get('error')}")
        summary.append("")

    (outdir / "summary.md").write_text("\n".join(summary), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", default=str(DEFAULT_CATALOG), help="meeting catalog path relative to repo root")
    parser.add_argument("--outdir", default=str(DEFAULT_OUTDIR), help="output directory relative to repo root")
    args = parser.parse_args()
    catalog_path = (ROOT / args.catalog).resolve()
    outdir = (ROOT / args.outdir).resolve()
    if not catalog_path.is_relative_to(ROOT) or not outdir.is_relative_to(ROOT):
        parser.error("catalog/output paths must remain under the repository root")
    meetings = json.loads(catalog_path.read_text(encoding="utf-8"))
    events: list[dict] = []
    errors: list[dict] = []
    unavailable: list[dict] = []
    transcript_count = 0
    for meeting in meetings:
        if meeting.get("file"):
            transcript_count += 1
        try:
            found, error, skipped = classify_meeting(meeting)
        except Exception as exc:
            found, error, skipped = [], {
                "date": meeting.get("date"), "file": meeting.get("file"),
                "error": f"unexpected scanner error: {exc}"
            }, None
        events.extend(found)
        if error:
            errors.append(error)
        if skipped:
            unavailable.append(skipped)
    write_outputs(events, errors, unavailable, outdir, len(meetings), transcript_count)
    print(f"Scanned {transcript_count} transcript-bearing entries from {len(meetings)} catalog rows; wrote {len(events)} candidate cue records")
    print(f"Summary: {(outdir / 'summary.md').relative_to(ROOT)}")
    if unavailable:
        print(f"Unavailable to caption search: {len(unavailable)} catalog entries")
    if errors:
        print(f"Warning: {len(errors)} source/path or transcript scan errors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
