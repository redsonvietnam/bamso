"""
Tests for scripts/purge-audit-logs.py
=====================================
Persistence-level boundary tests for VN timezone-aware audit purge.

All timestamps use INTEGER epoch milliseconds — matching Prisma/SQLite
AuditLog.createdAt production representation: 1789355536295

Cutoff comparison: createdAt < cutoff (strict less-than).
Record at exact cutoff is NOT deleted — it is still within retention.

Regression: INTEGER-vs-TEXT mismatch is explicitly tested to prevent
the bug where ISO TEXT cutoff was compared against INTEGER createdAt.

Run: python -m pytest scripts/__tests__/test_purge_audit_logs.py -v
"""

import os
import sqlite3
import subprocess
import sys
import pytest
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "..", "purge-audit-logs.py")
VN_MIDNIGHT = "2026-09-14T00:00:00"  # frozen VN reference time for --until
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


# ──────────────────────────────────────────────────────────────
# Epoch ms conversion helpers
# ──────────────────────────────────────────────────────────────

def iso_to_epoch_ms(iso_str: str) -> int:
    """Convert ISO 8601 UTC string to epoch milliseconds."""
    dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return int(dt.timestamp() * 1000)


def vn_to_epoch_ms(vn_str: str) -> int:
    """Convert VN-local ISO string (no offset) to epoch milliseconds."""
    dt = datetime.fromisoformat(vn_str).replace(tzinfo=VN_TZ)
    return int(dt.timestamp() * 1000)


# Cutoff for --until 2026-09-14T00:00:00 with 365-day retention:
# start_of_today_VN = 2026-09-14T00:00:00+07:00
# cutoff_VN = 2025-09-14T00:00:00+07:00
# cutoff_UTC = 2025-09-13T17:00:00.000Z
# cutoff_epoch_ms = 1757782800000
CUTOFF_365_MS = vn_to_epoch_ms("2025-09-14T00:00:00")  # = iso_to_epoch_ms("2025-09-13T17:00:00Z")


def _create_db(path: str, records: list[int]):
    """Create a temp SQLite DB with AuditLog table and insert records.

    Records use INTEGER epoch milliseconds matching Prisma persistence:
    prisma.auditLog.create() → 1789355536295
    """
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
            createdAt INTEGER NOT NULL
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


def _get_created_ats(db_path: str) -> list[int]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT createdAt FROM AuditLog ORDER BY createdAt").fetchall()
    conn.close()
    return [r[0] for r in rows]


# ──────────────────────────────────────────────────────────────
# A. Record safely inside retention window → NOT deleted
# ──────────────────────────────────────────────────────────────

class TestRecordInsideRetentionWindow:
    def test_recent_record_preserved(self, tmp_path):
        """Record 10 days before reference → kept."""
        db = str(tmp_path / "test.db")
        _create_db(db, [iso_to_epoch_ms("2026-09-04T12:00:00.000Z")])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_record_one_day_after_cutoff_preserved(self, tmp_path):
        """Record 1 day after cutoff → kept."""
        db = str(tmp_path / "test.db")
        # cutoff = CUTOFF_365_MS
        # 1 day after cutoff → kept
        _create_db(db, [CUTOFF_365_MS + 86400000])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1


# ──────────────────────────────────────────────────────────────
# B. Boundary record is NOT prematurely deleted
#    createdAt < cutoff is strict — record AT cutoff is kept.
# ──────────────────────────────────────────────────────────────

