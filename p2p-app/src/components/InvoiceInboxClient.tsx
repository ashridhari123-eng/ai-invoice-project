"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  Field,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { formatINR, formatDateTime } from "@/lib/format";

export interface CaptureRow {
  id: string;
  status: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  confidence: number | null;
  route: string | null;
  error: string | null;
  extractedJson: string | null;
  validationJson: string | null;
  invoice: { id: string; code: string } | null;
  createdBy: { name: string } | null;
  createdAt: string;
}

interface PoRow {
  id: string;
  code: string;
  vendor: { legalName: string };
}

interface ExtractedInvoice {
  vendor_name: string;
  vendor_gstin: string | null;
  invoice_number: string;
  invoice_date: string;
  po_number: string | null;
  currency: string;
  lines: Array<{ description: string }>;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grand_total: number;
  confidence: number;
  notes: string;
}

interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

const ROUTE_TONE: Record<string, "teal" | "amber" | "red" | "gray"> = {
  AUTO_MATCH: "teal",
  REVIEW: "amber",
  MANUAL: "red",
};

const today = () => new Date().toISOString().slice(0, 10);

export default function InvoiceInboxClient({
  captures,
  purchaseOrders,
  canWrite,
}: {
  captures: CaptureRow[];
  purchaseOrders: PoRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({
    poId: "",
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: "",
    notes: "",
    tdsSection: "",
    tdsRate: "",
  });

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/captures", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      setFile(null);
      router.refresh();
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function extract(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/captures/${id}/extract`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Extraction failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function openConvert(capture: CaptureRow) {
    let extracted: ExtractedInvoice | null = null;
    try {
      extracted = capture.extractedJson
        ? (JSON.parse(capture.extractedJson) as ExtractedInvoice)
        : null;
    } catch {
      extracted = null;
    }
    setConvertForm({
      poId: "",
      invoiceNumber: extracted?.invoice_number ?? "",
      invoiceDate: extracted?.invoice_date ?? today(),
      dueDate: "",
      notes: "",
      tdsSection: "",
      tdsRate: "",
    });
    setConvertingId(capture.id);
    setError(null);
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!convertingId) return;
    setBusyId(convertingId);
    setError(null);
    try {
      const res = await fetch(`/api/captures/${convertingId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: convertForm.poId,
          invoiceNumber: convertForm.invoiceNumber || null,
          invoiceDate: convertForm.invoiceDate || null,
          dueDate: convertForm.dueDate || null,
          notes: convertForm.notes || null,
          tdsSection: convertForm.tdsSection || null,
          tdsRate: convertForm.tdsRate === "" ? null : Number(convertForm.tdsRate),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Conversion failed");
        return;
      }
      setConvertingId(null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/captures/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not reject");
        return;
      }
      setRejectingId(null);
      setRejectReason("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const converting = captures.find((c) => c.id === convertingId);

  return (
    <div className="p-5">
      {canWrite ? (
        <form onSubmit={handleUpload} className="mb-6 rounded-lg border border-line bg-paper/40 p-5">
          <h3 className="font-display text-base font-semibold text-ink">
            Upload vendor invoice
          </h3>
          <p className="mt-0.5 text-sm text-ink-soft">
            PDF, PNG, JPG or WebP — up to 10 MB. Extraction runs automatically.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="max-w-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="submit" disabled={!file || uploading}>
              {uploading ? "Uploading…" : "Upload to inbox"}
            </Button>
          </div>
          {uploadError ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {uploadError}
            </p>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {converting && convertingId ? (
        <form
          onSubmit={handleConvert}
          className="mb-6 rounded-lg border border-pink/30 bg-pink/5 p-5"
        >
          <h3 className="font-display text-base font-semibold text-ink">
            Convert “{converting.originalName}” to an invoice
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Purchase order" hint="Sent POs only">
              <Select
                required
                value={convertForm.poId}
                onChange={(e) =>
                  setConvertForm((f) => ({ ...f, poId: e.target.value }))
                }
              >
                <option value="">Select PO</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.code} · {po.vendor.legalName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vendor invoice number">
              <Input
                required
                value={convertForm.invoiceNumber}
                onChange={(e) =>
                  setConvertForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                }
                placeholder="INV-001"
              />
            </Field>
            <Field label="Invoice date">
              <Input
                type="date"
                required
                value={convertForm.invoiceDate}
                onChange={(e) =>
                  setConvertForm((f) => ({ ...f, invoiceDate: e.target.value }))
                }
              />
            </Field>
            <Field label="Due date (optional)">
              <Input
                type="date"
                value={convertForm.dueDate}
                onChange={(e) =>
                  setConvertForm((f) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </Field>
            <Field label="TDS section (optional)">
              <Input
                value={convertForm.tdsSection}
                onChange={(e) =>
                  setConvertForm((f) => ({ ...f, tdsSection: e.target.value }))
                }
                placeholder="194C"
              />
            </Field>
            <Field label="TDS rate % (optional)">
              <Input
                type="number"
                min={0}
                max={30}
                step="0.5"
                value={convertForm.tdsRate}
                onChange={(e) =>
                  setConvertForm((f) => ({ ...f, tdsRate: e.target.value }))
                }
              />
            </Field>
            <div className="sm:col-span-3">
              <Field label="Notes (optional)">
                <Input
                  value={convertForm.notes}
                  onChange={(e) =>
                    setConvertForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </Field>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Button type="submit" disabled={busyId !== null}>
              {busyId === convertingId ? "Converting…" : "Convert to invoice"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConvertingId(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {captures.length === 0 ? (
        <EmptyState message="Nothing in the inbox yet. Upload a vendor invoice above." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Document</Th>
              <Th>Status</Th>
              <Th>Route</Th>
              <Th>Extraction</Th>
              <Th>Uploaded</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {captures.map((capture) => {
              const extracted = parseExtracted(capture.extractedJson);
              const issues = parseIssues(capture.validationJson);
              return (
                <tr key={capture.id} className="align-top hover:bg-paper/40">
                  <Td>
                    <p className="text-xs font-medium text-ink">
                      {capture.originalName}
                    </p>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {(capture.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                      {capture.mimeType}
                    </p>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[capture.status]}>
                      {capture.status.replace("_", " ")}
                    </Badge>
                    {capture.error ? (
                      <p className="mt-1 max-w-[220px] text-[10px] text-red-700">
                        {capture.error}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    {capture.route ? (
                      <Badge tone={ROUTE_TONE[capture.route] ?? "gray"}>
                        {capture.route.replace("_", " ")}
                      </Badge>
                    ) : (
                      <span className="text-xs text-ink-soft">—</span>
                    )}
                  </Td>
                  <Td>
                    {extracted ? (
                      <div className="space-y-0.5 text-xs text-ink">
                        <p className="font-medium text-ink">{extracted.vendor_name}</p>
                        <p className="font-mono text-[10px] text-ink-soft">
                          {extracted.invoice_number}
                          {extracted.invoice_date ? ` · ${extracted.invoice_date}` : ""}
                        </p>
                        <p className="font-mono text-sm font-medium text-ink">
                          {formatINR(extracted.grand_total)}
                        </p>
                        <p className="font-mono text-[10px] text-ink-soft">
                          {extracted.lines.length} line
                          {extracted.lines.length === 1 ? "" : "s"}
                          {extracted.confidence != null
                            ? ` · ${Math.round(extracted.confidence * 100)}%`
                            : ""}
                        </p>
                        {issues.length > 0 ? (
                          <ul className="mt-1 space-y-0.5">
                            {issues.map((issue, index) => (
                              <li
                                key={index}
                                className={`text-[10px] ${
                                  issue.severity === "error"
                                    ? "text-red-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {issue.severity === "error" ? "✕" : "!"} {issue.message}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {extracted.notes && extracted.notes.startsWith("Mock") ? (
                          <p className="mt-1 text-[10px] text-amber-700">
                            {extracted.notes}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-soft">Not extracted</span>
                    )}
                  </Td>
                  <Td>
                    <p className="whitespace-nowrap text-xs text-ink-soft" suppressHydrationWarning>
                      {formatDateTime(capture.createdAt)}
                    </p>
                    {capture.createdBy ? (
                      <p className="text-[10px] text-ink-soft">
                        by {capture.createdBy.name}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <div className="space-y-1.5">
                      {capture.status === "CONVERTED" && capture.invoice ? (
                        <Link
                          href={`/invoices/${capture.invoice.id}`}
                          className="inline-block rounded-md border border-teal/30 bg-teal/10 px-2.5 py-1 text-xs font-medium text-teal hover:bg-teal/20"
                        >
                          View {capture.invoice.code}
                        </Link>
                      ) : canWrite ? (
                        <>
                          {["EXTRACTED", "VERIFIED"].includes(capture.status) ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="px-2.5 py-1 text-xs"
                              disabled={busyId !== null}
                              onClick={() => openConvert(capture)}
                            >
                              Convert to invoice
                            </Button>
                          ) : null}
                          {["CAPTURED", "ERROR"].includes(capture.status) ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="px-2.5 py-1 text-xs"
                              disabled={busyId !== null}
                              onClick={() => extract(capture.id)}
                            >
                              {busyId === capture.id ? "Extracting…" : "Run extraction"}
                            </Button>
                          ) : null}
                          {rejectingId === capture.id ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                className="h-8 px-2 text-xs"
                                placeholder="Reason (optional)"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                              />
                              <Button
                                type="button"
                                variant="danger"
                                className="px-2 py-1 text-xs"
                                disabled={busyId !== null}
                                onClick={() => reject(capture.id)}
                              >
                                {busyId === capture.id ? "…" : "Confirm"}
                              </Button>
                            </div>
                          ) : capture.status === "REJECTED" ? (
                            <span className="text-xs text-ink-soft">
                              {capture.error || "Rejected"}
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              className="px-2.5 py-1 text-xs"
                              disabled={busyId !== null}
                              onClick={() => {
                                setRejectReason(capture.error ?? "");
                                setRejectingId(capture.id);
                              }}
                            >
                              Reject
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-ink-soft">—</span>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, "teal" | "amber" | "blue" | "red" | "ink" | "gray"> = {
  CAPTURED: "ink",
  EXTRACTED: "blue",
  VERIFIED: "teal",
  CONVERTED: "teal",
  REJECTED: "red",
  ERROR: "red",
};

function parseExtracted(json: string | null): ExtractedInvoice | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ExtractedInvoice;
  } catch {
    return null;
  }
}

function parseIssues(json: string | null): ValidationIssue[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { issues?: ValidationIssue[] };
    return Array.isArray(parsed.issues) ? parsed.issues : [];
  } catch {
    return [];
  }
}
