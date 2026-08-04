import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth, clientIp } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { nextDocNumber, DOC_ENTITY_VENDOR } from "@/lib/numbers";
import { isValidGSTIN, isValidIFSC, isValidPAN } from "@/lib/validators";

const BankAccountSchema = z.object({
  accountName: z.string().min(1, "Account holder name is required"),
  accountNumber: z
    .string()
    .min(9, "Account number must be at least 9 digits")
    .max(18, "Account number is too long")
    .regex(/^[0-9]+$/, "Account number must be numeric"),
  ifsc: z
    .string()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Invalid IFSC code"),
});

const VendorSchema = z
  .object({
    legalName: z.string().min(2, "Legal name is required"),
    tradeName: z.string().optional().or(z.literal("")),
    pan: z
      .string()
      .regex(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, "Invalid PAN"),
    gstin: z
      .string()
      .regex(
        /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]$/,
        "Invalid GSTIN",
      )
      .optional()
      .or(z.literal("")),
    msmeNumber: z.string().optional().or(z.literal("")),
    msmeType: z.string().optional().or(z.literal("")),
    category: z.string().optional().or(z.literal("")),
    paymentTermsDays: z.coerce
      .number()
      .int()
      .min(0)
      .max(180)
      .default(30),
    currency: z.string().default("INR"),
    tdsSection: z.string().optional().or(z.literal("")),
    tdsRate: z.coerce.number().min(0).max(20).optional().nullable(),
    bankAccount: BankAccountSchema.optional(),
  })
  .refine(
    (v) => !v.gstin || isValidGSTIN(v.gstin.toUpperCase()),
    { message: "Invalid GSTIN", path: ["gstin"] },
  )
  .refine(
    (v) => !v.pan || isValidPAN(v.pan.toUpperCase()),
    { message: "Invalid PAN", path: ["pan"] },
  )
  .refine(
    (v) => !v.bankAccount || isValidIFSC(v.bankAccount.ifsc.toUpperCase()),
    { message: "Invalid IFSC", path: ["bankAccount", "ifsc"] },
  )
  .refine(
    (v) =>
      !v.gstin ||
      v.gstin.toUpperCase().slice(2, 12) === v.pan.toUpperCase(),
    { message: "GSTIN does not match PAN", path: ["gstin"] },
  );

export async function GET() {
  const { error } = await requireApiAuth(PERMISSIONS.VENDORS_READ);
  if (error) return error;

  const vendors = await db.vendor.findMany({
    include: { bankAccounts: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ vendors });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.VENDORS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = VendorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const vendor = await db.$transaction(async (tx) => {
      const code = await nextDocNumber(tx, user.orgId, DOC_ENTITY_VENDOR);
      const created = await tx.vendor.create({
        data: {
          orgId: user.orgId,
          code,
          legalName: data.legalName.trim(),
          tradeName: data.tradeName?.trim() || null,
          pan: data.pan.toUpperCase(),
          gstin: data.gstin ? data.gstin.toUpperCase() : null,
          msmeNumber: data.msmeNumber?.trim() || null,
          msmeType: data.msmeType?.trim() || null,
          category: data.category?.trim() || null,
          paymentTermsDays: data.paymentTermsDays,
          currency: data.currency,
          tdsSection: data.tdsSection?.trim() || null,
          tdsRate: data.tdsRate ?? null,
          status: "ACTIVE",
          createdById: user.id,
        },
      });

      if (data.bankAccount) {
        await tx.vendorBankAccount.create({
          data: {
            vendorId: created.id,
            accountName: data.bankAccount.accountName.trim(),
            accountNumber: data.bankAccount.accountNumber,
            ifsc: data.bankAccount.ifsc.toUpperCase(),
            isPrimary: true,
            status: "PENDING",
            createdById: user.id,
          },
        });
      }

      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "VENDOR",
        entityId: created.id,
        action: "CREATE",
        after: created,
        ip: clientIp(request),
      });

      return created;
    });

    return NextResponse.json({ vendor }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "A vendor with this PAN already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
}