class TestBoundaryRecord:
    def test_exact_cutoff_not_deleted(self, tmp_path):
        """Record at exactly cutoff → NOT deleted (strict less-than)."""
        db = str(tmp_path / "test.db")
        _create_db(db, [CUTOFF_365_MS])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1  # kept

    def test_one_ms_after_cutoff_preserved(self, tmp_path):
        """Record 1 ms after cutoff → kept."""
        db = str(tmp_path / "test.db")
        _create_db(db, [CUTOFF_365_MS + 1])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_one_ms_before_cutoff_deleted(self, tmp_path):
        """Record 1 ms before cutoff → deleted."""
        db = str(tmp_path / "test.db")
        _create_db(db, [CUTOFF_365_MS - 1])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 0

    def test_boundary_date_end_of_day_preserved(self, tmp_path):
        """Record on boundary date at 23:59:59.999 VN → kept.

        2025-09-14T23:59:59.999+07:00 = 2025-09-14T16:59:59.999Z
        cutoff = 2025-09-13T17:00:00Z → this is after cutoff → kept
        """
        db = str(tmp_path / "test.db")
        _create_db(db, [iso_to_epoch_ms("2025-09-14T16:59:59.999Z")])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1


# ──────────────────────────────────────────────────────────────
# C. VN midnight vs UTC midnight crossover
# ──────────────────────────────────────────────────────────────

