import React, { useEffect, useState } from "react";
import CameraView from "./CameraView";
import GameHeaderBar from "./ui/GameHeaderBar";
import GameScoreboard from "./scoreboards/GameScoreboard";
import { useMatch } from "../store/match";
import { useMatchControl } from "../store/matchControl";
import { readMatchSnapshot } from "../utils/matchSync";
import { subscribeMatchSync } from "../utils/broadcast";
import { usePendingVisit } from "../store/pendingVisit";
import PauseTimerBadge from "./ui/PauseTimerBadge";

export default function MatchPage() {
  const match = useMatch();
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
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);

  useEffect(() => {
    // Try to import snapshot that opener wrote
    try {
      const snapshot = readMatchSnapshot();
      if (snapshot?.match) {
        try {
          useMatch.getState().importState(snapshot.match);
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

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="p-3 max-w-6xl mx-auto">
        <GameHeaderBar
          left={<span className="font-medium">Match</span>}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div className="md:col-span-2">
            <div className="card p-2">
              <CameraView hideInlinePanels={true} />
            </div>
          </div>
          <div>
            <div className="card p-2">
              <GameScoreboard
                gameMode={((match as any)?.game || "X01") as any}
                players={(match.players || []).map((p: any, idx: number) => ({
                  name: p.name || `Player ${idx + 1}`,
                  isCurrentTurn: idx === (match.currentPlayerIdx || 0),
                  legsWon: p.legsWon || 0,
                  score:
                    p.legs?.[p.legs.length - 1]?.totalScoreRemaining ||
                    undefined,
                  lastScore:
                    p.legs && p.legs.length
                      ? p.legs[p.legs.length - 1].visits.slice(-1)[0]?.score ||
                        0
                      : 0,
                }))}
              />
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
