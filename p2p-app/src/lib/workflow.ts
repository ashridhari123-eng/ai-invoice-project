import type { TxClient } from "@/lib/db";
import { logAudit, type AuditEntity } from "@/lib/audit";
export const APPROVAL_PENDING = "PENDING";
export const APPROVAL_APPROVED = "APPROVED";
export const APPROVAL_REJECTED = "REJECTED";
export const APPROVAL_CANCELLED = "CANCELLED";

export interface ApprovalStep {
  role: string;
}

export interface RuleConditions {
  minAmount?: number;
  maxAmount?: number;
}

export type ApprovalDecision = "APPROVE" | "REJECT" | "SEND_BACK";

export function parseSteps(raw: string): ApprovalStep[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is ApprovalStep =>
        typeof s === "object" && s !== null && typeof (s as ApprovalStep).role === "string",
    );
  } catch {
    return [];
  }
}

export function parseConditions(raw: string): RuleConditions {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as RuleConditions;
  } catch {
    return {};
  }
}

export function serializeSteps(steps: ApprovalStep[]): string {
  return JSON.stringify(steps);
}

export function serializeConditions(conditions: RuleConditions): string {
  return JSON.stringify(conditions);
}

export async function findMatchingRule(
  tx: TxClient,
  orgId: string,
  docType: string,
  amount: number,
) {
  const rules = await tx.approvalRule.findMany({
    where: { orgId, docType, isActive: true },
    orderBy: { priority: "asc" },
  });

  for (const rule of rules) {
    const c = parseConditions(rule.conditions);
    const min = c.minAmount ?? 0;
    const max = c.maxAmount ?? Infinity;
    if (amount >= min && amount <= max) return rule;
  }
  return rules[0] ?? null;
}

export function stepsForRule(
  rule: { steps: string } | null | undefined,
): ApprovalStep[] {
  return rule ? parseSteps(rule.steps) : [];
}

export async function currentStepActors(
  tx: TxClient,
  orgId: string,
  roleCode: string,
): Promise<Array<{ id: string; name: string; email: string }>> {
  const roles = await tx.role.findMany({
    where: { orgId, code: roleCode },
    select: { id: true },
  });
  if (roles.length === 0) return [];

  const users = await tx.user.findMany({
    where: {
      orgId,
      roleId: { in: roles.map((r) => r.id) },
      isActive: true,
    },
    select: { id: true, name: true, email: true },
  });
  return users;
}

export async function notifyUser(
  tx: TxClient,
  input: {
    orgId: string;
    userId: string;
    type: string;
    title: string;
    message?: string;
    docType?: string;
    docId?: string;
  },
) {
  await tx.notification.create({
    data: {
      orgId: input.orgId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      docType: input.docType ?? null,
      docId: input.docId ?? null,
    },
  });
}

interface StartApprovalInput {
  orgId: string;
  docType: string;
  docId: string;
  ruleId: string | null;
  submittedById: string;
  amount: number;
  department?: string | null;
  ip?: string | null;
  entity?: string;
}

