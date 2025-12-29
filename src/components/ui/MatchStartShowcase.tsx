import { useEffect, useMemo, useState, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { getCalibrationStatus } from "../../utils/gameCalibrationRequirements";
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
import { useCameraSession } from "../../store/cameraSession";
import { useUserSettings } from "../../store/userSettings";

import { memo } from "react";

const StatBlock = memo(function StatBlock({
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
    <div className={`flex flex-col items-center gap-0 ${className}`}>
      <div className="text-[8px] opacity-70 uppercase font-bold tracking-tighter leading-none">
        {label}
      </div>
      <div
        className="text-sm sm:text-base font-black transform transition-transform duration-200 ease-out leading-none"
        style={{ transform: `scale(${scale})` }}
      >
        {value}
      </div>
    </div>
  );
});

const PlayerCalibrationPreview = memo(function PlayerCalibrationPreview({
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
  // For the local user, read from the calibration store so the UI updates
  // immediately after calibrating (and during hydration), even if the
  // playerCalibrations map hasn't been fetched/updated yet.
  const localHasH = useCalibration((s) => !!s.H);
  const isLocalPlayer = !!(
    (user?.username &&
      player?.name &&
      player.name.toLowerCase() === user.username.toLowerCase()) ||
    player?.name === "You"
  );
  const isCalibrated = isLocalPlayer ? localHasH : !!calib;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 2;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // Draw a simple dartboard circle
      // Outer circle
      if (typeof ctx.stroke === "function") {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Bullseye
      if (typeof ctx.fill === "function") {
        ctx.fillStyle = "#f00";
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    } catch (e) {
      // Canvas not supported by test environment; ignore and do nothing
    }

    // If calibrated, draw calibration points
    if (isCalibrated) {
      try {
        if (typeof ctx.fill === "function") ctx.fillStyle = "#0f0";

        // Draw some sample points (simplified)
        const points: Array<[number, number]> = [
          [centerX - radius * 0.5, centerY],
          [centerX + radius * 0.5, centerY],
          [centerX, centerY - radius * 0.5],
          [centerX, centerY + radius * 0.5],
        ];

        points.forEach(([x, y]) => {
          try {
            if (typeof ctx.beginPath === "function") ctx.beginPath();
            if (typeof ctx.arc === "function") ctx.arc(x, y, 2, 0, 2 * Math.PI);
            if (typeof ctx.fill === "function") ctx.fill();
          } catch {}
        });
      } catch (e) {
        // ignore
      }
    }
  }, [isCalibrated]);

  return (
    <div className="flex items-center gap-2 mt-1 bg-white/5 p-1.5 rounded-lg border border-white/10">
      <canvas
        ref={canvasRef}
        width={40}
        height={40}
        className="border border-white/20 rounded-md bg-black/60 shadow-inner"
      />
      <span
        className={`text-xs font-black tracking-tight ${isCalibrated ? "text-emerald-400" : "text-rose-400/70"}`}
      >
        {isCalibrated ? "Calibrated ✅" : "Not Calibrated ❌"}
      </span>
    </div>
  );
});

const RecentForm = memo(function RecentForm({
  player,
  limit = 3,
}: {
  player: Player;
  limit?: number;
}) {
  // Compute recent visit scores from player's legs, flatten last visits
  const visits: { score: number; darts: number }[] = [];
  try {
    const legs = (player.legs || []) as any[];
    for (let i = legs.length - 1; i >= 0 && visits.length < limit; i--) {
      const leg = legs[i];
      const legVisits = (leg.visits || []) as any[];
      for (let j = legVisits.length - 1; j >= 0 && visits.length < limit; j--) {
        const v = legVisits[j];
        visits.push({
          score: Number(v?.score || 0),
          darts: Number(v?.darts || 3),
        });
      }
    }
  } catch (e) {}
  if (!visits.length)
    return <div className="text-[10px] opacity-60">No visits 📉</div>;
  return (
    <div className="flex gap-1 items-center">
      {visits.map((v, idx) => (
        <div
          key={idx}
          className={`text-[10px] px-1.5 py-0.5 rounded-md font-black shadow-sm ${v.score >= 100 ? "bg-emerald-600/70 text-emerald-300 ring-1 ring-emerald-500/50" : v.score >= 60 ? "bg-amber-500/60 text-amber-300 ring-1 ring-amber-500/50" : "bg-white/20 text-gray-200 ring-1 ring-white/20"}`}
        >
          {v.score}
        </div>
      ))}
    </div>
  );
});

import FocusLock from "react-focus-lock";
import CalibrationPopup from "./CalibrationPopup";
import CameraTile from "../CameraTile";
const ProgressRing = memo(function ProgressRing({
  secondsLeft,
  totalSeconds,
  size = 60,
  stroke = 6,
  color = "emerald",
}: {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  stroke?: number;
  color?: "emerald" | "amber";
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.max(
    0,
    Math.min(1, totalSeconds > 0 ? secondsLeft / totalSeconds : 0),
  );
  const dash = circumference * (1 - percent);
  const colorHex = color === "emerald" ? "#34d399" : "#f59e0b";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="3"
            floodColor="#000"
            floodOpacity="0.45"
          />
        </filter>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="transparent"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="transparent"
        stroke={colorHex}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dash}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}
      />
      <text
        x="50%"
        y="50%"
        fill="white"
        fontSize={size * 0.28}
        fontWeight={900}
        dominantBaseline="middle"
        textAnchor="middle"
      >
        {secondsLeft > 0 ? secondsLeft : "GO"}
      </text>
    </svg>
  );
});
export default function MatchStartShowcase({
  open = true,
  players,
  user,
  onDone,
  onRequestClose,
  initialSeconds = 15,
  showCalibrationDefault = false,
  disableEscClose = false,
}: {
  open?: boolean;
  players: Player[];
  user?: any;
  onDone?: () => void;
  onRequestClose?: () => void;
  initialSeconds?: number;
  showCalibrationDefault?: boolean;
  disableEscClose?: boolean;
}) {
  // Debug logs removed
  const [seconds, setSeconds] = useState(initialSeconds || 15);
  // Overlay visibility is controlled by parent; the component should be controlled using `open` and `onRequestClose`.
  const visible = !!open;
  const cameraSession = useCameraSession();
  const setCameraEnabled = useUserSettings.getState().setCameraEnabled;
  // Subscribe only to the specific fields we need. Avoid returning a new object
  // from the selector on every store update, which can cause extra re-renders.
  const hasHomography = useCalibration((s) => !!s.H);
  const calibrationLocked = useCalibration((s) => !!s.locked);
  const calibrationConfidence = useCalibration((s) => s.confidence);
  const calibrationImageSize = useCalibration((s) => s.imageSize);
  const calibrationErrorPx = useCalibration((s) => s.errorPx);
  const localCalibration = useMemo(
    () => ({
      hasHomography,
      locked: calibrationLocked,
      confidence: calibrationConfidence,
    }),
    [hasHomography, calibrationLocked, calibrationConfidence],
  );
  const localCalibrationStatus = useMemo(
    () =>
      getCalibrationStatus({
        H: hasHomography ? (useCalibration.getState() as any).H : null,
        locked: calibrationLocked,
        imageSize: calibrationImageSize as any,
        errorPx: calibrationErrorPx as any,
      }),
    [hasHomography, calibrationLocked, calibrationImageSize, calibrationErrorPx],
  );

  const calibratedCameraLinked =
    cameraSession.isStreaming && localCalibrationStatus === "verified";
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

  // visibility is controlled by parent via `open` prop

  useEffect(() => {
    if (!visible) return;
    // Ensure the calibrated camera is enabled and streamed into the pre-match preview.
    try {
      setCameraEnabled(true);
    } catch {}
    try {
      const s = cameraSession.getMediaStream?.();
      const liveTracks = (s?.getVideoTracks?.() || []).filter(
        (t) => t.readyState === "live",
      );

      // If a stream already exists, mark streaming on so other UI surfaces attach immediately.
      if (s && liveTracks.length > 0 && !cameraSession.isStreaming) {
        cameraSession.setStreaming(true);
      }

      // Hard-start nudge: if we DON'T have a live stream yet, try to kick the
      // registered video element into playing. This covers timing cases where
      // the tile mounts but autoplay needs a user gesture / play() call.
      if (!s || liveTracks.length === 0) {
        const v = cameraSession.getVideoElementRef?.();
        if (v) {
          v.muted = true;
          (v as any).playsInline = true;
          Promise.resolve(v.play()).catch(() => {});
        }
      }
      cameraSession.setShowOverlay?.(true);
    } catch {}
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
    try {
      if (appRoot) appRoot.setAttribute("aria-hidden", "true");
    } catch {}
    // Countdown interval:
    // - create only when needed
    // - stop at 0 to avoid going negative (which causes useless re-renders)
    const t = allPlayersSkipped
      ? setInterval(() =>
          setSeconds((s) => {
            if (s <= 0) return 0;
            return s - 1;
          }),
        1000)
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
  }, [visible, disableEscClose, onRequestClose, allPlayersSkipped]);

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
            const { H, imageSize, overlaySize, locked } =
              useCalibration.getState();
            // Treat local calibration as valid when we have a homography.
            // `locked` is a workflow/UI flag and shouldn't cause the pre-match UI to say "Not Calibrated".
            if (H) calibs[player.name] = { H, imageSize, overlaySize, locked };
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
          const lifetimeScored = all.scored || 0;
          const lifetimeDarts = all.darts || 0;
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
            lifetimeScored,
            lifetimeDarts,
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
            lifetimeScored: 0,
            lifetimeDarts: 0,
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

  // These hooks must run even when the overlay is not visible to avoid hook-order
  // mismatches if `open` toggles quickly during tests.
  const getScaleFor = useCallback((s: number) => {
    if (s <= 0) return 1.8;
    if (s === 1) return 1.6;
    if (s === 2) return 1.4;
    if (s === 3) return 1.2;
    return 1;
  }, []);

  const calibrationConfidencePercent = useMemo(() => {
    const confidence = localCalibration.confidence as
      | number
      | null
      | { percentage?: number };
    if (typeof confidence === "number") return confidence;
    if (
      confidence &&
      typeof confidence === "object" &&
      typeof confidence.percentage === "number"
    ) {
      return confidence.percentage;
    }
    return null;
  }, [localCalibration.confidence]);

  const calibrationStatusText = calibratedCameraLinked
    ? typeof calibrationConfidencePercent === "number"
      ? `Calibrated camera linked • ${calibrationConfidencePercent.toFixed(0)}% confidence`
      : "Calibrated camera linked (quality unknown)"
    : localCalibration.hasHomography
      ? "Calibration quality unknown (finish calibrating to link)"
      : "Calibrate to link this camera feed";

  if (!visible) return null;

  // Render the extracted CalibrationPopup component, passing required handlers

  // calibrationStatusText defined above

  const overlay = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-start-heading"
          tabIndex={-1}
          className="w-full max-w-4xl"
        >
          <FocusLock returnFocus={true}>
            <div ref={hostRef} className="relative">
            {/* Decorative background glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-emerald-500/20 rounded-[3rem] blur-3xl -z-10 opacity-50 animate-pulse" />

            <div className="bg-[#13111C] border border-white/10 rounded-3xl p-4 md:p-6 w-full shadow-2xl ring-1 ring-white/5 relative overflow-hidden">
              {/* Background pattern */}
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>

              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-3 mb-4 border-b border-white/5 pb-3">
                <div>
                  <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-0.5">
                    Get Ready 🚀
                  </div>
                  <div
                    id="match-start-heading"
                    className="text-2xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/10 tracking-tighter"
                  >
                    Match Starting Soon 🎯
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="absolute inset-0 bg-emerald-500/70 blur-[4rem] rounded-full animate-pulse"></div>
                      <div className="relative">
                        <ProgressRing
                          secondsLeft={seconds}
                          totalSeconds={initialSeconds || 15}
                          size={60}
                          stroke={6}
                          color={seconds > 5 ? "emerald" : "amber"}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-black text-white tabular-nums">
                            {seconds}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 sm:flex-row">
                    <button
                      ref={startNowRef}
                      className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105 transition-all duration-200 active:scale-95 text-xs"
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
                      Start Now ▶️
                    </button>
                    <button
                      ref={closeRef}
                      className="px-3 py-1.5 rounded-lg bg-white/5 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors text-xs"
                      aria-label="Close match start showcase"
                      onClick={() => {
                        try {
                          onRequestClose?.();
                        } catch {}
                      }}
                    >
                      Close ✖️
                    </button>
                  </div>
                </div>
              </div>

              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 mb-4">
                {/* VS Badge for Desktop */}
                <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-16 h-16 bg-[#13111C] rounded-full items-center justify-center border-2 border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                  <span className="text-xl font-black text-white/20 italic tracking-tighter">
                    VS ⚔️
                  </span>
                </div>

                {stats.map((st, idx) => (
                  <div
                    key={st.id}
                    className={`group relative p-3 md:p-4 rounded-3xl border border-white/5 flex flex-col items-center shadow-xl transition-all duration-300 hover:border-white/10 hover:bg-white/[0.02] max-h-[80vh] overflow-hidden ${idx === 0 ? "bg-gradient-to-br from-indigo-500/5 to-transparent" : "bg-gradient-to-bl from-emerald-500/5 to-transparent"}`}
                  >
                    <div className="flex items-center gap-3 mb-2 w-full">
                      <div
                        className={`w-12 h-12 shrink-0 rounded-xl rotate-3 group-hover:rotate-6 transition-transform duration-300 flex items-center justify-center text-xl font-black text-white shadow-lg ring-2 ring-white/10 ${idx === 0 ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/50" : "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/50"}`}
                      >
                        {st.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="text-2xl font-black text-white tracking-tighter truncate">
                          {st.name}
                        </div>
                        <div className="text-[10px] font-black tracking-tight text-white/60">
                          {st.one80s}
                        </div>
                        <div className="flex items-center gap-2">
                          {user && user.username === st.name && (
                            <div className="text-[0.5rem] font-bold uppercase tracking-wider bg-white/10 text-white/60 px-1.5 py-0.5 rounded-md">
                              You ⭐
                            </div>
                          )}
                          <PlayerCalibrationPreview
                            player={players.find((p) => p.id === st.id) as any}
                            user={user}
                            playerCalibrations={playerCalibrations}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1 w-full bg-black/50 rounded-xl p-2 border border-white/10 shadow-2xl">
                      <StatBlock
                        label="Avg 📊"
                        value={st.avg3}
                        scale={getScaleFor(seconds) * 0.7}
                        className="p-0.5"
                      />
                      <StatBlock
                        label="F9 📈"
                        value={st.best9}
                        scale={getScaleFor(seconds) * 0.7}
                        className="p-0.5"
                      />
                      <StatBlock
                        label="CO 🏆"
                        value={st.bestCheckout || "—"}
                        scale={getScaleFor(seconds) * 0.7}
                        className="p-0.5"
                      />
                      <StatBlock
                        label="Leg ⚡"
                        value={st.bestLeg || "—"}
                        scale={getScaleFor(seconds) * 0.7}
                        className="p-0.5"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 w-full mt-2 text-[0.6rem]">
                      <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                        <span className="tracking-widest uppercase text-white/40">
                          Lifetime pts
                        </span>
                        <span className="text-white/90 font-semibold">
                          {st.lifetimeScored.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                        <span className="tracking-widest uppercase text-white/40">
                          Lifetime darts
                        </span>
                        <span className="text-white/90 font-semibold">
                          {st.lifetimeDarts.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between w-full px-1">
                      <div className="flex items-center gap-2 text-sm text-white/40 font-black">
                        <span>180s 🔥:</span>
                        <span className="text-white/90">{st.one80s} ✨</span>
                      </div>
                      <RecentForm
                        player={players.find((p) => p.id === st.id) as Player}
                        limit={3}
                      />
                    </div>

                    {/* Pre-match live camera preview (uses the global camera session) */}
                    {idx === 0 && (
                      <div className="w-full mt-2">
                        <div className="rounded-lg overflow-hidden border border-white/10 bg-black/30 relative">
                          <div
                            className={`absolute top-3 left-3 px-3 py-1 rounded-full text-[0.6rem] font-bold tracking-wide uppercase shadow-lg ${calibratedCameraLinked ? "bg-emerald-500/90 text-emerald-50" : "bg-rose-500/80 text-white"}`}
                          >
                            {calibrationStatusText}
                          </div>
                          {/* Show the full board (no crop) */}
                          <div className="w-full h-[240px] sm:h-[300px] md:h-[360px] flex flex-col">
                            <CameraTile
                              autoStart
                              forceAutoStart
                              fill
                              aspect="free"
                              tileFitModeOverride="fit"
                              scale={1}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="text-center pt-6 border-t border-white/50">
                {seconds <= 1 ? (
                  <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 animate-bounce tracking-tighter py-4">
                    GAME ON! 🚀
                  </div>
                ) : (
                  <div className="text-lg font-black text-white/80 uppercase tracking-[1em]">
                    {players.map((p) => p.name).join(" vs ")} ⚔️
                  </div>
                )}
              </div>
            </div>
          </div>
        </FocusLock>
      </div>
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
            setCalibrationSkipped((prev) => ({ ...prev, [id]: false }));
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
