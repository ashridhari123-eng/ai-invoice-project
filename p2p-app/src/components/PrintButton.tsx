"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-soft"
    >
      Print / Save as PDF
    </button>
  );
}
