import React, { useCallback, useEffect, useRef, useState } from "react";
import CameraView from "./CameraView.js";
import GameScoreboard from "./scoreboards/GameScoreboard.js";
import { useMatch } from "../store/match.js";
import { useMatchControl } from "../store/matchControl.js";
import { readMatchSnapshot } from "../utils/matchSync.js";
import { subscribeMatchSync } from "../utils/broadcast.js";
import { usePendingVisit } from "../store/pendingVisit.js";
import PauseTimerBadge from "./ui/PauseTimerBadge.js";
import { useUserSettings } from "../store/userSettings.js";
import MatchStartShowcase from "./ui/MatchStartShowcase.js";
import { sayScore, suggestCheckouts } from "../utils/checkout.js";
import { getPreferredUserName } from "../utils/userName.js";
import LetterboxScoreboardOverlay from "./ui/LetterboxScoreboardOverlay.js";

export default function MatchPage() {
  const match = useMatch();
  useUserSettings((s) => s.hideInGameSidebar ?? true);
  const _setMatchState = useMatch().importState;
  const _setControl = useMatchControl((s) => s.setPaused);
  const _control = useMatchControl();
  const [_ready, setReady] = useState(false);
  const [winningShot, setWinningShot] = useState<{
    label?: string;
    ring?: string;
    frame?: string | null;
    ts?: number;
  } | null>(null);
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);
  const lastOfflineStart = useUserSettings(
    (s) => s.lastOffline?.x01Start || 501,
  );
  const user = useUserSettings((s) => s.user);
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
  const callerEnabled = useUserSettings((s) => s.callerEnabled);
  const callerVoice = useUserSettings((s) => s.callerVoice);
  const callerVolume = useUserSettings((s) => s.callerVolume);
  const speakCheckoutOnly = useUserSettings((s) => s.speakCheckoutOnly);
  const [playerVisitDarts, setPlayerVisitDarts] = useState(0);
  const [playerDartPoints, setPlayerDartPoints] = useState<number>(0);
  const [visitTotalInput, setVisitTotalInput] = useState<string>("");
  const [manualBox, setManualBox] = useState("");
  const [multiEntry, setMultiEntry] = useState("");
  const [manualEntries, setManualEntries] = useState<number[]>([]);
  const [showStartShowcase, setShowStartShowcase] = useState<boolean>(true);
  const showcaseLockedOpenRef = React.useRef(true);
  const [showMobileCamera, setShowMobileCamera] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<"controls" | "camera">(
    "controls",
  );
  const [showNumpad, setShowNumpad] = useState(false);
  const [numpadValue, setNumpadValue] = useState("");
  const numpadInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!showNumpad) return;
    numpadInputRef.current?.focus();
  }, [showNumpad]);

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
            useMatchControl.getState().setPaused(true, msg.pauseEndsAt ?? null);
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

  const resetManualState = () => {
    setManualEntries([]);
    setPlayerVisitDarts(0);
    setPlayerDartPoints(0);
    setVisitTotalInput("");
    setManualBox("");
  };

  const addManualEntry = (value: number) => {
    const dart = Math.max(0, Math.min(60, Math.round(value)));
    const nextEntries = [...manualEntries, dart].slice(0, 3);
    const darts = nextEntries.length;
    setManualEntries(nextEntries);
    setPlayerVisitDarts(darts);
    if (darts >= 3) {
      const sum = nextEntries.reduce((acc, v) => acc + v, 0);
      commitVisit(sum, darts, { visitTotal: sum });
      resetManualState();
    }
  };

  const replaceLast = () => {
    if (manualEntries.length === 0) return;
    const next = manualEntries.slice(0, -1);
    setManualEntries(next);
    setPlayerVisitDarts(next.length);
  };

  const addDartNumeric = () => {
    addManualEntry(Number(playerDartPoints) || 0);
  };

  const handleVisitTotalChange = (val: string) => {
    setVisitTotalInput(val);
  };

  const addVisitTotal = () => {
    const total = Math.max(0, Math.round(Number(visitTotalInput) || 0));
    if (!Number.isFinite(total)) return;
    commitVisit(total, 3, { visitTotal: total });
    resetManualState();
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
      <div className="flex items-center gap-3 mb-4 ndn-section-title">
        <button
          className="btn btn--ghost px-3 py-1"
          onClick={() => {
            try {
              if (window.opener && !(window.opener as any).closed) {
                try {
                  (window.opener as any).focus();
                } catch {}
              }
              window.close();
            } catch {}
          }}
          aria-label="Return to app and close match window"
        >
          Return
        </button>
        <h2 className="text-3xl font-bold text-brand-700">Match 🎯</h2>
        <div className="ml-auto">
          <PauseTimerBadge />
        </div>
        {winningShot?.label && (
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 align-middle">
            Winning double: {winningShot.label}
          </span>
        )}
      </div>
      <div
        className="ndn-shell-body"
        style={{
          paddingBottom:
            "calc(var(--ndn-bottomnav-h, 0px) + env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        {/* ── Two-column layout: Left = Scoreboard + Controls, Right = Camera ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* ───── LEFT COLUMN: Scoreboard + Score Entry ───── */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* Scoreboard */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl ring-1 ring-white/5 p-4 sm:p-5 overflow-hidden">
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${isUsersTurn ? "from-emerald-500/[0.03]" : "from-white/[0.02]"} to-transparent`}
              />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-bold text-white/90 tracking-wide">
                  Scoreboard
                </h3>
                {isUsersTurn ? (
                  <div className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 animate-pulse">
                    ● Your turn
                  </div>
                ) : (
                  <div className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-amber-500/20 border border-amber-400/30 text-amber-300 animate-pulse">
                    ⏳ {awayPlayer?.name || "Opponent"}&apos;s turn
                  </div>
                )}
              </div>
              <GameScoreboard
                gameMode={((match as any)?.game || "X01") as any}
                players={(match.players || []).map((p: any, idx: number) => ({
                  name: p.name || `Player ${idx + 1}`,
                  isCurrentTurn: idx === (match.currentPlayerIdx || 0),
                  legsWon: p.legsWon || 0,
                  score:
                    p.legs?.[p.legs.length - 1]?.totalScoreRemaining ??
                    match.startingScore ??
                    lastOfflineStart,
                  lastScore: p.legs?.length
                    ? p.legs[p.legs.length - 1].visits?.slice(-1)[0]?.score || 0
                    : 0,
                }))}
              />
            </div>

            {/* ── Turn-dependent controls ── */}
            {isUsersTurn ? (
              <>
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
                    {localRemaining}
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
                  {(() => {
                    const routes =
                      localRemaining <= 170
                        ? suggestCheckouts(localRemaining)
                        : null;
                    return routes ? (
                      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                        {routes.map((route: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/20 text-emerald-100 text-xs font-medium"
                          >
                            {route}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </button>

                {/* Quick score buttons */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {[180, 140, 100, 85, 60, 45, 26, 0].map((v) => (
                    <button
                      key={v}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white/90 transition-all active:scale-95"
                      onClick={() => {
                        commitVisit(v, 3, { visitTotal: v });
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 px-4 py-6 text-center">
                <div className="text-amber-300/60 text-xs uppercase tracking-widest font-semibold mb-1">
                  Waiting
                </div>
                <div className="text-lg font-bold text-amber-200">
                  {awayPlayer?.name || "Opponent"} is throwing&hellip;
                </div>
              </div>
            )}

            {/* Winning shot banner */}
            {winningShot?.label && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-center">
                <span className="text-xs text-emerald-400/70 uppercase tracking-wider font-semibold">
                  Winning Double
                </span>
                <div className="text-lg font-bold text-emerald-200 mt-0.5">
                  {winningShot.label}
                </div>
              </div>
            )}
          </div>

          {/* ───── RIGHT COLUMN: Camera Feed (always visible) ───── */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-4">
              <div className="relative rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl ring-1 ring-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${isUsersTurn ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-amber-400 shadow-lg shadow-amber-400/50"} animate-pulse`}
                    />
                    <span className="text-xs sm:text-sm font-semibold text-white/80">
                      Live Camera
                    </span>
                  </div>
                  {!isUsersTurn && (
                    <span className="text-[10px] sm:text-xs font-medium text-amber-300/80">
                      Waiting for {awayPlayer?.name || "opponent"}&hellip;
                    </span>
                  )}
                </div>
                <div className="relative min-h-[14rem] sm:min-h-[20rem] lg:min-h-[24rem] bg-black">
                  <CameraView
                    hideInlinePanels={true}
                    forceAutoStart={true}
                    onAddVisit={commitVisit}
                    onEndLeg={(score) => {
                      try {
                        match.endLeg(score ?? 0);
                      } catch {}
                    }}
                    onVisitCommitted={(_score, _darts, finished, meta) => {
                      if (!finished) return;
                      const frame = meta?.frame ?? remoteFrame ?? null;
                      setWinningShot({
                        label: meta?.label || deriveWinningLabel() || undefined,
                        ring: meta?.ring,
                        frame,
                        ts: Date.now(),
                      });
                      try {
                        match.endGame();
                      } catch {}
                    }}
                  />
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
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Number Pad Modal ── */}
        {showNumpad && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            onClick={() => setShowNumpad(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            {/* Panel */}
            <div
              className="relative z-10 w-full max-w-sm mx-auto bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5"
              style={{ animation: "slideUp .2s ease-out" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Hidden input for desktop keyboard capture — auto-focused on open */}
              <input
                ref={numpadInputRef}
                type="text"
                inputMode="numeric"
                className="sr-only"
                aria-label="Type score"
                value={numpadValue}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  if (raw === "" || Number(raw) <= 180) setNumpadValue(raw);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const score = Math.min(
                      180,
                      Math.max(0, parseInt(numpadValue) || 0),
                    );
                    commitVisit(score, 3, { visitTotal: score });
                    setShowNumpad(false);
                    setNumpadValue("");
                    setVisitTotalInput("");
                  } else if (e.key === "Escape") {
                    setShowNumpad(false);
                  } else if (e.key === "Backspace") {
                    // Let the native input handle it
                  }
                }}
              />

              {/* Score display */}
              <div
                className="text-center mb-4"
                onClick={() => numpadInputRef.current?.focus()}
              >
                <div className="text-xs text-white/50 uppercase tracking-widest mb-1">
                  Score
                </div>
                <div className="font-mono text-4xl font-black text-white min-h-[2.5rem]">
                  {numpadValue || <span className="text-white/20">0</span>}
                </div>
                <div className="text-[10px] text-white/30 mt-1">
                  Type on keyboard or tap below
                </div>
              </div>

              {/* 3×4 grid */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="py-3.5 rounded-xl text-lg font-bold bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white transition-all active:scale-95"
                    onClick={() => {
                      const next = numpadValue + String(n);
                      if (Number(next) <= 180) setNumpadValue(next);
                    }}
                  >
                    {n}
                  </button>
                ))}
                {/* Backspace */}
                <button
                  type="button"
                  className="py-3.5 rounded-xl text-lg font-bold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/20 text-rose-300 transition-all active:scale-95"
                  onClick={() => setNumpadValue((v) => v.slice(0, -1))}
                >
                  ⌫
                </button>
                {/* 0 */}
                <button
                  type="button"
                  className="py-3.5 rounded-xl text-lg font-bold bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white transition-all active:scale-95"
                  onClick={() => {
                    if (numpadValue.length > 0) {
                      const next = numpadValue + "0";
                      if (Number(next) <= 180) setNumpadValue(next);
                    }
                  }}
                >
                  0
                </button>
                {/* Submit */}
                <button
                  type="button"
                  className="py-3.5 rounded-xl text-lg font-bold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 transition-all active:scale-95"
                  onClick={() => {
                    const score = Math.min(
                      180,
                      Math.max(0, parseInt(numpadValue) || 0),
                    );
                    commitVisit(score, 3, { visitTotal: score });
                    setShowNumpad(false);
                    setNumpadValue("");
                    setVisitTotalInput("");
                  }}
                >
                  ✓
                </button>
              </div>

              {/* Quick buttons inside numpad */}
              <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                {[180, 140, 100, 85, 60, 45, 26, 0].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/20 text-indigo-200 transition-all active:scale-95"
                    onClick={() => {
                      commitVisit(v, 3, { visitTotal: v });
                      setShowNumpad(false);
                      setNumpadValue("");
                      setVisitTotalInput("");
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Cancel */}
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
                onClick={() => setShowNumpad(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
