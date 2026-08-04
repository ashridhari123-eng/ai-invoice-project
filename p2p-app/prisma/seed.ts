import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ROLE_SEEDS } from "../src/lib/roles";
import { PR_APPROVED } from "../src/lib/requisitions";
import { computeLandedQuote, scoreQuotes, RFQ_OPEN } from "../src/lib/rfq";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const ORG_CODE = "MERIDIAN";
const PASSWORD = "Password123!";
const YEAR = new Date().getFullYear();

interface VendorSeed {
  code: string;
  legalName: string;
  tradeName?: string;
  pan: string;
  gstin?: string;
  msmeNumber?: string;
  msmeType?: string;
  category?: string;
  paymentTermsDays?: number;
  tdsSection?: string;
  tdsRate?: number;
  status: string;
  bank?: { accountName: string; accountNumber: string; ifsc: string; status: string };
}

const VENDORS: VendorSeed[] = [
  {
    code: "VN/2026/00001",
    legalName: "Acme Industrial Supplies Pvt Ltd",
    tradeName: "Acme",
    pan: "AACCA1234F",
    gstin: "27AACCA1234F1Z5",
    msmeNumber: "UDYAM-MH-01-0000001",
    msmeType: "MICRO",
    category: "RAW_MATERIAL",
    paymentTermsDays: 45,
    tdsSection: "194C",
    tdsRate: 1,
    status: "ACTIVE",
    bank: { accountName: "Acme Industrial Supplies Pvt Ltd", accountNumber: "50210002345678", ifsc: "HDFC0001234", status: "APPROVED" },
  },
  {
    code: "VN/2026/00002",
    legalName: "Bharat Metals & Alloys",
    tradeName: "Bharat Metals",
    pan: "AABCB4567G",
    gstin: "27AABCB4567G1Z6",
    msmeType: "SMALL",
    category: "RAW_MATERIAL",
    paymentTermsDays: 30,
    tdsSection: "194C",
    tdsRate: 1,
    status: "ACTIVE",
    bank: { accountName: "Bharat Metals & Alloys", accountNumber: "00112233445566", ifsc: "ICIC0000456", status: "APPROVED" },
  },
  {
    code: "VN/2026/00003",
    legalName: "Coastal Logistics India",
    pan: "AAFCL7890H",
    gstin: "27AAFCL7890H1Z7",
    category: "LOGISTICS",
    paymentTermsDays: 15,
    tdsSection: "194C",
    tdsRate: 1,
    status: "ACTIVE",
    bank: { accountName: "Coastal Logistics India", accountNumber: "30123456789", ifsc: "SBIN0000231", status: "PENDING" },
  },
  {
    code: "VN/2026/00004",
    legalName: "Ganga Packaging Co",
    pan: "AAFGP2345J",
    gstin: "27AAFGP2345J1Z8",
    msmeNumber: "UDYAM-GJ-02-0000456",
    msmeType: "MICRO",
    category: "CONSUMABLES",
    paymentTermsDays: 30,
    status: "ACTIVE",
    bank: { accountName: "Ganga Packaging Co", accountNumber: "70881234567", ifsc: "HDFC0002233", status: "PENDING" },
  },
  {
    code: "VN/2026/00005",
    legalName: "Innova Office Systems",
    pan: "AAOCI5678K",
    gstin: "27AAOCI5678K1Z9",
    category: "OFFICE_SUPPLIES",
    paymentTermsDays: 30,
    status: "ACTIVE",
    bank: { accountName: "Innova Office Systems", accountNumber: "10987654321", ifsc: "UTIB0000199", status: "APPROVED" },
  },
  {
    code: "VN/2026/00006",
    legalName: "Precision Tools & Dies",
    pan: "AABPT8901L",
    gstin: "27AABPT8901L1ZA",
    msmeType: "MEDIUM",
    category: "RAW_MATERIAL",
    paymentTermsDays: 60,
    tdsSection: "194C",
    tdsRate: 1,
    status: "ACTIVE",
    bank: { accountName: "Precision Tools & Dies", accountNumber: "45678901234", ifsc: "IDIB000K152", status: "APPROVED" },
  },
  {
    code: "VN/2026/00007",
    legalName: "Quantum Software Services",
    pan: "AAQCS1234M",
    gstin: "27AAQCS1234M1ZB",
    category: "SERVICES",
    paymentTermsDays: 45,
    tdsSection: "194J",
    tdsRate: 10,
    status: "ACTIVE",
    bank: { accountName: "Quantum Software Services", accountNumber: "90909012345", ifsc: "KKBK0000234", status: "APPROVED" },
  },
  {
    code: "VN/2026/00008",
    legalName: "Radiance Electricals",
    pan: "AAFRE4567N",
    gstin: "27AAFRE4567N1ZC",
    category: "CAPITAL_EQUIPMENT",
    paymentTermsDays: 60,
    status: "ACTIVE",
    bank: { accountName: "Radiance Electricals", accountNumber: "221122334455", ifsc: "YESB0000234", status: "PENDING" },
  },
  {
    code: "VN/2026/00009",
    legalName: "Shree Sai Traders",
    pan: "AAFSS7890P",
    gstin: "27AAFSS7890P1ZD",
    msmeType: "MICRO",
    category: "CONSUMABLES",
    paymentTermsDays: 30,
    status: "ACTIVE",
    bank: { accountName: "Shree Sai Traders", accountNumber: "33001234567", ifsc: "SBIN0000455", status: "APPROVED" },
  },
  {
    code: "VN/2026/00010",
    legalName: "Zenith Safety Products",
    pan: "AACZP1234Q",
    gstin: "27AACZP1234Q1ZE",
    category: "RAW_MATERIAL",
    paymentTermsDays: 30,
    status: "BLOCKED",
    bank: { accountName: "Zenith Safety Products", accountNumber: "66554433221", ifsc: "HDFC0003344", status: "PENDING" },
  },
];

