import ResizableModal from "./ui/ResizableModal.js";
import type { Player } from "../store/match.js";
import { getHeadToHeadLegDiff } from "../store/profileStats.js";

function computeTotals(p: Player) {
  let points = 0;
  let darts = 0;
  let bestLeg: number | null = null;
  let worstLeg: number | null = null;
  let oneEighties = 0;
  let oneForties = 0;
  let tons = 0; // 100+
  let highestVisit = 0;
  let totalVisits = 0;
  let checkoutAttempts = 0;
  let checkoutsHit = 0;
  let firstNineDarts = 0;
  let firstNinePoints = 0;

  for (const L of p.legs || []) {
    points += L.totalScoreStart - L.totalScoreRemaining;
    const legDarts = (L.visits || []).reduce((a, v) => a + (v.darts || 0), 0);
    darts += legDarts;
    if (L.finished) {
      if (bestLeg === null || L.dartsThrown < bestLeg) bestLeg = L.dartsThrown;
      if (worstLeg === null || L.dartsThrown > worstLeg)
        worstLeg = L.dartsThrown;
    }
    // Count 180s, 140+, 100+ and track highest visit
    let legDartsCount = 0;
    for (const v of L.visits || []) {
      const score = v?.score || v?.visitTotal || 0;
      totalVisits++;
      if (score === 180) oneEighties += 1;
      if (score >= 140 && score < 180) oneForties += 1;
      if (score >= 100) tons += 1;
      if (score > highestVisit) highestVisit = score;

      // First 9 darts average (first 3 visits = 9 darts)
      if (legDartsCount < 9) {
        firstNineDarts += Math.min(v.darts || 3, 9 - legDartsCount);
        firstNinePoints += score;
      }
      legDartsCount += v.darts || 3;

      // Checkout tracking
      if (v.doubleWindowDarts) checkoutAttempts += v.doubleWindowDarts;
      if (v.finishedByDouble) checkoutsHit += 1;
    }
  }
  const threeDA = darts > 0 ? (points / darts) * 3 : 0;
  const firstNineAvg =
    firstNineDarts > 0 ? (firstNinePoints / firstNineDarts) * 3 : 0;
  const checkoutPct =
    checkoutAttempts > 0 ? (checkoutsHit / checkoutAttempts) * 100 : 0;

  return {
    points,
    darts,
    threeDA,
    bestLeg,
    worstLeg,
    oneEighties,
    oneForties,
    tons,
    highestVisit,
    totalVisits,
    firstNineAvg,
    checkoutAttempts,
    checkoutsHit,
    checkoutPct,
  };
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
  winnerName,
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
  winnerName?: string;
}) {
  if (!open) return null;

  const cards = players.map((p, idx) => {
    const t = computeTotals(p);
    const dbl = doublesStats?.[p.id] || {};
    const att = Math.max(
      0,
      Number(dbl.dartsAtDouble || t.checkoutAttempts || 0),
    );
    const hit = Math.max(0, Number(dbl.doublesHit || t.checkoutsHit || 0));
    const pct = att > 0 ? Math.round((hit / att) * 100) : null;
    // Head-to-head leg difference vs the other player
    const opponent = players[1 - idx];
    const h2h = opponent ? getHeadToHeadLegDiff(p.name, opponent.name) : null;
    const legDiff = h2h && h2h.played ? h2h.diffA : 0;
    const legDiffStr = `${legDiff > 0 ? "+" : ""}${legDiff}`;
    return {
      id: p.id,
      name: p.name,
      legsWon: p.legsWon,
      ...t,
      dartsAtDouble: att,
      doublesHit: hit,
      doublePct: pct,
      legDiffStr,
    };
  });

  // Determine winner
  const winner =
    winnerName ||
    (cards.length === 2 && cards[0].legsWon !== cards[1].legsWon
      ? cards[0].legsWon > cards[1].legsWon
        ? cards[0].name
        : cards[1].name
      : null);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
      <ResizableModal
        storageKey="ndn:modal:match-summary"
        className="ndn-modal w-full relative overflow-hidden"
        defaultWidth={960}
        defaultHeight={730}
        minWidth={640}
        minHeight={520}
        maxWidth={1400}
        maxHeight={1000}
        initialFitHeight
      >
        {/* Winner Banner */}
        {winner && (
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-500/20 py-3 text-center border-b border-yellow-400/30">
            <div className="text-2xl font-black text-yellow-300 tracking-tight">
              🏆 {winner} WINS! 🏆
            </div>
          </div>
        )}

        <div className={winner ? "pt-14" : ""}>
          <h3 className="text-2xl font-extrabold mb-1 text-center">{title}</h3>
          <div className="text-sm opacity-80 mb-4 text-center">
            {players.map((p) => p.name).join(" vs ")}
          </div>

          {/* Score Display */}
          <div className="flex items-center justify-center gap-6 mb-6">
            {cards[0] && (
              <div
                className={`text-5xl font-black ${cards[0].legsWon > (cards[1]?.legsWon || 0) ? "text-emerald-400" : "text-white"}`}
              >
                {cards[0].legsWon}
              </div>
            )}
            <div className="text-3xl font-bold text-white/50">–</div>
            {cards[1] && (
              <div
                className={`text-5xl font-black ${cards[1].legsWon > (cards[0]?.legsWon || 0) ? "text-emerald-400" : "text-white"}`}
              >
                {cards[1].legsWon}
              </div>
            )}
          </div>

          {/* Player Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {cards.map((card, idx) => (
              <div
                key={card.id}
                className={`p-4 rounded-2xl border ${
                  card.legsWon > (cards[1 - idx]?.legsWon || 0)
                    ? "bg-emerald-500/10 border-emerald-400/30"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-bold">{card.name}</div>
                  {card.legsWon > (cards[1 - idx]?.legsWon || 0) && (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Winner
                    </span>
                  )}
                </div>

                {/* Key Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-white/5 text-center">
                    <div className="text-2xl font-bold text-indigo-300">
                      {card.threeDA.toFixed(1)}
                    </div>
                    <div className="text-[10px] opacity-70">3-Dart Avg</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 text-center">
                    <div className="text-2xl font-bold text-amber-300">
                      {card.firstNineAvg.toFixed(1)}
                    </div>
                    <div className="text-[10px] opacity-70">First 9 Avg</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 text-center">
                    <div className="text-2xl font-bold text-emerald-300">
                      {card.doublePct !== null ? `${card.doublePct}%` : "—"}
                    </div>
                    <div className="text-[10px] opacity-70">Checkout %</div>
                  </div>
                </div>

                {/* Detailed Stats Grid */}
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold text-rose-300">
                      {card.oneEighties}
                    </div>
                    <div className="opacity-60">180's</div>
                  </div>
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold">{card.oneForties}</div>
                    <div className="opacity-60">140+</div>
                  </div>
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold">{card.tons}</div>
                    <div className="opacity-60">100+</div>
                  </div>
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold">{card.highestVisit}</div>
                    <div className="opacity-60">High</div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2 text-xs mt-2">
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold">{card.bestLeg || "—"}</div>
                    <div className="opacity-60">Best Leg</div>
                  </div>
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold">{card.worstLeg || "—"}</div>
                    <div className="opacity-60">Worst Leg</div>
                  </div>
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold">{card.darts}</div>
                    <div className="opacity-60">Darts</div>
                  </div>
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div className="font-bold">{card.dartsAtDouble}</div>
                    <div className="opacity-60">At Double</div>
                  </div>
                  <div className="p-1.5 rounded bg-white/5 text-center">
                    <div
                      className={`font-bold ${card.legDiffStr.startsWith("+") ? "text-emerald-300" : card.legDiffStr.startsWith("-") ? "text-rose-300" : ""}`}
                    >
                      {card.legDiffStr}
                    </div>
                    <div className="opacity-60">Leg Diff</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            className="btn bg-slate-700 hover:bg-slate-600 py-3 text-sm font-semibold"
            onClick={onClose}
          >
            Close
          </button>
          {allowRematch && (
            <button
              className="btn bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 py-3 text-sm font-semibold"
              onClick={onRematch}
            >
              🔄 Rematch
            </button>
          )}
        </div>
      </ResizableModal>
    </div>
  );
}
