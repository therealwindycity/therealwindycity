#!/usr/bin/env python3
"""Enumerate official Wyoming government YouTube uploads and meeting videos.

This is a small helper for the Drive-workbook enrichment task. It is intentionally
flat-playlist only: no media is downloaded, only public metadata and URLs.
"""
from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANNELS = ROOT / "tools" / "wyoming_youtube_channels.json"
OUT_DIR = ROOT / "youtube_harvest"

MEETING_RE = re.compile(
    r"\b("
    r"meetings?|councils?|commission|commissioner|commissioners|committees?|"
    r"boards?|hearings?|sessions?|forum|forums|workshop|workshops|"
    r"work\s+session|floor\s+session|budget\s+session|general\s+session|"
    r"public\s+input|town\s+hall|special\s+meeting|regular\s+meeting|"
    r"governing\s+body|planning|zoning|briefing|oral\s+argument|"
    r"appropriations|judiciary|revenue|education|agriculture|transportation|"
    r"select\s+committee|joint|senate|house|management\s+council|"
    r"q\s*&\s*a|question\s+and\s+answer"
    r")\b",
    re.I,
)


def run_ytdlp(url: str) -> list[dict]:
    attempts = [
        [
            "yt-dlp",
            "--flat-playlist",
            "--dump-json",
            "--ignore-errors",
            "--no-warnings",
            "--extractor-args",
            "youtube:player_client=web_safari",
            url,
        ],
        [
            "yt-dlp",
            "--flat-playlist",
            "--dump-json",
            "--ignore-errors",
            "--no-warnings",
            url,
        ],
    ]
    last_error = ""
    for cmd in attempts:
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            last_error = "timeout"
            continue
        if proc.returncode == 0 and proc.stdout.strip():
            out = []
            for line in proc.stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
            return out
        last_error = (proc.stderr or proc.stdout or "").strip()[-500:] or f"exit {proc.returncode}"
    raise RuntimeError(last_error or "yt-dlp produced no output")


def resolve_channel(url: str) -> dict:
    """Resolve a handle/custom URL to a stable channel ID and display name."""
    cmd = [
        "yt-dlp",
        "--dump-single-json",
        "--skip-download",
        "--playlist-end",
        "1",
        "--no-warnings",
        url,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if proc.returncode == 0 and proc.stdout.strip():
            info = json.loads(proc.stdout)
            return {
                "id": info.get("id") or info.get("channel_id") or "",
                "name": info.get("channel") or info.get("uploader") or info.get("title") or "",
                "url": info.get("channel_url") or info.get("webpage_url") or url,
            }
    except Exception:
        pass
    return {"id": "", "name": "", "url": url}


def video_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def channel_url(channel_id: str) -> str:
    return f"https://www.youtube.com/channel/{channel_id}" if channel_id else ""


def main() -> int:
    OUT_DIR.mkdir(exist_ok=True)
    channels = json.loads(CHANNELS.read_text())
    all_rows: list[dict] = []
    meeting_rows: list[dict] = []
    summary_rows: list[dict] = []

    for item in channels:
        entity = item["entity"]
        entered_url = item["url"]
        print(f"[harvest] {entity}: {entered_url}", flush=True)
        try:
            entries = run_ytdlp(entered_url)
            error = ""
        except Exception as exc:  # keep harvesting other channels
            entries = []
            error = str(exc)
            print(f"[harvest] FAILED {entity}: {error}", file=sys.stderr, flush=True)

        resolved = resolve_channel(entered_url)
        channel_ids = sorted({e.get("channel_id") or "" for e in entries if e.get("channel_id")})
        channel_id = channel_ids[0] if channel_ids else resolved["id"]
        resolved_url = channel_url(channel_id) or resolved["url"] or entered_url
        channel_name = resolved["name"]

        for e in entries:
            vid = e.get("id") or e.get("url") or ""
            title = e.get("title") or ""
            upload_date = e.get("upload_date") or ""
            duration = e.get("duration") or ""
            views = e.get("view_count") or ""
            row = {
                "Entity Source": entity,
                "Official Channel Name": channel_name,
                "Channel URL": resolved_url,
                "Channel ID": channel_id,
                "Video Title": title,
                "Video ID": vid,
                "Video URL": video_url(vid) if vid and not str(vid).startswith("http") else str(vid),
                "Upload Date": upload_date,
                "Duration (Seconds)": duration,
                "View Count": views,
                "Meeting Match": "YES" if MEETING_RE.search(title) else "NO",
                "Source Note": item.get("note", ""),
            }
            all_rows.append(row)
            if row["Meeting Match"] == "YES":
                meeting_rows.append(row)

        entity_rows = [r for r in all_rows if r["Entity Source"] == entity]
        entity_meeting_rows = [r for r in entity_rows if r["Meeting Match"] == "YES"]
        dates = sorted(r["Upload Date"] for r in entity_rows if r["Upload Date"])
        meeting_dates = sorted(r["Upload Date"] for r in entity_meeting_rows if r["Upload Date"])
        summary_rows.append(
            {
                "Entity Source": entity,
                "Official Channel Name": channel_name,
                "Channel URL": resolved_url,
                "Channel ID": channel_id,
                "Videos Enumerated": len(entity_rows),
                "Meeting Videos": len(entity_meeting_rows),
                "Earliest Upload": dates[0] if dates else "",
                "Latest Upload": dates[-1] if dates else "",
                "Earliest Meeting Upload": meeting_dates[0] if meeting_dates else "",
                "Latest Meeting Upload": meeting_dates[-1] if meeting_dates else "",
                "Status": error or "OK",
                "Source Note": item.get("note", ""),
            }
        )

    def write_csv(name: str, rows: list[dict], fields: list[str]) -> None:
        path = OUT_DIR / name
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        print(f"[harvest] wrote {path} ({len(rows)} rows)", flush=True)

    all_fields = [
        "Entity Source", "Official Channel Name", "Channel URL", "Channel ID", "Video Title",
        "Video ID", "Video URL", "Upload Date", "Duration (Seconds)", "View Count",
        "Meeting Match", "Source Note",
    ]
    summary_fields = [
        "Entity Source", "Official Channel Name", "Channel URL", "Channel ID",
        "Videos Enumerated", "Meeting Videos", "Earliest Upload", "Latest Upload",
        "Earliest Meeting Upload", "Latest Meeting Upload", "Status", "Source Note",
    ]
    write_csv("wyoming_youtube_all_videos.csv", all_rows, all_fields)
    write_csv("wyoming_youtube_meeting_videos.csv", meeting_rows, all_fields)
    write_csv("wyoming_youtube_channel_summary.csv", summary_rows, summary_fields)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# retrigger harvest after filter update
