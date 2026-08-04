import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import LoginForm from "@/components/LoginForm";
import DemoLoginButtons from "@/components/DemoLoginButtons";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-full">
      <div className="hidden w-1/2 flex-col justify-between bg-ink p-10 lg:flex">
        <Logo inverse />
        <div>
          <h2 className="font-display text-3xl font-bold leading-tight text-white">
            One pipeline from requisition
            <br />
            to payment.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
            Vendors, items, budgets, requisitions, RFQs, purchase orders,
            invoices, and payments — tracked end to end with a full audit
            trail.
          </p>
        </div>
        <p className="text-xs text-white/40">
          Meridian Trading Pvt Ltd · Phase 0 build
        </p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Welcome back
          </h1>
          <p className="mb-8 mt-1 text-sm text-ink-soft">
            Sign in to continue to your workspace.
          </p>

          <LoginForm />

          <DemoLoginButtons />
        </div>
      </div>
    </div>
  );
}
