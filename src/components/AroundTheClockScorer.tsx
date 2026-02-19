import React, { useCallback, useMemo, useState } from "react";
import { ATC_ORDER } from "../game/aroundTheClock.js";

/** Reversed order: Bull → 20 → 1 */
const ATC_ORDER_REV = [...ATC_ORDER].reverse();

export type ATCDirection = "1-to-bull" | "bull-to-1";

interface Props {
  /** Which direction around the board (chosen by first thrower at game start). */
  direction: ATCDirection | null;
  /** Callback when the first thrower picks a direction. */
  onPickDirection: (dir: ATCDirection) => void;
  /** Index into the target sequence that the current thrower must hit. */
  currentTargetIndex: number;
  /** True when it is the local player's turn. */
  isUsersTurn: boolean;
  /**
   * Called after 3 darts have been thrown.
   * @param hits — how many targets were hit this turn (0-3)
   * @param totalValue — sum of all hit target values this turn
   */
  onTurnComplete: (hits: number, totalValue: number) => void;
  /**
   * Called each time a single dart hits so the parent can advance the
   * target index immediately (keeps hero display in sync).
   */
  onDartHit: () => void;
  /** Number of targets already completed by the current thrower. */
  completed: number;
  /** Player name shown above the target. */
  playerName?: string;
}

function targetLabel(n: number): string {
  if (n === 25) return "Outer Bull";
  if (n === 50) return "Inner Bull";
  return String(n);
}

type DartResult = "hit" | "miss" | null;

/**
 * Around the Clock scoring panel — replaces the number pad when game mode
 * is "Around the Clock". Players throw 3 darts per turn. Each dart can
 * hit the current target (advancing it) or miss. After all 3 darts the
 * turn is committed and play passes to the opponent.
 */
