"""Regression tests: page chrome must not be reported as a silent edit; article edits must be.

Before fingerprint v2, 519 of 520 recorded "silent edits" were sidebar timestamps ("10 hours ago"
-> "11 hours ago"), a reshuffled "Latest News" list, or a Granicus viewer flipping between an
empty body and "Loading…". Each was published in the feed as an outlet quietly altering a story.
"""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import db, extract, fingerprint, gen_feed, ingest, retriage  # noqa: E402

BODY = ("CHEYENNE, Wyo. — Downtown Cheyenne came alive with holiday lights and {word} Saturday. "
        "Starting with the inaugural Holiday Night Market and ending with the Depot Plaza lighting "
        "ceremony, the cozy winter feelings downtown were infectious. Residents took part in three "
        "main events downtown.")


def page(word="spirit", age="10 hours ago", latest=("Council approves budget", "Snow on the way")):
    items = "".join(f'<li><a href="#">{t}</a><span class="time">{age}</span></li>' for t in latest)
    return f"""<!doctype html><html><head><title>Holiday spirit</title></head><body>
<header class="site-header"><nav class="menu"><a>News</a><a>Sports</a></nav></header>
<main><article><h1>See downtown Cheyenne buzzing with holiday spirit Saturday</h1>
<div class="entry-meta"><span>By Staff</span> <time>{age}</time></div>
<div class="entry-content"><p>{BODY.format(word=word)}</p></div></article>
<aside class="sidebar widget"><h2>Latest News</h2><ul>{items}</ul></aside></main>
<footer class="site-footer">© 2026</footer></body></html>""".encode()


def loader_shell(text):
    return f"<!doctype html><html><body><div id='viewer'>{text}</div></body></html>".encode()


class Isolated:
    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="rwc-noise-")
        d = Path(self.tmp.name) / "data"
        self.patches = [patch.object(db, "DATA", d), patch.object(db, "SNAP_DIR", d / "snapshots"),
                        patch.object(db, "TEXT_DIR", d / "text"), patch.object(db, "OUT_DIR", d / "out"),
                        patch.object(db, "DB_PATH", d / "engine.db")]

    def __enter__(self):
        for p in self.patches:
            p.start()
        db.init_db()
        self.conn = db.connect()
        return self.conn

    def __exit__(self, *a):
        self.conn.close()
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()


def ingest_and_diff(conn, url, raw):
    ingest._ingest_one(conn, "test", url, "News", raw)
    extract.process_jobs(conn, kinds=("extract", "diff"))


def counts(conn):
    v = conn.execute("SELECT COUNT(*) FROM versions WHERE seq > 1").fetchone()[0]
    a = conn.execute("SELECT COUNT(*) FROM alerts WHERE term = 'SILENT-EDIT'").fetchone()[0]
    return v, a


class FingerprintTests(unittest.TestCase):
    def test_chrome_changes_do_not_change_fingerprint(self):
        base = fingerprint.content_text(page().decode())
        self.assertIn("holiday lights and spirit", base)
        self.assertNotIn("hours ago", base)
        self.assertNotIn("Council approves budget", base)
        for variant in (page(age="11 hours ago"), page(latest=("Arrest report", "Obituaries")),
                        page(age="just now", latest=())):
            self.assertEqual(base, fingerprint.content_text(variant.decode()))

    def test_article_edit_changes_fingerprint(self):
        self.assertNotEqual(fingerprint.content_text(page("spirit").decode()),
                            fingerprint.content_text(page("spirits").decode()))

    def test_page_wide_wrappers_are_not_chrome(self):
        # cheyennecity.org (ASP.NET) wraps the page in <form>; wyomingnews puts "...-nav" on <body>
        body = "<h1>Petition falls short</h1><p>" + "The petition challenging the annexation fell short. " * 8 + "</p>"
        for html in (f"<html><body><form id='mainForm'><nav>Menu</nav>{body}</form></body></html>",
                     f"<html><body class='fixed-scroll-nav app-editorial'><nav>Menu</nav>{body}</body></html>"):
            text = fingerprint.content_text(html)
            self.assertIn("fell short", text)
            self.assertNotIn("Menu", text)

    def test_site_announcement_banner_is_chrome(self):
        body = "<h1>Public hearing</h1><p>" + "A public hearing will be held on the liquor license. " * 6 + "</p>"
        a, b = ("<html><body><form><div class='emergency-container'><p>%s</p></div>%s</form></body></html>"
                % (t, body) for t in ("Labor Day closures", "Thanksgiving closures"))
        self.assertEqual(fingerprint.content_text(a), fingerprint.content_text(b))

    def test_unrecognised_markup_falls_back_to_full_text(self):
        # if chrome rules would strip most of the page, keep everything rather than miss an edit
        html = "<html><body><div class='menu-wrap'><p>" + "Council minutes text. " * 40 + "</p></div></body></html>"
        self.assertIn("Council minutes text.", fingerprint.content_text(html))

    def test_loader_shell_and_empty_page_are_equivalent(self):
        self.assertEqual("", fingerprint.content_text(loader_shell("DocumentViewer.php Loading…").decode()))
        self.assertEqual("", fingerprint.content_text(loader_shell("").decode()))
        self.assertNotEqual("", fingerprint.content_text(loader_shell("Budget $100").decode()))


