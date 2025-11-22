import React, { useState, useMemo, useEffect } from "react";
import CreateMatchModal from "./ui/CreateMatchModal";

export default function OnlinePlayClean({ user }: { user?: any }) {
  const username = user?.username || "You";
  const [currentRoomIdx, setCurrentRoomIdx] = useState(0);
  const [rooms, setRooms] = useState(() => [{ id: 1, name: "room-1", matches: [] as any[] }]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinMatch, setJoinMatch] = useState<any | null>(null);
  const [joinTimer, setJoinTimer] = useState(30);

  const currentRoom = rooms[currentRoomIdx];
  const worldLobby = useMemo(() => rooms.flatMap((r) => r.matches.map((m) => ({ ...m, roomName: r.name }))), [rooms]);

  const handleCreateMatch = (payload: any) => {
    const newMatch = {
      id: `m-${Date.now()}`,
      createdBy: payload.createdBy || username,
      game: payload.game,
      modeType: payload.modeType,
      legs: payload.legs,
      startingScore: payload.startingScore,
      createdAt: Date.now(),
    };
    setRooms((prev) => prev.map((r, idx) => (idx === currentRoomIdx ? { ...r, matches: [newMatch, ...r.matches] } : r)));
  };

  const newRoom = () => {
    setRooms((prev) => {
      const id = prev.length + 1;
      return [...prev, { id, name: `room-${id}`, matches: [] }];
    });
    setCurrentRoomIdx(rooms.length);
  };

  // Join timer
  useEffect(() => {
    if (!joinMatch) return;
    setJoinTimer(30);
    const t = setInterval(() => setJoinTimer((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [joinMatch]);

  const handleJoinAccept = () => {
    // For now, just close modal; in real app we'd start the match
    setJoinMatch(null);
  };

  return (
    <div className="flex-1 min-h-0" style={{ position: "relative", marginTop: 0 }}>
      <div className="card ndn-game-shell relative overflow-hidden h-full flex flex-col">
        <h2 className="text-3xl font-bold text-brand-700 mb-4">Online Play</h2>
        <div className="ndn-shell-body flex-1 overflow-hidden p-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 h-full min-h-[320px] overflow-auto">
            {/* Top row: Room, New Room, Create Match */}
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="text-sm opacity-80">Room</div>
                <div className="px-3 py-1 bg-white/5 rounded border border-white/10">{currentRoom?.name}</div>
                <div style={{ width: 12 }} />
                <button className="btn btn-ghost" onClick={newRoom}>New Room</button>
              </div>
              <div className="ml-auto">
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>Create Match +</button>
              </div>
            </div>

            <p className="mb-2" />
            <h3 className="font-semibold underline mb-3">World Lobby</h3>

            <div className="space-y-3">
              {worldLobby.length === 0 ? (
                <div className="text-sm opacity-60">No matches found.</div>
              ) : (
                worldLobby.map((m) => (
                  <div key={m.id} className="p-3 rounded bg-white/3 border flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">{m.game} {m.modeType === 'bestof' ? '(Best Of)' : '(First To)'} - {m.legs} legs</div>
                      <div className="text-xs opacity-70">Created by: {m.createdBy} • Room: {m.roomName}</div>
                    </div>
                    <div className="ml-4">
                      <button className="btn btn-sm" onClick={() => setJoinMatch(m)}>Join Now!</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Create Match modal */}
        <CreateMatchModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={(p) => { handleCreateMatch(p); setShowCreateModal(false); }} />

        {/* Join Modal (simplified) */}
        {joinMatch && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
              <div className="text-lg font-bold mb-2">Join Match</div>
              <div className="mb-3">{joinMatch.game} - {joinMatch.modeType} • {joinMatch.legs} legs</div>
              <div className="text-sm opacity-80 mb-3">Created by {joinMatch.createdBy}</div>
              <div className="mb-3">Camera calibration: <span className="text-green-400">Calibrated</span></div>
              <div className="mb-3">Timer: <span className="font-mono">{joinTimer}s</span></div>
              {joinTimer <= 15 && (
                <div className="mb-3">Choose: <button className="btn btn-ghost mr-2">Bull Up</button><button className="btn btn-ghost">Skip</button></div>
              )}
              <div className="flex items-center gap-2">
                <button className="btn btn-primary" onClick={handleJoinAccept}>Accept</button>
                <button className="btn btn-ghost" onClick={() => setJoinMatch(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
