import { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  getAllTimeAvg,
  getAllTimeFirstNineAvg,
  getAllTimeBestCheckout,
  getAllTimeBestLeg,
  getAllTime,
  getAllTime180s,
} from "../../store/profileStats";
import type { Player } from "../../store/match";
import { useCalibration } from "../../store/calibration";

function StatBlock({
  label,
  value,
  className = "",
  scale = 1,
}: {
  label: string;
  value: string | number;
  className?: string;
  scale?: number;
}) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div
        className="text-2xl sm:text-3xl font-bold transform transition-transform duration-200 ease-out"
        style={{ transform: `scale(${scale})` }}
      >
        {value}
      </div>
    </div>
  );
}

function PlayerCalibrationPreview({
  player,
  user,
  playerCalibrations,
}: {
  player: Player;
  user?: any;
  playerCalibrations: { [playerName: string]: any };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calib = playerCalibrations[player.name];
  const isCalibrated = !!calib;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw a simple dartboard circle
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 2;

    // Outer circle
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // Bullseye
    ctx.fillStyle = "#f00";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
    ctx.fill();

    // If calibrated, draw calibration points
    if (isCalibrated) {
      ctx.fillStyle = "#0f0";
      // Draw some sample points (simplified)
      const points = [
        [centerX - radius * 0.5, centerY],
        [centerX + radius * 0.5, centerY],
        [centerX, centerY - radius * 0.5],
        [centerX, centerY + radius * 0.5],
      ];
      points.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, [isCalibrated]);

  return (
    <div className="flex items-center gap-2 mt-1">
      <canvas
        ref={canvasRef}
        width={40}
        height={40}
        className="border border-white/20 rounded"
      />
      <span
        className={`text-xs ${isCalibrated ? "text-green-400" : "text-gray-400"}`}
      >
        {isCalibrated ? "Calibrated" : "Not Calibrated"}
      </span>
    </div>
  );
}

import FocusLock from "react-focus-lock";
import CalibrationPopup from "./CalibrationPopup";
export default function MatchStartShowcase({
  open = true,
  players,
  user,
  onDone,
  onRequestClose,
  initialSeconds = 15,
  roomId,
  onChoice,
  choices = {},
  bullActive = false,
  onBullThrow,
  showCalibrationDefault = false,
  disableEscClose = false,
}: {
  open?: boolean;
  players: Player[];
  user?: any;
  onDone?: () => void;
  onRequestClose?: () => void;
  initialSeconds?: number;
  roomId?: string;
  onChoice?: (choice: "bull" | "skip") => void;
  choices?: Record<string, string>;
  bullActive?: boolean;
  onBullThrow?: (score: number) => void;
  showCalibrationDefault?: boolean;
  disableEscClose?: boolean;
}) {
  // Debug logs removed
  const [seconds, setSeconds] = useState(initialSeconds || 15);
  const [scaleState, setScaleState] = useState(1);
  // Overlay visibility is controlled by parent; the component should be controlled using `open` and `onRequestClose`.
  const visible = !!open;
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibrationSkipped, setCalibrationSkipped] = useState<{
    [playerId: string]: boolean;
  }>(() => {
    const map: { [k: string]: boolean } = {};
    if (!showCalibrationDefault) {
      for (const p of players) map[p.id] = true;
    }
    return map;
  });
  const [playerCalibrations, setPlayerCalibrations] = useState<{
    [playerName: string]: any;
  }>({});
  const hostRef = useRef<HTMLDivElement | null>(null);
  const startNowRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const prevActiveElement = useRef<HTMLElement | null>(null);
  // mountedRef ensures keyboard events that fire during render/mount don't prematurely close the overlay
  const mountedRef = useRef(false);

  useEffect(() => {
    // mark mounted after first paint to ensure early key events don't trigger a close mid-render
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // If players list widens after mount, ensure new players inherit the skip state
  useEffect(() => {
    if (!showCalibrationDefault) {
      setCalibrationSkipped((prev) => {
        const next = { ...prev };
        for (const p of players) if (!next[p.id]) next[p.id] = true;
        return next;
      });
    }
  }, [players, showCalibrationDefault]);

  const allPlayersSkipped = players.every((p) => calibrationSkipped[p.id]);
  const canStartMatch = allPlayersSkipped;

  // visibility is controlled by parent via `open` prop

  useEffect(() => {
    if (!visible) return;
    // useEffect(visible) entered
    // Ensure initial focus is on the Start Now button for convenience
    try {
      setTimeout(() => {
        try {
          startNowRef.current?.focus();
        } catch {}
      }, 0);
    } catch {}
    // remember previous active element so we can restore on close
    try {
      prevActiveElement.current = document.activeElement as HTMLElement;
    } catch {}
    // Hide app content from screen readers while overlay is open
    const appRoot = document.getElementById("root");
    const prevAria: string | null = appRoot
      ? appRoot.getAttribute("aria-hidden")
      : null;
    try {
      if (appRoot) appRoot.setAttribute("aria-hidden", "true");
    } catch {}
    const t = allPlayersSkipped
      ? setInterval(() => setSeconds((s) => s - 1), 1000)
      : null;
    const onKey = (e: KeyboardEvent) => {
      if (!mountedRef.current) return;
      if (!disableEscClose && (e.key === "Escape" || e.key === "Esc")) {
        e.preventDefault();
        // Ensure parent handlers are invoked asynchronously so we don't unmount during render
        try {
          setTimeout(() => {
            try {
              onRequestClose?.();
            } catch {}
          }, 0);
        } catch {}
        try {
          prevActiveElement.current?.focus();
        } catch {}
      }
    };
    document.addEventListener("keydown", onKey);
    // Cleanup and restore aria-hidden
    return () => {
      // useEffect(visible) cleanup
      try {
        if (appRoot) {
          appRoot.removeAttribute("aria-hidden");
        }
      } catch {}
      if (t) clearInterval(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, onDone, allPlayersSkipped]);

  useEffect(() => {
    if (!visible) return;
    // Show calibration popup immediately when countdown starts
    if (
      showCalibrationDefault &&
      seconds === (initialSeconds || 15) &&
      !showCalibration
    ) {
      setShowCalibration(true);
      // Fetch calibrations for all players
      const fetchCalibrations = async () => {
        const calibs: { [playerName: string]: any } = {};
        for (const player of players) {
          if (user?.username && player.name === user.username) {
            // Local user: use store
            const { H, imageSize, overlaySize, locked } = useCalibration.getState();
            if (H && locked) calibs[player.name] = { H, imageSize, overlaySize, locked };
          } else {
            // Remote user: fetch from server
            try {
              const res = await fetch(
                `/api/users/${encodeURIComponent(player.name)}/calibration`,
              );
              if (res.ok) {
                const data = await res.json();
                if (data.calibration) calibs[player.name] = data.calibration;
              }
            } catch (err) {
              console.warn("Failed to fetch calibration for", player.name, err);
            }
          }
        }
        setPlayerCalibrations(calibs);
      };
      fetchCalibrations();
    }
    // Only start countdown when all players have skipped calibration
    if (allPlayersSkipped) {
      if (seconds <= 3 && seconds > 0) {
        setScaleState((s) => s + 0.4);
      }
      if (seconds <= 0) {
        // countdown reached 0, scheduling close
        // Done; small delay to let the "Game On" message show
        setTimeout(() => {
          // Do not set local visible state here when controlled; delegate close to parent via onRequestClose/onDone
          // calling onDone/onRequestClose
          try {
            onDone?.();
          } catch {}
          try {
            setTimeout(() => {
              try {
                onRequestClose?.();
              } catch {}
            }, 0);
          } catch {}
          // Return focus to previous element
          try {
            prevActiveElement.current?.focus();
          } catch {}
        }, 1000);
      }
    }
  }, [
    seconds,
    onDone,
    visible,
    showCalibration,
    allPlayersSkipped,
    players,
    user,
  ]);

  const stats = useMemo(
    () =>
      players.map((p) => {
        try {
          const avg3 = getAllTimeAvg(p.name);
          const best9 = getAllTimeFirstNineAvg(p.name);
          const bestCheckout = getAllTimeBestCheckout(p.name);
          const bestLeg = getAllTimeBestLeg(p.name);
          const all = getAllTime(p.name);
          const career180s = getAllTime180s(p.name);
          // Count match 180s for the provided player
          let match180s = 0;
          try {
            for (const L of p.legs || []) {
              for (const v of L.visits || []) {
                if (Number(v.score || 0) === 180) match180s += 1;
              }
            }
          } catch {}
          const one80s = `${match180s}/${career180s}`;
          return {
            id: p.id,
            name: p.name,
            avg3: avg3.toFixed(1),
            best9: best9.toFixed(1),
            bestCheckout,
            bestLeg,
            one80s,
          };
        } catch (err) {
          // Swallow errors computing stats to avoid breaking render in tests
          return {
            id: p.id,
            name: p.name,
            avg3: "—",
            best9: "—",
            bestCheckout: "—",
            bestLeg: "—",
            one80s: "—",
          };
        }
      }),
    [players],
  );
  // Create and manage a portal container so overlays appended to body are cleaned up and avoid duplicates in tests
  const portalElRef = useRef<HTMLDivElement | null>(
    typeof document !== "undefined" ? document.createElement("div") : null,
  );
  useLayoutEffect(() => {
    if (!portalElRef.current) return;
    const el = portalElRef.current;
    el.className = "ndn-match-start-portal";
    try {
      const old = Array.from(
        document.querySelectorAll(".ndn-match-start-portal"),
      );
      old.forEach((o) => {
        try {
          o.parentNode?.removeChild(o);
        } catch {}
      });
    } catch {}
    document.body.appendChild(el);
    return () => {
      try {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch {}
    };
  }, []);

  if (!visible) return null;

  // Render the extracted CalibrationPopup component, passing required handlers

  const getScaleFor = (s: number) => {
    if (s <= 0) return 1.8;
    if (s === 1) return 1.6;
    if (s === 2) return 1.4;
    if (s === 3) return 1.2;
    return 1;
  };

  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-start-heading"
        tabIndex={-1}
      >
        <FocusLock returnFocus={true}>
          <div ref={hostRef}>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 md:p-12 max-w-7xl w-full backdrop-blur-sm shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div
                  id="match-start-heading"
                  className="text-2xl font-bold opacity-90"
                >
                  Match Starting Soon
                </div>
                <div className="flex items-center gap-4">
                  <div
                    className="text-6xl font-extrabold text-emerald-400"
                    aria-live="polite"
                  >
                    {seconds > 0 ? seconds : "GO"}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      ref={startNowRef}
                      className="btn btn-lg"
                      onClick={() => {
                        try {
                          onDone?.();
                        } catch {}
                        try {
                          try {
                            document
                              .getElementById("root")
                              ?.removeAttribute("aria-hidden");
                          } catch {}
                          setTimeout(() => {
                            try {
                              onRequestClose?.();
                            } catch {}
                          }, 0);
                        } catch {}
                      }}
                      aria-label="Start match now"
                    >
                      Start Now
                    </button>
                    <button
                      ref={closeRef}
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        try {
                          onDone?.();
                        } catch {}
                        try {
                          document
                            .getElementById("root")
                            ?.removeAttribute("aria-hidden");
                        } catch {}
                        try {
                          setTimeout(() => {
                            try {
                              onRequestClose?.();
                            } catch {}
                          }, 0);
                        } catch {}
                      }}
                      aria-label="Close match start showcase"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {stats.map((st) => (
                  <div
                    key={st.id}
                    className="p-6 rounded-2xl bg-white/8 border border-white/12 flex flex-col items-center shadow-xl"
                  >
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-2xl font-bold text-white mb-4 shadow-lg">
                      {st.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="text-xl font-semibold mb-4 text-center">
                      {st.name}
                    </div>
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <StatBlock
                        label="3-Dart Avg"
                        value={st.avg3}
                        scale={getScaleFor(seconds)}
                      />
                      <StatBlock
                        label="First-9 Avg"
                        value={st.best9}
                        scale={getScaleFor(seconds)}
                      />
                      <StatBlock
                        label="Best Checkout"
                        value={st.bestCheckout || "—"}
                        scale={getScaleFor(seconds)}
                      />
                      <StatBlock
                        label="Best Leg"
                        value={st.bestLeg || "—"}
                        scale={getScaleFor(seconds)}
                      />
                    </div>
                    <div className="mt-4 opacity-70 text-sm">
                      180s (match / career): {st.one80s}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-center">
                {seconds <= 1 ? (
                  <div className="text-3xl font-bold text-emerald-400">
                    Good luck — Game on! 🎯
                  </div>
                ) : (
                  <div className="text-lg opacity-70">
                    {players.map((p) => p.name).join(" vs ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </FocusLock>
      </div>
    </div>
  );
  return createPortal(
    <>
      {showCalibration && (
        <CalibrationPopup
          players={players}
          playerCalibrations={playerCalibrations}
          calibrationSkipped={calibrationSkipped}
          onSkip={(id: string) =>
            setCalibrationSkipped((prev) => ({ ...prev, [id]: true }))
          }
          onOpenCalibrator={(id: string) => {
            try {
              window.dispatchEvent(
                new CustomEvent("ndn:change-tab", {
                  detail: { tab: "calibrate" },
                }),
              );
            } catch {}
            // Tell parent to close the overlay so the user can calibrate
            try {
              setTimeout(() => {
                try {
                  onRequestClose?.();
                } catch {}
              }, 0);
            } catch {}
          }}
          onClose={() => {
            setShowCalibration(false);
          }}
        />
      )}
      {overlay}
    </>,
    portalElRef.current as HTMLDivElement,
  );
}
