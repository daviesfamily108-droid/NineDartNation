import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  getModeOptionsForGame,
  labelForMode,
  type ModeKey,
} from "../utils/games.js";
import { useMatch } from "../store/match.js";
import MatchCard from "./MatchCard.js";
import MatchStartShowcase from "./ui/MatchStartShowcase.js";
import { useToast } from "../store/toast.js";
import { useWS } from "./WSProvider.js";
import { apiFetch } from "../utils/api.js";
import { useUserSettings } from "../store/userSettings.js";
import { launchInPlayDemo } from "../utils/inPlayDemo.js";
import { openMatchWindow } from "../utils/matchWindow.js";

type Tournament = {
  id: string;
  title: string;
  game: string;
  mode: ModeKey;
  value: number;
  description: string;
  startAt: number;
  checkinMinutes: number;
  capacity: number;
  participants: { email: string; username: string }[];
  official?: boolean;
  prize?: boolean;
  prizeType?: "premium" | "none";
  status: "scheduled" | "running" | "completed";
  winnerEmail?: string | null;
  startingScore?: number;
  creatorEmail?: string;
  creatorName?: string;
};

const containsIntegrationMarker = (value: unknown) => {
  if (typeof value === "string") {
    return value.toLowerCase().includes("integration");
  }
  if (typeof value === "number") {
    return value.toString().toLowerCase().includes("integration");
  }
  return false;
};

const isIntegrationTournament = (t: Tournament) => {
  if (!t) return false;
  const candidates = [t.title, t.description, t.creatorName, t.creatorEmail];
  return candidates.some((value) => containsIntegrationMarker(value));
};

const isTouch =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

