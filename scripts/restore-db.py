#!/usr/bin/env python3
"""
BAMSO SQLite Restore Script
============================
Restores a BAMSO SQLite database from a backup.

THIS SCRIPT MUST BE RUN MANUALLY — it requires explicit confirmation.
It will NOT automatically overwrite production data.

Usage:
    python scripts/restore-db.py --backup backups/bamso_20260831_120000.db
    python scripts/restore-db.py --backup backups/bamso_20260831_120000.db --db prisma/prod.db
    python scripts/restore-db.py --backup backups/bamso_20260831_120000.db --dry-run

Requirements: Python 3.x with sqlite3 module (standard library).

WARNING: This script will STOP the BAMSO server before restore and restart after.
"""

import sqlite3
import os
import sys
import shutil
import datetime
import argparse
import logging
import subprocess
import time

DEFAULT_DB_PATH = "prisma/dev.db"
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("restore")


def parse_args():
    parser = argparse.ArgumentParser(description="BAMSO SQLite Restore")
    parser.add_argument(
        "--backup",
        required=True,
        help="Path to backup file to restore from",
    )
    parser.add_argument(
        "--db",
        default=os.environ.get("BAMSO_DATABASE_PATH", DEFAULT_DB_PATH),
        help="Target database path to restore to",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without doing it",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip confirmation prompt",
    )
    return parser.parse_args()


def resolve_database_path(db_path):
    """Resolve database path relative to project root."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    if not os.path.isabs(db_path):
        resolved = os.path.join(project_root, db_path)
    else:
        resolved = db_path

    return resolved


def verify_backup_file(backup_path):
    """Verify the backup file is a valid SQLite database."""
    if not os.path.exists(backup_path):
        return False, f"Backup file not found: {backup_path}"

    if os.path.getsize(backup_path) == 0:
        return False, f"Backup file is empty: {backup_path}"

    try:
        conn = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()

        if result[0] != "ok":
            return False, f"Backup integrity check failed: {result[0]}"

        return True, None
    except sqlite3.Error as e:
        return False, f"Cannot open backup file: {e}"


def stop_bamso_server(dry_run=False):
    """Stop the BAMSO server if running."""
    if dry_run:
        logger.info("[DRY RUN] Would stop BAMSO server")
        return True

    # Try to find and stop the Node.js process
    try:
        # Use tasklist to find node processes
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq node.exe", "/FO", "CSV"],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )

        if "node.exe" not in result.stdout:
            logger.info("BAMSO server not running — no process to stop")
            return True

        logger.info("Stopping BAMSO server...")

        # Kill node processes (this is aggressive — in production, use a graceful shutdown)
        subprocess.run(
            ["taskkill", "/F", "/IM", "node.exe"],
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )

        time.sleep(2)  # Wait for process to fully terminate
        logger.info("BAMSO server stopped")
        return True

    except Exception as e:
        logger.warning(f"Could not stop BAMSO server: {e}")
        logger.warning("Please stop the server manually before restoring")
        return False


def start_bamso_server(project_root, dry_run=False):
    """Start the BAMSO server."""
    if dry_run:
        logger.info("[DRY RUN] Would start BAMSO server")
        return True

    try:
        logger.info("Starting BAMSO server...")

        # Start in background using npm start
        subprocess.Popen(
            ["npm", "run", "start:https"],
            cwd=project_root,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
        )

        time.sleep(3)  # Wait for server to start
        logger.info("BAMSO server started")
        return True

    except Exception as e:
        logger.error(f"Could not start BAMSO server: {e}")
        return False


def restore_database(backup_path, target_path, dry_run=False):
    """
    Restore database from backup.

    Returns (success, error_message).
    """
    try:
        if dry_run:
            logger.info(f"[DRY RUN] Would restore: {backup_path} -> {target_path}")
            return True, None

        # Create target directory if needed
        target_dir = os.path.dirname(target_path)
        if target_dir:
            os.makedirs(target_dir, exist_ok=True)

        # Copy backup to target
        shutil.copy2(backup_path, target_path)

        # Verify restored file
        if not os.path.exists(target_path):
            return False, "Restored file not found after copy"

        restored_size = os.path.getsize(target_path)
        logger.info(f"Database restored: {target_path} ({restored_size:,} bytes)")

        return True, None

    except Exception as e:
        return False, f"Restore failed: {e}"


def main():
    args = parse_args()

    backup_path = os.path.abspath(args.backup)
    target_path = resolve_database_path(args.db)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    logger.info(f"BAMSO Restore — {datetime.datetime.now().isoformat()}")
    logger.info(f"Backup:  {backup_path}")
    logger.info(f"Target:  {target_path}")

    if args.dry_run:
        logger.info("MODE: DRY RUN")

    # Step 1: Verify backup file
    logger.info("Step 1: Verifying backup file...")
    success, error = verify_backup_file(backup_path)
    if not success:
        logger.error(f"BACKUP VERIFICATION FAILED: {error}")
        return 1
    logger.info("Backup file verified: valid SQLite database")

    # Step 2: Confirm restore
    if not args.force and not args.dry_run:
        logger.warning("=" * 60)
        logger.warning("WARNING: This will OVERWRITE the current database!")
        logger.warning(f"  Target: {target_path}")
        logger.warning(f"  Backup: {backup_path}")
        logger.warning("=" * 60)

        response = input("Type 'RESTORE' to confirm: ").strip()
        if response != "RESTORE":
            logger.info("Restore cancelled by user")
            return 0

    # Step 3: Backup current database (safety net)
    if os.path.exists(target_path) and not args.dry_run:
        logger.info("Step 3: Backing up current database (safety net)...")
        safety_backup = f"{target_path}.pre-restore-{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(target_path, safety_backup)
        logger.info(f"Safety backup: {safety_backup}")
    else:
        logger.info("Step 3: No existing database to backup (or dry run)")

    # Step 4: Stop BAMSO server
    logger.info("Step 4: Stopping BAMSO server...")
    if not stop_bamso_server(args.dry_run):
        logger.error("Cannot stop server — aborting restore")
        return 1

    # Step 5: Restore database
    logger.info("Step 5: Restoring database...")
    success, error = restore_database(backup_path, target_path, args.dry_run)
    if not success:
        logger.error(f"RESTORE FAILED: {error}")
        logger.info("Attempting to restart server...")
        start_bamso_server(project_root, args.dry_run)
        return 1

    # Step 6: Verify restored database
    logger.info("Step 6: Verifying restored database...")
    try:
        conn = sqlite3.connect(f"file:{target_path}?mode=ro", uri=True)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        conn.close()

        if result[0] != "ok":
            logger.error(f"Restored database integrity check failed: {result[0]}")
            return 1

        logger.info(f"Integrity check: ok")
        logger.info(f"Tables: {[t[0] for t in tables]}")

    except sqlite3.Error as e:
        logger.error(f"Verification error: {e}")
        return 1

    # Step 7: Restart BAMSO server
    logger.info("Step 7: Restarting BAMSO server...")
    start_bamso_server(project_root, args.dry_run)

    logger.info("RESTORE COMPLETE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
