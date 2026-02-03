import React, { useMemo } from "react";
import { suggestCheckouts } from "../../utils/checkout";
import { useUserSettings } from "../../store/userSettings";

export default function InGameSpectatorOverlay({
  remaining,
  legsLabel,
}: {
  remaining: number;
  legsLabel: string;
}) {
  const favoriteDouble = useUserSettings((s) => s.favoriteDouble);

  const route = useMemo(() => {
    if (!Number.isFinite(remaining)) return "";
    const routes = suggestCheckouts(remaining, favoriteDouble);
    return routes[0] ?? "";
  }, [remaining, favoriteDouble]);

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50 w-[min(92vw,320px)]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-slate-950/70 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-300/80">
              Remaining
            </div>
            <div className="mt-1 text-4xl font-extrabold leading-none text-white">
              {Number.isFinite(remaining) ? remaining : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-slate-300/80">
              Legs
            </div>
            <div className="mt-1 text-lg font-semibold text-emerald-200">
              {legsLabel}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-300/80">
            Checkout
          </div>
          <div className="mt-1 text-sm font-semibold text-indigo-200">
            {route || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