export default function Tournaments({ user }: { user: any }) {
  const toast = useToast();
  const wsGlobal = (() => {
    try {
      return useWS();
    } catch {
      return null;
    }
  })();
  // Persisted match preferences (used when creating or joining)
  const {
    matchType: _matchType = "singles",
    setMatchType: _setMatchType,
    teamAName: _teamAName = "Team A",
    setTeamAName: _setTeamAName,
    teamBName: _teamBName = "Team B",
    setTeamBName: _setTeamBName,
  } = useUserSettings();
  const [list, setList] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [_fetchError, setFetchError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDemoStart, setShowDemoStart] = useState(false);
  const [showStartShowcase, setShowStartShowcase] = useState(false);
  const _startedShowcasedRef = useRef(false);

  const inProgress = useMatch((s) => s.inProgress);
  const roomId = useMatch((s) => s.roomId);

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
  }, [inProgress, roomId]);

  const [form, setForm] = useState({
    title: "",
    game: "X01",
    mode: "501",
    value: 0,
    description: "",
    startAt: new Date().toISOString().slice(0, 16),
    checkinMinutes: 15,
    capacity: 16,
    startingScore: 501,
    requireCalibration: false,
  });

  // Prestart / Bull Up Logic for Tournaments
  const [joinMatch, setJoinMatch] = useState<any>(null);
  const [joinTimer, setJoinTimer] = useState(30);
  const [joinChoice, setJoinChoice] = useState<"bull" | "skip" | null>(null);
  const [remoteChoices, setRemoteChoices] = useState<Record<string, string>>(
    {},
  );
  const [_bullActive, setBullActive] = useState(false);
  const [_bullThrown, setBullThrown] = useState(false);
  const [_bullLocalThrow, setBullLocalThrow] = useState<any>(null);
  const [_bullWinner, setBullWinner] = useState<string | null>(null);
  const [leaveAsk, setLeaveAsk] = useState<{
    open: boolean;
    t: Tournament | null;
  }>({ open: false, t: null });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    t: Tournament | null;
  }>({ open: false, t: null });
  const serverPrestartRef = useRef(false);
  const _joinAcceptRef = useRef<HTMLButtonElement>(null);
  const [participants, setParticipants] = useState<Record<string, string>>({});

  // Listen for match-prestart events (same as OnlinePlay)
  useEffect(() => {
    if (!wsGlobal) return;
    const unsub = wsGlobal.addListener((msg) => {
      try {
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
          // reset diffuse state
          setJoinChoice(null);
          setRemoteChoices({});
          setBullActive(false);
          setBullThrown(false);
          setBullWinner(null);
        }
        if (msg?.type === "match-start") {
          // If the started match matches our current join request, close the modal
          if (joinMatch && msg.roomId === joinMatch.id) {
            setJoinMatch(null);
            setJoinChoice(null);
            setRemoteChoices({});
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
  }, [wsGlobal, joinChoice, joinMatch]);

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

  // Watch for match start (inProgress)
  const match = useMatch((s) => ({
    players: s.players,
    currentPlayerIdx: s.currentPlayerIdx,
    roomId: s.roomId,
  }));
  useEffect(() => {
    if (!inProgress) return;
    setShowStartShowcase(true);
  }, [inProgress]);

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

  async function refresh() {
    try {
      // Avoid multiple quick refreshes which can cause load spikes
      if (lastRefresh && Date.now() - lastRefresh < 3000) return;
      const res = await apiFetch("/api/tournaments");
      const data = await res.json();
      const newList = Array.isArray(data.tournaments) ? data.tournaments : [];
      setList(newList);
      try {
        console.debug(
          "[Tournaments] refresh fetched",
          newList.length,
          "tournaments",
        );
        console.log("[Tournaments] fetched list:", newList);
      } catch {}
      setFetchError(null);
      setLastRefresh(Date.now());
    } catch (err: any) {
      try {
        if (typeof window !== "undefined") {
          setFetchError(String(err?.message || err));
        }
      } catch {
        if (typeof window !== "undefined") {
          setFetchError("unknown");
        }
      }
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  // Re-fetch tournaments when we have a fresh WS connection so clients resync after reconnects/server restarts
  useEffect(() => {
    try {
      if (wsGlobal?.connected) refresh();
    } catch {}
  }, [wsGlobal?.connected]);

  // Listen for WS push updates from global provider if available
  useEffect(() => {
    if (!wsGlobal) return;
    const unsub = wsGlobal.addListener((msg) => {
      try {
        if (msg.type === "tournaments") {
          setList(msg.tournaments || []);
          setLastRefresh(Date.now());
        }
        if (msg.type === "tournaments") {
          try {
            console.debug(
              "[Tournaments] WS tournaments update, num=",
              (msg.tournaments || []).length,
            );
          } catch {}
        }
        if (msg.type === "tournament-win" && msg.message) {
          toast(msg.message, { type: "success", timeout: 10000 }); // Show for 10 seconds
        }
        // tournament-reminder handled optionally here if desired
      } catch {}
    });
    return () => {
      unsub();
    };
  }, [wsGlobal?.connected]);

  // If WS connects, ask for a fresh list via WS; this will prompt server to send a tournaments snapshot.
  useEffect(() => {
    try {
      if (wsGlobal?.connected) {
        try {
          wsGlobal.send({ type: "list-tournaments" });
        } catch {}
        // Also ensure we refresh as a fallback
        refresh();
      }
    } catch {}
  }, [wsGlobal?.connected]);

  // Polling fallback: if WS is unavailable, poll the API every 10s to keep lobby up-to-date
  useEffect(() => {
    let iv: number | null = null;
    try {
      if (!wsGlobal || !wsGlobal.connected) {
        iv = window.setInterval(() => {
          refresh();
        }, 10000);
      }
    } catch {}
    return () => {
      if (iv) clearInterval(iv);
    };
  }, [wsGlobal?.connected]);

  const email = String(user?.email || "").toLowerCase();
  const showDemoControls =
    (import.meta as any).env?.DEV || email === "daviesfamily108@gmail.com";

  const runTournamentInPlayDemo = () => {
    launchInPlayDemo({
      players: ["Tournament A", "Tournament B"],
      startingScore: 501,
      roomId: "tournament-demo",
      visits: [{ score: 45 }, { score: 81 }, { score: 140 }],
    });
  };

  const hasJoined = useCallback(
    (t: Tournament | null | undefined) => {
      if (!t || !email) return false;
      const ps = Array.isArray(t.participants) ? t.participants : [];
      return ps.some((p) => String(p?.email || "").toLowerCase() === email);
    },
    [email],
  );

  const [prestartPreview, setPrestartPreview] = useState<Tournament | null>(
    null,
  );
  const [dismissedPrestart, setDismissedPrestart] = useState<
    Record<string, boolean>
  >({});
  const [prestartNow, setPrestartNow] = useState(() => Date.now());

  const buildBracketPairs = useCallback((t: Tournament) => {
    const names = (t.participants || []).map(
      (p) => p.username || p.email || "Player",
    );
    const size = Math.max(
      1,
      2 ** Math.ceil(Math.log2(Math.max(1, names.length))),
    );
    const padded = [...names];
    while (padded.length < size) padded.push("BYE");
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < padded.length; i += 2) {
      pairs.push([padded[i], padded[i + 1] ?? "BYE"]);
    }
    return pairs;
  }, []);

  // Simple, persistent match preference UI
  const MatchPrefs = () => (
    <div className="mb-3 p-2 rounded-lg bg-slate-900/40 border border-white/10 text-white text-xs flex items-center gap-2 flex-wrap">
      <span className="opacity-70">Default match</span>
      <span className="btn py-1 px-2 bg-indigo-500/30 border border-indigo-400/50 text-indigo-100">
        Singles
      </span>
      <span className="text-xs opacity-60 ml-2">
        (tournaments use Singles only)
      </span>
    </div>
  );
  // Fetch subscription to detect if user is a recent tournament winner (cooldown)
  useEffect(() => {
    let abort = false;
    async function check() {
      if (!email) {
        setCooldownUntil(null);
        return;
      }
      try {
        const res = await apiFetch(
          `/api/subscription?email=${encodeURIComponent(email)}`,
        );
        const data = await res.json();
        if (!abort) {
          if (
            data?.source === "tournament" &&
            typeof data.expiresAt === "number" &&
            data.expiresAt > Date.now()
          ) {
            setCooldownUntil(data.expiresAt);
          } else {
            setCooldownUntil(null);
          }
        }
      } catch {
        if (!abort) setCooldownUntil(null);
      }
    }
    check();
    return () => {
      abort = true;
    };
  }, [email]);

  // Helper to delete a tournament with proper error handling and owner fallback
  async function deleteTournament(t: Tournament) {
    if (!email) return;
    setDeleteConfirm({ open: true, t });
  }

  async function confirmDeleteTournament() {
    const t = deleteConfirm.t;
    if (!t || !email) return;
    setDeleteConfirm({ open: false, t: null });
    setLoading(true);
    try {
      // First try creator/owner shared endpoint
      let res = await apiFetch("/api/tournaments/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: t.id, requesterEmail: email }),
      });

      // If forbidden but user is the owner, try the admin endpoint as a fallback
      if (
        !res.ok &&
        res.status === 403 &&
        String(email) === "daviesfamily108@gmail.com"
      ) {
        res = await apiFetch("/api/admin/tournaments/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId: t.id, requesterEmail: email }),
        });
      }

      if (!res.ok) {
        let msg = "Delete failed";
        try {
          const data = await res.json();
          if (data?.error) msg = `Delete failed: ${String(data.error)}`;
        } catch {}
        toast(msg, { type: "error" });
        return;
      }

      toast("Tournament deleted", { type: "success" });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function join(t: Tournament) {
    if (!email) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/tournaments/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: t.id,
          email,
          username: user?.username,
        }),
      });
      if (!res.ok) {
        let data: any = {};
        try {
          data = await res.json();
        } catch {}
        if (
          data?.error === "WINNER_COOLDOWN" &&
          typeof data.until === "number"
        ) {
          setErrorMsg(
            `You're a recent NDN tournament winner. You can re-enter after ${fmt(data.until)}.`,
          );
          setTimeout(() => setErrorMsg(""), 6000);
          toast("Join blocked: winner cooldown active", { type: "error" });
        } else if (data?.error === "ALREADY_IN_TOURNAMENT") {
          setErrorMsg(
            String(
              data.message || "You can only join one tournament at a time.",
            ),
          );
          setTimeout(() => setErrorMsg(""), 6000);
          toast("Join blocked: already in another tournament", {
            type: "error",
          });
        } else if (data?.error) {
          setErrorMsg(String(data.error));
          setTimeout(() => setErrorMsg(""), 3500);
          toast(`Join failed: ${String(data.error)}`, { type: "error" });
        }
        return;
      }
      toast("Joined tournament", { type: "success" });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function leave(t: Tournament) {
    if (!email) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/tournaments/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: t.id, email }),
      });
      if (!res.ok) {
        let data: any = {};
        try {
          data = await res.json();
        } catch {}
        if (data?.error) {
          toast(`Leave failed: ${String(data.error)}`, { type: "error" });
        } else if (res.status === 404) {
          toast(
            "Leave failed (endpoint not found). Restart the server to enable /api/tournaments/leave.",
            { type: "error" },
          );
        } else {
          toast("Leave failed. Please try again.", { type: "error" });
        }
        return;
      }
      toast("Left tournament", { type: "success" });
      // Optimistic local update
      setList((prev) =>
        prev.map((it) =>
          it.id === t.id
            ? {
                ...it,
                participants: (it.participants || []).filter(
                  (p) => p.email !== email,
                ),
              }
            : it,
        ),
      );
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function createTournament() {
    setLoading(true);
    try {
      const start = new Date(form.startAt).getTime();
      const res = await apiFetch("/api/tournaments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          game: form.game,
          mode: form.mode,
          value: Number(form.value),
          description: form.description,
          startAt: start,
          checkinMinutes: Number(form.checkinMinutes),
          capacity: Number(form.capacity),
          startingScore:
            form.game === "X01" ? Number(form.startingScore || 501) : undefined,
          requireCalibration: !!form.requireCalibration,
          creatorEmail: user?.email,
          creatorName: user?.username,
        }),
      });
      if (!res.ok) {
        let details = "";
        try {
          const data = await res.json();
          if (data?.error) details = String(data.error);
          else if (data?.details) details = String(data.details);
        } catch {}
        const msg = details
          ? `Create failed: ${details}`
          : "Create failed. Please try again.";
        setErrorMsg(msg);
        toast(msg, { type: "error" });
        setTimeout(() => setErrorMsg(""), 6000);
        return;
      }
      try {
        const data = await res.json();
        if (!data?.ok) {
          const msg = data?.error
            ? `Create failed: ${String(data.error)}`
            : "Create failed. Please try again.";
          setErrorMsg(msg);
          toast(msg, { type: "error" });
          setTimeout(() => setErrorMsg(""), 6000);
          return;
        }
      } catch {}
      setShowCreate(false);
      toast("Tournament created", { type: "success" });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  // Close the create modal on Escape
  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreate(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showCreate]);

  const visibleTournaments = useMemo(
    () => list.filter((t) => !isIntegrationTournament(t)),
    [list],
  );
  const official = useMemo(
    () => visibleTournaments.filter((t) => t.official),
    [visibleTournaments],
  );
  const community = useMemo(
    () => visibleTournaments.filter((t) => !t.official),
    [visibleTournaments],
  );
  const created = useMemo(
    () =>
      visibleTournaments.filter((t) => t.status === "scheduled" && !t.official),
    [visibleTournaments],
  );

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const upcoming = visibleTournaments.find((t) => {
        if (!hasJoined(t)) return false;
        if (t.status !== "scheduled") return false;
        if (dismissedPrestart[t.id]) return false;
        const delta = t.startAt - now;
        return delta > 0 && delta <= 5 * 60 * 1000;
      });
      setPrestartPreview(upcoming ?? null);
    };
    check();
    const id = window.setInterval(check, 15000);
    return () => window.clearInterval(id);
  }, [dismissedPrestart, hasJoined, visibleTournaments]);

  useEffect(() => {
    if (!prestartPreview) return;
    setPrestartNow(Date.now());
    const id = window.setInterval(() => setPrestartNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [prestartPreview]);

  // Pagination for Created Game Lobby
  const [createdPage, setCreatedPage] = useState(1);
  const itemsPerPage = 16;
  const createdTotalPages = Math.ceil(created.length / itemsPerPage);
  const paginatedCreated = created.slice(
    (createdPage - 1) * itemsPerPage,
    createdPage * itemsPerPage,
  );

  // Pagination for Community List
  const [communityPage, setCommunityPage] = useState(1);
  const communityTotalPages = Math.ceil(community.length / itemsPerPage);
  const paginatedCommunity = community.slice(
    (communityPage - 1) * itemsPerPage,
    communityPage * itemsPerPage,
  );

  const nextOfficial = useMemo(() => {
    const upcoming = official
      .filter((t) => t.status === "scheduled")
      .sort((a, b) => a.startAt - b.startAt);
    return upcoming[0] || null;
  }, [official]);

  function fmt(ts: number) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  return (
    <div className="card ndn-game-shell ndn-page flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold ndn-section-title">Tournaments 🎯</h2>
      </div>
      <div className="ndn-shell-body overflow-visible flex-1 min-h-0">
        {/* Create Tournament + and default match prefs on a single header row */}
        <div className="mb-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <MatchPrefs />
          </div>
          <div className="shrink-0">
            <button className="btn" onClick={() => setShowCreate(true)}>
              Create Tournament + 🎯
            </button>
            {showDemoControls && (
              <button
                className="btn btn-ghost ml-2"
                onClick={() => setShowDemoStart(true)}
              >
                Demo Start Showcase 🎯
              </button>
            )}
            {showDemoControls && (
              <button
                className="btn btn-ghost ml-2"
                onClick={runTournamentInPlayDemo}
              >
                Demo In-Game 🎮
              </button>
            )}
          </div>
        </div>
        {/* DEV-only start showcase demo */}
        {showDemoStart && (
          <MatchStartShowcase
            players={[
              { id: "0", name: "Demo A", legsWon: 0, legs: [] },
              { id: "1", name: "Demo B", legsWon: 0, legs: [] },
            ]}
            user={user}
            onDone={() => setShowDemoStart(false)}
          />
        )}
        {/* Show overlay when a tournament match starts while on the tournaments page */}
        {showStartShowcase && (
          <MatchStartShowcase
            players={(match.players || []) as any}
            user={user}
            onDone={() => setShowStartShowcase(false)}
          />
        )}
        <div className="mb-2 text-sm font-semibold text-slate-300">
          World Lobby
        </div>
        {/* Created Game Lobby: show all created tournaments (scheduled) */}
        <div className="mb-3 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Created Game Lobby</div>
            <div className="text-xs opacity-60">
              All tournaments created by users and admins
            </div>
          </div>
          <ul className="space-y-2">
            {created.length === 0 && (
              <li className="text-sm opacity-60">
                No created tournaments yet.
              </li>
            )}
            {paginatedCreated.map((t) => (
              <MatchCard
                key={t.id}
                t={t}
                onJoin={(m) => join(m)}
                onLeave={(m) => leave(m)}
                joined={hasJoined(t)}
                disabled={
                  loading ||
                  t.status !== "scheduled" ||
                  (!hasJoined(t) && t.participants.length >= t.capacity)
                }
              />
            ))}
          </ul>
          {/* Pagination controls for Created Game Lobby */}
          {createdTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                className="text-slate-300 hover:text-white transition-colors"
                onClick={() => setCreatedPage((p) => Math.max(p - 1, 1))}
                disabled={createdPage === 1}
              >
                &larr; Previous
              </button>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">
                  Page {createdPage} of {createdTotalPages}
                </span>
                <button
                  className="text-slate-300 hover:text-white transition-colors"
                  onClick={() =>
                    setCreatedPage((p) => Math.min(p + 1, createdTotalPages))
                  }
                  disabled={createdPage === createdTotalPages}
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Persistent banner for next official weekly tournament */}
        {nextOfficial && (
          <div className="mb-4 p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="text-sm uppercase tracking-wide text-indigo-300 font-semibold">
                  Weekly Official Tournament 🎯
                </div>
                <div className="font-bold">{nextOfficial.title}</div>
                <div className="text-sm opacity-80">
                  {nextOfficial.game}
                  {nextOfficial.game === "X01" && nextOfficial.startingScore
                    ? `/${nextOfficial.startingScore}`
                    : ""}{" "}
                  · {labelForMode(nextOfficial.mode)} {nextOfficial.value} ·
                  Starts {fmt(nextOfficial.startAt)} · Cap{" "}
                  {nextOfficial.capacity} · Joined{" "}
                  {nextOfficial.participants.length}
                </div>
                {nextOfficial.prize && (
                  <div className="text-xs mt-1">Prize: 3 months PREMIUM</div>
                )}
                {nextOfficial.status !== "scheduled" && (
                  <div className="text-xs">Status: {nextOfficial.status}</div>
                )}
                {cooldownUntil && cooldownUntil > Date.now() && (
                  <div className="text-xs text-rose-300">
                    Recent winners can re-enter after {fmt(cooldownUntil)}.
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <button
                  className={`btn ${hasJoined(nextOfficial) ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                  title={
                    hasJoined(nextOfficial)
                      ? "Double-click to leave this tournament"
                      : nextOfficial.official &&
                          cooldownUntil &&
                          cooldownUntil > Date.now()
                        ? `Recent winners can re-enter after ${fmt(cooldownUntil)}`
                        : ""
                  }
                  disabled={
                    loading ||
                    nextOfficial.status !== "scheduled" ||
                    (!hasJoined(nextOfficial) &&
                      (nextOfficial.participants.length >=
                        nextOfficial.capacity ||
                        (!!cooldownUntil && cooldownUntil > Date.now())))
                  }
                  onClick={() => {
                    if (!hasJoined(nextOfficial)) {
                      join(nextOfficial);
                    } else if (isTouch) {
                      setLeaveAsk({ open: true, t: nextOfficial });
                    }
                  }}
                  onDoubleClick={() => {
                    if (!isTouch && hasJoined(nextOfficial))
                      setLeaveAsk({ open: true, t: nextOfficial });
                  }}
                  aria-label={
                    hasJoined(nextOfficial) ? "Already Joined" : "Join Now"
                  }
                >
                  {hasJoined(nextOfficial)
                    ? "Already Joined! 🎯"
                    : "Join Now 🎯"}
                </button>
              </div>
            </div>
          </div>
        )}
        {errorMsg && (
          <div className="mb-3 p-2 rounded-lg bg-amber-700/30 border border-amber-600/40 text-amber-200 text-sm">
            {errorMsg}
          </div>
        )}
        <div className="space-y-4">
          <section>
            <div className="font-semibold mb-1">Official 🎯</div>
            <div className="text-xs opacity-70 mb-2">
              {cooldownUntil && cooldownUntil > Date.now() ? (
                <>
                  You’re a recent NDN tournament winner — to keep it fair, you
                  can re-enter after {fmt(cooldownUntil)}.
                </>
              ) : (
                <>
                  Note: Weekly winners can re-enter once their 3 months of
                  PREMIUM ends.
                </>
              )}
            </div>
            <ul className="space-y-2">
              {official.map((t) => (
                <li
                  key={t.id}
                  className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between relative"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      {t.title}{" "}
                      {t.prize && (
                        <span className="inline-flex items-center gap-1 ml-2 align-middle">
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500 text-black">
                            Prize
                          </span>
                          <span
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[10px] leading-none cursor-help"
                            title="Weekly winners get 3 months of PREMIUM and can re-enter once their prize period ends."
                            aria-label="Prize info"
                          >
                            i
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="text-sm opacity-80">
                      {t.game}
                      {t.game === "X01" && t.startingScore
                        ? `/${t.startingScore}`
                        : ""}{" "}
                      · {labelForMode(t.mode)} {t.value} · {fmt(t.startAt)} ·
                      Cap {t.capacity} · Joined {t.participants.length}
                    </div>
                    {t.prize && (
                      <div className="text-xs">Prize: 3 months PREMIUM</div>
                    )}
                    {t.status !== "scheduled" && (
                      <div className="text-xs">Status: {t.status}</div>
                    )}
                    {hasJoined(t) && (
                      <div className="text-xs text-emerald-400 font-semibold">
                        Already Joined
                      </div>
                    )}
                    {t.official &&
                      cooldownUntil &&
                      cooldownUntil > Date.now() && (
                        <div className="text-xs text-rose-300">
                          Cooldown active until {fmt(cooldownUntil)}.
                        </div>
                      )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`btn ${hasJoined(t) ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                      title={
                        hasJoined(t)
                          ? "Double-click to leave this tournament"
                          : t.official &&
                              cooldownUntil &&
                              cooldownUntil > Date.now()
                            ? `Recent winners can re-enter after ${fmt(cooldownUntil)}`
                            : ""
                      }
                      disabled={
                        loading ||
                        t.status !== "scheduled" ||
                        (!hasJoined(t) &&
                          (t.participants.length >= t.capacity ||
                            (t.official &&
                              !!cooldownUntil &&
                              cooldownUntil > Date.now())))
                      }
                      onClick={() => {
                        if (!hasJoined(t)) {
                          join(t);
                        } else if (isTouch) {
                          setLeaveAsk({ open: true, t });
                        }
                      }}
                      onDoubleClick={() => {
                        if (!isTouch && hasJoined(t))
                          setLeaveAsk({ open: true, t });
                      }}
                      aria-label={hasJoined(t) ? "Already Joined" : "Join Now"}
                    >
                      {hasJoined(t) ? "Already Joined! 🎯" : "Join Now 🎯"}
                    </button>
                    {/* Delete button when you are the creator (owner-created official) and it hasn't started */}
                    {t.status === "scheduled" &&
                      email &&
                      ((t.creatorEmail &&
                        String(t.creatorEmail).toLowerCase() === email) ||
                        email === "daviesfamily108@gmail.com") && (
                        <button
                          className="w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs flex items-center justify-center shadow"
                          title="Delete this tournament"
                          onClick={() => deleteTournament(t)}
                          aria-label="Delete tournament"
                        >
                          ×
                        </button>
                      )}
                  </div>
                </li>
              ))}
              {official.length === 0 && (
                <li className="text-sm opacity-60">
                  No official tournaments yet.
                </li>
              )}
            </ul>
          </section>

          <section>
            <div className="font-semibold mb-1">Community 🎯</div>
            <ul className="space-y-2">
              {paginatedCommunity.map((t) => (
                <li
                  key={t.id}
                  className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between relative"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-sm opacity-80">
                      {t.game}
                      {t.game === "X01" && t.startingScore
                        ? `/${t.startingScore}`
                        : ""}{" "}
                      · {labelForMode(t.mode)} {t.value} · {fmt(t.startAt)} ·
                      Cap {t.capacity} · Joined {t.participants.length}
                    </div>
                    {t.description && (
                      <div className="text-xs opacity-80">{t.description}</div>
                    )}
                    {hasJoined(t) && (
                      <div className="text-xs text-emerald-400 font-semibold">
                        Already Joined
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn"
                      title={
                        hasJoined(t)
                          ? "Double-click to leave this tournament"
                          : ""
                      }
                      disabled={
                        loading ||
                        t.status !== "scheduled" ||
                        (!hasJoined(t) && t.participants.length >= t.capacity)
                      }
                      onClick={() => {
                        if (!hasJoined(t)) {
                          join(t);
                        } else if (isTouch) {
                          setLeaveAsk({ open: true, t });
                        }
                      }}
                      onDoubleClick={() => {
                        if (!isTouch && hasJoined(t))
                          setLeaveAsk({ open: true, t });
                      }}
                    >
                      {hasJoined(t) ? "Already Joined" : "Join Now"}
                    </button>
                    {/* Delete button for creator to delete their own scheduled tournament */}
                    {t.status === "scheduled" &&
                      email &&
                      ((t.creatorEmail &&
                        String(t.creatorEmail).toLowerCase() === email) ||
                        email === "daviesfamily108@gmail.com") && (
                        <button
                          className="w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs flex items-center justify-center shadow"
                          title="Delete this tournament"
                          onClick={() => deleteTournament(t)}
                          aria-label="Delete tournament"
                        >
                          ×
                        </button>
                      )}
                  </div>
                </li>
              ))}
              {community.length === 0 && (
                <li className="text-sm opacity-60">
                  No community tournaments yet.
                </li>
              )}
            </ul>
            {/* Pagination Controls for Community */}
            {communityTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 pt-2 border-t border-white/10">
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={communityPage === 1}
                  onClick={() => setCommunityPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="text-sm opacity-70">
                  Page {communityPage} of {communityTotalPages}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={communityPage === communityTotalPages}
                  onClick={() =>
                    setCommunityPage((p) =>
                      Math.min(communityTotalPages, p + 1),
                    )
                  }
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </div>

        {prestartPreview && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tournament-prestart-heading"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setDismissedPrestart((prev) => ({
                  ...prev,
                  [prestartPreview.id]: true,
                }));
                setPrestartPreview(null);
              }
            }}
          >
            <div className="bg-slate-900 rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3
                    id="tournament-prestart-heading"
                    className="text-xl font-semibold"
                  >
                    Bracket Preview
                  </h3>
                  <div className="text-sm opacity-70">
                    {prestartPreview.title} starts in{" "}
                    {Math.max(
                      0,
                      Math.ceil((prestartPreview.startAt - prestartNow) / 1000),
                    )}
                    s
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setDismissedPrestart((prev) => ({
                      ...prev,
                      [prestartPreview.id]: true,
                    }));
                    setPrestartPreview(null);
                  }}
                >
                  Close
                </button>
              </div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-3">
                Round 1
              </div>
              <div className="space-y-2">
                {buildBracketPairs(prestartPreview).map((pair, idx) => (
                  <div
                    key={`${prestartPreview.id}-pair-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">Match {idx + 1}</span>
                    <span className="text-slate-200">
                      {pair[0]} vs {pair[1]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-slate-400">
                Byes are shown so everyone can see their bracket position.
              </div>
            </div>
          </div>
        )}
        {showCreate && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-tournament-heading"
            tabIndex={-1}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 sm:p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCreate(false);
            }}
          >
            <div
              className="rounded-2xl w-full sm:max-w-2xl max-h-[82vh] flex flex-col shadow-2xl border border-indigo-500/30 overflow-hidden"
              style={{ background: "var(--ndn-card-bg, #0f172a)" }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b border-indigo-500/20 shrink-0"
                style={{ background: "var(--ndn-card-bg, #0f172a)" }}
              >
                <h3
                  id="create-tournament-heading"
                  className="text-sm sm:text-lg font-bold tracking-tight"
                >
                  🎯 New Tournament
                </h3>
                <button
                  className="w-7 h-7 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 flex items-center justify-center text-xs transition-colors"
                  onClick={() => setShowCreate(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              {/* Scrollable form */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
                style={{ background: "var(--ndn-card-bg, #0f172a)" }}
              >
                {/* Title */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
                    Title
                  </label>
                  <input
                    className="input w-full text-sm"
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="e.g. Friday Night 501"
                  />
                </div>
                {/* Game settings row */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
                    Game Settings
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <select
                        className="input w-full text-xs"
                        value={form.game}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, game: e.target.value }))
                        }
                      >
                        {["X01", "Cricket", "Killer"].map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      <div className="text-[9px] text-slate-500 mt-0.5 px-0.5">
                        Game
                      </div>
                    </div>
                    <div>
                      <select
                        className="input w-full text-xs"
                        value={form.mode}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            mode: e.target.value as any,
                          }))
                        }
                      >
                        {getModeOptionsForGame(
                          form.game as import("../utils/games.js").GameKey,
                        ).map((o) => (
                          <option key={String(o)} value={String(o)}>
                            {labelForMode(String(o))}
                          </option>
                        ))}
                      </select>
                      <div className="text-[9px] text-slate-500 mt-0.5 px-0.5">
                        Mode
                      </div>
                    </div>
                    <div>
                      <input
                        className="input w-full text-xs"
                        type="number"
                        min={1}
                        value={form.value}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            value: Number(e.target.value),
                          }))
                        }
                        placeholder="0"
                      />
                      <div className="text-[9px] text-slate-500 mt-0.5 px-0.5">
                        Legs
                      </div>
                    </div>
                  </div>
                </div>
                {/* Description */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
                    Description
                  </label>
                  <textarea
                    className="input w-full text-xs"
                    rows={2}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Optional details…"
                  />
                </div>
                {/* Schedule — stacked on mobile, side-by-side on sm+ */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
                    Schedule
                  </label>
                  <div className="space-y-1.5 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-2">
                    <div>
                      <input
                        className="input w-full text-xs"
                        type="datetime-local"
                        value={form.startAt}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, startAt: e.target.value }))
                        }
                      />
                      <div className="text-[9px] text-slate-500 mt-0.5 px-0.5">
                        Start time
                      </div>
                    </div>
                    <div>
                      <input
                        className="input w-full text-xs"
                        type="number"
                        min={0}
                        value={form.checkinMinutes}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            checkinMinutes: Number(e.target.value),
                          }))
                        }
                      />
                      <div className="text-[9px] text-slate-500 mt-0.5 px-0.5">
                        Check-in (min)
                      </div>
                    </div>
                  </div>
                </div>
                {/* Score & Capacity row */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
                    Players
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {form.game === "X01" ? (
                      <div>
                        <select
                          className="input w-full text-xs"
                          value={String(form.startingScore)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              startingScore: Number(e.target.value),
                            }))
                          }
                        >
                          {[301, 501, 701].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <div className="text-[9px] text-slate-500 mt-0.5 px-0.5">
                          Starting score
                        </div>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div>
                      <input
                        className="input w-full text-xs"
                        type="number"
                        min={6}
                        max={64}
                        value={form.capacity}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            capacity: Number(e.target.value),
                          }))
                        }
                      />
                      <div className="text-[9px] text-slate-500 mt-0.5 px-0.5">
                        Max players
                      </div>
                    </div>
                  </div>
                </div>
                {/* Camera toggle */}
                <div className="flex items-center gap-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-purple-500 w-4 h-4 shrink-0"
                    checked={!!form.requireCalibration}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        requireCalibration: !!e.target.checked,
                      }))
                    }
                    id="require-camera"
                  />
                  <label
                    htmlFor="require-camera"
                    className="text-xs leading-tight"
                  >
                    <span className="font-semibold">Require Camera</span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Players must have a camera to join
                    </span>
                  </label>
                </div>
                <div className="text-[10px] text-slate-500 text-center pb-1">
                  Community tournaments do not award prizes.
                </div>
              </div>
              {/* Footer */}
              <div
                className="flex gap-2 px-4 py-3 border-t border-indigo-500/20 shrink-0"
                style={{ background: "var(--ndn-card-bg, #0f172a)" }}
              >
                <button
                  className="flex-1 btn btn-ghost text-xs"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 btn text-xs"
                  disabled={loading}
                  onClick={createTournament}
                >
                  {loading ? "Creating…" : "Create Tournament"}
                </button>
              </div>
            </div>
          </div>
        )}

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
                Match Ready
              </div>
              <div className="mb-3">
                {joinMatch.game} - {joinMatch.modeType} · {joinMatch.legs} legs
              </div>
              <div className="text-sm opacity-80 mb-3">
                Created by {joinMatch.createdBy}
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
                players={match.players as any}
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
                      opponent...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {leaveAsk.open && leaveAsk.t && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setLeaveAsk({ open: false, t: null })}
            />
            <div className="relative card p-4 w-[360px] max-w-[90vw]">
              <div className="text-lg font-semibold mb-2">
                Leave tournament?
              </div>
              <div className="text-sm opacity-80 mb-4">
                Are you sure you want to remove yourself from “
                {leaveAsk.t.title}”?
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="btn bg-rose-600 hover:bg-rose-700"
                  onClick={() => setLeaveAsk({ open: false, t: null })}
                >
                  Decline
                </button>
                <button
                  className="btn bg-emerald-600 hover:bg-emerald-700"
                  onClick={async () => {
                    const t = leaveAsk.t!;
                    setLeaveAsk({ open: false, t: null });
                    await leave(t);
                  }}
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Tournament Confirmation Modal */}
        {deleteConfirm.open && deleteConfirm.t && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <div className="text-center">
                <div className="text-xl font-semibold mb-4 text-white">
                  Delete Tournament
                </div>
                <div className="text-slate-300 mb-6">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-white">
                    "{deleteConfirm.t.title}"
                  </span>
                  ?
                  <br />
                  <span className="text-sm text-slate-400">
                    This action cannot be undone.
                  </span>
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                    onClick={() => setDeleteConfirm({ open: false, t: null })}
                  >
                    Decline
                  </button>
                  <button
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                    onClick={confirmDeleteTournament}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phone camera overlay removed per UX preference; header badge preview only */}
      </div>
    </div>
  );
}
