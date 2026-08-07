"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { cn } from "@/components/ui";
import NotificationBell from "@/components/NotificationBell";

export interface ShellUser {
  name: string;
  email: string;
  roleName: string;
  roleCode: string;
}

interface NavItem {
  label: string;
  href: string;
  soon?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard" }],
  },
  {
    group: "Procure",
    items: [
      { label: "Budgets", href: "/budgets" },
      { label: "Purchase Requests", href: "/requisitions" },
      { label: "Approvals", href: "/approvals" },
      { label: "RFQs", href: "/rfqs" },
      { label: "Purchase Orders", href: "/purchase-orders" },
      { label: "Goods Receipts", href: "/receipts" },
    ],
  },
  {
    group: "Pay",
    items: [
      { label: "Advances", href: "/advances" },
      { label: "Invoice Inbox", href: "/invoice-inbox" },
      { label: "Invoices", href: "/invoices" },
      { label: "Reconciliation", href: "/invoices/reconciliation" },
      { label: "Payments", href: "/payments" },
    ],
  },
  {
    group: "Manage",
    items: [
      { label: "Vendors", href: "/vendors" },
      { label: "Items", href: "/items" },
      { label: "Audit Log", href: "/audit" },
    ],
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NavRow({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = !item.soon && pathname === item.href;

  const inner = (
    <>
      <span className="flex-1">{item.label}</span>
      {item.soon ? (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/50">
          soon
        </span>
      ) : null}
    </>
  );

  const classes = cn(
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
    item.soon
      ? "cursor-not-allowed text-white/30"
      : active
        ? "bg-white/10 font-semibold text-white"
        : "text-white/70 hover:bg-white/5 hover:text-white",
  );

  return item.soon ? (
    <div className={classes}>{inner}</div>
  ) : (
    <Link href={item.href} className={classes}>
      {inner}
    </Link>
  );
}

export default function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <div className="min-h-full">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-line bg-nav">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Logo inverse />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.group} className="mb-5">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                {group.group}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.label} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
            Procure to Pay
          </p>
          <p className="mt-1 font-mono text-[11px] text-white/50">
            Requisitions · RFQ · PO · Receipts · Invoices · Payments
          </p>
        </div>
      </aside>

      <div className="ml-60 flex min-h-full flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-line bg-paper/80 px-8 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">Organization</span>
            <span className="flex items-center gap-1 font-semibold text-ink">
              Meridian Trading Pvt Ltd
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="M5 8l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-teal text-xs font-bold text-white">
                {initials(user.name)}
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-ink">{user.name}</p>
                <p className="text-[11px] text-ink-soft">{user.roleName}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink-soft"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
