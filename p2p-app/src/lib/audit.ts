import type { TxClient } from "@/lib/db";

export type AuditEntity =
  | "USER"
  | "ROLE"
  | "VENDOR"
  | "VENDOR_BANK_ACCOUNT"
  | "ITEM"
  | "BUDGET"
  | "NUMBER_SERIES"
  | "PR"
  | "PO"
  | "GRN"
  | "INVOICE"
  | "RFQ"
  | "CAPTURE"
  | "ADVANCE"
  | "SYNC"
  | "ZOHO";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATUS_CHANGE"
  | "LOGIN"
  | "DEMO_LOGIN"
  | "LOGOUT"
  | "UPLOAD"
  | "APPROVE"
  | "REJECT"
  | "SUBMIT"
  | "DECISION"
  | "AUTO_APPROVE"
  | "SEND"
  | "RECEIVE"
  | "MATCH"
  | "BOOK"
  | "PUSH"
  | "PULL"
  | "CONNECT"
  | "DISCONNECT"
  | "EVALUATE"
  | "AWARD"
  | "EXTRACT"
  | "VERIFY"
  | "CONVERT"
  | "PAY"
  | "APPLY"
  | "REVERSE";

interface AuditInput {
  orgId: string;
  actorId: string | null;
  actorEmail: string | null;
  entity: AuditEntity;
  entityId: string | null;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  } catch {
    return null;
  }
}

export async function logAudit(tx: TxClient, input: AuditInput) {
  await tx.auditLog.create({
    data: {
      orgId: input.orgId,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      beforeJson: serialize(input.before),
      afterJson: serialize(input.after),
      ip: input.ip,
    },
  });
}
