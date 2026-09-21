import sqlite3, sys, os

# Accept DB path as argument, env var, or default relative path
if len(sys.argv) > 1:
    db_path = sys.argv[1]
elif 'DATABASE_URL' in os.environ:
    # Parse file:./dev.db from DATABASE_URL
    url = os.environ['DATABASE_URL']
    file_part = url.split('file:')[1].split('?')[0] if 'file:' in url else url
    db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'prisma', file_part)
else:
    db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'prisma', 'dev.db')

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# The critical question: what does SQLite do when comparing
# integer createdAt against a text ISO 8601 cutoff string?
# This is what the purge script actually does.

# Test 1: Does the string comparison (lexicographic) hold?
cur.execute("SELECT '1789355536295' < '2025-09-13T17:00:00.000Z'")
print(f"String comparison: '1789355536295' < 'ISO' = {cur.fetchone()[0]}")

# Test 2: What does SQLite actually do with the real query?
# First, let's see what the actual column affinity is
cur.execute("PRAGMA table_info(AuditLog)")
for row in cur.fetchall():
    if row[1] == 'createdAt':
        print(f"createdAt column: type={row[2]} notnull={row[3]} default={row[4]} pk={row[5]}")

# Test 3: Simulate the purge query with a cutoff in the future (should not delete)
import time
future_epoch_ms = int((time.time() + 86400) * 1000)  # tomorrow
cur.execute("SELECT count(*) FROM AuditLog WHERE createdAt < ?", (future_epoch_ms,))
print(f"\nCutoff=future epoch ms ({future_epoch_ms}): would delete {cur.fetchone()[0]} rows")

# Test 4: Simulate purge with ISO string cutoff (what the script currently does)
# Use a cutoff far in the past so ALL records should be deleted
cur.execute("SELECT count(*) FROM AuditLog WHERE createdAt < '2020-01-01T00:00:00.000Z'")
print(f"Cutoff='2020-01-01T00:00:00.000Z' (ISO string): would delete {cur.fetchone()[0]} rows")

# Test 5: Use epoch ms string cutoff (matching storage format)
cur.execute("SELECT count(*) FROM AuditLog WHERE createdAt < '1577836800000'")
print(f"Cutoff='1577836800000' (epoch ms string): would delete {cur.fetchone()[0]} rows")

# Test 6: Compare what the purge script would ACTUALLY do
# The purge script computes cutoff like: "2025-09-13T17:00:00.000Z"
# Let's see what happens
cutoff_iso = "2025-09-13T17:00:00.000Z"
cur.execute("SELECT count(*) FROM AuditLog WHERE createdAt < ?", (cutoff_iso,))
print(f"\nPurge with ISO cutoff '{cutoff_iso}': would delete {cur.fetchone()[0]} rows")

# Test 7: Same cutoff but as epoch ms
cutoff_epoch = 1757786400000  # 2025-09-13T17:00:00.000Z
cur.execute("SELECT count(*) FROM AuditLog WHERE createdAt < ?", (cutoff_epoch,))
print(f"Purge with epoch cutoff {cutoff_epoch}: would delete {cur.fetchone()[0]} rows")

conn.close()
