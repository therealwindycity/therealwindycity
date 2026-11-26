"""One-time re-check of the ledger when the content fingerprint (engine/fingerprint.py) changes.

Before fingerprint v2 a news page "changed" on every crawl because its sidebar timestamps and
"Latest News" list changed. Each such capture became a new version, a SILENT-EDIT alert and a
public "SILENT EDIT" feed item. Watchlist terms were also matched against the whole page, so a
sidebar headline or a "your browser is out of date ... Microsoft Edge" banner produced WATCHLIST
hits on unrelated stories. This module re-checks the recorded ledger against the article text:

  * a version whose article text equals the previous kept version is removed, along with its
    SILENT-EDIT alert and diff file (it was page chrome, not an edit);
  * every remaining version gets a fresh article-text diff, summary and SILENT-EDIT alert,
    dated when it was captured (not now);
  * HTML documents are re-indexed with their article text, and watchlist alerts whose term
    does not occur in the article text are removed (no new alerts are added here);
  * documents.sha256 is recomputed so the next crawl compares like with like.

Everything removed is listed in data/out/retriage-fingerprint-v{N}.json. Snapshot files are
never deleted. Runs once per fingerprint version (recorded in the meta table).
"""
from __future__ import annotations

import difflib
import hashlib
import json
from pathlib import Path

from . import db, fingerprint
from .analyze import term_pattern
from .detect import _text_of

META_KEY = "fingerprint_version"


def _snapshot_path(local_path) -> Path | None:
    if not local_path:
        return None
    resolve = getattr(db, "resolve_snapshot_path", None)
    if resolve is not None:
        p = resolve(local_path)
        return Path(p) if p and Path(p).exists() else None
    p = Path(local_path)
    if not p.exists():
        p = db.SNAP_DIR / p.name
    return p if p.exists() else None


def _find_capture(conn, doc_id: int, sha256: str) -> Path | None:
    if db.SNAP_DIR.exists():
        for fp in db.SNAP_DIR.iterdir():
            if fp.name.startswith(sha256[:12] + "_"):
                return fp
    doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if doc and doc["sha256"] == sha256:
        return _snapshot_path(doc["local_path"])
    return None


def _hash_of(raw: bytes, name: str) -> str:
    if fingerprint.looks_like_html(raw, name):
        text = fingerprint.content_text(raw.decode("utf-8", errors="replace"))
        raw = fingerprint.canonical(text).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def needed(conn) -> bool:
    conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (META_KEY,)).fetchone()
    return not row or row[0] != fingerprint.FP_VERSION


def _recheck_versions(conn, docs: dict) -> tuple[list, list, int]:
    removed, kept, missing = [], [], 0
    by_doc: dict[int, list] = {}
    for v in conn.execute("SELECT * FROM versions ORDER BY document_id, seq"):
        by_doc.setdefault(v["document_id"], []).append(v)
    conn.execute("DELETE FROM alerts WHERE term = 'SILENT-EDIT'")
    for doc_id, vers in by_doc.items():
        doc = docs.get(doc_id)
        title = doc["title"] if doc else ""
        last_text = last_ver = None
        for v in vers:
            cap = _find_capture(conn, doc_id, v["sha256"])
            text = _text_of(str(cap)) if cap else None
            if text is None:
                missing += 1
            if last_ver is None:  # first capture of the document
                last_text, last_ver = text, v
                continue
            diff_file = db.OUT_DIR / f"silent-edit-doc{doc_id}-seq{v['seq']}.diff.txt"
            if (text is not None and last_text is not None
                    and fingerprint.canonical(text) == fingerprint.canonical(last_text)):
                removed.append({"document_id": doc_id, "url": doc["url"] if doc else "",
                                "title": title, "seq": v["seq"], "captured_at": v["captured_at"],
                                "previous_summary": v["change_summary"],
                                "reason": "article text identical to the previous capture; only "
                                          "page chrome (sidebar times/lists, menus) changed"})
                conn.execute("DELETE FROM versions WHERE id = ?", (v["id"],))
                if diff_file.exists():
                    diff_file.unlink()
                continue
            added = dropped = []
            if text is None or last_text is None:
                summary = v["change_summary"] or "snapshot missing; not re-checked"
            else:
                diff = list(difflib.unified_diff(
                    last_text.splitlines(), text.splitlines(), lineterm="",
                    fromfile=f"seq{last_ver['seq']} ({last_ver['captured_at']})",
                    tofile=f"seq{v['seq']} ({v['captured_at']})"))
                added = [l[1:] for l in diff if l.startswith("+") and not l.startswith("+++")]
                dropped = [l[1:] for l in diff if l.startswith("-") and not l.startswith("---")]
                summary = f"{len(added)} lines added, {len(dropped)} removed"
                diff_file.parent.mkdir(parents=True, exist_ok=True)
                diff_file.write_text("\n".join(diff[:400]))
            conn.execute("UPDATE versions SET change_summary = ? WHERE id = ?", (summary, v["id"]))
            conn.execute(
                "INSERT OR IGNORE INTO alerts (document_id, term, snippet, created_at) VALUES (?, ?, ?, ?)",
                (doc_id, "SILENT-EDIT", f"Document changed after publication: {summary}. "
                 f"Removed: {dropped[:5]} Added: {added[:5]}", v["captured_at"]))
            kept.append({"document_id": doc_id, "seq": v["seq"], "captured_at": v["captured_at"],
                         "summary": summary, "title": title})
            last_text, last_ver = text, v
    return removed, kept, missing


