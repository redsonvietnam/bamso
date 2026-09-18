#!/usr/bin/env python3
"""
BAMSO Audit Log Retention Purge Script
======================================
Purges AuditLog records older than the specified retention period (default 365 days).

Cutoff semantics: Asia/Ho_Chi_Minh business-day boundary.
Cutoff = start_of_today_VN - retention_days, converted to Unix epoch milliseconds.

Persisted AuditLog.createdAt is INTEGER epoch milliseconds (Prisma/SQLite).
This script computes the cutoff in the same INTEGER representation and passes it
as a numeric parameter to SQLite for correct type-comparable deletion.

Usage:
    python scripts/purge-audit-logs.py                     # default 365 days
    python scripts/purge-audit-logs.py --days 180           # custom retention
    python scripts/purge-audit-logs.py --db prisma/dev.db   # custom db path
    python scripts/purge-audit-logs.py --dry-run            # report without deleting

Testing:
    --until <ISO8601>   Override current time for deterministic testing.
                        Interpreted as Asia/Ho_Chi_Minh local time.
                        Example: --until 2026-09-14T00:00:00
"""

import sqlite3
import os
import sys
import argparse
import datetime
import logging
from zoneinfo import ZoneInfo

DEFAULT_DB_PATH = "prisma/dev.db"
DEFAULT_RETENTION_DAYS = 365
VN_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("audit-purge")


def parse_args():
    parser = argparse.ArgumentParser(description="BAMSO Audit Log Retention Purge")
    parser.add_argument(
        "--db",
        default=os.environ.get("BAMSO_DATABASE_PATH", DEFAULT_DB_PATH),
        help=f"Database path (default: {DEFAULT_DB_PATH})",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=int(os.environ.get("BAMSO_AUDIT_RETENTION_DAYS", DEFAULT_RETENTION_DAYS)),
        help=f"Retention period in days (default: {DEFAULT_RETENTION_DAYS})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Calculate purge candidates without deleting",
    )
    parser.add_argument(
        "--until",
        help="Override current time for deterministic testing (ISO 8601, "
             "interpreted as Asia/Ho_Chi_Minh local time). "
             "Example: --until 2026-09-14T00:00:00",
    )
    return parser.parse_args()


def _start_of_today_vn(now_vn: datetime.datetime) -> datetime.datetime:
    """Return start of today (midnight) in Asia/Ho_Chi_Minh."""
    return now_vn.replace(hour=0, minute=0, second=0, microsecond=0)


def compute_cutoff_epoch_ms(now_vn: datetime.datetime, retention_days: int) -> int:
    """Compute the retention cutoff as Unix epoch milliseconds.

    Matches the TypeScript purgeAuditLogs in audit-service.ts:
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

    Where days are counted in VN business-day semantics.
    Production AuditLog.createdAt stores INTEGER epoch milliseconds.
    Cutoff must be INTEGER for correct numeric comparison in SQLite.

    Returns: int (Unix epoch milliseconds, UTC)
    """
    start_of_today = _start_of_today_vn(now_vn)
    cutoff_vn = start_of_today - datetime.timedelta(days=retention_days)
    cutoff_utc = cutoff_vn.astimezone(datetime.timezone.utc)
    # Convert to epoch milliseconds: (seconds * 1000) + microseconds//1000
    epoch_sec = cutoff_utc.timestamp()
    return int(epoch_sec * 1000)


def purge_audit_logs(db_path: str, retention_days: int, dry_run: bool = False,
                     until: str | None = None):
    if not os.path.exists(db_path):
        logger.error(f"Database not found: {db_path}")
        return 1

    if until:
        now_vn = datetime.datetime.fromisoformat(until).replace(tzinfo=VN_TIMEZONE)
    else:
        now_vn = datetime.datetime.now(VN_TIMEZONE)

    cutoff_ms = compute_cutoff_epoch_ms(now_vn, retention_days)

    # Human-readable UTC cutoff for logging
    cutoff_utc_dt = datetime.datetime.fromtimestamp(cutoff_ms / 1000, tz=datetime.timezone.utc)
    cutoff_utc_str = cutoff_utc_dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{cutoff_ms % 1000:03d}Z"

    logger.info(f"Timezone: Asia/Ho_Chi_Minh (UTC+7)")
    logger.info(f"Current VN time: {now_vn.strftime('%Y-%m-%dT%H:%M:%S %Z')}")
    logger.info(f"Retention: {retention_days} days")
    logger.info(f"Cutoff (UTC): {cutoff_utc_str}")
    logger.info(f"Cutoff (epoch ms): {cutoff_ms}")
    logger.info(f"Purging audit logs older than {cutoff_ms}")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Pass cutoff as INTEGER for numeric comparison against INTEGER createdAt
        cursor.execute(
            "SELECT COUNT(*) FROM AuditLog WHERE createdAt < ?",
            (cutoff_ms,),
        )
        match_count = cursor.fetchone()[0]

        if dry_run:
            logger.info(f"[DRY RUN] Found {match_count} records older than {cutoff_ms}. No records deleted.")
            conn.close()
            return 0

        # INTEGER createdAt compared against INTEGER cutoff — correct numeric comparison
        cursor.execute(
            "DELETE FROM AuditLog WHERE createdAt < ?",
            (cutoff_ms,),
        )
        deleted = cursor.rowcount
        conn.commit()
        conn.close()

        logger.info(f"Successfully purged {deleted} audit log records.")
        return 0
    except sqlite3.OperationalError as e:
        logger.error(f"SQLite operational error during audit purge: {e}")
        return 1
    except Exception as e:
        logger.error(f"Unexpected error during audit purge: {e}")
        return 1


if __name__ == "__main__":
    args = parse_args()
    code = purge_audit_logs(args.db, args.days, args.dry_run, args.until)
    sys.exit(code)
