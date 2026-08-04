"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_ACCOUNTS } from "@/lib/demo";

export default function DemoLoginButtons() {
  const router = useRouter();
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(email: string) {
    setError(null);
    setLoadingEmail(email);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingEmail(null);
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-line bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Demo accounts
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        One-click sign-in — no password needed.
      </p>
      <ul className="mt-3 space-y-2">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() => handleLogin(a.email)}
              disabled={loadingEmail !== null}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-xs transition-colors hover:border-pink hover:bg-pink/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="font-mono text-ink">{a.email}</span>
              <span className="flex items-center gap-1.5 font-medium text-ink">
                {loadingEmail === a.email ? "Signing in…" : a.role}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
