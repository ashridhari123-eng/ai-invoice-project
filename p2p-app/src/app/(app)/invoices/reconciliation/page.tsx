import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can, PERMISSIONS } from "@/lib/roles";
import { formatINR, formatDateTime } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardHeader,
  Table,
  Th,
  Td,
  StatusBadge,
  EmptyState,
} from "@/components/ui";
import ZohoConnectPanel from "@/components/ZohoConnectPanel";
import ZohoMappingsManager from "@/components/ZohoMappingsManager";
import ZohoSyncPanel from "@/components/ZohoSyncPanel";
import { INV_APPROVED, INV_BOOKED, SYNC_SUCCESS } from "@/lib/invoices";

export default async function ReconciliationPage() {
  const user = await requirePermission(PERMISSIONS.INVOICES_READ);

  const [approvedNotBooked, bookedNotPaid, config] = await Promise.all([
    db.invoice.findMany({
      where: {
        orgId: user.orgId,
        status: INV_APPROVED,
        syncStatus: { not: SYNC_SUCCESS },
      },
      include: { vendor: { select: { legalName: true } } },
      orderBy: { decidedAt: "desc" },
      take: 50,
    }),
    db.invoice.findMany({
      where: { orgId: user.orgId, status: INV_BOOKED, paidAt: null },
      include: { vendor: { select: { legalName: true } } },
      orderBy: { bookedAt: "desc" },
      take: 50,
    }),
    db.zohoConfig.findUnique({ where: { orgId: user.orgId } }),
  ]);

  const connected = Boolean(config?.isActive);
  const canManage = can(user.role, PERMISSIONS.ZOHO_MANAGE);

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        subtitle="Approved invoices vs Zoho Books. Exceptions surface here every morning."
      />

      <Suspense fallback={<div className="mb-4 h-24 rounded-lg border border-line bg-card" />}>
        <ZohoConnectPanel
          connected={connected}
          organizationId={config?.organizationId ?? null}
          region={config?.region ?? null}
          connectedAt={config?.connectedAt?.toISOString() ?? null}
          lastSyncAt={config?.lastSyncAt?.toISOString() ?? null}
          canManage={canManage}
        />
      </Suspense>

      {canManage ? (
        <div className="mt-4">
          <ZohoSyncPanel connected={connected} canManage={canManage} />
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-4">
          <ZohoMappingsManager connected={connected} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Approved but not booked in Zoho"
            subtitle="Approved invoices with no Zoho bill_id — stuck pushes"
          />
          {approvedNotBooked.length === 0 ? (
            <EmptyState message="Nothing pending. All approved invoices are booked." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Vendor</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {approvedNotBooked.map((inv) => (
                  <tr key={inv.id} className="hover:bg-paper/40">
                    <Td>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono text-xs font-semibold text-pink hover:underline"
                      >
                        {inv.code}
                      </Link>
                      <p className="font-mono text-[10px] text-ink-soft">{inv.invoiceNumber}</p>
                    </Td>
                    <Td className="text-xs text-ink">{inv.vendor.legalName}</Td>
                    <Td className="text-right font-mono text-sm text-ink">{formatINR(inv.totalAmount)}</Td>
                    <Td>
                      <StatusBadge status={inv.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Booked but not paid"
            subtitle="Bills in Zoho awaiting payment"
          />
          {bookedNotPaid.length === 0 ? (
            <EmptyState message="Nothing due. Every booked bill has been paid." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Vendor</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Booked</Th>
                </tr>
              </thead>
              <tbody>
                {bookedNotPaid.map((inv) => (
                  <tr key={inv.id} className="hover:bg-paper/40">
                    <Td>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono text-xs font-semibold text-pink hover:underline"
                      >
                        {inv.code}
                      </Link>
                      <p className="font-mono text-[10px] text-ink-soft">{inv.invoiceNumber}</p>
                    </Td>
                    <Td className="text-xs text-ink">{inv.vendor.legalName}</Td>
                    <Td className="text-right font-mono text-sm text-ink">{formatINR(inv.totalAmount)}</Td>
                    <Td className="whitespace-nowrap text-xs text-ink-soft">
                      {inv.bookedAt ? formatDateTime(inv.bookedAt) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
