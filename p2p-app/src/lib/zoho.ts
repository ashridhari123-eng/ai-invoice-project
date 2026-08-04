import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const ZOHO_SCOPES = [
  "ZohoBooks.contacts.ALL",
  "ZohoBooks.bills.ALL",
  "ZohoBooks.settings.ALL",
].join(",");

export interface ZohoRegion {
  accountsHost: string;
  apiHost: string;
  label: string;
}

export const ZOHO_REGIONS: Record<string, ZohoRegion> = {
  IN: {
    accountsHost: "https://accounts.zoho.in",
    apiHost: "https://www.zohoapis.in/books/v3",
    label: "India (.in)",
  },
  COM: {
    accountsHost: "https://accounts.zoho.com",
    apiHost: "https://www.zohoapis.com/books/v3",
    label: "Global (.com)",
  },
  EU: {
    accountsHost: "https://accounts.zoho.eu",
    apiHost: "https://www.zohoapis.eu/books/v3",
    label: "Europe (.eu)",
  },
};

function regionFor(config: { region: string }): ZohoRegion {
  return ZOHO_REGIONS[config.region] ?? ZOHO_REGIONS.IN;
}

function encryptionKey(): Buffer {
  const secret = process.env.ZOHO_ENCRYPTION_KEY;
  if (!secret) throw new Error("ZOHO_ENCRYPTION_KEY is not set in .env");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(value: string): string {
  const key = encryptionKey();
  const raw = Buffer.from(value, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function zohoClientConfig(): {
  region: string;
  clientId: string;
  clientSecretEnc: string;
} {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const secret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error(
      "ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET are not set in .env",
    );
  }
  return {
    region: process.env.ZOHO_REGION ?? "IN",
    clientId,
    clientSecretEnc: encryptSecret(secret),
  };
}

export function buildRedirectUri(): string {
  return (
    process.env.ZOHO_REDIRECT_URI ?? "http://localhost:3000/api/zoho/callback"
  );
}

export async function fetchDefaultOrganization(
  accessToken: string,
  region: string,
): Promise<{ organizationId: string; orgName: string }> {
  const res = await fetch(`${regionFor({ region }).apiHost}/organizations`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { message?: string })?.message ?? `Zoho API error (${res.status})`;
    throw new Error(`Failed to read Zoho organization: ${message}`);
  }
  const orgs = (data as { organizations?: Array<{ organization_id: string; name: string; is_default_org?: boolean }> })
    ?.organizations;
  const defaultOrg = orgs?.find((o) => o.is_default_org) ?? orgs?.[0];
  if (!defaultOrg) {
    throw new Error("No Zoho Books organization found for this account");
  }
  return {
    organizationId: defaultOrg.organization_id,
    orgName: defaultOrg.name,
  };
}

export function buildConsentUrl(
  config: { region: string; clientId: string },
  redirectUri: string,
): string {
  const region = regionFor(config);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: ZOHO_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `${region.accountsHost}/oauth/v2/auth?${params.toString()}`;
}

export async function exchangeCode(
  config: { region: string; clientId: string; clientSecretEnc: string },
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const region = regionFor(config);
  const params = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: decryptSecret(config.clientSecretEnc),
    grant_type: "authorization_code",
  });
  const res = await fetch(`${region.accountsHost}/oauth/v2/token`, {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(
      `Zoho OAuth failed (${res.status}): ${data.error_description ?? data.error ?? "unknown error"}`,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(
  config: { region: string; clientId: string; clientSecretEnc: string; refreshTokenEnc: string },
): Promise<{ accessToken: string; expiresIn: number }> {
  const region = regionFor(config);
  const params = new URLSearchParams({
    refresh_token: decryptSecret(config.refreshTokenEnc),
    client_id: config.clientId,
    client_secret: decryptSecret(config.clientSecretEnc),
    grant_type: "refresh_token",
  });
  const res = await fetch(`${region.accountsHost}/oauth/v2/token`, {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Zoho token refresh failed (${res.status}): ${data.error_description ?? data.error ?? "unknown error"}`,
    );
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

export async function ensureAccessToken(orgId: string): Promise<string> {
  const config = await db.zohoConfig.findUnique({ where: { orgId } });
  if (!config || !config.isActive || !config.organizationId) {
    throw new Error("Zoho Books is not connected for this organization");
  }

  const now = Date.now();
  const expiresAt = config.accessTokenExpiresAt?.getTime() ?? 0;
  if (config.accessToken && expiresAt > now + 60_000) return config.accessToken;

  const fresh = await refreshAccessToken(config);
  await db.zohoConfig.update({
    where: { id: config.id },
    data: {
      accessToken: fresh.accessToken,
      accessTokenExpiresAt: new Date(now + fresh.expiresIn * 1000),
      lastSyncAt: new Date(),
    },
  });
  return fresh.accessToken;
}

export async function zohoFetch<T>(
  orgId: string,
  path: string,
  init: Omit<RequestInit, "body"> & { method?: string; body?: unknown } = {},
): Promise<T> {
  const config = await db.zohoConfig.findUnique({ where: { orgId } });
  if (!config) throw new Error("Zoho Books is not connected for this organization");

  const token = await ensureAccessToken(orgId);
  const region = regionFor(config);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Zoho-oauthtoken ${token}`);
  headers.set("Accept", "application/json");
  let body: BodyInit | undefined;
  if (init.body !== undefined && init.body !== null) {
    headers.set("Content-Type", "application/json");
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }

  const res = await fetch(`${region.apiHost}${path}`, {
    ...init,
    headers,
    body,
  });
  const data: unknown = await res.json().catch(() => ({}));

  if (res.status === 401) {
    const fresh = await ensureAccessToken(orgId);
    headers.set("Authorization", `Zoho-oauthtoken ${fresh}`);
    const retry = await fetch(`${region.apiHost}${path}`, { ...init, headers, body });
    const retryData: unknown = await retry.json().catch(() => ({}));
    if (!retry.ok) throw new Error(`Zoho API error (${retry.status})`);
    return retryData as T;
  }

  if (!res.ok) {
    const msg = Array.isArray((data as { message?: unknown })?.message)
      ? (data as { message: string[] }).message.join("; ")
      : ((data as { message?: string })?.message ?? `Zoho API error (${res.status})`);
    throw new Error(msg);
  }

  return data as T;
}

export async function zohoOrganizationId(orgId: string): Promise<string> {
  const config = await db.zohoConfig.findUnique({ where: { orgId } });
  if (!config?.organizationId) throw new Error("Zoho organization_id is not configured");
  return config.organizationId;
}

export interface ZohoContactInput {
  contactName: string;
  companyName?: string;
  gstin?: string;
  paymentTermsDays?: number;
}

export async function pushVendorToZoho(orgId: string, vendor: ZohoContactInput) {
  const organizationId = await zohoOrganizationId(orgId);
  const payload = {
    contact_name: vendor.contactName,
    contact_type: "vendor",
    company_name: vendor.companyName ?? vendor.contactName,
    gst_no: vendor.gstin ?? "",
    gst_treatment: vendor.gstin ? "business_gst" : "business_none",
    payment_terms: vendor.paymentTermsDays ?? 30,
  };
  const data = await zohoFetch<{ contact: { contact_id: string } }>(
    orgId,
    `/contacts?organization_id=${organizationId}`,
    { method: "POST", body: payload },
  );
  return data.contact.contact_id;
}

export interface ZohoBillInput {
  vendorId: string;
  billNumber: string;
  date: string;
  dueDate: string | null;
  referenceNumber: string;
  lineItems: Array<{
    name: string;
    quantity: number;
    rate: number;
    hsnOrSac: string;
    taxId: string;
    accountId: string;
  }>;
  isTdsApplicable: boolean;
}

export async function pushBillToZoho(orgId: string, bill: ZohoBillInput) {
  const organizationId = await zohoOrganizationId(orgId);
  const payload = {
    vendor_id: bill.vendorId,
    bill_number: bill.billNumber,
    date: bill.date,
    due_date: bill.dueDate ?? bill.date,
    reference_number: bill.referenceNumber,
    line_items: bill.lineItems.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      rate: l.rate,
      hsn_or_sac: l.hsnOrSac,
      tax_id: l.taxId,
      account_id: l.accountId,
    })),
    is_tds_applicable: bill.isTdsApplicable,
  };
  const data = await zohoFetch<{ bill: { bill_id: string; bill_number: string } }>(
    orgId,
    `/bills?organization_id=${organizationId}`,
    { method: "POST", body: payload },
  );
  return { billId: data.bill.bill_id, billNumber: data.bill.bill_number };
}
