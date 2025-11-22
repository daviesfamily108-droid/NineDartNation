import React, { useState, useMemo, useEffect } from "react";
import CreateMatchModal from "./ui/CreateMatchModal";
import GameCalibrationStatus from "./GameCalibrationStatus";

export default function OnlinePlayClean({ user }: { user?: any }) {
  const username = user?.username || "You";
  const [currentRoomIdx, setCurrentRoomIdx] = useState(0);
  const [rooms, setRooms] = useState(() => [{ id: 1, name: "room-1", matches: [] as any[] }]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinMatch, setJoinMatch] = useState<any | null>(null);
  const [joinTimer, setJoinTimer] = useState(30);
  const [joinChoice, setJoinChoice] = useState<null | "bull" | "skip">(null);
  const [opponentChoice, setOpponentChoice] = useState<null | "bull" | "skip">(null);

  const currentRoom = rooms[currentRoomIdx];
  const maxMatchesPerRoom = 8;
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
      const newRooms = [...prev, { id, name: `room-${id}`, matches: [] }];
      setCurrentRoomIdx(newRooms.length - 1);
      return newRooms;
    });
  };

  // Join timer
  useEffect(() => {
    if (!joinMatch) return;
    setJoinTimer(30);
    setJoinChoice(null);
    setOpponentChoice(null);
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
                <div className="px-3 py-1 bg-white/5 rounded border border-white/10">Room ({currentRoom?.id})</div>
                <div style={{ width: 12 }} />
                <button className="btn btn-ghost" onClick={newRoom}>New Room</button>
              </div>
              <div className="ml-auto">
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} disabled={(currentRoom?.matches?.length || 0) >= maxMatchesPerRoom}>Create Match +</button>
                {((currentRoom?.matches?.length || 0) >= maxMatchesPerRoom) && <div className="text-xs text-rose-400 mt-1">Room full — create a new room</div>}
              </div>
            </div>

            <p className="mb-2" />
            <h3 className="font-semibold underline mb-3">Matches in this Room</h3>
            <div className="space-y-3 mb-4">
              {(currentRoom?.matches?.length || 0) === 0 ? (
                <div className="text-sm opacity-60">No matches in this room yet.</div>
              ) : (
                currentRoom.matches.map((m:any) => (
                  <div key={m.id} className="p-3 rounded bg-white/3 border flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">{m.game} {m.modeType === 'bestof' ? '(Best Of)' : '(First To)'} - {m.legs} legs</div>
                      {m.startingScore && (
                        <div className="text-xs opacity-80">Starting: <span className="font-mono">{m.startingScore}</span></div>
                      )}
                      <div className="text-xs opacity-70">Created by: {m.createdBy}</div>
                    </div>
                    <div className="ml-4">
                      <button className="btn btn-sm" onClick={() => setJoinMatch(m)}>Join Now!</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <h3 className="font-semibold underline mb-3">World Lobby</h3>

            <div className="space-y-3">
              {worldLobby.length === 0 ? (
                <div className="text-sm opacity-60">No matches found.</div>
              ) : (
                worldLobby.map((m) => (
                  <div key={m.id} className="p-3 rounded bg-white/3 border flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">{m.game} {m.modeType === 'bestof' ? '(Best Of)' : '(First To)'} - {m.legs} legs</div>
                      {m.startingScore && (
                        <div className="text-xs opacity-80">Starting: <span className="font-mono">{m.startingScore}</span></div>
                      )}
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
              <div className="mb-3"><GameCalibrationStatus gameMode={joinMatch.game} compact /></div>
              {joinMatch.startingScore && (
                <div className="mb-3">Starting score: <span className="font-mono">{joinMatch.startingScore}</span></div>
              )}
              <div className="mb-3">Timer: <span className="font-mono">{joinTimer}s</span></div>
              {joinTimer <= 15 && (
                <div className="mb-3">Choose: <div className="flex gap-2">
                  <button className={`btn ${joinChoice === "bull" ? "btn-primary" : "btn-ghost"}`} onClick={() => setJoinChoice("bull")}>Bull Up</button>
                  <button className={`btn ${joinChoice === "skip" ? "btn-primary" : "btn-ghost"}`} onClick={() => setJoinChoice("skip")}>Skip</button>
                </div>
                <div className="text-xs opacity-70 mt-2">{joinChoice ? `You chose: ${joinChoice}` : "Please choose Bull Up or Skip before accepting"}</div>
                {joinChoice === "skip" && (
                  <div className="text-xs opacity-70 mt-2">Skip requires both players to click Skip. Waiting for other player…</div>
                )}
                {joinChoice === "skip" && opponentChoice === "skip" && (
                  <div className="text-sm font-semibold mt-2">Both players skipped — Left player throws first</div>
                )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button className="btn btn-primary" onClick={handleJoinAccept} disabled={joinTimer <= 15 && !joinChoice}>Accept</button>
                <button className="btn btn-ghost" onClick={() => setJoinMatch(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
