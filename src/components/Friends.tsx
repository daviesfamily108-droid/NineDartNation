import { useEffect, useMemo, useState } from "react";
import { useToast } from "../store/toast";
import { useMessages } from "../store/messages";
import { censorProfanity } from "../utils/profanity";
import TabPills from "./ui/TabPills";
import { labelForMode } from "../utils/games";

type Friend = {
  email: string;
  username?: string;
  status?: "online" | "offline" | "ingame";
  lastSeen?: number;
  roomId?: string | null;
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

  async function refresh() {
    if (!email) return;
    try {
      const [fl, sg, rq, out] = await Promise.all([
        fetch(`/api/friends/list?email=${encodeURIComponent(email)}`).then(
          (r) => r.json(),
        ),
        fetch(`/api/friends/suggested?email=${encodeURIComponent(email)}`).then(
          (r) => r.json(),
        ),
        fetch(`/api/friends/requests?email=${encodeURIComponent(email)}`).then(
          (r) => r.json(),
        ),
        fetch(`/api/friends/outgoing?email=${encodeURIComponent(email)}`).then(
          (r) => r.json(),
        ),
      ]);
      setFriends(fl.friends || []);
      setSuggested(sg.suggestions || []);
      setRequests(rq.requests || []);
      setOutgoingRequests(out.requests || []);
    } catch {}
  }

  useEffect(() => {
    refresh();
  }, [email]);

  async function search(term: string) {
    setQ(term);
    if (!term) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/friends/search?q=${encodeURIComponent(term)}`,
      );
      const data = await res.json();
      setResults(data.results || []);
    } catch {}
  }

  async function addFriend(target: string) {
    if (!email || !target) return;
    setLoading(true);
    try {
      await fetch("/api/friends/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, friend: target }),
      });
      await refresh();
      setQ("");
      setResults([]);
      toast("Friend added", { type: "success" });
    } finally {
      setLoading(false);
    }
  }

  async function removeFriend(target: string) {
    if (!email || !target) return;
    setLoading(true);
    try {
      await fetch("/api/friends/remove", {
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

  async function acceptFriend(requestId: string) {
    try {
      await fetch("/api/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, requestId }),
      });
      await refresh();
      toast("Friend request accepted", { type: "success" });
    } catch {}
  }

  async function declineFriend(requestId: string) {
    try {
      await fetch("/api/friends/decline", {
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
      await fetch("/api/friends/cancel", {
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
      await fetch("/api/friends/message", {
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

  // Friend Requests pill: use real requests data
  const requestsCount = requests.length + outgoingRequests.length;
  return (
    <div className="card ndn-game-shell">
      <h2 className="text-2xl font-bold text-brand-700 mb-2">Friends 👥</h2>
      <p className="mb-2 text-brand-600">
        Manage your friends. See who's online, in-game, or offline; find new
        teammates; and invite people to play.
      </p>
      <div className="grid gap-3 mb-4 grid-cols-2 sm:grid-cols-4">
        {[
          {
            label: "Online",
            value: statusSummary.online,
            accent: "bg-emerald-500/10 border-emerald-500/40",
          },
          {
            label: "In-Game",
            value: statusSummary.ingame,
            accent: "bg-amber-500/10 border-amber-500/40",
          },
          {
            label: "Offline",
            value: statusSummary.offline,
            accent: "bg-slate-500/10 border-slate-500/40",
          },
          {
            label: "Requests",
            value: requestsCount,
            accent: "bg-indigo-500/10 border-indigo-500/40",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-2xl border px-3 py-2 text-center ${stat.accent}`}
          >
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              {stat.label}
            </div>
            <div className="text-2xl font-semibold text-white">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-2 p-4 rounded-[28px] bg-gradient-to-br from-slate-900/80 to-indigo-900/60 border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-white/90">Your Friends 👥</div>
          </div>
          <TabPills
            tabs={[
              { key: "all", label: "All 👥" },
              { key: "online", label: "Online 🟢" },
              { key: "ingame", label: "In-Game 🎮" },
              { key: "offline", label: "Offline ⚪" },
              {
                key: "requests",
                label: `Requests ${requestsCount > 0 ? "(" + requestsCount + ")" : ""} 📩`,
              },
            ]}
            active={filter}
            onChange={(k) => setFilter(k as any)}
            className="mb-3"
          />
          {filter === "requests" ? (
            <ul className="space-y-3">
              {requestsCount > 0 ? (
                <>
                  {/* Incoming requests */}
                  {requests.length > 0 &&
                    requests.map((r) => (
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
                            onClick={() => acceptFriend(r.id)}
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
                  {/* Outgoing requests */}
                  {outgoingRequests.length > 0 &&
                    outgoingRequests.map((r) => (
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
                          className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/30 transition-colors"
                        >
                          Cancel ✖️
                        </button>
                      </li>
                    ))}
                </>
              ) : (
                <li className="text-sm opacity-70">No friend requests yet.</li>
              )}
            </ul>
          ) : (
            <ul className="space-y-3">
              {filtered.map((f) => (
                <li
                  key={f.email}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 flex flex-col gap-3 shadow-lg"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                            f.status === "online"
                              ? "bg-emerald-400"
                              : f.status === "ingame"
                                ? "bg-amber-400"
                                : "bg-slate-400"
                          }`}
                        ></span>
                        <span className="font-semibold text-white">
                          {f.username || f.email}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {f.status || "offline"}
                        {f.status !== "online" && f.lastSeen
                          ? ` · ${timeAgo(f.lastSeen)}`
                          : ""}
                      </div>
                      {f.status === "ingame" && f.match && (
                        <div className="text-[11px] inline-flex items-center gap-1 mt-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-0.5 text-indigo-200">
                          <span className="font-medium">Live Match</span>
                          <span>
                            {f.match.game} {labelForMode(f.match.mode)}{" "}
                            {f.match.value}
                            {f.match.game === "X01" && f.match.startingScore
                              ? ` · ${f.match.startingScore}`
                              : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {f.status === "ingame" && f.roomId && (
                        <button
                          onClick={() => spectate(f.roomId)}
                          className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs font-bold hover:bg-indigo-500/30 transition-colors"
                        >
                          Spectate 👁️
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setMessagePopup({
                            show: true,
                            toEmail: f.email,
                            toUser: f.username || f.email,
                          });
                        }}
                        className="flex-1 px-3 py-2 rounded-xl bg-indigo-500/20 text-indigo-400 text-xs font-bold hover:bg-indigo-500/30 transition-colors"
                      >
                        Message 💬
                      </button>
                      <button
                        onClick={() => removeFriend(f.email)}
                        className="px-3 py-2 rounded-xl bg-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/30 transition-colors"
                        title="Remove Friend"
                      >
                        Remove 🗑️
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="text-sm opacity-70">
                  No friends {filter !== "all" ? `in ${filter}` : ""} yet.
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="p-4 rounded-[28px] bg-slate-950/70 border border-white/10 shadow-xl">
          <div className="font-semibold mb-2 text-white/90">Find Friends</div>
          <input
            className="input w-full mb-2"
            placeholder="Search by name or email"
            value={q}
            onChange={(e) => search(e.target.value)}
          />
          <ul className="space-y-2 mb-3 max-h-48 overflow-auto">
            {results.map((r) => (
              <li
                key={r.email}
                className="flex items-center justify-between gap-2 p-3 rounded-2xl border border-white/10 bg-slate-900/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${r.status === "online" ? "bg-emerald-400" : r.status === "ingame" ? "bg-amber-400" : "bg-slate-400"}`}
                  ></span>
                  <span>{r.username || r.email}</span>
                </div>
                <button
                  onClick={() => addFriend(r.email)}
                  disabled={loading}
                  className={`px-4 py-2 rounded-xl text-white text-sm font-bold transition-colors ${loading ? "bg-indigo-900/40 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"}`}
                >
                  {loading ? "Working…" : "Add ➕"}
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="text-xs opacity-60">Type to search...</li>
            )}
          </ul>
          <div className="font-semibold mb-1 text-white/90">Suggested</div>
          <ul className="space-y-2 max-h-48 overflow-auto">
            {suggested.map((s) => (
              <li
                key={s.email}
                className="flex items-center justify-between gap-2 p-3 rounded-2xl border border-white/10 bg-slate-900/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${s.status === "online" ? "bg-emerald-400" : s.status === "ingame" ? "bg-amber-400" : "bg-slate-400"}`}
                  ></span>
                  <span>{s.username || s.email}</span>
                </div>
                <button
                  onClick={() => addFriend(s.email)}
                  disabled={loading}
                  className={`px-4 py-2 rounded-xl text-white text-sm font-bold transition-colors ${loading ? "bg-indigo-900/40 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"}`}
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
      </div>

      {/* Direct Messages */}
      <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Messages 💬</div>
          <button
            onClick={() => msgs.markAllRead()}
            className="text-xs text-indigo-400 font-bold hover:text-indigo-300 transition-colors"
          >
            Mark all read ✅
          </button>
        </div>
        {msgs.inbox.length === 0 ? (
          <div className="text-sm opacity-70">No messages yet.</div>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {msgs.inbox.map((m) => (
              <li key={m.id} className="p-2 rounded bg-black/20 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold">{m.from}</span>{" "}
                    <span className="opacity-70 text-xs">
                      · {new Date(m.ts).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setMessagePopup({
                          show: true,
                          toEmail: m.from,
                          toUser: m.from,
                        });
                      }}
                      className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs font-bold hover:bg-indigo-500/30 transition-colors"
                    >
                      Reply ↩️
                    </button>
                    <button
                      onClick={() => msgs.remove(m.id)}
                      className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/30 transition-colors"
                    >
                      Delete 🗑️
                    </button>
                    <button
                      className="btn bg-rose-600 hover:bg-rose-700 px-2 py-1 text-xs"
                      onClick={async () => {
                        const reason = prompt("Report reason (what happened)?");
                        if (!reason) return;
                        try {
                          await fetch("/api/friends/report", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              reporterEmail: email,
                              offenderEmail: m.from,
                              reason,
                              messageId: m.id,
                            }),
                          });
                          toast("Report sent to admin", { type: "info" });
                        } catch {}
                      }}
                    >
                      Report
                    </button>
                  </div>
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words">
                  {censorProfanity(m.message)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Message Popup */}
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
