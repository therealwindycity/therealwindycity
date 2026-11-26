"""One-time re-check of past silent-edit detections under the current content fingerprint.

Before fingerprint v2 (engine/fingerprint.py) a news page "changed" every crawl because its
sidebar timestamps and "Latest News" list changed, and each such capture was recorded as a new
version, a SILENT-EDIT alert and a public "SILENT EDIT" feed item. This module re-checks every
recorded version against the article-only fingerprint:

  * a version whose article text is identical to the previous kept version is removed (with its
    SILENT-EDIT alert and its diff file) - it was page chrome, not an edit;
  * every remaining version gets a fresh article-text diff, change summary and alert (dated
    when it was captured, not now);
  * documents.sha256 is recomputed so the next crawl compares like with like.

Everything removed is listed in data/out/retriage-fingerprint-v2.json. Snapshots are never
deleted, so the record of what was captured stays intact. Runs once per FP_VERSION (meta table).
"""
from __future__ import annotations

import difflib
import hashlib
import json
from pathlib import Path

from . import db, fingerprint
from .detect import _find_capture, _text_of

META_KEY = "fingerprint_version"


def _hash_of(path: Path) -> str:
    raw = path.read_bytes()
    if fingerprint.looks_like_html(raw, path.name):
        data = fingerprint.canonical(fingerprint.content_text(raw.decode("utf-8", errors="replace"))).encode()
    else:
        data = raw
    return hashlib.sha256(data).hexdigest()


def needed(conn) -> bool:
    conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (META_KEY,)).fetchone()
    return not row or row[0] != fingerprint.FP_VERSION


def migrate(conn, force: bool = False) -> dict:
    if not force and not needed(conn):
        return {"skipped": True}
    removed, kept_edits, missing = [], [], 0
    docs = {r["id"]: r for r in conn.execute("SELECT * FROM documents")}
    by_doc: dict[int, list] = {}
    for v in conn.execute("SELECT * FROM versions ORDER BY document_id, seq"):
        by_doc.setdefault(v["document_id"], []).append(v)

    with conn:
        conn.execute("DELETE FROM alerts WHERE term = 'SILENT-EDIT'")
        for doc_id, vers in by_doc.items():
            doc = docs.get(doc_id)
            last_text = last_ver = None
            for v in vers:
                cap = _find_capture(doc_id, v["sha256"], conn=conn)
                text = _text_of(str(cap)) if cap else None
                if text is None:
                    missing += 1
                if last_ver is None:  # first capture of the document
                    last_text, last_ver = text, v
                    continue
                same = (text is not None and last_text is not None
                        and fingerprint.canonical(text) == fingerprint.canonical(last_text))
                diff_file = db.OUT_DIR / f"silent-edit-doc{doc_id}-seq{v['seq']}.diff.txt"
                if same:
                    removed.append({"document_id": doc_id, "url": doc["url"] if doc else "",
                                    "title": doc["title"] if doc else "", "seq": v["seq"],
                                    "captured_at": v["captured_at"],
                                    "previous_summary": v["change_summary"],
                                    "reason": "article text identical to previous capture; "
                                              "only page chrome (sidebar times/lists, menus) changed"})
                    conn.execute("DELETE FROM versions WHERE id = ?", (v["id"],))
                    if diff_file.exists():
                        diff_file.unlink()
                    continue
                if text is None or last_text is None:
                    # cannot re-check (snapshot missing): keep as recorded, alert unchanged in substance
                    summary = v["change_summary"] or "snapshot missing; not re-checked"
                    added = removed_lines = []
                else:
                    diff = list(difflib.unified_diff(
                        last_text.splitlines(), text.splitlines(), lineterm="",
                        fromfile=f"seq{last_ver['seq']} ({last_ver['captured_at']})",
                        tofile=f"seq{v['seq']} ({v['captured_at']})"))
                    added = [l[1:] for l in diff if l.startswith("+") and not l.startswith("+++")]
                    removed_lines = [l[1:] for l in diff if l.startswith("-") and not l.startswith("---")]
                    summary = f"{len(added)} lines added, {len(removed_lines)} removed"
                    db.OUT_DIR.mkdir(parents=True, exist_ok=True)
                    diff_file.write_text("\n".join(diff[:400]))
                conn.execute("UPDATE versions SET change_summary = ? WHERE id = ?", (summary, v["id"]))
                conn.execute(
                    "INSERT OR IGNORE INTO alerts (document_id, term, snippet, created_at) VALUES (?, ?, ?, ?)",
                    (doc_id, "SILENT-EDIT",
                     f"Document changed after publication: {summary}. "
                     f"Removed: {removed_lines[:5]} Added: {added[:5]}", v["captured_at"]))
                kept_edits.append({"document_id": doc_id, "seq": v["seq"], "captured_at": v["captured_at"],
                                   "summary": summary, "title": doc["title"] if doc else ""})
                last_text, last_ver = text, v
        # recompute document fingerprints so the next crawl compares like with like
        for doc in docs.values():
            path = db.resolve_snapshot_path(doc["local_path"]) if doc["local_path"] else None
            if path and Path(path).exists():
                new = _hash_of(Path(path))
                if new != doc["sha256"]:
                    conn.execute("UPDATE documents SET sha256 = ? WHERE id = ?", (new, doc["id"]))
        conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (META_KEY, fingerprint.FP_VERSION))

    report = {"fingerprint_version": fingerprint.FP_VERSION, "generated_at": db.utcnow(),
              "versions_removed_as_page_chrome": len(removed), "edits_kept": len(kept_edits),
              "captures_missing": missing, "kept": kept_edits, "removed": removed}
    db.OUT_DIR.mkdir(parents=True, exist_ok=True)
    (db.OUT_DIR / f"retriage-fingerprint-v{fingerprint.FP_VERSION}.json").write_text(json.dumps(report, indent=1))
    print(f"[retriage] fingerprint v{fingerprint.FP_VERSION}: removed {len(removed)} chrome-only "
          f"'silent edits', kept {len(kept_edits)} real edits ({missing} captures missing)", flush=True)
    return report
