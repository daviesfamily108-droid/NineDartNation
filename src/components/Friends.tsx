import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../store/toast.js";
import { useMessages } from "../store/messages.js";
import { censorProfanity } from "../utils/profanity.js";
import TabPills from "./ui/TabPills.js";
import { labelForMode } from "../utils/games.js";
import { apiFetch } from "../utils/api.js";
import {
  getAllTime,
  getAllTimeAvg,
  getGameModeStats,
} from "../store/profileStats.js";
import { formatAvg } from "../utils/stats.js";
import { useWS } from "./WSProvider.js";

type Friend = {
  email: string;
  username?: string;
  status?: "online" | "offline" | "ingame";
  lastSeen?: number;
  roomId?: string | null;
  avatar?: string | null;
  threeDartAvg?: number;
  relationship?: "none" | "friend" | "pending-outgoing" | "pending-incoming";
  match?: {
    game: string;
    mode: string;
    value: number;
    startingScore?: number;
  } | null;
};

function timeAgo(ts?: number) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Friends({ user }: { user?: any }) {
  const ws = (() => {
    try {
      return useWS();
    } catch {
      return null;
    }
  })();
  const toast = useToast();
  const email = String(user?.email || "").toLowerCase();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [suggested, setSuggested] = useState<Friend[]>([]);
  const [results, setResults] = useState<Friend[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<
    "all" | "online" | "offline" | "ingame" | "requests"
  >("all");
  const [loading, setLoading] = useState(false);
  const msgs = useMessages();
  const [activeChat, setActiveChat] = useState<{
    email: string;
    username?: string;
  } | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [requests, setRequests] = useState<
    Array<{
      id: string;
      fromEmail: string;
      fromUsername: string;
      toEmail: string;
      toUsername: string;
      requestedAt: number;
    }>
  >([]);
  const [outgoingRequests, setOutgoingRequests] = useState<
    Array<{
      id: string;
      fromEmail: string;
      fromUsername: string;
      toEmail: string;
      toUsername: string;
      requestedAt: number;
    }>
  >([]);
  const [messagePopup, setMessagePopup] = useState<{
    show: boolean;
    toUser?: string;
    toEmail?: string;
    replyTo?: string;
  }>({ show: false });

  // Selected friend detail panel
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [friendStats, setFriendStats] = useState<any>(null);
  const [friendAvatar, setFriendAvatar] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"profile" | "chat" | "compare">(
    "profile",
  );

  const loadThread = useCallback(
    async (otherEmail: string) => {
      const other = String(otherEmail || "").toLowerCase();
      if (!email || !other || other === email) return;
      try {
        const res = await apiFetch(
          `/api/friends/thread?email=${encodeURIComponent(email)}&other=${encodeURIComponent(other)}`,
        );
        const data = await res.json();
        if (data?.ok && Array.isArray(data.thread)) {
          msgs.loadThread(other, data.thread);
        }
      } catch {
        // ignore
      }
    },
    [email, msgs],
  );

  const activeThread = useMemo(() => {
    if (!activeChat?.email) return [];
    const other = activeChat.email.toLowerCase();
    const thread = msgs.threads?.[other]?.messages;
    if (Array.isArray(thread) && thread.length) return thread;
    // Fallback: Backend may still only return inbound messages.
    return msgs.inbox
      .filter((m) => String(m.from || "").toLowerCase() === other)
      .slice()
      .sort((a, b) => a.ts - b.ts);
  }, [activeChat?.email, msgs.inbox, msgs.threads]);

  const threadPreviewByEmail = useMemo(() => {
    const map = new Map<string, { ts: number; message: string }>();
    for (const m of msgs.inbox) {
      const from = String(m.from || "").toLowerCase();
      const prev = map.get(from);
      if (!prev || m.ts > prev.ts)
        map.set(from, { ts: m.ts, message: m.message });
    }
    return map;
  }, [msgs.inbox]);

  const unreadCountByEmail = useMemo(() => {
    // Message store only tracks a global unread count; approximate per-friend
    // by counting recent messages (purely a UI hint).
    const map = new Map<string, number>();
    const recentMs = 1000 * 60 * 60 * 24 * 3; // last 3 days
    const cutoff = Date.now() - recentMs;
    for (const m of msgs.inbox) {
      if ((m.ts || 0) < cutoff) continue;
      const from = String(m.from || "").toLowerCase();
      map.set(from, (map.get(from) || 0) + 1);
    }
    return map;
  }, [msgs.inbox]);

  async function refresh() {
    if (!email) return;
    // Clear API disable flag to ensure friends fetch isn't blocked by a prior transient failure
    try {
      (window as any).__ndnApiDisabled = false;
      (window as any).__ndnApiDisabledAt = 0;
    } catch {}
    try {
      const [fl, sg, rq, out] = await Promise.all([
        apiFetch(`/api/friends/list?email=${encodeURIComponent(email)}`).then(
          (r) => r.json(),
        ),
        apiFetch(
          `/api/friends/suggested?email=${encodeURIComponent(email)}`,
        ).then((r) => r.json()),
        apiFetch(
          `/api/friends/requests?email=${encodeURIComponent(email)}`,
        ).then((r) => r.json()),
        apiFetch(
          `/api/friends/outgoing?email=${encodeURIComponent(email)}`,
        ).then((r) => r.json()),
      ]);
      if (fl.ok !== false) setFriends(fl.friends || []);
      if (sg.ok !== false) setSuggested(sg.suggestions || []);
      if (rq.ok !== false) setRequests(rq.requests || []);
      if (out.ok !== false) setOutgoingRequests(out.requests || []);
    } catch {}
  }

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    // Retry on mount to handle Render cold starts
    async function initialLoad() {
      await refresh();
      // If friends are still empty after first attempt, retry a couple of times
      // (Render cold starts can cause the first request to time out)
      for (let attempt = 0; attempt < 2; attempt++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 3000));
        if (cancelled) return;
        await refresh();
      }
    }
    initialLoad();
    return () => {
      cancelled = true;
    };
  }, [email]);

  // Periodic refresh to keep friends list and statuses up to date
  useEffect(() => {
    if (!email) return;
    const iv = setInterval(() => {
      refresh();
    }, 30_000);
    return () => clearInterval(iv);
  }, [email]);

  // Listen for WS friend events to refresh immediately
  useEffect(() => {
    if (!ws) return;
    const unsub = ws.addListener((data: any) => {
      try {
        if (
          data?.type === "friend-accepted" ||
          data?.type === "friend-removed" ||
          data?.type === "friend-request" ||
          data?.type === "friend-declined"
        ) {
          refresh();
        }
      } catch {}
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [ws, email]);

  // Load inbox on mount/user change.
  useEffect(() => {
    if (!email) return;
    apiFetch(`/api/friends/messages?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.messages)) msgs.load(d.messages);
      })
      .catch(() => {});
  }, [email]);

  // Load real 2-way thread whenever we open/switch chats.
  useEffect(() => {
    if (!activeChat?.email) return;
    void loadThread(activeChat.email);
  }, [activeChat?.email, loadThread]);

  // Keep thread scrolled to bottom when opening or receiving new messages.
  useEffect(() => {
    if (!activeChat) return;
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeChat?.email, activeThread.length]);

  async function search(term: string) {
    setQ(term);
    if (!term) {
      setResults([]);
      return;
    }
    try {
      const res = await apiFetch(
        `/api/friends/search?q=${encodeURIComponent(term)}&email=${encodeURIComponent(email)}`,
      );
      const data = await res.json();
      setResults(data.results || []);
    } catch {}
  }

  // Load friend stats + avatar when a friend is selected
  useEffect(() => {
    if (!selectedFriend) {
      setFriendStats(null);
      setFriendAvatar(null);
      return;
    }
    const uname = selectedFriend.username || "";
    // Load avatar
    if (selectedFriend.avatar) {
      setFriendAvatar(selectedFriend.avatar);
    } else if (uname) {
      apiFetch(`/api/user/avatar/${encodeURIComponent(uname)}`)
        .then((r) => r.json())
        .then((d) => setFriendAvatar(d.avatar || null))
        .catch(() => setFriendAvatar(null));
    }
    // Load stats
    if (uname) {
      apiFetch(`/api/user/stats/public/${encodeURIComponent(uname)}`)
        .then((r) => r.json())
        .then((d) => setFriendStats(d.stats || null))
        .catch(() => setFriendStats(null));
    }
  }, [selectedFriend?.email]);

  // When selecting a friend, also open their chat thread
  useEffect(() => {
    if (selectedFriend && detailTab === "chat") {
      setActiveChat({
        email: selectedFriend.email,
        username: selectedFriend.username,
      });
      void loadThread(selectedFriend.email);
    }
  }, [selectedFriend?.email, detailTab]);

  async function addFriend(target: string) {
    if (!email || !target) return;
    setLoading(true);
    try {
      await apiFetch("/api/friends/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, friend: target }),
      });
      await refresh();
      setQ("");
      setResults([]);
      toast("Friend request sent", { type: "success" });
    } finally {
      setLoading(false);
    }
  }

  async function removeFriend(target: string) {
    if (!email || !target) return;
    setLoading(true);
    try {
      await apiFetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, friend: target }),
      });
      await refresh();
      toast("Friend removed", { type: "info" });
    } finally {
      setLoading(false);
    }
  }

  async function acceptFriend(requestId?: string, fromEmail?: string) {
    try {
      await apiFetch("/api/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, requestId, fromEmail }),
      });
      await refresh();
      toast("Friend request accepted", { type: "success" });
    } catch {}
  }

  async function declineFriend(requestId: string) {
    try {
      await apiFetch("/api/friends/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, requestId }),
      });
      await refresh();
      toast("Friend request declined", { type: "info" });
    } catch {}
  }

  async function cancelRequest(requestId: string) {
    try {
      await apiFetch("/api/friends/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, requestId }),
      });
      await refresh();
      toast("Friend request cancelled", { type: "info" });
    } catch {}
  }

  async function sendMessage() {
    const input = document.getElementById(
      "message-input",
    ) as HTMLTextAreaElement;
    const message = input?.value;
    if (!message || !messagePopup.toEmail) return;
    try {
      await apiFetch("/api/friends/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: email,
          toEmail: messagePopup.toEmail,
          message,
        }),
      });
      setMessagePopup({ show: false });
      toast("Message sent", { type: "success" });
    } catch {}
  }

  async function sendChatMessage() {
    if (!email || !activeChat?.email) return;
    const message = chatDraft.trim();
    if (!message) return;
    try {
      await apiFetch("/api/friends/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: email,
          toEmail: activeChat.email,
          message,
        }),
      });

      // Optimistically append to the active thread.
      const now = Date.now();
      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      msgs.pushThread(activeChat.email, {
        id,
        from: email,
        to: String(activeChat.email).toLowerCase(),
        message,
        ts: now,
        readBy: [email],
      });

      setChatDraft("");
      toast("Message sent", { type: "success" });
    } catch {
      toast("Failed to send message", { type: "error" });
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return friends;
    return friends.filter((f) => (f.status || "offline") === filter);
  }, [friends, filter]);

  const statusSummary = useMemo(() => {
    const summary = { online: 0, ingame: 0, offline: 0 };
    for (const f of friends) {
      if (f.status === "online") summary.online += 1;
      else if (f.status === "ingame") summary.ingame += 1;
      else summary.offline += 1;
    }
    return summary;
  }, [friends]);

  async function spectate(roomId?: string | null) {
    if (!roomId) {
      toast("Room unavailable", { type: "error" });
      return;
    }
    try {
      const ev = new CustomEvent("ndn:spectate-request", {
        detail: { roomId },
      });
      window.dispatchEvent(ev);
      toast("Opening spectator view...", { type: "info" });
    } catch {}
  }

  // Friend Requests pill: normalize incoming/outgoing in case backend misclassifies
  const {
    incomingRequests,
    outgoingRequests: outgoingRequestsResolved,
    requestsCount,
  } = useMemo(() => {
    const me = String(email || "").toLowerCase();
    const all = [...requests, ...outgoingRequests];
    const seen = new Set<string>();
    const unique = all.filter((r) => {
      const key = r.id || `${r.fromEmail}|${r.toEmail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const incoming = unique.filter(
      (r) => String(r.toEmail || "").toLowerCase() === me,
    );
    const outgoing = unique.filter(
      (r) =>
        String(r.fromEmail || "").toLowerCase() === me &&
        String(r.toEmail || "").toLowerCase() !== me,
    );
    return {
      incomingRequests: incoming,
      outgoingRequests: outgoing,
      requestsCount: incoming.length + outgoing.length,
    };
  }, [email, requests, outgoingRequests]);

  // My own stats for comparison
  const myUsername = user?.username || "Player 1";
  const myAllTime = getAllTime(myUsername);
  const myAllTimeAvg = getAllTimeAvg(myUsername);
  const myGameModes = getGameModeStats(myUsername);
  const myTotalGames = Object.values(myGameModes).reduce(
    (s, g) => s + (g.played || 0),
    0,
  );
  const myTotalWins = Object.values(myGameModes).reduce(
    (s, g) => s + (g.won || 0),
    0,
  );

  // Helper to open a friend's detail
  function openFriendDetail(f: Friend) {
    setSelectedFriend(f);
    setDetailTab("profile");
  }

  // Status dot color
  function statusDot(status?: string) {
    if (status === "online") return "bg-emerald-400";
    if (status === "ingame") return "bg-amber-400";
    return "bg-slate-500";
  }
  function statusLabel(status?: string) {
    if (status === "online") return "Online";
    if (status === "ingame") return "In-Game";
    return "Offline";
  }
  function statusTextColor(status?: string) {
    if (status === "online") return "text-emerald-400";
    if (status === "ingame") return "text-amber-400";
    return "text-slate-500";
  }

  return (
    <div
      className="card ndn-game-shell ndn-page"
      style={{ minHeight: "calc(100% + 100px)", paddingBottom: "100px" }}
    >
      <h2 className="text-2xl font-bold text-brand-700 mb-2 ndn-section-title">
        Friends 👥
      </h2>
      <p className="mb-2 text-brand-600">
        Manage your friends. See who&apos;s online, in-game, or offline; find
        new teammates; and invite people to play.
      </p>

      {/* Status summary cards — clickable to filter */}
      <div className="grid gap-3 mb-4 grid-cols-2 sm:grid-cols-5">
        {[
          {
            key: "all" as const,
            label: "All",
            value: friends.length,
            accent: "bg-white/5 border-white/20",
            activeAccent:
              "bg-indigo-500/20 border-indigo-500/50 ring-2 ring-indigo-500/30",
          },
          {
            key: "online" as const,
            label: "Online",
            value: statusSummary.online,
            accent: "bg-emerald-500/10 border-emerald-500/40",
            activeAccent:
              "bg-emerald-500/20 border-emerald-500/60 ring-2 ring-emerald-500/30",
          },
          {
            key: "ingame" as const,
            label: "In-Game",
            value: statusSummary.ingame,
            accent: "bg-amber-500/10 border-amber-500/40",
            activeAccent:
              "bg-amber-500/20 border-amber-500/60 ring-2 ring-amber-500/30",
          },
          {
            key: "offline" as const,
            label: "Offline",
            value: statusSummary.offline,
            accent: "bg-slate-500/10 border-slate-500/40",
            activeAccent:
              "bg-slate-500/20 border-slate-500/60 ring-2 ring-slate-500/30",
          },
          {
            key: "requests" as const,
            label: "Requests",
            value: requestsCount,
            accent: "bg-indigo-500/10 border-indigo-500/40",
            activeAccent:
              "bg-indigo-500/20 border-indigo-500/60 ring-2 ring-indigo-500/30",
          },
        ].map((stat) => (
          <button
            key={stat.key}
            type="button"
            onClick={() => {
              setFilter(stat.key);
              setSelectedFriend(null);
            }}
            className={`rounded-2xl border px-3 py-2 text-center cursor-pointer transition-all ${filter === stat.key ? stat.activeAccent : stat.accent} hover:scale-[1.02] active:scale-[0.98]`}
          >
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              {stat.label}
            </div>
            <div className="text-2xl font-semibold text-white">
              {stat.value}
            </div>
          </button>
        ))}
      </div>

      {/* Main content: Friends list + Detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-4">
        {/* Left column: Friends list (or requests) */}
        <div
          className={`${selectedFriend ? "hidden lg:block" : "block"} lg:col-span-2 space-y-3`}
        >
          {/* Friend Requests section (shows when filter is 'requests' or 'all') */}
          {(filter === "requests" || filter === "all") && requestsCount > 0 && (
            <div className="p-4 rounded-[28px] bg-gradient-to-br from-slate-900/80 to-indigo-900/60 border border-white/10 shadow-2xl">
              <div className="font-semibold text-white/90 mb-2">
                Friend Requests
              </div>
              <ul className="space-y-3">
                {incomingRequests.map((r) => (
                  <li
                    key={`incoming-${r.id || r.fromEmail}`}
                    className="p-3 rounded-2xl border border-white/10 bg-slate-900/40 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">
                        {r.fromUsername || r.fromEmail || "Unknown User"}
                      </span>
                      <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                        Incoming
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptFriend(r.id, r.fromEmail)}
                        className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                      >
                        Accept ✅
                      </button>
                      <button
                        onClick={() => declineFriend(r.id)}
                        className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/30 transition-colors"
                      >
                        Decline ❌
                      </button>
                    </div>
                  </li>
                ))}
                {outgoingRequestsResolved.map((r) => (
                  <li
                    key={`outgoing-${r.id || r.toEmail}`}
                    className="p-3 rounded-2xl border border-white/10 bg-slate-900/40 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">
                        {r.toUsername || r.toEmail || "Unknown User"}
                      </span>
                      <div className="px-3 py-1 rounded-lg bg-white/5 text-white/40 text-xs font-bold">
                        Pending ⏳
                      </div>
                    </div>
                    <button
                      onClick={() => cancelRequest(r.id)}
                      className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/30 transition-colors w-fit"
                    >
                      Cancel ✖️
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Friends list section */}
          {filter !== "requests" && (
            <div className="p-4 rounded-[28px] bg-gradient-to-br from-slate-900/80 to-indigo-900/60 border border-white/10 shadow-2xl">
              <div className="font-semibold text-white/90 mb-3 flex items-center justify-between">
                <span>
                  {filter === "all"
                    ? "All Friends"
                    : filter === "online"
                      ? "Online Friends"
                      : filter === "ingame"
                        ? "In-Game Friends"
                        : "Offline Friends"}{" "}
                  ({filtered.length})
                </span>
              </div>
              {filtered.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center">
                  {friends.length === 0
                    ? "No friends yet. Search below to add some!"
                    : `No ${filter === "all" ? "" : filter + " "}friends right now.`}
                </div>
              ) : (
                <ul className="space-y-2 max-h-[50vh] overflow-auto">
                  {filtered.map((f) => {
                    const preview = threadPreviewByEmail.get(
                      f.email.toLowerCase(),
                    );
                    const unread =
                      unreadCountByEmail.get(f.email.toLowerCase()) || 0;
                    const isSelected = selectedFriend?.email === f.email;
                    return (
                      <li key={f.email}>
                        <button
                          type="button"
                          onClick={() => openFriendDetail(f)}
                          className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? "border-indigo-500/60 bg-indigo-500/15 ring-1 ring-indigo-500/30"
                              : "border-white/10 bg-slate-900/40 hover:bg-slate-800/60 hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="relative shrink-0">
                              {f.avatar ? (
                                <img
                                  src={f.avatar}
                                  alt=""
                                  className="w-11 h-11 rounded-full object-cover border-2 border-white/20"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20">
                                  {(f.username ||
                                    f.email ||
                                    "?")[0].toUpperCase()}
                                </div>
                              )}
                              <span
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${statusDot(f.status)}`}
                              />
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white truncate">
                                  {f.username || f.email}
                                </span>
                                {unread > 0 && (
                                  <span className="shrink-0 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                    {unread > 9 ? "9+" : unread}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className={statusTextColor(f.status)}>
                                  {statusLabel(f.status)}
                                </span>
                                {f.status === "ingame" && f.match && (
                                  <>
                                    <span className="text-slate-600">•</span>
                                    <span className="text-amber-300 truncate">
                                      {f.match.game}{" "}
                                      {labelForMode(f.match.mode)}{" "}
                                      {f.match.value}
                                    </span>
                                  </>
                                )}
                                {f.threeDartAvg ? (
                                  <>
                                    <span className="text-slate-600">•</span>
                                    <span className="text-indigo-300">
                                      3DA: {f.threeDartAvg.toFixed(1)}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              {preview && (
                                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                                  {preview.message}
                                </div>
                              )}
                            </div>
                            {/* Arrow */}
                            <div className="text-slate-500 shrink-0">›</div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right column: Friend Detail Panel OR Messages placeholder */}
        <div
          className={`${selectedFriend ? "block" : "hidden lg:block"} lg:col-span-3`}
        >
          {selectedFriend ? (
            <div className="p-4 rounded-[28px] bg-slate-950/70 border border-white/10 shadow-2xl">
              {/* Back button (mobile) + friend header */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  className="lg:hidden px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-bold"
                  onClick={() => setSelectedFriend(null)}
                >
                  ← Back
                </button>
                <div className="relative shrink-0">
                  {friendAvatar || selectedFriend.avatar ? (
                    <img
                      src={friendAvatar || selectedFriend.avatar || ""}
                      alt=""
                      className="w-14 h-14 rounded-full object-cover border-2 border-white/20"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg border-2 border-white/20">
                      {(selectedFriend.username ||
                        selectedFriend.email ||
                        "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span
                    className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-950 ${statusDot(selectedFriend.status)}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg text-white truncate">
                    {selectedFriend.username || selectedFriend.email}
                  </div>
                  <div
                    className={`text-sm ${statusTextColor(selectedFriend.status)}`}
                  >
                    {statusLabel(selectedFriend.status)}
                    {selectedFriend.status === "ingame" &&
                      selectedFriend.match && (
                        <span className="text-amber-300 ml-2">
                          — {selectedFriend.match.game}{" "}
                          {labelForMode(selectedFriend.match.mode)}{" "}
                          {selectedFriend.match.value}
                        </span>
                      )}
                    {selectedFriend.status === "offline" &&
                    selectedFriend.lastSeen ? (
                      <span className="text-slate-500 ml-2">
                        — last seen {timeAgo(selectedFriend.lastSeen)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Detail tabs */}
              <div className="flex gap-1 mb-4 rounded-xl bg-white/5 p-1">
                {(["profile", "chat", "compare"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDetailTab(tab)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      detailTab === tab
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {tab === "profile"
                      ? "Profile"
                      : tab === "chat"
                        ? "Chat 💬"
                        : "Compare 📊"}
                  </button>
                ))}
              </div>

              {/* PROFILE TAB */}
              {detailTab === "profile" && (
                <div className="space-y-4">
                  {/* Quick stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-indigo-300">
                        {selectedFriend.threeDartAvg
                          ? selectedFriend.threeDartAvg.toFixed(1)
                          : friendStats?.allTime
                            ? friendStats.allTime.darts
                              ? (
                                  (friendStats.allTime.scored /
                                    friendStats.allTime.darts) *
                                  3
                                ).toFixed(1)
                              : "—"
                            : "—"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        3-Dart Avg
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-yellow-300">
                        {friendStats?.allTime?.num180s ?? "—"}
                      </div>
                      <div className="text-[10px] text-slate-400">180s</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-orange-300">
                        {friendStats?.allTime?.bestCheckout ?? "—"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        High Checkout
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-rose-300">
                        {friendStats?.allTime?.bestLegDarts ?? "—"}
                      </div>
                      <div className="text-[10px] text-slate-400">Best Leg</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setDetailTab("chat")}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
                    >
                      💬 Message
                    </button>
                    {selectedFriend.status === "ingame" &&
                      selectedFriend.roomId && (
                        <button
                          onClick={() => spectate(selectedFriend.roomId)}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-colors"
                        >
                          👁️ Spectate
                        </button>
                      )}
                    <button
                      onClick={() => setDetailTab("compare")}
                      className="px-4 py-2 rounded-xl bg-blue-600/80 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
                    >
                      📊 Compare Stats
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${selectedFriend.username || selectedFriend.email} from friends?`,
                          )
                        ) {
                          removeFriend(selectedFriend.email);
                          setSelectedFriend(null);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-bold transition-colors"
                    >
                      ✖ Remove
                    </button>
                  </div>

                  {/* Match info if in-game */}
                  {selectedFriend.status === "ingame" &&
                    selectedFriend.match && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <div className="text-sm font-semibold text-amber-300 mb-1">
                          Currently Playing
                        </div>
                        <div className="text-white font-bold">
                          {selectedFriend.match.game}{" "}
                          {labelForMode(selectedFriend.match.mode)}{" "}
                          {selectedFriend.match.value}
                        </div>
                        {selectedFriend.roomId && (
                          <button
                            onClick={() => spectate(selectedFriend.roomId)}
                            className="mt-2 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
                          >
                            Watch Live 👁️
                          </button>
                        )}
                      </div>
                    )}
                </div>
              )}

              {/* CHAT TAB */}
              {detailTab === "chat" && (
                <div className="flex flex-col">
                  <div
                    ref={chatScrollRef}
                    className="flex-1 min-h-[260px] max-h-[55vh] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3"
                  >
                    {activeThread.length === 0 ? (
                      <div className="text-sm text-slate-400 p-3">
                        No messages yet. Say hi 👋
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {activeThread.map((m) => {
                          const isMine =
                            String(m.from || "").toLowerCase() === email;
                          return (
                            <li
                              key={m.id}
                              className={isMine ? "flex justify-end" : "flex"}
                            >
                              <div
                                className={
                                  isMine
                                    ? "max-w-[95%] rounded-2xl bg-indigo-600/80 border border-indigo-300/20 px-3 py-2"
                                    : "max-w-[95%] rounded-2xl bg-slate-900/60 border border-white/10 px-3 py-2"
                                }
                              >
                                <div className="text-[10px] text-slate-300/80 mb-1 flex items-center justify-between gap-2">
                                  <span className="font-bold">
                                    {isMine
                                      ? "You"
                                      : selectedFriend.username ||
                                        selectedFriend.email}
                                  </span>
                                  <span className="shrink-0">
                                    {new Date(m.ts).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-sm whitespace-pre-wrap break-words text-white/90">
                                  {censorProfanity(m.message)}
                                </div>
                                {!isMine && (
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      onClick={() => msgs.remove(m.id)}
                                      className="px-3 py-1 rounded-lg bg-rose-500/15 text-rose-300 text-[11px] font-bold hover:bg-rose-500/25 transition-colors"
                                    >
                                      Delete 🗑️
                                    </button>
                                    <button
                                      className="px-3 py-1 rounded-lg bg-rose-500/15 text-rose-300 text-[11px] font-bold hover:bg-rose-500/25 transition-colors"
                                      onClick={async () => {
                                        const reason = prompt(
                                          "Report reason (what happened)?",
                                        );
                                        if (!reason) return;
                                        try {
                                          await apiFetch(
                                            "/api/friends/report",
                                            {
                                              method: "POST",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                              },
                                              body: JSON.stringify({
                                                reporterEmail: email,
                                                offenderEmail: m.from,
                                                reason,
                                                messageId: m.id,
                                              }),
                                            },
                                          );
                                          toast("Report sent to admin", {
                                            type: "info",
                                          });
                                        } catch {}
                                      }}
                                    >
                                      Report
                                    </button>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900/30 p-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <textarea
                        className="w-full min-h-[44px] max-h-40 bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-400 resize-y"
                        placeholder={`Message ${selectedFriend.username || "friend"}...`}
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendChatMessage();
                          }
                        }}
                      />
                      <button
                        onClick={sendChatMessage}
                        className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-colors"
                      >
                        Send
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      Tip: Press Enter to send, Shift+Enter for a new line.
                    </div>
                  </div>
                </div>
              )}

              {/* COMPARE STATS TAB */}
              {detailTab === "compare" && (
                <div className="space-y-4">
                  <div className="text-sm text-slate-400 mb-2">
                    Head-to-head comparison between you and{" "}
                    {selectedFriend.username || "friend"}
                  </div>
                  {(() => {
                    const theirAvg = friendStats?.allTime?.darts
                      ? (friendStats.allTime.scored /
                          friendStats.allTime.darts) *
                        3
                      : selectedFriend.threeDartAvg || 0;
                    const their180s = friendStats?.allTime?.num180s ?? 0;
                    const theirCO = friendStats?.allTime?.bestCheckout ?? 0;
                    const theirBestLeg =
                      friendStats?.allTime?.bestLegDarts ?? 0;

                    const rows = [
                      {
                        label: "3-Dart Average",
                        mine: myAllTimeAvg,
                        theirs: theirAvg,
                        format: (v: number) => (v ? v.toFixed(1) : "—"),
                        higher: true,
                      },
                      {
                        label: "180s",
                        mine: myAllTime.num180s || 0,
                        theirs: their180s,
                        format: (v: number) => String(v || "—"),
                        higher: true,
                      },
                      {
                        label: "Highest Checkout",
                        mine: myAllTime.bestCheckout || 0,
                        theirs: theirCO,
                        format: (v: number) => String(v || "—"),
                        higher: true,
                      },
                      {
                        label: "Best Leg (darts)",
                        mine: myAllTime.bestLegDarts || 0,
                        theirs: theirBestLeg,
                        format: (v: number) => String(v || "—"),
                        higher: false,
                      },
                      {
                        label: "Games Played",
                        mine: myTotalGames,
                        theirs: friendStats?.gameModes
                          ? Object.values(
                              friendStats.gameModes as Record<
                                string,
                                { played?: number }
                              >,
                            ).reduce((s: number, g) => s + (g.played || 0), 0)
                          : 0,
                        format: (v: number) => String(v || "—"),
                        higher: true,
                      },
                      {
                        label: "Wins",
                        mine: myTotalWins,
                        theirs: friendStats?.gameModes
                          ? Object.values(
                              friendStats.gameModes as Record<
                                string,
                                { won?: number }
                              >,
                            ).reduce((s: number, g) => s + (g.won || 0), 0)
                          : 0,
                        format: (v: number) => String(v || "—"),
                        higher: true,
                      },
                    ];

                    return (
                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-3 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wide">
                          <div>You</div>
                          <div className="text-center">Stat</div>
                          <div className="text-right">
                            {selectedFriend.username || "Friend"}
                          </div>
                        </div>
                        {rows.map((row) => {
                          const myVal = Number(row.mine) || 0;
                          const thVal = Number(row.theirs) || 0;
                          const myWin = row.higher
                            ? myVal > thVal
                            : myVal > 0 && myVal < thVal;
                          const thWin = row.higher
                            ? thVal > myVal
                            : thVal > 0 && thVal < myVal;
                          return (
                            <div
                              key={row.label}
                              className="grid grid-cols-3 px-4 py-3 border-t border-white/5 items-center"
                            >
                              <div
                                className={`font-bold text-sm ${myWin ? "text-emerald-400" : "text-white"}`}
                              >
                                {row.format(myVal)}
                                {myWin && (
                                  <span className="ml-1 text-[10px]">🏆</span>
                                )}
                              </div>
                              <div className="text-center text-xs text-slate-400 font-medium">
                                {row.label}
                              </div>
                              <div
                                className={`text-right font-bold text-sm ${thWin ? "text-emerald-400" : "text-white"}`}
                              >
                                {row.format(thVal)}
                                {thWin && (
                                  <span className="ml-1 text-[10px]">🏆</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {!friendStats && (
                    <div className="text-center text-sm text-slate-500 py-3">
                      No stats available for{" "}
                      {selectedFriend.username || "this player"} yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* No friend selected — show placeholder */
            <div className="p-4 rounded-[28px] bg-slate-950/70 border border-white/10 shadow-2xl hidden lg:flex flex-col items-center justify-center min-h-[400px] text-center gap-3">
              <div className="text-4xl">👆</div>
              <div className="text-lg font-semibold text-white/90">
                Select a friend
              </div>
              <div className="text-sm text-slate-400 max-w-sm">
                Click on a friend from the list to view their profile, send
                messages, compare stats, or spectate their game.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Find friends section */}
      <div className="p-4 rounded-[28px] bg-slate-950/70 border border-white/10 shadow-xl">
        <div className="font-semibold mb-2 text-white/90">Find Friends</div>
        <input
          className="input w-full mb-2"
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => search(e.target.value)}
        />
        <ul className="space-y-2 mb-3 max-h-[320px] overflow-auto">
          {results.map((r) => (
            <li
              key={r.email}
              className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-slate-900/40"
            >
              <div className="relative shrink-0">
                {r.avatar ? (
                  <img
                    src={r.avatar}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border-2 border-white/20"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20">
                    {(r.username || r.email || "?")[0].toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${statusDot(r.status)}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">
                  {r.username || r.email}
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>
                    3DA:{" "}
                    <span className="text-indigo-300 font-semibold">
                      {r.threeDartAvg ? r.threeDartAvg.toFixed(1) : "—"}
                    </span>
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className={statusTextColor(r.status)}>
                    {statusLabel(r.status)}
                  </span>
                </div>
              </div>
              <div className="shrink-0">
                {r.relationship === "friend" ? (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                    Friends ✓
                  </span>
                ) : r.relationship === "pending-outgoing" ? (
                  <span className="px-3 py-1.5 rounded-xl bg-white/5 text-white/40 text-xs font-bold">
                    Pending ⏳
                  </span>
                ) : r.relationship === "pending-incoming" ? (
                  <button
                    onClick={() => {
                      const req = incomingRequests.find(
                        (rq) =>
                          rq.fromEmail.toLowerCase() === r.email.toLowerCase(),
                      );
                      if (req) acceptFriend(req.id, req.fromEmail);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                  >
                    Accept ✅
                  </button>
                ) : (
                  <button
                    onClick={() => addFriend(r.email)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-xl text-white text-xs font-bold transition-colors ${loading ? "bg-indigo-900/40 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"}`}
                  >
                    {loading ? "Working…" : "Add ➕"}
                  </button>
                )}
              </div>
            </li>
          ))}
          {results.length === 0 && q && (
            <li className="text-sm text-slate-400 text-center py-4">
              No accounts found for &quot;{q}&quot;
            </li>
          )}
          {results.length === 0 && !q && (
            <li className="text-xs opacity-60">Type to search...</li>
          )}
        </ul>
        <div className="font-semibold mb-1 text-white/90">Suggested</div>
        <ul className="space-y-2 max-h-[280px] overflow-auto">
          {suggested.map((s) => (
            <li
              key={s.email}
              className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-slate-900/40"
            >
              <div className="relative shrink-0">
                {s.avatar ? (
                  <img
                    src={s.avatar}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border-2 border-white/20"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20">
                    {(s.username || s.email || "?")[0].toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${statusDot(s.status)}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">
                  {s.username || s.email}
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>
                    3DA:{" "}
                    <span className="text-indigo-300 font-semibold">
                      {s.threeDartAvg ? s.threeDartAvg.toFixed(1) : "—"}
                    </span>
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className={statusTextColor(s.status)}>
                    {statusLabel(s.status)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => addFriend(s.email)}
                disabled={loading}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-white text-xs font-bold transition-colors ${loading ? "bg-indigo-900/40 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"}`}
              >
                {loading ? "Working…" : "Add ➕"}
              </button>
            </li>
          ))}
          {suggested.length === 0 && (
            <li className="text-xs opacity-60">No suggestions right now.</li>
          )}
        </ul>
      </div>

      {/* Message Popup (legacy) */}
      {messagePopup.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-white">
                Send Message ✉️
              </h3>
            </div>
            {/* eslint-disable jsx-a11y/no-autofocus */}
            <textarea
              className="w-full h-32 bg-slate-700 border border-slate-600 rounded p-3 text-white placeholder-slate-400 resize-none"
              placeholder="Type your message here..."
              id="message-input"
              autoFocus
            />
            {/* eslint-enable jsx-a11y/no-autofocus */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={sendMessage}
                className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-colors"
              >
                Send Message 📤
              </button>
              <button
                className="btn bg-slate-600 hover:bg-slate-700"
                onClick={() => setMessagePopup({ show: false })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
