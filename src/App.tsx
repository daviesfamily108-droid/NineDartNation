import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { Sidebar, TabKey, buildTabList } from "./components/Sidebar.js";
import lazyWithRetry from "./utils/lazyWithRetry.js";
const Home = lazyWithRetry(() => import("./components/Home.js"));
import ScrollFade from "./components/ScrollFade.js";
// Lazy-load CameraView to avoid importing a large camera module at app
// bootstrap time. This prevents the component module from executing during
// initial module evaluation which can avoid TDZ issues when other modules
// import shared stores during startup.
const CameraView = lazyWithRetry(() => import("./components/CameraView.js"));
const OfflinePlay = lazyWithRetry(() => import("./components/OfflinePlay.js"));
const Friends = lazyWithRetry(() => import("./components/Friends.js"));
import Toaster from "./components/Toaster.js";
import AdminDashboard from "./components/AdminDashboard.js";
import SettingsPanel from "./components/SettingsPanel.js";
import Auth from "./components/Auth.js";
import { ThemeProvider } from "./components/ThemeContext.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Handshake,
  Menu,
  MessageCircle,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useWS } from "./components/WSProvider.js";
import {
  getMonthlyAvg3,
  getAllTimeAvg,
  syncStatsFromServer,
} from "./store/profileStats.js";
import { useMatch } from "./store/match.js";
import { useUserSettings } from "./store/userSettings.js";
import { useIsAdmin } from "./utils/admin.js";
import { apiFetch, getApiBaseUrl } from "./utils/api.js";
import "./styles/premium.css";
import "./styles/themes.css";
const OnlinePlay = lazyWithRetry(() => import("./components/OnlinePlay.clean"));
const StatsPanel = lazyWithRetry(() => import("./components/StatsPanel.js"));
const Tournaments = lazyWithRetry(() => import("./components/Tournaments.js"));
const AdminAccess = lazyWithRetry(() => import("./components/AdminAccess.js"));
const CameraSetup = lazyWithRetry(() => import("./components/CameraSetup.js"));
// AdminAccess already imported above
const OpsDashboard = lazyWithRetry(
  () => import("./components/OpsDashboard.js"),
);
import HelpAssistant from "./components/HelpAssistant.js";
import GlobalCameraLogger from "./components/GlobalCameraLogger.js";
import GlobalPhoneVideoSink from "./components/GlobalPhoneVideoSink.js";
import GlobalCameraWatchdog from "./components/GlobalCameraWatchdog.js";
import GlobalCameraRecoveryToasts from "./components/GlobalCameraRecoveryToasts.js";
import InstallPicker from "./components/InstallPicker.js";
import AddToHomeButton from "./components/AddToHomeButton.js";
import Footer from "./components/Footer.js";
import AutoPauseManager from "./components/AutoPauseManager.js";
import MatchPage from "./components/MatchPage.js";
import { useToast } from "./store/toast.js";
import { NDN_OPEN_NOTIFICATIONS_EVENT } from "./utils/events.js";
import WSConnectionDot from "./components/WSConnectionDot.js";
import AnnouncementPopup from "./components/AnnouncementPopup.js";
import { useBreakpoint } from "./hooks/useBreakpoint.js";