interface ItemSeed {
  code: string;
  name: string;
  description: string;
  hsnSac: string;
  unit: string;
  defaultTaxRatePct: number;
}

const ITEMS: ItemSeed[] = [
  { code: "IT/2026/00001", name: "Ball bearing 6205", description: "Deep groove ball bearing, 25×52×15mm", hsnSac: "8482", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00002", name: "V-belt B series", description: "Rubber V-belt, profile B, 1500mm", hsnSac: "4010", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00003", name: "Hydraulic oil 68", description: "ISO VG 68 hydraulic oil, 20L bucket", hsnSac: "2710", unit: "litre", defaultTaxRatePct: 18 },
  { code: "IT/2026/00004", name: "Lithium grease NLGI 2", description: "Multipurpose lithium grease, 5kg tin", hsnSac: "2710", unit: "kg", defaultTaxRatePct: 18 },
  { code: "IT/2026/00005", name: "Printer toner cartridge HP 88A", description: "Black toner, ~1,500 page yield", hsnSac: "8443", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00006", name: "A4 copy paper 75 gsm", description: "500 sheets per ream, 5 reams per box", hsnSac: "4802", unit: "box", defaultTaxRatePct: 12 },
  { code: "IT/2026/00007", name: "Corrugated box 18×12×10", description: "Single wall, 3-ply, 50 per bundle", hsnSac: "4819", unit: "box", defaultTaxRatePct: 12 },
  { code: "IT/2026/00008", name: "PVC insulated cable 2.5 sqmm", description: "Copper conductor, FR, 90m coil", hsnSac: "8544", unit: "m", defaultTaxRatePct: 18 },
  { code: "IT/2026/00009", name: "LED panel light 18W", description: "600×600 recessed panel, 4000K", hsnSac: "9405", unit: "pcs", defaultTaxRatePct: 12 },
  { code: "IT/2026/00010", name: "Stainless steel sheet 316L", description: "2mm × 4ft × 8ft, cold rolled", hsnSac: "7219", unit: "kg", defaultTaxRatePct: 18 },
  { code: "IT/2026/00011", name: "Carbon steel pipe 4 inch", description: "SCH 40, ERW, 6m length", hsnSac: "7306", unit: "m", defaultTaxRatePct: 18 },
  { code: "IT/2026/00012", name: "Welding electrodes E6013", description: "2.5mm, 5kg pack", hsnSac: "8311", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00013", name: "Safety helmet ISI", description: "Industrial helmet with ratchet", hsnSac: "6506", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00014", name: "Nitrile gloves", description: "Powder-free, blue, box of 100", hsnSac: "4015", unit: "box", defaultTaxRatePct: 18 },
  { code: "IT/2026/00015", name: "Ergonomic office chair", description: "High-back mesh, pneumatic lift", hsnSac: "9401", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00016", name: "Office desk 4ft", description: "Laminate top with steel legs", hsnSac: "9403", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00017", name: "Online UPS 2 kVA", description: "Tower, 1 hour backup support", hsnSac: "8504", unit: "pcs", defaultTaxRatePct: 18 },
  { code: "IT/2026/00018", name: "AMC – computer hardware", description: "Annual maintenance contract, per device", hsnSac: "9987", unit: "lump-sum", defaultTaxRatePct: 18 },
  { code: "IT/2026/00019", name: "Security services", description: "Unarmed guard, per person per month", hsnSac: "9985", unit: "lump-sum", defaultTaxRatePct: 18 },
  { code: "IT/2026/00020", name: "Courier services", description: "Door-to-door document/parcel delivery", hsnSac: "9986", unit: "lump-sum", defaultTaxRatePct: 18 },
];

interface BudgetSeed {
  department: string;
  category: string;
  allocatedAmount: number;
}

const BUDGETS: BudgetSeed[] = [
  { department: "Operations", category: "RAW_MATERIAL", allocatedAmount: 48000000 },
  { department: "Operations", category: "CONSUMABLES", allocatedAmount: 6000000 },
  { department: "Operations", category: "CAPITAL_EQUIPMENT", allocatedAmount: 12000000 },
  { department: "Operations", category: "LOGISTICS", allocatedAmount: 9000000 },
  { department: "IT", category: "OFFICE_SUPPLIES", allocatedAmount: 1500000 },
  { department: "IT", category: "SERVICES", allocatedAmount: 7500000 },
  { department: "IT", category: "CAPITAL_EQUIPMENT", allocatedAmount: 5000000 },
  { department: "Marketing", category: "MARKETING_SPEND", allocatedAmount: 12000000 },
  { department: "Marketing", category: "OFFICE_SUPPLIES", allocatedAmount: 800000 },
  { department: "Finance", category: "OFFICE_SUPPLIES", allocatedAmount: 600000 },
  { department: "Finance", category: "SERVICES", allocatedAmount: 3000000 },
  { department: "HR", category: "OFFICE_SUPPLIES", allocatedAmount: 1000000 },
  { department: "HR", category: "SERVICES", allocatedAmount: 2000000 },
];

interface UserSeed {
  email: string;
  name: string;
  roleCode: string;
  department?: string;
  isActive?: boolean;
}

const USERS: UserSeed[] = [
  { email: "admin@demo.com", name: "Nikhil Sharma", roleCode: "ADMIN", department: "IT" },
  { email: "requester@demo.com", name: "Ramesh Iyer", roleCode: "REQUESTER", department: "Operations" },
  { email: "approver@demo.com", name: "Anita Desai", roleCode: "APPROVER", department: "Operations" },
  { email: "buyer@demo.com", name: "Vikram Singh", roleCode: "BUYER", department: "Procurement" },
  { email: "stores@demo.com", name: "Suresh Patil", roleCode: "STORES", department: "Stores" },
  { email: "ap@demo.com", name: "Meera Nair", roleCode: "AP_ACCOUNTANT", department: "Finance" },
  { email: "finance@demo.com", name: "Kavita Rao", roleCode: "FINANCE_CONTROLLER", department: "Finance" },
  { email: "auditor@demo.com", name: "RSV & Associates", roleCode: "AUDITOR", department: "External" },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await prisma.organization.upsert({
    where: { code: ORG_CODE },
    update: { name: "Meridian Trading Pvt Ltd" },
    create: { code: ORG_CODE, name: "Meridian Trading Pvt Ltd" },
  });

  for (const role of ROLE_SEEDS) {
    await prisma.role.upsert({
      where: { orgId_code: { orgId: org.id, code: role.code } },
      update: {
        name: role.name,
        description: role.description,
        permissions: JSON.stringify(role.permissions),
      },
      create: {
        orgId: org.id,
        code: role.code,
        name: role.name,
        description: role.description,
        permissions: JSON.stringify(role.permissions),
      },
    });
  }

  for (const u of USERS) {
    const role = await prisma.role.findUnique({
      where: { orgId_code: { orgId: org.id, code: u.roleCode } },
    });
    if (!role) throw new Error(`Role ${u.roleCode} missing`);
    await prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: u.email } },
      update: {
        name: u.name,
        roleId: role.id,
        department: u.department ?? null,
        isActive: u.isActive ?? true,
        passwordHash,
      },
      create: {
        orgId: org.id,
        email: u.email,
        name: u.name,
        roleId: role.id,
        department: u.department ?? null,
        passwordHash,
        isActive: u.isActive ?? true,
      },
    });
  }

  for (const v of VENDORS) {
    await prisma.vendor.upsert({
      where: { orgId_code: { orgId: org.id, code: v.code } },
      update: {
        legalName: v.legalName,
        tradeName: v.tradeName ?? null,
        pan: v.pan,
        gstin: v.gstin ?? null,
        msmeNumber: v.msmeNumber ?? null,
        msmeType: v.msmeType ?? null,
        category: v.category ?? null,
        paymentTermsDays: v.paymentTermsDays ?? 30,
        tdsSection: v.tdsSection ?? null,
        tdsRate: v.tdsRate ?? null,
        status: v.status,
      },
      create: {
        orgId: org.id,
        code: v.code,
        legalName: v.legalName,
        tradeName: v.tradeName ?? null,
        pan: v.pan,
        gstin: v.gstin ?? null,
        msmeNumber: v.msmeNumber ?? null,
        msmeType: v.msmeType ?? null,
        category: v.category ?? null,
        paymentTermsDays: v.paymentTermsDays ?? 30,
        tdsSection: v.tdsSection ?? null,
        tdsRate: v.tdsRate ?? null,
        status: v.status,
      },
    });

    const vendor = await prisma.vendor.findUnique({
      where: { orgId_code: { orgId: org.id, code: v.code } },
    });
    if (!vendor) throw new Error(`Vendor ${v.code} missing`);

    await prisma.vendorBankAccount.deleteMany({ where: { vendorId: vendor.id } });
    if (v.bank) {
      await prisma.vendorBankAccount.create({
        data: {
          vendorId: vendor.id,
          accountName: v.bank.accountName,
          accountNumber: v.bank.accountNumber,
          ifsc: v.bank.ifsc,
          isPrimary: true,
          status: v.bank.status,
        },
      });
    }
  }

  for (const item of ITEMS) {
    await prisma.item.upsert({
      where: { orgId_code: { orgId: org.id, code: item.code } },
      update: {
        name: item.name,
        description: item.description,
        hsnSac: item.hsnSac,
        unit: item.unit,
        defaultTaxRatePct: item.defaultTaxRatePct,
        isActive: true,
      },
      create: {
        orgId: org.id,
        code: item.code,
        name: item.name,
        description: item.description,
        hsnSac: item.hsnSac,
        unit: item.unit,
        defaultTaxRatePct: item.defaultTaxRatePct,
        isActive: true,
      },
    });
  }

  for (const b of BUDGETS) {
    await prisma.budget.upsert({
      where: {
        orgId_department_category_period: {
          orgId: org.id,
          department: b.department,
          category: b.category,
          period: "FY2026",
        },
      },
      update: { allocatedAmount: b.allocatedAmount },
      create: {
        orgId: org.id,
        department: b.department,
        category: b.category,
        period: "FY2026",
        allocatedAmount: b.allocatedAmount,
      },
    });
  }

  await prisma.numberSeries.upsert({
    where: { orgId_entity_year: { orgId: org.id, entity: "VENDOR", year: YEAR } },
    update: { lastNumber: 10 },
    create: { orgId: org.id, entity: "VENDOR", year: YEAR, lastNumber: 10 },
  });
  await prisma.numberSeries.upsert({
    where: { orgId_entity_year: { orgId: org.id, entity: "ITEM", year: YEAR } },
    update: { lastNumber: 20 },
    create: { orgId: org.id, entity: "ITEM", year: YEAR, lastNumber: 20 },
  });
  await prisma.numberSeries.upsert({
    where: { orgId_entity_year: { orgId: org.id, entity: "INVOICE", year: YEAR } },
    update: { lastNumber: 0 },
    create: { orgId: org.id, entity: "INVOICE", year: YEAR, lastNumber: 0 },
  });

  const DEMO_PO_CODE = "PO/2026/00001";
  const demoPo = await prisma.purchaseOrder.findUnique({
    where: { orgId_code: { orgId: org.id, code: DEMO_PO_CODE } },
    include: { lines: { orderBy: { itemCode: "asc" } } },
  });
  if (demoPo && demoPo.status === "SENT") {
    const existingInv = await prisma.invoice.findFirst({
      where: { orgId: org.id, invoiceNumber: "ACM/2026/0001" },
    });
    if (!existingInv) {
      const code = `IN/${YEAR}/00001`;
      const subtotal =
        Math.round(demoPo.lines.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
      const taxAmount =
        Math.round(demoPo.lines.reduce((s, l) => s + l.taxAmount, 0) * 100) / 100;
      const lineTotal =
        Math.round(demoPo.lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;

      await prisma.invoice.create({
        data: {
          orgId: org.id,
          code,
          vendorId: demoPo.vendorId,
          poId: demoPo.id,
          invoiceNumber: "ACM/2026/0001",
          invoiceDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: "RECEIVED",
          subtotal,
          taxAmount,
          tdsAmount: 0,
          tdsRate: null,
          totalAmount: lineTotal,
          syncStatus: "NONE",
          lines: {
            create: demoPo.lines.map((l, index) => ({
              lineNo: index + 1,
              poLineId: l.id,
              itemId: l.itemId,
              itemCode: l.itemCode,
              name: l.name,
              hsnSac: l.hsnSac,
              qty: l.qty,
              unit: l.unit,
              unitPrice: l.unitPrice,
              taxRatePct: l.taxRatePct,
              subtotal: l.subtotal,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
              matchStatus: "UNMATCHED",
            })),
          },
        },
      });
      await prisma.numberSeries.updateMany({
        where: { orgId: org.id, entity: "INVOICE", year: YEAR },
        data: { lastNumber: 1 },
      });
    }
  }

  const APPROVAL_RULES: {
    code: string;
    docType: string;
    name: string;
    priority: number;
    conditions: { minAmount?: number; maxAmount?: number };
    steps: Array<{ role: string }>;
  }[] = [
    {
      code: "PR-LE-01",
      docType: "PR",
      name: "Requisition up to ₹25,000 — manager approval",
      priority: 10,
      conditions: { maxAmount: 25000 },
      steps: [{ role: "APPROVER" }],
    },
    {
      code: "PR-LE-02",
      docType: "PR",
      name: "Requisition ₹25,001 to ₹2,00,000 — manager + finance",
      priority: 20,
      conditions: { minAmount: 25000.01, maxAmount: 200000 },
      steps: [{ role: "APPROVER" }, { role: "FINANCE_CONTROLLER" }],
    },
    {
      code: "PR-LE-03",
      docType: "PR",
      name: "Requisition above ₹2,00,000 — manager + finance + admin",
      priority: 30,
      conditions: { minAmount: 200000.01 },
      steps: [{ role: "APPROVER" }, { role: "FINANCE_CONTROLLER" }, { role: "ADMIN" }],
    },
    {
      code: "INV-LE-01",
      docType: "INV",
      name: "Invoice up to ₹5,00,000 — finance controller",
      priority: 10,
      conditions: { maxAmount: 500000 },
      steps: [{ role: "FINANCE_CONTROLLER" }],
    },
    {
      code: "INV-LE-02",
      docType: "INV",
      name: "Invoice above ₹5,00,000 — finance controller + admin",
      priority: 20,
      conditions: { minAmount: 500000.01 },
      steps: [{ role: "FINANCE_CONTROLLER" }, { role: "ADMIN" }],
    },
  ];

  for (const rule of APPROVAL_RULES) {
    await prisma.approvalRule.upsert({
      where: { id: `${org.id}:${rule.code}` },
      update: {
        name: rule.name,
        priority: rule.priority,
        conditions: JSON.stringify(rule.conditions),
        steps: JSON.stringify(rule.steps),
        isActive: true,
      },
      create: {
        id: `${org.id}:${rule.code}`,
        orgId: org.id,
        docType: rule.docType,
        name: rule.name,
        priority: rule.priority,
        conditions: JSON.stringify(rule.conditions),
        steps: JSON.stringify(rule.steps),
        isActive: true,
      },
    });
  }

  const VENDOR_RATINGS: Record<string, number> = {
    "VN/2026/00001": 88,
    "VN/2026/00002": 82,
    "VN/2026/00003": 70,
    "VN/2026/00004": 74,
    "VN/2026/00005": 66,
    "VN/2026/00006": 91,
    "VN/2026/00007": 78,
    "VN/2026/00008": 72,
    "VN/2026/00009": 69,
    "VN/2026/00010": 41,
  };
  for (const [code, rating] of Object.entries(VENDOR_RATINGS)) {
    await prisma.vendor.updateMany({ where: { orgId: org.id, code }, data: { rating } });
  }

  const buyer = await prisma.user.findUnique({
    where: { orgId_email: { orgId: org.id, email: "buyer@demo.com" } },
  });
  const requester = await prisma.user.findUnique({
    where: { orgId_email: { orgId: org.id, email: "requester@demo.com" } },
  });
  if (!buyer || !requester) throw new Error("Seed users missing");

  const budgetByKey = new Map(
    (await prisma.budget.findMany({ where: { orgId: org.id, period: "FY2026" } })).map(
      (b) => [`${b.department}|${b.category}`, b],
    ),
  );

  interface DemoPrLine {
    itemCode: string;
    qty: number;
    unitPrice: number;
    taxRatePct: number;
  }

  interface DemoQuote {
    vendorCode: string;
    unitPrices: number[];
    freight: number;
    packing: number;
    otherCharges: number;
    advancePct: number;
    creditDays: number;
    deliveryDays: number;
    warrantyMonths: number;
    validityDays: number;
    notes?: string;
    invitedOnly?: boolean;
  }

  interface DemoRfqSeed {
    rfqCode: string;
    prCode: string;
    department: string;
    budgetKey: string;
    prLines: DemoPrLine[];
    quotes: DemoQuote[];
    notes: string;
  }

  const DEMO_RFQS: DemoRfqSeed[] = [
    {
      rfqCode: "RFQ/2026/00001",
      prCode: "PR/2026/00003",
      department: "Operations",
      budgetKey: "Operations|RAW_MATERIAL",
      prLines: [
        { itemCode: "IT/2026/00001", qty: 500, unitPrice: 220, taxRatePct: 18 },
        { itemCode: "IT/2026/00002", qty: 200, unitPrice: 350, taxRatePct: 18 },
        { itemCode: "IT/2026/00003", qty: 400, unitPrice: 180, taxRatePct: 18 },
      ],
      quotes: [
        {
          vendorCode: "VN/2026/00001",
          unitPrices: [218, 345, 178],
          freight: 4000,
          packing: 800,
          otherCharges: 0,
          advancePct: 10,
          creditDays: 45,
          deliveryDays: 12,
          warrantyMonths: 6,
          validityDays: 30,
          notes: "Ex-works Bhiwadi; GST extra.",
        },
        {
          vendorCode: "VN/2026/00002",
          unitPrices: [224, 340, 175],
          freight: 3000,
          packing: 500,
          otherCharges: 0,
          advancePct: 20,
          creditDays: 30,
          deliveryDays: 9,
          warrantyMonths: 12,
          validityDays: 45,
          notes: "Freight to Pune plant included.",
        },
        {
          vendorCode: "VN/2026/00006",
          unitPrices: [216, 352, 180],
          freight: 2500,
          packing: 600,
          otherCharges: 1000,
          advancePct: 5,
          creditDays: 60,
          deliveryDays: 15,
          warrantyMonths: 24,
          validityDays: 30,
          notes: "24-month warranty on bearings; installation support.",
        },
      ],
      notes: "Annual maintenance spares — land fully loaded, evaluate by landed cost.",
    },
    {
      rfqCode: "RFQ/2026/00002",
      prCode: "PR/2026/00004",
      department: "IT",
      budgetKey: "IT|OFFICE_SUPPLIES",
      prLines: [
        { itemCode: "IT/2026/00006", qty: 200, unitPrice: 350, taxRatePct: 12 },
        { itemCode: "IT/2026/00007", qty: 150, unitPrice: 120, taxRatePct: 12 },
        { itemCode: "IT/2026/00005", qty: 50, unitPrice: 2100, taxRatePct: 18 },
      ],
      quotes: [
        {
          vendorCode: "VN/2026/00005",
          unitPrices: [345, 118, 2080],
          freight: 1200,
          packing: 300,
          otherCharges: 0,
          advancePct: 0,
          creditDays: 30,
          deliveryDays: 7,
          warrantyMonths: 12,
          validityDays: 30,
          notes: "Free replacement on defective toner.",
        },
        {
          vendorCode: "VN/2026/00004",
          unitPrices: [348, 110, 2120],
          freight: 900,
          packing: 400,
          otherCharges: 0,
          advancePct: 10,
          creditDays: 15,
          deliveryDays: 10,
          warrantyMonths: 6,
          validityDays: 30,
        },
        {
          vendorCode: "VN/2026/00009",
          unitPrices: [],
          freight: 0,
          packing: 0,
          otherCharges: 0,
          advancePct: 0,
          creditDays: 0,
          deliveryDays: 0,
          warrantyMonths: 0,
          validityDays: 0,
          invitedOnly: true,
        },
      ],
      notes: "Quarterly consumables — awaiting Shree Sai quote.",
    },
  ];

  for (const demo of DEMO_RFQS) {
    const existingRfq = await prisma.rfq.findUnique({
      where: { orgId_code: { orgId: org.id, code: demo.rfqCode } },
    });
    if (existingRfq) continue;

    const items = await prisma.item.findMany({
      where: { orgId: org.id, code: { in: demo.prLines.map((l) => l.itemCode) } },
    });
    const itemByCode = new Map(items.map((i) => [i.code, i]));
    const budget = budgetByKey.get(demo.budgetKey);

    const prLines = demo.prLines.map((l, index) => {
      const item = itemByCode.get(l.itemCode);
      if (!item) throw new Error(`Seed item ${l.itemCode} missing`);
      const subtotal = Math.round(l.qty * l.unitPrice * 100) / 100;
      const taxAmount = Math.round((subtotal * l.taxRatePct) / 100 * 100) / 100;
      return {
        lineNo: index + 1,
        itemId: item.id,
        itemCode: item.code,
        name: item.name,
        hsnSac: item.hsnSac,
        qty: l.qty,
        unit: item.unit,
        unitPrice: l.unitPrice,
        taxRatePct: l.taxRatePct,
        subtotal,
        taxAmount,
        lineTotal: Math.round((subtotal + taxAmount) * 100) / 100,
      };
    });

    const pr = await prisma.purchaseRequisition.upsert({
      where: { orgId_code: { orgId: org.id, code: demo.prCode } },
      update: {
        department: demo.department,
        budgetId: budget?.id ?? null,
        status: PR_APPROVED,
        notes: demo.notes,
        totalAmount: prLines.reduce((s, l) => s + l.lineTotal, 0),
        decidedAt: new Date(),
      },
      create: {
        orgId: org.id,
        code: demo.prCode,
        requesterId: requester.id,
        department: demo.department,
        budgetId: budget?.id ?? null,
        status: PR_APPROVED,
        expectedDeliveryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        notes: demo.notes,
        totalAmount: prLines.reduce((s, l) => s + l.lineTotal, 0),
        submittedAt: new Date(),
        decidedAt: new Date(),
        createdById: requester.id,
        lines: { create: prLines },
      },
    });

    const savedPrLines = await prisma.requisitionLine.findMany({
      where: { requisitionId: pr.id },
      orderBy: { lineNo: "asc" },
    });

    const quoteVendors = [];
    for (const q of demo.quotes) {
      const vendor = await prisma.vendor.findUnique({
        where: { orgId_code: { orgId: org.id, code: q.vendorCode } },
      });
      if (!vendor) throw new Error(`Seed vendor ${q.vendorCode} missing`);
      quoteVendors.push({
        vendorId: vendor.id,
        status: q.invitedOnly ? "INVITED" : "SUBMITTED",
        createdById: buyer.id,
      });
    }

    const rfq = await prisma.rfq.create({
      data: {
        orgId: org.id,
        code: demo.rfqCode,
        requisitionId: pr.id,
        department: demo.department,
        category: budget?.category ?? null,
        needByDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        status: RFQ_OPEN,
        notes: demo.notes,
        createdById: buyer.id,
        lines: {
          create: prLines.map((l, index) => ({
            lineNo: index + 1,
            requisitionLineId: savedPrLines[index]?.id ?? null,
            itemId: l.itemId,
            itemCode: l.itemCode,
            name: l.name,
            hsnSac: l.hsnSac,
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
          })),
        },
        quotes: { create: quoteVendors },
      },
      include: { lines: { orderBy: { lineNo: "asc" } }, quotes: true },
    });

    for (const q of demo.quotes) {
      if (q.invitedOnly) continue;
      const vendor = await prisma.vendor.findUnique({
        where: { orgId_code: { orgId: org.id, code: q.vendorCode } },
      });
      const quote = rfq.quotes.find((x) => x.vendorId === vendor?.id);
      if (!quote) continue;

      const landed = computeLandedQuote(
        rfq.lines.map((l, i) => ({ qty: l.qty, unitPrice: q.unitPrices[i] })),
        {
          freight: q.freight,
          packing: q.packing,
          otherCharges: q.otherCharges,
          advancePct: q.advancePct,
          creditDays: q.creditDays,
          deliveryDays: q.deliveryDays,
          warrantyMonths: q.warrantyMonths,
          validityDays: q.validityDays,
        },
      );

      await prisma.rfqQuote.update({
        where: { id: quote.id },
        data: {
          freight: q.freight,
          packing: q.packing,
          otherCharges: q.otherCharges,
          advancePct: q.advancePct,
          creditDays: q.creditDays,
          deliveryDays: q.deliveryDays,
          warrantyMonths: q.warrantyMonths,
          validityDays: q.validityDays,
          notes: q.notes ?? null,
          totalAmount: landed.goodsTotal,
          totalLandedAmount: landed.totalLanded,
          cashCost: landed.cashCost,
          lines: {
            create: rfq.lines.map((l, i) => ({
              rfqLineId: l.id,
              lineNo: i + 1,
              itemCode: l.itemCode,
              name: l.name,
              qty: l.qty,
              unit: l.unit,
              unitPrice: q.unitPrices[i],
              subtotal: Math.round(l.qty * q.unitPrices[i] * 100) / 100,
              landedUnitCost: landed.landedUnitCosts[i],
              lineTotal: Math.round(l.qty * q.unitPrices[i] * 100) / 100,
            })),
          },
        },
      });
    }

    if (demo.rfqCode === "RFQ/2026/00001") {
      const submitted = await prisma.rfqQuote.findMany({
        where: { rfqId: rfq.id, status: "SUBMITTED" },
        include: { vendor: true, lines: { orderBy: { lineNo: "asc" } } },
        orderBy: { createdAt: "asc" },
      });
      const quoteRows = submitted.map((q) => ({
        quoteId: q.id,
        vendorId: q.vendorId,
        vendorName: q.vendor.legalName,
        comparableTotal: Math.round((q.totalLandedAmount + q.cashCost) * 100) / 100,
        deliveryDays: q.deliveryDays,
        creditDays: q.creditDays,
        vendorRating: q.vendor.rating,
      }));
      const scores = scoreQuotes(
        quoteRows.map((q) => ({
          comparableTotal: q.comparableTotal,
          deliveryDays: q.deliveryDays,
          creditDays: q.creditDays,
          vendorRating: q.vendorRating,
        })),
      );
      const scoresJson = JSON.stringify(
        quoteRows.map((q, i) => ({
          quoteId: q.quoteId,
          vendorId: q.vendorId,
          vendorName: q.vendorName,
          comparableTotal: q.comparableTotal,
          landedUnitCosts: submitted[i].lines.map((l) => l.landedUnitCost),
          ...scores[i],
        })),
      );
      const winner = scores.reduce((best, s, i) => (s.total > best.total ? { total: s.total, i } : best), {
        total: -1,
        i: 0,
      }).i;
      const recommendedVendor = quoteRows[winner].vendorName;
      const recommendationJson = JSON.stringify({
        recommended_vendor: recommendedVendor,
        reasoning: `Highest weighted score (${scores[winner].total.toFixed(1)}/100) after landed-cost normalisation — strongest vendor rating and payment terms outweigh the small landed-cost premium.`,
        risks: ["Longest delivery of the three quotes"],
        negotiation_tips: [
          "Ask for delivery to match the fastest quote",
          "Seek a volume discount in exchange for the 60-day credit line",
        ],
        mock: true,
      });
      await prisma.rfqEvaluation.create({
        data: {
          rfqId: rfq.id,
          scoresJson,
          recommendationJson,
          evaluatorId: buyer.id,
        },
      });
      await prisma.rfq.update({
        where: { id: rfq.id },
        data: { status: "EVALUATING" },
      });
    }
  }

  const READY_PR_CODE = "PR/2026/00005";
  const readyPr = await prisma.purchaseRequisition.findUnique({
    where: { orgId_code: { orgId: org.id, code: READY_PR_CODE } },
    include: { purchaseOrders: { select: { id: true } }, rfqs: { select: { id: true } } },
  });
  if (!readyPr || (readyPr.purchaseOrders.length === 0 && readyPr.rfqs.length === 0)) {
    const readyLines: DemoPrLine[] = [
      { itemCode: "IT/2026/00013", qty: 100, unitPrice: 450, taxRatePct: 18 },
      { itemCode: "IT/2026/00014", qty: 200, unitPrice: 320, taxRatePct: 18 },
      { itemCode: "IT/2026/00009", qty: 80, unitPrice: 1450, taxRatePct: 12 },
    ];
    const items = await prisma.item.findMany({
      where: { orgId: org.id, code: { in: readyLines.map((l) => l.itemCode) } },
    });
    const itemByCode = new Map(items.map((i) => [i.code, i]));
    const budget = budgetByKey.get("Operations|RAW_MATERIAL");
    const lines = readyLines.map((l, index) => {
      const item = itemByCode.get(l.itemCode);
      if (!item) throw new Error(`Seed item ${l.itemCode} missing`);
      const subtotal = Math.round(l.qty * l.unitPrice * 100) / 100;
      const taxAmount = Math.round((subtotal * l.taxRatePct) / 100 * 100) / 100;
      return {
        lineNo: index + 1,
        itemId: item.id,
        itemCode: item.code,
        name: item.name,
        hsnSac: item.hsnSac,
        qty: l.qty,
        unit: item.unit,
        unitPrice: l.unitPrice,
        taxRatePct: l.taxRatePct,
        subtotal,
        taxAmount,
        lineTotal: Math.round((subtotal + taxAmount) * 100) / 100,
      };
    });
    await prisma.purchaseRequisition.upsert({
      where: { orgId_code: { orgId: org.id, code: READY_PR_CODE } },
      update: {
        department: "Operations",
        budgetId: budget?.id ?? null,
        status: PR_APPROVED,
        notes: "Safety consumables — approved, ready to send for quotes.",
        totalAmount: lines.reduce((s, l) => s + l.lineTotal, 0),
        decidedAt: new Date(),
        lines: { deleteMany: {}, create: lines },
      },
      create: {
        orgId: org.id,
        code: READY_PR_CODE,
        requesterId: requester.id,
        department: "Operations",
        budgetId: budget?.id ?? null,
        status: PR_APPROVED,
        expectedDeliveryDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
        notes: "Safety consumables — approved, ready to send for quotes.",
        totalAmount: lines.reduce((s, l) => s + l.lineTotal, 0),
        submittedAt: new Date(),
        decidedAt: new Date(),
        createdById: requester.id,
        lines: { create: lines },
      },
    });
  }

  await prisma.numberSeries.upsert({
    where: { orgId_entity_year: { orgId: org.id, entity: "PR", year: YEAR } },
    update: { lastNumber: 5 },
    create: { orgId: org.id, entity: "PR", year: YEAR, lastNumber: 5 },
  });
  await prisma.numberSeries.upsert({
    where: { orgId_entity_year: { orgId: org.id, entity: "RFQ", year: YEAR } },
    update: { lastNumber: 2 },
    create: { orgId: org.id, entity: "RFQ", year: YEAR, lastNumber: 2 },
  });

  console.log("Seeded:", {
    org: org.name,
    users: USERS.length,
    vendors: VENDORS.length,
    items: ITEMS.length,
    budgets: BUDGETS.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
