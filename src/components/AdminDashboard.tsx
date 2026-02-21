import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../utils/api.js";
import BarChart from "./BarChart.js";
import TabPills from "./ui/TabPills.js";
import { getGameModeStats } from "../store/profileStats.js";
import { useUserSettings } from "../store/userSettings.js";
import {
  allGames,
  labelForMode,
  getModeOptionsForGame,
  getModeValueOptionsForGame,
} from "../utils/games.js";
import { useWS } from "./WSProvider.js";
import CameraStatusBadge from "./CameraStatusBadge.js";
import HelpdeskChat from "./HelpdeskChat.js";
import { useToast } from "../store/toast.js";

const OWNER_EMAIL = "daviesfamily108@gmail.com";

function EmailEditor({
  kind,
  label,
  emailCopy,
  onSave,
  onPreview,
}: {
  kind: string;
  label: string;
  emailCopy: any;
  onSave: (kind: string, payload: any) => void;
  onPreview: (kind: string, openInNewTab?: boolean) => void;
}) {
  const key =
    kind === "confirm-email"
      ? "confirmEmail"
      : kind === "changed"
        ? "changed"
        : kind;
  const cfg = emailCopy?.[key] || { title: "", intro: "", buttonLabel: "" };
  const [title, setTitle] = useState(cfg.title || "");
  const [intro, setIntro] = useState(cfg.intro || "");
  const [btn, setBtn] = useState(cfg.buttonLabel || "");
  useEffect(() => {
    setTitle(cfg.title || "");
    setIntro(cfg.intro || "");
    setBtn(cfg.buttonLabel || "");
  }, [cfg.title, cfg.intro, cfg.buttonLabel]);

  return (
    <div className="p-2 rounded bg-black/20 space-y-2">
      <div className="font-semibold">{label}</div>
      <input
        className="input w-full"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="input w-full"
        rows={2}
        placeholder="Intro line (optional)"
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
      />
      <input
        className="input w-full"
        placeholder="Button label (optional)"
        value={btn}
        onChange={(e) => setBtn(e.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <button
          className="btn"
          type="button"
          onClick={() => onPreview(kind, true)}
        >
          Preview
        </button>
        <button className="btn" type="button" onClick={() => onPreview(kind)}>
          Popup
        </button>
        <button
          className="btn"
          onClick={() => onSave(kind, { title, intro, buttonLabel: btn })}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function AdminDashboard({ user }: { user: any }) {
  const { hiddenSections, setHiddenSections } = useUserSettings();
  const hiddenSectionList = hiddenSections || [];
  const sectionCatalog = useMemo(
    () => [
      { key: "tab:score", label: "Home tab", group: "Tabs" },
      { key: "tab:camera", label: "Camera tab", group: "Tabs" },
      { key: "tab:online", label: "Online Play tab", group: "Tabs" },
      { key: "tab:offline", label: "Offline tab", group: "Tabs" },
      { key: "tab:tournaments", label: "Tournaments tab", group: "Tabs" },
      { key: "tab:friends", label: "Friends tab", group: "Tabs" },
      { key: "tab:stats", label: "Stats tab", group: "Tabs" },
      { key: "tab:settings", label: "Settings tab", group: "Tabs" },
      { key: "tab:fullaccess", label: "Premium tab", group: "Tabs" },
      { key: "tab:admin", label: "Admin tab", group: "Tabs" },
      {
        key: "stats:player-cards",
        label: "Stats: player cards",
        group: "Stats",
      },
      {
        key: "stats:opponent-compare",
        label: "Stats: opponent compare",
        group: "Stats",
      },
      {
        key: "stats:score-distribution",
        label: "Stats: score distribution",
        group: "Stats",
      },
      { key: "stats:other-modes", label: "Stats: other modes", group: "Stats" },
      { key: "global:helpassistant", label: "Help assistant", group: "Global" },
      { key: "global:footer", label: "Footer", group: "Global" },
      { key: "global:camera-logger", label: "Camera logger", group: "Global" },
      {
        key: "global:camera-watchdog",
        label: "Camera watchdog",
        group: "Global",
      },
      {
        key: "global:camera-recovery",
        label: "Camera recovery toasts",
        group: "Global",
      },
    ],
    [],
  );
  const groupedSections = useMemo(() => {
    const groups: Record<string, typeof sectionCatalog> = {};
    for (const item of sectionCatalog) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [sectionCatalog]);
  const toggleSection = useCallback(
    (key: string) => {
      const next = hiddenSectionList.includes(key)
        ? hiddenSectionList.filter((s) => s !== key)
        : [...hiddenSectionList, key];
      setHiddenSections(next);
    },
    [hiddenSectionList, setHiddenSections],
  );
  const ws = (() => {
    try {
      return useWS();
    } catch {
      return null;
    }
  })();
  const [admins, setAdmins] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [status] = useState<any>(null);
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(false);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [createForm, setCreateForm] = useState<any>({
    title: "Official Tournament",
    game: "X01",
    mode: "bestof",
    value: 3,
    description: "",
    startAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16),
    checkinMinutes: 30,
    capacity: 16,
    prizeType: "premium",
    prizeAmount: 3,
    prizeNotes: "",
  });
  const [emailCopy, setEmailCopy] = useState<any>({
    reset: {},
    reminder: {},
    confirmEmail: {},
    changed: {},
  });
  const [preview, setPreview] = useState<{
    open: boolean;
    kind?: string;
    html?: string;
  }>({ open: false });
  const [activeTab, setActiveTab] = useState<
    "general" | "maintenance" | "premium" | "helpdesk" | "tourneys"
  >("general");
  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL;
  const [winners] = useState<any[]>([]);
  const [reports] = useState<any[]>([]);
  const [helpRequests, setHelpRequests] = useState<any[]>([]);
  const [helpTyping, setHelpTyping] = useState<
    Record<string, { who: string; ts: number }>
  >({});
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [, setLogs] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [clusteringEnabled, setClusteringEnabled] = useState(false);
  const [clusterCapacity, setClusterCapacity] = useState(1500);
  const [, setShowCreate] = useState(false);
  const [newMembers, setNewMembers] = useState<
    Array<{ email: string; username: string; createdAt: string | null }>
  >([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const broadcastTournaments = async () => {
    setLoading(true);
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch("/api/admin/tournaments/broadcast", {
        method: "POST",
        headers,
      });
      if (res.ok) {
        toast("Tournaments broadcast triggered", { type: "success" });
      } else {
        toast("Broadcast failed", { type: "error" });
      }
    } catch (err) {
      toast("Broadcast request failed", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // --- Game usage (played/won per mode) ---
  const [gmVersion, setGmVersion] = useState(0);
  useEffect(() => {
    const on = () => setGmVersion((v) => v + 1);
    window.addEventListener("ndn:stats-updated", on as any);
    return () => window.removeEventListener("ndn:stats-updated", on as any);
  }, []);
  const gmStats = useMemo(
    () => getGameModeStats(allGames as unknown as string[]),
    [gmVersion],
  );

  const toast = useToast();

  useEffect(() => {
    if (!preview.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreview({ open: false });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview.open]);

  // Fetch admin data on mount
  useEffect(() => {
    refresh();
    fetchNewMembers();
  }, []);

  // Lightweight derived bars for the Game Usage chart
  const gmBars: any[] = useMemo(() => {
    const bars: any[] = [];
    if (gmStats && typeof gmStats === "object") {
      for (const [gameKey, stats] of Object.entries(gmStats as any)) {
        const s = stats as any;
        bars.push({
          label: gameKey,
          value: s?.played || 0,
          won: s?.won || 0,
        });
      }
    }
    return bars;
  }, [gmStats]);

  // Refresh common admin data (help requests, admins, tournaments)
  async function refresh() {
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const [hrRes, adminsRes, tRes] = await Promise.all([
        apiFetch("/api/admin/help-requests", { headers }),
        apiFetch("/api/admins", { headers }),
        apiFetch("/api/tournaments", { headers }),
      ]);
      if (hrRes.ok) {
        const d = await hrRes.json();
        setHelpRequests(Array.isArray(d) ? d : d.requests || []);
      }
      if (adminsRes.ok) {
        const d = await adminsRes.json();
        setAdmins(Array.isArray(d) ? d : d.admins || []);
      }
      if (tRes.ok) {
        const d = await tRes.json();
        setTournaments(Array.isArray(d) ? d : d.tournaments || d);
      }
    } catch (e) {
      console.error("refresh failed", e);
    }
  }

  async function fetchNewMembers() {
    setMembersLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch("/api/admin/members?limit=50", { headers });
      if (res.ok) {
        const d = await res.json();
        setNewMembers(Array.isArray(d.members) ? d.members : []);
      }
    } catch (e) {
      console.error("fetchNewMembers failed", e);
    } finally {
      setMembersLoading(false);
    }
  }

  async function revoke(target: string) {
    try {
      await apiFetch("/api/admins/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ email: target }),
      });
      await refresh();
    } catch {}
  }

  async function grantPremium(email: string, days: number) {
    if (!email) return;
    try {
      await apiFetch("/api/admin/premium/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ email, days }),
      });
      await refresh();
    } catch {}
  }

  async function revokePremium(email: string) {
    try {
      await apiFetch("/api/admin/premium/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ email }),
      });
      await refresh();
    } catch {}
  }

  async function sendAnnouncement() {
    if (!announcement.trim()) return;
    try {
      await apiFetch("/api/admin/announce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ message: announcement }),
      });
      setAnnouncement("");
      await refresh();
    } catch {}
  }

  async function toggleMaintenance(next: boolean) {
    try {
      await apiFetch("/api/admin/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ maintenance: next }),
      });
      await refresh();
    } catch {}
  }

  // Listen for help-typing and help-request events over WS to show live typing indicators and new requests
  useEffect(() => {
    if (!ws) return;
    const unsub = ws.addListener((data: any) => {
      try {
        if (data?.type === "help-typing") {
          const rid = String(data.requestId || "");
          if (!rid) return;
          setHelpTyping((prev) => ({
            ...prev,
            [rid]: { who: data.fromName || "someone", ts: Date.now() },
          }));
          return;
        }
        if (data?.type === "help-request") {
          const req = data.request;
          if (!req || !req.id) return;
          setHelpRequests((prev) => {
            const filtered = (prev || []).filter(
              (r: any) => String(r.id) !== String(req.id),
            );
            return [req, ...filtered];
          });
          return;
        }
        if (data?.type === "help-request-updated") {
          refresh();
        }
      } catch {}
    });
    const iv = setInterval(() => {
      const now = Date.now();
      setHelpTyping((prev) => {
        let changed = false;
        const copy = { ...prev };
        for (const k of Object.keys(copy)) {
          if (now - copy[k].ts > 3500) {
            delete copy[k];
            changed = true;
          }
        }
        return changed ? copy : prev;
      });
    }, 1500);
    return () => {
      try {
        unsub();
      } catch {}
      clearInterval(iv);
    };
  }, [ws]);

  async function claimHelp(id: string) {
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch(
        `/api/admin/help-requests/${encodeURIComponent(id)}/claim`,
        { method: "POST", headers, body: JSON.stringify({}) },
      );
      if (res.ok) {
        await refresh();
      }
    } catch {}
  }

  async function resolveHelp(id: string) {
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch(
        `/api/admin/help-requests/${encodeURIComponent(id)}/resolve`,
        { method: "POST", headers, body: JSON.stringify({}) },
      );
      if (res.ok) {
        await refresh();
      }
    } catch {}
  }

  async function deleteHelp(id: string) {
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch(
        `/api/admin/help-requests/${encodeURIComponent(id)}/delete`,
        { method: "POST", headers, body: JSON.stringify({}) },
      );
      if (res.ok) {
        await refresh();
      }
    } catch {}
  }

  async function clearAllHelp() {
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch(`/api/admin/help-requests/clear`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await refresh();
      }
    } catch {}
  }

  async function grant() {
    if (!email) return;
    await apiFetch("/api/admins/grant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({ email }),
    });
    setEmail("");
  }

  async function searchUsers() {
    if (!userSearch.trim()) return;
    try {
      const authHeader = {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch(
        `/api/admin/users/search?q=${encodeURIComponent(userSearch)}`,
        { headers: authHeader },
      );
      if (res.ok) {
        const data = await res.json();
        setUserResults(Array.isArray(data.users) ? data.users : []);
      }
    } catch (error) {
      console.error("Search failed:", error);
    }
  }

  async function banUser(email: string) {
    try {
      await apiFetch("/api/admin/users/ban", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ email }),
      });
      await searchUsers(); // Refresh results
    } catch (error) {
      console.error("Ban failed:", error);
    }
  }

  async function unbanUser(email: string) {
    try {
      await apiFetch("/api/admin/users/unban", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ email }),
      });
      await searchUsers(); // Refresh results
    } catch (error) {
      console.error("Unban failed:", error);
    }
  }

  // flipPremium removed: not used in current UI

  async function createOfficialTournament() {
    setLoading(true);
    try {
      const start = new Date(createForm.startAt).getTime();
      const res = await apiFetch("/api/tournaments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title,
          game: createForm.game,
          mode: createForm.mode,
          value: Number(createForm.value),
          description: createForm.description,
          startAt: start,
          checkinMinutes: Number(createForm.checkinMinutes),
          capacity: Number(createForm.capacity),
          requireCalibration: !!createForm.requireCalibration,
          creatorEmail: user?.email,
          creatorName: user?.username,
          requesterEmail: user?.email,
          official: true,
          prizeType: "premium",
          prizeAmount: Number(createForm.prizeAmount || 0),
          prizeNotes: createForm.prizeNotes,
        }),
      });
      // refresh admin view and broadcast will update lobby for connected clients
      await refresh();
      try {
        // If creation returned the tournament id, navigate the app to the tournaments tab so lobby is visible
        const data = await res.json();
        if (data && data.tournament && data.tournament.id) {
          window.dispatchEvent(
            new CustomEvent("ndn:change-tab", {
              detail: { tab: "tournaments" },
            }),
          );
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  async function setWinner(tid: string, winnerEmail: string) {
    setLoading(true);
    try {
      await apiFetch("/api/admin/tournaments/winner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ tournamentId: tid, winnerEmail }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function deleteTournament(tid: string) {
    setLoading(true);
    try {
      await apiFetch("/api/admin/tournaments/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({
          tournamentId: tid,
          requesterEmail: user?.email,
        }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function reseedWeekly() {
    setLoading(true);
    try {
      await apiFetch("/api/admin/tournaments/reseed-weekly", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({}),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function deleteMatch(id: string) {
    setLoading(true);
    try {
      await apiFetch("/api/admin/matches/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ matchId: id }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs() {
    try {
      const authHeader = {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch("/api/admin/logs", { headers: authHeader });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok) setLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  }

  async function fetchSystemHealth() {
    try {
      const authHeader = {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch("/api/admin/system-health", {
        headers: authHeader,
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.health) {
          // If the browser loaded the page over https, HTTPS is working
          // regardless of what the server reports (reverse proxy may strip
          // the x-forwarded-proto header).
          const clientHttps =
            typeof window !== "undefined" &&
            window.location.protocol === "https:";
          setSystemHealth({
            database: data.health.database || false,
            websocket: data.health.websocket || false,
            https: data.health.https || clientHttps,
            maintenance: data.health.maintenance || false,
            clustering: data.health.clustering || false,
            uptime: data.health.uptime || 0,
            memory: data.health.memory || { heapUsed: 0 },
            version: data.health.version || "unknown",
          });
          setClusteringEnabled(data.health?.clustering || false);
        }
      }
    } catch (error) {
      console.error("Failed to fetch system health:", error);
    }
  }

  async function toggleClustering(enable: boolean) {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/clustering", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({
          enabled: enable,
          capacity: clusterCapacity,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error || `Server returned ${res.status}`;
        console.error("Clustering toggle server error:", res.status, errData);
        alert(`Clustering toggle failed: ${msg}`);
        return;
      }
      const data = await res.json().catch(() => null);
      console.log("Clustering response:", data);
      if (data?.ok) {
        setClusteringEnabled(!!data.enabled);
        alert(
          `Clustering ${data.enabled ? "enabled" : "disabled"} successfully. Max capacity: ${(data.capacity || clusterCapacity).toLocaleString()} concurrent users.`,
        );
        fetchSystemHealth().catch(() => {});
      } else {
        alert(
          `Failed: ${data?.error || data?.message || "Unknown error — server may be restarting"}`,
        );
      }
    } catch (error) {
      console.error("Clustering toggle failed:", error);
      alert(
        "Clustering toggle failed — server may be waking up. Try again in a few seconds.\n" +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateClusterCapacity(newCapacity: number) {
    setClusterCapacity(newCapacity);
    // Capacity is updated locally and sent when clustering toggle is used
  }

  // quick-fix helper removed: not used in current UI

  async function loadEmailCopy() {
    try {
      const authHeader = {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch("/api/admin/email-copy", {
        headers: authHeader,
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.ok) setEmailCopy(d.copy || emailCopy);
      }
    } catch {}
  }
  useEffect(() => {
    if (isOwner) loadEmailCopy();
  }, [isOwner]);

  useEffect(() => {
    if (isOwner && (activeTab === "general" || activeTab === "maintenance")) {
      fetchLogs();
      fetchSystemHealth();
    }
  }, [isOwner, activeTab]);

  async function saveEmailCopy(kind: string, payload: any) {
    await apiFetch("/api/admin/email-copy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({ kind, ...payload }),
    });
    await loadEmailCopy();
  }

  async function openInlinePreview(kind: string, openInNewTab?: boolean) {
    try {
      const authHeader = {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      };
      const res = await apiFetch(
        `/api/email/preview?kind=${encodeURIComponent(kind)}`,
        { headers: authHeader },
      );
      const html = await res.text();
      if (openInNewTab) {
        const w = window.open();
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
          return;
        }
      }
      setPreview({ open: true, kind, html });
    } catch {
      setPreview({
        open: true,
        kind,
        html: '<!doctype html><html><body style="font-family:sans-serif;padding:16px">Failed to load preview.</body></html>',
      });
    }
  }

  const handleEmailSave = useCallback(
    (kind: string, payload: any) => saveEmailCopy(kind, payload),
    [],
  );
  const handleEmailPreview = useCallback(
    (kind: string, openInNewTab?: boolean) =>
      openInlinePreview(kind, openInNewTab),
    [],
  );

  if (!isOwner) {
    return (
      <div className="card ndn-page">
        <h2 className="text-2xl font-bold mb-2 ndn-section-title">Admin 🛡️</h2>
        <div className="text-sm opacity-80">
          You don't have permission to manage admins.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto ndn-page">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight ndn-section-title">
            Admin 🛡️
          </h2>
          <p className="text-white/40 font-medium">
            System management and oversight
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {/* Keep the green connected badge; no HTTP/HTTPS pills here */}
          <CameraStatusBadge />
          {ws && (ws as any).reconnect && (
            <button
              onClick={() => (ws as any).reconnect()}
              className="ml-1 rounded-md bg-neutral-700/60 hover:bg-neutral-600/70 px-2.5 py-1 text-xs border border-white/10"
              title="Force close and recreate the WebSocket connection"
            >
              Recreate WS
            </button>
          )}
        </div>
      </div>
      {/* Top help-requests strip for quick admin actions */}
      {helpRequests.length > 0 && (
        <div className="p-2 rounded-xl bg-amber-900/10 border border-amber-500/20 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-semibold">Open Help Requests 🆘</span>
              <span className="text-sm opacity-80">
                {helpRequests.length} open
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn"
                onClick={() => setSelectedRequest(helpRequests[0])}
              >
                Open Latest
              </button>
              <button className="btn btn-ghost" onClick={() => refresh()}>
                Refresh
              </button>
              <button
                className="btn bg-red-600 hover:bg-red-700 text-white"
                onClick={() => clearAllHelp()}
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {helpRequests.slice(0, 6).map((hr: any) => (
              <div
                key={hr.id}
                className="p-2 rounded bg-black/10 border border-white/10 min-w-[220px]"
              >
                <div className="font-medium">{hr.username || "Anonymous"}</div>
                <div className="text-xs opacity-70">
                  {new Date(hr.ts || 0).toLocaleTimeString()}
                </div>
                <div className="text-sm truncate mt-1">{hr.message}</div>
                <div className="mt-2 flex gap-2">
                  {hr.status === "open" ? (
                    <button className="btn" onClick={() => claimHelp(hr.id)}>
                      Claim
                    </button>
                  ) : (
                    <span className="text-xs opacity-70">
                      {hr.status} by {hr.claimedBy || "—"}
                    </span>
                  )}
                  <button
                    className="btn"
                    onClick={() => setSelectedRequest(hr)}
                  >
                    Chat
                  </button>
                  <button
                    className="btn bg-red-600/80 hover:bg-red-700 text-white text-xs"
                    onClick={() => deleteHelp(hr.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {isOwner && (
        <div className="card">
          <h3 className="text-xl font-semibold mb-2">Site Sections</h3>
          <div className="text-sm opacity-80 mb-3">
            Hide sections across the site. Owner only.
          </div>
          <div className="grid gap-4">
            {Object.entries(groupedSections).map(([group, items]) => (
              <div
                key={group}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="font-semibold mb-2">{group}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={!hiddenSectionList.includes(item.key)}
                        onChange={() => toggleSection(item.key)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {isOwner && (
        <TabPills
          tabs={[
            { key: "general", label: "General" },
            { key: "maintenance", label: "Maintenance" },
            { key: "premium", label: "Premium" },
            { key: "tourneys", label: "Tourneys" },
            { key: "helpdesk", label: "Help Desk" },
          ]}
          active={activeTab}
          onChange={(key) =>
            setActiveTab(
              key as
                | "general"
                | "maintenance"
                | "premium"
                | "helpdesk"
                | "tourneys",
            )
          }
          className="mb-4"
        />
      )}{" "}
      {activeTab === "general" && (
        <>
          {isOwner && (
            <div className="card">
              <h3 className="text-xl font-semibold mb-2">Game Usage</h3>
              <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3">
                <BarChart
                  data={gmBars.map((d) => ({ label: "", value: d.value }))}
                />
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px] opacity-80">
                  {gmBars.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2 py-1 rounded-md bg-white/5 border border-white/10"
                    >
                      <span className="truncate mr-2">{d.label}</span>
                      <span className="whitespace-nowrap">
                        Played {d.value} · Won {d.won}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="text-2xl font-bold mb-2">Admin Control ⚙️</h2>
            <div className="text-sm opacity-80 mb-3">
              Grant or revoke Admin to trusted users. Only the owner can perform
              these actions.
            </div>
            <div className="flex gap-2 mb-3">
              <input
                className="input flex-1"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn" disabled={loading} onClick={grant}>
                Grant
              </button>
              <button
                className="btn bg-rose-600 hover:bg-rose-700"
                disabled={loading}
                onClick={() => revoke(email)}
              >
                Revoke
              </button>
            </div>
            <div className="text-sm opacity-80 mb-2">Current Admins:</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {admins.map((admin) => (
                <div
                  key={admin}
                  className="px-2 py-1 rounded bg-indigo-600/20 border border-indigo-500/40 text-sm"
                >
                  {admin}
                </div>
              ))}
            </div>

            <hr className="border-indigo-500/20 my-4" />

            <h3 className="text-lg font-semibold mb-2">
              Premium Access Control
            </h3>
            <div className="text-sm opacity-80 mb-3">
              Grant or revoke Premium subscription access to users (grants 30
              days).
            </div>
            <div className="flex gap-2 mb-3">
              <input
                className="input flex-1"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="btn bg-emerald-600 hover:bg-emerald-700"
                disabled={loading || !email.trim()}
                onClick={() => grantPremium(email, 30)}
              >
                Grant Premium
              </button>
              <button
                className="btn bg-rose-600 hover:bg-rose-700"
                disabled={loading}
                onClick={() => revokePremium(email)}
              >
                Revoke Premium
              </button>
            </div>
            <div className="text-sm opacity-80">
              Premium grants provide 30 days of unlimited access to all
              features.
            </div>
          </div>

          <div className="card">
            <h3 className="text-xl font-bold mb-4 text-white/90">
              Announcements 📢
            </h3>
            <div className="text-sm opacity-80 mb-2">
              Send a message to all users. This will appear as a toast
              notification.
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Announcement message..."
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
              />
              <button
                className="btn"
                disabled={loading || !announcement.trim()}
                onClick={sendAnnouncement}
              >
                Send
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-2">User Search</h3>
            <div className="text-sm opacity-80 mb-2">
              Search for users by email or name.
            </div>
            <div className="flex gap-2 mb-3">
              <input
                className="input flex-1"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <button className="btn" disabled={loading} onClick={searchUsers}>
                Search
              </button>
            </div>
            {userResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm opacity-80 mb-2">Results:</div>
                {userResults.map((u) => (
                  <div
                    key={u.email}
                    className="p-2 rounded bg-black/20 text-sm flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold">{u.name || "No name"}</div>
                      <div className="opacity-70">{u.email}</div>
                      <div className="opacity-60 text-xs">
                        Joined {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-semibold">New Members</h3>
              <button
                className="btn btn--ghost px-2 py-1 text-xs"
                disabled={membersLoading}
                onClick={fetchNewMembers}
              >
                {membersLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
            <div className="text-sm opacity-80 mb-3">
              Most recent sign-ups (newest first).
            </div>
            {newMembers.length === 0 && !membersLoading && (
              <div className="text-sm opacity-60">No members found.</div>
            )}
            {newMembers.length > 0 && (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {newMembers.map((m) => (
                  <div
                    key={m.email}
                    className="p-2 rounded bg-black/20 text-sm flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold">{m.username}</div>
                      <div className="opacity-70 text-xs">{m.email}</div>
                    </div>
                    <div className="text-xs opacity-60 text-right whitespace-nowrap">
                      {m.createdAt
                        ? new Date(m.createdAt).toLocaleString()
                        : "Unknown"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isOwner && (
            <div className="card">
              <h3 className="text-xl font-semibold mb-3">Email Templates</h3>
              <div className="text-sm opacity-80 mb-2">
                Customize titles, intro lines, and button text. Previews open in
                a new tab or as a popup.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <EmailEditor
                  kind="reset"
                  label="Password reset"
                  emailCopy={emailCopy}
                  onSave={handleEmailSave}
                  onPreview={handleEmailPreview}
                />
                <EmailEditor
                  kind="reminder"
                  label="Password reset reminder"
                  emailCopy={emailCopy}
                  onSave={handleEmailSave}
                  onPreview={handleEmailPreview}
                />
                <EmailEditor
                  kind="confirm-email"
                  label="Confirm new email"
                  emailCopy={emailCopy}
                  onSave={handleEmailSave}
                  onPreview={handleEmailPreview}
                />
                <EmailEditor
                  kind="changed"
                  label="Password changed notice"
                  emailCopy={emailCopy}
                  onSave={handleEmailSave}
                  onPreview={handleEmailPreview}
                />
              </div>
            </div>
          )}
        </>
      )}
      {activeTab === "maintenance" && isOwner && (
        <>
          <div className="card">
            <h3 className="text-xl font-semibold mb-2">User Management</h3>
            <div className="text-sm opacity-80 mb-2">
              Ban or unban users. Use with caution.
            </div>
            <div className="flex gap-2 mb-3">
              <input
                className="input flex-1"
                placeholder="user@example.com"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <button className="btn" disabled={loading} onClick={searchUsers}>
                Search
              </button>
            </div>
            {userResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm opacity-80 mb-2">Results:</div>
                {userResults.map((u) => (
                  <div
                    key={u.email}
                    className="p-2 rounded bg-black/20 text-sm flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold">{u.name || "No name"}</div>
                      <div className="opacity-70">{u.email}</div>
                      <div className="opacity-60 text-xs">
                        Joined {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn bg-red-600 hover:bg-red-700 text-xs"
                        onClick={() => banUser(u.email)}
                      >
                        Ban
                      </button>
                      <button
                        className="btn bg-green-600 hover:bg-green-700 text-xs"
                        onClick={() => unbanUser(u.email)}
                      >
                        Unban
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-3">System Health</h3>
            <div className="text-sm opacity-80 mb-3">
              Current status of system components and services.
            </div>
            {systemHealth ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Database</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${systemHealth.database ? "bg-emerald-600" : "bg-red-600"}`}
                    >
                      {systemHealth.database ? "Ready" : "Down"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>WebSocket</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${systemHealth.websocket ? "bg-emerald-600" : "bg-red-600"}`}
                    >
                      {systemHealth.websocket ? "Ready" : "Down"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>HTTPS</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${systemHealth.https ? "bg-emerald-600" : "bg-amber-600"}`}
                    >
                      {systemHealth.https ? "Enabled" : "HTTP Only"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Maintenance Mode</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${!systemHealth.maintenance ? "bg-emerald-600" : "bg-red-600"}`}
                    >
                      {!systemHealth.maintenance ? "Normal" : "Active"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Clustering (Auto-Scaling)</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${clusteringEnabled ? "bg-emerald-600" : "bg-amber-600"}`}
                    >
                      {clusteringEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-semibold">Uptime:</span>{" "}
                    {Math.floor(systemHealth.uptime / 3600)}h{" "}
                    {Math.floor((systemHealth.uptime % 3600) / 60)}m
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">Memory:</span>{" "}
                    {systemHealth.memory
                      ? Math.round(systemHealth.memory.heapUsed / 1024 / 1024)
                      : "?"}
                    MB used
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">Version:</span>{" "}
                    {systemHealth.version}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn" onClick={fetchSystemHealth}>
                      Refresh
                    </button>
                    <button
                      className={`btn ${clusteringEnabled ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                      disabled={loading}
                      onClick={() => toggleClustering(!clusteringEnabled)}
                    >
                      {clusteringEnabled ? "Disable" : "Enable"} Clustering
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-sm opacity-60 mb-2">
                  Loading system health...
                </div>
                <button className="btn" onClick={fetchSystemHealth}>
                  Load Health Status
                </button>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-white/10">
              <h4 className="font-semibold mb-3">Clustering Capacity</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-semibold">
                      Max Concurrent Users
                    </label>
                    <div className="flex gap-2">
                      <button
                        className="btn"
                        onClick={() => setShowCreate(false)}
                      >
                        Close
                      </button>
                      <button
                        className="btn"
                        onClick={broadcastTournaments}
                        disabled={!isOwner || loading}
                      >
                        Force broadcast
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="1500"
                    max="50000"
                    step="500"
                    value={clusterCapacity}
                    onChange={(e) =>
                      updateClusterCapacity(Number(e.target.value))
                    }
                    disabled={loading}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: clusteringEnabled
                        ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((clusterCapacity - 1500) / (50000 - 1500)) * 100}%, #374151 ${((clusterCapacity - 1500) / (50000 - 1500)) * 100}%, #374151 100%)`
                        : "#374151",
                    }}
                  />
                  <div className="flex justify-between text-xs opacity-60 mt-1">
                    <span>1.5k</span>
                    <span>50k</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    className={`btn ${clusteringEnabled ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                    disabled={loading}
                    onClick={() => toggleClustering(!clusteringEnabled)}
                  >
                    {clusteringEnabled ? "Disable" : "Enable"} Clustering
                  </button>
                </div>
              </div>
              <div className="text-xs opacity-70 mt-2 p-2 bg-white/5 rounded">
                💡 Clustering enables auto-scaling with capacity up to{" "}
                {clusterCapacity.toLocaleString()} concurrent users. Adjust the
                slider to set maximum capacity. NODE_WORKERS environment
                variable is set to handle the configured load behind a reverse
                proxy.
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-3">User Reports</h3>
            <ul className="space-y-2">
              {reports.map((r: any) => (
                <li key={r.id} className="p-2 rounded bg-black/20 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-xs">{r.id}</div>
                      <div>
                        <span className="font-semibold">{r.reporter}</span> →{" "}
                        <span className="font-semibold">{r.offender}</span> ·{" "}
                        {new Date(r.ts).toLocaleString()}
                      </div>
                      <div className="opacity-80">Reason: {r.reason}</div>
                      {r.messageId && (
                        <div className="opacity-60 text-xs">
                          Message ID: {r.messageId}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${r.status === "open" ? "bg-amber-600" : "bg-emerald-600"}`}
                      >
                        {r.status}
                      </span>
                      {r.status === "open" && (
                        <>
                          <button
                            className="btn bg-emerald-600 hover:bg-emerald-700"
                            disabled={loading}
                            onClick={async () => {
                              await apiFetch("/api/admin/reports/resolve", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${localStorage.getItem("authToken")}`,
                                },
                                body: JSON.stringify({
                                  id: r.id,
                                  action: "resolved",
                                }),
                              });
                              await refresh();
                            }}
                          >
                            Resolve
                          </button>
                          <button
                            className="btn bg-rose-600 hover:bg-rose-700"
                            disabled={loading}
                            onClick={async () => {
                              const notes =
                                prompt(
                                  "Enter notes for action taken (e.g., warning, block):",
                                ) || "";
                              await apiFetch("/api/admin/reports/resolve", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${localStorage.getItem("authToken")}`,
                                },
                                body: JSON.stringify({
                                  id: r.id,
                                  action: "actioned",
                                  notes,
                                }),
                              });
                              await refresh();
                            }}
                          >
                            Action
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {reports.length === 0 && (
                <li className="opacity-60">No reports.</li>
              )}
            </ul>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-3">Open Matches</h3>
            <ul className="space-y-1">
              {(status?.matches || []).map((m: any) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between p-2 rounded bg-black/20 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs">{m.id}</span>
                    <span className="opacity-80">{m.creatorName}</span>
                    <span className="opacity-60">
                      {m.game} · {labelForMode(m.mode)} {m.value}{" "}
                      {m.game === "X01" ? `/${m.startingScore}` : ""}
                    </span>
                  </div>
                  <button
                    className="btn bg-rose-600 hover:bg-rose-700"
                    disabled={loading}
                    onClick={() => deleteMatch(m.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {(!status?.matches || status.matches.length === 0) && (
                <li className="text-sm opacity-60">No open matches.</li>
              )}
            </ul>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-3">Dangerous Operations</h3>
            <div className="text-sm opacity-80 mb-3 text-red-400">
              ⚠️ These operations can cause data loss or service disruption. Use
              with extreme caution.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="font-semibold mb-2 text-red-400">
                  Tournament Deletion
                </div>
                <ul className="space-y-2">
                  {tournaments.map((t: any) => (
                    <li
                      key={t.id}
                      className="p-2 rounded bg-red-900/20 border border-red-500/40 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{t.title}</div>
                        <div className="opacity-70">{t.status}</div>
                      </div>
                      <div className="opacity-80">
                        {t.game} · {labelForMode(t.mode)} {t.value}
                      </div>
                      <div className="mt-2">
                        <button
                          className="btn bg-red-600 hover:bg-red-700 text-xs"
                          disabled={loading}
                          onClick={() => deleteTournament(t.id)}
                        >
                          Delete Tournament
                        </button>
                      </div>
                    </li>
                  ))}
                  {tournaments.length === 0 && (
                    <li className="opacity-60">No tournaments.</li>
                  )}
                </ul>
              </div>
              <div>
                <div className="font-semibold mb-2 text-red-400">
                  System Maintenance
                </div>
                <div className="space-y-2">
                  <div className="p-3 rounded bg-red-900/20 border border-red-500/40">
                    <div className="font-semibold text-red-400 mb-2">
                      Maintenance Mode
                    </div>
                    <div className="text-sm opacity-80 mb-3">
                      Put the entire site into maintenance mode. Users won't be
                      able to access games or create matches.
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${status?.maintenance ? "bg-red-600" : "bg-green-600"}`}
                      >
                        {status?.maintenance
                          ? "MAINTENANCE ACTIVE"
                          : "NORMAL OPERATION"}
                      </span>
                      <button
                        className={`btn ${status?.maintenance ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                        disabled={loading}
                        onClick={() => toggleMaintenance(!status?.maintenance)}
                      >
                        {status?.maintenance ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {selectedRequest && (
            <HelpdeskChat
              request={selectedRequest}
              user={{
                email: user?.email,
                username: user?.username,
                isAdmin: true,
              }}
              onClose={() => setSelectedRequest(null)}
            />
          )}
        </>
      )}
      {activeTab === "premium" && isOwner && (
        <>
          <div className="card">
            <h3 className="text-xl font-semibold mb-2">
              Premium Subscription Grants
            </h3>
            <div className="text-sm opacity-80 mb-3">
              Grant or revoke premium subscriptions for users (grants 30 days).
            </div>
            <div className="flex gap-2 mb-3">
              <input
                className="input flex-1"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="btn"
                disabled={loading || !email.trim()}
                onClick={() => grantPremium(email, 30)}
              >
                Grant
              </button>
              <button
                className="btn bg-rose-600 hover:bg-rose-700"
                disabled={loading}
                onClick={() => revokePremium(email)}
              >
                Revoke
              </button>
            </div>
            <div className="text-sm opacity-80 mb-2">
              Premium users get 30 days of access to all features.
            </div>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-2">Premium Winners</h3>
            <div className="text-sm opacity-80 mb-2">
              Users who have won premium through tournaments.
            </div>
            <div className="space-y-2">
              {winners.map((w: any) => (
                <div
                  key={w.email}
                  className="p-2 rounded bg-black/20 text-sm flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">{w.name || "No name"}</div>
                    <div className="opacity-70">{w.email}</div>
                    <div className="opacity-60 text-xs">
                      Expires {new Date(w.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!w.expired ? (
                      <span className="px-2 py-1 rounded bg-emerald-600 text-xs">
                        Premium Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-amber-600 text-xs">
                        Premium Expired
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {winners.length === 0 && (
                <div className="opacity-60">No premium winners.</div>
              )}
            </div>
          </div>
        </>
      )}
      {activeTab === "tourneys" && isOwner && (
        <>
          <div className="card">
            <h3 className="text-xl font-semibold mb-3">
              Create Official Tournament
            </h3>
            <div className="text-sm opacity-80 mb-3">
              Set up a new official tournament with custom rules, timing, and
              prizes.
            </div>
            <div className="space-y-2">
              <input
                className="input w-full"
                placeholder="Tournament Title"
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm((f: any) => ({ ...f, title: e.target.value }))
                }
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  className="input"
                  value={createForm.game}
                  onChange={(e) =>
                    setCreateForm((f: any) => ({ ...f, game: e.target.value }))
                  }
                >
                  {[
                    "X01",
                    "Around the Clock",
                    "Cricket",
                    "Halve It",
                    "Shanghai",
                    "High-Low",
                  ].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={createForm.mode}
                  onChange={(e) =>
                    setCreateForm((f: any) => ({ ...f, mode: e.target.value }))
                  }
                >
                  {getModeOptionsForGame(createForm.game).map((opt) => (
                    <option key={String(opt)} value={String(opt)}>
                      {labelForMode(String(opt))}
                    </option>
                  ))}
                </select>
                {(() => {
                  const vals = getModeValueOptionsForGame(
                    createForm.game,
                    createForm.mode,
                  );
                  if (vals && vals.length > 0) {
                    return (
                      <select
                        className="input"
                        value={String(createForm.value)}
                        onChange={(e) =>
                          setCreateForm((f: any) => ({
                            ...f,
                            value: Number(e.target.value),
                          }))
                        }
                      >
                        {vals.map((v) => (
                          <option key={v} value={String(v)}>
                            {v}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={createForm.value}
                      onChange={(e) =>
                        setCreateForm((f: any) => ({
                          ...f,
                          value: Number(e.target.value),
                        }))
                      }
                    />
                  );
                })()}
              </div>
              <textarea
                className="input w-full"
                rows={2}
                placeholder="Description"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((f: any) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  type="datetime-local"
                  value={createForm.startAt}
                  onChange={(e) =>
                    setCreateForm((f: any) => ({
                      ...f,
                      startAt: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="Checkin minutes"
                  value={createForm.checkinMinutes}
                  onChange={(e) =>
                    setCreateForm((f: any) => ({
                      ...f,
                      checkinMinutes: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <input
                className="input w-full"
                type="number"
                min={6}
                max={64}
                placeholder="Capacity"
                value={createForm.capacity}
                onChange={(e) =>
                  setCreateForm((f: any) => ({
                    ...f,
                    capacity: Number(e.target.value),
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-2 items-center">
                <select className="input" value="premium" disabled>
                  <option value="premium">PREMIUM</option>
                </select>
                <select
                  className="input"
                  value={createForm.prizeAmount}
                  onChange={(e) =>
                    setCreateForm((f: any) => ({
                      ...f,
                      prizeType: "premium",
                      prizeAmount: Number(e.target.value),
                    }))
                  }
                >
                  <option value={1}>1 month</option>
                  <option value={3}>3 months</option>
                </select>
              </div>
              <input
                className="input w-full"
                placeholder="Prize notes (optional)"
                value={createForm.prizeNotes}
                onChange={(e) =>
                  setCreateForm((f: any) => ({
                    ...f,
                    prizeNotes: e.target.value,
                  }))
                }
              />
              <div className="flex justify-end">
                <button
                  className="btn bg-emerald-600 hover:bg-emerald-700"
                  disabled={loading}
                  onClick={createOfficialTournament}
                >
                  Create Tournament
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-3">
              Tournament Premium Winners
            </h3>
            <div className="text-sm opacity-80 mb-3">
              Users who have won premium prizes in tournaments. Grant them
              access here.
            </div>
            <div className="space-y-2">
              {tournaments
                .filter(
                  (t: any) =>
                    t.status === "completed" &&
                    t.winnerEmail &&
                    t.prizeType === "premium",
                )
                .map((t: any) => {
                  const winner = winners.find(
                    (w: any) => w.email === t.winnerEmail,
                  );
                  const hasAccess = winner && !winner.expired;
                  return (
                    <div key={t.id} className="p-3 rounded bg-black/20 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">{t.title}</div>
                        <div className="text-xs opacity-70">
                          {new Date(t.startAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{t.winnerEmail}</div>
                          <div className="text-xs opacity-70">
                            Prize: {t.prizeAmount} month
                            {t.prizeAmount > 1 ? "s" : ""} PREMIUM
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasAccess ? (
                            <span className="px-2 py-1 rounded bg-emerald-600 text-xs">
                              ✓ Access Granted
                            </span>
                          ) : (
                            <button
                              className="btn bg-emerald-600 hover:bg-emerald-700 text-xs"
                              disabled={loading}
                              onClick={() =>
                                grantPremium(t.winnerEmail, t.prizeAmount * 30)
                              }
                            >
                              Grant Access
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              {tournaments.filter(
                (t: any) =>
                  t.status === "completed" &&
                  t.winnerEmail &&
                  t.prizeType === "premium",
              ).length === 0 && (
                <div className="text-center py-4 text-sm opacity-60">
                  No completed premium tournaments.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="text-xl font-semibold mb-3">Manage Tournaments</h3>
            <div className="text-sm opacity-80 mb-3">
              View and manage all tournaments. Set winners and manage brackets.
            </div>
            <ul className="space-y-2">
              {tournaments.map((t: any) => (
                <li key={t.id} className="p-3 rounded bg-black/20 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold">{t.title}</div>
                      <div className="opacity-80">
                        {t.game} · {labelForMode(t.mode)} {t.value}
                      </div>
                    </div>
                    <div
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        t.status === "scheduled"
                          ? "bg-blue-600"
                          : t.status === "running"
                            ? "bg-green-600"
                            : t.status === "completed"
                              ? "bg-purple-600"
                              : "bg-gray-600"
                      }`}
                    >
                      {t.status}
                    </div>
                  </div>
                  <div className="text-xs opacity-70 mb-2">
                    Start: {new Date(t.startAt).toLocaleString()} · Capacity:{" "}
                    {t.capacity}
                  </div>
                  {t.prize && (
                    <div className="text-xs mb-2">
                      Prize: {t.prizeAmount || 3} month
                      {(t.prizeAmount || 3) > 1 ? "s" : ""} PREMIUM
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="btn text-xs"
                      disabled={loading || t.status !== "scheduled"}
                      onClick={() =>
                        setWinner(t.id, prompt("Winner email?") || "")
                      }
                    >
                      Set Winner
                    </button>
                    <button
                      className="btn text-xs"
                      disabled={loading}
                      onClick={() => reseedWeekly()}
                    >
                      Reseed
                    </button>
                  </div>
                </li>
              ))}
              {tournaments.length === 0 && (
                <li className="opacity-60">No tournaments.</li>
              )}
            </ul>
          </div>
        </>
      )}
      {activeTab === "helpdesk" && isOwner && (
        <>
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">Helpdesk Requests</h3>
            <div className="text-sm opacity-80 mb-3">
              All help requests from users who asked to speak with an admin.
              Status is shown for each request.
            </div>
            {helpRequests.length === 0 ? (
              <div className="text-sm opacity-70">No help requests.</div>
            ) : (
              <div className="space-y-2">
                {helpRequests.map((hr) => (
                  <div
                    key={hr.id}
                    className="p-2 rounded bg-black/10 border border-white/10 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">
                        {hr.username || "Anonymous"}
                      </div>
                      <div className="text-xs opacity-70">
                        {new Date(hr.ts || 0).toLocaleString()}
                      </div>
                      <div className="text-sm mt-1">{hr.message}</div>
                      <div className="mt-1">
                        <span
                          className={`text-xs px-2 py-1 rounded-full mr-2 ${hr.status === "open" ? "bg-emerald-700/30 text-emerald-200" : hr.status === "claimed" ? "bg-amber-700/30 text-amber-200" : "bg-slate-700/30 text-slate-200"}`}
                        >
                          {hr.status || "unknown"}
                        </span>
                        {hr.claimedBy && (
                          <span className="text-xs opacity-70">
                            by {hr.claimedBy}
                          </span>
                        )}
                      </div>
                      {helpTyping[hr.id] && (
                        <div className="text-xs text-amber-300 mt-1">
                          {helpTyping[hr.id].who} typing...
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {hr.status === "open" && (
                        <button
                          className="btn"
                          onClick={() => claimHelp(hr.id)}
                        >
                          Claim
                        </button>
                      )}
                      {hr.status !== "resolved" && (
                        <button
                          className="btn btn-ghost"
                          onClick={() => resolveHelp(hr.id)}
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        className="btn"
                        onClick={() => setSelectedRequest(hr)}
                      >
                        Chat
                      </button>
                      <button
                        className="btn bg-red-600/80 hover:bg-red-700 text-white text-xs"
                        onClick={() => deleteHelp(hr.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {/* Inline email preview overlay */}
      {preview.open && (
        <div
          className="fixed inset-0 z-[1000]"
          onClick={() => setPreview({ open: false })}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="absolute inset-0 p-4 md:p-8 overflow-auto flex items-start md:items-center justify-center">
            <div
              className="w-full max-w-3xl bg-[#0b1020] rounded-2xl border border-indigo-500/40 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-500/20">
                <div className="font-semibold">Preview: {preview.kind}</div>
                <button
                  className="btn"
                  onClick={() => setPreview({ open: false })}
                >
                  Close
                </button>
              </div>
              <div className="p-0 bg-black/30">
                <iframe
                  title="Email Preview"
                  style={{
                    width: "100%",
                    height: "70vh",
                    border: "0",
                    background: "transparent",
                  }}
                  srcDoc={preview.html || ""}
                />
              </div>
              <div className="px-4 py-3 border-t border-indigo-500/20 text-xs opacity-70">
                Click outside this panel or press Esc to close.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
