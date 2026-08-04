import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";

const ACTION_TONES: Record<string, "teal" | "amber" | "red" | "blue" | "gray"> = {
  CREATE: "teal",
  UPDATE: "blue",
  STATUS_CHANGE: "amber",
  DELETE: "red",
  LOGIN: "gray",
  LOGOUT: "gray",
};

export default async function AuditPage() {
  const user = await requirePermission(PERMISSIONS.AUDIT_READ);

  const logs = await db.auditLog.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Immutable trail of every create, update, and delete."
      />

      <Card>
        {logs.length === 0 ? (
          <EmptyState message="No audit entries yet." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Record</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-paper/40">
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {formatDateTime(log.createdAt)}
                  </Td>
                  <Td>
                    <p className="text-xs font-medium text-ink">
                      {log.actorEmail ?? "system"}
                    </p>
                    {log.actorId ? (
                      <p className="font-mono text-[10px] text-ink-soft">
                        {log.actorId}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={ACTION_TONES[log.action] ?? "gray"}>
                      {log.action.replace("_", " ")}
                    </Badge>
                  </Td>
                  <Td className="text-xs font-medium text-ink">
                    {log.entity.replace("_", " ")}
                  </Td>
                  <Td className="max-w-[16rem]">
                    <p className="truncate font-mono text-[11px] text-ink-soft" title={log.entityId ?? ""}>
                      {log.entityId ?? "—"}
                    </p>
                  </Td>
                  <Td className="font-mono text-[11px] text-ink-soft">
                    {log.ip ?? "—"}
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
