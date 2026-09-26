#!/usr/bin/env python3
"""Discover new City of Cheyenne meeting videos and add their transcripts.

Compares the city's YouTube /videos + /streams tabs against meetings.json,
downloads captions for new videos (needs cookies.txt at repo root), appends
entries to meetings.json, and regenerates the README index tables.

Usage:
    python3 scripts/sync_new_meetings.py [--discover-only] [--rebuild-index]

Exit codes: 0 = ok (or nothing new), 1 = new videos exist but none downloadable,
2 = downloads needed but cookies.txt is missing/empty.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_transcripts as FT

ROOT = FT.ROOT
CHANNEL_VIDEOS = "https://www.youtube.com/@TheCityofCheyenne/videos"
CHANNEL_STREAMS = "https://www.youtube.com/@TheCityofCheyenne/streams"
YEARS = {"2026"}

# Confirmed to have no YouTube caption track (checked 2026-09-26); skip forever.
SKIP_IDS = {
    "c-rdM6D4RMo": "No caption track published by the city on YouTube.",
}

BODY_ORDER = [
    "city-council", "public-services-committee", "finance-committee",
    "work-session", "planning-commission", "board-of-adjustment",
    "historic-preservation-board", "urban-renewal-authority",
]
SECTION_TITLES = {
    "city-council": "### City Council (governing body)",
    "public-services-committee": "### Public Services Committee",
    "finance-committee": "### Finance Committee",
    "work-session": "### Council work sessions & special sessions",
    "planning-commission": "### Planning Commission",
    "board-of-adjustment": "### Board of Adjustment",
    "historic-preservation-board": "### Historic Preservation Board",
    "urban-renewal-authority": "### Urban Renewal Authority",
}
MEETING_NAMES = {
    "city-council": "City Council",
    "public-services-committee": "Public Services Committee",
    "finance-committee": "Finance Committee",
    "work-session": None,  # use topic
    "planning-commission": "Planning Commission",
    "board-of-adjustment": "Board of Adjustment",
    "historic-preservation-board": "Historic Preservation Board",
    "urban-renewal-authority": "Urban Renewal Authority",
}
FILE_DIRS = {
    "city-council": ("city-council", "city-council"),
    "public-services-committee": ("public-services-committee", "public-services-committee"),
    "finance-committee": ("finance-committee", "finance-committee"),
    "work-session": ("work-sessions", None),
    "planning-commission": ("planning-commission", "planning-commission"),
    "board-of-adjustment": ("board-of-adjustment", "board-of-adjustment"),
    "historic-preservation-board": ("historic-preservation-board", "historic-preservation-board"),
    "urban-renewal-authority": ("urban-renewal-authority", "urban-renewal-authority"),
}
BOARD_BODY = {
    "Planning Commission": "planning-commission",
    "Board of Adjustment": "board-of-adjustment",
    "Historic Preservation Board": "historic-preservation-board",
    "Urban Renewal Authority": "urban-renewal-authority",
}
MONTHS = {"January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
          "July": 7, "August": 8, "September": 9, "October": 10, "November": 11,
          "December": 12}


def slugify(text, maxlen=60):
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:maxlen].rstrip("-") or "session"


def _iso(mm, dd, yy):
    return "20%s-%s-%s" % (yy, mm, dd)


def parse_title(title):
    """Return (body, iso_date, topic_or_None, slug_or_None) or None."""
    t = title.strip()
    m = re.match(r"^City Council - (\d{2})-(\d{2})-(\d{2})$", t)
    if m:
        return ("city-council", _iso(*m.groups()), None, None)
    m = re.match(r"^Finance Committee[ -]+(\d{2})-(\d{2})-(\d{2})$", t)
    if m:
        return ("finance-committee", _iso(*m.groups()), None, None)
    m = re.match(r"^Public Services Committee[ -]+-?(\d{2})-(\d{2})-(\d{2})$", t)
    if m:
        return ("public-services-committee", _iso(*m.groups()), None, None)
    m = re.match(r"^Work Session - (.+) - (\d{2})-(\d{2})-(\d{2})$", t)
    if m:
        topic = m.group(1).strip()
        return ("work-session", _iso(m.group(2), m.group(3), m.group(4)), topic, slugify(topic))
    m = re.match(r"^Committee of the Whole[ -]+(\d{2})-(\d{2})-(\d{2})$", t)
    if m:
        return ("work-session", _iso(*m.groups()), "Committee of the Whole", "committee-of-the-whole")
    m = re.match(r"^City Council Goal Setting 2026[ -]+(\d{2})-(\d{2})-(\d{2})$", t)
    if m:
        return ("work-session", _iso(*m.groups()), "City Council Goal Setting 2026", "goal-setting")
    m = re.match(r"^2026 Goal Setting Review[ -]+(\d{2})-(\d{2})-(\d{2})$", t)
    if m:
        return ("work-session", _iso(*m.groups()), "2026 Goal Setting Review", "goal-setting-review")
    m = re.match(r"^([A-Za-z]+) (\d{1,2}), (\d{4}), Cheyenne (Planning Commission|Board of Adjustment|Historic Preservation Board|Urban Renewal Authority) Meeting$", t)
    if m and m.group(1) in MONTHS:
        iso = "%s-%02d-%02d" % (m.group(3), MONTHS[m.group(1)], int(m.group(2)))
        return (BOARD_BODY[m.group(4)], iso, None, None)
    return None


def parse_undated_work_session(title, upload_date):
    """Fallback for work-session videos whose titles carry no date.

    Uses the YouTube upload date. Returns (body, iso, topic, slug, note) or None.
    """
    if not upload_date or len(upload_date) != 8 or upload_date[:4] not in YEARS:
        return None
    m = re.match(r"^Work Session - (.+)$", title.strip())
    if not m:
        return None
    topic = m.group(1).strip()
    if re.search(r"19\d{2}|20\d{2}", topic):
        return None  # year mentioned in topic; leave for manual review
    iso = "%s-%s-%s" % (upload_date[:4], upload_date[4:6], upload_date[6:8])
    note = "Video title carries no date; dated from YouTube upload date."
    return ("work-session", iso, topic, slugify(topic), note)


def cookies_available():
    return FT.COOKIES.exists() and FT.COOKIES.stat().st_size > 0


def list_tab(url, end):
    cmd = ["yt-dlp", "--flat-playlist", "--playlist-end", str(end),
           "--print", "%(id)s\t%(upload_date)s\t%(title)s", "--no-warnings"]
    if cookies_available():
        cmd[1:1] = ["--cookies", str(FT.COOKIES)]
    try:
        r = subprocess.run(cmd + [url], capture_output=True, text=True, timeout=300)
    except Exception as e:
        print("WARNING: listing failed for %s: %s" % (url, e))
        return {}
    out = {}
    for line in r.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            vid, ud, title = (p.strip() for p in parts)
            if vid and title:
                out[vid] = (ud, title)
    return out


def catalog_sort_key(entry):
    try:
        body_idx = BODY_ORDER.index(entry["body"])
    except ValueError:
        body_idx = len(BODY_ORDER)
    return (body_idx, entry.get("date", ""), entry.get("file") or "")


def save_catalog(catalog):
    catalog.sort(key=catalog_sort_key)
    (ROOT / "meetings.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")


def rebuild_readme(catalog):
    by_body = {}
    for e in sorted(catalog, key=catalog_sort_key):
        by_body.setdefault(e["body"], []).append(e)
    sections = []
    for body in BODY_ORDER:
        entries = by_body.get(body, [])
        if not entries:
            continue
        counts = {}
        for e in entries:
            counts[e["date"]] = counts.get(e["date"], 0) + 1
        seen = {}
        lines = [SECTION_TITLES[body], "",
                 "| Date | Meeting | Video | Transcript |",
                 "|---|---|---|---|"]
        for e in entries:
            disp = e["date"]
            if counts[e["date"]] > 1:
                n = seen.get(e["date"], 0)
                seen[e["date"]] = n + 1
                disp = "%s (%s)" % (e["date"], chr(ord("a") + n))
            name = MEETING_NAMES[body] or e.get("topic", "Work Session")
            url = "https://www.youtube.com/watch?v=" + e["youtube_id"]
            if e.get("file"):
                cell = "[%s](%s)" % (e["file"], e["file"])
            else:
                cell = "*no captions on file — %s*" % e.get("unavailable", "transcript unavailable")
            lines.append("| %s | %s | [▶](%s) | %s |" % (disp, name, url, cell))
        sections.append("\n".join(lines))
    block = "\n\n".join(sections)
    readme = ROOT / "README.md"
    text = readme.read_text(encoding="utf-8")
    idx = text.index("## Contents")
    end = text.index("## Methodology")
    readme.write_text(text[:idx] + "## Contents\n\n" + block + "\n\n" + text[end:], encoding="utf-8")


def process_new(vid, title, body, iso, topic, slug, note, catalog, existing_files):
    d, default_slug = FILE_DIRS[body]
    base = slug or default_slug
    path = "%s/%s-%s.md" % (d, iso, base)
    suffix = ord("b")
    while path in existing_files:
        path = "%s/%s-%s-%s.md" % (d, iso, base, chr(suffix))
        suffix += 1
    entry = {"date": iso, "body": body, "youtube_id": vid, "file": path}
    if topic:
        entry["topic"] = topic
    if note:
        entry["note"] = note
    print("NEW %s %s %s (%s)" % (iso, body, vid, title[:60]), flush=True)
    vtt, kind = FT.download_captions(vid)
    if vtt is None:
        return None, "no captions downloadable"
    try:
        body_text = FT.vtt_to_markdown_body(vtt)
    except Exception as e:
        return None, "parse error: %s" % str(e)[:100]
    if len(body_text.split()) < 50:
        return None, "caption body too short"
    dest = ROOT / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(FT.build_entry_markdown(entry, body_text, kind), encoding="utf-8")
    print("  wrote %s (%d words)" % (path, len(body_text.split())), flush=True)
    catalog.append(entry)
    existing_files.add(path)
    return entry, None


def main():
    discover_only = "--discover-only" in sys.argv
    rebuild_only = "--rebuild-index" in sys.argv
    catalog = json.loads((ROOT / "meetings.json").read_text(encoding="utf-8"))
    if rebuild_only:
        save_catalog(catalog)
        rebuild_readme(catalog)
        print("Index rebuilt from %d catalog entries." % len(catalog))
        return 0
    known = {e["youtube_id"] for e in catalog}
    found = {}
    found.update(list_tab(CHANNEL_VIDEOS, 300))
    found.update(list_tab(CHANNEL_STREAMS, 100))
    print("Listed %d channel videos." % len(found))
    new, n_known, n_year, n_skip, n_unparsed = [], 0, 0, 0, 0
    samples = []
    for vid in sorted(found):
        ud, title = found[vid]
        if vid in known:
            n_known += 1
            continue
        if vid in SKIP_IDS:
            n_skip += 1
            continue
        parsed = parse_title(title)
        note = None
        if parsed is None:
            fb = parse_undated_work_session(title, ud)
            if fb is not None:
                body, iso, topic, slug, note = fb
                parsed = (body, iso, topic, slug)
        if parsed is None:
            n_unparsed += 1
            if len(samples) < 8:
                samples.append(title)
            continue
        body, iso, topic, slug = parsed
        if iso[:4] not in YEARS:
            n_year += 1
            continue
        new.append((vid, title, body, iso, topic, slug, note))
    print("New 2026 meetings: %d (known=%d, other-year=%d, skip-list=%d, unparsed=%d)"
          % (len(new), n_known, n_year, n_skip, n_unparsed))
    for s in samples:
        print("  unparsed title: %r" % s)
    for vid, title, body, iso, topic, slug, note in new:
        print("  FOUND %s %s %s | %s%s" % (iso, body, vid, title, " [upload-dated]" if note else ""))
    if discover_only or not new:
        return 0
    if not cookies_available():
        print("ERROR: %d new video(s) but no usable cookies.txt — cannot download captions." % len(new))
        print("Add the YOUTUBE_COOKIES secret (repo Settings → Secrets → Actions) and re-run.")
        return 2
    FT.RAW.mkdir(exist_ok=True)
    existing_files = {e.get("file") for e in catalog if e.get("file")}
    ok, failed = [], []
    for item in new:
        entry, err = process_new(*item, catalog, existing_files)
        if entry:
            ok.append(item[0])
        else:
            failed.append((item[0], item[1], err))
    save_catalog(catalog)
    rebuild_readme(catalog)
    print("SYNC DONE: %d added, %d failed." % (len(ok), len(failed)))
    for vid, title, err in failed:
        print("  FAILED %s (%s): %s" % (vid, title[:60], err))
    return 1 if new and not ok else 0


if __name__ == "__main__":
    sys.exit(main())
