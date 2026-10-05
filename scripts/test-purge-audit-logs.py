#!/usr/bin/env python3
"""Tests for the BAMSO audit-log retention purge script."""

import importlib.util
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("purge-audit-logs.py")
SPEC = importlib.util.spec_from_file_location("purge_audit_logs", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {SCRIPT_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PurgeAuditLogsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self.temp_dir.name) / "audit.db"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE AuditLog (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    createdAt TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _insert(self, created_at: datetime):
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "INSERT INTO AuditLog (createdAt) VALUES (?)",
                (created_at.strftime("%Y-%m-%dT%H:%M:%S"),),
            )
            conn.commit()
        finally:
            conn.close()

    def _count(self):
        conn = sqlite3.connect(self.db_path)
        try:
            return conn.execute("SELECT COUNT(*) FROM AuditLog").fetchone()[0]
        finally:
            conn.close()

    def test_dry_run_does_not_delete_old_logs(self):
        old = datetime.now(timezone.utc) - timedelta(days=400)
        self._insert(old)

        result = MODULE.purge_audit_logs(str(self.db_path), 365, dry_run=True)

        self.assertEqual(result, 0)
        self.assertEqual(self._count(), 1)

    def test_purge_deletes_only_logs_older_than_retention(self):
        old = datetime.now(timezone.utc) - timedelta(days=400)
        recent = datetime.now(timezone.utc) - timedelta(days=10)
        self._insert(old)
        self._insert(recent)

        result = MODULE.purge_audit_logs(str(self.db_path), 365)

        self.assertEqual(result, 0)
        self.assertEqual(self._count(), 1)

    def test_custom_retention_period_is_honored(self):
        old = datetime.now(timezone.utc) - timedelta(days=31)
        recent = datetime.now(timezone.utc) - timedelta(days=29)
        self._insert(old)
        self._insert(recent)

        result = MODULE.purge_audit_logs(str(self.db_path), 30)

        self.assertEqual(result, 0)
        self.assertEqual(self._count(), 1)

    def test_missing_database_returns_failure_without_creating_file(self):
        missing = Path(self.temp_dir.name) / "missing.db"

        result = MODULE.purge_audit_logs(str(missing), 365)

        self.assertEqual(result, 1)
        self.assertFalse(missing.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
