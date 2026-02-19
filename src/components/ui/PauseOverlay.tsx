import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMatchControl } from "../../store/matchControl.js";

const DURATION_OPTIONS = [
  { label: "1 min", minutes: 1 },
  { label: "3 min", minutes: 3 },
  { label: "5 min", minutes: 5 },
] as const;

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return { mm, ss, totalSeconds: s };
}

export default function PauseOverlay({
  localPlayerName,
  onResume,
  onDurationSelected,
}: {
  localPlayerName?: string | null;
  onResume?: () => void;
  onDurationSelected?: (minutes: number, endsAt: number) => void;
}) {
  const paused = useMatchControl((s) => s.paused);
  const pauseEndsAt = useMatchControl((s) => s.pauseEndsAt);
  const pauseStartedAt = useMatchControl((s) => s.pauseStartedAt);
  const pauseInitiator = useMatchControl((s) => s.pauseInitiator);
  const setPaused = useMatchControl((s) => s.setPaused);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!paused || !pauseEndsAt) return;
    const t = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= pauseEndsAt) {
        setPaused(false, null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [paused, pauseEndsAt, setPaused]);

  const remaining = Math.max(0, (pauseEndsAt ?? now) - now);
  const started = pauseStartedAt ?? now;
  const total = Math.max(1, (pauseEndsAt ?? now) - started);
  const progress = Math.max(0, Math.min(1, 1 - remaining / total));
  const pct = Math.round(progress * 100);

  const ringStyle = useMemo(
    () => ({
      background: `conic-gradient(rgba(251, 191, 36, 0.95) ${pct}%, rgba(255, 255, 255, 0.08) ${pct}%)`,
    }),
    [pct],
  );

  if (!paused) return null;

  const canResume =
    !pauseInitiator || !localPlayerName || pauseInitiator === localPlayerName;

  const handleResume = () => {
    if (onResume) {
      onResume();
    } else {
      setPaused(false, null);
    }
  };

  const selectDuration = (minutes: number) => {
    const endsAt = Date.now() + minutes * 60_000;
    setPaused(true, endsAt, pauseInitiator);
    // Notify parent so online matches can sync with opponent
    if (onDurationSelected) onDurationSelected(minutes, endsAt);
  };

  // Phase 1: timer duration selection (no pauseEndsAt yet)
  const needsSelection = !pauseEndsAt;

  const { mm, ss } = needsSelection ? { mm: "--", ss: "--" } : fmt(remaining);

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center"
      style={{ pointerEvents: "all" }}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      {/* Full-screen frosted glass backdrop — blocks all interaction underneath */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent" />

      {/* Centered analogue timer card */}
      <div className="relative w-full max-w-sm mx-4 rounded-3xl border border-white/15 bg-white/[0.08] shadow-2xl shadow-black/50 p-8 sm:p-10 backdrop-blur-xl">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        <div className="relative flex flex-col items-center gap-6 text-center">
          <div className="text-xs uppercase tracking-[0.35em] font-semibold text-amber-200/80">
            Match Paused
          </div>
          {pauseInitiator && (
            <div className="text-sm text-amber-200/60">
              Paused by{" "}
              <span className="font-semibold text-amber-100">
                {pauseInitiator}
              </span>
            </div>
          )}
          {/* Analogue ring timer */}
          <div className="relative flex items-center justify-center w-48 h-48 sm:w-56 sm:h-56">
            <div
              className="absolute inset-0 rounded-full border border-amber-300/30 shadow-inner"
              style={
                needsSelection
                  ? { background: "rgba(255, 255, 255, 0.08)" }
                  : ringStyle
              }
            />
            <div className="absolute inset-3 rounded-full bg-slate-950/90 border border-white/10 flex items-center justify-center">
              <div className="font-mono text-5xl sm:text-6xl font-black text-white tabular-nums">
                {mm}
                <span className="text-amber-300/80">:</span>
                {ss}
              </div>
            </div>
          </div>

          {needsSelection ? (
            /* Phase 1 — duration selection */
            canResume ? (
              <div className="flex flex-col items-center gap-3">
                <div className="text-[11px] uppercase tracking-[0.25em] text-amber-200/60">
                  Select pause duration
                </div>
                <div className="flex items-center gap-3">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.minutes}
                      className="px-5 py-2.5 rounded-2xl text-sm font-semibold bg-amber-500/20 hover:bg-amber-500/40 text-amber-100 border border-amber-400/30 shadow-lg transition active:scale-95"
                      onClick={() => selectDuration(opt.minutes)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  className="mt-1 px-8 py-3 rounded-2xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 shadow-lg shadow-emerald-500/20 transition active:scale-95"
                  onClick={handleResume}
                >
                  Resume
                </button>
              </div>
            ) : (
              <div className="text-xs text-amber-200/50 mt-1">
                Waiting for{" "}
                <span className="font-semibold text-amber-100">
                  {pauseInitiator}
                </span>{" "}
                to select timer…
              </div>
            )
          ) : (
            /* Phase 2 — countdown active */
            <>
              <div className="text-[11px] uppercase tracking-[0.25em] text-amber-200/40">
                Countdown
              </div>
              {canResume ? (
                <button
                  className="mt-1 px-8 py-3 rounded-2xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 shadow-lg shadow-emerald-500/20 transition active:scale-95"
                  onClick={handleResume}
                >
                  Resume
                </button>
              ) : (
                <div className="text-xs text-amber-200/50 mt-1">
                  Only{" "}
                  <span className="font-semibold text-amber-100">
                    {pauseInitiator}
                  </span>{" "}
                  can resume
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
