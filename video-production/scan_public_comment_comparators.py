#!/usr/bin/env python3
"""Index public-comment comparator candidates from the transcript corpus.

This is a recall-oriented text scan. It does not count public-comment slots,
identify speakers from video, establish a viewpoint, or decide whether two
speakers are similarly situated. All hits need source-video and rule review.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from scan_interactions import parse_cues, person_mentions

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = Path("cheyenne-2026-transcripts/meetings.json")
DEFAULT_OUTDIR = Path("video-production/phase-03-public-comment-comparators")
VIDEO_RE = re.compile(r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})")

# Deliberately specific gate markers. A matched cue can be a transition, a
# question to the room, or a closing cue—not proof that a comment slot occurred.
PUBLIC_COMMENT_GATE_RE = re.compile(
    r"\b(?:"
    r"(?:go\s+out|go|move|return|turn|open(?:\s+it)?(?:\s+up)?|reopen|close|closing)"
    r"\s+(?:out\s+)?(?:for|to|into)?\s*(?:the\s+)?public\s+comments?"
    r"|(?:any|any\s+other|any\s+further|no\s+further|no\s+other|additional|one\s+more)"
    r"\s+(?:public\s+)?comments?"
    r"|public\s+comments?\s+(?:is|are|was|were|will\s+be)\s+(?:now\s+)?(?:open|closed)"
    r"|public\s+comments?\s+(?:from\s+the\s+floor|online|in\s+the\s+room|on\s+this\s+item)"
    r"|time\s+for\s+public\s+comments?"
    r")\b",
    re.I,
)
COMMENT_CAP_RE = re.compile(
    r"\b(?:"
    r"(?:only\s+)?one\s+(?:public\s+)?comment\s+per\s+(?:person|speaker|individual|item)"
    r"|one\s+comment\s+from\s+each\s+(?:person|speaker|individual)"
    r"|(?:each|every)\s+(?:person|speaker)\s+(?:gets|has|is\s+allowed)\s+(?:one|a\s+single)\s+(?:comment|turn)"
    r"|(?:you|each\s+speaker|each\s+person)\s+(?:(?:can|may|are\s+allowed\s+to)\s+)?(?:only\s+)?(?:speak\s+once|make\s+one\s+comment|have\s+one\s+turn)"
    r"|(?:three|3)[- ]minute\s+(?:limit|maximum|rule)"
    r"|(?:limit(?:ing)?|limited|cap(?:ped)?|set)\b[^.!?]{0,70}\b(?:three|3)\s+minutes?"
    r"|(?:three|3)\s+minutes?\s+(?:per\s+(?:person|speaker|comment)|each)"
    r"|(?:three|3)\s+minutes?\s+each"
    r"|limited\s+to\s+(?:three|3)\s+minutes?"
    r"|one\s+opportunity\s+to\s+speak"
    r"|one\s+time\s+(?:for|per)\s+(?:everyone|everybody|each\s+(?:person|speaker))"
    r"|(?:we(?:['’]re|\s+are)\s+(?:just\s+)?(?:going|gonna)\s+to\s+have)\s+one\s+time\s+for\s+(?:everyone|everybody)"
    r"|(?:have|has|had)\s+(?:you|he|she|they|[A-Z][A-Za-z'’\-]+)\s+already\s+(?:spoken|spoke|commented)(?:\s+on\s+(?:this|the)\s+(?:issue|item|amendment))?"
    r"|(?:if\s+)?(?:you(?:['’]ve|\s+have)|he(?:['’]s|\s+has)|she(?:['’]s|\s+has)|they(?:['’]ve|\s+have))\s+already\s+(?:spoken|spoke|commented)(?:\s+on\s+(?:this|the)\s+(?:issue|item|amendment))?"
    r"|already\s+(?:spoke|spoken|commented)\s+(?:on\s+(?:this|the)\s+(?:issue|item|amendment)|before|once)"
    r"|cannot\s+speak\s+(?:more\s+than\s+once|twice)"
    r")\b",
    re.I,
)
COMMENT_OPPORTUNITY_RE = re.compile(
    r"\b(?:at\s+least\s+|about\s+|approximately\s+)?"
    r"(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)"
    r"(?:\s+(?:to|-)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+))?"
    r"\s+(?:different\s+)?opportunit(?:y|ies)\s+(?:for\s+(?:the\s+)?public\s+"
    r"(?:comments?|to\s+(?:comment|participate))|for\s+public\s+participation)\b"
    r"|\b(?:multiple|several|additional)\s+opportunit(?:y|ies)\s+for\s+(?:the\s+)?public\s+"
    r"(?:comments?|to\s+(?:comment|participate))\b",
    re.I,
)
TIME_CALL_RE = re.compile(
    r"\b(?:"
    r"your\s+time\s+(?:is|has\s+been|was)\s+up"
    r"|time\s+(?:is|has|was)\s+up|time's\s+up|time\s+has\s+expired|time\s+expired|"
    r"out\s+of\s+time|you\s+have\s+(?:three|3|one|1|two|2|four|4)\s+minutes?"
    r"|(?:three|3)[- ]minute\s+(?:limit|maximum|time)"
    r"|(?:three|3)\s+minutes?\s+(?:each|to\s+speak|for\s+(?:your|public)\s+comment)"
    r"|(?:one|two|three|four|five|ten|\d+)\s+seconds?\s+(?:left|remaining)"
    r"|(?:one|two|three|four|five|\d+)\s+minutes?\s+(?:left|remaining)"
    r"|you(?:'ve|\s+have)\s+(?:used|spoken\s+for)\s+(?:three|3|four|4)\s+minutes?"
    r")\b",
    re.I,
)
TOPIC_RULING_RE = re.compile(
    r"\b(?:out\s+of\s+order|not\s+germane|off[- ]topic|not\s+relevant|irrelevant|"
    r"not\s+on\s+(?:the\s+)?topic|back\s+to\s+(?:the\s+)?(?:item|topic)|"
    r"does(?:n't|\s+not)\s+(?:relate|have\s+to\s+do)\s+with\s+(?:this\s+)?(?:item|topic)|"
    r"stick\s+to\s+(?:the\s+)?(?:item|topic)|way\s+off\s+topic)\b",
    re.I,
)
CRITICISM_RE = re.compile(
    r"\b(?:illegal|illegally|unlawful|unconstitution(?:al|ally)|violation|violat(?:e|ed|ing)|"
    r"misconduct|corrupt(?:ion)?|fraud(?:ulent)?|discriminat(?:ion|e|ory)|retaliat(?:ion|e)|"
    r"due\s+process|first\s+amendment|public\s+meetings\s+act|abuse\s+of\s+(?:power|discretion)|"
    r"conflict\s+of\s+interest|negligent|mismanagement|improper(?:ly)?|silenc(?:e|ed|ing)|"
    r"denied\s+(?:me|the\s+public|a\s+citizen|public\s+comment)|transparency|accountability|"
    r"NDA|non[- ]disclosure\s+agreement|ethic(?:s|al)|failed\s+to\s+(?:follow|comply|disclose)|"
    r"viewpoint\s+discrimination|equal\s+protection|arbitrary\s+and\s+capricious)\b",
    re.I,
)
GOVERNMENT_SUBJECT_RE = re.compile(
    r"\b(?:mayor|council|councilor|city|staff|administration|administrator|department|"
    r"city\s+attorney|city\s+clerk|committee|commission|board|governing\s+body|officials?)\b",
    re.I,
)
LEADS_RE = re.compile(
    r"\b(?:Cheyenne\s+Lead(?:s|ed[s]?)|Betsy\s+Hail|Michelle\s+Zimmerman|"
    r"Dante\s+Rust(?:in|on)|Dante\s+Riston|Jeff\s+Pope)\b",
    re.I,
)
DEVELOPMENT_ENTITY_RE = re.compile(
    r"\b(?:Microsoft|Meta|PRCA|Project\s+Blue\s+Moon|Blue\s+Moon|(?:Via\s+West\s+)?Skybox|"
    r"CyrusOne|Vantage|CloudHQ|Wyoming\s+Hyperscale|Hensel\s+Phelps|"
    r"Bison\s+Business\s+Park|Hitching\s+Post(?:\s+District)?|Cheyenne\s+Leads|"
    r"Tremble\s+Crow(?:\s+Company)?)\b",
    re.I,
)
APPLICANT_ROLE_RE = re.compile(
    r"\b(?:"
    r"(?:agent|representative|attorney|counsel|consultant|contractor)\s+(?:for|of)"
    r"|(?:on\s+behalf\s+of|representing)\s+(?:the\s+)?(?:applicant|owner|developer|project|company|client|property)\b"
    r"|(?:applicant|developer)\s+(?:for|of)"
    r"|(?:project|land\s+development)\s+(?:manager|representative|team)\s+(?:for|of)"
    r"|(?:owner|landowner)['’]s\s+(?:agent|representative)"
    r"|my\s+client"
    r")\b",
    re.I,
)
AFFILIATION_TO_ENTITY_RE = re.compile(
    r"\b(?:CEO|chief\s+executive|president|chair(?:man|woman)?|director|manager|"
    r"representative|agent|attorney|counsel|partner|consultant|contractor|employee|"
    r"project\s+manager|land\s+development|community\s+affairs\s+team)\b"
    r"[^.!?]{0,100}\b(?:Microsoft|Meta|PRCA|Project\s+Blue\s+Moon|Blue\s+Moon|(?:Via\s+West\s+)?Skybox|"
    r"CyrusOne|Vantage|CloudHQ|Wyoming\s+Hyperscale|Hensel\s+Phelps|"
    r"Bison\s+Business\s+Park|Hitching\s+Post(?:\s+District)?|Cheyenne\s+Leads|"
    r"Tremble\s+Crow(?:\s+Company)?)\b"
    r"|\b(?:Microsoft|Meta|PRCA|Project\s+Blue\s+Moon|Blue\s+Moon|(?:Via\s+West\s+)?Skybox|"
    r"CyrusOne|Vantage|CloudHQ|Wyoming\s+Hyperscale|Hensel\s+Phelps|"
    r"Bison\s+Business\s+Park|Hitching\s+Post(?:\s+District)?|Cheyenne\s+Leads|"
    r"Tremble\s+Crow(?:\s+Company)?)\b[^.!?]{0,100}"
    r"\b(?:CEO|chief\s+executive|president|chair(?:man|woman)?|director|manager|"
    r"representative|agent|attorney|counsel|partner|consultant|contractor|employee|"
    r"project\s+manager|land\s+development|community\s+affairs\s+team)\b"
    r"|\b(?:I\s+am|I['’]m|I\s+work\s+(?:for|with)|I\s+represent)\s+"
    r"(?:with\s+)?(?:Microsoft|Meta|PRCA|Project\s+Blue\s+Moon|Blue\s+Moon|(?:Via\s+West\s+)?Skybox|"
    r"CyrusOne|Vantage|CloudHQ|Wyoming\s+Hyperscale|Hensel\s+Phelps|"
    r"Bison\s+Business\s+Park|Hitching\s+Post(?:\s+District)?|Cheyenne\s+Leads|"
    r"Tremble\s+Crow(?:\s+Company)?)\b"
    r"|\b(?:on\s+behalf\s+of|representing)\s+(?:(?:the|uh)\s+)*(?:Microsoft|Meta|PRCA|"
    r"Project\s+Blue\s+Moon|Blue\s+Moon|(?:Via\s+West\s+)?Skybox|CyrusOne|Vantage|CloudHQ|"
    r"Wyoming\s+Hyperscale|Hensel\s+Phelps|Bison\s+Business\s+Park|"
    r"Hitching\s+Post(?:\s+District)?|Cheyenne\s+Leads|Tremble\s+Crow(?:\s+Company)?)\b"
    r"|\bmy\s+name\s+is\s+[A-Z][A-Za-z'’\-]+(?:\s+[A-Z][A-Za-z'’\-]+){0,3}\s+with\s+"
    r"(?:Microsoft|Meta|PRCA|Project\s+Blue\s+Moon|Blue\s+Moon|(?:Via\s+West\s+)?Skybox|CyrusOne|Vantage|"
    r"CloudHQ|Wyoming\s+Hyperscale|Hensel\s+Phelps|Bison\s+Business\s+Park|"
    r"Hitching\s+Post(?:\s+District)?|Cheyenne\s+Leads|Tremble\s+Crow(?:\s+Company)?)\b",
    re.I,
)
DIRECT_INTRO_PREFIX_RE = re.compile(
    r"\b(?:good\s+(?:morning|afternoon|evening)|hello|hi|thanks?|thank\s+you|"
    r"mr\.?\s+(?:chair(?:man)?|mayor)|madam(?:e)?\s+chair|chair(?:man|woman)?|"
    r"through\s+you|members\s+of\s+(?:the\s+)?(?:committee|council)|commissioners)\b",
    re.I,
)
SELF_ID_RE = re.compile(
    r"\b(?:my\s+name\s+is|I\s+am|I['’]m|for\s+the\s+(?:permanent\s+)?record|"
    r"on\s+behalf\s+of|representing)\b",
    re.I,
)
NAME_ROLE_PATTERN = re.compile(
    r"\b(?!(?:Mr\.?|Mrs\.?|Ms\.?|Madam|Madame|Mayor|Councilman|Councilwoman|"
    r"Commissioner|Chair|Dr\.?)\b)"
    r"(?P<name>[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,3})\s*,?\s+"
    r"(?:CEO|chief\s+executive|president|chair(?:man|woman)?|director|manager|"
    r"owner|representative|attorney|counsel|partner|consultant|agent)\b"
)
NAME_PATTERNS = [
    re.compile(r"\bMy\s+name\s+is\s+(?P<name>[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})"),
    re.compile(r"\bI\s+am\s+(?P<name>[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})\b"),
    re.compile(r"\bI['’]m\s+(?P<name>[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})\b"),
    re.compile(
        r"\bfor\s+the\s+(?:permanent\s+)?record[, ]+"
        r"(?!(?:Mr\.?|Mrs\.?|Ms\.?|Madam|Madame|Mayor|Councilman|Councilwoman|"
        r"Commissioner|Chair|Dr\.?)\b)"
        r"(?P<name>[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})"
    ),
]
ITEM_RE = re.compile(
    r"\b(?:agenda\s+)?item(?:\s+(?:number|no\.?))?\s+(\d{1,2}[A-Z]?(?:\.\d+)?|[A-Z])\b",
    re.I,
)


def parse_seconds(value: str) -> int:
    hours, minutes, seconds = map(int, value.split(":"))
    return hours * 3600 + minutes * 60 + seconds


def extract_names(text: str) -> list[str]:
    names: list[str] = []
    for pattern in [*NAME_PATTERNS, NAME_ROLE_PATTERN]:
        for match in pattern.finditer(text):
            name = " ".join(match.group("name").split()).strip(" ,.;:")
            normalized = name.casefold()
            if (name and name not in names and normalized not in {
                "charles miller", "miller", "i", "i'm", "im", "we", "we're",
                "we’re", "he", "she", "they", "you", "my",
            }):
                names.append(name)
    return names


def applicant_role_near_identification(cues: list[dict], index: int, max_chars: int = 220) -> bool:
    """Avoid linking a speaker's name to a role mentioned later in unrelated context."""
    text = cues[index]["text"]
    if index + 1 < len(cues):
        text += " " + cues[index + 1]["text"]
    identity_positions = [
        match.start()
        for pattern in [*NAME_PATTERNS, NAME_ROLE_PATTERN]
        for match in pattern.finditer(text)
    ]
    if not identity_positions:
        return False
    return any(
        min(abs(role.start() - position) for position in identity_positions) <= max_chars
        for role in APPLICANT_ROLE_RE.finditer(text)
    )


