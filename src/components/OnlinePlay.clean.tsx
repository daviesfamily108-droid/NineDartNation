import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Filter,
  Zap,
  Target,
  Trophy,
  Users,
  Clock,
  ChevronDown,
} from "lucide-react";
import CreateMatchModal from "./ui/CreateMatchModal";
import GameCalibrationStatus from "./GameCalibrationStatus";
import MatchStartShowcase from "./ui/MatchStartShowcase";
import { useMatch } from "../store/match";
import { useWS } from "./WSProvider";

export default function OnlinePlayClean({ user }: { user?: any }) {
  const username = user?.username || "You";
  const [currentRoomIdx, setCurrentRoomIdx] = useState(0);
  const [rooms, setRooms] = useState(() => [
    { id: 1, name: "room-1", matches: [] as any[] },
  ]);
  const wsGlobal = (() => {
    try {
      return useWS();
    } catch {
      return null;
    }
  })();
  const [serverMatches, setServerMatches] = useState<any[]>([]);
  const inProgress = useMatch((s) => s.inProgress);
  const players = useMatch((s) => s.players);
  const [focusMode, setFocusMode] = useState(false);
  const matchesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focusMode) return;
    function onDocClick(e: MouseEvent) {
      try {
        if (!matchesRef.current) return;
        if (!matchesRef.current.contains(e.target as Node)) {
          setFocusMode(false);
        }
      } catch {}
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [focusMode]);
  const [showStartShowcase, setShowStartShowcase] = useState<boolean>(false);
  const startedShowcasedRef = React.useRef(false);
  useEffect(() => {
    if (!inProgress) return;
    if (startedShowcasedRef.current) return;
    startedShowcasedRef.current = true;
    setShowStartShowcase(true);
  }, [inProgress]);

  // Allow the overlay to show again the next time a match starts.
  useEffect(() => {
    if (inProgress) return;
    startedShowcasedRef.current = false;
  }, [inProgress]);

  // Announce presence to server so it knows our username
  useEffect(() => {
    if (wsGlobal?.connected && user?.username) {
      try {
        wsGlobal.send({
          type: "presence",
          username: user.username,
          email: user.email || "",
        });
      } catch {}
    }
  }, [wsGlobal?.connected, user]);

  // Global quit handler (from CameraView Quit / Pause modal)
  useEffect(() => {
    const onQuit = () => {
      try {
        useMatch.getState().endGame();
      } catch (e) {}
    };
    try {
      window.addEventListener("ndn:match-quit" as any, onQuit as any);
    } catch {}
    return () => {
      try {
        window.removeEventListener("ndn:match-quit" as any, onQuit as any);
      } catch {}
    };
  }, []);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinMatch, setJoinMatch] = useState<any | null>(null);
  const joinAcceptRef = React.useRef<HTMLButtonElement | null>(null);
  const [_selfId, setSelfId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [joinTimer, setJoinTimer] = useState(30);
  const serverPrestartRef = React.useRef(false);
  const [joinChoice, setJoinChoice] = useState<null | "bull" | "skip">(null);
  const [remoteChoices, setRemoteChoices] = useState<
    Record<string, "bull" | "skip">
  >({});
  const [bullActive, setBullActive] = useState(false);
  const [bullThrow, setBullThrow] = useState<number | null>(null);
  const [bullWinner, setBullWinner] = useState<string | null>(null);
  const [bullLocalThrow, setBullLocalThrow] = useState<number | null>(null);
  const [bullThrown, setBullThrown] = useState(false);

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGame, setFilterGame] = useState<
    "all" | "x01" | "cricket" | "bermuda" | "gotcha"
  >("all");
  const [filterMode, setFilterMode] = useState<"all" | "first_to" | "best_of">(
    "all",
  );
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 16;

  const currentRoom = rooms[currentRoomIdx];
  const maxMatchesPerRoom = 16; // Updated to 16 as requested
  const worldLobby = useMemo(() => {
    if (serverMatches && serverMatches.length) return serverMatches as any[];
    return rooms.flatMap((r) =>
      r.matches.map((m) => ({ ...m, roomName: r.name })),
    );
  }, [rooms, serverMatches]);

  // Combined matches: current room first, then world lobby matches that are not in current room
  const combinedMatches = useMemo(() => {
    const local = currentRoom?.matches || [];
    const ids = new Set(local.map((m: any) => m.id));
    const others = (worldLobby || []).filter((m: any) => !ids.has(m.id));
    let all = [...local, ...others];

    // 1. Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      all = all.filter(
        (m) =>
          (m.game || "").toLowerCase().includes(q) ||
          (m.createdBy || m.creatorName || "").toLowerCase().includes(q) ||
          (m.id || "").toLowerCase().includes(q),
      );
    }

    // 2. Filter Game
    if (filterGame !== "all") {
      all = all.filter((m) => (m.game || "").toLowerCase() === filterGame);
    }

    // 3. Filter Mode
    if (filterMode !== "all") {
      // normalize modeType. Some might be 'first_to' or 'bestof'
      all = all.filter((m) => {
        const mt = (m.modeType || "").replace("_", "").toLowerCase(); // 'firstto', 'bestof'
        const target = filterMode.replace("_", "").toLowerCase();
        return mt.includes(target);
      });
    }

    // 4. Sort
    all.sort((a, b) => {
      const tA = a.createdAt || 0;
      const tB = b.createdAt || 0;
      return sortBy === "newest" ? tB - tA : tA - tB;
    });

    return all;
  }, [currentRoom, worldLobby, searchQuery, filterGame, filterMode, sortBy]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterGame, filterMode, sortBy, currentRoomIdx]);

  const totalPages = Math.ceil(combinedMatches.length / itemsPerPage);
  const paginatedMatches = combinedMatches.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleQuickJoin = () => {
    if (combinedMatches.length > 0) {
      requestJoin(combinedMatches[0]);
    }
  };

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

    // Only add optimistically if we are NOT connected to the server
    // Otherwise, we wait for the server to broadcast the new match to avoid duplicates
    if (!wsGlobal?.connected) {
      setRooms((prev) =>
        prev.map((r, idx) =>
          idx === currentRoomIdx
            ? { ...r, matches: [newMatch, ...r.matches] }
            : r,
        ),
      );
    }

    // If we have a server WS connection, send a create-match message
    try {
      if (wsGlobal?.connected) {
        // Ensure presence is sent before creating match to guarantee correct attribution
        if (user?.username) {
          wsGlobal.send({
            type: "presence",
            username: user.username,
            email: user.email || "",
          });
        }

        wsGlobal.send({
          type: "create-match",
          game: payload.game,
          mode: payload.modeType,
          value: payload.legs,
          startingScore: payload.startingScore,
          creatorAvg: payload.avgChoice || 0,
        });
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
    if (wsGlobal.connected) wsGlobal.send({ type: "list-matches" });
    const unsub = wsGlobal.addListener((msg) => {
      try {
        if (msg?.type === "joined") {
          if (msg.id) setSelfId(msg.id);
        }
        if (msg?.type === "presence") {
          // presence carries id and username
          try {
            if (msg.id)
              setParticipants((prev) => ({
                ...prev,
                [msg.id]: msg.username || msg.name || msg.id,
              }));
          } catch {}
        }
        if (msg?.type === "matches") {
          setServerMatches(msg.matches || []);
        }
        if (msg?.type === "match-prestart") {
          // Someone accepted the invite; show prestart and update join match if it matches
          const m = msg.match || null;
          if (m) m.prestartEndsAt = msg.prestartEndsAt;
          // Ensure we know the creator's username
          try {
            if (m?.creatorId && m?.creatorName)
              setParticipants((prev) => ({
                ...prev,
                [m.creatorId]: m.creatorName,
              }));
          } catch {}
          serverPrestartRef.current = true;
          setJoinMatch(m);
          const endsAt = msg.prestartEndsAt || Date.now();
          setJoinTimer(
            Math.max(
              0,
              Math.ceil(((endsAt || Date.now()) - Date.now()) / 1000),
            ),
          );
          setTimeout(() => {
            serverPrestartRef.current = false;
          }, 0);
          // store on joinMatch as prestartEndsAt
          // reset diffuse state
          setJoinChoice(null);
          setRemoteChoices({});
          setBullActive(false);
          setBullThrow(null);
          setBullWinner(null);
        }
        if (msg?.type === "match-start") {
          // If the started match matches our current join request, close the modal
          if (joinMatch && msg.roomId === joinMatch.id) {
            setJoinMatch(null);
            setJoinChoice(null);
            setRemoteChoices({});
            // (joinPrestart ends were attached to joinMatch; no-op)
          }
        }
        if (msg?.type === "prestart-choice-notify") {
          const { roomId, playerId, choice } = msg;
          if (!roomId || !choice) return;
          setRemoteChoices((prev) => ({ ...(prev || {}), [playerId]: choice }));
        }
        if (msg?.type === "prestart-bull") {
          setBullActive(true);
          setBullThrown(false);
          setBullLocalThrow(null);
        }
        if (msg?.type === "prestart-bull-winner") {
          setBullWinner(msg.winnerId || null);
          setBullActive(false);
          setBullThrown(false);
        }
        if (msg?.type === "prestart-bull-tie") {
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
    // Show the pre-game overlay immediately for snappy UX.
    setShowStartShowcase(true);
    // Send accept (invite-response) to server if we have a match prestart
    try {
      if (wsGlobal?.connected && joinMatch?.id) {
        wsGlobal.send({
          type: "invite-response",
          matchId: joinMatch.id,
          accept: true,
          toId: joinMatch.creatorId,
        });
      }
    } catch {}
    setJoinMatch(null);
  };

  const requestJoin = (m: any) => {
    setJoinMatch(m);
    // Show the pre-game overlay immediately while the server processes the join.
    setShowStartShowcase(true);
    try {
      if (wsGlobal?.connected) {
        // Ensure presence is sent before joining
        if (user?.username) {
          wsGlobal.send({
            type: "presence",
            username: user.username,
            email: user.email || "",
          });
        }
        wsGlobal.send({ type: "join-match", matchId: m.id, calibrated: true });
      }
    } catch {}
  };

  const sendPrestartChoice = (choice: "bull" | "skip") => {
    setJoinChoice(choice);
    try {
      if (wsGlobal?.connected && joinMatch?.id) {
        wsGlobal.send({
          type: "prestart-choice",
          roomId: joinMatch.id,
          choice,
        });
      }
    } catch {}
  };

  // No local state for the start showcase; MatchStartShowcase reads from `match.inProgress` directly

  return (
    <div
      className="flex-1 min-h-0"
      style={{ position: "relative", marginTop: 0 }}
    >
      <div className="card ndn-game-shell relative overflow-hidden h-full flex flex-col">
        {showStartShowcase && (
          <MatchStartShowcase
            players={(players || []) as any}
            user={user}
            onDone={() => setShowStartShowcase(false)}
            onRequestClose={() => setShowStartShowcase(false)}
          />
        )}
        <h2 className="text-3xl font-bold text-black dark:text-white mb-4">
          Online Lobby 🌐
        </h2>
        <div className="ndn-shell-body flex-1 overflow-hidden p-3 pb-0">
          <div className="rounded-xl border border-slate-700 bg-black/10 p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Top row: Room, New Room, Create Match */}
            <div className="mb-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40 flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm opacity-80">Room</div>
                <div className="px-3 py-1 bg-white/5 rounded border border-white/10">
                  Room ({currentRoom?.id})
                </div>
                <div style={{ width: 12 }} />
                <button className="btn btn-ghost" onClick={newRoom}>
                  New Room 🚪
                </button>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  className="btn btn-primary flex items-center gap-2"
                  onClick={() => setShowCreateModal(true)}
                  disabled={
                    (currentRoom?.matches?.length || 0) >= maxMatchesPerRoom
                  }
                >
                  <Trophy className="w-4 h-4" />
                  Create Match + ⚔️
                </button>
                {(currentRoom?.matches?.length || 0) >= maxMatchesPerRoom && (
                  <div className="text-xs text-rose-400 mt-1">
                    Room full — create a new room
                  </div>
                )}
              </div>
            </div>

            <p className="mb-2" />

            {/* Filters & Controls */}
            {!inProgress && (
              <div className="mb-4 p-3 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/5 flex flex-col gap-3 shadow-lg">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="Search matches, players..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-lg shadow-indigo-500/20 flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                    onClick={handleQuickJoin}
                    disabled={combinedMatches.length === 0}
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span className="font-medium">Quick Join ⚡</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <select
                      className="input input-compact cursor-pointer font-bold"
                      value={filterGame}
                      onChange={(e) => setFilterGame(e.target.value as any)}
                    >
                      <option value="all">All Games 🎯</option>
                      <option value="x01">X01</option>
                      <option value="cricket">Cricket</option>
                      <option value="bermuda">Bermuda</option>
                      <option value="gotcha">Gotcha</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="input input-compact cursor-pointer font-bold"
                      value={filterMode}
                      onChange={(e) => setFilterMode(e.target.value as any)}
                    >
                      <option value="all">All Modes 🏆</option>
                      <option value="first_to">First To</option>
                      <option value="best_of">Best Of</option>
                    </select>
                  </div>

                  <div className="flex-1" />
                  <div className="flex items-center gap-2">
                    <button
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${focusMode ? "bg-red-600 text-white" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                      onClick={() => setFocusMode((s) => !s)}
                      aria-pressed={focusMode}
                      title="Toggle focus mode: hide small details and show focused view"
                    >
                      {focusMode ? "Exit Focus 🔍" : "Focus Mode 🔍"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="input input-compact cursor-pointer font-bold"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                    >
                      <option value="newest">Newest First 🆕</option>
                      <option value="oldest">Oldest First</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Active Matches �️
              </h3>
              <div className="mb-3 p-1 rounded-xl border border-slate-700/50 bg-black/10">
                <div className="mb-4">
                  {(combinedMatches.length || 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center opacity-60">
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <Target className="w-8 h-8 text-white/20" />
                      </div>
                      <p className="text-lg font-medium mb-1">
                        No matches found
                      </p>
                      <p className="text-sm max-w-xs mx-auto">
                        Create a new match to get started or try adjusting your
                        filters.
                      </p>
                    </div>
                  ) : null}

                  {(combinedMatches.length || 0) !== 0 && (
                    <div className="relative">
                      {focusMode && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                          <div className="pointer-events-auto bg-red-600/95 text-white px-6 py-3 rounded-lg shadow-lg text-lg font-bold transform transition-all duration-200 ease-out">
                            <button
                              onClick={() => setFocusMode(false)}
                              className="w-full text-center"
                            >
                              FOCUS MODE — Click to exit
                            </button>
                          </div>
                        </div>
                      )}
                      <div
                        ref={matchesRef}
                        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[28rem] overflow-auto p-2 ${focusMode ? "opacity-90" : ""}`}
                        data-testid="matches-grid"
                      >
                        {paginatedMatches.map((m: any) => (
                          <div
                            key={m.id}
                            className="group relative p-5 rounded-xl border border-white/5 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:from-slate-800 hover:to-slate-900 transform transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col gap-4 h-24"
                            data-testid={`match-${m.id}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-3">
                                  {!focusMode && (
                                    <div className="w-9 h-9 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:border-indigo-500/40 transition-colors text-xs font-bold">
                                      {m.createdBy
                                        ? (m.createdBy || "U")
                                            .substring(0, 2)
                                            .toUpperCase()
                                        : (m.creatorName || "U")
                                            .substring(0, 2)
                                            .toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                                      {m.game}
                                    </div>
                                    <div className="text-xs text-white/50 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {new Date(m.createdAt).toLocaleTimeString(
                                        [],
                                        { hour: "2-digit", minute: "2-digit" },
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {m.roomName && (
                                <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60">
                                  {m.roomName}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-1 text-sm text-white/70 bg-black/20 p-2 rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-medium">
                                  {m.modeType === "bestof"
                                    ? "Best Of"
                                    : "First To"}
                                </span>
                                <span className="font-mono text-indigo-300">
                                  {m.legs}
                                </span>
                                <span>legs</span>
                                {m.startingScore && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                    <span className="font-mono text-amber-300">
                                      {m.startingScore}
                                    </span>
                                  </>
                                )}
                              </div>
                              {!focusMode && (
                                <div className="text-xs text-white/40 flex items-center gap-1 mt-1">
                                  <Users className="w-3 h-3" />
                                  Created by:{" "}
                                  <span className="text-white/60">
                                    {m.createdBy || m.creatorName || "Unknown"}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                              <div className="flex items-center gap-2 min-w-0">
                                {!focusMode && (
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white">
                                      {(m.createdBy || m.creatorName || "U")
                                        .substring(0, 2)
                                        .toUpperCase()}
                                    </div>
                                    <span className="text-xs text-white/60 truncate max-w-[120px]">
                                      {m.createdBy || m.creatorName}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-end">
                                <button
                                  className="btn btn-sm bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-lg shadow-indigo-500/20 px-4"
                                  onClick={() => requestJoin(m)}
                                >
                                  Join ⚔️
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-4 pt-2 border-t border-white/5">
                      <button
                        className="btn btn-sm btn-ghost text-white/60 hover:text-white disabled:opacity-30"
                        disabled={currentPage === 1}
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                      >
                        <ChevronDown className="w-4 h-4 rotate-90" />
                        Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from(
                          { length: Math.min(5, totalPages) },
                          (_, i) => {
                            // Logic to show window of pages around current
                            let p = i + 1;
                            if (totalPages > 5) {
                              if (currentPage > 3) p = currentPage - 2 + i;
                              if (p > totalPages) p = totalPages - 4 + i;
                            }
                            return (
                              <button
                                key={p}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                  currentPage === p
                                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                                    : "bg-white/5 text-white/60 hover:bg-white/10"
                                }`}
                                onClick={() => setCurrentPage(p)}
                              >
                                {p}
                              </button>
                            );
                          },
                        )}
                      </div>
                      <button
                        className="btn btn-sm btn-ghost text-white/60 hover:text-white disabled:opacity-30"
                        disabled={currentPage === totalPages}
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        Next
                        <ChevronDown className="w-4 h-4 -rotate-90" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {/* World Lobby removed: combined matches are displayed above */}
            </div>
          </div>
        </div>

        {/* Create Match modal */}
        <CreateMatchModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={(p) => {
            handleCreateMatch(p);
            setShowCreateModal(false);
          }}
        />

        {/* Join Modal (simplified) */}
        {joinMatch && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-heading"
            tabIndex={-1}
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
          >
            <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
              <div id="join-heading" className="text-lg font-bold mb-2">
                Join Match ⚔️
              </div>
              <div className="mb-3">
                {joinMatch.game} - {joinMatch.modeType} · {joinMatch.legs} legs
              </div>
              <div className="text-sm opacity-80 mb-3">
                Created by {joinMatch.createdBy}
              </div>
              <div className="mb-3">
                <GameCalibrationStatus gameMode={joinMatch.game} compact />
              </div>
              {joinMatch.startingScore && (
                <div className="mb-3">
                  Starting score:{" "}
                  <span className="font-mono">{joinMatch.startingScore}</span>
                </div>
              )}
              {/* Match start showcase overlay */}
              <MatchStartShowcase
                open={showStartShowcase}
                players={players as any}
                user={user}
                onRequestClose={() => {}}
                onDone={() => {}}
              />
              <div className="mb-3">
                Timer: <span className="font-mono">{joinTimer}s</span>
              </div>
              {(joinTimer <= 15 || (joinMatch as any)?.prestartEndsAt) && (
                <div className="mb-3">
                  Choose:{" "}
                  <div className="flex gap-2">
                    <button
                      className={`btn ${joinChoice === "bull" ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => sendPrestartChoice("bull")}
                    >
                      Bull Up
                    </button>
                    <button
                      className={`btn ${joinChoice === "skip" ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => sendPrestartChoice("skip")}
                    >
                      Skip
                    </button>
                  </div>
                  <div className="text-xs opacity-70 mt-2">
                    {joinChoice
                      ? `You chose: ${joinChoice}`
                      : "Please choose Bull Up or Skip before accepting"}
                  </div>
                  {Object.keys(remoteChoices).length > 0 && (
                    <div
                      className="text-xs opacity-70 mt-2"
                      role="status"
                      aria-live="polite"
                    >
                      {Object.entries(remoteChoices).map(([pid, choice]) => (
                        <div key={pid}>
                          {participants[pid] || pid} chose: {choice}
                        </div>
                      ))}
                    </div>
                  )}
                  {joinChoice === "skip" && (
                    <div className="text-xs opacity-70 mt-2">
                      Skip requires both players to click Skip. Waiting for
                      other player…
                    </div>
                  )}
                  {joinChoice === "skip" &&
                    Object.values(remoteChoices).some((c) => c === "skip") && (
                      <div className="text-sm font-semibold mt-2">
                        Both players skipped — Left player throws first
                      </div>
                    )}
                  {bullActive && (
                    <div className="text-xs opacity-70 mt-2">
                      Bull Up active —
                      {bullThrown
                        ? ` you threw ${bullLocalThrow ?? 50}`
                        : " throw to win the bull!"}
                    </div>
                  )}
                  {bullActive && !bullThrown && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        className="input input-sm"
                        aria-label="bull-throw"
                        type="number"
                        min={0}
                        max={50}
                        value={bullThrow ?? 50}
                        onChange={(e) =>
                          setBullThrow(
                            Math.max(
                              0,
                              Math.min(50, Number(e.target.value || 0)),
                            ),
                          )
                        }
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          try {
                            if (wsGlobal?.connected && joinMatch?.id)
                              wsGlobal.send({
                                type: "prestart-bull-throw",
                                roomId: joinMatch.id,
                                score: bullThrow ?? 50,
                              });
                          } catch {}
                          setBullLocalThrow(bullThrow ?? 50);
                          setBullThrown(true);
                        }}
                      >
                        Throw Bull
                      </button>
                    </div>
                  )}
                  {bullThrown && (
                    <div className="text-sm font-semibold mt-2 animate-pulse">
                      You threw: {bullLocalThrow ?? 50}
                    </div>
                  )}
                  {bullWinner && (
                    <div className="text-sm font-semibold mt-2">
                      Bull winner: {bullWinner}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  ref={joinAcceptRef}
                  aria-label="Accept invitation"
                  className="btn btn-primary"
                  onClick={handleJoinAccept}
                  disabled={joinTimer <= 15 && !joinChoice}
                >
                  Accept
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setJoinMatch(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
