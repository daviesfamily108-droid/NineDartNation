import React, { useEffect, useState } from "react";
import { useMatchControl } from "../../store/matchControl.js";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function PauseTimerBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  const pauseEndsAt = useMatchControl((s) => s.pauseEndsAt);
  const pauseStartedAt = useMatchControl((s) => s.pauseStartedAt);
  const paused = useMatchControl((s) => s.paused);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!paused || !pauseEndsAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [paused, pauseEndsAt]);

  if (!paused || !pauseEndsAt) return null;
  const remaining = Math.max(0, pauseEndsAt - now);
  const started = pauseStartedAt ?? now;
  const total = Math.max(1, pauseEndsAt - started);
  const pct = Math.max(0, Math.min(1, 1 - remaining / total));

  return (
    <div
      className="mr-2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Match paused, ${Math.ceil(remaining / 1000)} seconds remaining`}
    >
      <div
        className={`px-2 py-1 rounded-full bg-amber-600 text-black text-xs font-semibold ${compact ? "" : "mr-2"}`}
      >
        Paused {fmt(remaining)} 🎯
      </div>
      {!compact && (
        <div
          className="w-40 h-2 bg-white/10 rounded overflow-hidden mt-1"
          aria-hidden
        >
          <div
            className="h-2 bg-amber-400"
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
