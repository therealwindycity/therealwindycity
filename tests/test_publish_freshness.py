"""Freshness and date-relative rendering tests for the static ledger preview."""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from engine import publish


class PublishFreshnessTests(unittest.TestCase):
    def test_missing_or_invalid_source_check_is_unknown_not_fresh(self):
        now = datetime(2026, 10, 21, 14, 20, tzinfo=timezone.utc)
        self.assertIsNone(publish.source_check_freshness(None, now)["stale"])
        self.assertIsNone(publish.source_check_freshness("not-a-timestamp", now)["stale"])

    def test_source_age_is_explicit_and_48_hour_boundary_is_deterministic(self):
        now = datetime(2026, 10, 21, 14, 20, 57, tzinfo=timezone.utc)
        fresh = publish.source_check_freshness("2026-10-19T14:20:57Z", now)
        stale = publish.source_check_freshness("2026-10-19T14:20:56Z", now)
        old = publish.source_check_freshness("2026-09-06T14:20:57Z", now)

        self.assertFalse(fresh["stale"], "exactly 48 hours is inside the configured warning boundary")
        self.assertIn(
            "48-hour freshness window ends at 2026-10-21 14:20:57 UTC",
            publish._freshness_html(fresh),
        )
        self.assertTrue(stale["stale"])
        self.assertEqual(old["age_label"], "45 days ago")
        self.assertEqual(old["checked_label"], "2026-09-06 14:20:57 UTC")
        self.assertEqual(old["freshness_threshold_label"], "2026-09-08 14:20:57 UTC")

    def test_election_countdown_uses_america_denver_day_and_does_not_freeze(self):
        before_local_midnight = datetime(2026, 11, 3, 6, 59, tzinfo=timezone.utc)
        on_local_election_day = datetime(2026, 11, 3, 7, 0, tzinfo=timezone.utc)
        after_election = datetime(2026, 11, 4, 19, 0, tzinfo=timezone.utc)

        self.assertEqual(
            publish.countdown_metric("2026-11-03", before_local_midnight, "Nov. 3 election"),
            ("1", "days until Nov. 3 election"),
        )
        self.assertEqual(
            publish.countdown_metric("2026-11-03", on_local_election_day, "Nov. 3 election"),
            ("TODAY", "Nov. 3 election day"),
        )
        self.assertEqual(
            publish.countdown_metric("2026-11-03", after_election, "Nov. 3 election"),
            ("1", "days since Nov. 3 election"),
        )

    def test_denver_fall_back_repeats_one_am_not_midnight(self):
        cases = (
            (
                datetime(2026, 11, 1, 6, 30, tzinfo=timezone.utc),
                "2026-11-01 00:30 MDT",
            ),
            (
                datetime(2026, 11, 1, 7, 30, tzinfo=timezone.utc),
                "2026-11-01 01:30 MDT",
            ),
            (
                datetime(2026, 11, 1, 8, 30, tzinfo=timezone.utc),
                "2026-11-01 01:30 MST",
            ),
        )
        for instant, expected in cases:
            with self.subTest(instant=instant.isoformat()):
                local_time = instant.astimezone(publish.DENVER)
                self.assertEqual(local_time.strftime("%Y-%m-%d %H:%M %Z"), expected)

    @staticmethod
    def _ledger_connection(last_checked: str | None) -> sqlite3.Connection:
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript(
            """
            CREATE TABLE documents (
                id INTEGER PRIMARY KEY, url TEXT, title TEXT, last_checked TEXT
            );
            CREATE TABLE alerts (
                id INTEGER PRIMARY KEY, document_id INTEGER, term TEXT,
                snippet TEXT, created_at TEXT
            );
            CREATE TABLE versions (
                id INTEGER PRIMARY KEY, document_id INTEGER, seq INTEGER,
                captured_at TEXT, change_summary TEXT
            );
            CREATE TABLE requests (
                id INTEGER PRIMARY KEY, kind TEXT, subject TEXT, body TEXT,
                created_at TEXT, status TEXT
            );
            """
        )
        if last_checked is not None:
            conn.execute(
                "INSERT INTO documents (id, url, title, last_checked) VALUES (1, ?, ?, ?)",
                ("https://example.org/record", "Example public record", last_checked),
            )
            conn.execute(
                "INSERT INTO alerts (id, document_id, term, snippet, created_at) VALUES (1, 1, ?, ?, ?)",
                ("annexation", "A quoted record excerpt.", last_checked),
            )
        conn.commit()
        return conn

    def test_render_uses_current_countdown_and_prominent_stale_snapshot_notice(self):
        now = datetime(2026, 10, 21, 14, 20, 57, tzinfo=timezone.utc)
        conn = self._ledger_connection("2026-09-06T14:20:57Z")
        original_static = (publish.PUBLIC / "index.html").read_bytes()
        try:
            with tempfile.TemporaryDirectory(prefix="rwc-freshness-test-") as temp_dir:
                with patch.object(publish.db, "connect", return_value=conn):
                    rendered_path = Path(publish.build(now=now, output_dir=Path(temp_dir)))
                rendered = rendered_path.read_text()

            self.assertIn('data-generated-at="2026-10-21T14:20:57Z"', rendered)
            self.assertIn('data-last-checked="2026-09-06T14:20:57Z"', rendered)
            self.assertIn('data-freshness-threshold-at="2026-09-08T14:20:57Z"', rendered)
            self.assertIn('data-source-stale="true"', rendered)
            self.assertIn("Source snapshot may be stale", rendered)
            self.assertIn("45 days ago", rendered)
            self.assertIn("48-hour freshness window ended at 2026-09-08 14:20:57 UTC", rendered)
            self.assertIn("last available ledger snapshot, not a live crawl", rendered)
            self.assertIn("<b>13</b><span>days until Nov. 3 election · as of October 21, 2026 MDT</span>", rendered)
            self.assertNotIn("<b>53</b><span>days to the Nov. 3 election</span>", rendered)
            self.assertIn("Cover story in this snapshot", rendered)
            self.assertIn("Latest recorded tripwires", rendered)
            self.assertEqual((publish.PUBLIC / "index.html").read_bytes(), original_static)
        finally:
            conn.close()

    def test_render_with_missing_timestamp_discloses_unknown_freshness(self):
        now = datetime(2026, 10, 21, 14, 20, tzinfo=timezone.utc)
        conn = self._ledger_connection(None)
        try:
            with tempfile.TemporaryDirectory(prefix="rwc-unknown-freshness-test-") as temp_dir:
                with patch.object(publish.db, "connect", return_value=conn):
                    rendered_path = Path(publish.build(now=now, output_dir=Path(temp_dir)))
                rendered = rendered_path.read_text()
            self.assertIn('data-freshness-threshold-at=""', rendered)
            self.assertIn('data-source-stale="unknown"', rendered)
            self.assertIn("source freshness and its 48-hour freshness window are unknown", rendered)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
