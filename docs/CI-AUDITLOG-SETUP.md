# CI AuditLog test database setup

CI uses a fresh SQLite database through `DATABASE_URL=file:./dev.db`. SQLite database files are ignored by git, so CI must initialize the Prisma schema before integration tests.

Required setup command:

```text
npx prisma db push --skip-generate
```

This setup uses the canonical Prisma schema and does not weaken or bypass AuditLog tests.