def match_current_or_crossing(pattern: re.Pattern, cues: list[dict], index: int):
    """Match this cue or a phrase that starts here and continues next cue."""
    current = cues[index]["text"]
    match = pattern.search(current)
    if match:
        return match
    if index + 1 < len(cues):
        combined = current + " " + cues[index + 1]["text"]
        match = pattern.search(combined)
        if match and match.start() < len(current):
            return match
    return None


def cue_context(cues: list[dict], index: int, radius: int = 2) -> list[dict]:
    return [
        {"time": cues[i]["time"], "line": cues[i]["line"], "text": cues[i]["text"]}
        for i in range(max(0, index - radius), min(len(cues), index + radius + 1))
    ]


def nearest_gate(cues: list[dict], gate_indices: list[int], index: int, limit_seconds: int = 300) -> dict | None:
    candidates = []
    for gate_index in gate_indices:
        delta = cues[gate_index]["seconds"] - cues[index]["seconds"]
        if abs(delta) <= limit_seconds:
            # Prefer a preceding gate over an equally close following gate.
            candidates.append((abs(delta), 0 if delta <= 0 else 1, delta, gate_index))
    if not candidates:
        return None
    _, _, delta, gate_index = min(candidates)
    return {
        "time": cues[gate_index]["time"],
        "seconds": cues[gate_index]["seconds"],
        "source_line": cues[gate_index]["line"],
        "seconds_from_candidate": delta,
        "text": cues[gate_index]["text"],
    }


