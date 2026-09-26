#!/usr/bin/env python3
"""stitch_transcripts.py — run the vendored stitch+cleanup toolchain over our archive.

Adapter between this repo's transcript format and the ported upstream modules in
tools/stitch/ (see tools/stitch/README.md for provenance):

  1. read <body>/<date>-<body>.md  (header block, '---', then '[HH:MM:SS] ...' paras)
  2. feed the paras through parse_rolling_transcript() (overlap stitch + segment)
  3. apply_confusions() then fuzzy_correct() with the upstream glossary
  4. re-split corrected text onto the original timestamps (proportional, word-snapped)
  5. write <meeting>.clean.md + <meeting>.changes.json sidecars + stitch_report.md

Stdlib only. Idempotent: files that already have sidecars are skipped unless
--force is given. --check performs a dry run (no writes).

Usage (from the cheyenne-2026-transcripts directory):
  python3 scripts/stitch_transcripts.py --check
  python3 scripts/stitch_transcripts.py --only 2026-08-03-public-services
  python3 scripts/stitch_transcripts.py --force
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # cheyenne-2026-transcripts/
STITCH = ROOT / "tools" / "stitch"
sys.path.insert(0, str(STITCH))

import text_extract as te  # noqa: E402  (vendored, see tools/stitch/README.md)
import clean_transcripts as ct  # noqa: E402  (vendored; only its correctors are used)

PARA = re.compile(r"^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$")


def load_glossary() -> dict:
    return json.loads((STITCH / "glossary.json").read_text(encoding="utf-8"))


def build_terms(glossary: dict) -> list[str]:
    """Candidate correction terms: people (+title/surname variants), places, terms, #s."""
    people = glossary.get("people", [])
    titles = glossary.get("people_titles", {})
    variants = list(people)
    for person in people:
        title = titles.get(person, "")
        parts = person.split()
        if len(parts) >= 2:
            variants.append(parts[-1])
            variants.append(f"Councilman {parts[-1]}")
            variants.append(f"Councilwoman {parts[-1]}")
            for t in ("Mr.", "Ms.", "Mrs.", "Dr.", "Mayor"):
                variants.append(f"{t} {parts[-1]}")
            if title:
                variants.append(f"{title} {person}")
                variants.append(f"{title} {parts[-1]}")
    return (variants + glossary.get("places", []) + glossary.get("terms", [])
            + glossary.get("ordinances", []) + glossary.get("resolutions", []))


def split_md(path: Path) -> tuple[str, list[tuple[str, str]]]:
    """Return (header_block, [(timestamp, text), ...]) for one of our .md files."""
    text = path.read_text(encoding="utf-8")
    if "\n---\n" not in text:
        raise ValueError(f"{path.name}: missing '---' separator")
    header, body = text.split("\n---\n", 1)
    paras: list[tuple[str, str]] = []
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        m = PARA.match(line)
        if m:
            paras.append((m.group(1), m.group(2)))
        elif paras:  # wrapped continuation of the previous paragraph
            paras[-1] = (paras[-1][0], paras[-1][1] + " " + line)
    if not paras:
        raise ValueError(f"{path.name}: no [HH:MM:SS] paragraphs found")
    return header, paras


def resplit(text2: str, total_in: int, segments: list[dict]) -> list[dict]:
    """Re-align corrected text onto segment timestamps (proportional, word-snapped)."""
    total_out = max(1, len(text2))
    boundaries, acc = [0], 0
    for s in segments:
        acc += len(s["text"]) + 1
        boundaries.append(acc)
    raw = [0] + [int(b / max(1, total_in) * total_out) for b in boundaries[1:-1]] + [total_out]
    cuts, prev = [0], 0
    for c in raw[1:-1]:
        left, right = text2.rfind(" ", 0, c), text2.find(" ", c)
        if left == -1:
            snap = right + 1 if right != -1 else c
        elif right == -1:
            snap = left + 1
        else:
            snap = left + 1 if c - left <= right - c else right + 1
        snap = min(max(snap, prev), total_out)
        cuts.append(snap)
        prev = snap
    cuts.append(total_out)
    return [{"t_start": s["t_start"], "t_end": s["t_end"],
             "text": text2[c0:c1].strip()}
            for s, c0, c1 in zip(segments, cuts[:-1], cuts[1:])]


