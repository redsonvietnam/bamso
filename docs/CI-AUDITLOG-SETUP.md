# CI AuditLog Test Database Setup

The CI workflow uses a fresh SQLite database through `DATABASE_URL=file:./dev.db`. SQLite database files are ignored by git, so CI cannot rely on a checked-in database file.

Before integration tests run, CI must materialize the Prisma schema into that fresh database with:

```text
npx prisma db push --skip-generate
```

This keeps the test database deterministic and ensures schema additions such as `AuditLog` are present without weakening or bypassing the integration tests.