def _recheck_documents(conn, docs: dict) -> list:
    """Re-index HTML pages with article text; drop watchlist hits that came from page chrome."""
    pruned = []
    for doc in docs.values():
        path = _snapshot_path(doc["local_path"])
        if path is None:
            continue
        raw = path.read_bytes()
        new_sha = _hash_of(raw, path.name)
        if new_sha != doc["sha256"]:
            conn.execute("UPDATE documents SET sha256 = ? WHERE id = ?", (new_sha, doc["id"]))
        if not fingerprint.looks_like_html(raw, path.name):
            continue
        text = fingerprint.content_text(raw.decode("utf-8", errors="replace"))
        for a in conn.execute("SELECT id, term, snippet FROM alerts WHERE document_id = ? "
                              "AND term <> 'SILENT-EDIT'", (doc["id"],)).fetchall():
            word = a["term"].split(":", 1)[-1]
            if word and not term_pattern(word).search(text):
                pruned.append({"document_id": doc["id"], "title": doc["title"], "url": doc["url"],
                               "term": a["term"], "snippet": a["snippet"],
                               "reason": "term not in the article text as a whole word "
                                         "(sidebar, menu or banner text, or part of another word)"})
                conn.execute("DELETE FROM alerts WHERE id = ?", (a["id"],))
        if doc["status"] == "indexed":
            db.index_text(conn, doc["id"], doc["source"], doc["title"], text)
    return pruned


def migrate(conn, force: bool = False) -> dict:
    dupes = db.dedupe_text_index(conn)
    if dupes:
        print(f"[retriage] removed {dupes} superseded search-index rows", flush=True)
    if not force and not needed(conn):
        return {"skipped": True}
    docs = {r["id"]: r for r in conn.execute("SELECT * FROM documents")}
    with conn:
        removed, kept, missing = _recheck_versions(conn, docs)
        pruned = _recheck_documents(conn, docs)
        conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                     (META_KEY, fingerprint.FP_VERSION))
    report = {"fingerprint_version": fingerprint.FP_VERSION, "generated_at": db.utcnow(),
              "versions_removed_as_page_chrome": len(removed), "edits_kept": len(kept),
              "watchlist_alerts_removed": len(pruned), "captures_missing": missing,
              "kept": kept, "removed": removed, "watchlist_removed": pruned}
    db.OUT_DIR.mkdir(parents=True, exist_ok=True)
    (db.OUT_DIR / f"retriage-fingerprint-v{fingerprint.FP_VERSION}.json").write_text(
        json.dumps(report, indent=1))
    print(f"[retriage] fingerprint v{fingerprint.FP_VERSION}: removed {len(removed)} chrome-only "
          f"'silent edits' (kept {len(kept)}), removed {len(pruned)} chrome-only watchlist hits; "
          f"{missing} captures missing", flush=True)
    return report
