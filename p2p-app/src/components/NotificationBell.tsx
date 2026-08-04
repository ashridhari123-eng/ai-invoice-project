"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatDateTime } from "@/lib/format";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  docType: string | null;
  docId: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setUnread(data.unreadCount ?? 0);
        setItems(data.notifications ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const res = await fetch("/api/notifications");
    const data = await res.json().catch(() => ({}));
    setUnread(data.unreadCount ?? 0);
    setItems(data.notifications ?? []);
    if (data.unreadCount > 0) {
      for (const n of data.notifications as NotificationItem[]) {
        if (!n.readAt) {
          fetch(`/api/notifications/${n.id}`, { method: "PATCH" }).catch(() => {});
        }
      }
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-ink transition-colors hover:border-ink-soft"
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M10 2a6 6 0 0 0-6 6c0 3.5-1 4.5-1 4.5h14S17 11.5 17 8a6 6 0 0 0-6-6Zm-2.5 13a2.5 2.5 0 0 0 5 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-pink px-1 font-mono text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            <div className="border-b border-line px-4 py-3">
              <p className="font-display text-sm font-semibold text-ink">
                Notifications
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-soft">
                  You&apos;re all caught up.
                </p>
              ) : (
                items.map((n) => {
                  const inner = (
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          n.readAt ? "bg-paper" : "bg-pink"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{n.title}</p>
                        {n.message ? (
                          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                            {n.message}
                          </p>
                        ) : null}
                        <p className="mt-1 font-mono text-[10px] text-ink-soft">
                          {formatDateTime(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                  return n.docType === "PR" && n.docId ? (
                    <Link
                      key={n.id}
                      href={`/requisitions/${n.docId}`}
                      onClick={() => setOpen(false)}
                      className="block border-b border-line px-4 py-3 hover:bg-paper/60"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id} className="border-b border-line px-4 py-3">
                      {inner}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
