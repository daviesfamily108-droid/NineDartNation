import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import CameraTile from "../CameraTile.js";
import {
  getAllTimeAvg,
  getAllTimeFirstNineAvg,
  getAllTimeBestCheckout,
  getAllTimeBestLeg,
  getAllTime,
  getAllTime180s,
  getHeadToHeadLegDiff,
} from "../../store/profileStats.js";
import {
  Target,
  Trophy,
  Zap,
  Crown,
  Timer,
  ArrowRight,
  X,
  BarChart2,
  Camera,
} from "lucide-react";

/* ── Board constants ─────────────────────────────────────────────── */
const BOARD_SIZE = 400;
const CX = BOARD_SIZE / 2;
const CY = BOARD_SIZE / 2;
const BULL_INNER_R = 6.35;
const BULL_OUTER_R = 15.9;
const TREBLE_INNER_R = 99;
const TREBLE_OUTER_R = 107;
const DOUBLE_INNER_R = 162;
const DOUBLE_OUTER_R = 170;
const SCALE = (BOARD_SIZE / 2 - 15) / DOUBLE_OUTER_R;

const SECTOR_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];

const SECTOR_COLORS: Record<number, { dark: string; light: string }> = {};
SECTOR_ORDER.forEach((s, i) => {
  SECTOR_COLORS[s] =
    i % 2 === 0
      ? { dark: "#1a1a2e", light: "#c0392b" }
      : { dark: "#f0e6d3", light: "#27ae60" };
});

/* ── Types ────────────────────────────────────────────────────────── */
export type MatchPrestartProps = {
  open: boolean;
  matchInfo: {
    id: string;
    game: string;
    modeType: string;
    legs: number;
    startingScore?: number;
    createdBy?: string;
    creatorName?: string;
    firstThrowerId?: string;
    firstThrowerName?: string;
  } | null;
  localUser: { username: string; email?: string; [k: string]: any } | null;
  opponentName: string;
  opponentStats?: {
    avg3?: string;
    best9?: string;
    bestCheckout?: string | number;
    bestLeg?: string | number;
    career180s?: number;
  } | null;
  countdown?: number;
  onChoice: (choice: "bull" | "skip") => void;
  onBullThrow: (distanceMm: number) => void;
  onAccept: () => void;
  onCancel: () => void;
  /** Remote player's choice (legacy — unused in RPS flow) */
  remoteChoice?: "bull" | "skip" | null;
  /** Whether the bull-up phase is active (legacy) */
  bullActive?: boolean;
  /** Winner of the bull-up (legacy) */
  bullWinner?: string | null;
  /** Whether the bull-up tied (legacy) */
  bullTied?: boolean;
};

