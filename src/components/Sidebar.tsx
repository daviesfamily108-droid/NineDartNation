import {
  Camera,
  LayoutDashboard,
  Lock,
  MessageCircle,
  PoundSterling,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import FocusLock from "react-focus-lock";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getFreeRemaining } from "../utils/quota";
import { useIsAdmin } from "../utils/admin";
import { DISCORD_INVITE_URL } from "../utils/config";
import { apiFetch } from "../utils/api";

export type TabKey =
  | "score"
  | "online"
  | "offline"
  | "friends"
  | "stats"
  | "calibrate"
  | "settings"
  | "admin"
  | "tournaments"
  | "fullaccess";

type TabDefinition = {
  key: TabKey;
  label: string;
  icon: typeof LayoutDashboard;
};

export function getTabs(user: any): TabDefinition[] {
  const baseTabs: TabDefinition[] = [
    { key: "score", label: "Home 🏠", icon: LayoutDashboard },
    { key: "online", label: "Online Play 🌐", icon: Users },
    { key: "offline", label: "Offline 🏆", icon: Trophy },
    { key: "tournaments", label: "Tournaments 🏟️", icon: Trophy },
    { key: "friends", label: "Friends 👥", icon: Users },
    { key: "stats", label: "Stats 📊", icon: Trophy },
    { key: "calibrate", label: "Calibrate 📍", icon: Camera },
    { key: "settings", label: "Settings ⚙️", icon: Settings },
  ];
  // Admin tab visibility handled in Sidebar via hook (client-side fetch)
  // A premium user should not see the 'PREMIUM' tab. Check subscription details
  // when present. If the user's subscription is active (includes tournament
  // winners with a future expiresAt or a stripe subscription with active status),
  // the tab is hidden. Otherwise, show it persistently until purchase.
  function isSubscriptionActive(u: any) {
    if (!u) return false;
    const sub = u.subscription;
    if (!sub) return !!u.fullAccess; // fallback
    if (sub.fullAccess) {
      if (sub.expiresAt) {
        const exp =
          typeof sub.expiresAt === "string"
            ? Date.parse(sub.expiresAt)
            : Number(sub.expiresAt);
        if (!isNaN(exp)) return exp > Date.now();
      }
      if (sub.status) return sub.status === "active";
      return true; // generic fullAccess true
    }
    return false;
  }

  if (!isSubscriptionActive(user)) {
    baseTabs.push({
      key: "fullaccess",
      label: "PREMIUM £€$ ✨",
      icon: PoundSterling,
    });
  }
  return baseTabs;
}

function resolveUserForTabs(user: any) {
  let userForTabs = user;
  if (!user?.subscription && user?.email) {
    try {
      const rawGet = (localStorage as any)?.getItem;
      if (typeof rawGet === "function") {
        const cached = rawGet.call(
          localStorage,
          `ndn:subscription:${user.email}`,
        );
        if (cached) {
          const subs = JSON.parse(cached);
          userForTabs = {
            ...user,
            subscription: subs,
            fullAccess: subs.fullAccess || user.fullAccess,
          };
        }
      }
    } catch {}
  }
  return userForTabs;
}

export function buildTabList(user: any, isAdmin: boolean): TabDefinition[] {
  const tabs: TabDefinition[] = [...getTabs(user)];
  if (isAdmin && !tabs.some((t) => t.key === "admin")) {
    const adminTab = {
      key: "admin",
      label: "Admin 🛡️",
      icon: Settings,
    } as const;
    const insertIdx = tabs.findIndex((t) => t.key === "settings");
    if (insertIdx >= 0) {
      tabs.splice(insertIdx, 0, adminTab);
    } else {
      tabs.push(adminTab as TabDefinition);
    }
  }
  return tabs;
}

