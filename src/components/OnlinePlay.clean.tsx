import React, { useState, useMemo, useEffect } from "react";
import CreateMatchModal from "./ui/CreateMatchModal";
import GameCalibrationStatus from "./GameCalibrationStatus";
import MatchStartShowcase from "./ui/MatchStartShowcase";
import { useMatch } from "../store/match";
import { useWS } from "./WSProvider";

export default function OnlinePlayClean({ user }: { user?: any }) {
  const username = user?.username || "You";
  const [currentRoomIdx, setCurrentRoomIdx] = useState(0);
  const [rooms, setRooms] = useState(() => [{ id: 1, name: "room-1", matches: [] as any[] }]);
  const wsGlobal = (() => { try { return useWS() } catch { return null } })()
  const [serverMatches, setServerMatches] = useState<any[]>([]);
  const inProgress = useMatch((s) => s.inProgress);
  const players = useMatch((s) => s.players);
  const [showStartShowcase, setShowStartShowcase] = useState<boolean>(false);
  const startedShowcasedRef = React.useRef(false);
  useEffect(() => {
    if (!inProgress) return;
    if (startedShowcasedRef.current) return;
    startedShowcasedRef.current = true;
    setShowStartShowcase(true);
  }, [inProgress]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinMatch, setJoinMatch] = useState<any | null>(null);
  const joinAcceptRef = React.useRef<HTMLButtonElement | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [joinTimer, setJoinTimer] = useState(30);
  const serverPrestartRef = React.useRef(false);
  const [joinChoice, setJoinChoice] = useState<null | "bull" | "skip">(null);
  const [remoteChoices, setRemoteChoices] = useState<Record<string, "bull" | "skip">>({});
  const [bullActive, setBullActive] = useState(false);
  const [bullThrow, setBullThrow] = useState<number | null>(null);
  const [bullWinner, setBullWinner] = useState<string | null>(null);
  const [bullLocalThrow, setBullLocalThrow] = useState<number | null>(null);
  const [bullThrown, setBullThrown] = useState(false);

  const currentRoom = rooms[currentRoomIdx];
  const maxMatchesPerRoom = 8;
  const worldLobby = useMemo(() => {
    if (serverMatches && serverMatches.length) return serverMatches as any[];
    return rooms.flatMap((r) => r.matches.map((m) => ({ ...m, roomName: r.name })));
  }, [rooms, serverMatches]);

  const combinedMatches = useMemo(() => {
    const local = currentRoom?.matches || [];
    // Merge, preferring local room matches first, then add any worldLobby entries not already in local by id
    const ids = new Set(local.map((m: any) => m.id));
    return [...local, ...(worldLobby || []).filter((m: any) => !ids.has(m.id))];
  }, [currentRoom, worldLobby]);

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
    // Optimistically add to current room
    setRooms((prev) => prev.map((r, idx) => (idx === currentRoomIdx ? { ...r, matches: [newMatch, ...r.matches] } : r)));
    // If we have a server WS connection, send a create-match message
    try {
      if (wsGlobal?.connected) {
        wsGlobal.send({ type: 'create-match', game: payload.game, mode: payload.modeType, value: payload.legs, startingScore: payload.startingScore, creatorAvg: payload.avgChoice || 0 });
      }
    } catch {}
  };

  const newRoom = () => {
    setRooms((prev) => {
      const id = prev.length + 1;
      const newRooms = [...prev, { id, name: `room-${id}`, matches: [] }];
      setCurrentRoomIdx(newRooms.length - 1);
      return newRooms;
    });
  };

  // WS: subscribe to lobby and prestart events
  useEffect(() => {
    if (!wsGlobal) return;
    if (wsGlobal.connected) wsGlobal.send({ type: 'list-matches' });
    const unsub = wsGlobal.addListener((msg) => {
      try {
        if (msg?.type === 'joined') {
          if (msg.id) setSelfId(msg.id)
        }
        if (msg?.type === 'presence') {
          // presence carries id and username
          try {
            if (msg.id) setParticipants(prev => ({ ...prev, [msg.id]: msg.username || msg.name || msg.id }))
          } catch {}
        }
        if (msg?.type === 'matches') {
          setServerMatches(msg.matches || []);
        }
  if (msg?.type === 'match-prestart') {
          // Someone accepted the invite; show prestart and update join match if it matches
          const m = msg.match || null;
          if (m) m.prestartEndsAt = msg.prestartEndsAt;
          // Ensure we know the creator's username
          try { if (m?.creatorId && m?.creatorName) setParticipants(prev => ({ ...prev, [m.creatorId]: m.creatorName })) } catch {}
          serverPrestartRef.current = true;
          setJoinMatch(m);
          const endsAt = msg.prestartEndsAt || Date.now();
          setJoinTimer(Math.max(0, Math.ceil(((endsAt || Date.now()) - Date.now()) / 1000)));
          setTimeout(() => { serverPrestartRef.current = false; }, 0);
          // store on joinMatch as prestartEndsAt
          // reset diffuse state
          setJoinChoice(null);
          setRemoteChoices({});
          setBullActive(false);
          setBullThrow(null);
          setBullWinner(null);
        }
        if (msg?.type === 'match-start') {
          // If the started match matches our current join request, close the modal
          if (joinMatch && msg.roomId === joinMatch.id) {
            setJoinMatch(null);
            setJoinChoice(null);
            setRemoteChoices({});
            // (joinPrestart ends were attached to joinMatch; no-op)
          }
        }
        if (msg?.type === 'prestart-choice-notify') {
          const { roomId, playerId, choice } = msg;
          if (!roomId || !choice) return;
          setRemoteChoices((prev) => ({ ...(prev || {}), [playerId]: choice }));
        }
        if (msg?.type === 'prestart-bull') {
          setBullActive(true);
          setBullThrown(false);
          setBullLocalThrow(null);
        }
        if (msg?.type === 'prestart-bull-winner') {
          setBullWinner(msg.winnerId || null);
          setBullActive(false);
          setBullThrown(false);
        }
        if (msg?.type === 'prestart-bull-tie') {
          // reset to allow another round
          setBullWinner(null);
          setBullActive(false);
          setBullThrown(false);
        }
      } catch (err) {}
    });
    return unsub;
  }, [wsGlobal, joinChoice]);

  // Join timer
  useEffect(() => {
    if (!joinMatch) return;
    if (serverPrestartRef.current) return;
    // If a server-supplied prestart exists, do not override joinTimer
    if ((joinMatch as any).prestartEndsAt) return;
    setJoinTimer(30);
    setJoinChoice(null);
    setRemoteChoices({});
    const t = setInterval(() => setJoinTimer((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [joinMatch]);

  // Focus the accept button when the join modal is shown
  useEffect(() => {
    if (!joinMatch) return;
    setTimeout(() => joinAcceptRef.current?.focus(), 0);
  }, [joinMatch]);

  const handleJoinAccept = () => {
    // Send accept (invite-response) to server if we have a match prestart
    try {
      if (wsGlobal?.connected && joinMatch?.id) {
        wsGlobal.send({ type: 'invite-response', matchId: joinMatch.id, accept: true, toId: joinMatch.creatorId });
      }
    } catch {}
  setJoinMatch(null);
  };

  const requestJoin = (m: any) => {
    setJoinMatch(m);
    try {
      if (wsGlobal?.connected) {
        wsGlobal.send({ type: 'join-match', matchId: m.id, calibrated: true });
      }
    } catch {}
  }

  const sendPrestartChoice = (choice: 'bull' | 'skip') => {
    setJoinChoice(choice);
    try {
      if (wsGlobal?.connected && joinMatch?.id) {
        wsGlobal.send({ type: 'prestart-choice', roomId: joinMatch.id, choice });
      }
    } catch {}
  }

  // No local state for the start showcase; MatchStartShowcase reads from `match.inProgress` directly

  return (
    <div className="flex-1 min-h-0" style={{ position: "relative", marginTop: 0 }}>
      <div className="card ndn-game-shell relative overflow-hidden h-full flex flex-col">
        {showStartShowcase && (
          <MatchStartShowcase
            players={(players || []) as any}
            user={user}
            onDone={() => setShowStartShowcase(false)}
            onRequestClose={() => setShowStartShowcase(false)}
          />
        )}
  <h2 className="text-3xl font-bold text-black dark:text-white mb-4">Online Play</h2>
  <div className="ndn-shell-body flex-1 overflow-hidden p-3 pb-0">
          <div className="rounded-xl border border-slate-700 bg-black/10 p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Top row: Room, New Room, Create Match */}
            <div className="mb-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                <div className="text-sm opacity-80">Room</div>
                <div className="px-3 py-1 bg-white/5 rounded border border-white/10">Room ({currentRoom?.id})</div>
                <div style={{ width: 12 }} />
                <button className="btn btn-ghost" onClick={newRoom}>New Room</button>
              </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} disabled={(currentRoom?.matches?.length || 0) >= maxMatchesPerRoom}>Create Match +</button>
                  {((currentRoom?.matches?.length || 0) >= maxMatchesPerRoom) && <div className="text-xs text-rose-400 mt-1">Room full — create a new room</div>}
                </div>
            </div>

            <p className="mb-2" />
              <div className="flex-1 overflow-auto">
              <h3 className="font-semibold underline mb-3">Matches in this Room</h3>
              <div className="flex-1 overflow-auto mb-3 p-3 rounded-xl border border-slate-700 bg-black/10">
              <div className="space-y-3 mb-4">
              {(combinedMatches.length || 0) === 0 ? (
                <div className="text-sm opacity-60">No matches in this room yet.</div>
              ) : (
                combinedMatches.map((m:any) => (
                  <div key={m.id} className="p-3 rounded border bg-black/10 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">{m.game} {m.modeType === 'bestof' ? '(Best Of)' : '(First To)'} - {m.legs} legs</div>
                      {m.startingScore && (
                        <div className="text-xs opacity-80">Starting: <span className="font-mono">{m.startingScore}</span></div>
                      )}
                      <div className="text-xs opacity-70">Created by: {m.createdBy}</div>
                    </div>
                    <div className="ml-4">
                      <button className="btn btn-sm" onClick={() => requestJoin(m)}>Join Now!</button>
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Create Match modal */}
        <CreateMatchModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={(p) => { handleCreateMatch(p); setShowCreateModal(false); }} />

        {/* Join Modal (simplified) */}
        {joinMatch && (
          <div role="dialog" aria-modal="true" aria-labelledby="join-heading" tabIndex={-1} className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
              <div id="join-heading" className="text-lg font-bold mb-2">Join Match</div>
              <div className="mb-3">{joinMatch.game} - {joinMatch.modeType} • {joinMatch.legs} legs</div>
              <div className="text-sm opacity-80 mb-3">Created by {joinMatch.createdBy}</div>
              <div className="mb-3"><GameCalibrationStatus gameMode={joinMatch.game} compact /></div>
              {joinMatch.startingScore && (
                <div className="mb-3">Starting score: <span className="font-mono">{joinMatch.startingScore}</span></div>
              )}
                {/* Match start showcase overlay */}
                <MatchStartShowcase
                  open={showStartShowcase}
                  players={players as any}
                  user={user}
                  onRequestClose={() => {}}
                  onDone={() => {}}
                />
              <div className="mb-3">Timer: <span className="font-mono">{joinTimer}s</span></div>
              {(joinTimer <= 15 || (joinMatch as any)?.prestartEndsAt) && (
                <div className="mb-3">Choose: <div className="flex gap-2">
                  <button className={`btn ${joinChoice === "bull" ? "btn-primary" : "btn-ghost"}`} onClick={() => sendPrestartChoice("bull")}>Bull Up</button>
                  <button className={`btn ${joinChoice === "skip" ? "btn-primary" : "btn-ghost"}`} onClick={() => sendPrestartChoice("skip")}>Skip</button>
                </div>
                <div className="text-xs opacity-70 mt-2">{joinChoice ? `You chose: ${joinChoice}` : "Please choose Bull Up or Skip before accepting"}</div>
                {Object.keys(remoteChoices).length > 0 && (
                  <div className="text-xs opacity-70 mt-2" role="status" aria-live="polite">{
                    Object.entries(remoteChoices).map(([pid, choice]) => (
                      <div key={pid}>{(participants[pid] || pid)} chose: {choice}</div>
                    ))
                  }</div>
                )}
                {joinChoice === "skip" && (
                  <div className="text-xs opacity-70 mt-2">Skip requires both players to click Skip. Waiting for other player…</div>
                )}
                {joinChoice === "skip" && Object.values(remoteChoices).some((c) => c === "skip") && (
                  <div className="text-sm font-semibold mt-2">Both players skipped — Left player throws first</div>
                )}
                {bullActive && (
                  <div className="text-xs opacity-70 mt-2">
                    Bull Up active —{bullThrown ? ` you threw ${bullLocalThrow ?? 50}` : ' throw to win the bull!'}
                  </div>
                )}
                {bullActive && !bullThrown && (
                  <div className="flex items-center gap-2 mt-2">
                    <input className="input input-sm" aria-label="bull-throw" type="number" min={0} max={50} value={bullThrow ?? 50} onChange={(e) => setBullThrow(Math.max(0, Math.min(50, Number(e.target.value || 0))))} />
                    <button className="btn btn-primary" onClick={() => {
                      try { if (wsGlobal?.connected && joinMatch?.id) wsGlobal.send({ type: 'prestart-bull-throw', roomId: joinMatch.id, score: bullThrow ?? 50 }) } catch {}
                      setBullLocalThrow(bullThrow ?? 50)
                      setBullThrown(true)
                    }}>Throw Bull</button>
                  </div>
                )}
                {bullThrown && (
                  <div className="text-sm font-semibold mt-2 animate-pulse">You threw: {bullLocalThrow ?? 50}</div>
                )}
                {bullWinner && (
                  <div className="text-sm font-semibold mt-2">Bull winner: {bullWinner}</div>
                )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button ref={joinAcceptRef} aria-label="Accept invitation" className="btn btn-primary" onClick={handleJoinAccept} disabled={joinTimer <= 15 && !joinChoice}>Accept</button>
                <button className="btn btn-ghost" onClick={() => { setJoinMatch(null); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
