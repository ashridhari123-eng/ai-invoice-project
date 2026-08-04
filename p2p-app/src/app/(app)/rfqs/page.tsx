import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS, can } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  StatusBadge,
  EmptyState,
  Button,
} from "@/components/ui";

export default async function RfqsPage() {
  const user = await requirePermission(PERMISSIONS.RFQ_READ);
  const canWrite = can(user.role, PERMISSIONS.RFQ_WRITE);

  const rfqs = await db.rfq.findMany({
    where: { orgId: user.orgId },
    include: {
      requisition: { select: { code: true } },
      quotes: { select: { id: true, status: true } },
      awards: {
        include: { vendor: { select: { legalName: true } } },
        orderBy: { awardedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Requests for Quote"
        subtitle="Invite vendors, compare landed costs, and award with an audited decision."
        actions={
          canWrite ? (
            <Link href="/rfqs/new">
              <Button>+ New RFQ</Button>
            </Link>
          ) : null
        }
      />

      <Card>
        {rfqs.length === 0 ? (
          <EmptyState message="No RFQs yet. Create one from an approved requisition." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Source</Th>
                <Th>Department</Th>
                <Th className="text-right">Vendors</Th>
                <Th>Status</Th>
                <Th>Awarded to</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {rfqs.map((r) => (
                <tr key={r.id} className="hover:bg-paper/40">
                  <Td>
                    <Link
                      href={`/rfqs/${r.id}`}
                      className="font-mono text-xs font-semibold text-pink hover:underline"
                    >
                      {r.code}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs text-ink">{r.requisition.code}</Td>
                  <Td className="text-xs text-ink">{r.department}</Td>
                  <Td className="text-right text-xs text-ink-soft">
                    {r.quotes.filter((q) => q.status === "SUBMITTED").length}/
                    {r.quotes.length} quoted
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-xs text-ink">
                    {r.awards[0]?.vendor.legalName ?? "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {formatDate(r.createdAt)}
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
