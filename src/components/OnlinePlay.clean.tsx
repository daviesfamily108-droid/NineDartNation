import React from "react";

export default function OnlinePlayClean({ user }: { user?: any }) {
  return (
    <div className="card ndn-game-shell relative overflow-hidden">
      <h2 className="text-3xl font-bold text-brand-700 mb-4">Online Play</h2>
      <div className="ndn-shell-body">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 min-h-[320px]">
          <div className="text-sm opacity-70">
            This is a blank Online Play layout. Remove everything here and
            start adding cards, controls and camera preview components as
            required.
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useEffect, useState } from "react";
import CreateMatchModal from "./ui/CreateMatchModal";
import MatchStartShowcase from "./ui/MatchStartShowcase";
import { useMatch } from "../store/match";
import { useWS } from "./WSProvider";

export default function OnlinePlayClean({ user }: { user?: any }) {
  const wsGlobal = useWS();
  const connected = !!(wsGlobal && (wsGlobal as any).connected);
  const [roomId] = useState("room-1");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdMatches, setCreatedMatches] = useState<any[]>([]);
  const [pendingInvite, setPendingInvite] = useState<any | null>(null);
  const [inviteCountdown, setInviteCountdown] = useState(60);
  const mstore = useMatch();
  const me = user?.username || "You";

  const createLocalMatch = (payload: any) => {
    const id = `local-${Date.now()}`;
    const matchObj = {
      id,
      ...payload,
      startingScore:
        payload.startingScore || (payload.game === "X01" ? 501 : undefined),
      players: [payload.createdBy],
    };
    setCreatedMatches((prev) => [matchObj, ...prev]);
    try {
      if (wsGlobal && (wsGlobal as any).connected)
        wsGlobal.send({ type: "create-match", match: matchObj });
    } catch {}
  };

  const handleJoinRequest = (m: any) => {
    if (m.createdBy === me) {
      setPendingInvite({
        matchId: m.id,
        fromId: `u-${Date.now()}`,
        fromName: `${me}-test`,
        game: m.game,
      });
      return;
    }
    try {
      if (wsGlobal && (wsGlobal as any).connected)
        wsGlobal.send({ type: "join-request", matchId: m.id, fromName: me });
    } catch {}
  };

  const respondToInvite = (accept: boolean) => {
    if (!pendingInvite) return;
    if (accept) {
      const matchObj = createdMatches.find(
        (c) => c.id === pendingInvite.matchId,
      );
      if (matchObj) {
        try {
          mstore.newMatch(
            [matchObj.createdBy, pendingInvite.fromName || "Opponent"],
            matchObj.startingScore || 501,
          );
        } catch {}
      }
    }
    setPendingInvite(null);
  };

  useEffect(() => {
    let t: any = null;
    if (pendingInvite) {
      setInviteCountdown(60);
      t = setInterval(
        () => setInviteCountdown((c) => Math.max(0, c - 1)),
        1000,
      );
    } else {
      setInviteCountdown(60);
    }
    return () => {
      if (t) clearInterval(t);
    };
  }, [pendingInvite]);

  return (
    <div className="card ndn-game-shell relative overflow-hidden">
      <h2 className="text-3xl font-bold text-brand-700 mb-4">Online Play</h2>
      <div className="ndn-shell-body">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xl font-semibold">
                Online Lobby = World Lobby
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-white/5 rounded border border-white/10">
                Room {roomId}
              </div>
              <div
                className={`w-3 h-3 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-500"}`}
                title={connected ? "Connected" : "Disconnected"}
              />
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                Create Match +
              </button>
            </div>
          </div>
          <hr className="border-t-4 border-black/80 my-3" />
          <div className="space-y-3">
            {createdMatches.length === 0 ? (
              <div className="text-sm opacity-60">No games created yet.</div>
            ) : (
              createdMatches.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 bg-white/3 border rounded"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {m.game}{" "}
                      {m.modeType === "bestof" ? "(Best Of)" : "(First To)"} -{" "}
                      {m.legs} legs
                    </div>
                    <div className="text-xs opacity-70">
                      Created by: {m.createdBy}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-sm"
                      onClick={() => handleJoinRequest(m)}
                    >
                      {m.createdBy === me ? "Simulate Join" : "Join Now!"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {showCreateModal && (
        <CreateMatchModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={createLocalMatch}
        />
      )}
      {pendingInvite && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-lg w-full">
            <div className="text-lg font-bold mb-2">Join Request</div>
            <div className="opacity-80 mb-4">
              {pendingInvite.fromName || "Player"} wants to join your match (
              {pendingInvite.game}). Accept?
            </div>
            <div className="flex items-center gap-3">
              <button
                className="btn btn-primary"
                onClick={() => respondToInvite(true)}
              >
                Accept ({inviteCountdown}s)
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => respondToInvite(false)}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
      <MatchStartShowcase
        open={mstore.inProgress}
        players={mstore.players as any}
        user={user}
        initialSeconds={15}
        roomId={roomId}
        onDone={() => {}}
        onRequestClose={() => {}}
      />
    </div>
  );
}
