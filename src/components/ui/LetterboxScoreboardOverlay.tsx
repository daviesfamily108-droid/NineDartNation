import React, { useMemo } from "react";
import { suggestCheckouts } from "../../utils/checkout";
import { useUserSettings } from "../../store/userSettings";

type Row = {
  side: "Away" | "Home";
  name: string;
  legsWon: number;
  remaining: number;
};

export default function LetterboxScoreboardOverlay({
  checkoutRemaining,
  away,
  home,
}: {
  checkoutRemaining: number;
  away: Row;
  home: Row;
}) {
  const favoriteDouble = useUserSettings((s) => s.favoriteDouble);

  const route = useMemo(() => {
    if (!Number.isFinite(checkoutRemaining)) return "";
    const routes = suggestCheckouts(checkoutRemaining, favoriteDouble);
    return routes[0] ?? "";
  }, [checkoutRemaining, favoriteDouble]);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-50 w-[min(92vw,520px)]">
      <div className="rounded-2xl border border-white/10 bg-black/55 shadow-2xl backdrop-blur">
        <div className="px-4 py-2 border-b border-white/10">
          <div className="text-[11px] uppercase tracking-wide text-slate-300/80">
            Checkout
          </div>
          <div className="text-sm font-semibold text-indigo-200">
            {route || "—"}
          </div>
        </div>

        <div className="px-3 py-2">
          {[home, away].map((r) => (
            <div
              key={r.side}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-1"
            >
              <div className="w-10 text-center text-sm font-extrabold text-emerald-200">
                {r.legsWon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-300/70">
                    {r.side}
                  </div>
                  <div className="truncate text-sm font-semibold text-white">
                    {r.name || "—"}
                  </div>
                </div>
              </div>
              <div className="w-16 text-right text-lg font-extrabold text-white tabular-nums">
                {Number.isFinite(r.remaining) ? r.remaining : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
