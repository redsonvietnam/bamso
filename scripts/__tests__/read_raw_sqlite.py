"""Read raw createdAt from SQLite AuditLog — proves the on-disk representation."""
import sqlite3, sys, os, re

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'prisma', 'dev.db')

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT createdAt, hex(createdAt) FROM AuditLog ORDER BY createdAt DESC LIMIT 1")
row = cur.fetchone()
conn.close()

if row is None:
    print("NO_ROWS")
    sys.exit(1)

raw = row[0]
raw_hex = row[1]
raw_type = type(raw).__name__
raw_str = str(raw)
print(f"RAW_SQLITE: {raw_str}")
print(f"RAW_TYPE: {raw_type}")
print(f"RAW_HEX: {raw_hex}")

if raw_type == 'int':
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(raw / 1000, tz=timezone.utc)
    iso_str = dt.strftime('%Y-%m-%dT%H:%M:%S.') + f'{dt.microsecond // 1000:03d}Z'
    print(f"CONVERTED_FROM_EPOCH: {iso_str}")
else:
    pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    matches = bool(re.match(pattern, raw_str))
    print(f"MATCHES_UTC_Z: {matches}")
