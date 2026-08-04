-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "category" TEXT,
    "needByDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rfq_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Rfq_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Rfq_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "requisitionLineId" TEXT,
    "itemId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hsnSac" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    CONSTRAINT "RfqLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "freight" REAL NOT NULL DEFAULT 0,
    "packing" REAL NOT NULL DEFAULT 0,
    "otherCharges" REAL NOT NULL DEFAULT 0,
    "advancePct" REAL NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "deliveryDays" INTEGER NOT NULL DEFAULT 0,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "totalLandedAmount" REAL NOT NULL DEFAULT 0,
    "cashCost" REAL NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RfqQuote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RfqQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqQuoteLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "rfqLineId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    "landedUnitCost" REAL NOT NULL,
    "lineTotal" REAL NOT NULL,
    CONSTRAINT "RfqQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "RfqQuote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqQuoteLine_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "RfqLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "scoresJson" TEXT NOT NULL,
    "recommendationJson" TEXT NOT NULL,
    "evaluatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RfqEvaluation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RfqAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "overrideReason" TEXT,
    "awardedById" TEXT,
    "awardedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poId" TEXT,
    CONSTRAINT "RfqAward_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqAward_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "RfqQuote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RfqAward_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RfqAward_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapturedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedPath" TEXT NOT NULL,
    "extractedJson" TEXT,
    "confidence" REAL,
    "validationJson" TEXT,
    "route" TEXT,
    "error" TEXT,
    "invoiceId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CapturedDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CapturedDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CapturedDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CapturedDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "rating" REAL NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "zohoContactId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'NONE',
    "syncError" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vendor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Vendor" ("category", "code", "contactPerson", "createdAt", "createdById", "currency", "email", "gstin", "id", "legalName", "msmeNumber", "msmeType", "orgId", "pan", "paymentTermsDays", "status", "syncError", "syncStatus", "tdsRate", "tdsSection", "tradeName", "updatedAt", "zohoContactId") SELECT "category", "code", "contactPerson", "createdAt", "createdById", "currency", "email", "gstin", "id", "legalName", "msmeNumber", "msmeType", "orgId", "pan", "paymentTermsDays", "status", "syncError", "syncStatus", "tdsRate", "tdsSection", "tradeName", "updatedAt", "zohoContactId" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE UNIQUE INDEX "Vendor_orgId_code_key" ON "Vendor"("orgId", "code");
CREATE UNIQUE INDEX "Vendor_orgId_pan_key" ON "Vendor"("orgId", "pan");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Rfq_orgId_status_idx" ON "Rfq"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_orgId_code_key" ON "Rfq"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RfqLine_rfqId_lineNo_key" ON "RfqLine"("rfqId", "lineNo");

-- CreateIndex
CREATE INDEX "RfqQuote_rfqId_idx" ON "RfqQuote"("rfqId");

-- CreateIndex
CREATE INDEX "RfqQuote_vendorId_idx" ON "RfqQuote"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "RfqQuoteLine_quoteId_lineNo_key" ON "RfqQuoteLine"("quoteId", "lineNo");

-- CreateIndex
CREATE INDEX "RfqEvaluation_rfqId_idx" ON "RfqEvaluation"("rfqId");

-- CreateIndex
CREATE INDEX "RfqAward_rfqId_idx" ON "RfqAward"("rfqId");

-- CreateIndex
CREATE INDEX "RfqAward_vendorId_idx" ON "RfqAward"("vendorId");

-- CreateIndex
CREATE INDEX "CapturedDocument_orgId_status_idx" ON "CapturedDocument"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CapturedDocument_orgId_fileHash_key" ON "CapturedDocument"("orgId", "fileHash");
