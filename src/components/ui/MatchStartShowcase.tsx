import React, { useEffect, useMemo, useRef, useState } from "react";
import FocusLock from "react-focus-lock";
import { createPortal } from "react-dom";
import CameraTile from "../CameraTile.js";
import type { Player } from "../../store/match.js";
import { useCameraSession } from "../../store/cameraSession.js";
import {
  getAllTime,
  getAllTime180s,
  getAllTimeAvg,
  getAllTimeBestCheckout,
  getAllTimeBestLeg,
  getAllTimeFirstNineAvg,
} from "../../store/profileStats.js";
import { useUserSettings } from "../../store/userSettings.js";

interface StatProps {
  label: string;
  value: string;
}

const StatBlock = ({ label, value }: StatProps) => (
  <div className="flex flex-col items-center gap-0">
    <div className="text-[8px] opacity-70 uppercase font-bold tracking-tighter leading-none">
      {label}
    </div>
    <div className="text-sm sm:text-base font-black leading-none">{value}</div>
  </div>
);

export type MatchStartShowcaseProps = {
  open?: boolean;
  players: Player[];
  user?: any;
  initialSeconds?: number;
  showCalibrationDefault?: boolean;
  disableEscClose?: boolean;
  onDone?: () => void;
  onRequestClose?: () => void;
};

