export const ROLE_ADMIN = "ADMIN";
export const ROLE_REQUESTER = "REQUESTER";
export const ROLE_APPROVER = "APPROVER";
export const ROLE_BUYER = "BUYER";
export const ROLE_STORES = "STORES";
export const ROLE_AP = "AP_ACCOUNTANT";
export const ROLE_FINANCE = "FINANCE_CONTROLLER";
export const ROLE_AUDITOR = "AUDITOR";

export const PERMISSIONS = {
  DASHBOARD_READ: "dashboard:read",
  VENDORS_READ: "vendors:read",
  VENDORS_WRITE: "vendors:write",
  ITEMS_READ: "items:read",
  ITEMS_WRITE: "items:write",
  BUDGETS_READ: "budgets:read",
  BUDGETS_WRITE: "budgets:write",
  AUDIT_READ: "audit:read",
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  REQUISITIONS_READ: "requisitions:read",
  REQUISITIONS_WRITE: "requisitions:write",
  RFQ_READ: "rfq:read",
  RFQ_WRITE: "rfq:write",
  CAPTURES_READ: "captures:read",
  CAPTURES_WRITE: "captures:write",
  PO_READ: "po:read",
  PO_WRITE: "po:write",
  APPROVALS_READ: "approvals:read",
  APPROVALS_WRITE: "approvals:write",
  INVOICES_READ: "invoices:read",
  INVOICES_WRITE: "invoices:write",
  ADVANCES_READ: "advances:read",
  ADVANCES_WRITE: "advances:write",
  PAYMENTS_READ: "payments:read",
  PAYMENTS_WRITE: "payments:write",
  RECEIPTS_READ: "receipts:read",
  RECEIPTS_WRITE: "receipts:write",
  ZOHO_MANAGE: "zoho:manage",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionValue = (typeof PERMISSIONS)[PermissionKey];

export interface RoleSeed {
  code: string;
  name: string;
  description: string;
  permissions: Array<PermissionValue | "*">;
}

export const ROLE_SEEDS: RoleSeed[] = [
  {
    code: ROLE_ADMIN,
    name: "Administrator",
    description: "Full system access. Manages users, masters, and configuration.",
    permissions: ["*"],
  },
  {
    code: ROLE_REQUESTER,
    name: "Requester",
    description: "Raises purchase requisitions and tracks their status.",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.ITEMS_READ,
      PERMISSIONS.BUDGETS_READ,
      PERMISSIONS.REQUISITIONS_READ,
      PERMISSIONS.REQUISITIONS_WRITE,
      PERMISSIONS.APPROVALS_READ,
    ],
  },
  {
    code: ROLE_APPROVER,
    name: "Approver",
    description: "Reviews and approves purchase requisitions within limits.",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.ITEMS_READ,
      PERMISSIONS.BUDGETS_READ,
      PERMISSIONS.REQUISITIONS_READ,
      PERMISSIONS.REQUISITIONS_WRITE,
      PERMISSIONS.APPROVALS_READ,
      PERMISSIONS.APPROVALS_WRITE,
    ],
  },
  {
    code: ROLE_BUYER,
    name: "Buyer",
    description: "Runs RFQs, creates purchase orders, and manages vendors.",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_WRITE,
      PERMISSIONS.ITEMS_READ,
      PERMISSIONS.BUDGETS_READ,
      PERMISSIONS.REQUISITIONS_READ,
      PERMISSIONS.APPROVALS_READ,
      PERMISSIONS.RFQ_READ,
      PERMISSIONS.RFQ_WRITE,
      PERMISSIONS.PO_READ,
      PERMISSIONS.PO_WRITE,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.ADVANCES_READ,
      PERMISSIONS.RECEIPTS_READ,
    ],
  },
  {
    code: ROLE_STORES,
    name: "Stores Incharge",
    description: "Records receipts against purchase orders and manages stock.",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.ITEMS_READ,
      PERMISSIONS.ITEMS_WRITE,
      PERMISSIONS.PO_READ,
      PERMISSIONS.RECEIPTS_READ,
      PERMISSIONS.RECEIPTS_WRITE,
    ],
  },
  {
    code: ROLE_AP,
    name: "AP Accountant",
    description: "Validates invoices and prepares payment proposals.",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.BUDGETS_READ,
      PERMISSIONS.PO_READ,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.INVOICES_WRITE,
      PERMISSIONS.CAPTURES_READ,
      PERMISSIONS.CAPTURES_WRITE,
      PERMISSIONS.ADVANCES_READ,
      PERMISSIONS.ADVANCES_WRITE,
      PERMISSIONS.PAYMENTS_READ,
      PERMISSIONS.PAYMENTS_WRITE,
      PERMISSIONS.RECEIPTS_READ,
      PERMISSIONS.ZOHO_MANAGE,
    ],
  },
  {
    code: ROLE_FINANCE,
    name: "Finance Controller",
    description: "Approves budgets, payments, and finance reports.",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.BUDGETS_READ,
      PERMISSIONS.BUDGETS_WRITE,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.PO_READ,
      PERMISSIONS.APPROVALS_READ,
      PERMISSIONS.APPROVALS_WRITE,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.INVOICES_WRITE,
      PERMISSIONS.CAPTURES_READ,
      PERMISSIONS.ADVANCES_READ,
      PERMISSIONS.ADVANCES_WRITE,
      PERMISSIONS.PAYMENTS_READ,
      PERMISSIONS.PAYMENTS_WRITE,
      PERMISSIONS.RECEIPTS_READ,
    ],
  },
  {
    code: ROLE_AUDITOR,
    name: "Auditor",
    description: "Read-only access to records and audit trail.",
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.ITEMS_READ,
      PERMISSIONS.BUDGETS_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.REQUISITIONS_READ,
      PERMISSIONS.APPROVALS_READ,
      PERMISSIONS.RFQ_READ,
      PERMISSIONS.PO_READ,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.CAPTURES_READ,
      PERMISSIONS.RECEIPTS_READ,
    ],
  },
];

export function hasPermission(
  permissions: string[],
  action: string,
): boolean {
  return permissions.includes("*") || permissions.includes(action);
}

export function can(userRole: { permissions: string }, action: string): boolean {
  let perms: string[] = [];
  try {
    perms = JSON.parse(userRole.permissions);
  } catch {
    perms = [];
  }
  return hasPermission(perms, action);
}
