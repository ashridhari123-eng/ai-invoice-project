import { requireUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        roleName: user.role.name,
        roleCode: user.role.code,
      }}
    >
      {children}
    </AppShell>
  );
}