export default function MatchStartShowcase({
  open = true,
  players,
  user,
  initialSeconds = 10,
  disableEscClose = false,
  onDone,
  onRequestClose,
}: MatchStartShowcaseProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [showGo, setShowGo] = useState(false);
  const portalElRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" ? document.createElement("div") : null,
  );
  const goTimeoutRef = useRef<number | null>(null);
  const cameraEnabled = useUserSettings((s) => s.cameraEnabled);
  const setCameraEnabled = useUserSettings((s) => s.setCameraEnabled);
  const cameraSession = useCameraSession();

  // Create portal container
  useEffect(() => {
    const el = portalElRef.current;
    if (!el || typeof document === "undefined") return;
    el.className = "ndn-match-start-portal";
    document.body.appendChild(el);
    return () => {
      try {
        el.parentNode?.removeChild(el);
      } catch {}
    };
  }, []);

  // Reset countdown when reopened or when initial seconds changes
  useEffect(() => {
    if (!open) return;
    setSeconds(initialSeconds);
    setShowGo(false);
    if (goTimeoutRef.current) {
      window.clearTimeout(goTimeoutRef.current);
      goTimeoutRef.current = null;
    }
  }, [open, initialSeconds]);

  // Countdown + ensure camera stays enabled for preview
  useEffect(() => {
    if (!open) return;
    if (!cameraEnabled) setCameraEnabled?.(true);
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          setShowGo(true);
          if (goTimeoutRef.current) window.clearTimeout(goTimeoutRef.current);
          goTimeoutRef.current = window.setTimeout(() => {
            try {
              onDone?.();
              onRequestClose?.();
            } catch {}
          }, 1000);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [open, onDone, onRequestClose, setCameraEnabled, cameraEnabled]);

  useEffect(() => {
    return () => {
      if (goTimeoutRef.current) window.clearTimeout(goTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open || disableEscClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      try {
        onRequestClose?.();
      } catch {}
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, disableEscClose, onRequestClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const root = document.getElementById("root");
    if (!root) return;
    const prev = root.getAttribute("aria-hidden");
    root.setAttribute("aria-hidden", "true");
    return () => {
      if (prev === null || prev === undefined)
        root.removeAttribute("aria-hidden");
      else root.setAttribute("aria-hidden", prev);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      cameraSession?.acquireKeepAlive?.("match-start-showcase");
    } catch {}
    return () => {
      try {
        cameraSession?.releaseKeepAlive?.("match-start-showcase");
      } catch {}
    };
  }, [open, cameraSession]);

  const stats = useMemo(
    () =>
      players.map((p) => {
        try {
          const avg3 = getAllTimeAvg(p.name).toFixed(1);
          const best9 = getAllTimeFirstNineAvg(p.name).toFixed(1);
          const bestCheckout = getAllTimeBestCheckout(p.name);
          const bestLeg = getAllTimeBestLeg(p.name);
          const all = getAllTime(p.name);
          const lifetimeScored = all.scored || 0;
          const lifetimeDarts = all.darts || 0;
          const career180s = getAllTime180s(p.name);
          const match180s = (p.legs || []).reduce((sum, leg) => {
            const legCount = (leg.visits || []).filter(
              (visit) => Number(visit.visitTotal ?? visit.score) === 180,
            ).length;
            return sum + legCount;
          }, 0);
          return {
            id: p.id,
            name: p.name,
            avg3,
            best9,
            bestCheckout,
            bestLeg,
            lifetimeScored,
            lifetimeDarts,
            career180s,
            match180s,
          };
        } catch {
          return {
            id: p.id,
            name: p.name,
            avg3: "",
            best9: "",
            bestCheckout: "",
            bestLeg: "",
            lifetimeScored: 0,
            lifetimeDarts: 0,
            career180s: 0,
            match180s: 0,
          };
        }
      }),
    [players],
  );

  if (!open || !portalElRef.current) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Match start showcase"
    >
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-4xl">
          <FocusLock returnFocus>
            <div className="bg-[#0f111a] border border-white/10 rounded-3xl p-5 shadow-2xl ring-1 ring-white/5 relative overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-4 border-b border-white/5 pb-3">
                <div>
                  <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest mb-1">
                    Manual scoring only
                  </div>
                  <div className="text-2xl md:text-3xl font-black text-white tracking-tighter">
                    {showGo || seconds <= 0
                      ? "GO"
                      : `Match starting in ${seconds}s`}
                  </div>
                  <p className="text-xs text-white/70 mt-1 max-w-xl">
                    Camera is shown to both players before and during the match.
                    No auto-calibration or auto-scoring is used — enter scores
                    manually.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
                    aria-label="Close match start showcase"
                    onClick={() => {
                      try {
                        onRequestClose?.();
                      } catch {}
                    }}
                  >
                    Close
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold"
                    aria-label="Start match now"
                    onClick={() => {
                      try {
                        onDone?.();
                        onRequestClose?.();
                      } catch {}
                    }}
                  >
                    Start now
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {stats.map((st) => (
                    <div
                      key={st.id}
                      className="p-3 rounded-2xl border border-white/10 bg-white/5 shadow-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-lg font-black text-white tracking-tight">
                            {st.name}
                            {user?.username === st.name ? "  You" : ""}
                          </div>
                          <div className="text-[10px] text-emerald-300 font-bold">
                            Manual scoring enabled · {st.match180s}/
                            {st.career180s}
                          </div>
                        </div>
                        <div className="text-sm text-white/70 font-semibold">
                          180s: {st.match180s}/{st.career180s}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <StatBlock label="Avg" value={String(st.avg3)} />
                        <StatBlock label="F9" value={String(st.best9)} />
                        <StatBlock label="CO" value={String(st.bestCheckout)} />
                        <StatBlock label="Leg" value={String(st.bestLeg)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] text-white/70">
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                          <span>Lifetime pts</span>
                          <span className="font-semibold">
                            {st.lifetimeScored.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                          <span>Lifetime darts</span>
                          <span className="font-semibold">
                            {st.lifetimeDarts.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden shadow-xl">
                  <div className="px-4 py-3 flex items-center justify-between text-sm text-white/80 border-b border-white/5">
                    <div className="font-semibold">Camera preview</div>
                    <div className="text-xs text-emerald-300 font-bold">
                      Live Manual scoring
                    </div>
                  </div>
                  <div className="aspect-video relative bg-black">
                    <CameraTile
                      autoStart
                      forceAutoStart
                      fill
                      aspect="free"
                      tileFitModeOverride="fit"
                      scale={1}
                    />
                  </div>
                  <div className="px-4 py-3 text-xs text-white/70 border-t border-white/5">
                    Confirm your board is visible and stable. Scores will be
                    entered manually during the match.
                  </div>
                </div>
              </div>
            </div>
          </FocusLock>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, portalElRef.current);
}
