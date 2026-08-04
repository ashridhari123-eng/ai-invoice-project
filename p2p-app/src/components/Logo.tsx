export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-pink font-display text-base font-extrabold text-white">
        M
      </div>
      <div className="leading-tight">
        <div
          className={`font-display text-[15px] font-bold tracking-tight ${
            inverse ? "text-white" : "text-ink"
          }`}
        >
          Meridian P2P
        </div>
        <div
          className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${
            inverse ? "text-white/60" : "text-ink-soft"
          }`}
        >
          Procure to Pay
        </div>
      </div>
    </div>
  );
}
