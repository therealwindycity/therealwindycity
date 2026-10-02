#!/usr/bin/env python3
"""Validate a video-project candidate manifest against local transcript metadata.

This checks file paths, YouTube IDs, timecode ranges, and the presence of quoted
search text. It does not verify the audiovisual source, authenticate a record,
validate a legal claim, or render video.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = Path("video-production/phase-01-position-timelines/clip_manifest.json")
TIMESTAMP = re.compile(r"\[(\d{2}):(\d{2}):(\d{2})\]")
YOUTUBE_ID = re.compile(r"[A-Za-z0-9_-]{11}\Z")


def seconds(value: str) -> int:
    match = re.fullmatch(r"(\d{2,}):(\d{2}):(\d{2})", value)
    if not match:
        raise ValueError(f"invalid timecode {value!r}; expected HH:MM:SS")
    hours, minutes, secs = map(int, match.groups())
    if minutes > 59 or secs > 59:
        raise ValueError(f"invalid timecode {value!r}; minutes/seconds must be < 60")
    return hours * 3600 + minutes * 60 + secs


def clean_transcript(text: str) -> str:
    """Remove timestamp/Markdown markers and normalize whitespace for text checks."""
    text = TIMESTAMP.sub(" ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[\[\]`*_>#]", " ", text)
    return re.sub(r"\s+", " ", text).casefold().strip()


def contained_path(relative: str) -> Path:
    candidate = (ROOT / relative).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError as exc:
        raise ValueError(f"path escapes repository root: {relative}") from exc
    return candidate


def validate(manifest_path: Path) -> list[str]:
    errors: list[str] = []
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:  # JSON and filesystem errors should be actionable.
        return [f"cannot read manifest {manifest_path}: {exc}"]

    segments = data.get("segments")
    if not isinstance(segments, list) or not segments:
        return ["manifest must have a non-empty 'segments' array"]

    seen_ids: set[str] = set()
    valid_count = 0
    for segment in segments:
        label = str(segment.get("id", "<missing id>"))
        before = len(errors)
        if label in seen_ids:
            errors.append(f"{label}: duplicate segment id")
        seen_ids.add(label)

        try:
            source_in = seconds(segment["source_in"])
            source_out = seconds(segment["source_out"])
            if source_out <= source_in:
                errors.append(f"{label}: source_out must be after source_in")
        except (KeyError, ValueError) as exc:
            errors.append(f"{label}: {exc}")
            continue

        expected_id = segment.get("youtube_id", "")
        if not YOUTUBE_ID.fullmatch(expected_id):
            errors.append(f"{label}: invalid YouTube ID {expected_id!r}")
        parsed = urlparse(segment.get("source_url", ""))
        url_id = parse_qs(parsed.query).get("v", [""])[0]
        if url_id != expected_id:
            errors.append(f"{label}: source_url video ID {url_id!r} does not match youtube_id {expected_id!r}")

        try:
            transcript_path = contained_path(segment["transcript"])
            text = transcript_path.read_text(encoding="utf-8")
        except (KeyError, OSError, ValueError) as exc:
            errors.append(f"{label}: transcript unavailable: {exc}")
            continue

        header_ids = re.findall(r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})", text)
        if expected_id not in header_ids:
            errors.append(f"{label}: transcript header does not contain video ID {expected_id}")

        cue_times = [seconds(":".join(match.groups())) for match in TIMESTAMP.finditer(text)]
        if not cue_times:
            errors.append(f"{label}: transcript has no [HH:MM:SS] cues")
        else:
            if source_in > max(cue_times) + 5:
                errors.append(f"{label}: source_in {segment['source_in']} exceeds last transcript cue")
            if source_out > max(cue_times) + 5:
                errors.append(f"{label}: source_out {segment['source_out']} exceeds last transcript cue")
            if not any(source_in <= cue <= source_out for cue in cue_times):
                errors.append(f"{label}: no transcript cue falls within the selected source window")

        normalized = clean_transcript(text)
        for phrase in segment.get("required_text", []):
            if clean_transcript(phrase) not in normalized:
                errors.append(f"{label}: required_text not found in transcript: {phrase!r}")

        if len(errors) == before:
            valid_count += 1
            print(f"OK {label}: {segment['date']} {segment['source_in']}–{segment['source_out']} {segment['youtube_id']}")

    for overlay in data.get("legal_overlays", []):
        if not overlay.get("status") or "unresolved" not in overlay.get("applies_to_specific_project", ""):
            errors.append(f"{overlay.get('id', '<legal overlay>')}: applicability must remain explicitly unresolved in this candidate manifest")

    print(f"Validated {valid_count}/{len(segments)} segments (structural/text checks only).")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", nargs="?", default=str(DEFAULT_MANIFEST), help="manifest path relative to the repository root")
    args = parser.parse_args()
    manifest_path = contained_path(args.manifest)
    errors = validate(manifest_path)
    if errors:
        print("\nValidation errors:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