def nearby_item_refs(cues: list[dict], index: int, radius: int = 2) -> list[dict]:
    refs = []
    for i in range(max(0, index - radius), min(len(cues), index + radius + 1)):
        for match in ITEM_RE.finditer(cues[i]["text"]):
            entry = {"item_text": match.group(0), "time": cues[i]["time"], "source_line": cues[i]["line"]}
            if entry not in refs:
                refs.append(entry)
    return refs


def meeting_candidates(meeting: dict) -> tuple[list[dict], dict | None, dict | None]:
    transcript_name = meeting.get("file")
    if not transcript_name:
        return [], None, {
            "date": meeting.get("date"), "body": meeting.get("body"),
            "youtube_id": meeting.get("youtube_id"), "reason": meeting.get("note", "no transcript path"),
        }
    transcript_path = ROOT / "cheyenne-2026-transcripts" / transcript_name
    if not transcript_path.is_file():
        return [], {"date": meeting.get("date"), "file": transcript_name, "error": "transcript missing"}, None

    text = transcript_path.read_text(encoding="utf-8", errors="replace")
    cues = parse_cues(text)
    if not cues:
        return [], {"date": meeting.get("date"), "file": transcript_name, "error": "no timestamp cues"}, None
    header_match = VIDEO_RE.search(text)
    video_id = meeting.get("youtube_id") or (header_match.group(1) if header_match else None)
    if header_match and meeting.get("youtube_id") and header_match.group(1) != meeting["youtube_id"]:
        return [], {"date": meeting.get("date"), "file": transcript_name, "error": "catalog/header YouTube ID mismatch"}, None

    title = text.splitlines()[0].lstrip("# ").strip() if text.splitlines() else ""
    date_value = str(meeting.get("date", "unknown"))
    body = meeting.get("body", "unknown")
    miller_ref_indices = {i for i, cue in enumerate(cues) if person_mentions(cue["text"])}
    miller_window = {
        j for ref in miller_ref_indices
        for j in range(max(0, ref - 3), min(len(cues), ref + 4))
    }
    gate_indices = [i for i, cue in enumerate(cues) if PUBLIC_COMMENT_GATE_RE.search(cue["text"])]

    events: list[dict] = []
    for i, cue in enumerate(cues):
        content = cue["text"]
        context = cue_context(cues, i, 2)
        context_text = " ".join(row["text"] for row in context)
        near_gate = nearest_gate(cues, gate_indices, i)
        item_refs = nearby_item_refs(cues, i, 2)
        speaker_names = extract_names(context_text)
        speaker_names_in_cue = extract_names(content)
        self_id_in_cue = bool(SELF_ID_RE.search(content))
        categories: list[str] = []
        gate_match = PUBLIC_COMMENT_GATE_RE.search(content)
        cap_match = match_current_or_crossing(COMMENT_CAP_RE, cues, i)
        opportunity_match = match_current_or_crossing(COMMENT_OPPORTUNITY_RE, cues, i)
        time_match = TIME_CALL_RE.search(content)
        topic_match = TOPIC_RULING_RE.search(content)
        critique_match = CRITICISM_RE.search(content)
        leads_matches = [m.group(0) for m in LEADS_RE.finditer(content)]
        development_entities = [m.group(0) for m in DEVELOPMENT_ENTITY_RE.finditer(context_text)]
        has_self_id = self_id_in_cue
        has_applicant_role = applicant_role_near_identification(cues, i)
        role_match = NAME_ROLE_PATTERN.search(content)
        role_prefix = content[:role_match.start()] if role_match else ""
        explicit_role_intro = bool(role_match) and (
            not role_prefix.strip(" >") or bool(DIRECT_INTRO_PREFIX_RE.search(role_prefix))
        )
        has_development_affiliation_link = any(
            AFFILIATION_TO_ENTITY_RE.search(cues[j]["text"])
            for j in range(max(0, i - 1), min(len(cues), i + 2))
        )
        identity_evidence = bool(speaker_names_in_cue) and (
            has_self_id or explicit_role_intro or has_development_affiliation_link
        )
        near_miller = i in miller_window
        has_comment_proximity = near_gate is not None

        if gate_match:
            categories.append("possible_public_comment_gate_or_transition")
        if cap_match:
            categories.append("possible_comment_cap_or_time_rule_statement")
        if opportunity_match:
            categories.append("possible_number_of_public_comment_opportunities_claim")
        if leads_matches:
            categories.append("cheyenne_leads_or_associated_person_reference")
        if identity_evidence and has_comment_proximity:
            categories.append("possible_speaker_identification_near_comment_gate")
        if (identity_evidence and has_comment_proximity and
                (has_applicant_role or has_development_affiliation_link)):
            categories.append("possible_applicant_or_developer_affiliation_near_comment_gate")
        if time_match and not near_miller:
            categories.append("possible_time_limit_or_call_outside_miller_window")
        if topic_match and not near_miller:
            categories.append("possible_topic_or_relevance_ruling_outside_miller_window")
        if critique_match and near_gate and not near_miller:
            categories.append("possible_public_comment_criticism_near_gate_outside_miller_window")

        categories = list(dict.fromkeys(categories))
        if not categories:
            continue

        seconds = cue["seconds"]
        source_url = f"https://www.youtube.com/watch?v={video_id}&t={seconds}s" if video_id else None
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
            "explicit_miller_name_in_cue": bool(person_mentions(content)),
            "within_three_cues_of_explicit_miller_reference": near_miller,
            "public_comment_gate_nearby": near_gate,
            "possible_speaker_names_from_caption_patterns": speaker_names,
            "possible_speaker_names_in_this_cue": speaker_names_in_cue,
            "development_entities_in_context": list(dict.fromkeys(development_entities)),
            "government_subject_markers_in_context": list(dict.fromkeys(
                m.group(0) for m in GOVERNMENT_SUBJECT_RE.finditer(context_text)
            )),
            "agenda_item_references_in_context": item_refs,
            "pattern_matches": {
                "public_comment_gate": gate_match.group(0) if gate_match else None,
                "comment_cap_or_time_rule": cap_match.group(0) if cap_match else None,
                "comment_opportunity_count": opportunity_match.group(0) if opportunity_match else None,
                "time_limit_or_call": time_match.group(0) if time_match else None,
                "topic_or_relevance": topic_match.group(0) if topic_match else None,
                "criticism_keywords": critique_match.group(0) if critique_match else None,
                "leads_names_or_affiliation": leads_matches,
            },
            "speaker_attribution": "not inferred from transcript captions",
            "cue_text": content,
            "context_cues": context,
            "review_note": "Check the linked recording, agenda item, exact speaker, and meeting rule. Gate proximity means the nearest matched phrase within 300 seconds; it does not establish a same-turn or same-speaker link. A nearby public-comment gate does not establish that this cue is public comment, that a slot was granted, or that an applicant received preferential treatment. Separate a proposal/applicant presentation from public-comment testimony. Phase 2 retains Miller-window interaction candidates; time/topic comparison tags here are outside three cues of an explicit Miller reference only, not proof of a non-Miller speaker."
        })

    return events, None, None