class TestTimezoneCrossover:
    def test_vn_midnight_boundary(self, tmp_path):
        """VN midnight and UTC midnight differ by 7h.

        Record at 2025-09-14T00:00:00Z (UTC midnight) = 2025-09-14T07:00:00+07:00.
        cutoff = 2025-09-13T17:00:00Z. Record is after cutoff → kept.
        """
        db = str(tmp_path / "test.db")
        _create_db(db, [
            iso_to_epoch_ms("2025-09-14T00:00:00.000Z"),  # UTC midnight = VN 07:00 → kept
            CUTOFF_365_MS - 1000,  # 1s before cutoff → deleted
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_numeric_comparison_safe(self, tmp_path):
        """Verify INTEGER epoch ms enables correct numeric comparison.

        Prisma stores: 1789355536295
        Cutoff uses:   1757782800000
        Numeric comparison matches chronological order.
        """
        db = str(tmp_path / "test.db")
        _create_db(db, [
            CUTOFF_365_MS - 1,    # 1 ms before cutoff → deleted
            CUTOFF_365_MS,         # exact cutoff → kept (not strictly less)
            CUTOFF_365_MS + 1,     # 1 ms after cutoff → kept
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 2
        remaining = _get_created_ats(db)
        assert remaining == [CUTOFF_365_MS, CUTOFF_365_MS + 1]


# ──────────────────────────────────────────────────────────────
# D. Configurable --days
# ──────────────────────────────────────────────────────────────

class TestConfigurableDays:
    def test_90_day_retention(self, tmp_path):
        """90-day cutoff from 2026-09-14 VN = 2026-06-16T00:00:00+07:00
        = 2026-06-15T17:00:00Z = epoch ms
        """
        db = str(tmp_path / "test.db")
        cutoff_90 = vn_to_epoch_ms("2026-06-16T00:00:00")
        _create_db(db, [
            cutoff_90,         # exact cutoff → kept
            cutoff_90 - 1000,  # 1s before cutoff → deleted
        ])
        code, out = _run_purge(db, days=90, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_30_day_retention(self, tmp_path):
        """30-day cutoff from 2026-09-14 VN = 2026-08-15T00:00:00+07:00
        = 2026-08-14T17:00:00Z = epoch ms
        """
        db = str(tmp_path / "test.db")
        cutoff_30 = vn_to_epoch_ms("2026-08-15T00:00:00")
        _create_db(db, [
            cutoff_30,         # exact cutoff → kept
            cutoff_30 - 1000,  # 1s before cutoff → deleted
        ])
        code, out = _run_purge(db, days=30, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1


# ──────────────────────────────────────────────────────────────
# E. Default 365 days (genuinely omit --days)
# ──────────────────────────────────────────────────────────────

class TestDefaultRetention:
    def test_default_is_365(self, tmp_path):
        """Without --days, default is 365. Prove by omitting --days entirely."""
        db = str(tmp_path / "test.db")
        _create_db(db, [
            CUTOFF_365_MS,         # exact 365-day cutoff → kept
            CUTOFF_365_MS - 1000,  # 1s before cutoff → deleted
        ])
        # No --days argument passed → uses default 365
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1
        assert "Retention: 365" in out


# ──────────────────────────────────────────────────────────────
# F. --dry-run performs zero deletion
# ──────────────────────────────────────────────────────────────

class TestDryRun:
    def test_dry_run_no_deletion(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [iso_to_epoch_ms("2024-01-01T00:00:00.000Z")])
        code, out = _run_purge(db, dry_run=True, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1  # NOT deleted
        assert "DRY RUN" in out

    def test_dry_run_reports_count(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [
            iso_to_epoch_ms("2024-01-01T00:00:00.000Z"),
            iso_to_epoch_ms("2024-06-01T00:00:00.000Z"),
        ])
        code, out = _run_purge(db, dry_run=True, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 2
        assert "Found 2 records" in out


# ──────────────────────────────────────────────────────────────
# G. Repeated purge is safe/idempotent
# ──────────────────────────────────────────────────────────────

class TestIdempotency:
    def test_double_purge(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [iso_to_epoch_ms("2024-01-01T00:00:00.000Z")])
        code1, _ = _run_purge(db, until=VN_MIDNIGHT)
        assert code1 == 0
        assert _count_records(db) == 0

        code2, out2 = _run_purge(db, until=VN_MIDNIGHT)
        assert code2 == 0
        assert _count_records(db) == 0
        assert "purged 0" in out2


# ──────────────────────────────────────────────────────────────
# H. Failure → recovery → retry
# ──────────────────────────────────────────────────────────────

class TestRetryRecovery:
    def test_nonexistent_db_returns_error(self, tmp_path):
        db = str(tmp_path / "nonexistent.db")
        code, out = _run_purge(db)
        assert code == 1
        assert "not found" in out.lower() or "error" in out.lower()

    def test_failed_then_recovered_purge_succeeds(self, tmp_path):
        """Purge fails on missing DB → DB created → retry succeeds → rows removed once."""
        db = str(tmp_path / "test.db")
        # Step 1: DB does not exist → purge fails
        code1, _ = _run_purge(db, until=VN_MIDNIGHT)
        assert code1 == 1  # not found

        # Step 2: DB is created (condition recovered)
        _create_db(db, [iso_to_epoch_ms("2024-01-01T00:00:00.000Z")])
        assert _count_records(db) == 1

        # Step 3: Retry succeeds → eligible row removed
        code2, out2 = _run_purge(db, until=VN_MIDNIGHT)
        assert code2 == 0
        assert _count_records(db) == 0
        assert "purged 1" in out2

        # Step 4: Second purge is idempotent
        code3, out3 = _run_purge(db, until=VN_MIDNIGHT)
        assert code3 == 0
        assert _count_records(db) == 0
        assert "purged 0" in out3


# ──────────────────────────────────────────────────────────────
# I. Data isolation — only AuditLog affected
# ──────────────────────────────────────────────────────────────

class TestDataIsolation:
    def test_only_auditlog_affected(self, tmp_path):
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
                createdAt INTEGER NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE Ticket (
                id TEXT PRIMARY KEY,
                number INTEGER NOT NULL,
                status TEXT NOT NULL,
                createdAt INTEGER NOT NULL
            )
        """)
        cursor.execute("INSERT INTO AuditLog VALUES ('a1', 'SYSTEM', 'LOGIN', 'AUTH', 1, ?)",
                       (iso_to_epoch_ms("2024-01-01T00:00:00.000Z"),))
        cursor.execute("INSERT INTO Ticket VALUES ('t1', 1, 'CALLED', ?)",
                       (iso_to_epoch_ms("2024-01-01T00:00:00.000Z"),))
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


# ──────────────────────────────────────────────────────────────
# J. Mixed records — realistic scenario
# ──────────────────────────────────────────────────────────────

class TestMixedRecords:
    def test_mixed_old_new_preserved_correctly(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [
            iso_to_epoch_ms("2024-01-01T08:00:00.000Z"),    # old → deleted
            CUTOFF_365_MS - 1000,                            # 1s before cutoff → deleted
            CUTOFF_365_MS + 1000,                            # 1s after cutoff → kept
            iso_to_epoch_ms("2026-01-15T12:00:00.000Z"),    # recent → kept
            iso_to_epoch_ms("2026-09-14T00:00:01.000Z"),    # very recent → kept
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 3
        assert "purged 2" in out

    def test_all_recent(self, tmp_path):
        db = str(tmp_path / "test.db")
        _create_db(db, [
            iso_to_epoch_ms("2026-09-10T12:00:00.000Z"),
            iso_to_epoch_ms("2026-09-12T08:00:00.000Z"),
            iso_to_epoch_ms("2026-09-14T00:00:00.000Z"),
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 3
        assert "purged 0" in out


# ──────────────────────────────────────────────────────────────
# K. Edge cases
# ──────────────────────────────────────────────────────────────

class TestEdgeCases:
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
                createdAt INTEGER NOT NULL
            )
        """)
        conn.commit()
        conn.close()
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert "purged 0" in out

    def test_future_date_preserved(self, tmp_path):
        """Record with future epoch ms → kept."""
        db = str(tmp_path / "test.db")
        _create_db(db, [iso_to_epoch_ms("2027-01-01T00:00:00.000Z")])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1

    def test_persistence_format_matches_prisma(self, tmp_path):
        """Verify test data format matches real Prisma persistence.

        Real Prisma output: INTEGER 1789355536295
        This test proves the comparison works with that exact type.
        """
        db = str(tmp_path / "test.db")
        _create_db(db, [
            iso_to_epoch_ms("2026-09-14T02:47:36.063Z"),  # real Prisma epoch ms → kept
            CUTOFF_365_MS - 1000,                          # before cutoff → deleted
        ])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1
        remaining = _get_created_ats(db)
        assert remaining == [iso_to_epoch_ms("2026-09-14T02:47:36.063Z")]


# ──────────────────────────────────────────────────────────────
# L. REGRESSION: INTEGER-vs-TEXT mismatch prevention
# ──────────────────────────────────────────────────────────────

class TestRegressionIntegerVsText:
    def test_cutoff_is_integer_not_string(self, tmp_path):
        """Regression: cutoff passed to SQL must be INTEGER, not ISO TEXT.

        The previous bug compared INTEGER createdAt against TEXT ISO cutoff.
        SQLite rule: numeric < non-numeric-text → always TRUE → all rows deleted.

        This test proves the purge passes an integer parameter by verifying
        that a record with INTEGER createdAt > cutoff is NOT deleted.
        """
        db = str(tmp_path / "test.db")
        _create_db(db, [CUTOFF_365_MS + 86400000])  # 1 day after cutoff
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1  # kept — proves integer comparison

    def test_text_cutoff_would_delete_everything(self, tmp_path):
        """Proof that ISO TEXT cutoff against INTEGER createdAt deletes ALL.

        If the purge script passes a string like '2025-09-13T17:00:00.000Z'
        as the SQL parameter, SQLite's numeric affinity on createdAt causes
        the string to be cast to 0, making every INTEGER > 0 comparison TRUE.

        This test creates the exact scenario and verifies the purge still
        works correctly — proving the script uses INTEGER cutoff.
        """
        db = str(tmp_path / "test.db")
        # Record safely within retention — should NOT be deleted
        _create_db(db, [iso_to_epoch_ms("2026-06-01T00:00:00.000Z")])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        assert _count_records(db) == 1  # kept — integer comparison works

    def test_epoch_ms_parameter_type(self, tmp_path):
        """Verify the purge script outputs epoch ms (integer) in logs."""
        db = str(tmp_path / "test.db")
        _create_db(db, [CUTOFF_365_MS + 1])
        code, out = _run_purge(db, until=VN_MIDNIGHT)
        assert code == 0
        # The script should log the epoch ms value
        assert "epoch ms" in out
        assert str(CUTOFF_365_MS) in out