export default function App() {
  const appRef = useRef<HTMLDivElement | null>(null);
  const [avatar, setAvatar] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cardPaddingBottom = useUserSettings((s) => s.cardPaddingBottom);
  const statsCardMinHeight = useUserSettings((s) => s.statsCardMinHeight);
  const ws = (() => {
    try {
      return useWS();
    } catch {
      return null;
    }
  })();
  const [tab, setTab] = useState<TabKey>("score");
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";
  const isTablet = breakpoint === "tablet";
  const [navOpen, setNavOpen] = useState(false);

  // Apply UI layout CSS variables when settings change
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--ndn-card-padding-bottom",
      `${cardPaddingBottom ?? 80}px`,
    );
    root.style.setProperty(
      "--ndn-stats-card-height",
      `${statsCardMinHeight ?? 220}px`,
    );
  }, [cardPaddingBottom, statsCardMinHeight]);

  // Close mobile drawer on Escape and when switching away from mobile
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!isMobile) setNavOpen(false);
  }, [isMobile]);
  const [user, setUser] = useState<any>(null);
  // Use this helper to set user without losing previously fetched subscription data
  // This avoids toggles/flicker in the UI during partial user refreshes
  function setUserWithMerge(next: any) {
    if (!next) {
      setUser(next);
      return;
    }
    setUser((prev: any) => {
      const merged = { ...prev, ...next };
      if (prev?.subscription && !next?.subscription)
        merged.subscription = prev.subscription;
      if (next?.subscription) merged.subscription = next.subscription;
      // Keep fullAccess aligned with subscription unless explicitly provided
      merged.fullAccess = !!(
        merged.subscription?.fullAccess ||
        next?.fullAccess ||
        merged.fullAccess
      );
      return merged;
    });
  }
  const MINIMAL_UI =
    ((import.meta as any).env?.VITE_MINIMAL_AFTER_LOGIN || "").toString() ===
    "1";
  const [minimalUI, setMinimalUI] = useState<boolean>(false);
  const [allTimeAvg, setAllTimeAvg] = useState<number>(0);
  const [avgDelta, setAvgDelta] = useState<number>(0);
  const { avgMode, hiddenSections } = useUserSettings();
  const hiddenSet = useMemo(
    () => new Set(hiddenSections || []),
    [hiddenSections],
  );
  const isAdmin = useIsAdmin(user?.email);
  const _cameraEnabled = useUserSettings((s) => s.cameraEnabled);
  const matchInProgress = useMatch((s) => s.inProgress);
  const isCompact = matchInProgress && tab !== "score";
  const toast = useToast();
  const normalizedDelta = Math.abs(avgDelta) >= 0.05 ? avgDelta : 0;
  const API_URL = getApiBaseUrl();
  const userSettings = useUserSettings();
  const availableTabs = useMemo(() => {
    const userForTabs = user;
    const tabs = buildTabList(userForTabs, isAdmin);
    return tabs.map((t) => t.key).filter((key) => !hiddenSet.has(`tab:${key}`));
  }, [user, isAdmin, hiddenSet]);

  useEffect(() => {
    if (!availableTabs.length) return;
    if (hiddenSet.has(`tab:${tab}`)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, hiddenSet, tab]);

  // ── Global WS listener for match invites / prestart ──────────────
  // The OnlinePlay component only mounts when the "online" tab is active.
  // If the creator is on a different tab and someone joins, we need to:
  //   1. Switch to the online tab so OnlinePlay mounts
  //   2. Stash the message on window so OnlinePlay can grab it on mount
  //   3. Also dispatch a delayed DOM event as a backup
  //   4. Show a toast notification so the user sees it immediately
  const [wsMatchInviteCount, setWsMatchInviteCount] = useState(0);
  useEffect(() => {
    if (!ws) return;
    const unsub = ws.addListener((msg: any) => {
      try {
        if (
          msg?.type === "invite" ||
          msg?.type === "match-prestart" ||
          msg?.type === "invite-expired" ||
          msg?.type === "invite-waiting" ||
          msg?.type === "declined" ||
          msg?.type === "match-start"
        ) {
          // Show a toast notification for invites so the creator notices
          if (msg?.type === "invite") {
            const fromName = msg.fromName || "Someone";
            setWsMatchInviteCount((c) => c + 1);
            toast(`🎯 ${fromName} wants to join your match!`, {
              type: "info",
              timeout: 8000,
              actionLabel: "View",
              onAction: () => setTab("online"),
            });
          }
          if (msg?.type === "match-prestart") {
            // Only show the toast if no match is already in progress
            // (prevents phantom popup after quitting a match)
            if (!useMatch.getState().inProgress) {
              toast("⚡ Match starting — get ready!", {
                type: "info",
                timeout: 5000,
              });
            }
          }
          if (msg?.type === "declined") {
            setWsMatchInviteCount((c) => Math.max(0, c - 1));
          }
          if (msg?.type === "match-start") {
            setWsMatchInviteCount(0);
          }
          // Only stash + forward if OnlinePlay is NOT already mounted.
          // When OnlinePlay is mounted, its own WS listener processes
          // messages directly — forwarding would cause duplicate popups.
          const onlineMounted = !!(window as any).__ndn_online_mounted;
          if (!onlineMounted) {
            // Stash message so OnlinePlay can read it immediately on mount
            (window as any).__ndn_pending_invite = msg;
            // Switch to online tab so the OnlinePlay component mounts
            setTab("online");
            // Dispatch the event once after a short delay so React has
            // time to mount OnlinePlay and register its event listener
            setTimeout(() => {
              try {
                window.dispatchEvent(
                  new CustomEvent("ndn:match-invite", { detail: msg }),
                );
              } catch {}
            }, 200);
          } else {
            // OnlinePlay is mounted — just make sure we're on its tab
            setTab("online");
          }
        }
      } catch {}
    });
    return unsub;
  }, [ws, toast]);

  // Globally catch unhandled promise rejections and surface as warnings so the
  // devtools console is less noisy. We still log the reason so developers can
  // inspect real issues, but avoid uncaught exceptions flooding the console.
  useEffect(() => {
    const onUnhandled = (ev: PromiseRejectionEvent) => {
      try {
        // Some rejections are expected (e.g., media play AbortError during
        // transient UI swaps). Log as a warn and prevent default reporting.
        // Keep the logged payload small to avoid huge dumps.
        // @ts-ignore - ev.reason exists on modern browsers
        console.warn("Unhandled promise rejection (suppressed):", ev.reason);
        ev.preventDefault?.();
      } catch (err) {
        console.error("Failed to refresh friend notifications:", err);
        return false;
      }
    };
    window.addEventListener("unhandledrejection", onUnhandled as any);
    return () =>
      window.removeEventListener("unhandledrejection", onUnhandled as any);
  }, []);

  // Restore user from token on mount (run once only)
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    // Validate token with server
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          setUserWithMerge(data.user);
          // Cache identity for WSProvider immediate presence on reconnect
          try {
            const email = (data.user.email || "").toLowerCase();
            const uname = data.user.username || email;
            localStorage.setItem(
              "ndn:ws-identity",
              JSON.stringify({ username: uname, email }),
            );
          } catch {}
          try {
            const cached = localStorage.getItem(
              `ndn:subscription:${data.user.email}`,
            );
            if (cached)
              setUserWithMerge({
                ...data.user,
                subscription: JSON.parse(cached),
              });
          } catch (e) {}
          fetchSubscription(data.user);
        } else {
          // Token invalid, remove it
          localStorage.removeItem("authToken");
        }
      })
      .catch(() => {
        // Network error, keep token for offline retry
      });
  }, []);

  // Handle minimal UI delay when user is present
  useEffect(() => {
    if (user && MINIMAL_UI) {
      setMinimalUI(true);
      const timer = setTimeout(() => setMinimalUI(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [MINIMAL_UI, user]);

  // If URL contains ?match=1 render a minimal match-only page (allows opening dedicated match windows)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("match") === "1") {
      return (
        <ThemeProvider>
          <AutoPauseManager />
          <MatchPage />
        </ThemeProvider>
      );
    }
  } catch {}

  useEffect(() => {
    const onLogout = () => {
      try {
        localStorage.removeItem("mockUser");
        localStorage.removeItem("authToken");
        if (user?.email)
          localStorage.removeItem(`ndn:subscription:${user.email}`);
      } catch (e) {}
      setUser(null);
      setTab("score");
    };
    window.addEventListener("ndn:logout" as any, onLogout as any);
    return () =>
      window.removeEventListener("ndn:logout" as any, onLogout as any);
  }, []);
  // Refresh all-time avg when user changes or stats update
  useEffect(() => {
    if (!user?.username) {
      setAvgDelta(0);
      return;
    }
    try {
      // Persist the active username so lower-level modules (e.g., stats/store) can
      // resolve aliases like "You" back to the signed-in user when persisting stats.
      localStorage.setItem("ndn:currentUser", user.username);
      (window as any).ndnCurrentUser = user.username;
    } catch {}
    try {
      syncStatsFromServer(user.username);
    } catch {}
    // Delayed retry: if the server is cold-starting the first sync may fail.
    // Retry after 5 seconds so stats still appear without a manual reload.
    const retryTimer = setTimeout(() => {
      try {
        syncStatsFromServer(user.username);
      } catch {}
    }, 5000);
    const refresh = () => {
      const nextAvg =
        avgMode === "24h"
          ? getMonthlyAvg3(user.username)
          : getAllTimeAvg(user.username);
      setAllTimeAvg(nextAvg);
      const key = `ndn:allTimeAvgSnapshot:${user.username}`;
      const now = Date.now();

      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          localStorage.setItem(
            key,
            JSON.stringify({
              value: nextAvg,
              ts: now,
            }),
          );
          setAvgDelta(0);
          return;
        }
        const parsed = JSON.parse(raw);
        const baseline = Number(parsed?.value) || 0;

        // Always calculate delta from the original baseline (no monthly reset)
        const delta = nextAvg - baseline;
        setAvgDelta(Number.isFinite(delta) ? delta : 0);
      } catch {
        setAvgDelta(0);
      }
    };
    refresh();
    const onUpdate = () => refresh();
    const onStorage = (e: StorageEvent) => {
      const key = e.key || "";
      if (!key) return;
      // React to stats writes from other tabs/windows (e.g., match popouts)
      const prefixes = [
        `ndn_stats_${user.username}`,
        `ndn_stats_ts_${user.username}`,
        `ndn_stats_daily_${user.username}`,
        `ndn:allTimeAvgSnapshot:${user.username}`,
      ];
      if (prefixes.some((p) => key.startsWith(p))) refresh();
    };
    window.addEventListener("ndn:stats-updated", onUpdate as any);
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener("ndn:stats-updated", onUpdate as any);
      window.removeEventListener("storage", onStorage);
    };
  }, [user?.username, avgMode]);

  // Re-sync stats from server when the tab/window regains focus so stats
  // recorded on another device (e.g., desktop) appear on mobile immediately.
  useEffect(() => {
    if (!user?.username) return;
    const handleVisibility = () => {
      if (!document.hidden) {
        syncStatsFromServer(user.username)
          .then(() => {
            // After sync, refresh the displayed average
            window.dispatchEvent(
              new CustomEvent("ndn:stats-updated", {
                detail: { name: user.username },
              }),
            );
          })
          .catch(() => {});
      }
    };
    const handleFocus = () => {
      syncStatsFromServer(user.username)
        .then(() => {
          window.dispatchEvent(
            new CustomEvent("ndn:stats-updated", {
              detail: { name: user.username },
            }),
          );
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user?.username]);

  // Load avatar from localStorage when user changes
  useEffect(() => {
    if (!user?.username) {
      setAvatar("");
      return;
    }
    const storedAvatar = localStorage.getItem(
      `ndn:bio:profilePhoto:${user.username}`,
    );
    setAvatar(storedAvatar || "");
  }, [user?.username]);

  // Listen for avatar updates from SettingsPanel
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key?.startsWith("ndn:bio:profilePhoto:") &&
        user?.username &&
        e.key.endsWith(user.username)
      ) {
        setAvatar(e.newValue || "");
      }
    };
    const handleAvatarUpdate = (e: any) => {
      // Check if this update is for the current user
      if (e.detail?.username === user?.username) {
        setAvatar(e.detail?.avatar || "");
      }
      // Also check localStorage as backup for any avatar update
      if (user?.username) {
        const storedAvatar = localStorage.getItem(
          `ndn:bio:profilePhoto:${user.username}`,
        );
        setAvatar(storedAvatar || "");
      }
    };
    // Also check localStorage when window becomes visible (user switches tabs)
    const handleVisibilityChange = () => {
      if (!document.hidden && user?.username) {
        const storedAvatar = localStorage.getItem(
          `ndn:bio:profilePhoto:${user.username}`,
        );
        setAvatar(storedAvatar || "");
      }
    };

    // Check localStorage periodically as a fallback (less frequent to reduce work)
    const checkAvatarInterval = setInterval(() => {
      if (user?.username) {
        const storedAvatar = localStorage.getItem(
          `ndn:bio:profilePhoto:${user.username}`,
        );
        if (storedAvatar && storedAvatar !== avatar) {
          setAvatar(storedAvatar);
        }
      }
    }, 10000); // every 10s

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(
      "ndn:avatar-updated" as any,
      handleAvatarUpdate as any,
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        "ndn:avatar-updated" as any,
        handleAvatarUpdate as any,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(checkAvatarInterval);
    };
  }, [user?.username, avatar]);

  // Handle payment success for username change
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paid = urlParams.get("paid");
    const usernameChange = urlParams.get("username-change");
    if (
      paid === "1" ||
      paid === "username-change" ||
      usernameChange === "free"
    ) {
      const pendingUsername = localStorage.getItem("pendingUsernameChange");
      if (pendingUsername && user?.email) {
        // Call the change username API
        fetch(`${API_URL}/api/change-username`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            newUsername: pendingUsername,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.ok) {
              alert("Username changed successfully!");
              localStorage.removeItem("pendingUsernameChange");
              // Update user data and token
              if (data.token) {
                localStorage.setItem("authToken", data.token);
              }
              if (data.user) {
                setUserWithMerge(data.user);
              }
              // Clean up URL
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname,
              );
            } else {
              alert(
                "Failed to change username: " + (data.error || "Unknown error"),
              );
            }
          })
          .catch(() => {
            alert("Network error while changing username");
          });
      }
    }
  }, [user?.email]);

  // Keep full-screen state in sync when the user enters/exits full screen mode.
  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    // initialize
    setIsFullscreen(!!document.fullscreenElement);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Handle payment success for premium subscription
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subscription = urlParams.get("subscription");
    if (subscription === "success" && user?.email) {
      // Refresh user data to get updated subscription status
      fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.user) {
            setUserWithMerge(data.user);
            alert("Premium subscription activated successfully!");
            // Clean up URL
            window.history.replaceState(
              {},
              document.title,
              window.location.pathname,
            );
          }
        })
        .catch(() => {
          alert(
            "Subscription activated, but failed to refresh user data. Please refresh the page.",
          );
        });
    }
  }, [user?.email]);

  // Keep the CSS header height token in sync with the actual header element so
  // layout offsets are accurate.
  useEffect(() => {
    function updateHeaderHeight() {
      const el = document.getElementById("ndn-header");
      if (!el) return;
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--ndn-header-h", `${h}px`);
    }

    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);
    window.addEventListener("orientationchange", updateHeaderHeight);
    // Also respond when the compact mode changes so header height updates
    // (isCompact is part of the dependency list)
    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
      window.removeEventListener("orientationchange", updateHeaderHeight);
    };
  }, [isCompact]);

  // Global logout handler: return to sign-in screen and clear minimal local user context
  useEffect(() => {
    const onLogout = () => {
      try {
        // Clear any lightweight local flags (keep stats unless explicitly reset)
        localStorage.removeItem("ndn:avatar");
        if (user?.email)
          localStorage.removeItem(`ndn:subscription:${user.email}`);
      } catch (e) {}
      setUser(null);
      setTab("score");
    };
    window.addEventListener("ndn:logout" as any, onLogout as any);
    return () =>
      window.removeEventListener("ndn:logout" as any, onLogout as any);
  }, []);

  // Send presence to server whenever WS connects and user is authenticated
  // This ensures the server knows this user is online for friends list status
  useEffect(() => {
    if (!ws?.connected || !user?.email) return;
    try {
      const email = String(user.email || "").toLowerCase();
      const username = user.username || email;
      ws.send({ type: "presence", username, email });
      // Persist identity so WSProvider can re-send presence immediately on
      // reconnect (before React effects fire) to avoid race conditions where
      // join-match arrives before the server knows who we are.
      try {
        localStorage.setItem(
          "ndn:ws-identity",
          JSON.stringify({ username, email }),
        );
      } catch {}
    } catch {}
  }, [ws?.connected, user?.email, user?.username]);

  // Apply username changes from Settings globally and propagate via WS presence
  useEffect(() => {
    const onName = (e: any) => {
      try {
        const next = String(e?.detail?.username || "").trim();
        if (!next) return;
        setUser((prev: any) => {
          const u = prev ? { ...prev, username: next } : prev;
          return u;
        });
        // Recompute name color on next effect pass based on new username/avatar
        // Send presence update so friends/lobby reflect the new name
        try {
          const email = (user?.email || "").toLowerCase();
          if (ws && next && email)
            ws.send({ type: "presence", username: next, email });
        } catch (e) {}
      } catch (e) {}
    };
    window.addEventListener("ndn:username-changed" as any, onName as any);
    return () =>
      window.removeEventListener("ndn:username-changed" as any, onName as any);
  }, [ws, user?.email]);

  // Handle tab changes from Home component quick access pills
  useEffect(() => {
    const onTabChange = (e: any) => {
      try {
        const tab = String(e?.detail?.tab || "").trim();
        if (
          tab &&
          [
            "score",
            "offline",
            "online",
            "stats",
            "settings",
            "admin",
            "tournaments",
            "friends",
          ].includes(tab)
        ) {
          setTab(tab as TabKey);
        }
      } catch (e) {}
    };
    window.addEventListener("ndn:change-tab" as any, onTabChange as any);
    return () =>
      window.removeEventListener("ndn:change-tab" as any, onTabChange as any);
  }, []);

  async function fetchSubscription(u: any) {
    try {
      const q = u?.email ? `?email=${encodeURIComponent(u.email)}` : "";
      const res = await fetch("/api/subscription" + q);
      if (!res.ok) return;
      const data = await res.json();
      // Keep the full user object but attach the subscription so other components
      // can make decisions based on more detailed subscription metadata (expiresAt, source, status).
      setUserWithMerge({
        ...u,
        fullAccess: !!data?.fullAccess,
        subscription: data,
      });
      try {
        if (u?.email)
          localStorage.setItem(
            `ndn:subscription:${u.email}`,
            JSON.stringify(data),
          );
      } catch {}
    } catch (e) {}
  }

  // Header notification state: show an alert if subscription is expiring in <= 3 days, or expired
  const [showSubscriptionsBell, setShowSubscriptionsBell] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [siteNotifications, setSiteNotifications] = useState<any[]>([]);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const refreshNotifications = useCallback(async () => {
    if (!user?.email) return [] as any[];
    try {
      const token = localStorage.getItem("authToken");
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(
        `/api/notifications?email=${encodeURIComponent(user.email)}`,
        { headers },
      );
      if (!res.ok) return [];
      return (await res.json()) || [];
    } catch (err) {
      return [];
    }
  }, [user?.email]);

  const refreshFriendCounts = useCallback(async () => {
    if (!user?.email) {
      setFriendRequestCount(0);
      setUnreadMessageCount(0);
      return;
    }
    try {
      const [requestsRes, messagesRes] = await Promise.all([
        apiFetch(
          `/api/friends/requests?email=${encodeURIComponent(user.email)}`,
        ),
        apiFetch(
          `/api/friends/messages?email=${encodeURIComponent(user.email)}`,
        ),
      ]);
      const requests = requestsRes.ok
        ? await requestsRes.json()
        : { requests: [] };
      const messages = messagesRes.ok
        ? await messagesRes.json()
        : { messages: [] };
      setFriendRequestCount(requests.requests?.length || 0);
      setUnreadMessageCount(
        (messages.messages || []).filter((m: any) => !m.read).length,
      );
    } catch (err) {
      console.error("Failed to refresh friend notifications:", err);
      return false;
    }
    return true;
  }, [user?.email]);

  // Track consecutive failures and temporarily disable polling to avoid
  // hammering a dead remote API (improves performance and reduces noise).
  const friendPollFailuresRef = useRef<number>(0);
  const friendPollDisabledUntilRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user?.subscription) {
      setShowSubscriptionsBell(false);
      return;
    }
    const sub = user.subscription as any;
    const now = Date.now();
    let expiresAt: number | null = null;
    if (sub?.expiresAt) {
      expiresAt =
        typeof sub.expiresAt === "string"
          ? Date.parse(sub.expiresAt)
          : Number(sub.expiresAt);
    }
    // Consider this expiring soon when it's within 3 days (259200000 ms)
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    if (expiresAt && expiresAt > now && expiresAt - now <= THREE_DAYS_MS) {
      setShowSubscriptionsBell(true);
      return;
    }
    // If the subscription is expired and fullAccess is false, prompt to buy
    if (expiresAt && expiresAt <= now && !user?.fullAccess) {
      setShowSubscriptionsBell(true);
      return;
    }
    // For stripe subscriptions, a 'status' === 'active' means no bell, else show if status !== 'active'
    if (sub?.source === "stripe" && sub?.status && sub.status !== "active") {
      setShowSubscriptionsBell(true);
      return;
    }
    setShowSubscriptionsBell(false);
  }, [user?.subscription, user?.fullAccess]);

  // Fetch site notifications & keep in sync
  useEffect(() => {
    let mounted = true;
    if (!user?.email) {
      setSiteNotifications([]);
      return () => {
        mounted = false;
      };
    }
    const poll = async () => {
      const data = await refreshNotifications();
      if (!mounted) return;
      setSiteNotifications(data || []);
    };
    poll();
    const int = setInterval(poll, 30000);
    return () => {
      mounted = false;
      clearInterval(int);
    };
  }, [refreshNotifications, user?.email]);

  useEffect(() => {
    // Only poll friend/message counts when the app/tab is focused to avoid
    // background network requests (which can trigger noisy 404s when no API).
    // Use a small failure counter and short backoff so a downed API doesn't
    // get hammered.
    if (!user?.email) return;
    let mounted = true;

    const runIfFocused = async () => {
      try {
        if (!mounted) return;
        if (typeof document !== "undefined" && !document.hasFocus()) return;

        const disabledUntil = friendPollDisabledUntilRef.current;
        if (disabledUntil && Date.now() < disabledUntil) return;

        const ok = await refreshFriendCounts();
        if (ok) {
          friendPollFailuresRef.current = 0;
          friendPollDisabledUntilRef.current = null;
        } else {
          friendPollFailuresRef.current =
            (friendPollFailuresRef.current || 0) + 1;
          if (friendPollFailuresRef.current >= 3) {
            // Back off for 5 minutes after 3 consecutive failures
            friendPollDisabledUntilRef.current = Date.now() + 5 * 60 * 1000;
            console.warn(
              "Friend/message polling disabled for 5 minutes due to repeated failures",
            );
          }
        }
      } catch {}
    };

    // Run immediately if the tab is focused
    runIfFocused();

    const onFocus = () => {
      try {
        runIfFocused();
      } catch {}
    };

    window.addEventListener("focus", onFocus);

    // Periodic poll but only execute when focused
    const interval = setInterval(() => {
      try {
        runIfFocused();
      } catch {}
    }, 30000);

    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [refreshFriendCounts, user?.email]);

  useEffect(() => {
    if (!user?.email) {
      setFriendRequestCount(0);
      setUnreadMessageCount(0);
    }
  }, [user?.email]);

  // If subscription is expiring soon or expired, write a persistent notification server-side
  useEffect(() => {
    if (!user?.subscription || !user?.email) return;
    const sub = user.subscription as any;
    const now = Date.now();
    let expiresAt: number | null = null;
    if (sub?.expiresAt)
      expiresAt =
        typeof sub.expiresAt === "string"
          ? Date.parse(sub.expiresAt)
          : Number(sub.expiresAt);
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    async function addSubscriptionNotification(type: string, message: string) {
      try {
        const token = localStorage.getItem("authToken");
        const headers: any = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        await fetch("/api/notifications", {
          method: "POST",
          headers,
          body: JSON.stringify({ email: user.email, message, type }),
        });
      } catch (e) {}
    }
    if (expiresAt && expiresAt > now && expiresAt - now <= THREE_DAYS_MS) {
      addSubscriptionNotification(
        "sub_expiring",
        `Your premium subscription expires in ${Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))} day(s)`,
      );
      return;
    }
    if (expiresAt && expiresAt <= now && !user?.fullAccess) {
      addSubscriptionNotification(
        "sub_expired",
        "Your premium subscription has ended",
      );
      return;
    }
  }, [user?.email, user?.subscription, user?.fullAccess]);

  useEffect(() => {
    if (!notificationsOpen) return;
    // Only handle Escape key - click outside is handled by the modal backdrop
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [notificationsOpen]);

  // Allow other components (like Home pills) to open the notifications modal.
  useEffect(() => {
    const onOpen = () => setNotificationsOpen(true);
    window.addEventListener(NDN_OPEN_NOTIFICATIONS_EVENT as any, onOpen as any);
    return () =>
      window.removeEventListener(
        NDN_OPEN_NOTIFICATIONS_EVENT as any,
        onOpen as any,
      );
  }, []);

  if (!user) {
    return (
      <Auth
        onAuth={(u: any) => {
          try {
            const cached = localStorage.getItem(`ndn:subscription:${u.email}`);
            if (cached)
              setUserWithMerge({ ...u, subscription: JSON.parse(cached) });
            else setUserWithMerge(u);
          } catch {
            setUserWithMerge(u);
          }
          fetchSubscription(u);
        }}
      />
    );
  }
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    user.username || "NDN",
  )}&background=8F43EE&color=fff&bold=true&rounded=true&size=64`;
  const notificationText = (n: any) =>
    `${n.type || ""} ${n.message || ""}`.trim();
  const tournamentNotifs = siteNotifications.filter((n) =>
    /(tournament|bracket)/i.test(notificationText(n)),
  ).length;
  const checkinNotifs = siteNotifications.filter((n) =>
    /(check[-_\s]?in)/i.test(notificationText(n)),
  ).length;
  const matchInviteNotifs = siteNotifications.filter((n) =>
    /(match|invite)/i.test(notificationText(n)),
  ).length;
  const notificationPanelItems = [
    {
      key: "tournaments",
      label: "Tournament Closures",
      description: "Bracket updates and notices.",
      count: tournamentNotifs,
      icon: Trophy,
    },
    {
      key: "checkins",
      label: "Check-ins",
      description: "Venue reminders and start-of-round checks.",
      count: checkinNotifs,
      icon: CalendarDays,
    },
    {
      key: "match-invites",
      label: "Match Invites",
      description: "Pending matches ready to accept.",
      count: matchInviteNotifs + wsMatchInviteCount,
      icon: Handshake,
    },
    {
      key: "friend-requests",
      label: "Friend Requests",
      description: "Accept or decline new connections.",
      count: friendRequestCount,
      icon: Users,
    },
    {
      key: "messages",
      label: "Messages",
      description: "Unread chats and replies.",
      count: unreadMessageCount,
      icon: MessageCircle,
    },
  ];
  return (
    <ThemeProvider>
      <div
        ref={appRef}
        className={`${user?.fullAccess ? "premium-body" : ""} h-screen overflow-hidden pt-1 pb-0 px-1 xs:pt-2 xs:pb-0 xs:px-2 sm:pt-3 sm:pb-0 sm:px-3 md:pt-4 md:pb-0 md:px-4`}
      >
        <Toaster />
        <div
          className={`max-w-[1600px] mx-auto ${isMobile ? "flex flex-col" : "grid grid-cols-[auto,1fr] gap-4 sm:gap-6"} h-full overflow-hidden`}
        >
          {/* Sidebar — hidden on mobile (shown via drawer), visible on tablet & desktop */}
          {!isMobile && (
            <div className={`relative shrink-0 ${isTablet ? "w-56" : "w-72"}`}>
              <Sidebar
                className="w-full h-full"
                active={tab}
                onChange={(k) => {
                  setTab(k);
                }}
                user={user}
              />
            </div>
          )}

          {/* Mobile sidebar drawer */}
          {isMobile && navOpen && (
            <div className="fixed inset-0 z-[200] flex">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setNavOpen(false)}
              />
              <div className="relative z-10 w-72 h-full animate-in slide-in-from-left duration-200">
                <Sidebar
                  className="w-full h-full"
                  active={tab}
                  onChange={(k) => {
                    setTab(k);
                    setNavOpen(false);
                  }}
                  user={user}
                />
                <button
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-20"
                  onClick={() => setNavOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
          {/* Fixed hamburger menu button removed - integrated into header */}

          {/* Wrap header + scroller in a column so header stays static and only content scrolls below it */}
          <div className="flex flex-col h-full overflow-hidden">
            <div className="pt-1 xs:pt-2 relative z-50">
              <header
                id="ndn-header"
                data-testid="ndn-header"
                className={`header glass flex items-center justify-between gap-2 sm:gap-4 transition-all duration-200 ${
                  isCompact ? "py-1 px-2" : "py-2 px-4"
                }`}
                style={{ willChange: "transform" }}
              >
                {/* Left: Hamburger (mobile) + Brand + Greeting */}
                <div className="flex items-center gap-3 min-w-0 shrink ndn-greeting">
                  {isMobile && (
                    <button
                      className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
                      onClick={() => setNavOpen(true)}
                      aria-label="Open menu"
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                  )}
                  <div className="relative shrink-0">
                    <img
                      src={avatar || fallbackAvatar}
                      alt="avatar"
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full ring-1 ring-indigo-400/50 object-cover shadow-sm"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border border-[#13111C] rounded-full"></div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs text-white/70 ndn-greeting-welcome">
                          Welcome,{" "}
                          <span className="font-bold text-white">
                            {user.username}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-[11px] sm:text-xs text-white/60 ndn-greeting-avg">
                        <span className="uppercase tracking-[0.3em] text-white/35 text-[9px]">
                          {avgMode === "24h"
                            ? "30-Day 3-Dart Avg"
                            : "All-Time 3-Dart Avg"}
                        </span>
                        <span className="text-sm sm:text-base font-black text-white tracking-tight">
                          {allTimeAvg.toFixed(1)}
                        </span>
                        {normalizedDelta !== 0 && (
                          <span
                            className={`flex items-center gap-1 text-[11px] sm:text-xs font-semibold ${
                              normalizedDelta > 0
                                ? "text-emerald-300"
                                : "text-rose-300"
                            }`}
                          >
                            {normalizedDelta > 0 ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {normalizedDelta > 0 ? "+" : ""}
                            {normalizedDelta.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Center brand display */}
                <div className="flex-1 flex justify-center px-2">
                  <h1 className="w-full sm:w-auto">
                    <button
                      type="button"
                      className="w-full sm:w-auto flex items-center justify-center rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-base xs:text-xl sm:text-2xl font-black text-white tracking-tighter drop-shadow-lg whitespace-nowrap cursor-pointer select-none hover:bg-black/50 transition-colors"
                      onClick={() => {
                        setTab("score");
                      }}
                      title={"Go Home"}
                    >
                      <span className="xs:hidden">NDN 🎯</span>
                      <span className="hidden xs:inline">
                        NINE-DART-NATION 🎯
                      </span>
                    </button>
                  </h1>
                </div>

                {/* Right: Status + Actions */}
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <WSConnectionDot className="mr-1" />
                  <div className="flex items-center gap-1 sm:gap-2 bg-black/20 p-1 rounded-full border border-white/5">
                    <button
                      className="px-2 sm:px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
                      onClick={() => {
                        const el = appRef.current;
                        if (!el) return;
                        if (!document.fullscreenElement)
                          el.requestFullscreen().catch(() => {});
                        else document.exitFullscreen().catch(() => {});
                      }}
                    >
                      {isFullscreen ? "Exit" : "Full"}
                    </button>
                  </div>

                  {!isCompact && (
                    <div className="hidden sm:flex items-center ml-2 space-x-2">
                      <AddToHomeButton />
                      <InstallPicker />
                    </div>
                  )}

                  {/* Notifications bell removed from header — kept in main Notifications panel */}
                </div>
              </header>
            </div>
            <main
              id="ndn-main-scroll"
              className="space-y-4 flex-1 overflow-y-auto pr-1 flex flex-col"
              style={{
                willChange: "scroll-position",
                transform: "translateZ(0)", // GPU-accelerated scrolling
                WebkitOverflowScrolling: "touch", // Smooth scrolling on iOS
              }}
            >
              {tab === "settings" && !hiddenSet.has("tab:settings") && (
                <Suspense
                  fallback={<div className="p-4">Loading settings...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <SettingsPanel user={user} />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "score" && !hiddenSet.has("tab:score") && (
                <Suspense fallback={<div className="p-4">Loading home...</div>}>
                  <ScrollFade className="flex-1 min-h-0">
                    <Home user={user} />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "online" && !hiddenSet.has("tab:online") && (
                <Suspense
                  fallback={<div className="p-4">Loading online...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <OnlinePlay user={user} />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "camera" && !hiddenSet.has("tab:camera") && (
                <Suspense
                  fallback={<div className="p-4">Loading camera...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <CameraSetup />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "offline" && !hiddenSet.has("tab:offline") && (
                <Suspense
                  fallback={<div className="p-4">Loading offline...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <OfflinePlay user={user} />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "friends" && !hiddenSet.has("tab:friends") && (
                <Suspense
                  fallback={<div className="p-4">Loading friends...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <Friends user={user} />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "stats" && !hiddenSet.has("tab:stats") && (
                <Suspense
                  fallback={<div className="p-4">Loading stats...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <StatsPanel user={user} />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "tournaments" && !hiddenSet.has("tab:tournaments") && (
                <Suspense
                  fallback={<div className="p-4">Loading tournaments...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <Tournaments user={user} />
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "admin" && !hiddenSet.has("tab:admin") && (
                <Suspense
                  fallback={<div className="p-4">Loading admin...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <div className="flex-1 min-h-0 space-y-6">
                      <AdminDashboard user={user} />
                      <OpsDashboard user={user} />
                    </div>
                  </ScrollFade>
                </Suspense>
              )}
              {tab === "fullaccess" && !hiddenSet.has("tab:fullaccess") && (
                <Suspense
                  fallback={<div className="p-4">Loading admin access...</div>}
                >
                  <ScrollFade className="flex-1 min-h-0">
                    <AdminAccess user={user} />
                  </ScrollFade>
                </Suspense>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* Floating Help Assistant - Always visible */}
      {!hiddenSet.has("global:helpassistant") && <HelpAssistant />}
      {/* App footer with legal notice */}
      {!hiddenSet.has("global:footer") && <Footer />}
      {/* Debug banner removed - not shown to users in production builds */}
      {/* Global camera logger: logs stream lifecycle and video/pc events across site */}
      {!minimalUI && !hiddenSet.has("global:camera-logger") && (
        <GlobalCameraLogger />
      )}
      {/* Global camera watchdog: auto-recovers stalled video/stream */}
      {!minimalUI && !hiddenSet.has("global:camera-watchdog") && (
        <GlobalCameraWatchdog />
      )}
      {/* User-facing recovery toast + one-click retry */}
      {!minimalUI && !hiddenSet.has("global:camera-recovery") && (
        <GlobalCameraRecoveryToasts />
      )}
      {/* Full Screen Notification Modal - Moved to root level for proper overlay */}
      {notificationsOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center bg-black/90 backdrop-blur-sm pt-0 px-2 pb-2 sm:p-4 overflow-y-auto"
          onClick={() => setNotificationsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-4xl max-h-[100dvh] sm:max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-3xl sm:rounded-3xl border border-white/10 bg-[#13111C] pt-4 px-4 pb-4 sm:p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
            {/* Decorative glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <button
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition z-10"
              onClick={() => setNotificationsOpen(false)}
              aria-label="Close notifications"
            >
              ×
            </button>

            <div className="relative z-10 flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 shadow-lg shadow-amber-500/10 ring-1 ring-white/10">
                <Bell className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50 tracking-tight">
                  Notifications
                </h2>
                <p className="text-sm text-white/50 font-medium">
                  Stay updated with your latest activity
                </p>
              </div>
            </div>

            <div className="relative z-10">
              {/* Premium Warning */}
              {showSubscriptionsBell && (
                <div className="mb-8 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-6 flex flex-col sm:flex-row items-start gap-5 shadow-lg shadow-amber-500/5">
                  <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 ring-1 ring-amber-500/30">
                    <Trophy className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-amber-200">
                      Premium Subscription Alert
                    </h3>
                    <p className="text-sm text-amber-100/70 mt-1 leading-relaxed">
                      Your premium subscription is expiring soon or has expired.
                      Renew now to keep full access to all features!
                    </p>
                    <button
                      onClick={() => {
                        setNotificationsOpen(false);
                        setTab("settings");
                      }}
                      className="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-amber-500/25 hover:scale-105 transition-all duration-200"
                    >
                      Manage Subscription
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                {notificationPanelItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.key}
                      className="group flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-200 cursor-pointer hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5"
                      onClick={() => {
                        setNotificationsOpen(false);
                        if (
                          item.key === "friend-requests" ||
                          item.key === "messages"
                        )
                          setTab("friends");
                        if (item.key === "tournaments") setTab("tournaments");
                        if (item.key === "match-invites") setTab("online");
                      }}
                    >
                      <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-300 group-hover:scale-110 transition-all duration-300 ring-1 ring-white/5">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-white group-hover:text-indigo-200 transition-colors">
                          {item.label}
                        </h3>
                        <p className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
                          {item.description}
                        </p>
                      </div>
                      {item.count > 0 && (
                        <span className="px-3 py-1 rounded-full bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-500/30 animate-pulse">
                          {item.count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">
                  Recent Activity
                </h3>
                {siteNotifications.length > 0 && (
                  <span className="text-xs font-medium text-white/30 bg-white/5 px-2 py-1 rounded-md">
                    {siteNotifications.length} total
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {siteNotifications.length === 0 ? (
                  <div className="text-center py-16 rounded-3xl border border-dashed border-white/10 bg-white/[0.02]">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                      <Bell className="h-8 w-8" />
                    </div>
                    <p className="text-white/40 font-medium">
                      No recent notifications
                    </p>
                    <p className="text-xs text-white/20 mt-1">
                      You're all caught up!
                    </p>
                  </div>
                ) : (
                  siteNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 group ${n.read ? "bg-white/[0.02] border-white/5 hover:bg-white/5" : "bg-white/10 border-white/10 hover:bg-white/15 shadow-lg shadow-black/20"}`}
                    >
                      {!n.read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-500 to-orange-500"></div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-[0.65rem] font-bold uppercase tracking-wider px-2 py-1 rounded-md ring-1 ring-inset ${n.read ? "bg-white/5 text-white/40 ring-white/5" : "bg-rose-500/10 text-rose-300 ring-rose-500/20"}`}
                          >
                            {n.type || "General"}
                          </span>
                          <span className="text-xs text-white/30 font-medium">
                            {new Date(n.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                        {!n.read && (
                          <span className="self-start sm:self-auto rounded-full bg-rose-500 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-white shadow-sm shadow-rose-500/20">
                            New
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-medium text-white/90 leading-relaxed pl-1">
                        {n.message}
                      </p>

                      {n.link && (
                        <a
                          href={n.link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20"
                        >
                          Open Link ↗
                        </a>
                      )}

                      <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {!n.read && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const token = localStorage.getItem("authToken");
                                await fetch(
                                  `/api/notifications/${encodeURIComponent(n.id)}?email=${encodeURIComponent(user.email)}`,
                                  {
                                    method: "PATCH",
                                    headers: {
                                      "Content-Type": "application/json",
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({ read: true }),
                                  },
                                );
                                const updated = await refreshNotifications();
                                if (updated) setSiteNotifications(updated);
                              } catch (err) {}
                            }}
                            className="text-xs font-bold text-white/50 hover:text-white transition-colors uppercase tracking-wider"
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("Delete this notification?")) return;
                            try {
                              const token = localStorage.getItem("authToken");
                              await fetch(
                                `/api/notifications/${encodeURIComponent(n.id)}?email=${encodeURIComponent(user.email)}`,
                                {
                                  method: "DELETE",
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );
                              const updated = await refreshNotifications();
                              if (updated) setSiteNotifications(updated);
                            } catch (err) {}
                          }}
                          className="text-xs font-bold text-rose-400/50 hover:text-rose-400 transition-colors ml-auto uppercase tracking-wider"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Global phone camera overlay - visibility controlled by store */}
      {/* Keep a hidden global video element alive across navigation */}
      {!minimalUI && <GlobalPhoneVideoSink />}
      <AnnouncementPopup />
    </ThemeProvider>
  );
}

// MobileBottomNav and MobileNav removed
