import React, { useCallback, useEffect, useMemo, useState } from "react";
import CameraView from "./CameraView.js";
import GameScoreboard from "./scoreboards/GameScoreboard.js";
import { useOnlineGameStats } from "./scoreboards/useGameStats.js";
import { useMatch } from "../store/match.js";
import { useMatchControl } from "../store/matchControl.js";
import { readMatchSnapshot } from "../utils/matchSync.js";
import { subscribeMatchSync, broadcastMessage } from "../utils/broadcast.js";
import { usePendingVisit } from "../store/pendingVisit.js";
import PauseTimerBadge from "./ui/PauseTimerBadge.js";
import PauseQuitModal from "./ui/PauseQuitModal.js";
import { useUserSettings } from "../store/userSettings.js";
import MatchStartShowcase from "./ui/MatchStartShowcase.js";
import { suggestCheckouts, sayScore } from "../utils/checkout.js";
import { getPreferredUserName } from "../utils/userName.js";
import LetterboxScoreboardOverlay from "./ui/LetterboxScoreboardOverlay.js";
import { openMatchWindow } from "../utils/matchWindow.js";

export default function MatchPage() {
  const match = useMatch();
  useUserSettings((s: any) => s.hideInGameSidebar ?? true);
  const _setMatchState = useMatch().importState;
  const setPaused = useMatchControl((s: any) => s.setPaused);
  const paused = useMatchControl((s: any) => s.paused);
  const pauseEndsAt = useMatchControl((s: any) => s.pauseEndsAt);
  const pauseInitiator = useMatchControl((s: any) => s.pauseInitiator);
  const [pauseNow, setPauseNow] = useState(Date.now());
  const [_ready, setReady] = useState(false);
  const [winningShot, setWinningShot] = useState<{
    label?: string;
    ring?: string;
    frame?: string | null;
    ts?: number;
  } | null>(null);
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);
  const lastOfflineStart = useUserSettings(
    (s: any) => s.lastOffline?.x01Start || 501,
  );
  const user = useUserSettings((s: any) => s.user);
  const localPlayerName =
    user?.username ||
    user?.name ||
    user?.displayName ||
    user?.email?.split("@")[0];
  const resolvedLocalIndex = (match.players || []).findIndex(
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

  const opponentPlayers = (match.players || []).filter(
    (_p: any, idx: number) => idx !== localPlayerIndex,
  );
  const callerEnabled = useUserSettings((s: any) => s.callerEnabled);
  const callerVoice = useUserSettings((s: any) => s.callerVoice);
  const callerVolume = useUserSettings((s: any) => s.callerVolume);
  const speakCheckoutOnly = useUserSettings((s: any) => s.speakCheckoutOnly);
  const [visitTotalInput, setVisitTotalInput] = useState<string>("");
  const [showQuitPause, setShowQuitPause] = useState(false);
  const [showStartShowcase, setShowStartShowcase] = useState<boolean>(true);
  const showcaseLockedOpenRef = React.useRef(true);

  const gameMode = (((match as any)?.game || "X01") as any) ?? "X01";
  const scoreboardPlayers = useOnlineGameStats(gameMode, match as any);

  const checkoutRoutes = useMemo(() => {
    if (gameMode !== "X01" || localRemaining > 170 || localRemaining <= 0) return null;
    const routes = suggestCheckouts(localRemaining);
    return routes && routes.length > 0 ? routes : null;
  }, [gameMode, localRemaining]);

  const legsInfo = useMemo(() => {
    const players = match.players || [];
    return players.map((p: any) => ({
      name: p.name || "Player",
      legsWon: p.legsWon || 0,
    }));
  }, [match.players]);
  // Mobile camera view state was used by older layouts; current mobile layout is inline.

  // In the match pop-out window we want the same pre-game build-up overlay
  // (and camera preview) that exists on the main pre-game screen.
  //
  // IMPORTANT: match state may hydrate from a snapshot with `inProgress=true`
  // immediately, even though this window still needs to show the build-up UI.
  // So we default to showing it once per mount, and only allow it to close
  // after the user explicitly hits Start/Close.
  useEffect(() => {
    if (!showcaseLockedOpenRef.current) return;
    setShowStartShowcase(true);
  }, []);

  // Tick the pause countdown timer
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

  useEffect(() => {
    // Ensure camera is enabled for the pop-out so the feed can start immediately
    try {
      useUserSettings.getState().setCameraEnabled(true);
    } catch {}

    // Try to import snapshot that opener wrote
    try {
      const snapshot = readMatchSnapshot();
      if (snapshot?.match) {
        try {
          useMatch.getState().importState(snapshot.match);
        } catch {}
      }
      // If no snapshot match data, make sure starting score reflects last selected
      else {
        try {
          useMatch.getState().importState({
            ...useMatch.getState(),
            startingScore: lastOfflineStart,
          } as any);
        } catch {}
      }
      if (snapshot?.control) {
        try {
          useMatchControl
            .getState()
            .setPaused(snapshot.control.paused, snapshot.control.pauseEndsAt);
        } catch {}
      }
    } catch {}
    setReady(true);

    // subscribe to sync messages (pause/quit updates)
    const unsub = subscribeMatchSync((msg: any) => {
      try {
        if (!msg) return;
        if (msg.type === "snapshot" && msg.state) {
          if (msg.state.match) useMatch.getState().importState(msg.state.match);
          if (msg.state.control)
            useMatchControl
              .getState()
              .setPaused(
                msg.state.control.paused,
                msg.state.control.pauseEndsAt,
              );
        }
        // Helper: read snapshot if available and import
        const tryImportSnapshot = () => {
          try {
            const s = readMatchSnapshot();
            if (s && s.match) {
              useMatch.getState().importState(s.match);
              if (s.control)
                useMatchControl
                  .getState()
                  .setPaused(s.control.paused, s.control.pauseEndsAt);
              return true;
            }
          } catch {}
          return false;
        };
        if (msg.type === "pause") {
          try {
            useMatchControl.getState().setPaused(true, msg.pauseEndsAt ?? null, msg.pauseInitiator ?? null);
          } catch {}
        }
        if (msg.type === "unpause") {
          try {
            useMatchControl.getState().setPaused(false, null);
          } catch {}
        }
        if (msg.type === "quit") {
          try {
            window.close();
          } catch {}
        }
        // future message types: addVisit, nextPlayer, endGame etc.
        if (msg.type === "pendingVisit") {
          try {
            const _pIdx = msg.playerIdx ?? match.currentPlayerIdx;
            // update pending visit store so scoreboard/pending dots render
            try {
              usePendingVisit
                .getState()
                .setVisit(msg.entries || [], msg.darts || 0, msg.total || 0);
            } catch (e) {}
            if (msg.frame) setRemoteFrame(msg.frame);
          } catch (e) {}
        }
        if (msg.type === "visit") {
          try {
            // Prefer to import a full snapshot written by the committing window
            const ok = tryImportSnapshot();
            // Capture remote frame/finish metadata if provided (helps post-match zoom)
            try {
              if (msg.meta?.frame) setRemoteFrame(msg.meta.frame);
              if (msg.finished && msg.meta) {
                setWinningShot({
                  label: msg.meta.label || deriveWinningLabel() || undefined,
                  ring: msg.meta.ring,
                  frame: msg.meta.frame ?? msg.frame ?? null,
                  ts: Date.now(),
                });
                // Ensure local state marks game ended so overlays/header refresh
                match.endGame();
              }
            } catch {}
            // Always clear any remote pending preview
            try {
              usePendingVisit.getState().reset();
            } catch (e) {}
            // If no snapshot available, we keep the pending cleared and rely on
            // subsequent snapshot or other messages to bring state in sync.
            if (!ok) {
              // optional: attempt a minimal local update if message contains enough info
              // but to avoid double-applying visits we avoid calling addVisit here.
            }
          } catch (e) {}
        }

        if (msg.type === "nextPlayer") {
          try {
            // If a snapshot is available, import it. Otherwise set the currentPlayerIdx
            const ok = tryImportSnapshot();
            if (!ok) {
              try {
                const cur = useMatch.getState();
                const matchState = {
                  roomId: cur.roomId,
                  players: cur.players,
                  currentPlayerIdx:
                    typeof msg.currentPlayerIdx === "number"
                      ? msg.currentPlayerIdx
                      : (cur.currentPlayerIdx + 1) % (cur.players?.length || 1),
                  startingScore: cur.startingScore,
                  inProgress: cur.inProgress,
                  bestLegThisMatch: cur.bestLegThisMatch,
                };
                useMatch.getState().importState(matchState);
              } catch (e) {}
            }
          } catch (e) {}
        }

        if (msg.type === "endLeg") {
          try {
            const ok = tryImportSnapshot();
            if (!ok) {
              // best-effort: import snapshot not available, mark inProgress as-is
              // we avoid trying to replay UI-only behavior here.
            }
          } catch (e) {}
        }

        if (msg.type === "endGame") {
          try {
            const ok = tryImportSnapshot();
            if (!ok) {
              try {
                const cur = useMatch.getState();
                const matchState = {
                  roomId: cur.roomId,
                  players: cur.players,
                  currentPlayerIdx: cur.currentPlayerIdx,
                  startingScore: cur.startingScore,
                  inProgress: false,
                  bestLegThisMatch: cur.bestLegThisMatch,
                };
                useMatch.getState().importState(matchState);
              } catch (e) {}
            }
          } catch (e) {}
        }
      } catch {}
    });
    return () => {
      try {
        if (typeof unsub === "function") unsub();
      } catch {}
    };
  }, []);

  const commitVisit = (score: number, darts: number, meta?: any) => {
    const p = match.players?.[match.currentPlayerIdx];
    const leg = p?.legs?.[p.legs.length - 1];
    const prevRemaining = leg ? leg.totalScoreRemaining : match.startingScore;
    const numericScore = typeof score === "number" ? score : 0;
    let newRemaining = prevRemaining - numericScore;
    if (!Number.isFinite(newRemaining) || newRemaining < 0) newRemaining = 0;

    // Announce the score with the caller
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
  };

  // Derive a finishing label from match state (fallback when no camera meta is available)
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

  // When the match ends (or we return from close), keep the winning dart handy for header/zoom
  useEffect(() => {
    if (match.inProgress) {
      // Clear any stale winning-shot info when a new match/leg starts
      setWinningShot(null);
      return;
    }
    // If we already have a winning shot, keep it; otherwise derive from match history
    if (!winningShot?.label) {
      const derived = deriveWinningLabel();
      if (derived) setWinningShot((prev) => ({ ...prev, label: derived }));
    }
  }, [match.inProgress, deriveWinningLabel, winningShot?.label]);

  return (
    <div className="card ndn-game-shell ndn-page relative overflow-hidden md:overflow-hidden overflow-y-auto">
      {/* ── Ambient background glow ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-amber-500/8 blur-[120px]" />
      </div>

      {showStartShowcase && (
        <MatchStartShowcase
          open={showStartShowcase}
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
            <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-xs font-semibold tracking-wide">
              {gameMode}{gameMode === "X01" ? ` / ${match.startingScore || lastOfflineStart}` : ""}
            </span>
            {legsInfo.length >= 2 && (
              <span className="font-bold text-white/90 text-sm tabular-nums">
                Legs: {legsInfo[0].legsWon} – {legsInfo[1].legsWon}
              </span>
            )}
            {winningShot?.label && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs">
                🏆 {winningShot.label}
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
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-amber-950/80" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.03),transparent_70%)]" />

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center py-4 sm:py-6 px-3 sm:px-8">
          {/* Player 1 (local) */}
          <div className="flex flex-col items-center gap-1">
            <div className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${isUsersTurn ? "text-emerald-400" : "text-slate-400"}`}>
              {localPlayer?.name || "You"}
            </div>
            <div className={`font-mono text-5xl sm:text-7xl md:text-8xl font-black tabular-nums leading-none ${isUsersTurn ? "text-white" : "text-white/60"}`}>
              {localRemaining}
            </div>
            {isUsersTurn && (
              <div className="mt-1 px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] sm:text-xs font-semibold uppercase tracking-wider animate-pulse">
                ● Throwing
              </div>
            )}
            <div className="text-[10px] sm:text-xs text-slate-400 tabular-nums">
              Legs: {localPlayer?.legsWon || 0}
            </div>
          </div>

          {/* Centre divider — VS */}
          <div className="flex flex-col items-center gap-1 px-3 sm:px-6">
            <div className="w-px h-8 sm:h-12 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
            <div className="text-lg sm:text-2xl font-black text-white/30 tracking-widest">VS</div>
            <div className="w-px h-8 sm:h-12 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          </div>

          {/* Player 2 (away) */}
          <div className="flex flex-col items-center gap-1">
            <div className={`text-xs sm:text-sm font-bold uppercase tracking-widest ${!isUsersTurn ? "text-amber-400" : "text-slate-400"}`}>
              {awayPlayer?.name || "Opponent"}
            </div>
            <div className={`font-mono text-5xl sm:text-7xl md:text-8xl font-black tabular-nums leading-none ${!isUsersTurn ? "text-white" : "text-white/60"}`}>
              {awayRemaining}
            </div>
            {!isUsersTurn && (
              <div className="mt-1 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] sm:text-xs font-semibold uppercase tracking-wider animate-pulse">
                ● Throwing
              </div>
            )}
            <div className="text-[10px] sm:text-xs text-slate-400 tabular-nums">
              Legs: {awayPlayer?.legsWon || 0}
            </div>
          </div>
        </div>

        {/* Checkout suggestion strip */}
        {checkoutRoutes && (
          <div className="relative border-t border-emerald-400/20 bg-emerald-500/10 px-4 py-2 flex items-center gap-3">
            <span className="text-[10px] sm:text-xs uppercase tracking-wider text-emerald-300/80 font-semibold whitespace-nowrap">
              Checkout {localRemaining}:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {checkoutRoutes.map((route: string, i: number) => (
                <span key={i} className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/20 text-emerald-100 text-xs sm:text-sm font-medium">
                  {route}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Main content: Camera + Scoreboard + Controls ── */}
      <div className="ndn-shell-body">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 md:gap-4 items-stretch">
          {/* Left column: Camera */}
          <div className="min-w-0">
            <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl ring-1 ring-white/5 h-full flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isUsersTurn ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-amber-400 shadow-lg shadow-amber-400/50"}`} />
                  <span className="text-xs sm:text-sm font-semibold text-white/80">
                    {isUsersTurn ? "Your Camera" : "Opponent Camera"}
                  </span>
                </div>
                <span className={`text-[10px] sm:text-xs font-medium ${isUsersTurn ? "text-emerald-300" : "text-amber-300"}`}>
                  {isUsersTurn ? "LIVE — Your turn" : "Waiting…"}
                </span>
              </div>
              <div className="relative min-h-[10rem] max-h-[40vh] md:max-h-none md:flex-1 bg-black">
                {isUsersTurn ? (
                  <CameraView
                    hideInlinePanels={true}
                    forceAutoStart={true}
                    onAddVisit={commitVisit}
                    onEndLeg={(score: any) => {
                      try { match.endLeg(score ?? 0); } catch {}
                    }}
                    onVisitCommitted={(
                      _score: any,
                      _darts: any,
                      finished: any,
                      meta: any,
                    ) => {
                      if (!finished) return;
                      const frame = meta?.frame ?? remoteFrame ?? null;
                      setWinningShot({
                        label: meta?.label || deriveWinningLabel() || undefined,
                        ring: meta?.ring,
                        frame,
                        ts: Date.now(),
                      });
                      try { match.endGame(); } catch {}
                    }}
                  />
                ) : (
                  <CameraView hideInlinePanels={true} forceAutoStart={true} />
                )}
                {gameMode === "X01" && !isUsersTurn && (
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
                {winningShot?.frame && !match.inProgress && (
                  <div className="absolute inset-2 rounded-lg overflow-hidden border border-emerald-400/40 shadow-lg bg-black/70">
                    <img
                      src={winningShot.frame}
                      alt="Winning double zoom"
                      className="w-full h-full object-cover scale-125"
                    />
                    <div className="absolute bottom-2 left-2 right-2 text-xs text-white bg-black/60 rounded-md px-2 py-1 flex items-center justify-between gap-2">
                      <span className="font-semibold">Winning dart</span>
                      {winningShot.label && (
                        <span className="text-emerald-200">{winningShot.label}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: Scoreboard + Score Entry */}
          <div className="min-w-0 flex flex-col gap-3">
            {/* Scoreboard card */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl ring-1 ring-white/5 p-3 sm:p-4 overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-bold text-white/90 tracking-wide">Match Stats</h3>
                <div className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold ${
                  isUsersTurn
                    ? "bg-emerald-500/20 border border-emerald-400/30 text-emerald-300"
                    : "bg-amber-500/20 border border-amber-400/30 text-amber-300"
                }`}>
                  {isUsersTurn ? "Your turn" : "Opponent's turn"}
                </div>
              </div>
              <GameScoreboard gameMode={gameMode} players={scoreboardPlayers} />
            </div>

            {/* Score Entry card — always visible, locked when opponent's turn */}
            <div className={`relative rounded-2xl border shadow-2xl ring-1 ring-white/5 p-3 sm:p-4 overflow-hidden transition-all ${
              isUsersTurn
                ? "border-white/10 bg-slate-950/70"
                : "border-white/5 bg-slate-950/40 opacity-60"
            }`}>
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${isUsersTurn ? "from-emerald-500/[0.03]" : "from-slate-500/[0.02]"} to-transparent`} />
              <div className="flex items-center justify-between mb-3">
                <div className={`text-xs font-semibold uppercase tracking-wider ${isUsersTurn ? "text-emerald-300/60" : "text-slate-400/60"}`}>
                  Score Entry
                </div>
                {!isUsersTurn && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-400/20">
                    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <rect x="5" y="11" width="14" height="11" rx="2" />
                      <path d="M12 3a4 4 0 0 0-4 4v4h8V7a4 4 0 0 0-4-4z" />
                    </svg>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Waiting for opponent</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="number"
                  inputMode="numeric"
                  className={`flex-1 text-center text-xl sm:text-2xl font-bold rounded-xl border bg-white/5 placeholder-white/30 transition-all px-4 py-3 sm:py-4 ${
                    isUsersTurn
                      ? "border-white/10 text-white focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-500/20"
                      : "border-white/5 text-white/30 cursor-not-allowed"
                  }`}
                  value={visitTotalInput}
                  onChange={(e) => isUsersTurn && setVisitTotalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (!isUsersTurn) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const score = parseInt(visitTotalInput) || 0;
                      commitVisit(score, 3, { visitTotal: score });
                      setVisitTotalInput("");
                    }
                  }}
                  placeholder={isUsersTurn ? "Enter score" : "Locked"}
                  disabled={!isUsersTurn || !match.inProgress}
                  readOnly={!isUsersTurn}
                />
                <button
                  type="button"
                  className={`px-6 py-3 sm:py-4 rounded-xl text-sm sm:text-base font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    isUsersTurn
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/30 shadow-lg shadow-emerald-500/20"
                      : "bg-slate-700 text-white/40 border-white/5 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    if (!isUsersTurn) return;
                    const score = parseInt(visitTotalInput) || 0;
                    commitVisit(score, 3, { visitTotal: score });
                    setVisitTotalInput("");
                  }}
                  disabled={!isUsersTurn || !match.inProgress || !visitTotalInput}
                >
                  Submit Score
                </button>
              </div>
              {/* Quick-score buttons */}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-[10px] text-white/40 uppercase tracking-wider self-center">Quick:</span>
                {[180, 140, 100, 85, 60, 45, 26].map((v) => (
                  <button
                    key={v}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isUsersTurn
                        ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white"
                        : "border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed"
                    }`}
                    onClick={() => {
                      if (!isUsersTurn) return;
                      commitVisit(v, 3, { visitTotal: v });
                      setVisitTotalInput("");
                    }}
                    disabled={!isUsersTurn}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quit / Pause modal ── */}
      {showQuitPause && (
        <PauseQuitModal
          onClose={() => setShowQuitPause(false)}
          onQuit={() => {
            setShowQuitPause(false);
            try { match.endGame(); } catch {}
            try { window.dispatchEvent(new Event("ndn:match-quit")); } catch {}
            try { broadcastMessage({ type: "quit" }); } catch {}
          }}
          onPause={(minutes: number) => {
            const endsAt = Date.now() + minutes * 60 * 1000;
            try { setPaused(true, endsAt, localPlayerName); } catch {}
            try {
              broadcastMessage({
                type: "pause",
                pauseEndsAt: endsAt,
                pauseStartedAt: Date.now(),
                pauseInitiator: localPlayerName,
              });
            } catch {}
            setShowQuitPause(false);
          }}
        />
      )}

      {/* ── Glass pause overlay — blocks all interaction while paused ── */}
      {paused && pauseEndsAt && (() => {
        const remaining = Math.max(0, pauseEndsAt - pauseNow);
        const secs = Math.ceil(remaining / 1000);
        const mm = Math.floor(secs / 60).toString().padStart(2, "0");
        const ss = (secs % 60).toString().padStart(2, "0");
        const started = useMatchControl.getState().pauseStartedAt ?? pauseNow;
        const total = Math.max(1, pauseEndsAt - started);
        const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
        const isInitiator = !pauseInitiator || pauseInitiator === localPlayerName;
        return (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-80 h-80 rounded-full bg-amber-500/10 blur-[100px]" />
            </div>

            <div className="relative rounded-3xl border border-amber-400/20 bg-slate-900/95 p-8 sm:p-10 shadow-2xl shadow-amber-500/10 max-w-sm w-full mx-4">
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent" />

              <div className="relative flex flex-col items-center gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-14 sm:w-6 sm:h-16 rounded-md bg-amber-400 shadow-lg shadow-amber-400/30" />
                  <div className="w-5 h-14 sm:w-6 sm:h-16 rounded-md bg-amber-400 shadow-lg shadow-amber-400/30" />
                </div>

                <div className="text-amber-300 text-lg sm:text-xl font-bold uppercase tracking-[0.2em]">
                  Match Paused
                </div>

                {pauseInitiator && (
                  <div className="text-sm text-amber-200/60">
                    Paused by <span className="font-semibold text-amber-200/90">{pauseInitiator}</span>
                  </div>
                )}

                <div className="font-mono text-6xl sm:text-7xl font-black text-white tabular-nums leading-none">
                  {mm}:{ss}
                </div>

                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="text-[10px] sm:text-xs text-amber-200/40 uppercase tracking-wider">
                  Resuming when timer expires
                </div>

                {isInitiator ? (
                  <button
                    className="mt-1 px-8 py-3 rounded-2xl text-base font-bold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30 shadow-lg shadow-emerald-500/20 transition-all"
                    onClick={() => {
                      setPaused(false, null);
                      try { broadcastMessage({ type: "unpause" }); } catch {}
                    }}
                  >
                    ▶ Resume Match
                  </button>
                ) : (
                  <div className="mt-1 text-sm text-amber-200/50 italic">
                    Only <span className="font-semibold text-amber-200/80">{pauseInitiator}</span> can resume
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
