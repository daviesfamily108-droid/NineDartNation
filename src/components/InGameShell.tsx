import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CameraView from "./CameraView.js";
import GameScoreboard from "./scoreboards/GameScoreboard.js";
import { useOnlineGameStats } from "./scoreboards/useGameStats.js";
import { useMatch } from "../store/match.js";
import { useMatchControl } from "../store/matchControl.js";
import { usePendingVisit } from "../store/pendingVisit.js";
import PauseTimerBadge from "./ui/PauseTimerBadge.js";
import PauseQuitModal from "./ui/PauseQuitModal.js";
import PauseOverlay from "./ui/PauseOverlay.js";
import { useUserSettings } from "../store/userSettings.js";
import MatchStartShowcase from "./ui/MatchStartShowcase.js";
import { suggestCheckouts, sayScore } from "../utils/checkout.js";
import { getPreferredUserName } from "../utils/userName.js";
import LetterboxScoreboardOverlay from "./ui/LetterboxScoreboardOverlay.js";
import { broadcastMessage } from "../utils/broadcast.js";

export default function InGameShell({
  user,
  showStartShowcase: showStartShowcaseProp,
  onShowStartShowcaseChange,
  onCommitVisit,
  onQuit: onQuitProp,
  onStateChange,
  localPlayerIndexOverride,
  gameModeOverride,
  isOnline,
}: {
  user: any;
  showStartShowcase?: boolean;
  onShowStartShowcaseChange?: (open: boolean) => void;
  /** Override default visit commit (for online WS sync). */
  onCommitVisit?: (score: number, darts: number, meta?: any) => void;
  /** Override default quit behaviour. */
  onQuit?: () => void;
  /** Called after any match state mutation for external sync. */
  onStateChange?: () => void;
  /** Explicit local player index for online (skips name matching). */
  localPlayerIndexOverride?: number;
  /** Override game mode label (e.g. online tracks currentGame separately). */
  gameModeOverride?: string;
  /** True when this is an online match — adds visual indicators. */
  isOnline?: boolean;
}) {
  const match = useMatch();
  useUserSettings((s: any) => s.hideInGameSidebar ?? true);
  useMatchControl((s: any) => s.setPaused);
  useMatchControl();
  usePendingVisit();

  const [winningShot, setWinningShot] = useState<{
    label?: string;
    ring?: string;
    frame?: string | null;
    ts?: number;
  } | null>(null);
  const [remoteFrame] = useState<string | null>(null);

  const lastOfflineStart = useUserSettings(
    (s: any) => s.lastOffline?.x01Start || 501,
  );

  const settingsUser = useUserSettings((s: any) => s.user);
  const localPlayerName =
    getPreferredUserName(user, "") ||
    getPreferredUserName(settingsUser, "") ||
    user?.email?.split("@")[0] ||
    settingsUser?.email?.split("@")[0] ||
    "You";

  const resolvedLocalIndex =
    typeof localPlayerIndexOverride === "number" &&
    localPlayerIndexOverride >= 0
      ? localPlayerIndexOverride
      : (match.players || []).findIndex(
          (p: any) => p?.name && p.name === localPlayerName,
        );
  const localPlayerIndex = resolvedLocalIndex >= 0 ? resolvedLocalIndex : 0;
  const isUsersTurn = (match.currentPlayerIdx ?? 0) === localPlayerIndex;

  const localPlayer = match.players?.[localPlayerIndex];
  const localLeg = localPlayer?.legs?.[localPlayer.legs.length - 1];
  const localRemaining =
    localLeg?.totalScoreRemaining ?? match.startingScore ?? lastOfflineStart;
  const awayIdx = (match.players || []).findIndex(
    (_p: any, idx: number) => idx !== localPlayerIndex,
  );
  const awayPlayer = (match.players || [])[awayIdx >= 0 ? awayIdx : 0];
  const awayLeg = awayPlayer?.legs?.[awayPlayer.legs.length - 1];
  const awayRemaining =
    awayLeg?.totalScoreRemaining ?? match.startingScore ?? lastOfflineStart;

  // Compute per-player stats for hero banner (last visit, 3-dart average)
  const playerStats = useMemo(() => {
    const compute = (p: any) => {
      if (!p) return { lastVisit: 0, avg3: 0 };
      let pts = 0,
        darts = 0;
      for (const L of p.legs || []) {
        pts += (L.totalScoreStart ?? 0) - (L.totalScoreRemaining ?? 0);
        darts += (L.visits || []).reduce(
          (a: number, v: any) => a + (v.darts || 0) - (v.preOpenDarts || 0),
          0,
        );
      }
      const lastV = (p.legs?.[p.legs.length - 1]?.visits || []).slice(-1)[0];
      return {
        lastVisit: lastV?.score ?? lastV?.visitTotal ?? 0,
        avg3: darts > 0 ? (pts / darts) * 3 : 0,
      };
    };
    return { local: compute(localPlayer), away: compute(awayPlayer) };
  }, [
    localPlayer,
    awayPlayer,
    localLeg?.visits?.length,
    awayLeg?.visits?.length,
  ]);

  // Checkout suggestions for the current thrower (local or away)
  const throwerRemaining = isUsersTurn ? localRemaining : awayRemaining;

  const gameMode = gameModeOverride || (match as any)?.game || "X01";
  const isX01 = gameMode === "X01";
  const scoreboardPlayers = useOnlineGameStats(gameMode, match as any);

  // Game-mode-aware hero display values for each player
  const heroValues = useMemo(() => {
    const forPlayer = (p: any, sbIdx: number) => {
      const sb = scoreboardPlayers[sbIdx];
      if (isX01) {
        const leg = p?.legs?.[p.legs.length - 1];
        return {
          primary: String(
            leg?.totalScoreRemaining ?? match.startingScore ?? lastOfflineStart,
          ),
          primaryLabel: "Remaining",
        };
      }
      if (gameMode === "Cricket" || gameMode === "American Cricket") {
        return {
          primary: String(sb?.points ?? 0),
          primaryLabel: "Points",
        };
      }
      if (gameMode === "Killer") {
        const lives = sb?.lives ?? 0;
        return {
          primary: sb?.eliminated ? "OUT" : String(lives),
          primaryLabel: sb?.eliminated ? "Eliminated" : "Lives",
        };
      }
      // Generic score-based games
      return {
        primary: String(sb?.score ?? sb?.points ?? 0),
        primaryLabel: "Score",
      };
    };
    return {
      local: forPlayer(localPlayer, localPlayerIndex),
      away: forPlayer(awayPlayer, awayIdx >= 0 ? awayIdx : 0),
    };
  }, [
    isX01,
    gameMode,
    scoreboardPlayers,
    localPlayer,
    awayPlayer,
    localPlayerIndex,
    awayIdx,
    match.startingScore,
    lastOfflineStart,
  ]);

  const callerEnabled = useUserSettings((s: any) => s.callerEnabled);
  const callerVoice = useUserSettings((s: any) => s.callerVoice);
  const callerVolume = useUserSettings((s: any) => s.callerVolume);
  const speakCheckoutOnly = useUserSettings((s: any) => s.speakCheckoutOnly);

  const [showQuitPause, setShowQuitPause] = useState(false);
  const setPaused = useMatchControl((s: any) => s.setPaused);
  const paused = useMatchControl((s: any) => s.paused);
  const pauseEndsAt = useMatchControl((s: any) => s.pauseEndsAt);
  const pauseInitiator = useMatchControl((s: any) => s.pauseInitiator);
  const [pauseNow, setPauseNow] = useState(Date.now());

  // Signal the app shell to go full-screen on mobile while in-game
  useEffect(() => {
    document.documentElement.setAttribute("data-ndn-ingame", "true");
    return () => {
      document.documentElement.removeAttribute("data-ndn-ingame");
    };
  }, []);

  useEffect(() => {
    if (!paused || !pauseEndsAt) return;
    const t = setInterval(() => {
      const now = Date.now();
      setPauseNow(now);
      if (now >= pauseEndsAt) {
        setPaused(false, null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [paused, pauseEndsAt, setPaused]);

  const checkoutRoutes = useMemo(() => {
    if (!isX01 || localRemaining > 170 || localRemaining <= 0) return null;
    const routes = suggestCheckouts(localRemaining);
    return routes && routes.length > 0 ? routes : null;
  }, [isX01, localRemaining]);

  // Checkout for the current thrower (shown in hero strip for both players)
  const throwerCheckout = useMemo(() => {
    if (!isX01 || throwerRemaining > 170 || throwerRemaining <= 0) return null;
    const routes = suggestCheckouts(throwerRemaining);
    return routes && routes.length > 0 ? routes : null;
  }, [isX01, throwerRemaining]);

  const numpadMax = isX01 ? 180 : 999;

  const legsInfo = useMemo(() => {
    const players = match.players || [];
    return players.map((p: any) => ({
      name: p.name || "Player",
      legsWon: p.legsWon || 0,
    }));
  }, [match.players]);

  const showStartShowcaseLocal =
    typeof showStartShowcaseProp === "boolean" ? showStartShowcaseProp : true;
  const setShowStartShowcase = (open: boolean) => {
    onShowStartShowcaseChange?.(open);
  };
  const showcaseLockedOpenRef = useRef(true);
  useEffect(() => {
    if (!showcaseLockedOpenRef.current) return;
    setShowStartShowcase(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showNumpad, setShowNumpad] = useState(false);
  const [numpadValue, setNumpadValue] = useState("");

  const commitVisit = (score: number, darts: number, meta?: any) => {
    if (onCommitVisit) {
      onCommitVisit(score, darts, meta);
      return;
    }
    const p = match.players?.[match.currentPlayerIdx];
    const leg = p?.legs?.[p.legs.length - 1];
    const prevRemaining = leg ? leg.totalScoreRemaining : match.startingScore;
    const numericScore = typeof score === "number" ? score : 0;
    let newRemaining = prevRemaining - numericScore;
    if (!Number.isFinite(newRemaining) || newRemaining < 0) newRemaining = 0;

    if (callerEnabled) {
      const playerName = p?.name || getPreferredUserName(user, "Player");
      try {
        sayScore(playerName, numericScore, newRemaining, callerVoice, {
          volume: callerVolume,
          checkoutOnly: speakCheckoutOnly,
        });
      } catch {}
    }

    match.addVisit(numericScore, darts, meta ?? { visitTotal: numericScore });
    if (newRemaining === 0) {
      match.endLeg(numericScore);
    } else {
      match.nextPlayer();
    }
    onStateChange?.();
  };

  const deriveWinningLabel = useCallback(() => {
    try {
      const legs: Array<{ ts: number; visit?: any; player?: any }> = [];
      (match.players || []).forEach((p: any) => {
        (p.legs || []).forEach((leg: any) => {
          if (leg?.finished) {
            const lastVisit = (leg.visits || []).slice(-1)[0];
            legs.push({
              ts: leg.endTime || Date.now(),
              visit: lastVisit,
              player: p,
            });
          }
        });
      });
      if (!legs.length) return null;
      const latest = legs.sort((a, b) => b.ts - a.ts)[0];
      const entry = (latest.visit?.entries || []).slice(-1)[0];
      if (entry?.label) return entry.label as string;
      if (entry?.ring === "DOUBLE" && typeof entry?.value === "number")
        return `Double ${entry.value / 2}`;
      if (typeof latest.visit?.visitTotal === "number")
        return `Checkout ${latest.visit.visitTotal}`;
    } catch {}
    return null;
  }, [match.players]);

  useEffect(() => {
    if (match.inProgress) {
      setWinningShot(null);
      return;
    }
    if (!winningShot?.label) {
      const derived = deriveWinningLabel();
      if (derived) setWinningShot((prev) => ({ ...prev, label: derived }));
    }
  }, [match.inProgress, deriveWinningLabel, winningShot?.label]);

  return (
    <div className="card ndn-game-shell ndn-page ndn-ingame-active relative overflow-hidden md:overflow-hidden overflow-y-auto">
      {/* ── Ambient background glow ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-amber-500/8 blur-[120px]" />
      </div>

      {showStartShowcaseLocal && (
        <MatchStartShowcase
          open={showStartShowcaseLocal}
          players={(match.players || []) as any}
          onDone={() => {
            showcaseLockedOpenRef.current = false;
            setShowStartShowcase(false);
          }}
          onRequestClose={() => {
            showcaseLockedOpenRef.current = false;
            setShowStartShowcase(false);
          }}
          showCalibrationDefault={true}
        />
      )}

      {/* ── Premium sticky header ── */}
      <div className="sticky top-0 z-20 mb-3">
        <div className="relative flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-transparent to-amber-500/10" />
          <div className="flex items-center gap-3 text-sm leading-none z-10">
            {isOnline && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] sm:text-xs font-semibold tracking-wide">
                🌐 Online
              </span>
            )}
            <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-xs font-semibold tracking-wide">
              {gameMode}
              {isX01 ? ` / ${match.startingScore || lastOfflineStart}` : ""}
            </span>
            {legsInfo.length >= 2 && (
              <span className="font-bold text-white/90 text-sm tabular-nums">
                Legs: {legsInfo[0].legsWon} – {legsInfo[1].legsWon}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 z-10">
            <PauseTimerBadge />
            <button
              className="px-4 py-1.5 rounded-xl text-sm font-semibold bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-400/30 shadow-lg shadow-rose-500/20 transition-all"
              onClick={() => setShowQuitPause(true)}
            >
              ⏸ Quit / Pause
            </button>
          </div>
        </div>
      </div>

      {/* ── Hero scoreboard banner — big remaining scores ── */}
      <div className="relative mb-4 rounded-2xl border border-white/10 overflow-hidden">
        {/* Gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-amber-950/80" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.03),transparent_70%)]" />

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center py-4 sm:py-6 px-3 sm:px-8">
          {/* Player 1 (local) */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${isUsersTurn ? "text-emerald-400" : "text-slate-400"}`}
            >
              {localPlayer?.name || "You"}
            </div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-medium">
              {heroValues.local.primaryLabel}
            </div>
            <div
              className={`font-mono text-5xl sm:text-7xl md:text-8xl font-black tabular-nums leading-none ${isUsersTurn ? "text-white" : "text-white/60"}`}
            >
              {heroValues.local.primary}
            </div>
            {isUsersTurn && (
              <div className="mt-1 px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] sm:text-xs font-semibold uppercase tracking-wider animate-pulse">
                ● Throwing
              </div>
            )}
            <div className="flex items-center gap-3 mt-1">
              {isX01 && (
                <div className="text-[10px] sm:text-xs text-slate-400 tabular-nums">
                  Legs: {localPlayer?.legsWon || 0}
                </div>
              )}
              {playerStats.local.avg3 > 0 && (
                <div className="text-[10px] sm:text-xs text-slate-400 tabular-nums">
                  Avg: {playerStats.local.avg3.toFixed(1)}
                </div>
              )}
              {playerStats.local.lastVisit > 0 && (
                <div className="text-[10px] sm:text-xs text-slate-500 tabular-nums">
                  Last: {playerStats.local.lastVisit}
                </div>
              )}
            </div>
          </div>

          {/* Centre divider — VS */}
          <div className="flex flex-col items-center gap-1 px-3 sm:px-6">
            <div className="w-px h-8 sm:h-12 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
            <div className="text-lg sm:text-2xl font-black text-white/30 tracking-widest">
              VS
            </div>
            <div className="w-px h-8 sm:h-12 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          </div>

          {/* Player 2 (away) */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${!isUsersTurn ? "text-amber-400" : "text-slate-400"}`}
            >
              {awayPlayer?.name || "Opponent"}
            </div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-medium">
              {heroValues.away.primaryLabel}
            </div>
            <div
              className={`font-mono text-5xl sm:text-7xl md:text-8xl font-black tabular-nums leading-none ${!isUsersTurn ? "text-white" : "text-white/60"}`}
            >
              {heroValues.away.primary}
            </div>
            {!isUsersTurn && (
              <div className="mt-1 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] sm:text-xs font-semibold uppercase tracking-wider animate-pulse">
                ● Throwing
              </div>
            )}
            <div className="flex items-center gap-3 mt-1">
              {isX01 && (
                <div className="text-[10px] sm:text-xs text-slate-400 tabular-nums">
                  Legs: {awayPlayer?.legsWon || 0}
                </div>
              )}
              {playerStats.away.avg3 > 0 && (
                <div className="text-[10px] sm:text-xs text-slate-400 tabular-nums">
                  Avg: {playerStats.away.avg3.toFixed(1)}
                </div>
              )}
              {playerStats.away.lastVisit > 0 && (
                <div className="text-[10px] sm:text-xs text-slate-500 tabular-nums">
                  Last: {playerStats.away.lastVisit}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Checkout suggestion strip — shows for whoever is currently throwing */}
        {throwerCheckout && (
          <div
            className={`relative border-t px-4 py-2 flex items-center gap-3 ${
              isUsersTurn
                ? "border-emerald-400/20 bg-emerald-500/10"
                : "border-amber-400/20 bg-amber-500/10"
            }`}
          >
            <span
              className={`text-[10px] sm:text-xs uppercase tracking-wider font-semibold whitespace-nowrap ${
                isUsersTurn ? "text-emerald-300/80" : "text-amber-300/80"
              }`}
            >
              Checkout {throwerRemaining}:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {throwerCheckout.map((route: string, i: number) => (
                <span
                  key={i}
                  className={`px-2 py-0.5 rounded-lg text-xs sm:text-sm font-medium ${
                    isUsersTurn
                      ? "bg-emerald-500/20 border border-emerald-400/20 text-emerald-100"
                      : "bg-amber-500/20 border border-amber-400/20 text-amber-100"
                  }`}
                >
                  {route}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Main content — context-sensitive layout ── */}
      <div className="ndn-shell-body">
        {/* ───── OPPONENT'S TURN: Camera + Scoreboard (spectator view) ───── */}
        {!isUsersTurn && (
          <div className="flex flex-col gap-3">
            {/* Camera — full width, prominent */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl ring-1 ring-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 shadow-lg shadow-amber-400/50 animate-pulse" />
                  <span className="text-xs sm:text-sm font-semibold text-white/80">
                    Opponent&apos;s Camera
                  </span>
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-amber-300">
                  Waiting for {awayPlayer?.name || "opponent"}&hellip;
                </span>
              </div>
              <div className="relative min-h-[12rem] max-h-[50vh] bg-black">
                <CameraView hideInlinePanels={true} forceAutoStart={true} />
                {isX01 && (
                  <LetterboxScoreboardOverlay
                    checkoutRemaining={localRemaining}
                    away={{
                      side: "Away",
                      name: awayPlayer?.name || "Away",
                      legsWon: awayPlayer?.legsWon || 0,
                      remaining: awayRemaining,
                    }}
                    home={{
                      side: "Home",
                      name: localPlayer?.name || "Home",
                      legsWon: localPlayer?.legsWon || 0,
                      remaining: localRemaining,
                    }}
                  />
                )}
              </div>
            </div>

            {/* Scoreboard — full width */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl ring-1 ring-white/5 p-3 sm:p-4 overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-bold text-white/90 tracking-wide">
                  Scoreboard
                </h3>
                <div className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-amber-500/20 border border-amber-400/30 text-amber-300">
                  {awayPlayer?.name || "Opponent"}&apos;s turn
                </div>
              </div>
              <GameScoreboard gameMode={gameMode} players={scoreboardPlayers} />
            </div>
          </div>
        )}

        {/* ───── YOUR TURN: Scoreboard + Score Entry Box ───── */}
        {isUsersTurn && (
          <div className="flex flex-col gap-3">
            {/* Scoreboard — full width */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl ring-1 ring-white/5 p-3 sm:p-4 overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] to-transparent" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-bold text-white/90 tracking-wide">
                  Scoreboard
                </h3>
                <div className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 animate-pulse">
                  ● Your turn
                </div>
              </div>
              <GameScoreboard gameMode={gameMode} players={scoreboardPlayers} />
            </div>

            {/* Score Entry Box — tappable card that opens the numpad */}
            <button
              type="button"
              className="relative w-full rounded-2xl border-2 border-dashed border-emerald-400/40 bg-emerald-500/5 hover:bg-emerald-500/10 active:scale-[0.98] transition-all p-6 sm:p-8 text-center group cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
              onClick={() => {
                setNumpadValue("");
                setShowNumpad(true);
              }}
            >
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/[0.05] to-transparent" />
              <div className="text-emerald-300/60 text-xs sm:text-sm uppercase tracking-widest font-semibold mb-2">
                Enter Score
              </div>
              <div className="font-mono text-4xl sm:text-5xl font-black text-emerald-200 group-hover:text-emerald-100 transition-colors">
                {heroValues.local.primary}
              </div>
              <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-sm font-semibold">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path
                    d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"
                    strokeLinecap="round"
                  />
                </svg>
                Tap to enter score
              </div>
              {checkoutRoutes && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {checkoutRoutes.map((route: string, i: number) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/20 text-emerald-100 text-xs font-medium"
                    >
                      {route}
                    </span>
                  ))}
                </div>
              )}
            </button>

            {/* Quick score buttons row */}
            <div className="flex flex-wrap gap-2 justify-center">
              {(isX01
                ? [180, 140, 100, 85, 60, 45, 26, 0]
                : [100, 80, 60, 45, 26, 20, 10, 0]
              ).map((v) => (
                <button
                  key={v}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white/90 transition-all active:scale-95"
                  onClick={() => commitVisit(v, 3, { visitTotal: v })}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Winning shot banner */}
            {winningShot?.label && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-center">
                <span className="text-xs text-emerald-400/70 uppercase tracking-wider font-semibold">
                  {isX01 ? "Winning Double" : "Winning Shot"}
                </span>
                <div className="text-lg font-bold text-emerald-200 mt-0.5">
                  {winningShot.label}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Number Pad Modal ── */}
      {showNumpad && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setShowNumpad(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          {/* Panel */}
          <div
            className="relative w-full max-w-sm mx-auto mb-0 sm:mb-0 rounded-t-3xl sm:rounded-3xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-4 sm:p-6 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Display */}
            <div className="mb-4 rounded-2xl bg-black/40 border border-white/10 p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                Score
              </div>
              <div className="font-mono text-5xl sm:text-6xl font-black text-white tabular-nums min-h-[3.5rem] leading-none">
                {numpadValue || <span className="text-white/20">0</span>}
              </div>
              {numpadValue &&
                checkoutRoutes &&
                Number(numpadValue) === localRemaining && (
                  <div className="mt-2 text-xs text-emerald-300 font-semibold">
                    ✓ Checkout!
                  </div>
                )}
            </div>

            {/* Numpad grid */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  className="py-3.5 rounded-xl text-xl font-bold bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-white transition-all active:scale-95"
                  onClick={() => {
                    const next = numpadValue + String(n);
                    if (Number(next) <= numpadMax) setNumpadValue(next);
                  }}
                >
                  {n}
                </button>
              ))}
              {/* Bottom row: backspace, 0, submit */}
              <button
                className="py-3.5 rounded-xl text-lg font-bold bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-white/60 transition-all active:scale-95"
                onClick={() => setNumpadValue((v) => v.slice(0, -1))}
              >
                ⌫
              </button>
              <button
                className="py-3.5 rounded-xl text-xl font-bold bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-white transition-all active:scale-95"
                onClick={() => {
                  const next = numpadValue + "0";
                  if (Number(next) <= numpadMax) setNumpadValue(next);
                }}
              >
                0
              </button>
              <button
                className="py-3.5 rounded-xl text-lg font-bold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 border border-emerald-400/30 text-white shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                onClick={() => {
                  const score = Math.max(
                    0,
                    Math.min(numpadMax, Number(numpadValue) || 0),
                  );
                  commitVisit(score, 3, { visitTotal: score });
                  setNumpadValue("");
                  setShowNumpad(false);
                }}
              >
                ✓
              </button>
            </div>

            {/* Quick buttons inside numpad */}
            <div className="flex flex-wrap gap-2 justify-center mb-3">
              {(isX01
                ? [180, 140, 100, 85, 60, 45, 26, 0]
                : [100, 80, 60, 45, 26, 20, 10, 0]
              ).map((v) => (
                <button
                  key={v}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-all active:scale-95"
                  onClick={() => {
                    commitVisit(v, 3, { visitTotal: v });
                    setNumpadValue("");
                    setShowNumpad(false);
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Cancel */}
            <button
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
              onClick={() => setShowNumpad(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Quit / Pause modal ── */}
      {showQuitPause && (
        <PauseQuitModal
          onClose={() => setShowQuitPause(false)}
          onQuit={() => {
            setShowQuitPause(false);
            if (onQuitProp) {
              onQuitProp();
            } else {
              try {
                match.endGame();
              } catch {}
              try {
                window.dispatchEvent(new Event("ndn:match-quit"));
              } catch {}
            }
          }}
          onPause={() => {
            try {
              setPaused(true, null, localPlayerName);
            } catch {}
            try {
              broadcastMessage({
                type: "pause",
                pauseStartedAt: Date.now(),
                pauseInitiator: localPlayerName,
              });
            } catch {}
            setShowQuitPause(false);
          }}
        />
      )}

      <PauseOverlay
        localPlayerName={localPlayerName}
        onResume={() => {
          setPaused(false, null);
          try {
            broadcastMessage({ type: "unpause" });
          } catch {}
        }}
      />
    </div>
  );
}
