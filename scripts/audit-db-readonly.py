#!/usr/bin/env python3
"""Strictly read-only SQLite integrity/data audit for BAMSO prisma/dev.db."""
import hashlib
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "prisma" / "dev.db"


def table_exists(conn, name):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def fingerprint(conn, column):
    rows = conn.execute(
        f"SELECT {column} FROM DisplayCallEvent ORDER BY {column}"
    ).fetchall()
    digest = hashlib.sha256()
    for (value,) in rows:
        digest.update(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
        digest.update(b"\n")
    return digest.hexdigest()


def main():
    if not DB_PATH.is_file():
        raise SystemExit(f"DATABASE_NOT_FOUND: {DB_PATH}")

    # SQLite URI mode=ro prevents SQLite writes through this connection.
    conn = sqlite3.connect(DB_PATH.as_uri() + "?mode=ro", uri=True)
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk_rows = conn.execute("PRAGMA foreign_key_check").fetchall()

        if not table_exists(conn, "DisplayCallEvent"):
            raise SystemExit("MISSING_TABLE: DisplayCallEvent")

        total = conn.execute("SELECT COUNT(*) FROM DisplayCallEvent").fetchone()[0]
        distinct_id = conn.execute("SELECT COUNT(DISTINCT id) FROM DisplayCallEvent").fetchone()[0]
        distinct_event_id = conn.execute("SELECT COUNT(DISTINCT eventId) FROM DisplayCallEvent").fetchone()[0]
        distinct_ticket_id = conn.execute("SELECT COUNT(DISTINCT ticketId) FROM DisplayCallEvent").fetchone()[0]
        status = conn.execute(
            "SELECT status, COUNT(*) FROM DisplayCallEvent GROUP BY status ORDER BY status"
        ).fetchall()
        min_created = conn.execute("SELECT MIN(createdAt) FROM DisplayCallEvent").fetchone()[0]
        max_created = conn.execute("SELECT MAX(createdAt) FROM DisplayCallEvent").fetchone()[0]
        call_next_key_nonnull = conn.execute(
            "SELECT COUNT(*) FROM DisplayCallEvent WHERE callNextKey IS NOT NULL"
        ).fetchone()[0]
        sequence_nonzero = conn.execute(
            "SELECT COUNT(*) FROM DisplayCallEvent WHERE sequence != 0"
        ).fetchone()[0]

        result = {
            "db": str(DB_PATH),
            "open_mode": "SQLite URI mode=ro",
            "integrity_check": integrity,
            "foreign_key_check": {"violation_count": len(fk_rows), "rows": fk_rows},
            "DisplayCallEvent": {
                "total": total,
                "distinct_id": distinct_id,
                "distinct_eventId": distinct_event_id,
                "distinct_ticketId": distinct_ticket_id,
                "status_distribution": status,
                "min_createdAt": min_created,
                "max_createdAt": max_created,
                "callNextKey_nonnull": call_next_key_nonnull,
                "sequence_nonzero": sequence_nonzero,
                "fingerprint_id": fingerprint(conn, "id"),
                "fingerprint_eventId": fingerprint(conn, "eventId"),
                "fingerprint_ticketId": fingerprint(conn, "ticketId"),
            },
            "legacy": {
                "CallNextIdempotency": (
                    conn.execute("SELECT COUNT(*) FROM CallNextIdempotency").fetchone()[0]
                    if table_exists(conn, "CallNextIdempotency") else None
                ),
                "CreateTicketIdempotency": (
                    conn.execute("SELECT COUNT(*) FROM CreateTicketIdempotency").fetchone()[0]
                    if table_exists(conn, "CreateTicketIdempotency") else None
                ),
            },
        }
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
