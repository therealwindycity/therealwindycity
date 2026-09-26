#!/usr/bin/env python3
"""Download YouTube captions for every meeting in meetings.json and convert to Markdown.

Requires: yt-dlp installed, a JS runtime for YouTube challenges (deno recommended,
on PATH or at ~/.deno/bin/deno), and a `cookies.txt` (Netscape format, exported
from a logged-in YouTube browser session) placed at the repo root. cookies.txt is
git-ignored and must NEVER be committed.

Usage:
    python3 scripts/fetch_transcripts.py            # fetch all, skip existing
    python3 scripts/fetch_transcripts.py --refresh  # re-download everything

Outputs:
    raw/<youtube_id>.en.vtt   (ignored by git; intermediate)
    <file from catalog>       (committed transcript markdown)
    failed.json               (ignored by git; videos with no captions / errors)
"""
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
COOKIES = ROOT / "cookies.txt"

# Make sure yt-dlp can find a JS runtime for YouTube's JS challenges.
for _cand in (Path.home() / ".deno" / "bin", Path("/usr/local/bin")):
    if (_cand / "deno").exists() and str(_cand) not in os.environ.get("PATH", ""):
        os.environ["PATH"] = str(_cand) + os.pathsep + os.environ.get("PATH", "")

BODY_NAMES = {
    "city-council": "Cheyenne City Council",
    "public-services-committee": "Cheyenne Public Services Committee",
    "finance-committee": "Cheyenne Finance Committee",
    "work-session": "Cheyenne City Council Work Session",
    "planning-commission": "Cheyenne Planning Commission",
    "board-of-adjustment": "Cheyenne Board of Adjustment",
    "historic-preservation-board": "Cheyenne Historic Preservation Board",
    "urban-renewal-authority": "Cheyenne Urban Renewal Authority",
}

TAG_RE = re.compile(r"<[^>]+>")
TS_RE = re.compile(r"(\d+):(\d{2}):(\d{2})\.(\d{3})")


def parse_ts(ts):
    m = TS_RE.search(ts)
    h, mi, s, ms = (int(g) for g in m.groups())
    return h * 3600 + mi * 60 + s + ms / 1000.0


