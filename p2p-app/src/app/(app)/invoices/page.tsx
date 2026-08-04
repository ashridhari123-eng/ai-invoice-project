import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatINR, formatDateTime } from "@/lib/format";
import { syncLabel } from "@/lib/zoho-sync";
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  StatusBadge,
  Badge,
  EmptyState,
  Button,
} from "@/components/ui";

export default async function InvoicesPage() {
  const user = await requirePermission(PERMISSIONS.INVOICES_READ);
  const canWrite = can(user.role, PERMISSIONS.INVOICES_WRITE);

  const invoices = await db.invoice.findMany({
    where: { orgId: user.orgId },
    include: {
      vendor: { select: { legalName: true } },
      purchaseOrder: { select: { code: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Vendor bills against purchase orders — matched, approved, and booked in Zoho Books."
        actions={
          canWrite ? (
            <Link href="/invoices/new">
              <Button>+ Record vendor invoice</Button>
            </Link>
          ) : null
        }
      />

      <Card>
        {invoices.length === 0 ? (
          <EmptyState message="No invoices yet. Record a vendor bill against a sent purchase order to start." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Vendor</Th>
                <Th>Invoice #</Th>
                <Th>PO</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Zoho</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-paper/40">
                  <Td>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-mono text-xs font-semibold text-pink hover:underline"
                    >
                      {inv.code}
                    </Link>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {inv._count.lines} line{inv._count.lines === 1 ? "" : "s"}
                    </p>
                  </Td>
                  <Td>
                    <p className="text-xs font-medium text-ink">{inv.vendor.legalName}</p>
                  </Td>
                  <Td className="font-mono text-xs text-ink">{inv.invoiceNumber}</Td>
                  <Td className="font-mono text-xs text-ink-soft">
                    {inv.purchaseOrder?.code ?? "—"}
                  </Td>
                  <Td className="text-right font-mono text-sm font-medium text-ink">
                    {formatINR(inv.totalAmount)}
                  </Td>
                  <Td>
                    <StatusBadge status={inv.status} />
                  </Td>
                  <Td>
                    <Badge tone={inv.syncStatus === "SUCCESS" ? "teal" : inv.syncStatus === "FAILED" ? "red" : inv.syncStatus === "PENDING" ? "amber" : "gray"}>
                      {syncLabel(inv.syncStatus)}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {formatDateTime(inv.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
