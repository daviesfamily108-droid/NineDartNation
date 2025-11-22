import {
  LayoutDashboard,
  Camera,
  Users,
  Trophy,
  Settings,
  MessageCircle,
  Lock,
  PoundSterling,
  Bell,
} from "lucide-react";
import FocusLock from "react-focus-lock";
import { useEffect, useState } from "react";
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

export function getTabs(user: any) {
  const baseTabs = [
    { key: "score", label: "Home", icon: LayoutDashboard },
  { key: "online", label: "Online Play", icon: Users },
    { key: "offline", label: "Offline", icon: Trophy },
    { key: "tournaments", label: "Tournaments", icon: Trophy },
    { key: "friends", label: "Friends", icon: Users },
    { key: "stats", label: "Stats", icon: Trophy },
    { key: "calibrate", label: "Calibrate", icon: Camera },
    { key: "settings", label: "Settings", icon: Settings },
  ];
  // Admin tab visibility handled in Sidebar via hook (client-side fetch)
  if (!user?.fullAccess) {
    baseTabs.push({
      key: "fullaccess",
      label: "PREMIUM £€$",
      icon: PoundSterling,
    });
  }
  return baseTabs;
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
  const tabs = getTabs(user);
  const isAdmin = useIsAdmin(user?.email);
  // IMPORTANT: Admin tab is ONLY shown for explicitly granted admin users
  // Premium status does NOT automatically grant admin access
  // Admin access must be granted via /api/admins/grant endpoint by the owner
  if (isAdmin && !tabs.some((t) => t.key === "admin")) {
    const idx = tabs.findIndex((t) => t.key === "settings");
    const adminTab = { key: "admin", label: "Admin", icon: Settings } as const;
    if (idx >= 0) tabs.splice(idx, 0, adminTab as any);
    else tabs.push(adminTab as any);
  }
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

    const fetchNotifications = async () => {
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

        // Count unread messages (messages without read status, assuming all are unread for now)
        const unreadMessages =
          messages.messages?.filter((m: any) => !m.read).length || 0;

        setNotifications({
          friendRequests: requests.requests?.length || 0,
          messages: unreadMessages,
          tournaments: 0, // TODO: Add tournament notifications
        });
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
      }
    };

    fetchNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user?.email]);

  useEffect(() => {
    if (!showDiscord) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") setShowDiscord(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDiscord]);
  return (
    <aside
      className={`${user?.fullAccess ? "premium-sidebar" : ""} sidebar glass ${className ? "" : "w-60"} p-2 sm:p-4 rounded-2xl ${className ?? "hidden sm:flex"} flex-col gap-2 overflow-y-auto overflow-x-hidden ${className ? "" : "fixed top-2 bottom-2 sm:top-4 sm:bottom-4"}`}
    >
      {tabs.map(({ key, label, icon: Icon }) => {
        if (key === "admin" && !isAdmin) return null;
        return (
          <button
            key={key}
            className={`tab whitespace-nowrap flex items-center justify-start gap-3 ${active === key ? "tab--active" : "tab--inactive"} ${key === "fullaccess" ? "" : ""}`}
            onClick={() => onChange(key as TabKey)}
            title={label}
            style={{
              fontWeight: 700,
              fontSize: "1.1rem",
              color: active === key ? "#fff" : "#E5E7EB",
              letterSpacing: "0.02em",
            }}
          >
            <Icon className="w-6 h-6" />
            <span className="flex items-center gap-2">
              {label}
              {key === "online" && !user?.fullAccess && freeLeft <= 0 && (
                <span
                  title="Weekly free games used"
                  className="inline-flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-full bg-rose-600 text-white"
                >
                  <Lock className="w-3 h-3" />
                  Locked
                </span>
              )}
              {/* Notification badges */}
              {key === "friends" && notifications.friendRequests > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-orange-500 rounded-full">
                  {notifications.friendRequests > 9
                    ? "9+"
                    : notifications.friendRequests}
                </span>
              )}
              {key === "score" &&
                (notifications.messages > 0 ||
                  notifications.tournaments > 0) && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-orange-500 rounded-full">
                    {notifications.messages + notifications.tournaments > 9
                      ? "9+"
                      : notifications.messages + notifications.tournaments}
                  </span>
                )}
            </span>
            {/* Only the tab label should show PREMIUM; remove extra badge */}
          </button>
        );
      })}
      {/* Discord tab at the end */}
      <button
        className="tab tab--compact whitespace-nowrap flex items-center justify-start gap-3 bg-[#5865F2] text-white mt-2"
        onClick={() => setShowDiscord(true)}
        title="BullseyeDartsLeague"
        style={{ fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.02em" }}
      >
        <MessageCircle className="w-6 h-6" />
        <span className="truncate">BullseyeDartsLeague</span>
      </button>
      {/* NineDartNation Discord tab */}
      <button
        className="tab tab--compact whitespace-nowrap flex items-center justify-start gap-3 bg-[#5865F2] text-white mt-1"
        onClick={() => setShowNDNDiscord(true)}
        title="NineDartNation"
        style={{ fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.02em" }}
      >
        <MessageCircle className="w-6 h-6" />
        <span className="truncate">NineDartNation</span>
      </button>
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
                    <MessageCircle className="w-6 h-6" /> BullseyeDartsLeague
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
                    Join Discord
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
                    <MessageCircle className="w-6 h-6" /> NineDartNation
                  </h3>
                  <div className="mb-4 text-lg font-semibold">
                    Join the NineDartNation Discord community
                  </div>
                  <a
                    href="https://discord.gg/Q33J5FTVve"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn bg-[#5865F2] text-white w-full font-bold text-lg"
                  >
                    Join Discord
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