def write_outputs(events: list[dict], errors: list[dict], unavailable: list[dict],
                  outdir: Path, catalog_count: int, transcript_count: int) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    events.sort(key=lambda e: (e["date"], e["body"], e["timestamp_seconds"], e["source_line"]))
    jsonl_path = outdir / "candidate_events.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as fp:
        for event in events:
            fp.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")

    by_category: Counter = Counter(cat for event in events for cat in event["categories"])
    by_meeting: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for event in events:
        by_meeting[(event["date"], event["body"])].append(event)
    leads_events = [e for e in events if "cheyenne_leads_or_associated_person_reference" in e["categories"]]
    applicant_events = [e for e in events if "possible_applicant_or_developer_affiliation_near_comment_gate" in e["categories"]]
    cap_events = [e for e in events if set(e["categories"]) & {
        "possible_comment_cap_or_time_rule_statement", "possible_number_of_public_comment_opportunities_claim"
    }]

    # A focused queue exposes the most relevant LEADS/applicant and explicit
    # opportunity/cap cues without replacing the full JSONL timeline.
    selected = {}
    for event in events:
        if ("cheyenne_leads_or_associated_person_reference" in event["categories"] or
                "possible_applicant_or_developer_affiliation_near_comment_gate" in event["categories"] or
                set(event["categories"]) & {
                    "possible_comment_cap_or_time_rule_statement", "possible_number_of_public_comment_opportunities_claim"
                }):
            selected[event["event_id"]] = event
    queue = outdir / "targeted_review_queue.md"
    queue_lines = [
        "# Phase 3 — focused public-comment comparator review queue",
        "",
        "All entries are automated text-search candidates, not findings of public-comment status, speaker identity, slot count, or preferential treatment. Open the official video, transcript context, and governing rule before characterizing any event.",
        "",
        f"## Cheyenne LEADS / associated-name references and possible applicant affiliation ({len(leads_events) + len(applicant_events) - sum(1 for e in leads_events if 'possible_applicant_or_developer_affiliation_near_comment_gate' in e['categories'])})",
        "",
    ]
    for event in sorted(selected.values(), key=lambda e: (e["date"], e["body"], e["timestamp_seconds"])):
        cats = set(event["categories"])
        if not (cats & {"cheyenne_leads_or_associated_person_reference", "possible_applicant_or_developer_affiliation_near_comment_gate"}):
            continue
        cue = " ".join(event["cue_text"].split())
        excerpt = cue if len(cue) <= 360 else cue[:357] + "…"
        excerpt = excerpt.replace("|", "\\|")
        video = f"[video {event['timestamp']}]({event['source_link']})" if event.get("source_link") else f"{event['timestamp']} (video ID unavailable)"
        transcript = f"[transcript line {event['source_line']}](../../{event['transcript']}#L{event['source_line']})"
        cat_text = ", ".join(f"`{cat}`" for cat in event["categories"] if cat in {
            "cheyenne_leads_or_associated_person_reference", "possible_applicant_or_developer_affiliation_near_comment_gate",
            "possible_speaker_identification_near_comment_gate"
        })
        item_refs = "; ".join(ref["item_text"] for ref in event["agenda_item_references_in_context"])
        item = f"; nearby item text: {item_refs}" if item_refs else ""
        queue_lines.append(
            f"- **{event['date']} · {event['body']} · {event['timestamp']}** — {cat_text}; {video}; {transcript}{item}. Caption cue: “{excerpt}”"
        )
    if not selected:
        queue_lines.append("- No focused cues matched.")
    queue_lines.extend(["", f"## Possible cap/speaking-limit or number-of-opportunities phrases ({len(cap_events)})", ""])
    for event in sorted(cap_events, key=lambda e: (e["date"], e["body"], e["timestamp_seconds"])):
        cue = " ".join(event["cue_text"].split()).replace("|", "\\|")
        video = f"[video {event['timestamp']}]({event['source_link']})" if event.get("source_link") else f"{event['timestamp']}"
        queue_lines.append(f"- **{event['date']} · {event['body']} · {event['timestamp']}** — {video}; `{event['transcript']}:{event['source_line']}`. Caption cue: “{cue}”")
    queue_lines.extend([
        "",
        "## Remaining comparator cues",
        "",
        "Time-limit calls, topic/relevance language, and criticism candidates are indexed in `candidate_events.jsonl` with the same source links and neighboring captions. They are deliberately not rolled into speaker-level counts here.",
        "",
    ])
    queue.write_text("\n".join(queue_lines), encoding="utf-8")

    summary = [
        "# Phase 3 — public-comment comparator candidate inventory",
        "",
        "Generated by `video-production/scan_public_comment_comparators.py` from the 2026 meeting catalog and timestamped transcripts. Every entry is a machine-found review candidate; this phase does not make a parity, motive, or legal finding.",
        "",
        f"- Meeting catalog entries: **{catalog_count}**",
        f"- Transcript-bearing entries scanned: **{transcript_count}**",
        f"- Candidate timestamp cues: **{len(events)}**",
        f"- Meetings/bodies with candidate cues: **{len(by_meeting)}**",
        f"- Transcript scan errors: **{len(errors)}**",
        f"- Catalog entries unavailable to transcript search: **{len(unavailable)}**",
        "- Full source-linked ledger: [`candidate_events.jsonl`](candidate_events.jsonl)",
        "- Focused LEADS/applicant and comment-opportunity queue: [`targeted_review_queue.md`](targeted_review_queue.md)",
        "",
        "## Candidate-category counts",
        "",
        "| Candidate category | Cue records |",
        "|---|---:|",
    ]
    for category, count in sorted(by_category.items()):
        summary.append(f"| `{category}` | {count} |")
    summary.extend([
        "",
        "## Screening results (not event counts)",
        "",
        f"- LEADS/associated-name reference cues: **{len(leads_events)}**. This includes speakers and other people's references to the organization or named personnel.",
        f"- Possible applicant/developer-affiliation cues near a public-comment gate: **{len(applicant_events)}**. A cue can be an introduction or a reference and is not itself proof of an applicant's public-comment slot.",
        f"- Possible cap/speaking-limit/number-of-opportunities cues: **{len(cap_events)}**. These are pattern leads and may discuss rules outside public-comment procedure. The 2026 panel's catalog date is year-only, not a verified calendar date.",
        f"- Time-limit/expiry candidates outside three cues of an explicit Miller reference: **{by_category['possible_time_limit_or_call_outside_miller_window']}**. Phase 2 retains the Miller-window leads; this phase does not attribute the remaining cues to speakers without video review.",
        f"- Topic/relevance candidates outside three cues of an explicit Miller reference: **{by_category['possible_topic_or_relevance_ruling_outside_miller_window']}**.",
        f"- Critical/legal-language cues near a public-comment gate and outside three cues of an explicit Miller reference: **{by_category['possible_public_comment_criticism_near_gate_outside_miller_window']}**. The scan does not determine whether the speaker was a member of the public, whether the statement targeted administration, or whether any legal claim is correct.",
        "",
        "## Meeting-level review queue",
        "",
        "| Date | Body | Candidate cues | LEADS/applicant cues | Time/topic cues | Criticism near gate | Transcript |",
        "|---|---|---:|---:|---:|---:|---|",
    ])
    for (meeting_date, body), rows in sorted(by_meeting.items()):
        count = lambda cat: sum(cat in row["categories"] for row in rows)
        transcripts = sorted({row["transcript"] for row in rows})
        transcript_links = "; ".join(
            f"[`{Path(transcript).name}`](../../{transcript})" for transcript in transcripts
        )
        leads_app = count("cheyenne_leads_or_associated_person_reference") + count("possible_applicant_or_developer_affiliation_near_comment_gate")
        time_topic = count("possible_time_limit_or_call_outside_miller_window") + count("possible_topic_or_relevance_ruling_outside_miller_window")
        summary.append(
            f"| {meeting_date} | {body} | {len(rows)} | {leads_app} | {time_topic} | "
            f"{count('possible_public_comment_criticism_near_gate_outside_miller_window')} | {transcript_links} |"
        )
    summary.extend([
        "",
        "## Overlap and limitations",
        "",
        "Phase 2 already holds Miller-specific introduction, mention, interruption, point-of-order, and timer search candidates. This scanner excludes from its time/topic/criticism comparator categories any cue within three timestamp cues of an explicit Miller name reference. That is a deduplication boundary, not proof a cue belongs to a different speaker. LEADS/applicant and public-comment-gate cues can still overlap Phase 2 in the same meeting and are marked with `within_three_cues_of_explicit_miller_reference`.",
        "",
        "For speaker/affiliation/criticism proximity, ‘near a gate’ means the nearest matched phrase within 300 seconds; it is not a same-turn or same-speaker link. The transcripts do not establish who was legally a member of the public, an applicant, a developer, or an organization representative. They may merge speaker turns. A staff/applicant presentation, a council question, and public-comment testimony are different things; do not count them as equivalent slots without video, agenda, and written-rule review. An extracted item number is caption text near the cue, not an independently verified agenda-item assignment.",
        "",
        "A three-minute phrase, time call, or off-topic ruling is not a complete time/topic audit. To compare speakers fairly, identify the applicable rule, agenda item, actual speaking start/stop, interruptions, extensions, role in the proceeding, and viewpoint from source records. This scan does not find that anyone received preferential treatment, violated a rule, or made an accurate legal claim.",
        "",
    ])
    if unavailable:
        summary.extend(["## Catalog entries unavailable to transcript search", ""])
        for row in unavailable:
            link = f"https://www.youtube.com/watch?v={row['youtube_id']}" if row.get("youtube_id") else None
            suffix = f" — [official video]({link})" if link else ""
            summary.append(f"- {row.get('date')} {row.get('body')}: {row.get('reason', 'no transcript')}" + suffix)
        summary.append("")
    if errors:
        summary.extend(["## Scan errors", ""])
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
            found, error, skipped = meeting_candidates(meeting)
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
    print(f"Scanned {transcript_count} transcript-bearing catalog entries; wrote {len(events)} candidate cues")
    print(f"Summary: {(outdir / 'summary.md').relative_to(ROOT)}")
    if unavailable:
        print(f"Unavailable to transcript search: {len(unavailable)} catalog entries")
    if errors:
        print(f"Warning: {len(errors)} transcript errors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
