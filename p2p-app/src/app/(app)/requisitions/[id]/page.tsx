import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatINR, formatDateTime } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardHeader,
  Table,
  Th,
  Td,
  StatusBadge,
  Badge,
} from "@/components/ui";
import RequisitionControls, {
  type DecisionTarget,
} from "@/components/RequisitionControls";
import ConvertToPO from "@/components/ConvertToPO";
import {
  PR_DRAFT,
  PR_SUBMITTED,
  PR_APPROVED,
  PR_RETURNED,
  PR_CANCELLED,
  budgetAvailability,
} from "@/lib/requisitions";
import {
  APPROVAL_PENDING,
  APPROVAL_REJECTED,
  stepsForRule,
  type ApprovalStep,
} from "@/lib/workflow";

interface StepStatus {
  step: number;
  role: string;
  state: "APPROVED" | "REJECTED" | "RETURNED" | "AWAITING" | "QUEUED" | "NOT_REACHED";
  actorName?: string;
  comment?: string;
  at?: Date;
}

function buildTimeline(
  steps: ApprovalStep[],
  instance: {
    status: string;
    currentStep: number;
    actions: Array<{
      step: number;
      decision: string;
      comment: string | null;
      actor: { name: string };
    }>;
  },
): StepStatus[] {
  const actionByStep = new Map<number, (typeof instance.actions)[number]>();
  for (const a of instance.actions) actionByStep.set(a.step, a);

  return steps.map((s, index) => {
    const stepNo = index + 1;
    const action = actionByStep.get(stepNo);
    if (action) {
      return {
        step: stepNo,
        role: s.role,
        state:
          action.decision === "APPROVE"
            ? "APPROVED"
            : action.decision === "SEND_BACK"
              ? "RETURNED"
              : "REJECTED",
        actorName: action.actor.name,
        comment: action.comment ?? undefined,
        at: undefined,
      };
    }
    if (instance.status === APPROVAL_PENDING && stepNo === instance.currentStep) {
      return { step: stepNo, role: s.role, state: "AWAITING" };
    }
    if (instance.status === APPROVAL_PENDING && stepNo > instance.currentStep) {
      return { step: stepNo, role: s.role, state: "QUEUED" };
    }
    if (instance.status === APPROVAL_REJECTED) {
      return { step: stepNo, role: s.role, state: "NOT_REACHED" };
    }
    return { step: stepNo, role: s.role, state: "APPROVED" };
  });
}

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const canApproveAction = can(user.role, PERMISSIONS.APPROVALS_WRITE);
  const canWrite = can(user.role, PERMISSIONS.REQUISITIONS_WRITE);

  const requisition = await db.purchaseRequisition.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      budget: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });
  if (!requisition) notFound();

  const instances = await db.approvalInstance.findMany({
    where: { orgId: user.orgId, docType: "PR", docId: id },
    include: {
      rule: true,
      actions: {
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const existingPo = await db.purchaseOrder.findFirst({
    where: { orgId: user.orgId, requisitionId: id },
    select: { id: true, code: true, status: true },
  });
  const canCreatePo =
    requisition.status === PR_APPROVED &&
    !existingPo &&
    can(user.role, PERMISSIONS.PO_WRITE);

  let availability: {
    allocated: number;
    spent: number;
    committed: number;
    available: number;
  } | null = null;
  if (requisition.budgetId) {
    availability = await budgetAvailability(db, user.orgId, requisition.budgetId);
  }

  const isOwner = requisition.requesterId === user.id;
  const isAdmin = user.role.code === "ADMIN";
  const status = requisition.status;

  const activeInstance = instances.find((i) => i.status === APPROVAL_PENDING) ?? instances[0];
  let decisionTarget: DecisionTarget | null = null;
  if (activeInstance && status === PR_SUBMITTED && canApproveAction) {
    const steps = stepsForRule(activeInstance.rule);
    const step = steps[activeInstance.currentStep - 1];
    if (step && step.role === user.role.code) {
      decisionTarget = {
        instanceId: activeInstance.id,
        canApprove: true,
      };
    }
  }

  const timeline = activeInstance
    ? buildTimeline(
        stepsForRule(activeInstance.rule),
        activeInstance as unknown as {
          status: string;
          currentStep: number;
          actions: Array<{
            step: number;
            decision: string;
            comment: string | null;
            actor: { name: string };
          }>;
        },
      )
    : [];

  return (
    <div>
      <PageHeader
        title={requisition.code}
        subtitle="Purchase requisition"
        actions={<StatusBadge status={status} />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Request details" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Requester</dt>
                <dd className="mt-1 font-medium text-ink">{requisition.requester.name}</dd>
                <dd className="text-xs text-ink-soft">{requisition.requester.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Department</dt>
                <dd className="mt-1 font-medium text-ink">{requisition.department}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Created</dt>
                <dd className="mt-1 font-medium text-ink">{formatDateTime(requisition.createdAt)}</dd>
              </div>
              {requisition.expectedDeliveryDate ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Need by</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {formatDateTime(requisition.expectedDeliveryDate)}
                  </dd>
                </div>
              ) : null}
              {requisition.budget ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Budget line</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {requisition.budget.department} · {requisition.budget.category.replace("_", " ")}
                  </dd>
                  <dd className="text-xs text-ink-soft">{requisition.budget.period}</dd>
                </div>
              ) : null}
              {requisition.notes ? (
                <div className="col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Notes</dt>
                  <dd className="mt-1 text-ink">{requisition.notes}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Line items"
              subtitle={`${requisition.lines.length} line${requisition.lines.length === 1 ? "" : "s"}`}
            />
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Item</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">GST</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {requisition.lines.map((l) => (
                  <tr key={l.id} className="hover:bg-paper/40">
                    <Td className="font-mono text-xs text-ink-soft">{l.lineNo}</Td>
                    <Td>
                      <p className="text-sm font-medium text-ink">{l.name}</p>
                      <p className="font-mono text-[10px] text-ink-soft">
                        {l.itemCode} · HSN {l.hsnSac}
                      </p>
                    </Td>
                    <Td className="text-right font-mono text-sm text-ink">
                      {l.qty} {l.unit}
                    </Td>
                    <Td className="text-right font-mono text-sm text-ink">{formatINR(l.unitPrice)}</Td>
                    <Td className="text-right font-mono text-sm text-ink-soft">{l.taxRatePct}%</Td>
                    <Td className="text-right font-mono text-sm font-medium text-ink">{formatINR(l.lineTotal)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex flex-wrap items-end justify-end gap-6 border-t border-line px-5 py-4">
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Subtotal</p>
                <p className="font-mono text-sm font-medium text-ink">{formatINR(requisition.totalAmount - requisition.lines.reduce((s, l) => s + l.taxAmount, 0))}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tax</p>
                <p className="font-mono text-sm font-medium text-ink">{formatINR(requisition.lines.reduce((s, l) => s + l.taxAmount, 0))}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Total</p>
                <p className="font-display text-lg font-bold text-pink">{formatINR(requisition.totalAmount)}</p>
              </div>
            </div>
          </Card>

          {timeline.length > 0 ? (
            <Card>
              <CardHeader
                title="Approval route"
                subtitle={activeInstance ? `Rule: ${activeInstance.rule?.name ?? "Default"} · ${activeInstance.status.replace("_", " ")}` : undefined}
              />
              <ol className="divide-y divide-line">
                {timeline.map((t) => (
                  <li key={t.step} className="flex items-start gap-4 px-5 py-3.5">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper font-mono text-xs font-semibold text-ink-soft">
                      {t.step}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink">
                          {t.role.replace("_", " ")}
                        </p>
                        <span>
                          {t.state === "AWAITING" ? (
                            <Badge tone="amber">Awaiting decision</Badge>
                          ) : t.state === "APPROVED" ? (
                            <Badge tone="teal">Approved{t.actorName ? ` · ${t.actorName}` : ""}</Badge>
                          ) : t.state === "RETURNED" ? (
                            <Badge tone="amber">Returned{t.actorName ? ` · ${t.actorName}` : ""}</Badge>
                          ) : t.state === "REJECTED" ? (
                            <Badge tone="red">Rejected{t.actorName ? ` · ${t.actorName}` : ""}</Badge>
                          ) : t.state === "QUEUED" ? (
                            <Badge tone="gray">In queue</Badge>
                          ) : (
                            <Badge tone="gray">Not reached</Badge>
                          )}
                        </span>
                      </div>
                      {t.comment ? (
                        <p className="mt-0.5 text-xs text-ink-soft">&ldquo;{t.comment}&rdquo;</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {canWrite || canCreatePo || existingPo ? (
            <Card className="p-5">
              <h3 className="font-display text-base font-semibold text-ink">Actions</h3>
              <div className="mt-3">
                <RequisitionControls
                  id={id}
                  status={status}
                  canSubmit={
                    (status === PR_DRAFT || status === PR_RETURNED) && (isOwner || isAdmin)
                  }
                  canWithdraw={status === PR_SUBMITTED && (isOwner || isAdmin)}
                  canCancel={status !== PR_CANCELLED && status !== PR_APPROVED && (isOwner || isAdmin)}
                  decision={decisionTarget}
                />
              </div>
              {canCreatePo ? (
                <div className="mt-4 border-t border-line pt-4">
                  <h4 className="font-display text-sm font-semibold text-ink">
                    Create purchase order
                  </h4>
                  <div className="mt-2">
                    <ConvertToPO requisitionId={id} />
                  </div>
                </div>
              ) : existingPo ? (
                <p className="mt-3 text-xs text-ink-soft">
                  Converted to{" "}
                  <a
                    href={`/purchase-orders/${existingPo.id}`}
                    className="font-mono font-semibold text-pink hover:underline"
                  >
                    {existingPo.code}
                  </a>
                  {existingPo.status !== "DRAFT" ? ` · ${existingPo.status.replace("_", " ")}` : ""}.
                </p>
              ) : null}
              {status === PR_RETURNED ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">
                    Returned for revision
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    {(() => {
                      const returns = instances.flatMap((inst) =>
                        inst.actions.filter((a) => a.decision === "SEND_BACK"),
                      );
                      const last = returns[returns.length - 1];
                      if (!last) return "An approver asked for changes.";
                      return `An approver asked for changes${last.comment ? ` — "${last.comment}"` : ""}. Revise and resubmit to restart the approval route.`;
                    })()}
                  </p>
                </div>
              ) : null}
              {status === PR_CANCELLED ? (
                <p className="mt-3 text-xs text-ink-soft">This requisition is cancelled.</p>
              ) : null}
            </Card>
          ) : null}

          {availability ? (
            <Card className="p-5">
              <h3 className="font-display text-base font-semibold text-ink">Budget</h3>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ["Allocated", availability.allocated],
                  ["Committed", availability.committed],
                  ["Spent", availability.spent],
                  ["Available", availability.available],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <dt className="text-xs uppercase tracking-wide text-ink-soft">{label}</dt>
                    <dd className={`font-mono text-sm font-medium ${label === "Available" ? "text-teal" : "text-ink"}`}>
                      {formatINR(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Status history" />
            <div className="divide-y divide-line">
              {instances.length === 0 ? (
                <p className="px-5 py-8 text-sm text-ink-soft">Not submitted yet.</p>
              ) : (
                instances.flatMap((inst) =>
                  inst.actions.length === 0
                    ? []
                    : inst.actions.map((a) => (
                        <div key={a.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                          <div>
                            <p className="font-medium text-ink">{a.actor.name}</p>
                            <p className="text-xs text-ink-soft">
                              {a.decision} · step {a.step}
                              {a.comment ? ` — "${a.comment}"` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-ink-soft">{formatDateTime(a.createdAt)}</span>
                        </div>
                      )),
                )
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
