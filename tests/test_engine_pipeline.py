"""Regression tests for civic scheduler, snapshot resolution, selftest isolation,
Python 3.11 compatibility, and CI workflow guards."""
from __future__ import annotations

import importlib.util
import py_compile
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from engine import db, detect, extract, ingest, records, scheduler

ROOT = Path(__file__).resolve().parent.parent


class EnginePipelineTests(unittest.TestCase):
    def test_resolve_snapshot_path_handles_legacy_absolute_and_relative_paths(self):
        legacy = "/home/user/civic-engine/data/snapshots/c63daae848d0_gview"
        resolved = db.resolve_snapshot_path(legacy)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved, db.SNAP_DIR / "c63daae848d0_gview")
        self.assertTrue(resolved.is_file())

        rel = "data/snapshots/c63daae848d0_gview"
        self.assertEqual(db.resolve_snapshot_path(rel), db.ROOT / rel)

        self.assertIsNone(db.resolve_snapshot_path("/nonexistent/path/missing_file"))
        self.assertIsNone(db.resolve_snapshot_path(""))
        self.assertIsNone(db.resolve_snapshot_path(None))

    def test_queued_legacy_jobs_in_engine_db_drain_cleanly_on_copy(self):
        with tempfile.TemporaryDirectory(prefix="rwc-db-copy-") as tmp:
            tmp_dir = Path(tmp)
            db_copy = tmp_dir / "engine.db"
            text_dir = tmp_dir / "text"
            text_dir.mkdir()
            shutil.copy2(db.DB_PATH, db_copy)

            conn = sqlite3.connect(db_copy)
            conn.row_factory = sqlite3.Row
            try:
                queued_before = conn.execute(
                    "SELECT COUNT(*) FROM jobs WHERE status='queued'"
                ).fetchone()[0]
                with patch.object(db, "TEXT_DIR", text_dir):
                    processed = extract.process_jobs(conn, kinds=("extract", "diff"))
                queued_after = conn.execute(
                    "SELECT COUNT(*) FROM jobs WHERE status='queued'"
                ).fetchone()[0]
                self.assertEqual(processed, queued_before)
                self.assertEqual(queued_after, 0)
            finally:
                conn.close()

    def test_missing_snapshot_does_not_wedge_job_queue(self):
        with tempfile.TemporaryDirectory(prefix="rwc-missing-snap-") as tmp:
            tmp_data = Path(tmp) / "data"
            with (
                patch.object(db, "DATA", tmp_data),
                patch.object(db, "SNAP_DIR", tmp_data / "snapshots"),
                patch.object(db, "TEXT_DIR", tmp_data / "text"),
                patch.object(db, "OUT_DIR", tmp_data / "out"),
                patch.object(db, "DB_PATH", tmp_data / "engine.db"),
            ):
                db.init_db()
                conn = db.connect()
                try:
                    missing_id = db.insert_document(
                        conn, "test", "https://example.org/missing", "Missing",
                        "/nonexistent/nowhere/gone.html", "abc123", 10,
                    )
                    db.enqueue_job(conn, "extract", {"document_id": missing_id})

                    good_snap = db.SNAP_DIR / "def456_good.txt"
                    good_snap.write_text("Cheyenne annexation council minutes.")
                    good_id = db.insert_document(
                        conn, "test", "https://example.org/good", "Good",
                        str(good_snap), "def456", good_snap.stat().st_size,
                    )
                    db.enqueue_job(conn, "extract", {"document_id": good_id})

                    processed = extract.process_jobs(conn, kinds=("extract",))
                    self.assertEqual(processed, 2)
                    missing_status = conn.execute(
                        "SELECT status FROM documents WHERE id = ?", (missing_id,)
                    ).fetchone()["status"]
                    good_status = conn.execute(
                        "SELECT status FROM documents WHERE id = ?", (good_id,)
                    ).fetchone()["status"]
                    self.assertEqual(missing_status, "snapshot-missing")
                    self.assertEqual(good_status, "indexed")
                finally:
                    conn.close()

    def test_detect_strips_extensionless_html_in_isolated_db(self):
        with tempfile.TemporaryDirectory(prefix="rwc-diff-html-") as tmp:
            tmp_data = Path(tmp) / "data"
            with (
                patch.object(db, "DATA", tmp_data),
                patch.object(db, "SNAP_DIR", tmp_data / "snapshots"),
                patch.object(db, "TEXT_DIR", tmp_data / "text"),
                patch.object(db, "OUT_DIR", tmp_data / "out"),
                patch.object(db, "DB_PATH", tmp_data / "engine.db"),
            ):
                db.init_db()
                conn = db.connect()
                try:
                    ingest._ingest_one(
                        conn, "test", "https://example.org/Minutes-and-Agendas",
                        "Agendas", b"<!doctype html><html><body><p>Budget $100</p></body></html>",
                    )
                    ingest._ingest_one(
                        conn, "test", "https://example.org/Minutes-and-Agendas",
                        "Agendas", b"<!doctype html><html><body><p>Budget $200</p></body></html>",
                    )
                    extract.process_jobs(conn, kinds=("extract", "diff"))
                    summary = conn.execute(
                        "SELECT change_summary FROM versions WHERE seq = 2"
                    ).fetchone()["change_summary"]
                    self.assertIn("1 lines added, 1 removed", summary)
                finally:
                    conn.close()

    def test_scheduler_script_has_no_relative_import_error_and_propagates_once_errors(self):
        script_path = ROOT / "engine" / "scheduler.py"
        spec = importlib.util.spec_from_file_location("__main_check__", script_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.assertTrue(hasattr(mod, "publish"))

        with tempfile.TemporaryDirectory(prefix="rwc-sched-") as tmp:
            tmp_data = Path(tmp) / "data"
            with (
                patch.object(db, "DATA", tmp_data),
                patch.object(db, "SNAP_DIR", tmp_data / "snapshots"),
                patch.object(db, "TEXT_DIR", tmp_data / "text"),
                patch.object(db, "OUT_DIR", tmp_data / "out"),
                patch.object(db, "DB_PATH", tmp_data / "engine.db"),
                patch.object(mod.publish, "PUBLIC", Path(tmp) / "public"),
                patch.object(mod.ingest, "crawl_all", return_value=0),
            ):
                db.init_db()
                conn = db.connect()
                try:
                    ok = mod.cycle(conn, raise_on_error=True)
                    self.assertTrue(ok)
                    self.assertTrue((Path(tmp) / "public" / "index.html").is_file())
                finally:
                    conn.close()

            with patch.object(mod.ingest, "crawl_all", side_effect=RuntimeError("boom")):
                with self.assertRaises(RuntimeError):
                    mod.cycle(None, raise_on_error=True)
                self.assertFalse(mod.cycle(None, raise_on_error=False))

    def test_run_selftest_passes_and_does_not_modify_production_data(self):
        before_db = db.DB_PATH.read_bytes()
        before_snaps = sorted(p.name for p in db.SNAP_DIR.iterdir())
        proc = subprocess.run(
            [sys.executable, str(ROOT / "run.py"), "selftest"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stdout + proc.stderr)
        self.assertIn("SELFTEST PASS", proc.stdout)
        self.assertEqual(db.DB_PATH.read_bytes(), before_db)
        self.assertEqual(sorted(p.name for p in db.SNAP_DIR.iterdir()), before_snaps)
        self.assertFalse((db.DATA / "selftest").exists())

    def test_comment_draft_has_body_name_cli_flag_and_draft_heading(self):
        with tempfile.TemporaryDirectory(prefix="rwc-comment-") as tmp:
            tmp_data = Path(tmp) / "data"
            with (
                patch.object(db, "DATA", tmp_data),
                patch.object(db, "SNAP_DIR", tmp_data / "snapshots"),
                patch.object(db, "TEXT_DIR", tmp_data / "text"),
                patch.object(db, "OUT_DIR", tmp_data / "out"),
                patch.object(db, "DB_PATH", tmp_data / "engine.db"),
            ):
                db.init_db()
                conn = db.connect()
                try:
                    body = records.generate_public_comment(
                        conn,
                        body_name="Finance Committee",
                        agenda_item="Ordinance 4687",
                        meeting_date="2026-11-23",
                        position="Oppose",
                        ask="Defer vote",
                        fact_bullets="  - Verified record",
                    )
                    self.assertIn("PUBLIC COMMENT — DRAFT FOR REVIEW", body)
                    self.assertNotIn("DR AFT", body)
                finally:
                    conn.close()

        help_proc = subprocess.run(
            [sys.executable, str(ROOT / "run.py"), "request", "--help"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(help_proc.returncode, 0)
        self.assertIn("--body-name", help_proc.stdout)

    def test_miller_theater_compiles_cleanly(self):
        compiled = py_compile.compile(str(ROOT / "miller_theater.py"), doraise=True)
        self.assertTrue(compiled)

    def test_workflow_guards_are_present(self):
        poll_yml = (ROOT / ".github" / "workflows" / "workdesk-poll.yml").read_text()
        self.assertIn("if [ ! -f workdesk/data/feed.json ]; then", poll_yml)

        cycle_yml = (ROOT / ".github" / "workflows" / "civic-cycle.yml").read_text()
        self.assertNotIn("env.NTFY_TOPIC != ''", cycle_yml)
        self.assertIn('if [ -z "${NTFY_TOPIC:-}" ]; then', cycle_yml)


if __name__ == "__main__":
    unittest.main()
