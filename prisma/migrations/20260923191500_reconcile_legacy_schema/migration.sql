-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CallNextIdempotency";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CreateTicketIdempotency";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DisplayCallEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "customerName" TEXT,
    "nextTicketNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DisplayCallEvent" ("createdAt", "customerName", "eventId", "id", "nextTicketNumber", "pos", "serviceId", "status", "ticketId", "ticketNumber") SELECT "createdAt", "customerName", "eventId", "id", "nextTicketNumber", "pos", "serviceId", "status", "ticketId", "ticketNumber" FROM "DisplayCallEvent";
DROP TABLE "DisplayCallEvent";
ALTER TABLE "new_DisplayCallEvent" RENAME TO "DisplayCallEvent";
CREATE UNIQUE INDEX "DisplayCallEvent_eventId_key" ON "DisplayCallEvent"("eventId");
CREATE INDEX "DisplayCallEvent_status_createdAt_idx" ON "DisplayCallEvent"("status", "createdAt");
CREATE INDEX "DisplayCallEvent_createdAt_id_idx" ON "DisplayCallEvent"("createdAt", "id");
CREATE INDEX "DisplayCallEvent_ticketId_idx" ON "DisplayCallEvent"("ticketId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;