export default function AroundTheClockScorer({
  direction,
  onPickDirection,
  currentTargetIndex,
  isUsersTurn,
  onTurnComplete,
  onDartHit,
  completed,
  playerName,
}: Props) {
  const order = direction === "bull-to-1" ? ATC_ORDER_REV : ATC_ORDER;
  const total = order.length;
  const finished = currentTargetIndex >= total;

  // Per-turn dart tracking (resets each turn)
  const [darts, setDarts] = useState<DartResult[]>([null, null, null]);
  const dartsThrown = darts.filter((d) => d !== null).length;
  const dartsHit = darts.filter((d) => d === "hit").length;

  // Accumulate hit values within the turn so we can report the total
  const [turnHitValues, setTurnHitValues] = useState<number[]>([]);

  // The "live" target accounts for hits already recorded this turn
  const liveTargetIndex = currentTargetIndex;
  const liveTarget = order[liveTargetIndex] ?? null;

  const resetTurn = useCallback(() => {
    setDarts([null, null, null]);
    setTurnHitValues([]);
  }, []);

  const recordDart = useCallback(
    (result: "hit" | "miss") => {
      if (dartsThrown >= 3 || finished) return;

      const nextDarts = [...darts];
      nextDarts[dartsThrown] = result;
      setDarts(nextDarts);

      let hitVal = 0;
      if (result === "hit") {
        hitVal = order[liveTargetIndex] ?? 0;
        setTurnHitValues((prev) => [...prev, hitVal]);
        // Immediately advance target in parent
        onDartHit();
      }

      const newCount = dartsThrown + 1;

      // After 3 darts, auto-commit the turn
      if (newCount >= 3) {
        const totalHits = nextDarts.filter((d) => d === "hit").length;
        const totalVal =
          result === "hit"
            ? [...turnHitValues, hitVal].reduce((a, b) => a + b, 0)
            : turnHitValues.reduce((a, b) => a + b, 0);
        // Use setTimeout so state updates flush before parent commits
        setTimeout(() => {
          onTurnComplete(totalHits, totalVal);
          resetTurn();
        }, 350);
      }
    },
    [
      darts,
      dartsThrown,
      finished,
      order,
      liveTargetIndex,
      turnHitValues,
      onDartHit,
      onTurnComplete,
      resetTurn,
    ],
  );

  // Show direction picker if not yet chosen
  if (!direction) {
    return (
      <div className="relative w-full rounded-2xl border-2 border-dashed border-indigo-400/40 bg-indigo-500/5 p-6 sm:p-8 text-center">
        <div className="text-indigo-300/70 text-xs sm:text-sm uppercase tracking-widest font-semibold mb-4">
          Choose Direction
        </div>
        <p className="text-white/70 text-sm mb-6">
          The first thrower picks the order for both players.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            className="px-6 py-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition-all text-center"
            onClick={() => onPickDirection("1-to-bull")}
          >
            <div className="font-bold text-emerald-200 text-lg">1 → Bull</div>
            <div className="text-emerald-300/60 text-xs mt-1">
              Start at 1, finish on Bullseye
            </div>
          </button>
          <button
            type="button"
            className="px-6 py-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all text-center"
            onClick={() => onPickDirection("bull-to-1")}
          >
            <div className="font-bold text-amber-200 text-lg">Bull → 1</div>
            <div className="text-amber-300/60 text-xs mt-1">
              Start at Bullseye, finish on 1
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Finished state
  if (finished && dartsThrown === 0) {
    return (
      <div className="relative w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 sm:p-8 text-center">
        <div className="text-4xl mb-2">🎯</div>
        <div className="font-bold text-emerald-200 text-xl">
          Around the Clock Complete!
        </div>
        <div className="text-emerald-300/60 text-sm mt-2">
          All {total} targets hit
        </div>
      </div>
    );
  }

  // Progress bar
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Show upcoming targets (next 5 after current live target)
  const upcoming = order.slice(liveTargetIndex + 1, liveTargetIndex + 6);

  const allDartsThrown = dartsThrown >= 3;

  return (
    <div className="flex flex-col gap-3">
      {/* Progress */}
      <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Progress
          </span>
          <span className="text-xs text-slate-400 tabular-nums font-medium">
            {completed} / {total} ({pct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-[10px] text-slate-500">
          Direction:{" "}
          {direction === "1-to-bull" ? "1 → 20 → Bull" : "Bull → 20 → 1"}
        </div>
      </div>

      {/* Dart indicators — shows which darts have been thrown */}
      {isUsersTurn && (
        <div className="flex items-center justify-center gap-3">
          {darts.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                Dart {i + 1}
              </div>
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 transition-all ${
                  d === "hit"
                    ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-300"
                    : d === "miss"
                      ? "bg-rose-500/20 border-rose-400/60 text-rose-300"
                      : i === dartsThrown
                        ? "bg-white/10 border-white/30 text-white/60 animate-pulse"
                        : "bg-white/5 border-white/10 text-white/20"
                }`}
              >
                {d === "hit" ? "✓" : d === "miss" ? "✗" : "•"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current target — big tappable area */}
      <div
        className={`relative w-full rounded-2xl border-2 p-6 sm:p-8 text-center transition-all ${
          isUsersTurn && !allDartsThrown
            ? "border-emerald-400/40 bg-emerald-500/5"
            : isUsersTurn && allDartsThrown
              ? "border-amber-400/40 bg-amber-500/5"
              : "border-white/10 bg-white/5 opacity-60"
        }`}
      >
        {playerName && (
          <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
            {isUsersTurn ? "Your target" : `${playerName}'s target`}
          </div>
        )}
        <div className="text-emerald-300/60 text-xs sm:text-sm uppercase tracking-widest font-semibold mb-2">
          {allDartsThrown
            ? "Turn Complete"
            : `Current Target — Dart ${dartsThrown + 1} of 3`}
        </div>
        <div className="font-mono text-6xl sm:text-7xl font-black text-white leading-none mb-4">
          {finished ? "✓" : liveTarget != null ? targetLabel(liveTarget) : "—"}
        </div>

        {isUsersTurn && !allDartsThrown && !finished && (
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              className="flex-1 max-w-[10rem] py-4 rounded-2xl text-lg font-bold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 border border-emerald-400/30 text-white shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
              onClick={() => recordDart("hit")}
            >
              ✓ Hit
            </button>
            <button
              type="button"
              className="flex-1 max-w-[10rem] py-4 rounded-2xl text-lg font-bold bg-rose-600/80 hover:bg-rose-500 active:bg-rose-400 border border-rose-400/30 text-white shadow-lg shadow-rose-600/20 transition-all active:scale-95"
              onClick={() => recordDart("miss")}
            >
              ✗ Miss
            </button>
          </div>
        )}
        {isUsersTurn && allDartsThrown && (
          <div className="text-sm text-amber-200/70 mt-2 animate-pulse">
            Submitting turn…
          </div>
        )}
        {!isUsersTurn && (
          <div className="text-sm text-white/40 mt-2">
            Waiting for opponent…
          </div>
        )}
      </div>

      {/* Turn summary (visible while throwing) */}
      {isUsersTurn && dartsThrown > 0 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <span className="text-emerald-300 font-semibold">
            Hits: {dartsHit}
          </span>
          <span className="text-rose-300 font-semibold">
            Misses: {dartsThrown - dartsHit}
          </span>
        </div>
      )}

      {/* Upcoming targets */}
      {upcoming.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">
            Next:
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {upcoming.map((t, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 font-medium tabular-nums"
              >
                {targetLabel(t)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