/* ── Helpers ──────────────────────────────────────────────────────── */
function getPlayerStats(name: string) {
  try {
    const avg3 = getAllTimeAvg(name).toFixed(1);
    const best9 = getAllTimeFirstNineAvg(name).toFixed(1);
    const bestCheckout = getAllTimeBestCheckout(name);
    const bestLeg = getAllTimeBestLeg(name);
    const all = getAllTime(name);
    const career180s = getAllTime180s(name);
    return {
      avg3,
      best9,
      bestCheckout: bestCheckout || "–",
      bestLeg: bestLeg || "–",
      lifetimeScored: all.scored || 0,
      lifetimeDarts: all.darts || 0,
      career180s: career180s || 0,
    };
  } catch {
    return {
      avg3: "0.0",
      best9: "0.0",
      bestCheckout: "–",
      bestLeg: "–",
      lifetimeScored: 0,
      lifetimeDarts: 0,
      career180s: 0,
    };
  }
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function distFromBull(x: number, y: number): number {
  const dx = x - CX;
  const dy = y - CY;
  return Math.sqrt(dx * dx + dy * dy) / SCALE;
}

/* ── Stat pill ────────────────────────────────────────────────────── */
function StatPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center px-1.5 py-1 rounded-lg ${highlight ? "bg-indigo-500/20 ring-1 ring-indigo-500/30" : "bg-white/5"}`}
    >
      <span className="text-[7px] sm:text-[8px] uppercase tracking-wider font-bold text-white/50">
        {label}
      </span>
      <span
        className={`text-xs sm:text-sm font-black ${highlight ? "text-indigo-300" : "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Interactive dartboard SVG ────────────────────────────────────── */
function DartboardBullUp({
  onSelect,
  selectedPoint,
  disabled,
  label,
}: {
  onSelect: (x: number, y: number, distMm: number) => void;
  selectedPoint: { x: number; y: number } | null;
  disabled?: boolean;
  label?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const coordsFromEvent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * BOARD_SIZE;
    const y = ((clientY - rect.top) / rect.height) * BOARD_SIZE;
    const dist = distFromBull(x, y);
    return { x, y, dist: Math.round(dist * 10) / 10 };
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (disabled) return;
      const c = coordsFromEvent(e.clientX, e.clientY);
      if (c) onSelect(c.x, c.y, c.dist);
    },
    [onSelect, disabled, coordsFromEvent],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (disabled) return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      if (!touch) return;
      const c = coordsFromEvent(touch.clientX, touch.clientY);
      if (c) onSelect(c.x, c.y, c.dist);
    },
    [onSelect, disabled, coordsFromEvent],
  );

  // Build sector paths
  const sectorPaths = useMemo(() => {
    const paths: React.ReactNode[] = [];
    const degPerSector = 18;

    for (let i = 0; i < 20; i++) {
      const sector = SECTOR_ORDER[i];
      const startAngle = i * degPerSector - degPerSector / 2;
      const endAngle = startAngle + degPerSector;
      const colors = SECTOR_COLORS[sector];

      // Each sector has: outer single, double, inner single, treble
      const rings = [
        {
          inner: TREBLE_OUTER_R,
          outer: DOUBLE_INNER_R,
          fill: colors.dark,
        },
        {
          inner: DOUBLE_INNER_R,
          outer: DOUBLE_OUTER_R,
          fill: colors.light,
        },
        {
          inner: BULL_OUTER_R,
          outer: TREBLE_INNER_R,
          fill: colors.dark,
        },
        {
          inner: TREBLE_INNER_R,
          outer: TREBLE_OUTER_R,
          fill: colors.light,
        },
      ];

      rings.forEach((ring, ri) => {
        const r1 = ring.inner * SCALE;
        const r2 = ring.outer * SCALE;
        const p1 = polarToXY(CX, CY, r1, startAngle);
        const p2 = polarToXY(CX, CY, r2, startAngle);
        const p3 = polarToXY(CX, CY, r2, endAngle);
        const p4 = polarToXY(CX, CY, r1, endAngle);
        const largeArc = degPerSector > 180 ? 1 : 0;
        const d = [
          `M ${p1.x} ${p1.y}`,
          `L ${p2.x} ${p2.y}`,
          `A ${r2} ${r2} 0 ${largeArc} 1 ${p3.x} ${p3.y}`,
          `L ${p4.x} ${p4.y}`,
          `A ${r1} ${r1} 0 ${largeArc} 0 ${p1.x} ${p1.y}`,
          "Z",
        ].join(" ");
        paths.push(
          <path
            key={`s${sector}-r${ri}`}
            d={d}
            fill={ring.fill}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.5}
            opacity={0.85}
          />,
        );
      });

      // Number label
      const labelPos = polarToXY(
        CX,
        CY,
        (DOUBLE_OUTER_R + 12) * SCALE,
        i * degPerSector,
      );
      paths.push(
        <text
          key={`label-${sector}`}
          x={labelPos.x}
          y={labelPos.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.8)"
          fontSize="11"
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
        >
          {sector}
        </text>,
      );
    }

    return paths;
  }, []);

  return (
    <div className="relative">
      {label && (
        <div className="text-center mb-2">
          <span
            className={`text-xs font-bold uppercase tracking-widest ${
              disabled && selectedPoint ? "text-emerald-400" : "text-white/50"
            }`}
          >
            {label}
          </span>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
        className={`w-full h-full touch-none select-none ${
          disabled ? "pointer-events-none" : "cursor-crosshair"
        }`}
        style={{ opacity: disabled && !selectedPoint ? 0.5 : 1 }}
        onClick={handleClick}
        onTouchEnd={handleTouch}
      >
        {/* Background */}
        <circle cx={CX} cy={CY} r={CX} fill="#0a0a1a" />

        {/* Sector paths */}
        {sectorPaths}

        {/* Wire rings for realism */}
        <circle
          cx={CX}
          cy={CY}
          r={TREBLE_INNER_R * SCALE}
          fill="none"
          stroke="rgba(192,192,192,0.15)"
          strokeWidth={0.8}
        />
        <circle
          cx={CX}
          cy={CY}
          r={TREBLE_OUTER_R * SCALE}
          fill="none"
          stroke="rgba(192,192,192,0.15)"
          strokeWidth={0.8}
        />
        <circle
          cx={CX}
          cy={CY}
          r={DOUBLE_INNER_R * SCALE}
          fill="none"
          stroke="rgba(192,192,192,0.15)"
          strokeWidth={0.8}
        />
        <circle
          cx={CX}
          cy={CY}
          r={DOUBLE_OUTER_R * SCALE}
          fill="none"
          stroke="rgba(192,192,192,0.2)"
          strokeWidth={1}
        />

        {/* Bull outer (green) */}
        <circle
          cx={CX}
          cy={CY}
          r={BULL_OUTER_R * SCALE}
          fill="#27ae60"
          stroke="rgba(192,192,192,0.2)"
          strokeWidth={0.8}
        />
        {/* Bull inner (red) */}
        <circle
          cx={CX}
          cy={CY}
          r={BULL_INNER_R * SCALE}
          fill="#c0392b"
          stroke="rgba(192,192,192,0.2)"
          strokeWidth={0.8}
        />

        {/* Pulsing bullseye guide when no dart placed */}
        {!selectedPoint && !disabled && (
          <circle
            cx={CX}
            cy={CY}
            r={BULL_OUTER_R * SCALE * 1.8}
            fill="none"
            stroke="rgba(234,179,8,0.4)"
            strokeWidth={1.5}
            strokeDasharray="4,4"
          >
            <animate
              attributeName="r"
              values={`${BULL_OUTER_R * SCALE * 1.5};${BULL_OUTER_R * SCALE * 2.2};${BULL_OUTER_R * SCALE * 1.5}`}
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.5;0.15;0.5"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
        )}

        {/* Crosshair at center */}
        <line
          x1={CX - 6}
          y1={CY}
          x2={CX + 6}
          y2={CY}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={0.5}
        />
        <line
          x1={CX}
          y1={CY - 6}
          x2={CX}
          y2={CY + 6}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={0.5}
        />

        {/* Selected dart position */}
        {selectedPoint && (
          <>
            {/* Line from bull to dart */}
            <line
              x1={CX}
              y1={CY}
              x2={selectedPoint.x}
              y2={selectedPoint.y}
              stroke={disabled ? "rgba(34,197,94,0.6)" : "rgba(234,179,8,0.5)"}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            {/* Dart shadow */}
            <circle
              cx={selectedPoint.x + 1}
              cy={selectedPoint.y + 1}
              r={6}
              fill="rgba(0,0,0,0.4)"
            />
            {/* Dart marker - green when locked, yellow when editable */}
            <circle
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              r={6}
              fill={disabled ? "#22c55e" : "#eab308"}
              stroke="#fff"
              strokeWidth={2}
              className="drop-shadow-lg"
            />
            <circle
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              r={2.5}
              fill="#fff"
            />
            {/* Lock icon indicator when locked */}
            {disabled && (
              <text
                x={selectedPoint.x}
                y={selectedPoint.y - 14}
                textAnchor="middle"
                fill="#22c55e"
                fontSize="10"
                fontWeight="bold"
              >
                🔒
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

/* ── Player Card ──────────────────────────────────────────────────── */
function PlayerCard({
  name,
  stats,
  isLocal,
  showCamera,
  isWinner,
  legDiff,
}: {
  name: string;
  stats: ReturnType<typeof getPlayerStats>;
  isLocal: boolean;
  showCamera?: boolean;
  isWinner?: boolean;
  legDiff?: number | null;
}) {
  const legDiffValue =
    typeof legDiff === "number" ? `${legDiff > 0 ? "+" : ""}${legDiff}` : null;
  return (
    <div
      className={`relative rounded-xl border p-2 sm:p-3 transition-all duration-500 ${
        isWinner
          ? "border-amber-400/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5 shadow-xl shadow-amber-500/10 ring-1 ring-amber-400/30"
          : "border-white/10 bg-white/5"
      }`}
    >
      {isWinner && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">
          <Crown className="w-2.5 h-2.5 inline mr-0.5" />
          Throws First
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
            isLocal
              ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
              : "bg-gradient-to-br from-rose-500 to-orange-500 text-white"
          }`}
        >
          {name.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="font-bold text-white text-sm sm:text-base tracking-tight">
            {name}
          </div>
          <div className="text-[9px] text-white/50 font-semibold uppercase tracking-wider">
            {isLocal ? "You" : "Opponent"}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        <StatPill label="Avg" value={stats.avg3} highlight />
        <StatPill label="F9" value={stats.best9} />
        <StatPill label="CO" value={String(stats.bestCheckout)} />
        <StatPill label="Leg Diff" value={legDiffValue ?? "0"} />
      </div>

      <div className="grid grid-cols-3 gap-1 text-[9px]">
        <div className="flex items-center justify-between px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/5">
          <span className="text-white/50">180s</span>
          <span className="font-bold text-white">{stats.career180s}</span>
        </div>
        <div className="flex items-center justify-between px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/5">
          <span className="text-white/50">Scored</span>
          <span className="font-bold text-white">
            {stats.lifetimeScored.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/5">
          <span className="text-white/50">Darts</span>
          <span className="font-bold text-white">
            {stats.lifetimeDarts.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Camera preview */}
      {showCamera && (
        <div className="mt-2 rounded-lg overflow-hidden border border-white/10 bg-black/40">
          <div className="px-2 py-1 flex items-center gap-1.5 text-[9px] text-white/60 border-b border-white/5">
            <Camera className="w-2.5 h-2.5" />
            <span className="font-semibold uppercase tracking-wider">
              {isLocal ? "Your Camera" : "Opponent Camera"}
            </span>
            <span className="ml-auto text-emerald-400 font-bold">● Live</span>
          </div>
          <div className="aspect-video relative bg-black">
            {isLocal ? (
              <CameraTile
                autoStart
                forceAutoStart
                fill
                aspect="free"
                tileFitModeOverride="fit"
                scale={1}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px]">
                <div className="text-center">
                  <Camera className="w-6 h-6 mx-auto mb-1 opacity-30" />
                  Waiting for opponent's feed…
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function MatchPrestart({
  open,
  matchInfo,
  localUser,
  opponentName,
  opponentStats,
  countdown = 15,
  onChoice: _onChoice,
  onBullThrow: _onBullThrow,
  onAccept,
  onCancel,
  remoteChoice: _remoteChoice,
  bullActive: _bullActive,
  bullWinner: _bullWinner,
  bullTied: _bullTied,
}: MatchPrestartProps) {
  const [seconds, setSeconds] = useState(countdown);
  const [phase, setPhase] = useState<"preview" | "rps" | "result" | "go">(
    "preview",
  );
  const [rpsStep, setRpsStep] = useState(0); // 0-2 cycling, 3 = revealed
  const [localRps, setLocalRps] = useState<"rock" | "paper" | "scissors">(
    "rock",
  );
  const [opponentRps, setOpponentRps] = useState<"rock" | "paper" | "scissors">(
    "rock",
  );
  const portalElRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" ? document.createElement("div") : null,
  );

  const RPS_ICONS: Record<string, string> = {
    rock: "✊",
    paper: "✋",
    scissors: "✌️",
  };
  const RPS_LABELS: Record<string, string> = {
    rock: "Rock",
    paper: "Paper",
    scissors: "Scissors",
  };
  const RPS_OPTIONS: Array<"rock" | "paper" | "scissors"> = [
    "rock",
    "paper",
    "scissors",
  ];

  const localStats = useMemo(
    () => getPlayerStats(localUser?.username || ""),
    [localUser?.username],
  );
  const oppStats = useMemo(() => {
    if (opponentStats) {
      return {
        avg3: opponentStats.avg3 || "0.0",
        best9: opponentStats.best9 || "0.0",
        bestCheckout: opponentStats.bestCheckout || "–",
        bestLeg: opponentStats.bestLeg || "–",
        career180s: opponentStats.career180s || 0,
        lifetimeScored: 0,
        lifetimeDarts: 0,
      };
    }
    return getPlayerStats(opponentName);
  }, [opponentName, opponentStats]);

  // Portal
  useEffect(() => {
    const el = portalElRef.current;
    if (!el || typeof document === "undefined") return;
    el.className = "ndn-match-prestart-portal";
    document.body.appendChild(el);
    return () => {
      try {
        el.parentNode?.removeChild(el);
      } catch {}
    };
  }, []);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSeconds(countdown);
    setPhase("preview");
    setRpsStep(0);
  }, [open, countdown]);

  // Preview → RPS auto-transition after 4 seconds
  useEffect(() => {
    if (!open || phase !== "preview") return;
    const t = setTimeout(() => setPhase("rps"), 4000);
    return () => clearTimeout(t);
  }, [open, phase]);

  // RPS cycling animation (rock → paper → scissors → rock...) for 3 seconds then reveal
  useEffect(() => {
    if (!open || phase !== "rps") return;
    setRpsStep(0);
    let step = 0;
    const cycleInterval = setInterval(() => {
      step++;
      if (step >= 9) {
        // After cycling 3 times (9 steps), reveal the result
        clearInterval(cycleInterval);
        // Pick random cosmetic RPS choices for the reveal
        const localPick = RPS_OPTIONS[Math.floor(Math.random() * 3)];
        const opponentPick = RPS_OPTIONS[Math.floor(Math.random() * 3)];
        setLocalRps(localPick);
        setOpponentRps(opponentPick);
        setRpsStep(3); // revealed
        // Transition to result after a brief pause
        setTimeout(() => setPhase("result"), 1500);
      } else {
        setLocalRps(RPS_OPTIONS[step % 3]);
        setOpponentRps(RPS_OPTIONS[(step + 1) % 3]);
        setRpsStep(step);
      }
    }, 350);
    return () => clearInterval(cycleInterval);
  }, [open, phase]);

  // Result → GO transition
  useEffect(() => {
    if (phase !== "result") return;
    const t = setTimeout(() => setPhase("go"), 3000);
    return () => clearTimeout(t);
  }, [phase]);

  // Auto-accept when "go" phase completes
  useEffect(() => {
    if (phase !== "go") return;
    const t = setTimeout(() => {
      onAccept();
    }, 1500);
    return () => clearTimeout(t);
  }, [phase, onAccept]);

  // Countdown timer for preview
  useEffect(() => {
    if (!open || phase !== "preview") return;
    const id = window.setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, phase]);

  const localName = localUser?.username || "You";
  const headToHead = useMemo(
    () => getHeadToHeadLegDiff(localName, opponentName),
    [localName, opponentName],
  );
  const localLegDiff = headToHead.played ? headToHead.diffA : null;
  const opponentLegDiff = headToHead.played ? headToHead.diffB : null;

  if (!open || !portalElRef.current || !matchInfo) return null;

  // Determine who throws first from server-provided firstThrowerName
  const firstThrowerName =
    matchInfo.firstThrowerName ||
    matchInfo.createdBy ||
    matchInfo.creatorName ||
    localName;
  const isLocalWinner =
    firstThrowerName.toLowerCase() === localName.toLowerCase();
  const isOpponentWinner =
    firstThrowerName.toLowerCase() === opponentName.toLowerCase();

  const overlay = (
    <div
      className="fixed inset-0 z-[9998] bg-black/95 backdrop-blur-xl flex flex-col"
      style={{ height: "100dvh", maxHeight: "100dvh", overflow: "hidden" }}
      role="dialog"
      aria-modal="true"
      aria-label="Match pre-start"
    >
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
      </div>

      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0">
        <div className="relative w-full max-w-5xl max-h-full flex flex-col">
          {/* Close button */}
          <button
            className="absolute -top-2 -right-2 z-20 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/10"
            onClick={onCancel}
            aria-label="Cancel match"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Match info header */}
          <div className="text-center mb-2 sm:mb-4 flex-shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">
              <Target className="w-3 h-3" />
              {matchInfo.game} ·{" "}
              {matchInfo.modeType === "bestof" ? "Best Of" : "First To"}{" "}
              {matchInfo.legs} · {matchInfo.startingScore || 501}
            </div>

            {phase === "preview" && (
              <div className="animate-in fade-in duration-500">
                <h2 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50 tracking-tighter">
                  Match Found
                </h2>
                <p className="text-xs sm:text-sm text-white/50 mt-0.5">
                  Reviewing opponent stats…
                </p>
              </div>
            )}

            {phase === "rps" && (
              <div className="animate-in fade-in duration-500">
                <h2 className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tighter">
                  ✊ Rock Paper Scissors! ✌️
                </h2>
                <p className="text-xs sm:text-sm text-white/50 mt-0.5">
                  Deciding who throws first…
                </p>
              </div>
            )}

            {phase === "result" && (
              <div className="animate-in fade-in zoom-in-95 duration-700">
                <h2 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-amber-500 tracking-tighter">
                  🎉 {firstThrowerName} Throws First!
                </h2>
                <p className="text-xs sm:text-sm text-white/50 mt-1">
                  {firstThrowerName} won the coin toss
                </p>
              </div>
            )}

            {phase === "go" && (
              <div className="animate-in fade-in zoom-in-50 duration-300">
                <h2 className="text-5xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-emerald-500 tracking-tighter">
                  GO!
                </h2>
              </div>
            )}
          </div>

          {/* Timer bar */}
          {phase === "preview" && (
            <div className="mb-2 sm:mb-4 flex-shrink-0">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Timer className="w-3 h-3 sm:w-4 sm:h-4 text-white/40" />
                <span className="text-xl sm:text-2xl font-black text-white tabular-nums">
                  {seconds}
                </span>
                <span className="text-[10px] sm:text-xs text-white/40 font-semibold">
                  seconds
                </span>
              </div>
              <div className="h-0.5 sm:h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${(seconds / countdown) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Player cards + VS */}
          {(phase === "preview" || phase === "rps" || phase === "result") && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-2 sm:gap-4 items-start mb-2 sm:mb-4 flex-shrink-0">
              <PlayerCard
                name={localName}
                stats={localStats}
                isLocal
                showCamera={phase === "preview"}
                legDiff={localLegDiff}
                isWinner={phase === "result" && isLocalWinner}
              />

              {/* VS divider */}
              <div className="hidden md:flex flex-col items-center justify-center py-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-xl shadow-xl shadow-indigo-500/30 ring-2 ring-white/10">
                  VS
                </div>
                <div className="w-px h-12 bg-gradient-to-b from-indigo-500/30 to-transparent mt-2" />
              </div>
              <div className="flex md:hidden items-center justify-center py-2">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-xl shadow-indigo-500/30">
                  VS
                </div>
              </div>

              <PlayerCard
                name={opponentName}
                stats={oppStats}
                isLocal={false}
                showCamera={phase === "preview"}
                legDiff={opponentLegDiff}
                isWinner={phase === "result" && isOpponentWinner}
              />
            </div>
          )}

          {/* RPS Animation */}
          {phase === "rps" && (
            <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500 flex-shrink-0">
              <div className="flex items-center justify-center gap-8 sm:gap-12">
                {/* Local player RPS */}
                <div className="text-center">
                  <div
                    className={`text-6xl sm:text-7xl transition-transform duration-200 ${rpsStep < 3 ? "animate-bounce" : "scale-110"}`}
                  >
                    {RPS_ICONS[localRps]}
                  </div>
                  <div className="text-xs text-white/50 mt-2 font-semibold">
                    {localName}
                  </div>
                  {rpsStep >= 3 && (
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {RPS_LABELS[localRps]}
                    </div>
                  )}
                </div>

                {/* VS */}
                <div className="flex flex-col items-center gap-1">
                  <div className="text-2xl sm:text-3xl font-black text-white/30">
                    VS
                  </div>
                  {rpsStep < 3 && (
                    <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  )}
                </div>

                {/* Opponent RPS */}
                <div className="text-center">
                  <div
                    className={`text-6xl sm:text-7xl transition-transform duration-200 ${rpsStep < 3 ? "animate-bounce" : "scale-110"}`}
                  >
                    {RPS_ICONS[opponentRps]}
                  </div>
                  <div className="text-xs text-white/50 mt-2 font-semibold">
                    {opponentName}
                  </div>
                  {rpsStep >= 3 && (
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {RPS_LABELS[opponentRps]}
                    </div>
                  )}
                </div>
              </div>

              {rpsStep >= 3 && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-400/30 text-sm text-amber-200 font-semibold animate-in fade-in zoom-in-95 duration-500">
                  <Zap className="w-4 h-4 text-amber-400" />
                  {firstThrowerName} throws first!
                </div>
              )}
            </div>
          )}

          {/* Preview cancel button */}
          {phase === "preview" && (
            <div className="flex items-center justify-center mt-2 sm:mt-4 flex-shrink-0">
              <button
                className="px-4 sm:px-6 py-2 sm:py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 font-semibold text-sm sm:text-base hover:bg-white/10 transition-all"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, portalElRef.current);
}
