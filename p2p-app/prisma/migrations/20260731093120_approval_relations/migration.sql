-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalAction_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ApprovalInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalAction" ("actorId", "comment", "createdAt", "decision", "id", "instanceId", "step") SELECT "actorId", "comment", "createdAt", "decision", "id", "instanceId", "step" FROM "ApprovalAction";
DROP TABLE "ApprovalAction";
ALTER TABLE "new_ApprovalAction" RENAME TO "ApprovalAction";
CREATE INDEX "ApprovalAction_instanceId_idx" ON "ApprovalAction"("instanceId");
CREATE TABLE "new_ApprovalInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "ruleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "submittedById" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    "department" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalInstance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalInstance_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalInstance" ("amount", "createdAt", "currentStep", "decidedAt", "department", "docId", "docType", "id", "orgId", "ruleId", "status", "submittedById") SELECT "amount", "createdAt", "currentStep", "decidedAt", "department", "docId", "docType", "id", "orgId", "ruleId", "status", "submittedById" FROM "ApprovalInstance";
DROP TABLE "ApprovalInstance";
ALTER TABLE "new_ApprovalInstance" RENAME TO "ApprovalInstance";
CREATE INDEX "ApprovalInstance_orgId_docType_docId_idx" ON "ApprovalInstance"("orgId", "docType", "docId");
CREATE INDEX "ApprovalInstance_status_idx" ON "ApprovalInstance"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
