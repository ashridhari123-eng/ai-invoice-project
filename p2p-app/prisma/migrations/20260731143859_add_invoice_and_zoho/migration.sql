-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "poId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "tdsAmount" REAL NOT NULL DEFAULT 0,
    "tdsSection" TEXT,
    "tdsRate" REAL,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "zohoBillId" TEXT,
    "zohoBillNumber" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'NONE',
    "syncError" TEXT,
    "matchedAt" DATETIME,
    "submittedAt" DATETIME,
    "decidedAt" DATETIME,
    "bookedAt" DATETIME,
    "paidAt" DATETIME,
    "paymentRef" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "poLineId" TEXT,
    "itemId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hsnSac" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    "taxRatePct" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "lineTotal" REAL NOT NULL,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchNotes" TEXT,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "payloadHash" TEXT,
    "zohoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "responseJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZohoConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'IN',
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "organizationId" TEXT,
    "scopes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "connectedBy" TEXT,
    "connectedAt" DATETIME,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZohoConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZohoMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZohoMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "pan" TEXT NOT NULL,
    "gstin" TEXT,
    "email" TEXT,
    "contactPerson" TEXT,
    "msmeNumber" TEXT,
    "msmeType" TEXT,
    "category" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "tdsSection" TEXT,
    "tdsRate" REAL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "zohoContactId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'NONE',
    "syncError" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vendor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Vendor" ("category", "code", "contactPerson", "createdAt", "createdById", "currency", "email", "gstin", "id", "legalName", "msmeNumber", "msmeType", "orgId", "pan", "paymentTermsDays", "status", "tdsRate", "tdsSection", "tradeName", "updatedAt") SELECT "category", "code", "contactPerson", "createdAt", "createdById", "currency", "email", "gstin", "id", "legalName", "msmeNumber", "msmeType", "orgId", "pan", "paymentTermsDays", "status", "tdsRate", "tdsSection", "tradeName", "updatedAt" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE UNIQUE INDEX "Vendor_orgId_code_key" ON "Vendor"("orgId", "code");
CREATE UNIQUE INDEX "Vendor_orgId_pan_key" ON "Vendor"("orgId", "pan");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Invoice_orgId_status_idx" ON "Invoice"("orgId", "status");

-- CreateIndex
CREATE INDEX "Invoice_orgId_vendorId_idx" ON "Invoice"("orgId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orgId_code_key" ON "Invoice"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orgId_invoiceNumber_key" ON "Invoice"("orgId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_itemCode_idx" ON "InvoiceLine"("invoiceId", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_lineNo_key" ON "InvoiceLine"("invoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "SyncLog_orgId_entity_entityId_idx" ON "SyncLog"("orgId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "SyncLog_orgId_status_idx" ON "SyncLog"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ZohoConfig_orgId_key" ON "ZohoConfig"("orgId");

-- CreateIndex
CREATE INDEX "ZohoMapping_orgId_kind_idx" ON "ZohoMapping"("orgId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ZohoMapping_orgId_kind_sourceKey_key" ON "ZohoMapping"("orgId", "kind", "sourceKey");