export async function startApprovalInstance(
  tx: TxClient,
  input: StartApprovalInput,
) {
  const instance = await tx.approvalInstance.create({
    data: {
      orgId: input.orgId,
      docType: input.docType,
      docId: input.docId,
      ruleId: input.ruleId,
      status: APPROVAL_PENDING,
      currentStep: 1,
      submittedById: input.submittedById,
      amount: input.amount,
      department: input.department ?? null,
    },
  });

  const rule = input.ruleId
    ? await tx.approvalRule.findUnique({ where: { id: input.ruleId } })
    : null;
  const steps = stepsForRule(rule);

  if (steps.length > 0) {
    const actors = await currentStepActors(tx, input.orgId, steps[0].role);
    for (const actor of actors) {
      await notifyUser(tx, {
        orgId: input.orgId,
        userId: actor.id,
        type: "APPROVAL_TASK",
        title: "Approval request",
        message: `A ${input.docType} of ${formatINR(input.amount)} is awaiting your approval.`,
        docType: input.docType,
        docId: input.docId,
      });
    }
  }

  await logAudit(tx, {
    orgId: input.orgId,
    actorId: input.submittedById,
    actorEmail: null,
    entity: (input.entity ?? "PR") as AuditEntity,
    entityId: input.docId,
    action: "SUBMIT",
    after: { amount: input.amount, ruleId: input.ruleId, step: 1 },
    ip: input.ip,
  });

  return instance;
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

interface DecisionInput {
  tx: TxClient;
  instanceId: string;
  actorId: string;
  decision: ApprovalDecision;
  comment?: string | null;
  ip?: string | null;
  entity?: string;
}

export interface ApprovalOutcome {
  instanceId: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  decided: boolean;
  approved: boolean;
  stepRole?: string;
}

export async function applyApprovalDecision(
  input: DecisionInput,
): Promise<ApprovalOutcome> {
  const { tx, instanceId, actorId, decision, comment, ip } = input;

  const instance = await tx.approvalInstance.findUnique({
    where: { id: instanceId },
  });
  if (!instance) throw new Error("Approval instance not found");
  if (instance.status !== APPROVAL_PENDING) {
    throw new Error("This approval has already been decided");
  }

  const rule = instance.ruleId
    ? await tx.approvalRule.findUnique({ where: { id: instance.ruleId } })
    : null;
  const steps = stepsForRule(rule);
  const stepIndex = instance.currentStep - 1;
  const step = steps[stepIndex];
  if (!step) throw new Error("Approval rule has no steps");

  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor) throw new Error("Actor not found");
  if (actor.roleId !== null) {
    const role = await tx.role.findUnique({ where: { id: actor.roleId } });
    if (!role || role.code !== step.role) {
      throw new Error("You are not authorised to act on this step");
    }
  }

  await tx.approvalAction.create({
    data: {
      instanceId,
      step: instance.currentStep,
      actorId,
      decision,
      comment: comment ?? null,
    },
  });

  let status = APPROVAL_PENDING;
  let currentStep = instance.currentStep;
  let approved = false;

  if (decision === "REJECT" || decision === "SEND_BACK") {
    status = APPROVAL_REJECTED;
  } else if (stepIndex + 1 >= steps.length) {
    status = APPROVAL_APPROVED;
    approved = true;
  } else {
    currentStep = stepIndex + 2;
  }

  await tx.approvalInstance.update({
    where: { id: instanceId },
    data: {
      status,
      currentStep,
      decidedAt: status !== APPROVAL_PENDING ? new Date() : undefined,
    },
  });

  await logAudit(tx, {
    orgId: instance.orgId,
    actorId,
    actorEmail: actor.email,
    entity: (input.entity ?? "PR") as AuditEntity,
    entityId: instance.docId,
    action: decision === "APPROVE" ? "APPROVE" : "REJECT",
    before: { step: instance.currentStep },
    after: { status, step: currentStep },
    ip: ip ?? null,
  });
  if (status === APPROVAL_PENDING) {
    const nextStep = steps[stepIndex + 1];
    if (nextStep) {
      const nextActors = await currentStepActors(tx, instance.orgId, nextStep.role);
      for (const a of nextActors) {
        await notifyUser(tx, {
          orgId: instance.orgId,
          userId: a.id,
          type: "APPROVAL_TASK",
          title: "Approval request",
          message: `A ${instance.docType} of ${formatINR(instance.amount)} is awaiting your approval.`,
          docType: instance.docType,
          docId: instance.docId,
        });
      }
    }
  }

  if (instance.submittedById) {
    await notifyUser(tx, {
      orgId: instance.orgId,
      userId: instance.submittedById,
      type: "APPROVAL_DECISION",
      title:
        decision === "APPROVE"
          ? "Step approved"
          : decision === "SEND_BACK"
            ? "Returned for revision"
            : "Rejected",
      message:
        decision === "APPROVE"
          ? `Step ${instance.currentStep} of ${instance.docType} ${instance.docId} was approved by ${actor.name}.`
          : decision === "SEND_BACK"
            ? `${instance.docType} ${instance.docId} was returned to you by ${actor.name}${comment ? ` — "${comment}"` : ""}. Please revise and resubmit.`
            : `${instance.docType} ${instance.docId} was rejected by ${actor.name}.`,
      docType: instance.docType,
      docId: instance.docId,
    });
  }

  return {
    instanceId,
    status,
    currentStep,
    totalSteps: steps.length,
    decided: status !== APPROVAL_PENDING,
    approved,
    stepRole: step.role,
  };
}
