import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Zap,
  Target,
  Trophy,
  Users,
  Clock,
  ChevronDown,
} from "lucide-react";
import CreateMatchModal from "./ui/CreateMatchModal.js";
import MatchStartShowcase from "./ui/MatchStartShowcase.js";
import MatchPrestart from "./ui/MatchPrestart.js";
import { useMatch } from "../store/match.js";
import { useWS } from "./WSProvider.js";
import { launchInPlayDemo } from "../utils/inPlayDemo.js";
import { openMatchWindow } from "../utils/matchWindow.js";

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
  const showDemoControls =
    (import.meta as any).env?.DEV ||
    String(user?.email || "").toLowerCase() === "daviesfamily108@gmail.com";

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

  // Auto-open the dedicated match window for online X01 matches.
  useEffect(() => {
    if (!inProgress) return;
    try {
      const st = useMatch.getState();
      const game = ((st as any)?.game || "X01") as string;
      if (game !== "X01") return;
      if (!st.roomId) return;

      const flagKey = `ndn:matchWindowOpened:${st.roomId}`;
      if (window.sessionStorage.getItem(flagKey) === "1") return;
      window.sessionStorage.setItem(flagKey, "1");
      openMatchWindow();
    } catch {}
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
  // Keep latest matches in a ref so the WS listener can update synchronously
  // for tests (avoids a stale closure / async state timing issue).
  const serverMatchesRef = useRef<any[]>([]);
  useEffect(() => {
    serverMatchesRef.current = serverMatches || [];
  }, [serverMatches]);
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
  const [bullTied, setBullTied] = useState(false);

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
  // NOTE: This is a *UX* hint for when to show a "room is full" message.
  // We do not hard-cap rendering at this number (tests and pagination rely on
  // the full list being renderable).
  const maxMatchesPerRoom = 999;

  const normalizeMatch = React.useCallback((m: any) => {
    if (!m) return m;
    const modeType = m.modeType || m.mode || "";
    const legs = m.legs ?? m.value ?? m.bestOf ?? m.sets ?? m.games ?? 1;
    const createdBy = m.createdBy || m.creatorName || m.creator || m.host || "";
    const createdAt = m.createdAt || m.ts || Date.now();

    return {
      ...m,
      modeType,
      mode: modeType || m.mode,
      legs,
      value: typeof m.value === "number" ? m.value : legs,
      createdBy,
      creatorName: m.creatorName || createdBy,
      createdAt,
    };
  }, []);

  const filterMatches = useMemo(() => {
    return (list: any[] = []) =>
      (list || [])
        .map(normalizeMatch)
        .filter(
          (m: any) =>
            !(
              m?.isTest ||
              m?.test ||
              m?.migrated ||
              m?.isMigration ||
              m?.migration ||
              m?.seeded ||
              (typeof m?.createdBy === "string" &&
                m.createdBy.toLowerCase().includes("test")) ||
              (typeof m?.creatorName === "string" &&
                m.creatorName.toLowerCase().includes("test")) ||
              (typeof m?.createdBy === "string" &&
                /^(alice-|host-|demo|dummy|sample)/i.test(m.createdBy)) ||
              (typeof m?.creatorName === "string" &&
                /^(alice-|host-|demo|dummy|sample)/i.test(m.creatorName)) ||
              !(m?.game && m?.modeType && m?.legs)
            ),
        );
    // NOTE: do NOT hard-cap here; tests and pagination expect the full
    // list to render (page size controls how many are visible).
  }, [normalizeMatch]);

  // NOTE: worldLobby was previously used for an alternate lobby view; keep the
  // computation removed to avoid unused-vars warnings.

  // Combined matches: show only current room, filtered
  const combinedMatches = useMemo(() => {
    let all = filterMatches(currentRoom?.matches || []);

    // In WS-driven mode, serverMatches is the canonical list. Fall back to it
    // if the current room hasn't been hydrated yet.
    if ((all?.length || 0) === 0 && (serverMatches?.length || 0) > 0) {
      all = filterMatches(serverMatches);
    }

    // Last-resort fallback for test environments where state updates are
    // async and the memo can run before serverMatches is visible.
    if (
      (all?.length || 0) === 0 &&
      (serverMatchesRef.current?.length || 0) > 0
    ) {
      all = filterMatches(serverMatchesRef.current);
    }

    // 1. Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      all = all.filter(
        (m: any) =>
          (m.game || "").toLowerCase().includes(q) ||
          (m.createdBy || m.creatorName || "").toLowerCase().includes(q) ||
          (m.id || "").toLowerCase().includes(q),
      );
    }

    // 2. Filter Game
    if (filterGame !== "all") {
      all = all.filter((m: any) => (m.game || "").toLowerCase() === filterGame);
    }

    // 3. Filter Mode
    if (filterMode !== "all") {
      // normalize modeType. Some might be 'first_to' or 'bestof'
      all = all.filter((m: any) => {
        const mt = (m.modeType || "").replace("_", "").toLowerCase(); // 'firstto', 'bestof'
        const target = filterMode.replace("_", "").toLowerCase();
        return mt.includes(target);
      });
    }

    // 4. Sort
    all = (all || []).slice();
    all.sort((a: any, b: any) => {
      const tA = a.createdAt || 0;
      const tB = b.createdAt || 0;
      return sortBy === "newest" ? tB - tA : tA - tB;
    });

    return all.slice(0, maxMatchesPerRoom);
  }, [
    currentRoom,
    serverMatches,
    filterMatches,
    searchQuery,
    filterGame,
    filterMode,
    sortBy,
    maxMatchesPerRoom,
  ]);

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
    setServerMatches([]);
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
          const filtered = filterMatches(msg.matches || []);
          setServerMatches(filtered);
          serverMatchesRef.current = filtered;
          setRooms((prev) =>
            prev.map((r, idx) =>
              idx === currentRoomIdx ? { ...r, matches: filtered } : r,
            ),
          );
        }
        if (msg?.type === "match-prestart") {
          // Someone accepted the invite; show prestart and update join match if it matches
          const m = normalizeMatch(msg.match || null);
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
          setBullTied(false);
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
          setBullWinner(msg.winnerName || msg.winnerId || null);
          setBullActive(false);
          setBullThrown(false);
          setBullTied(false);
        }
        if (msg?.type === "prestart-bull-tie") {
          // reset to allow another round
          setBullWinner(null);
          setBullActive(false);
          setBullThrown(false);
          setBullTied(true);
          // Auto-reset tied state after 2s so the dartboard reappears
          setTimeout(() => setBullTied(false), 2000);
        }
      } catch (err) {}
    });
    return unsub;
  }, [wsGlobal, joinChoice, filterMatches, currentRoomIdx]);

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
    // MatchPrestart overlay handles the pre-game flow now; MatchStartShowcase
    // is shown later when the user accepts via handleJoinAccept.
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

  const runOnlineInPlayDemo = () => {
    launchInPlayDemo({
      players: [username, "Opponent"],
      startingScore: 501,
      roomId: "online-demo",
      visits: [{ score: 60 }, { score: 85 }, { score: 100 }],
    });
  };

  return (
    <div
      className="flex-1 min-h-0 ndn-page"
      style={{ position: "relative", marginTop: 0 }}
    >
      <div className="card ndn-game-shell relative overflow-hidden md:overflow-hidden overflow-y-auto h-full flex flex-col">
        {showStartShowcase && (
          <MatchStartShowcase
            players={(players || []) as any}
            user={user}
            onDone={() => setShowStartShowcase(false)}
            onRequestClose={() => setShowStartShowcase(false)}
          />
        )}
        <h2 className="text-3xl font-bold text-black dark:text-white mb-4 ndn-section-title">
          Online Lobby 🌐
        </h2>
        <div className="ndn-shell-body flex-1 overflow-hidden p-3 pb-0">
          <div className="h-full flex flex-col gap-3">
            {/* Top row: Room, New Room, Create Match */}
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm text-white/70">Room</div>
                <div className="px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50 text-white/90 font-medium">
                  Room ({currentRoom?.id})
                </div>
                <button
                  className="btn btn-ghost btn-sm rounded-lg"
                  onClick={newRoom}
                >
                  New Room
                </button>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  className="btn btn-sm bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-sm flex items-center gap-2 rounded-lg"
                  onClick={() => setShowCreateModal(true)}
                  disabled={
                    (currentRoom?.matches?.length || 0) >= maxMatchesPerRoom
                  }
                >
                  <Trophy className="w-4 h-4" />
                  Create Match +
                </button>
                {showDemoControls && (
                  <button
                    className="btn btn-sm btn-ghost rounded-lg"
                    onClick={runOnlineInPlayDemo}
                  >
                    Demo In-Play
                  </button>
                )}
                {(currentRoom?.matches?.length || 0) >= maxMatchesPerRoom && (
                  <div className="text-xs text-rose-400">
                    Room full — create a new room
                  </div>
                )}
              </div>
            </div>

            {/* Filters & Controls */}
            {!inProgress && (
              <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800/50 flex flex-col gap-3">
                <div className="ndn-filterbar">
                  <div className="flex-1 min-w-[240px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="Search matches, players..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700/50 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      className="input input-compact cursor-pointer font-semibold bg-slate-950/80 border border-slate-700/50 rounded-lg"
                      value={filterGame}
                      onChange={(e) => setFilterGame(e.target.value as any)}
                    >
                      <option value="all">All Games</option>
                      <option value="x01">X01</option>
                      <option value="cricket">Cricket</option>
                      <option value="bermuda">Bermuda</option>
                      <option value="gotcha">Gotcha</option>
                    </select>
                    <select
                      className="input input-compact cursor-pointer font-semibold bg-slate-950/80 border border-slate-700/50 rounded-lg"
                      value={filterMode}
                      onChange={(e) => setFilterMode(e.target.value as any)}
                    >
                      <option value="all">All Modes</option>
                      <option value="first_to">First To</option>
                      <option value="best_of">Best Of</option>
                    </select>
                    <select
                      className="input input-compact cursor-pointer font-semibold bg-slate-950/80 border border-slate-700/50 rounded-lg"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${focusMode ? "bg-red-600 text-white border-red-500" : "bg-slate-950/80 border-slate-700/50 text-white/80 hover:bg-slate-900"}`}
                      onClick={() => setFocusMode((s) => !s)}
                      aria-pressed={focusMode}
                      title="Toggle focus mode: hide small details and show focused view"
                    >
                      {focusMode ? "Exit Focus" : "Focus Mode"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-sm bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-sm flex items-center gap-2 px-4 rounded-lg"
                      onClick={handleQuickJoin}
                      disabled={combinedMatches.length === 0}
                    >
                      <Zap className="w-4 h-4 fill-current" />
                      Quick Join
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto flex flex-col">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Active Matches �️
              </h3>
              <div className="flex-1 p-4 rounded-lg border border-slate-800/50 bg-slate-900/30 flex flex-col">
                <div className="flex-1 overflow-auto">
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
                          <div className="pointer-events-auto bg-red-600/95 text-white px-6 py-3 rounded-none shadow-lg text-lg font-bold transform transition-all duration-200 ease-out">
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
                        className={`ndn-card-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-h-[28rem] overflow-auto p-1 ${focusMode ? "opacity-90" : ""}`}
                        data-testid="matches-grid"
                      >
                        {paginatedMatches.map((m: any) => (
                          <div
                            key={m.id}
                            className="group relative p-4 rounded-lg border border-slate-700/30 bg-slate-950/40 hover:border-indigo-500/50 hover:bg-slate-900/50 transition-all duration-150 shadow-sm hover:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.4)] flex flex-col gap-3 min-h-[6.5rem]"
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
                                <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-none bg-slate-950 border border-slate-850 text-white/70">
                                  {m.roomName}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-1 text-sm text-white/70 bg-transparent border-t border-slate-850 pt-2">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded-none bg-white/5 text-xs font-medium border border-slate-850">
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
                                  className="btn btn-sm bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-sm px-4 rounded-none"
                                  onClick={() => requestJoin(m)}
                                >
                                  Join
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
                                className={`w-8 h-8 rounded-none text-xs font-bold transition-all border border-slate-850 ${
                                  currentPage === p
                                    ? "bg-indigo-600 text-white shadow-sm"
                                    : "bg-slate-950 text-white/70 hover:bg-slate-900"
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

        {/* Modern join / prestart overlay */}
        <MatchPrestart
          open={!!joinMatch}
          matchInfo={joinMatch}
          localUser={user}
          opponentName={
            joinMatch?.createdBy ||
            joinMatch?.creatorName ||
            (joinMatch?.creatorId
              ? participants[joinMatch.creatorId] || joinMatch.creatorId
              : "Opponent")
          }
          countdown={15}
          onChoice={sendPrestartChoice}
          onBullThrow={(distanceMm: number) => {
            try {
              if (wsGlobal?.connected && joinMatch?.id) {
                wsGlobal.send({
                  type: "prestart-bull-throw",
                  roomId: joinMatch.id,
                  score: distanceMm,
                });
              }
            } catch {}
            setBullLocalThrow(distanceMm);
            setBullThrown(true);
          }}
          onAccept={handleJoinAccept}
          onCancel={() => setJoinMatch(null)}
          remoteChoice={Object.values(remoteChoices)[0] || null}
          bullActive={bullActive}
          bullWinner={bullWinner}
          bullTied={bullTied}
        />
      </div>
    </div>
  );
}
