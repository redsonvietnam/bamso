-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL DEFAULT '',
    "serviceId" TEXT NOT NULL,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL,
    "missCount" INTEGER NOT NULL DEFAULT 0,
    "pos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "Ticket_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("calledAt", "completedAt", "createdAt", "customerName", "dayKey", "id", "missCount", "pos", "position", "serviceId", "status", "ticketNumber") SELECT "calledAt", "completedAt", "createdAt", "customerName", "dayKey", "id", "missCount", "pos", "position", "serviceId", "status", "ticketNumber" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE INDEX "Ticket_serviceId_dayKey_status_idx" ON "Ticket"("serviceId", "dayKey", "status");
CREATE UNIQUE INDEX "Ticket_serviceId_dayKey_ticketNumber_key" ON "Ticket"("serviceId", "dayKey", "ticketNumber");
CREATE UNIQUE INDEX "Ticket_serviceId_dayKey_position_key" ON "Ticket"("serviceId", "dayKey", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
