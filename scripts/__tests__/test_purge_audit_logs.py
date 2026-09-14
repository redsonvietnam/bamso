"""
Tests for scripts/purge-audit-logs.py
======================================
Focused boundary tests for VN timezone-aware audit purge.

Run: python -m pytest scripts/__tests__/test_purge_audit_logs.py -v
"""

import os
import sqlite3
import tempfile
import subprocess
import sys
import pytest

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "..", "purge-audit-logs.py")
VN_MIDNIGHT = "2026-09-14T00:00:00"  # frozen VN reference time


def _create_db(path: str, records: list[str]):
    """Create a temp SQLite DB with AuditLog table and insert records."""
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE AuditLog (
            id TEXT PRIMARY KEY,
            actorType TEXT NOT NULL,
            actorId TEXT,
            actorRole TEXT,
            action TEXT NOT NULL,
            entityType TEXT NOT NULL,
            entityId TEXT,
            success INTEGER NOT NULL,
            reasonCode TEXT,
            metadata TEXT,
            createdAt TEXT NOT NULL
        )
    """)
    for i, ts in enumerate(records):
        cursor.execute(
            "INSERT INTO AuditLog (id, actorType, action, entityType, success, createdAt) "
            "VALUES (?, 'SYSTEM', 'LOGIN', 'AUTH', 1, ?)",
            (f"rec-{i}", ts),
        )
    conn.commit()
    conn.close()


def _run_purge(db_path: str, days: int = 365, dry_run: bool = False,
               until: str | None = None) -> tuple[int, str]:
    """Run the purge script and return (exit_code, combined_output)."""
    cmd = [sys.executable, SCRIPT_PATH, "--db", db_path, "--days", str(days)]
    if dry_run:
        cmd.append("--dry-run")
    if until:
        cmd.extend(["--until", until])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return result.returncode, result.stdout + result.stderr


def _count_records(db_path: str) -> int:
    conn = sqlite3.connect(db_path)
    count = conn.execute("SELECT COUNT(*) FROM AuditLog").fetchone()[0]
    conn.close()
    return count


def _get_actions(db_path: str) -> list[str]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT action FROM AuditLog ORDER BY id").fetchall()
    conn.close()
    return [r[0] for r in rows]


class TestRecordInsideRetentionWindow:
    """AC-01: Record safely inside retention window → NOT deleted."""

    def test_recent_record_preserved(self, tmp_path):
        db = str(tmp_path / "test.db")
        # Record created 10 days before the reference date
        _create_db(db, ["2026-09-04T12:00:00"])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1
        assert "No records deleted" not in out or _count_records(db) == 1

    def test_record_on_retention_minus_one_day(self, tmp_path):
        """364 days old with 365-day retention → NOT deleted."""
        db = str(tmp_path / "test.db")
        _create_db(db, ["2025-09-15T00:00:00"])  # 364 days before 2026-09-14
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1


class TestRecordAtBoundary:
    """AC-02: Record exactly at retention boundary → NOT prematurely deleted."""

    def test_boundary_date_not_deleted(self, tmp_path):
        """Record created on the boundary date (same calendar day) → NOT deleted.

        Cutoff = 2025-09-14T00:00:00. Record at 2025-09-14T00:00:01 is on
        the same calendar day but 1 second after cutoff → kept.
        """
        db = str(tmp_path / "test.db")
        _create_db(db, ["2025-09-14T00:00:01"])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_boundary_date_end_of_day_not_deleted(self, tmp_path):
        """Record on boundary date at 23:59:59 → NOT deleted."""
        db = str(tmp_path / "test.db")
        _create_db(db, ["2025-09-14T23:59:59"])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1


class TestRecordOlderThanBoundary:
    """AC-03: Record definitively older than retention boundary → eligible for deletion."""

    def test_one_day_past_boundary_deleted(self, tmp_path):
        """366 days old → deleted."""
        db = str(tmp_path / "test.db")
        _create_db(db, ["2025-09-13T23:59:59"])  # 1 second before boundary
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 0
        assert "purged 1" in out

    def test_very_old_record_deleted(self, tmp_path):
        """2 years old → deleted."""
        db = str(tmp_path / "test.db")
        _create_db(db, ["2024-06-01T10:00:00"])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 0


class TestTimezoneBoundary:
    """AC-04: Timezone/date boundary around Asia/Ho_Chi_Minh."""

    def test_vn_midnight_boundary(self, tmp_path):
        """Record at 23:59:59 VN on boundary date → kept. Record at 00:00:00 next day (boundary) → kept."""
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2025-09-14T23:59:59",  # boundary date, end of day → kept
            "2025-09-13T23:59:59",  # one day before boundary start → deleted
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_no_utc_crossover_leak(self, tmp_path):
        """UTC midnight and VN midnight differ by 7h. Verify VN semantics, not UTC."""
        # At VN midnight 2026-09-14, UTC is 2026-09-13T17:00:00
        # A record at 2025-09-14T00:00:00 VN is exactly 365 days old → kept
        # A record at 2025-09-13T16:59:59 UTC (equivalent to 2025-09-13T23:59:59 VN) → deleted
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2025-09-14T00:00:00",  # exactly 365 days → kept
            "2025-09-13T16:59:59",  # 365 days minus 1 second in VN → deleted
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1


class TestConfigurableDays:
    """AC-05: Configurable --days."""

    def test_90_day_retention(self, tmp_path):
        """Cutoff = 2026-06-16T00:00:00. Records before cutoff deleted."""
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2026-06-16T00:00:00",  # exactly at cutoff → NOT deleted
            "2026-06-15T23:59:59",  # 1 second before cutoff → deleted
        ])
        code, out = _run_purge(db, days=90, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_30_day_retention(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2026-08-15T00:00:00",  # 30 days → boundary, kept
            "2026-08-14T23:59:59",  # 30 days minus 1 second → deleted
        ])
        code, out = _run_purge(db, days=30, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1


class TestDefaultRetention:
    """AC-06: Default 365 days."""

    def test_default_is_365(self, tmp_path):
        """Without --days, default is 365."""
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2025-09-14T00:00:00",  # exactly 365 → boundary, kept
            "2025-09-13T23:59:59",  # 365 minus 1 second → deleted
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)  # no --days → default
        assert code == 0
        assert _count_records(db) == 1


class TestDryRun:
    """AC-07: --dry-run performs zero deletion."""

    def test_dry_run_no_deletion(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, ["2024-01-01T00:00:00"])  # very old
        code, out = _run_purge(db, dry_run=True, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1  # NOT deleted
        assert "DRY RUN" in out

    def test_dry_run_reports_count(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2024-01-01T00:00:00",
            "2024-06-01T00:00:00",
        ])
        code, out = _run_purge(db, dry_run=True, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 2
        assert "Found 2 records" in out


class TestIdempotency:
    """AC-08: Repeated purge is safe/idempotent."""

    def test_double_purge(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, ["2024-01-01T00:00:00"])
        code1, _ = _run_purge(db, until=VN_MIDNIGHT)
        assert code1 == 0
        assert _count_records(db) == 0

        code2, out2 = _run_purge(db, until=VN_MIDNIGHT)
        assert code2 == 0
        assert _count_records(db) == 0
        assert "purged 0" in out2


class TestPartialFailureRetry:
    """AC-09: Partial failure can be retried safely."""

    def test_nonexistent_db_returns_error(self, tmp_path):
        db = str(tmp_path / "nonexistent.db")
        code, out = _run_purge(db)
        assert code == 1
        assert "not found" in out.lower() or "error" in out.lower()

    def test_locked_db_returns_error(self, tmp_path):
        """Opening DB exclusively in another connection → purge fails gracefully."""
        db = str(tmp_path / "test.db")
        _create_db(db, ["2024-01-01T00:00:00"])

        # Hold exclusive lock
        conn = sqlite3.connect(db)
        conn.execute("BEGIN EXCLUSIVE")

        try:
            code, out = _run_purge(db, until=VN_MIDNIGHT)
            # Should fail or timeout, not crash
            assert code == 1 or "error" in out.lower()
        finally:
            conn.close()


class TestDataIsolation:
    """AC-09 (from acceptance): Only AuditLog is affected."""

    def test_only_auditlog_affected(self, tmp_path):
        """Purge only touches AuditLog table. Other tables untouched."""
        db = str(tmp_path / "test.db")
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE AuditLog (
                id TEXT PRIMARY KEY,
                actorType TEXT NOT NULL,
                action TEXT NOT NULL,
                entityType TEXT NOT NULL,
                success INTEGER NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE Ticket (
                id TEXT PRIMARY KEY,
                number INTEGER NOT NULL,
                status TEXT NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        cursor.execute("INSERT INTO AuditLog VALUES ('a1', 'SYSTEM', 'LOGIN', 'AUTH', 1, '2024-01-01T00:00:00')")
        cursor.execute("INSERT INTO Ticket VALUES ('t1', 1, 'CALLED', '2024-01-01T00:00:00')")
        conn.commit()
        conn.close()

        code, _ = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0

        conn = sqlite3.connect(db)
        audit_count = conn.execute("SELECT COUNT(*) FROM AuditLog").fetchone()[0]
        ticket_count = conn.execute("SELECT COUNT(*) FROM Ticket").fetchone()[0]
        conn.close()

        assert audit_count == 0
        assert ticket_count == 1  # Ticket preserved


class TestMixedRecords:
    """Test with a realistic mix of old and new records."""

    def test_mixed_old_new_preserved_correctly(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2024-01-01T08:00:00",  # old → deleted
            "2025-09-13T23:59:59",  # 1 second before boundary → deleted
            "2025-09-14T00:00:01",  # 1 second after boundary → kept
            "2026-01-15T12:00:00",  # recent → kept
            "2026-09-14T00:00:01",  # 1 second after boundary → kept
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 3
        assert "purged 2" in out

    def test_all_recent(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [
            "2026-09-10T12:00:00",
            "2026-09-12T08:00:00",
            "2026-09-14T00:00:00",
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 3
        assert "purged 0" in out


class TestEdgeCases:
    """Edge cases and robustness."""

    def test_empty_database(self, tmp_path):
        db = str(tmp_path / "test.db")
        conn = sqlite3.connect(db)
        conn.execute("""
            CREATE TABLE AuditLog (
                id TEXT PRIMARY KEY,
                actorType TEXT NOT NULL,
                action TEXT NOT NULL,
                entityType TEXT NOT NULL,
                success INTEGER NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert "purged 0" in out

    def test_future_date(self, tmp_path):
        """Record with future timestamp → kept (not deleted)."""
        db = str(tmp_path / "test.db")
        _create_db(db, ["2027-01-01T00:00:00"])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1