def fmt_ts(sec):
    sec = int(sec)
    return "%02d:%02d:%02d" % (sec // 3600, (sec % 3600) // 60, sec % 60)


def parse_vtt(path):
    """Return list of (start_seconds, clean_text) cues."""
    cues = []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if "-->" in line:
            parts = line.split("-->")
            start = parse_ts(parts[0])
            i += 1
            text_lines = []
            while i < len(lines) and lines[i].strip() != "":
                text_lines.append(lines[i])
                i += 1
            raw = " ".join(text_lines)
            raw = TAG_RE.sub("", raw)
            raw = raw.replace("&nbsp;", " ").replace("&amp;", "&")
            raw = raw.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
            raw = re.sub(r"\s+", " ", raw).strip()
            if raw:
                cues.append((start, raw))
        else:
            i += 1
    return cues


def dedupe_and_paragraph(cues, gap=2.5, max_words=110):
    """Remove rolling-window caption repeats, group into timestamped paragraphs."""
    words_out = []
    tail = []
    for sec, txt in cues:
        words = txt.split()
        if not words:
            continue
        limit = min(len(tail), len(words), 40)
        k = 0
        for j in range(limit, 0, -1):
            if tail[-j:] == words[:j]:
                k = j
                break
        fresh = words[k:]
        for w in fresh:
            words_out.append((w, sec))
        tail = (tail + fresh)[-60:]
    paras = []
    cur, cur_start, prev_sec = [], None, None
    for w, sec in words_out:
        if cur_start is None:
            cur_start = sec
        if prev_sec is not None and (sec - prev_sec > gap or len(cur) >= max_words):
            paras.append((cur_start, cur))
            cur, cur_start = [], sec
        cur.append(w)
        prev_sec = sec
    if cur:
        paras.append((cur_start, cur))
    return paras


def vtt_to_markdown_body(vtt_path):
    cues = parse_vtt(vtt_path)
    paras = dedupe_and_paragraph(cues)
    return "\n\n".join("[%s] %s" % (fmt_ts(s), " ".join(ws)) for s, ws in paras)


def long_date(d):
    try:
        y, m, dd = (int(x) for x in d.split("-"))
        return date(y, m, dd).strftime("%B %d, %Y")
    except Exception:
        return d


def download_captions(ytid):
    """Prefer human captions; fall back to auto captions. Returns (VTT path, kind)."""
    existing = sorted(RAW.glob(ytid + ".*.vtt"))
    if existing:
        return existing[0], "English captions (previously downloaded)"
    for flag, kind in (("--write-subs", "Human-uploaded English subtitles"),
                       ("--write-auto-subs", "English (auto-generated)")):
        cmd = [
            "yt-dlp", "--remote-components", "ejs:github",
            "--cookies", str(COOKIES), "--skip-download", "--no-playlist",
            "--sub-langs", "en", "--sub-format", "vtt",
            "--sleep-requests", "2", "--sleep-subtitles", "1",
            "-o", str(RAW / "%(id)s.%(ext)s"), flag,
            "https://www.youtube.com/watch?v=" + ytid,
        ]
        subprocess.run(cmd, capture_output=True)
        matches = sorted(RAW.glob(ytid + ".*.vtt"))
        if matches:
            return matches[0], kind
    return None, None


def build_entry_markdown(entry, body_text, caption_kind):
    body_name = BODY_NAMES.get(entry["body"], entry["body"])
    title = body_name + " — " + long_date(entry["date"])
    if entry.get("topic"):
        title += " (" + entry["topic"] + ")"
    url = "https://www.youtube.com/watch?v=" + entry["youtube_id"]
    header = []
    header.append("# " + title)
    header.append("")
    header.append("**Verbatim transcript** of the %s meeting held %s in Cheyenne, Wyoming." % (body_name, long_date(entry["date"])))
    header.append("")
    header.append("- **Video:** [%s](%s)" % (url, url))
    header.append("- **YouTube ID:** `%s`" % entry["youtube_id"])
    header.append("- **Source:** City of Cheyenne official YouTube channel (@TheCityofCheyenne)")
    header.append("- **Captions:** %s" % caption_kind)
    if entry.get("note"):
        header.append("- **Note:** " + entry["note"])
    header.append("")
    header.append("> Processing: repeated rolling caption windows were de-duplicated; cues were grouped "
                  "into paragraphs with `[HH:MM:SS]` timestamps. Wording is unchanged from the captions. "
                  "Auto-generated captions contain errors (especially names); verify quotations against the video.")
    header.append("")
    header.append("---")
    header.append("")
    return "\n".join(header) + body_text + "\n"


def main():
    refresh = "--refresh" in sys.argv
    if not COOKIES.exists():
        print("ERROR: cookies.txt not found at repo root. Export it from a logged-in YouTube session.", flush=True)
        sys.exit(1)
    RAW.mkdir(exist_ok=True)
    catalog = json.loads((ROOT / "meetings.json").read_text(encoding="utf-8"))
    failed = []
    done = 0
    for n, entry in enumerate(catalog, 1):
        ytid = entry["youtube_id"]
        dest = ROOT / entry["file"]
        tag = "%d/%d %s %s" % (n, len(catalog), entry["date"], ytid)
        if dest.exists() and not refresh:
            print(tag + " exists, skip", flush=True)
            done += 1
            continue
        vtt, kind = download_captions(ytid)
        if vtt is None:
            print(tag + " NO CAPTIONS", flush=True)
            failed.append(entry)
            continue
        try:
            body_text = vtt_to_markdown_body(vtt)
        except Exception as e:
            print(tag + " PARSE ERROR: " + str(e)[:120], flush=True)
            failed.append(dict(entry, error=str(e)[:200]))
            continue
        if len(body_text.split()) < 50:
            print(tag + " TOO SHORT (%d words)" % len(body_text.split()), flush=True)
            failed.append(dict(entry, error="caption body too short"))
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(build_entry_markdown(entry, body_text, kind), encoding="utf-8")
        print(tag + " wrote %s (%d words)" % (entry["file"], len(body_text.split())), flush=True)
        done += 1
    (ROOT / "failed.json").write_text(json.dumps(failed, indent=2), encoding="utf-8")
    print("DONE: %d/%d written, %d failed (see failed.json)" % (done, len(catalog), len(failed)), flush=True)


if __name__ == "__main__":
    main()
