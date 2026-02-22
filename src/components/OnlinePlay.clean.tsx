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
import { getGameDisplay } from "../utils/games.js";
import CreateMatchModal from "./ui/CreateMatchModal.js";
import MatchStartShowcase from "./ui/MatchStartShowcase.js";
import MatchPrestart from "./ui/MatchPrestart.js";
import InGameShell from "./InGameShell.js";
import { useMatch } from "../store/match.js";
import { useMatchControl } from "../store/matchControl.js";
import { useWS } from "./WSProvider.js";
import { launchInPlayDemo } from "../utils/inPlayDemo.js";
import { openMatchWindow } from "../utils/matchWindow.js";

export default function OnlinePlayClean({ user }: { user?: any }) {
  const username = user?.username || "You";
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pages, setPages] = useState(() => [
    { id: 1, name: "page-1", matches: [] as any[] },
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
  const matchContext = useMatch((s) => s.matchContext);
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
    if (!inProgress || matchContext !== "online") {
      startedShowcasedRef.current = false;
      setShowStartShowcase(false);
      return;
    }
    if (startedShowcasedRef.current) return;
    // Only show the showcase if the match hasn't progressed yet
    const st = useMatch.getState();
    const hasVisits = (st.players || []).some((p: any) =>
      (p.legs || []).some((L: any) => (L.visits || []).length > 0),
    );
    if (hasVisits) return;
    startedShowcasedRef.current = true;
    setShowStartShowcase(true);
  }, [inProgress, matchContext]);

  // Auto-open the dedicated match window for online X01 matches.
  useEffect(() => {
    if (!inProgress || matchContext !== "online") return;
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
  }, [inProgress, matchContext]);

  // Allow the overlay to show again the next time a match starts.
  useEffect(() => {
    if (inProgress && matchContext === "online") return;
    startedShowcasedRef.current = false;
  }, [inProgress, matchContext]);

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

  // Signal to App.tsx that OnlinePlay is mounted so it doesn't double-dispatch
  // invite/prestart events (OnlinePlay's own WS listener handles them directly)
  useEffect(() => {
    (window as any).__ndn_online_mounted = true;
    return () => {
      (window as any).__ndn_online_mounted = false;
    };
  }, []);

  // Global quit handler (from CameraView Quit / Pause modal)
  useEffect(() => {
    const onQuit = () => {
      try {
        useMatch.getState().endGame();
      } catch (e) {}
      // Clear all prestart / invite state to prevent phantom popups
      setPendingInvite(null);
      setWaitingForCreator(null);
      setJoinMatch(null);
      setJoinChoice(null);
      setOpponentQuitName(null);
      pendingMatchRef.current = null;
      try {
        (window as any).__ndn_pending_invite = null;
      } catch {}
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
  // Incoming invite popup: shown to the creator when a joiner wants to join
  const [pendingInvite, setPendingInvite] = useState<any | null>(null);
  // Waiting state: shown to the joiner while waiting for the creator to accept
  const [waitingForCreator, setWaitingForCreator] = useState<string | null>(
    null,
  );
  // Preserve match info across handleJoinAccept → match-start gap
  // (handleJoinAccept clears joinMatch before the server sends match-start)
  const pendingMatchRef = useRef<any | null>(null);
  const [_selfId, setSelfId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [joinTimer, setJoinTimer] = useState(30);
  // Keep latest matches in a ref so the WS listener can update synchronously
  // for tests (avoids a stale closure / async state timing issue).
  const serverMatchesRef = useRef<any[]>([]);
  useEffect(() => {
    serverMatchesRef.current = serverMatches || [];
  }, [serverMatches]);
  // Keep pendingMatchRef in sync with joinMatch so the WS listener
  // (which has a stale closure over joinMatch) can always read current data.
  useEffect(() => {
    if (joinMatch) pendingMatchRef.current = { ...joinMatch };
  }, [joinMatch]);
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
  // Opponent quit notification — shown when the remote player leaves mid-match
  const [opponentQuitName, setOpponentQuitName] = useState<string | null>(null);
  // Track the active game mode for the current match (e.g. 'X01', 'Cricket', 'Around the Clock')
  const [currentGame, setCurrentGame] = useState<string>("X01");
  // Opponent camera frame (base64 JPEG snapshot relayed via WS)
  const [opponentFrame, setOpponentFrame] = useState<string | null>(null);

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
  const itemsPerPage = 12;

  const currentPage_ = pages[currentPageIdx];
  // NOTE: This is a *UX* hint for when to show a "page is full" message.
  // We do not hard-cap rendering at this number (tests and pagination rely on
  // the full list being renderable).
  const maxMatchesPerPage = 999;

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
              m?.status === "completed" ||
              m?.status === "played" ||
              (m?.declineCount && m.declineCount >= 3) ||
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

  // Combined matches: show only current page, filtered
  const combinedMatches = useMemo(() => {
    let all = filterMatches(currentPage_?.matches || []);

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

    return all.slice(0, maxMatchesPerPage);
  }, [
    currentPage_,
    serverMatches,
    filterMatches,
    searchQuery,
    filterGame,
    filterMode,
    sortBy,
    maxMatchesPerPage,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterGame, filterMode, sortBy, currentPageIdx]);

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
      setPages((prev) =>
        prev.map((r, idx) =>
          idx === currentPageIdx
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

  const newPage = () => {
    setServerMatches([]);
    setPages((prev) => {
      const id = prev.length + 1;
      const newPages = [...prev, { id, name: `page-${id}`, matches: [] }];
      setCurrentPageIdx(newPages.length - 1);
      return newPages;
    });
  };

  // Shared handler for invite / prestart messages
  const handleInviteOrPrestart = React.useCallback(
    (msg: any) => {
      try {
        console.log("[OnlinePlay] handleInviteOrPrestart:", msg?.type, msg);
        if (msg?.type === "invite") {
          // Creator receives an invite — show accept/decline popup
          const inviteData = {
            id: msg.matchId,
            game: msg.game,
            mode: msg.mode || "firstto",
            value: msg.value || 1,
            startingScore: msg.startingScore || 501,
            fromName: msg.fromName || "Opponent",
            fromId: msg.fromId,
          };
          setPendingInvite(inviteData);
          // Play a notification sound if available
          try {
            const audio = new Audio("/sounds/notify.mp3");
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch {}
        }
        if (msg?.type === "invite-waiting") {
          // Joiner is waiting for the creator to accept
          setWaitingForCreator(msg.creatorName || "Creator");
        }
        if (msg?.type === "match-prestart") {
          // Ignore if a match is already running (prevents phantom prestart
          // after quitting a match while a stale server message arrives)
          if (useMatch.getState().inProgress) return;
          // Both players enter prestart after creator accepted the invite
          setPendingInvite(null);
          setWaitingForCreator(null);
          const m = normalizeMatch(msg.match || null);
          if (m) m.prestartEndsAt = msg.prestartEndsAt;
          // Determine if the local user is the creator so we can set the
          // correct opponent name and send the right toId in handleJoinAccept
          if (m) {
            const localName = (user?.username || "").toLowerCase();
            const creatorLower = (
              m.creatorName ||
              m.createdBy ||
              ""
            ).toLowerCase();
            if (localName && creatorLower === localName) {
              m._isCreatorView = true;
            }
          }
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
          setJoinChoice(null);
          setRemoteChoices({});
          setBullActive(false);
          setBullThrow(null);
          setBullWinner(null);
          setBullTied(false);
        }
        if (msg?.type === "invite-expired") {
          setPendingInvite(null);
          setWaitingForCreator(null);
          setJoinMatch((prev: any) =>
            prev && msg.matchId === prev.id ? null : prev,
          );
        }
        if (msg?.type === "declined") {
          setPendingInvite(null);
          setWaitingForCreator(null);
          setJoinMatch((prev: any) =>
            prev && msg.matchId === prev.id ? null : prev,
          );
        }
      } catch {}
    },
    [normalizeMatch, user],
  );

  // Shared handler for match-start messages (used by WS listener and forwarded events)
  const handleMatchStart = React.useCallback(
    (msg: any) => {
      if (msg?.type !== "match-start") return;
      // Prevent double-init if match is already running
      if (useMatch.getState().inProgress) return;

      const serverMatch = msg.match || {};
      const saved = pendingMatchRef.current || {};
      const roomId = msg.roomId || saved.id || "";
      const startScore =
        serverMatch.startingScore || saved.startingScore || 501;
      const localName = username;
      const creatorName =
        serverMatch.creatorName || saved.creatorName || saved.createdBy || "";
      const joinerName = serverMatch.joinerName || saved.joinerName || "";

      // Determine player order: first thrower goes first
      // Dev server sends firstPlayerId, deployed server sends firstThrowerId
      const firstId = msg.firstThrowerId || msg.firstPlayerId || null;
      const isLocalCreator =
        saved._isCreatorView ||
        creatorName.toLowerCase() === localName.toLowerCase();
      const opponentName = isLocalCreator
        ? joinerName || "Opponent"
        : creatorName || "Opponent";

      let localGoesFirst: boolean;
      if (firstId) {
        const creatorId = serverMatch.creatorId || saved.creatorId;
        localGoesFirst = isLocalCreator
          ? firstId === creatorId
          : firstId !== creatorId;
      } else {
        localGoesFirst = isLocalCreator;
      }

      const playerNames = localGoesFirst
        ? [localName, opponentName]
        : [opponentName, localName];

      // Initialize the match in the store — sets inProgress = true
      try {
        useMatch.getState().newMatch(playerNames, startScore, roomId, "online");
      } catch (e) {
        console.error("[OnlinePlay] newMatch failed:", e);
      }

      // Track the game mode for this match
      const gameMode = serverMatch.game || saved.game || "X01";
      setCurrentGame(gameMode);

      // Join the WS room so we receive real-time score updates
      try {
        if (wsGlobal?.connected) {
          wsGlobal.send({ type: "join", roomId });
        }
      } catch {}

      // Clean up prestart state
      pendingMatchRef.current = null;
      setJoinMatch(null);
      setJoinChoice(null);
      setRemoteChoices({});
    },
    [username, wsGlobal],
  );

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
          setPages((prev) =>
            prev.map((r, idx) =>
              idx === currentPageIdx ? { ...r, matches: filtered } : r,
            ),
          );
        }
        // Invite / prestart / expired / declined
        handleInviteOrPrestart(msg);

        if (msg?.type === "match-start") {
          handleMatchStart(msg);
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
        // Opponent quit — show overlay so this player can leave gracefully
        if (msg?.type === "opponent-quit") {
          setOpponentQuitName(msg.quitterName || "Opponent");
        }
        // Opponent paused — sync pause state locally
        if (msg?.type === "opponent-paused") {
          try {
            useMatchControl
              .getState()
              .setPaused(true, null, msg.pauserName || "Opponent");
          } catch {}
        }
        // Opponent resumed — sync unpause state locally
        if (msg?.type === "opponent-unpaused") {
          try {
            useMatchControl.getState().setPaused(false, null);
          } catch {}
        }
        // Incoming match state from opponent — sync scores/turns
        if (msg?.type === "state" && msg.payload) {
          try {
            useMatch.getState().importState(msg.payload);
          } catch {}
        }
        // Opponent camera frame snapshot
        if (msg?.type === "camera-frame" && msg.frame) {
          setOpponentFrame(msg.frame);
        }
      } catch (err) {}
    });
    return unsub;
  }, [
    wsGlobal,
    joinChoice,
    filterMatches,
    currentPageIdx,
    handleInviteOrPrestart,
    handleMatchStart,
  ]);

  // Listen for forwarded invite/prestart/match-start events from App.tsx (global listener)
  // This fires when the user is on a different tab and App.tsx switches to
  // the online tab + dispatches the WS message via a CustomEvent.
  // Also check for a stashed pending message on mount (the event may have fired
  // before this component mounted).
  useEffect(() => {
    // Check for a pending message stashed by App.tsx before we mounted
    try {
      const pending = (window as any).__ndn_pending_invite;
      if (pending) {
        (window as any).__ndn_pending_invite = null;
        if (pending.type === "match-start") {
          handleMatchStart(pending);
        } else {
          handleInviteOrPrestart(pending);
        }
      }
    } catch {}

    const onInviteEvent = (e: Event) => {
      try {
        const msg = (e as CustomEvent).detail;
        if (!msg) return;
        if (msg.type === "match-start") {
          handleMatchStart(msg);
        } else {
          handleInviteOrPrestart(msg);
        }
      } catch {}
    };
    window.addEventListener("ndn:match-invite", onInviteEvent);
    return () => window.removeEventListener("ndn:match-invite", onInviteEvent);
  }, [handleInviteOrPrestart, handleMatchStart]);

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
    // Save match info so the match-start handler can use it after joinMatch is cleared
    if (joinMatch) {
      pendingMatchRef.current = { ...joinMatch };
    }
    // Send accept (invite-response) to server
    try {
      if (wsGlobal?.connected && joinMatch?.id) {
        // If the local user is the creator accepting an invite, toId is the joiner
        // If the local user is the joiner, toId is the creator
        const isCreatorAccepting = !!joinMatch._isCreatorView;
        wsGlobal.send({
          type: "invite-response",
          matchId: joinMatch.id,
          accept: true,
          toId: isCreatorAccepting ? joinMatch.joinerId : joinMatch.creatorId,
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

  const sendState = React.useCallback(() => {
    try {
      if (wsGlobal?.connected) {
        const st = useMatch.getState();
        wsGlobal.send({ type: "state", payload: st });
      }
    } catch {}
  }, [wsGlobal]);

  // Periodically capture local camera frames and send to opponent via WS
  useEffect(() => {
    if (!inProgress || matchContext !== "online") return;
    if (!wsGlobal?.connected) return;
    const iv = setInterval(() => {
      try {
        const dbg = (window as any).__ndn_camera_debug;
        const video = dbg?.videoEl?.() as HTMLVideoElement | null;
        if (!video || !video.videoWidth || !video.videoHeight) return;
        const w = 320;
        const h = Math.round((video.videoHeight / video.videoWidth) * w) || 180;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const frame = c.toDataURL("image/jpeg", 0.4);
        wsGlobal.send({ type: "camera-frame", frame });
      } catch {}
    }, 1500);
    return () => clearInterval(iv);
  }, [inProgress, matchContext, wsGlobal]);

  // Clear opponent frame when match ends
  useEffect(() => {
    if (!inProgress || matchContext !== "online") {
      setOpponentFrame(null);
    }
  }, [inProgress, matchContext]);

  const runOnlineInPlayDemo = () => {
    launchInPlayDemo({
      players: [username, "Opponent"],
      startingScore: 501,
      roomId: "online-demo",
      visits: [{ score: 60 }, { score: 85 }, { score: 100 }],
    });
  };

  // ── When a match is in progress, render the full in-game shell ──
  // Only show InGameShell if the match was started from OnlinePlay (context === 'online').
  // This prevents offline or tournament matches from falsely rendering here.
  if (inProgress && matchContext === "online") {
    const matchState = useMatch.getState();
    const localIdx = (matchState.players || []).findIndex(
      (p: any) => p?.name && p.name.toLowerCase() === username.toLowerCase(),
    );
    return (
      <>
        <InGameShell
          user={user}
          showStartShowcase={showStartShowcase}
          onShowStartShowcaseChange={setShowStartShowcase}
          onCommitVisit={(score, _darts, _meta) => {
            try {
              const m = useMatch.getState();
              const p = m.players[m.currentPlayerIdx];
              const leg = p?.legs?.[p.legs.length - 1];
              const preRem = leg ? leg.totalScoreRemaining : m.startingScore;
              const postRem = Math.max(0, preRem - score);
              const attempts = preRem <= 50 ? 3 : postRem <= 50 ? 1 : 0;
              const finished = postRem === 0;
              m.addVisit(score, 3, {
                preOpenDarts: 0,
                doubleWindowDarts: attempts,
                finishedByDouble: finished,
                visitTotal: score,
              });
              if (leg && leg.totalScoreRemaining === 0) {
                m.endLeg(score);
              } else {
                m.nextPlayer();
              }
            } catch {
              useMatch.getState().addVisit(score, 3);
              useMatch.getState().nextPlayer();
            }
            sendState();
          }}
          onQuit={() => {
            try {
              useMatch.getState().endGame();
            } catch {}
            // Notify opponent via WebSocket
            try {
              if (wsGlobal?.connected) {
                wsGlobal.send({ type: "match-quit" });
              }
            } catch {}
            // Clear any stale prestart / invite state so popups don't reappear
            setPendingInvite(null);
            setWaitingForCreator(null);
            setJoinMatch(null);
            setJoinChoice(null);
            setOpponentQuitName(null);
            pendingMatchRef.current = null;
            try {
              (window as any).__ndn_pending_invite = null;
            } catch {}
            sendState();
            try {
              window.dispatchEvent(new Event("ndn:match-quit"));
            } catch {}
          }}
          onPause={() => {
            try {
              useMatchControl.getState().setPaused(true, null, username);
            } catch {}
            // Notify opponent via WebSocket
            try {
              if (wsGlobal?.connected) {
                wsGlobal.send({ type: "match-pause" });
              }
            } catch {}
          }}
          onResume={() => {
            try {
              useMatchControl.getState().setPaused(false, null);
            } catch {}
            // Notify opponent via WebSocket
            try {
              if (wsGlobal?.connected) {
                wsGlobal.send({ type: "match-unpause" });
              }
            } catch {}
          }}
          onStateChange={sendState}
          localPlayerIndexOverride={localIdx >= 0 ? localIdx : undefined}
          gameModeOverride={currentGame}
          isOnline={true}
          remoteFrame={opponentFrame}
        />
        {/* Opponent quit overlay */}
        {opponentQuitName && (
          <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 text-center shadow-2xl">
              <div className="text-4xl mb-3">🚪</div>
              <h3 className="text-lg font-bold text-white mb-2">
                {opponentQuitName} left the match
              </h3>
              <p className="text-sm text-white/60 mb-5">
                Your opponent has quit. You can leave the match now.
              </p>
              <button
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-all"
                onClick={() => {
                  try {
                    useMatch.getState().endGame();
                  } catch {}
                  setOpponentQuitName(null);
                  setPendingInvite(null);
                  setWaitingForCreator(null);
                  setJoinMatch(null);
                  setJoinChoice(null);
                  pendingMatchRef.current = null;
                  try {
                    (window as any).__ndn_pending_invite = null;
                  } catch {}
                  try {
                    window.dispatchEvent(new Event("ndn:match-quit"));
                  } catch {}
                }}
              >
                Leave Match
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

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
            {/* Top row: Page, New Page, Create Match */}
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm text-white/70">Page</div>
                <div className="px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50 text-white/90 font-medium">
                  Page {currentPage_?.id}
                </div>
                <button
                  className="btn btn-ghost btn-sm rounded-lg"
                  onClick={newPage}
                >
                  New Page
                </button>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  className="btn btn-sm bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-sm flex items-center gap-2 rounded-lg"
                  onClick={() => setShowCreateModal(true)}
                  disabled={
                    (currentPage_?.matches?.length || 0) >= maxMatchesPerPage
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
                {(currentPage_?.matches?.length || 0) >= maxMatchesPerPage && (
                  <div className="text-xs text-rose-400">
                    Page full — create a new page
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
                      <option value="x01">
                        {getGameDisplay("X01").emoji} X01
                      </option>
                      <option value="cricket">
                        {getGameDisplay("Cricket").emoji} Cricket
                      </option>
                      <option value="bermuda">
                        {getGameDisplay("Bermuda").emoji} Bermuda
                      </option>
                      <option value="gotcha">
                        {getGameDisplay("Gotcha").emoji} Gotcha
                      </option>
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
                            className="group relative p-4 rounded-lg border ndn-lobby-card hover:border-indigo-500/50 transition-all duration-150 shadow-sm hover:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.4)] flex flex-col gap-3 min-h-[6.5rem]"
                            data-testid={`match-${m.id}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-3">
                                  {!focusMode && (
                                    <div
                                      className="w-9 h-9 rounded-full flex items-center justify-center border group-hover:border-opacity-60 transition-colors text-sm"
                                      style={{
                                        backgroundColor: `${getGameDisplay(m.game).color}15`,
                                        borderColor: `${getGameDisplay(m.game).color}30`,
                                      }}
                                    >
                                      {getGameDisplay(m.game).emoji}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div
                                      className="font-bold group-hover:text-indigo-300 transition-colors truncate"
                                      style={{
                                        color: getGameDisplay(m.game).color,
                                      }}
                                    >
                                      {getGameDisplay(m.game).emoji} {m.game}
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

        {/* ── Incoming invite popup (creator sees this) ── */}
        {pendingInvite && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md mx-4 p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-indigo-500/30 shadow-2xl shadow-indigo-500/20">
              {/* Glow accent */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 ring-2 ring-indigo-500/30">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">
                      Match Invite!
                    </h3>
                    <p className="text-sm text-white/60">
                      Someone wants to play
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                      {(pendingInvite.fromName || "?")
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-white text-lg">
                        {pendingInvite.fromName || "Opponent"}
                      </div>
                      <div className="text-xs text-white/50">
                        wants to join your match
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-sm text-white/70">
                    <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 font-medium">
                      {pendingInvite.game || "X01"}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                      {pendingInvite.mode === "bestof" ? "Best Of" : "First To"}{" "}
                      {pendingInvite.value || 1}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 font-mono text-amber-300">
                      {pendingInvite.startingScore || 501}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-lg shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:scale-[1.02] active:scale-95"
                    onClick={() => {
                      // Send invite-accept to start prestart for both
                      try {
                        if (wsGlobal?.connected && pendingInvite?.id) {
                          wsGlobal.send({
                            type: "invite-accept",
                            matchId: pendingInvite.id,
                          });
                        }
                      } catch {}
                      setPendingInvite(null);
                    }}
                  >
                    ✅ Accept
                  </button>
                  <button
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-rose-600/80 text-white/80 hover:text-white font-bold text-lg border border-white/10 hover:border-rose-500/50 transition-all hover:scale-[1.02] active:scale-95"
                    onClick={() => {
                      // Send invite-decline
                      try {
                        if (wsGlobal?.connected && pendingInvite?.id) {
                          wsGlobal.send({
                            type: "invite-decline",
                            matchId: pendingInvite.id,
                          });
                        }
                      } catch {}
                      setPendingInvite(null);
                    }}
                  >
                    ❌ Decline
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Waiting for creator (joiner sees this) ── */}
        {waitingForCreator && !joinMatch && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-sm mx-4 p-6 rounded-2xl bg-slate-900 border border-slate-700/50 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <Clock className="w-8 h-8 text-indigo-400 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Waiting for {waitingForCreator}
              </h3>
              <p className="text-sm text-white/50 mb-5">
                The match creator needs to accept your request…
              </p>
              <button
                className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all text-sm font-medium"
                onClick={() => setWaitingForCreator(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Modern join / prestart overlay */}
        <MatchPrestart
          open={!!joinMatch}
          matchInfo={joinMatch}
          localUser={user}
          opponentName={(() => {
            if (!joinMatch) return "Opponent";
            const localName = (user?.username || "").toLowerCase();
            const creatorName =
              joinMatch.createdBy || joinMatch.creatorName || "";
            // If local user is the creator, opponent is the joiner
            if (
              joinMatch._isCreatorView ||
              creatorName.toLowerCase() === localName
            ) {
              return (
                joinMatch.joinerName ||
                (joinMatch.joinerId
                  ? participants[joinMatch.joinerId] || joinMatch.joinerId
                  : "Opponent")
              );
            }
            // Otherwise, local user is the joiner — opponent is the creator
            return (
              creatorName ||
              (joinMatch.creatorId
                ? participants[joinMatch.creatorId] || joinMatch.creatorId
                : "Opponent")
            );
          })()}
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
          onCancel={() => {
            // If the creator cancels during prestart, notify the server
            try {
              if (
                wsGlobal?.connected &&
                joinMatch?.id &&
                joinMatch._isCreatorView
              ) {
                wsGlobal.send({
                  type: "invite-decline",
                  matchId: joinMatch.id,
                });
              }
            } catch {}
            setJoinMatch(null);
          }}
          remoteChoice={Object.values(remoteChoices)[0] || null}
          bullActive={bullActive}
          bullWinner={bullWinner}
          bullTied={bullTied}
        />
      </div>
    </div>
  );
}