def clean_entry(md_path: Path, glossary: dict, terms: list[str]) -> dict:
    header, paras = split_md(md_path)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                     encoding="utf-8") as tmp:
        tmp.write("\n".join(f"{ts} {tx}" for ts, tx in paras) + "\n")
        tmp_path = Path(tmp.name)
    try:
        parsed = te.parse_rolling_transcript(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)
    full = " ".join(s["text"] for s in parsed["segments"])
    # drop no-op confusion pairs (upstream glossary logs before==after as a "fix")
    confusions = [(b, a) for b, a in glossary.get("confusions", []) if a != b]
    text, ch1 = ct.apply_confusions(full, confusions,
                                    glossary.get("regex_confusions", []))
    text2, ch2 = ct.fuzzy_correct(text, terms)
    corrected = resplit(text2, max(1, len(full)), parsed["segments"])
    clean_md = (header + "\n---\n"
                + "\n".join(f"[{te.seconds_to_ts(s['t_start'])}] {s['text']}"
                            for s in corrected) + "\n")
    return {"header": header, "clean_md": clean_md, "changes": ch1 + ch2,
            "raw_lines": parsed["raw_lines"], "raw_words": len(parsed["words"]),
            "segments": len(corrected)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=[],
                    help="only files whose name contains one of these substrings")
    ap.add_argument("--force", action="store_true", help="redo files that have sidecars")
    ap.add_argument("--check", action="store_true",
                    help="dry run: report correction counts, write nothing")
    ap.add_argument("--limit", type=int, default=0, help="stop after N files (0 = no limit)")
    args = ap.parse_args()

    catalog = json.loads((ROOT / "meetings.json").read_text(encoding="utf-8"))
    entries = [e for e in catalog if e.get("file")]
    if args.only:
        entries = [e for e in entries
                   if any(s in e["file"] for s in args.only)]
    if args.limit:
        entries = entries[:args.limit]
    if not entries:
        print("no matching entries")
        return

    glossary = load_glossary()
    terms = build_terms(glossary)
    print(f"glossary: {len(terms)} correction terms "
          f"({len(glossary.get('confusions', []))} literal confusions)")

    rows: list[dict] = []
    for e in entries:
        md_path = ROOT / e["file"]
        clean_path = md_path.with_suffix(".clean.md")
        changes_path = md_path.with_suffix(".changes.json")
        if not args.check and not args.force and clean_path.exists() and changes_path.exists():
            print(f"SKIP {md_path.name} (sidecars exist)")
            continue
        try:
            res = clean_entry(md_path, glossary, terms)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"FAIL {md_path.name}: {exc}")
            rows.append({"file": e["file"], "error": str(exc)})
            continue
        n = len(res["changes"])
        print(f"{'CHECK' if args.check else 'CLEAN'} {md_path.name}: "
              f"{res['raw_words']} words, {res['segments']} segments, {n} corrections")
        if not args.check:
            clean_path.write_text(res["clean_md"], encoding="utf-8")
            changes_path.write_text(json.dumps({
                "source": e["file"], "video_id": e.get("youtube_id"),
                "glossary": "tools/stitch/glossary.json",
                "stitched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "raw_lines": res["raw_lines"], "raw_words": res["raw_words"],
                "corrections": n, "changes": res["changes"],
            }, indent=1), encoding="utf-8")
        rows.append({"file": e["file"], "words": res["raw_words"],
                     "segments": res["segments"], "corrections": n,
                     "top": [f"{c.get('before')} → {c.get('after')}"
                             for c in res["changes"][:5]]})
    if args.check:
        total = sum(r.get("corrections", 0) for r in rows if "error" not in r)
        print(f"\ncheck only: {total} corrections across {len(rows)} file(s), nothing written")
        return

    ok = [r for r in rows if "error" not in r]
    md = ["# Stitch/cleanup report", "",
          f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')} by "
          "`scripts/stitch_transcripts.py` using `tools/stitch/`.",
          f"Cleaned {len(ok)} file(s), "
          f"{sum(r['corrections'] for r in ok)} total corrections.", "",
          "| file | words | segments | corrections | sample changes |",
          "|---|---|---|---|---|"]
    for r in rows:
        if "error" in r:
            md.append(f"| {r['file']} | — | — | ERROR: {r['error']} | |")
        else:
            md.append(f"| {r['file']} | {r['words']} | {r['segments']} | "
                      f"{r['corrections']} | {'; '.join(r['top'])} |")
    (ROOT / "stitch_report.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"\nwrote stitch_report.md ({len(ok)} cleaned)")


if __name__ == "__main__":
    main()
