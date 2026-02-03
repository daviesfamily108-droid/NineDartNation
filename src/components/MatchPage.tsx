import React, { useCallback, useEffect, useState } from "react";
import CameraView from "./CameraView";
import GameHeaderBar from "./ui/GameHeaderBar";
import GameScoreboard from "./scoreboards/GameScoreboard";
import { useMatch } from "../store/match";
import { useMatchControl } from "../store/matchControl";
import { readMatchSnapshot } from "../utils/matchSync";
import { subscribeMatchSync } from "../utils/broadcast";
import { usePendingVisit } from "../store/pendingVisit";
import PauseTimerBadge from "./ui/PauseTimerBadge";
import { useUserSettings } from "../store/userSettings";
import MatchControls from "./MatchControls";
import MatchStartShowcase from "./ui/MatchStartShowcase";
import { sayScore } from "../utils/checkout";
import { getPreferredUserName } from "../utils/userName";
import InGameSpectatorOverlay from "./ui/InGameSpectatorOverlay";

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
  const opponentLegsWon = (match.players || []).reduce(
    (acc: number, p: any, idx: number) => {
      if (idx === localPlayerIndex) return acc;
      return acc + (p?.legsWon || 0);
    },
    0,
  );
  const legsLabel = `${localPlayer?.legsWon || 0}-${opponentLegsWon}`;
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
        <GameHeaderBar
          left={
            <div className="flex items-center gap-2">
              <span className="font-medium">Camera view</span>
            </div>
          }
          right={<PauseTimerBadge />}
        />

        {/* X01: Spectator-style full-screen camera when it's not the local user's turn */}
        {((match as any)?.game || "X01") === "X01" && !isUsersTurn ? (
          <div className="relative w-full rounded-3xl border border-slate-800/60 bg-black shadow-2xl overflow-hidden">
            <div className="relative aspect-video sm:aspect-[16/9] w-full">
              <CameraView hideInlinePanels={true} forceAutoStart={true} />
            </div>
            <InGameSpectatorOverlay
              remaining={localRemaining}
              legsLabel={legsLabel}
            />
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-800/60 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/90 p-4 sm:p-6 shadow-2xl">
            <div className="grid grid-cols-1 gap-5 items-start">
              {/* Mobile: Turn-based layout */}
              <div className="lg:hidden min-w-0 space-y-4">
                {isUsersTurn ? (
                  <>
                    <div className="card p-3 rounded-2xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                        <span>Your Camera</span>
                        <span className="text-xs text-emerald-300">
                          Your turn
                        </span>
                      </div>
                      <div className="relative h-56 rounded-2xl overflow-hidden bg-black shadow-inner">
                        <CameraView
                          hideInlinePanels={true}
                          forceAutoStart={true}
                          onAddVisit={commitVisit}
                          onEndLeg={(score) => {
                            try {
                              match.endLeg(score ?? 0);
                            } catch {}
                          }}
                          onVisitCommitted={(
                            _score,
                            _darts,
                            finished,
                            meta,
                          ) => {
                            if (!finished) return;
                            const frame = meta?.frame ?? remoteFrame ?? null;
                            setWinningShot({
                              label:
                                meta?.label ||
                                deriveWinningLabel() ||
                                undefined,
                              ring: meta?.ring,
                              frame,
                              ts: Date.now(),
                            });
                            try {
                              match.endGame();
                            } catch {}
                          }}
                        />
                        {winningShot?.frame && !match.inProgress && (
                          <div className="absolute inset-2 rounded-lg overflow-hidden border border-emerald-400/40 shadow-lg bg-black/70">
                            <img
                              src={winningShot.frame}
                              alt="Winning double zoom"
                              className="w-full h-full object-cover scale-125"
                            />
                            <div className="absolute bottom-2 left-2 right-2 text-xs text-white bg-black/60 rounded-md px-2 py-1 flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                Winning dart zoom
                              </span>
                              {winningShot.label && (
                                <span className="text-emerald-200">
                                  {winningShot.label}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="card p-4 rounded-2xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold">
                          Your Scoreboard
                        </h3>
                      </div>
                      <GameScoreboard
                        gameMode={((match as any)?.game || "X01") as any}
                        players={(match.players || []).map(
                          (p: any, idx: number) => ({
                            name: p.name || `Player ${idx + 1}`,
                            isCurrentTurn:
                              idx === (match.currentPlayerIdx || 0),
                            legsWon: p.legsWon || 0,
                            score:
                              p.legs?.[p.legs.length - 1]
                                ?.totalScoreRemaining ??
                              match.startingScore ??
                              lastOfflineStart,
                            lastScore:
                              p.legs && p.legs.length
                                ? p.legs[p.legs.length - 1].visits.slice(-1)[0]
                                    ?.score || 0
                                : 0,
                          }),
                        )}
                      />

                      <div className="mt-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-indigo-950/40 p-3 shadow-[0_0_24px_rgba(99,102,241,0.25)]">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input text-center text-lg font-semibold rounded-xl border border-indigo-500/40 bg-transparent focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 transition-all flex-1"
                            style={{
                              width: "400mm",
                              height: "30mm",
                              maxWidth: "100%",
                            }}
                            value={visitTotalInput}
                            onChange={(e) => setVisitTotalInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const score = parseInt(visitTotalInput) || 0;
                                commitVisit(score, 3, { visitTotal: score });
                                setVisitTotalInput("");
                              }
                            }}
                            placeholder="Tap to enter score"
                            disabled={!match.inProgress}
                          />
                          <button
                            type="button"
                            className="btn btn--primary px-5 py-3 rounded-xl text-sm font-semibold"
                            onClick={() => {
                              const score = parseInt(visitTotalInput) || 0;
                              commitVisit(score, 3, { visitTotal: score });
                              setVisitTotalInput("");
                            }}
                            disabled={!match.inProgress || !visitTotalInput}
                          >
                            Submit score
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="card p-4 rounded-2xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold">Opponent</h3>
                        <span className="text-xs text-amber-300 font-semibold px-2 py-1 rounded-full bg-amber-500/10 border border-amber-400/30">
                          Waiting
                        </span>
                      </div>
                      <GameScoreboard
                        gameMode={((match as any)?.game || "X01") as any}
                        players={(opponentPlayers.length
                          ? opponentPlayers
                          : match.players || []
                        ).map((p: any, idx: number) => ({
                          name: p.name || `Player ${idx + 1}`,
                          isCurrentTurn:
                            p === (match.players || [])[match.currentPlayerIdx],
                          legsWon: p.legsWon || 0,
                          score:
                            p.legs?.[p.legs.length - 1]?.totalScoreRemaining ??
                            match.startingScore ??
                            lastOfflineStart,
                          lastScore:
                            p.legs && p.legs.length
                              ? p.legs[p.legs.length - 1].visits.slice(-1)[0]
                                  ?.score || 0
                              : 0,
                        }))}
                      />
                    </div>

                    <div className="card p-3 rounded-2xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                        <span>Opponent Camera</span>
                        <span className="text-xs text-slate-300">
                          Live feed
                        </span>
                      </div>
                      <div className="relative h-56 rounded-2xl overflow-hidden bg-black shadow-inner">
                        <CameraView
                          hideInlinePanels={true}
                          forceAutoStart={true}
                          onAddVisit={commitVisit}
                          onEndLeg={(score) => {
                            try {
                              match.endLeg(score ?? 0);
                            } catch {}
                          }}
                          onVisitCommitted={(
                            _score,
                            _darts,
                            finished,
                            meta,
                          ) => {
                            if (!finished) return;
                            const frame = meta?.frame ?? remoteFrame ?? null;
                            setWinningShot({
                              label:
                                meta?.label ||
                                deriveWinningLabel() ||
                                undefined,
                              ring: meta?.ring,
                              frame,
                              ts: Date.now(),
                            });
                            try {
                              match.endGame();
                            } catch {}
                          }}
                        />
                        {winningShot?.frame && !match.inProgress && (
                          <div className="absolute inset-2 rounded-lg overflow-hidden border border-emerald-400/40 shadow-lg bg-black/70">
                            <img
                              src={winningShot.frame}
                              alt="Winning double zoom"
                              className="w-full h-full object-cover scale-125"
                            />
                            <div className="absolute bottom-2 left-2 right-2 text-xs text-white bg-black/60 rounded-md px-2 py-1 flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                Winning dart zoom
                              </span>
                              {winningShot.label && (
                                <span className="text-emerald-200">
                                  {winningShot.label}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Desktop: Turn-based layout */}
              <div className="hidden lg:block min-w-0 space-y-5">
                {isUsersTurn ? (
                  <>
                    <div className="card p-4 rounded-3xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                        <span>Your Camera</span>
                        <span className="text-xs text-emerald-300">
                          Your turn
                        </span>
                      </div>
                      <div className="relative h-[360px] rounded-2xl overflow-hidden bg-black shadow-inner">
                        <CameraView
                          hideInlinePanels={true}
                          forceAutoStart={true}
                          onAddVisit={commitVisit}
                          onEndLeg={(score) => {
                            try {
                              match.endLeg(score ?? 0);
                            } catch {}
                          }}
                          onVisitCommitted={(
                            _score,
                            _darts,
                            finished,
                            meta,
                          ) => {
                            if (!finished) return;
                            const frame = meta?.frame ?? remoteFrame ?? null;
                            setWinningShot({
                              label:
                                meta?.label ||
                                deriveWinningLabel() ||
                                undefined,
                              ring: meta?.ring,
                              frame,
                              ts: Date.now(),
                            });
                            try {
                              match.endGame();
                            } catch {}
                          }}
                        />
                        {winningShot?.frame && !match.inProgress && (
                          <div className="absolute inset-2 rounded-lg overflow-hidden border border-emerald-400/40 shadow-lg bg-black/70">
                            <img
                              src={winningShot.frame}
                              alt="Winning double zoom"
                              className="w-full h-full object-cover scale-125"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="card p-5 rounded-3xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold">
                          Your Scoreboard
                        </h3>
                      </div>
                      <GameScoreboard
                        gameMode={((match as any)?.game || "X01") as any}
                        players={(match.players || []).map(
                          (p: any, idx: number) => ({
                            name: p.name || `Player ${idx + 1}`,
                            isCurrentTurn:
                              idx === (match.currentPlayerIdx || 0),
                            legsWon: p.legsWon || 0,
                            score:
                              p.legs?.[p.legs.length - 1]
                                ?.totalScoreRemaining ??
                              match.startingScore ??
                              lastOfflineStart,
                            lastScore:
                              p.legs && p.legs.length
                                ? p.legs[p.legs.length - 1].visits.slice(-1)[0]
                                    ?.score || 0
                                : 0,
                          }),
                        )}
                      />

                      <div className="mt-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-indigo-950/40 p-4 shadow-[0_0_24px_rgba(99,102,241,0.25)]">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="number"
                            className="input text-center text-lg font-semibold rounded-xl border border-indigo-500/40 bg-transparent focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 transition-all flex-1"
                            style={{
                              width: "400mm",
                              height: "30mm",
                              maxWidth: "100%",
                            }}
                            value={visitTotalInput}
                            onChange={(e) => setVisitTotalInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const score = parseInt(visitTotalInput) || 0;
                                commitVisit(score, 3, { visitTotal: score });
                                setVisitTotalInput("");
                              }
                            }}
                            placeholder="Enter score"
                            disabled={!match.inProgress}
                          />
                          <button
                            type="button"
                            className="btn btn--primary px-5 py-3 rounded-xl text-sm font-semibold"
                            onClick={() => {
                              const score = parseInt(visitTotalInput) || 0;
                              commitVisit(score, 3, { visitTotal: score });
                              setVisitTotalInput("");
                            }}
                            disabled={!match.inProgress || !visitTotalInput}
                          >
                            Submit score
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="card p-5 rounded-3xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold">Opponent</h3>
                        <span className="text-xs text-amber-300 font-semibold px-2 py-1 rounded-full bg-amber-500/10 border border-amber-400/30">
                          Opponent turn
                        </span>
                      </div>
                      <GameScoreboard
                        gameMode={((match as any)?.game || "X01") as any}
                        players={(opponentPlayers.length
                          ? opponentPlayers
                          : match.players || []
                        ).map((p: any, idx: number) => ({
                          name: p.name || `Player ${idx + 1}`,
                          isCurrentTurn:
                            p === (match.players || [])[match.currentPlayerIdx],
                          legsWon: p.legsWon || 0,
                          score:
                            p.legs?.[p.legs.length - 1]?.totalScoreRemaining ??
                            match.startingScore ??
                            lastOfflineStart,
                          lastScore:
                            p.legs && p.legs.length
                              ? p.legs[p.legs.length - 1].visits.slice(-1)[0]
                                  ?.score || 0
                              : 0,
                        }))}
                      />
                    </div>

                    <div className="card p-4 rounded-3xl border border-slate-800/60 bg-slate-950/60 shadow-xl ring-1 ring-white/5">
                      <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                        <span>Opponent Camera</span>
                        <span className="text-xs text-slate-300">
                          Live feed
                        </span>
                      </div>
                      <div className="relative h-[360px] rounded-2xl overflow-hidden bg-black shadow-inner">
                        <CameraView
                          hideInlinePanels={true}
                          forceAutoStart={true}
                          onAddVisit={commitVisit}
                          onEndLeg={(score) => {
                            try {
                              match.endLeg(score ?? 0);
                            } catch {}
                          }}
                          onVisitCommitted={(
                            _score,
                            _darts,
                            finished,
                            meta,
                          ) => {
                            if (!finished) return;
                            const frame = meta?.frame ?? remoteFrame ?? null;
                            setWinningShot({
                              label:
                                meta?.label ||
                                deriveWinningLabel() ||
                                undefined,
                              ring: meta?.ring,
                              frame,
                              ts: Date.now(),
                            });
                            try {
                              match.endGame();
                            } catch {}
                          }}
                        />
                        {winningShot?.frame && !match.inProgress && (
                          <div className="absolute inset-2 rounded-lg overflow-hidden border border-emerald-400/40 shadow-lg bg-black/70">
                            <img
                              src={winningShot.frame}
                              alt="Winning double zoom"
                              className="w-full h-full object-cover scale-125"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