export function Sidebar({
  active,
  onChange,
  user,
  className,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  user: any;
  className?: string;
}) {
  // Drag-to-scroll logic for PC/Mouse
  const sidebarRef = React.useRef<HTMLElement>(null);
  const isDown = React.useRef(false);
  const startY = React.useRef(0);
  const scrollTop = React.useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    isDown.current = true;
    if (sidebarRef.current) {
      startY.current = e.pageY - sidebarRef.current.offsetTop;
      scrollTop.current = sidebarRef.current.scrollTop;
      sidebarRef.current.style.cursor = "grabbing";
    }
  };
  const onMouseLeave = () => {
    isDown.current = false;
    if (sidebarRef.current) sidebarRef.current.style.cursor = "grab";
  };
  const onMouseUp = () => {
    isDown.current = false;
    if (sidebarRef.current) sidebarRef.current.style.cursor = "grab";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDown.current || !sidebarRef.current) return;
    e.preventDefault();
    const y = e.pageY - sidebarRef.current.offsetTop;
    const walk = (y - startY.current) * 2; // scroll speed
    sidebarRef.current.scrollTop = scrollTop.current - walk;
  };

  // no-op debug retention removed
  // When the server has not yet returned a subscription, prefer a cached
  // localStorage subscription (if present) to avoid flicker in the UI.
  const userForTabs = resolveUserForTabs(user);
  const isAdmin = useIsAdmin(user?.email);
  const tabs = buildTabList(userForTabs, isAdmin);
  const [showDiscord, setShowDiscord] = useState(false);
  const [showNDNDiscord, setShowNDNDiscord] = useState(false);
  const freeLeft =
    user?.username && !user?.fullAccess
      ? getFreeRemaining(user.username)
      : Infinity;

  // Notification counts
  const [notifications, setNotifications] = useState({
    friendRequests: 0,
    messages: 0,
    tournaments: 0,
  });

  // Fetch notification counts
  useEffect(() => {
    if (!user?.email) return;
    // Track failures and short-circuit polling if the remote API is known
    // to be unavailable (helps avoid repeated 404s and network noise).
    let mounted = true;
    const failures = { count: 0 } as { count: number };
    let disabledUntil: number | null = null;

    const fetchNotifications = async () => {
      try {
        if (!mounted) return;
        const anyWin = window as any;
        if (anyWin.__ndnApiDisabled) return;
        if (disabledUntil && Date.now() < disabledUntil) return;

        const [requestsRes, messagesRes] = await Promise.all([
          apiFetch(
            `/api/friends/requests?email=${encodeURIComponent(user.email)}`,
          ),
          apiFetch(
            `/api/friends/messages?email=${encodeURIComponent(user.email)}`,
          ),
        ]);

        const requests =
          requestsRes && (requestsRes as any).ok
            ? await requestsRes.json()
            : { requests: [] };
        const messages =
          messagesRes && (messagesRes as any).ok
            ? await messagesRes.json()
            : { messages: [] };

        // Count unread messages
        const unreadMessages =
          messages.messages?.filter((m: any) => !m.read).length || 0;

        setNotifications({
          friendRequests: requests.requests?.length || 0,
          messages: unreadMessages,
          tournaments: 0,
        });

        // Success -> reset failures
        failures.count = 0;
        disabledUntil = null;
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
        failures.count += 1;
        if (failures.count >= 3) {
          disabledUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
          console.warn(
            "Sidebar notifications polling paused for 5m due to repeated failures",
          );
        }
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.email]);

  useEffect(() => {
    if (!showDiscord) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") setShowDiscord(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDiscord]);

  // Group tabs for professional layout
  const playTabs = tabs.filter((t) =>
    ["score", "online", "offline", "tournaments"].includes(t.key),
  );
  const socialTabs = tabs.filter((t) => ["friends"].includes(t.key));
  const systemTabs = tabs.filter((t) =>
    ["stats", "calibrate", "settings", "admin", "fullaccess"].includes(t.key),
  );

  const renderTab = (t: TabDefinition) => {
    const { key, label, icon: Icon } = t;
    const isActive = active === key;

    // Calculate total notifications for this tab
    let badgeCount = 0;
    if (key === "friends") badgeCount = notifications.friendRequests;
    if (key === "score")
      badgeCount = notifications.messages + notifications.tournaments;

    return (
      <button
        key={key}
        className={`tab whitespace-nowrap flex items-center justify-between gap-3 ${isActive ? "tab--active" : "tab--inactive"} ${key === "fullaccess" ? "tab--premium" : ""}`}
        onClick={() => onChange(key as TabKey)}
        title={label}
      >
        <div className="flex items-center gap-3">
          <Icon
            className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-400"}`}
          />
          <span
            className={`font-semibold text-[1rem] ${isActive ? "text-white" : "text-slate-300"}`}
          >
            {label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {key === "online" && !user?.fullAccess && freeLeft <= 0 && (
            <Lock className="w-3 h-3 text-rose-500" />
          )}

          {badgeCount > 0 && (
            <span className="notification-badge animate-pulse">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <aside
      ref={sidebarRef}
      onMouseDown={onMouseDown}
      onMouseLeave={onMouseLeave}
      onMouseUp={onMouseUp}
      onMouseMove={onMouseMove}
      className={`${user?.fullAccess ? "premium-sidebar" : ""} sidebar glass ${
        className ? "" : "w-72"
      } p-5 rounded-2xl ${className ?? "hidden sm:flex"} flex-col gap-8 overflow-y-auto overflow-x-hidden ${
        className ? "" : "fixed top-4 bottom-4 left-4"
      }`}
    >
      {/* Logo / Brand Area */}
      <div className="px-2 mb-2">
        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">
          NINE DART
          <br />
          NATION
        </h1>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Play
        </h3>
        {playTabs.map(renderTab)}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Social
        </h3>
        {socialTabs.map(renderTab)}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">
          System
        </h3>
        {systemTabs.map((t) => {
          const rendered = renderTab(t);
          if (t.key === "settings") {
            return (
              <React.Fragment key={t.key}>
                {rendered}
                {/* Discord tab directly under Settings */}
                <button
                  className="tab tab--compact whitespace-nowrap flex items-center justify-start gap-3 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#5865F2] transition-colors ml-4 border-l-2 border-[#5865F2]/30"
                  onClick={() => setShowDiscord(true)}
                  title="BullseyeDartsLeague"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="truncate text-sm font-semibold">
                    Bullseye League
                  </span>
                </button>
                {/* NineDartNation Discord tab */}
                <button
                  className="tab tab--compact whitespace-nowrap flex items-center justify-start gap-3 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#5865F2] transition-colors ml-4 border-l-2 border-[#5865F2]/30"
                  onClick={() => setShowNDNDiscord(true)}
                  title="NineDartNation"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="truncate text-sm font-semibold">
                    NDN Community
                  </span>
                </button>
              </React.Fragment>
            );
          }
          return rendered;
        })}
      </div>

      {/* Discord about dialog via portal */}
      {showDiscord &&
        createPortal(
          <div className="fixed inset-0 z-[1000]">
            <button
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowDiscord(false)}
              onTouchStart={() => setShowDiscord(false)}
              aria-label="Close Discord dialog"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <FocusLock returnFocus>
                <div
                  role="dialog"
                  aria-modal="true"
                  className="card max-w-md w-full relative text-left p-6 rounded-xl"
                >
                  <button
                    className="absolute -top-3 -right-3 btn px-3 py-1"
                    aria-label="Close"
                    onClick={() => setShowDiscord(false)}
                  >
                    ✕
                  </button>
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-[#8ea1e1]">
                    <MessageCircle className="w-6 h-6" /> BullseyeDartsLeague 🎯
                  </h3>
                  <div className="mb-4 text-lg font-semibold">
                    Join this fantastic Online Darts League with divisions and
                    other cool stuff included
                  </div>
                  <a
                    href={DISCORD_INVITE_URL}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn bg-[#5865F2] text-white w-full font-bold text-lg"
                  >
                    Join Discord 💬
                  </a>
                </div>
              </FocusLock>
            </div>
          </div>,
          document.body,
        )}
      {/* NineDartNation Discord about dialog via portal */}
      {showNDNDiscord &&
        createPortal(
          <div className="fixed inset-0 z-[1000]">
            <button
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowNDNDiscord(false)}
              onTouchStart={() => setShowNDNDiscord(false)}
              aria-label="Close NineDartNation dialog"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <FocusLock returnFocus>
                <div
                  role="dialog"
                  aria-modal="true"
                  className="card max-w-md w-full relative text-left p-6 rounded-xl"
                >
                  <button
                    className="absolute -top-3 -right-3 btn px-3 py-1"
                    aria-label="Close"
                    onClick={() => setShowNDNDiscord(false)}
                  >
                    ✕
                  </button>
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-[#8ea1e1]">
                    <MessageCircle className="w-6 h-6" /> NineDartNation 🎯
                  </h3>
                  <div className="mb-4 text-lg font-semibold">
                    Join the NineDartNation 🎯 Discord community
                  </div>
                  <a
                    href="https://discord.gg/Q33J5FTVve"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn bg-[#5865F2] text-white w-full font-bold text-lg"
                  >
                    Join Discord 💬
                  </a>
                </div>
              </FocusLock>
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
}

export function MobileTabBar({
  active,
  onChange,
  user,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  user: any;
}) {
  const isAdmin = useIsAdmin(user?.email);
  const userForTabs = resolveUserForTabs(user);
  const tabs = buildTabList(userForTabs, isAdmin);

  // Helper to clean labels for mobile (remove emojis)
  const cleanLabel = (l: string) =>
    l.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, "").trim();

  return (
    <nav className="ndn-mobile-tabbar" aria-label="Mobile navigation">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          title={label}
          className={`tab mobile-tab-item ${active === key ? "tab--active" : "tab--inactive"}`}
          onClick={() => onChange(key)}
        >
          <Icon className="w-5 h-5" />
          <span className="mobile-tab-label">{cleanLabel(label)}</span>
        </button>
      ))}
    </nav>
  );
}
