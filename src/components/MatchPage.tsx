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
import { parseManualDart } from "../game/types";
import MatchStartShowcase from "./ui/MatchStartShowcase";

export default function MatchPage() {
  const match = useMatch();
  useUserSettings((s) => s.hideInGameSidebar ?? true);
  const _setMatchState = useMatch().importState;
  const _setControl = useMatchControl((s) => s.setPaused);
  const _control = useMatchControl();
  const [_ready, setReady] = useState(false);
  const _setRemotePending = usePendingVisit((s) => s.setVisit);
  const _resetRemotePending = usePendingVisit((s) => s.reset);
  const remotePending = usePendingVisit((s) => ({
    entries: s.entries,
    darts: s.darts,
    total: s.total,
  }));
  const pendingEntries = usePendingVisit((s) => s.entries);
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
  const [playerVisitDarts, setPlayerVisitDarts] = useState(0);
  const [playerDartPoints, setPlayerDartPoints] = useState<number>(0);
  const [visitTotalInput, setVisitTotalInput] = useState<string>("");
  const [manualBox, setManualBox] = useState("");
  const [multiEntry, setMultiEntry] = useState("");
  const [manualEntries, setManualEntries] = useState<number[]>([]);
  const [showStartShowcase, setShowStartShowcase] = useState<boolean>(true);
  const showcaseLockedOpenRef = React.useRef(true);

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

  const addManual = () => {
    const parsed = parseManualDart(manualBox);
    if (parsed == null) return;
    addManualEntry(parsed);
    setManualBox("");
  };

  const replaceLastManual = () => {
    if (manualEntries.length === 0) return;
    const parsed = parseManualDart(manualBox);
    if (parsed == null) return;
    const next = [...manualEntries];
    next[next.length - 1] = parsed;
    setManualEntries(next);
    setPlayerVisitDarts(next.length);
    setManualBox("");
  };

  const addMultiEntry = () => {
    const lines = multiEntry
      .split(/\n|,/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    let currentEntries = [...manualEntries];
    for (const line of lines) {
      const parsed = parseManualDart(line);
      if (parsed == null) continue;
      currentEntries.push(parsed);
      if (currentEntries.length >= 3) {
        const visitSum = currentEntries.slice(0, 3).reduce((a, b) => a + b, 0);
        commitVisit(visitSum, currentEntries.length, { visitTotal: visitSum });
        currentEntries = [];
      }
    }
    setManualEntries(currentEntries);
    setPlayerVisitDarts(currentEntries.length);
  };

  const clearMultiEntry = () => {
    setMultiEntry("");
  };

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
    <div
      className="min-h-screen bg-slate-900 text-white"
      style={{
        paddingBottom:
          "calc(var(--ndn-bottomnav-h, 0px) + env(safe-area-inset-bottom, 0px) + 16px)",
      }}
    >
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
      <div className="p-2 sm:p-3 max-w-6xl mx-auto">
        <GameHeaderBar
          left={
            <div className="flex items-center gap-2">
              <span className="font-medium">Match</span>
              {winningShot?.label && (
                <span className="text-xs bg-emerald-600/20 text-emerald-200 px-2 py-1 rounded-lg border border-emerald-500/30">
                  Winning double: {winningShot.label}
                </span>
              )}
            </div>
          }
          right={
            <>
              <PauseTimerBadge />
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
                Return to app
              </button>
              <button
                className="btn btn--ghost px-3 py-1"
                onClick={() => {
                  try {
                    window.close();
                  } catch {}
                }}
                aria-label="Close match window"
              >
                Close
              </button>
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3 sm:gap-4 mt-3 items-start">
          <div className="min-w-0 space-y-4">
            <div className="card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium opacity-80">
                <span className="text-xs uppercase tracking-wide text-white/60">
                  Match Controls
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-emerald-300 font-semibold px-3 py-2 rounded-md bg-white/5 border border-white/10">
                  Manual scoring only
                </span>
              </div>
            </div>

            <div className="card p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-base font-semibold">Score Entry</h3>
                <span className="text-xs text-slate-300">
                  Enter visits or dart-by-dart edits
                </span>
              </div>
              {/* Compact autoscore + manual scoring controls */}
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-3">
                  <MatchControls
                    inProgress={match.inProgress}
                    startingScore={match.startingScore}
                    pendingEntries={pendingEntries}
                    onAddVisit={(score, darts) =>
                      commitVisit(score, darts, { visitTotal: score })
                    }
                    onUndo={() => match.undoVisit()}
                    onNextPlayer={() => match.nextPlayer()}
                    onEndLeg={(score, darts, meta) => {
                      const numericScore =
                        typeof score === "number" ? score : 0;
                      const finalDarts =
                        typeof darts === "number" ? Math.max(0, darts) : 0;
                      match.addVisit(numericScore, finalDarts, {
                        visitTotal: numericScore,
                        doubleWindowDarts: meta?.doubleDarts ?? 0,
                      });
                      match.endLeg(numericScore);
                    }}
                    onEndGame={() => match.endGame()}
                    quickButtons={[180, 140, 100, 60]}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="card p-3">
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
                  lastScore:
                    p.legs && p.legs.length
                      ? p.legs[p.legs.length - 1].visits.slice(-1)[0]?.score ||
                        0
                      : 0,
                }))}
              />
            </div>

            <div className="card p-2">
              <div className="text-sm font-semibold mb-2 flex items-center justify-between">
                <span>Camera</span>
                <span className="text-xs text-slate-300">Compact view</span>
              </div>
              <div className="relative h-56 rounded-xl overflow-hidden bg-black">
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
                    // Ensure the match fully ends so the header stats refresh and the
                    // winning zoom overlay can render (it only shows once inProgress=false).
                    // endGame is idempotent: it will no-op if already ended.
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
                      <span className="font-semibold">Winning dart zoom</span>
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
          </div>
        </div>
      </div>
      {/* Bottom-right overlay: opponent camera thumbnail + live score */}
      <div className="fixed right-4 bottom-4 z-50">
        <div className="w-48 bg-black/70 text-white rounded-xl overflow-hidden shadow-lg border border-white/10">
          <div className="p-2 flex items-center gap-2">
            <div className="w-16 h-10 bg-black rounded overflow-hidden flex-shrink-0">
              {remoteFrame ? (
                // small thumbnail from remote camera
                <img
                  src={remoteFrame}
                  alt="opponent camera"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xs">
                  No preview
                </div>
              )}
            </div>
            <div className="flex-1 text-sm">
              <div className="font-medium">
                {(match.players || [])[match.currentPlayerIdx]?.name ||
                  "Player"}
              </div>
              <div className="text-xs text-slate-300">
                Remaining:
                <span className="ml-1 font-semibold">
                  {(() => {
                    const p = (match.players || [])[match.currentPlayerIdx];
                    const leg = p?.legs?.[p.legs?.length - 1];
                    const remaining = leg
                      ? leg.totalScoreRemaining
                      : match.startingScore;
                    const pending = (remotePending && remotePending.total) || 0;
                    const shown =
                      typeof remaining === "number"
                        ? Math.max(0, remaining - pending)
                        : remaining;
                    return shown;
                  })()}
                </span>
              </div>
            </div>
          </div>
          <div className="px-2 pb-2">
            <div className="text-xs text-slate-300">Pending</div>
            <div className="flex gap-1 mt-1">
              {remotePending.entries?.length ? (
                remotePending.entries.map((e: any, i: number) => (
                  <div key={i} className="px-2 py-1 bg-white/5 rounded text-sm">
                    {e.rawValue ?? e.value}
                  </div>
                ))
              ) : (
                <div className="px-2 py-1 text-xs text-slate-400">—</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
