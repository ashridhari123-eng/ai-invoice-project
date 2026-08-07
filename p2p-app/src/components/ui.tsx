import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-card shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger" | "outline";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-pink text-white hover:bg-pink/90 disabled:bg-pink/40 disabled:cursor-not-allowed",
  outline:
    "border border-line bg-card text-ink hover:border-ink-soft disabled:cursor-not-allowed",
  ghost:
    "bg-nav text-white hover:bg-pink hover:opacity-90 disabled:cursor-not-allowed",
  danger:
    "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-900 disabled:cursor-not-allowed",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
        BUTTON_STYLES[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60",
        "focus:border-pink focus:outline-none focus:ring-2 focus:ring-pink/20",
      )}
      {...props}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink",
        "focus:border-pink focus:outline-none focus:ring-2 focus:ring-pink/20",
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-red-400">{error}</span> : null}
    </label>
  );
}

type BadgeTone = "teal" | "amber" | "red" | "gray" | "ink" | "blue";

const BADGE_STYLES: Record<BadgeTone, string> = {
  teal: "bg-teal/10 text-teal",
  amber: "bg-amber/10 text-amber",
  red: "bg-red-950/70 text-red-400",
  gray: "bg-ink/10 text-ink-soft",
  ink: "bg-nav text-white",
  blue: "bg-blue-950/70 text-blue-300",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        BADGE_STYLES[tone],
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  ACTIVE: "teal",
  APPROVED: "teal",
  PAID: "teal",
  COMPLETED: "teal",
  MATCHED: "teal",
  AWARDED: "teal",
  CONVERTED: "teal",
  RECORDED: "blue",
  PARTIALLY_APPLIED: "amber",
  APPLIED: "teal",
  REVERSED: "red",
  PENDING: "amber",
  PENDING_APPROVAL: "amber",
  EVALUATING: "amber",
  PARTIALLY_RECEIVED: "amber",
  RETURNED: "amber",
  DRAFT: "gray",
  SUBMITTED: "blue",
  OPEN: "blue",
  RECEIVED: "blue",
  BOOKED: "ink",
  CAPTURED: "ink",
  EXTRACTED: "blue",
  VERIFIED: "teal",
  BLOCKED: "red",
  CANCELLED: "red",
  REJECTED: "red",
  ERROR: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{status.replace("_", " ")}</Badge>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-line bg-paper/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("border-b border-line px-4 py-2.5 align-middle", className)}>{children}</td>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-5 py-12 text-center text-sm text-ink-soft">{message}</div>
  );
}
