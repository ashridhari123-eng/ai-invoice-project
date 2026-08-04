import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/api";
import { PERMISSIONS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";

const CreateSchema = z.object({
  department: z.string().min(1),
  category: z.string().min(1),
  period: z.string().min(1),
  allocatedAmount: z.number().positive(),
});

export async function GET() {
  const { error } = await requireApiAuth(PERMISSIONS.BUDGETS_READ);
  if (error) return error;

  const budgets = await db.budget.findMany({
    orderBy: [{ department: "asc" }, { category: "asc" }],
  });

  return NextResponse.json({ budgets });
}

export async function POST(request: Request) {
  const { error, user } = await requireApiAuth(PERMISSIONS.BUDGETS_WRITE);
  if (error || !user) return error ?? NextResponse.json({}, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { department, category, period, allocatedAmount } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.budget.findFirst({
        where: { orgId: user.orgId, department, category, period },
      });
      if (existing) {
        throw new Error("A budget already exists for this department, category, and period");
      }
      const budget = await tx.budget.create({
        data: {
          orgId: user.orgId,
          department,
          category,
          period,
          allocatedAmount,
        },
      });
      await logAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        actorEmail: user.email,
        entity: "BUDGET",
        entityId: budget.id,
        action: "CREATE",
        after: { department, category, period, allocatedAmount },
      });
      return budget;
    });

    return NextResponse.json({ budget: result });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
