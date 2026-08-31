#!/usr/bin/env python3
"""
BAMSO SQLite Backup Script
==========================
Creates a consistent backup of the BAMSO SQLite database using
SQLite's online backup API (sqlite3.backup).

Consistency: Uses SQLite backup API — creates a consistent snapshot
even while the BAMSO server is running and the database is in use.

Requirements: Python 3.x with sqlite3 module (standard library).

Usage:
    python scripts/backup-db.ps1                     # default paths
    python scripts/backup-db.ps1 --db prisma/prod.db  # custom db path
    python scripts/backup-db.ps1 --dir D:/backups     # custom backup dir
    python scripts/backup-db.ps1 --retention 7        # keep 7 days

Environment variables (override defaults):
    BAMSO_BACKUP_DIR       — backup destination directory
    BAMSO_DATABASE_PATH    — source database path
    BAMSO_RETENTION_DAYS   — days to keep backups
"""

import sqlite3
import os
import sys
import time
import datetime
import glob
import argparse
import logging

# --- Configuration ---
DEFAULT_DB_PATH = "prisma/dev.db"
DEFAULT_BACKUP_DIR = "backups"
DEFAULT_RETENTION_DAYS = 30
BACKUP_PREFIX = "bamso_"
BACKUP_SUFFIX = ".db"
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("backup")


def parse_args():
    parser = argparse.ArgumentParser(description="BAMSO SQLite Backup")
    parser.add_argument(
        "--db",
        default=os.environ.get("BAMSO_DATABASE_PATH", DEFAULT_DB_PATH),
        help="Source database path",
    )
    parser.add_argument(
        "--dir",
        default=os.environ.get("BAMSO_BACKUP_DIR", DEFAULT_BACKUP_DIR),
        help="Backup destination directory",
    )
    parser.add_argument(
        "--retention",
        type=int,
        default=int(os.environ.get("BAMSO_RETENTION_DAYS", DEFAULT_RETENTION_DAYS)),
        help="Days to keep backups",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without doing it",
    )
    return parser.parse_args()


def resolve_database_path(db_path):
    """Resolve database path relative to project root."""
    # Try relative to script location first
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    # If path is relative, resolve from project root
    if not os.path.isabs(db_path):
        resolved = os.path.join(project_root, db_path)
    else:
        resolved = db_path

    return resolved


def create_backup(src_path, dst_dir, dry_run=False):
    """
    Create a consistent backup using SQLite online backup API.

    Returns (success, backup_path, error_message).
    """
    # Verify source exists
    if not os.path.exists(src_path):
        return False, None, f"Source database not found: {src_path}"

    # Generate backup filename
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{BACKUP_PREFIX}{timestamp}{BACKUP_SUFFIX}"
    backup_path = os.path.join(dst_dir, backup_name)

    if dry_run:
        logger.info(f"[DRY RUN] Would backup: {src_path} -> {backup_path}")
        return True, backup_path, None

    try:
        # Open source database in read-only mode
        src_conn = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)

        # Create destination directory if needed
        os.makedirs(dst_dir, exist_ok=True)

        # Create backup using SQLite online backup API
        dst_conn = sqlite3.connect(backup_path)
        src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()

        # Verify backup exists and has content
        if not os.path.exists(backup_path):
            return False, backup_path, "Backup file was not created"

        backup_size = os.path.getsize(backup_path)
        if backup_size == 0:
            os.remove(backup_path)
            return False, backup_path, "Backup file is empty (0 bytes)"

        logger.info(f"Backup created: {backup_path} ({backup_size:,} bytes)")
        return True, backup_path, None

    except sqlite3.Error as e:
        # Clean up partial backup
        if os.path.exists(backup_path):
            try:
                os.remove(backup_path)
            except OSError:
                pass
        return False, backup_path, f"SQLite backup failed: {e}"
    except OSError as e:
        return False, backup_path, f"File system error: {e}"


def verify_backup(backup_path, dry_run=False):
    """
    Verify backup integrity using PRAGMA integrity_check.

    Returns (success, error_message).
    """
    if dry_run:
        logger.info(f"[DRY RUN] Would verify: {backup_path}")
        return True, None

    try:
        conn = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()

        if result[0] != "ok":
            return False, f"Integrity check failed: {result[0]}"

        logger.info("Integrity check: ok")
        return True, None

    except sqlite3.Error as e:
        return False, f"Integrity check error: {e}"


def apply_retention(backup_dir, retention_days, dry_run=False):
    """
    Delete backup files older than retention_days.

    Only deletes files matching BAMSO backup naming convention.
    Returns (deleted_count, error_message).
    """
    cutoff = datetime.datetime.now() - datetime.timedelta(days=retention_days)
    pattern = os.path.join(backup_dir, f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}")

    deleted = 0
    errors = []

    for backup_file in sorted(glob.glob(pattern)):
        try:
            # Extract timestamp from filename
            basename = os.path.basename(backup_file)
            # Remove prefix and suffix: bamso_YYYYMMDD_HHmmss.db
            ts_str = basename[len(BACKUP_PREFIX):-len(BACKUP_SUFFIX)]
            file_time = datetime.datetime.strptime(ts_str, "%Y%m%d_%H%M%S")

            if file_time < cutoff:
                if dry_run:
                    logger.info(f"[DRY RUN] Would delete: {backup_file}")
                else:
                    os.remove(backup_file)
                    logger.info(f"Deleted old backup: {basename}")
                deleted += 1

        except (ValueError, OSError) as e:
            errors.append(f"{backup_file}: {e}")

    error_msg = "; ".join(errors) if errors else None
    return deleted, error_msg


def main():
    args = parse_args()

    # Resolve paths
    src_path = resolve_database_path(args.db)
    backup_dir = os.path.abspath(args.dir)

    logger.info(f"BAMSO Backup — {datetime.datetime.now().isoformat()}")
    logger.info(f"Source:      {src_path}")
    logger.info(f"Destination: {backup_dir}")
    logger.info(f"Retention:   {args.retention} days")

    if args.dry_run:
        logger.info("MODE: DRY RUN")

    # Step 1: Create backup
    success, backup_path, error = create_backup(src_path, backup_dir, args.dry_run)
    if not success:
        logger.error(f"BACKUP FAILED: {error}")
        return 1

    # Step 2: Verify backup integrity
    success, error = verify_backup(backup_path, args.dry_run)
    if not success:
        logger.error(f"VERIFICATION FAILED: {error}")
        return 1

    # Step 3: Apply retention
    deleted, error = apply_retention(backup_dir, args.retention, args.dry_run)
    if error:
        logger.warning(f"Retention warning: {error}")
    else:
        logger.info(f"Retention: deleted {deleted} old backup(s)")

    logger.info("BACKUP COMPLETE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