class PipelineTests(unittest.TestCase):
    URL = "https://example.org/news/holiday-spirit"

    def test_chrome_only_recrawls_create_no_version_or_alert(self):
        with Isolated() as conn:
            ingest_and_diff(conn, self.URL, page())
            ingest_and_diff(conn, self.URL, page(age="11 hours ago"))
            ingest_and_diff(conn, self.URL, page(age="12 hours ago", latest=("Arrest report",)))
            self.assertEqual(counts(conn), (0, 0))

    def test_article_edit_is_still_caught(self):
        with Isolated() as conn:
            ingest_and_diff(conn, self.URL, page("spirits"))
            ingest_and_diff(conn, self.URL, page("spirit", age="11 hours ago"))
            self.assertEqual(counts(conn), (1, 1))
            summary = conn.execute("SELECT change_summary FROM versions WHERE seq = 2").fetchone()[0]
            self.assertEqual(summary, "1 lines added, 1 removed")

    def test_feed_does_not_repeat_silent_edits_as_watchlist_hits(self):
        with Isolated() as conn:
            ingest_and_diff(conn, self.URL, page("spirits"))
            ingest_and_diff(conn, self.URL, page("spirit"))
            titles = [t for _, t, _, _ in gen_feed.collect_items(conn)]
            self.assertEqual(sum(t.startswith("SILENT EDIT") for t in titles), 1)
            self.assertFalse([t for t in titles if "SILENT-EDIT" in t], titles)

    def test_retriage_removes_recorded_chrome_only_versions(self):
        import hashlib
        with Isolated() as conn:
            ingest_and_diff(conn, self.URL, page())
            doc = conn.execute("SELECT id FROM documents").fetchone()[0]
            # a version + alert recorded by the old whole-page fingerprint for a chrome-only change
            raw = page(age="11 hours ago")
            sha = hashlib.sha256(raw).hexdigest()
            (Path(db.SNAP_DIR) / f"{sha[:12]}_holiday-spirit.html").write_bytes(raw)
            with conn:
                conn.execute("INSERT INTO versions (document_id, seq, sha256, captured_at, change_summary) "
                             "VALUES (?, 2, ?, ?, '4 lines added, 4 removed')", (doc, sha, db.utcnow()))
                conn.execute("INSERT INTO alerts (document_id, term, snippet, created_at) "
                             "VALUES (?, 'SILENT-EDIT', 'old noise', ?)", (doc, db.utcnow()))
            self.assertEqual(counts(conn), (1, 1))
            report = retriage.migrate(conn, force=True)
            self.assertEqual(counts(conn), (0, 0))
            self.assertEqual(report["versions_removed_as_page_chrome"], 1)
            self.assertFalse(retriage.needed(conn))
            self.assertEqual(retriage.migrate(conn), {"skipped": True})

if __name__ == "__main__":
    unittest.main()
