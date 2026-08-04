-- CreateTable
CREATE TABLE "AdvancePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "poId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "advanceDate" DATETIME NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdvancePayment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdvancePayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdvancePayment_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AdvancePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdvanceApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedById" TEXT,
    CONSTRAINT "AdvanceApplication_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "AdvancePayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdvanceApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdvanceApplication_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AdvanceApplication_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AdvancePayment_orgId_status_idx" ON "AdvancePayment"("orgId", "status");

-- CreateIndex
CREATE INDEX "AdvancePayment_orgId_vendorId_idx" ON "AdvancePayment"("orgId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvancePayment_orgId_code_key" ON "AdvancePayment"("orgId", "code");

-- CreateIndex
CREATE INDEX "AdvanceApplication_advanceId_idx" ON "AdvanceApplication"("advanceId");

-- CreateIndex
CREATE INDEX "AdvanceApplication_invoiceId_idx" ON "AdvanceApplication"("invoiceId");
