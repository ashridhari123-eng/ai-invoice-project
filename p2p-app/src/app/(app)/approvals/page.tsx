import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/roles";
import { formatINR, formatDateTime } from "@/lib/format";
import {
  PageHeader,
  Card,
  Badge,
  EmptyState,
} from "@/components/ui";
import ApprovalDecision from "@/components/ApprovalDecision";
import { stepsForRule } from "@/lib/workflow";

export default async function ApprovalsPage() {
  const user = await requirePermission(PERMISSIONS.APPROVALS_READ);

  const instances = await db.approvalInstance.findMany({
    where: { orgId: user.orgId, status: "PENDING", docType: { in: ["PR", "INV"] } },
    include: {
      rule: true,
      actions: { include: { actor: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const mine = instances.filter((i) => {
    const steps = stepsForRule(i.rule);
    const step = steps[i.currentStep - 1];
    return step ? step.role === user.role.code : false;
  });

  const prIds = mine.filter((i) => i.docType === "PR").map((i) => i.docId);
  const invIds = mine.filter((i) => i.docType === "INV").map((i) => i.docId);

  const [requisitions, invoices] = await Promise.all([
    db.purchaseRequisition.findMany({
      where: { orgId: user.orgId, id: { in: prIds } },
      include: {
        requester: { select: { name: true, email: true } },
        budget: { select: { department: true, category: true } },
      },
    }),
    db.invoice.findMany({
      where: { orgId: user.orgId, id: { in: invIds } },
      include: {
        vendor: { select: { legalName: true } },
        purchaseOrder: { select: { code: true } },
      },
    }),
  ]);

  const reqById = new Map(requisitions.map((r) => [r.id, r]));
  const invById = new Map(invoices.map((i) => [i.id, i]));

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Requisitions and invoices waiting on your decision, by the delegation of authority."
      />

      {mine.length === 0 ? (
        <Card>
          <EmptyState message="Nothing waiting on you right now." />
        </Card>
      ) : (
        <div className="space-y-4">
          {mine.map((instance) => {
            const steps = stepsForRule(instance.rule);
            const totalSteps = steps.length;

            if (instance.docType === "PR") {
              const req = reqById.get(instance.docId);
              if (!req) return null;
              return (
                <Card key={instance.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/requisitions/${req.id}`}
                          className="font-mono text-sm font-semibold text-pink hover:underline"
                        >
                          {req.code}
                        </Link>
                        <Badge tone="blue">Requisition</Badge>
                        <Badge tone="amber">
                          Step {instance.currentStep} of {totalSteps}
                        </Badge>
                        <span className="font-mono text-xs text-ink-soft">
                          {formatDateTime(instance.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-ink">
                        {req.requester.name}
                        <span className="text-ink-soft">
                          {" "}
                          · {req.department}
                          {req.budget
                            ? ` · ${req.budget.category.replace("_", " ")}`
                            : ""}
                        </span>
                      </p>
                      {instance.actions.length > 0 ? (
                        <p className="mt-1 text-xs text-ink-soft">
                          Prior:{" "}
                          {instance.actions
                            .map((a) => `${a.actor.name} (${a.decision.toLowerCase()})`)
                            .join(" → ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Amount</p>
                      <p className="font-display text-xl font-bold text-pink">
                        {formatINR(instance.amount)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-line pt-4">
                    <ApprovalDecision docType="PR" id={req.id} />
                  </div>
                </Card>
              );
            }

            const inv = invById.get(instance.docId);
            if (!inv) return null;
            return (
              <Card key={instance.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono text-sm font-semibold text-pink hover:underline"
                      >
                        {inv.code}
                      </Link>
                      <Badge tone="ink">Invoice</Badge>
                      <Badge tone="amber">
                        Step {instance.currentStep} of {totalSteps}
                      </Badge>
                      <span className="font-mono text-xs text-ink-soft">
                        {formatDateTime(instance.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-ink">
                      {inv.vendor.legalName}
                      <span className="text-ink-soft">
                        {" "}
                        · {inv.invoiceNumber}
                        {inv.purchaseOrder ? ` · PO ${inv.purchaseOrder.code}` : ""}
                      </span>
                    </p>
                    {instance.actions.length > 0 ? (
                      <p className="mt-1 text-xs text-ink-soft">
                        Prior:{" "}
                        {instance.actions
                          .map((a) => `${a.actor.name} (${a.decision.toLowerCase()})`)
                          .join(" → ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Amount</p>
                    <p className="font-display text-xl font-bold text-pink">
                      {formatINR(inv.totalAmount)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-4">
                  <ApprovalDecision docType="INV" id={inv.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
