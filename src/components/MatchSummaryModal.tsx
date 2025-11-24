import ResizableModal from "./ui/ResizableModal";
import type { Player, Leg } from "../store/match";

function computeTotals(p: Player) {
  let points = 0;
  let darts = 0;
  let bestLeg: number | null = null;
  let worstLeg: number | null = null;
  let oneEighties = 0;
  for (const L of p.legs || []) {
    points += L.totalScoreStart - L.totalScoreRemaining;
    const legDarts = (L.visits || []).reduce(
      (a, v) => a + (v.darts || 0) - (v.preOpenDarts || 0),
      0,
    );
    darts += legDarts;
    if (L.finished) {
      if (bestLeg === null || L.dartsThrown < bestLeg) bestLeg = L.dartsThrown;
      if (worstLeg === null || L.dartsThrown > worstLeg)
        worstLeg = L.dartsThrown;
    }
    // Count 180s: any visit with 180 points
    for (const v of L.visits || []) {
      if ((v?.score || 0) === 180) oneEighties += 1;
    }
  }
  const threeDA = darts > 0 ? (points / darts) * 3 : 0;
  const nineDA = threeDA * 3;
  return { points, darts, threeDA, nineDA, bestLeg, worstLeg, oneEighties };
}

export default function MatchSummaryModal({
  open,
  onClose,
  title = "Match Summary",
  players,
  centerScore,
  doublesStats,
  allowRematch,
  onRematch,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  players: Player[];
  centerScore?: string;
  doublesStats?: Record<
    string,
    { dartsAtDouble?: number; doublesHit?: number }
  >;
  allowRematch?: boolean;
  onRematch?: () => void;
}) {
  if (!open) return null;
  const cards = players.map((p) => {
    const t = computeTotals(p);
    const dbl = doublesStats?.[p.id] || {};
    const att = Math.max(0, Number(dbl.dartsAtDouble || 0));
    const hit = Math.max(0, Number(dbl.doublesHit || 0));
    const pct = att > 0 ? Math.round((hit / att) * 100) : null;
    return {
      id: p.id,
      name: p.name,
      legsWon: p.legsWon,
      ...t,
      dartsAtDouble: att,
      doublesHit: hit,
      doublePct: pct,
    };
  });
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[120]">
      <ResizableModal
        storageKey="ndn:modal:match-summary"
        className="w-full relative"
        defaultWidth={860}
        defaultHeight={540}
        minWidth={640}
        minHeight={420}
        maxWidth={1400}
        maxHeight={1000}
        initialFitHeight
      >
        <h3 className="text-xl font-extrabold mb-2">{title}</h3>
        <div className="text-xs opacity-80 mb-3">
          Players: {players.map((p) => p.name).join(" vs ")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {cards[0] && (
            <div className="p-3 rounded-2xl glass border border-white/10">
              <div className="text-sm font-semibold mb-1">{cards[0].name}</div>
              <div className="text-3xl font-extrabold">{cards[0].legsWon}</div>
              <div className="text-xs opacity-80">Legs Won</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="opacity-70">Final 3DA</span>
                  <div className="font-semibold">
                    {cards[0].threeDA.toFixed(1)}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Final 9DA</span>
                  <div className="font-semibold">
                    {cards[0].nineDA.toFixed(1)}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Darts At Double</span>
                  <div className="font-semibold">
                    {cards[0].dartsAtDouble ?? "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Double %</span>
                  <div className="font-semibold">
                    {cards[0].doublePct !== null &&
                    cards[0].doublePct !== undefined
                      ? `${cards[0].doublePct}%`
                      : "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Best Dart Leg</span>
                  <div className="font-semibold">
                    {cards[0].bestLeg ? `${cards[0].bestLeg} darts` : "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Worst Dart Leg</span>
                  <div className="font-semibold">
                    {cards[0].worstLeg ? `${cards[0].worstLeg} darts` : "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">180's Hit</span>
                  <div className="font-semibold">{cards[0].oneEighties}</div>
                </div>
              </div>
            </div>
          )}
          <div className="hidden md:flex items-center justify-center">
            <div className="text-4xl font-black">
              {centerScore ||
                (players.length === 2
                  ? `${cards[0]?.legsWon ?? 0} – ${cards[1]?.legsWon ?? 0}`
                  : "")}
            </div>
          </div>
          {cards[1] && (
            <div className="p-3 rounded-2xl glass border border-white/10">
              <div className="text-sm font-semibold mb-1">{cards[1].name}</div>
              <div className="text-3xl font-extrabold">{cards[1].legsWon}</div>
              <div className="text-xs opacity-80">Legs Won</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="opacity-70">Final 3DA</span>
                  <div className="font-semibold">
                    {cards[1].threeDA.toFixed(1)}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Final 9DA</span>
                  <div className="font-semibold">
                    {cards[1].nineDA.toFixed(1)}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Darts At Double</span>
                  <div className="font-semibold">
                    {cards[1].dartsAtDouble ?? "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Double %</span>
                  <div className="font-semibold">
                    {cards[1].doublePct !== null &&
                    cards[1].doublePct !== undefined
                      ? `${cards[1].doublePct}%`
                      : "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Best Dart Leg</span>
                  <div className="font-semibold">
                    {cards[1].bestLeg ? `${cards[1].bestLeg} darts` : "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">Worst Dart Leg</span>
                  <div className="font-semibold">
                    {cards[1].worstLeg ? `${cards[1].worstLeg} darts` : "—"}
                  </div>
                </div>
                <div>
                  <span className="opacity-70">180's Hit</span>
                  <div className="font-semibold">{cards[1].oneEighties}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            className="btn bg-slate-700 hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
          {allowRematch && (
            <button
              className="btn bg-emerald-600 hover:bg-emerald-700"
              onClick={onRematch}
            >
              Rematch
            </button>
          )}
        </div>
      </ResizableModal>
    </div>
  );
}
