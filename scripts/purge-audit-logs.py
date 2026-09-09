#!/usr/bin/env python3
"""
BAMSO Audit Log Retention Purge Script
======================================
Purges AuditLog records older than the specified retention period (default 365 days).

Usage:
    python scripts/purge-audit-logs.py                     # default 365 days
    python scripts/purge-audit-logs.py --days 180           # custom retention
    python scripts/purge-audit-logs.py --db prisma/dev.db   # custom db path
    python scripts/purge-audit-logs.py --dry-run            # report without deleting
"""

import sqlite3
import os
import sys
import argparse
import datetime
import logging

DEFAULT_DB_PATH = "prisma/dev.db"
DEFAULT_RETENTION_DAYS = 365
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
    return parser.parse_args()


def purge_audit_logs(db_path: str, retention_days: int, dry_run: bool = False):
    if not os.path.exists(db_path):
        logger.error(f"Database not found: {db_path}")
        return 1

    cutoff_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=retention_days)
    cutoff_iso = cutoff_date.strftime("%Y-%m-%dT%H:%M:%S")

    logger.info(f"Purging audit logs older than {retention_days} days (cutoff: {cutoff_iso})")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check total matching rows
        cursor.execute(
            "SELECT COUNT(*) FROM AuditLog WHERE createdAt < ?",
            (cutoff_iso,),
        )
        match_count = cursor.fetchone()[0]

        if dry_run:
            logger.info(f"[DRY RUN] Found {match_count} records older than {cutoff_iso}. No records deleted.")
            conn.close()
            return 0

        cursor.execute(
            "DELETE FROM AuditLog WHERE createdAt < ?",
            (cutoff_iso,),
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
    code = purge_audit_logs(args.db, args.days, args.dry_run)
    sys.exit(code)
