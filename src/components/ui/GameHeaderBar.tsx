import type { ReactNode } from "react";

// Glassy sticky header bar used across Offline and Online match UIs for visual parity
export default function GameHeaderBar({
  left,
  right,
  className = "",
  sticky = true,
}: {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <div
      className={`${sticky ? "sticky top-0" : ""} card relative overflow-hidden flex items-center justify-between gap-2 mb-2 px-2 sm:px-3 py-2 rounded-xl bg-white/10 border border-white/10 z-10 backdrop-blur-sm ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/30 via-slate-900/10 to-transparent" />
      <div className="flex items-center gap-2 text-xs sm:text-sm leading-none flex-wrap">
        {left}
      </div>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {right}
      </div>
    </div>
  );
}
