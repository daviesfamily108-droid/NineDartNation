import React, { useEffect, useState } from "react";
import {
  User,
  Settings,
  Volume2,
  Camera,
  Gamepad2,
  Eye,
  Mic,
  Save,
  Edit3,
  Shield,
  HelpCircle,
  MessageCircle,
  X,
  Send,
  ChevronDown,
} from "lucide-react";
import { useUserSettings } from "../store/userSettings";
import ThemeToggle from './ThemeToggle';
import { apiFetch } from "../utils/api";

export default function SettingsPanel({ user }: { user?: any }) {
  const {
    favoriteDouble,
    callerEnabled,
    callerVoice,
    callerVolume,
    speakCheckoutOnly,
    avgMode,
    autoStartOffline,
    rememberLastOffline,
    reducedMotion,
    compactHeader,
    allowSpectate,
    cameraScale,
    cameraAspect,
    cameraFitMode,
    autoscoreProvider,
    autoscoreWsUrl,
    autoCommitMode,
    calibrationGuide,
    preferredCameraId,
    preferredCameraLabel,
    cameraEnabled,
    offlineLayout,
    textSize,
    boxSize,
    setFavoriteDouble,
    setCallerEnabled,
    setCallerVoice,
    setCallerVolume,
    setSpeakCheckoutOnly,
    setAvgMode,
    setAutoStartOffline,
    setRememberLastOffline,
    setReducedMotion,
    setCompactHeader,
    setAllowSpectate,
    setCameraScale,
    setCameraAspect,
    setCameraFitMode,
    setAutoscoreProvider,
    setAutoscoreWsUrl,
    setAutoCommitMode,
    setCalibrationGuide,
      preserveCalibrationOverlay,
      setPreserveCalibrationOverlay,
    setPreferredCamera,
    setCameraEnabled,
    setOfflineLayout,
    setTextSize,
    setBoxSize,
    dartTimerEnabled,
    dartTimerSeconds,
    setDartTimerEnabled,
    setDartTimerSeconds,
    x01DoubleIn,
    setX01DoubleIn,
  } = useUserSettings();

  // Achievements state
  const [achievements, setAchievements] = useState([
    {
      key: "first180",
      label: "First 180",
      unlocked: false,
      icon: "🎯",
      desc: "Score 180 in a match.",
    },
    {
      key: "hundredGames",
      label: "100 Games Played",
      unlocked: false,
      icon: "🏅",
      desc: "Play 100 games.",
    },
    {
      key: "tournamentWin",
      label: "Tournament Winner",
      unlocked: false,
      icon: "🥇",
      desc: "Win a tournament.",
    },
    {
      key: "bestLeg",
      label: "Best Leg",
      unlocked: false,
      icon: "⚡",
      desc: "Finish a leg in 12 darts or less.",
    },
    {
      key: "comeback",
      label: "Comeback",
      unlocked: false,
      icon: "🔥",
      desc: "Win after trailing by 3 legs.",
    },
  ]);

  useEffect(() => {
    const uname = user?.username || "";
    if (!uname) return;
    setAchievements((prev) =>
      prev.map((a) => ({
        ...a,
        unlocked: !!localStorage.getItem(`ndn:achieve:${a.key}:${uname}`),
      })),
    );
  }, [user?.username]);

  // Listen for external requests to open the Profile/User pill (from Home or elsewhere)
  useEffect(() => {
    function onOpenProfile(e: any) {
      try {
        setExpandedPill("user");
      } catch {}
    }
    window.addEventListener("ndn:open-settings-profile", onOpenProfile as any);
    return () =>
      window.removeEventListener(
        "ndn:open-settings-profile",
        onOpenProfile as any,
      );
  }, []);

  // Profile bio fields with edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [favPlayer, setFavPlayer] = useState("");
  const [favTeam, setFavTeam] = useState("");
  const [favDarts, setFavDarts] = useState("");
  const [bio, setBio] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [allowAnalytics, setAllowAnalytics] = useState(true);
  const [wallet, setWallet] = useState<any | null>(null);
  const [subscription, setSubscription] = useState<any>(null);

  // Help Assistant state
  const [helpMessages, setHelpMessages] = useState<
    Array<{
      text:
        | string
        | { text: string; links?: Array<{ text: string; tab: string }> };
      isUser: boolean;
    }>
  >([
    {
      text: "Hi! I'm your Nine Dart Nation assistant. How can I help you today?",
      isUser: false,
    },
  ]);
  const [helpInput, setHelpInput] = useState("");

  useEffect(() => {
    const uname = user?.username || "";
    if (!uname) return;
    try {
      setFavPlayer(localStorage.getItem(`ndn:bio:favPlayer:${uname}`) || "");
      setFavTeam(localStorage.getItem(`ndn:bio:favTeam:${uname}`) || "");
      setFavDarts(localStorage.getItem(`ndn:bio:favDarts:${uname}`) || "");
      setBio(localStorage.getItem(`ndn:bio:bio:${uname}`) || "");
      setProfilePhoto(
        localStorage.getItem(`ndn:bio:profilePhoto:${uname}`) || "",
      );
      setAllowAnalytics(
        localStorage.getItem(`ndn:settings:allowAnalytics:${uname}`) !==
          "false",
      );
    } catch {}
  }, [user?.username]);

  useEffect(() => {
    if (!user?.email) return;
    apiFetch(`/api/subscription?email=${encodeURIComponent(user.email)}`)
      .then((r) => r.json())
      .then(setSubscription)
      .catch(() => {});
    // Fetch wallet balance
    (async () => {
      try {
        const token = localStorage.getItem('authToken');
        const headers: any = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`/api/wallet/balance?email=${encodeURIComponent(user.email)}`, { headers })
        if (res.ok) setWallet(await res.json())
      } catch {}
    })()
  }, [user?.email]);

  const saveBio = () => {
    const uname = user?.username || "";
    if (!uname) return;
    try {
      localStorage.setItem(`ndn:bio:favPlayer:${uname}`, favPlayer);
      localStorage.setItem(`ndn:bio:favTeam:${uname}`, favTeam);
      localStorage.setItem(`ndn:bio:favDarts:${uname}`, favDarts);
      localStorage.setItem(`ndn:bio:bio:${uname}`, bio);
      localStorage.setItem(`ndn:bio:profilePhoto:${uname}`, profilePhoto);
      // Dispatch event to notify avatar update
      try {
        window.dispatchEvent(
          new CustomEvent("ndn:avatar-updated", {
            detail: { username: uname, avatar: profilePhoto },
          }),
        );
      } catch {}
      localStorage.setItem(
        `ndn:settings:allowAnalytics:${uname}`,
        allowAnalytics.toString(),
      );
      setIsEditing(false);
    } catch {}
  };

  // Help Assistant functions
  const faq = {
    "how to play":
      "To play darts, select a game mode from the menu. For online play, join a match. For offline, start a local game.",
    calibration:
      "Go to Settings > Camera & Vision > Calibration Guide to set up your camera properly.",
    premium:
      'Premium unlocks all game modes. Click the "Upgrade to PREMIUM" button in online play.',
    username: "Change your username once for free in Settings > Account.",
    voice:
      "Enable voice caller in Settings > Audio & Voice. Test the voice with the Test Voice button.",
    friends: "Add friends in the Friends tab to play together.",
    stats: "View your statistics in the Stats tab.",
    settings: "Customize your experience in the Settings panel.",
    support:
      "Contact support via email or check the FAQ in Settings > Support.",
  };

  const navigateToTab = (tabKey: string) => {
    try {
      window.dispatchEvent(
        new CustomEvent("ndn:change-tab", { detail: { tab: tabKey } }),
      );
    } catch (error) {
      console.error("Navigation failed:", error);
    }
  };

  const getResponseWithLinks = (
    userMessage: string,
  ): { text: string; links?: Array<{ text: string; tab: string }> } => {
    const message = userMessage.toLowerCase();

    if (message.includes("username") || message.includes("change name")) {
      return {
        text: "You can change your username once for free.",
        links: [{ text: "Go to Settings > Account", tab: "settings" }],
      };
    }
    if (
      message.includes("premium") ||
      message.includes("upgrade") ||
      message.includes("subscription")
    ) {
      return {
        text: "Premium unlocks all game modes and features.",
        links: [{ text: "Go to Online Play", tab: "online" }],
      };
    }
    if (
      message.includes("calibrat") ||
      message.includes("camera") ||
      message.includes("vision")
    ) {
      return {
        text: "Set up your camera properly in Settings.",
        links: [{ text: "Go to Settings > Camera & Vision", tab: "settings" }],
      };
    }
    if (
      message.includes("voice") ||
      message.includes("caller") ||
      message.includes("audio")
    ) {
      return {
        text: "Enable voice calling in Settings.",
        links: [{ text: "Go to Settings > Audio & Voice", tab: "settings" }],
      };
    }
    if (message.includes("friend") || message.includes("play together")) {
      return {
        text: "Add friends to play together.",
        links: [{ text: "Go to Friends", tab: "friends" }],
      };
    }
    if (
      message.includes("stat") ||
      message.includes("score") ||
      message.includes("performance")
    ) {
      return {
        text: "View your statistics and performance.",
        links: [{ text: "Go to Stats", tab: "stats" }],
      };
    }
    if (
      message.includes("setting") ||
      message.includes("customiz") ||
      message.includes("configur")
    ) {
      return {
        text: "Customize your experience.",
        links: [{ text: "Go to Settings", tab: "settings" }],
      };
    }
    if (message.includes("tournament") || message.includes("competition")) {
      return {
        text: "Check out tournaments and competitions.",
        links: [{ text: "Go to Tournaments", tab: "tournaments" }],
      };
    }
    if (
      message.includes("help") ||
      message.includes("support") ||
      message.includes("faq")
    ) {
      return {
        text: "You're already in the help section! Check the Support section above for more resources.",
        links: [{ text: "Scroll to Support", tab: "settings" }],
      };
    }
    if (
      message.includes("how to play") ||
      message.includes("game") ||
      message.includes("start")
    ) {
      return {
        text: "To play darts, select a game mode from the menu. For online play, join a match. For offline, start a local game.",
        links: [
          { text: "Play Online", tab: "online" },
          { text: "Play Offline", tab: "offline" },
        ],
      };
    }

    return {
      text: "I'm not sure about that. Try asking about playing, calibration, premium, username changes, voice settings, friends, stats, or settings.",
    };
  };

  const handleHelpSend = () => {
    if (!helpInput.trim()) return;
    const userMessage = helpInput.toLowerCase();
    setHelpMessages((prev) => [...prev, { text: helpInput, isUser: true }]);
    setHelpInput("");

    // Get response with smart link suggestions
    const response = getResponseWithLinks(userMessage);

    setTimeout(() => {
      setHelpMessages((prev) => [...prev, { text: response, isUser: false }]);
    }, 500);
  };

  // Username change state
  const [newUsername, setNewUsername] = useState("");
  const [changingUsername, setChangingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  // Available voices for caller
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices.filter((v) => v.lang.startsWith("en")));
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Highlights state
  const [showHighlights, setShowHighlights] = useState(false);

  // Collapsible pill state
  const [expandedPill, setExpandedPill] = useState<
    "user" | "calibration" | "settings" | null
  >(null);

  

  const PillButton = ({
    label,
    icon: Icon,
    pill,
    color,
  }: {
    label: string;
    icon: any;
    pill: "user" | "calibration" | "settings";
    color: string;
  }) => (
  <button
      onPointerDown={(e) => { (e as any).stopPropagation(); }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onTouchStart={(e) => { (e as any).stopPropagation?.(); }}
  onClick={() => setExpandedPill((prev) => (prev === pill ? null : pill))}
  type="button"
  data-testid={`pill-button-${pill}`}
  className={`select-none whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98] bg-gradient-to-r ${color} text-white flex items-center gap-2`}
    >
      <Icon className="w-4 h-4" /> {label}
      <ChevronDown
        className={`w-4 h-4 transition-transform ${expandedPill === pill ? "rotate-180" : ""}`}
      />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* ==== USER INFO PILL ==== */}
      <div className="relative rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-1">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1">
          <PillButton
            label="User Info"
            icon={User}
            pill="user"
            color="from-indigo-500 to-fuchsia-500 shadow-indigo-500/30"
          />
        </div>
      </div>

      {/* USER INFO CONTENT */}
      {expandedPill === "user" && (
        <div data-testid="pill-user-content" className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Account */}
            <div className="card">
              <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2 text-red-100">
                  <User className="w-5 h-5" /> Account
                </div>
                <div className="space-y-3">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent("ndn:logout"))
                      }
                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Logout
                    </button>
                    <button
                      onClick={() => setShowHighlights(true)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
                    >
                      Highlights
                    </button>
                  </div>
                  <div className="mt-4 border-t pt-3">
                    <div className="font-medium mb-2">Wallet</div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm opacity-80 mr-4">Balance:{' '}
                        <strong>{ wallet && wallet.wallet && Object.keys(wallet.wallet.balances || {}).length > 0 ?
                          Object.entries(wallet.wallet.balances).map(([c, v]) => `${c} ${(v/100).toFixed(2)}`).join(' • ') : '0.00' }
                        </strong>
                      </div>
                      <input className="input w-40" placeholder="Withdraw amount" value={''} onChange={() => {}} />
                      <select className="input">
                        <option>USD</option>
                        <option>GBP</option>
                        <option>EUR</option>
                      </select>
                      <button className="btn" onClick={async () => {
                        const email = user?.email || ''
                        if (!email) return alert('Not signed in')
                        const amt = prompt('Enter withdraw amount (e.g., 10.00)')
                        if (!amt) return
                        try {
                          const token = localStorage.getItem('authToken')
                          const headers: any = {'Content-Type': 'application/json'}
                          if (token) headers.Authorization = `Bearer ${token}`
                          const res = await fetch('/api/wallet/withdraw', { method: 'POST', headers, body: JSON.stringify({ email, amount: amt, currency: 'USD' }) })
                          if (!res.ok) throw new Error('Failed')
                          alert('Withdrawal requested')
                        } catch (err) {
                          alert('Failed to request withdrawal')
                        }
                      }}>Withdraw</button>
                    </div>
                  </div>
                  <div className="border-t border-red-500/20 pt-3">
                    <div className="font-medium mb-2 text-red-100">
                      Change Username (
                      {(() => {
                        const count = user?.usernameChangeCount || 0;
                        if (count < 2)
                          return `${2 - count} free changes remaining`;
                        return "£2 per change";
                      })()}
                      )
                    </div>
                    <div className="text-sm text-red-100 mb-2">
                      You can change your username up to 2 times for free.
                      Additional changes cost £2 each.
                    </div>
                    {user?.usernameChangeCount >= 2 && !newUsername.trim() ? (
                      <div className="text-amber-400 text-sm mb-2">
                        ⚠️ Additional username changes cost £2
                      </div>
                    ) : null}
                    <input
                      className="input w-full mb-2"
                      type="text"
                      placeholder="New username"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      disabled={changingUsername}
                    />
                    {usernameError && (
                      <div className="text-red-400 text-sm mb-2">
                        {usernameError}
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        setUsernameError("");
                        if (!newUsername.trim()) {
                          setUsernameError("Username required");
                          return;
                        }
                        if (newUsername.length < 3 || newUsername.length > 20) {
                          setUsernameError("Username must be 3-20 characters");
                          return;
                        }
                        const currentCount = user?.usernameChangeCount || 0;
                        const isFree = currentCount < 2;
                        if (!isFree) {
                          window.location.href =
                            "https://buy.stripe.com/eVq4gB3XqeNS0iw6vAfnO02";
                        } else {
                          localStorage.setItem(
                            "pendingUsernameChange",
                            newUsername.trim(),
                          );
                          window.location.href = "/?username-change=free";
                        }
                      }}
                      disabled={changingUsername || !newUsername.trim()}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                    >
                      {changingUsername
                        ? "Processing..."
                        : (() => {
                            const count = user?.usernameChangeCount || 0;
                            return count < 2
                              ? "Change Username (FREE)"
                              : "Change Username (£2)";
                          })()}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Premium */}
            {subscription && (
              <div className="card">
                <div className="p-3 rounded-xl border border-green-500/40 bg-green-500/10">
                  <div className="font-semibold mb-4 flex items-center gap-2 text-green-100">
                    <Shield className="w-5 h-5" /> Premium
                  </div>
                  <div className="space-y-3 text-sm text-green-100">
                    <div>
                      Status:{" "}
                      <span
                        className={
                          subscription?.status === "active"
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {subscription?.status === "active"
                          ? "✓ Active"
                          : "Not Active"}
                      </span>
                    </div>
                    {subscription?.status === "active" &&
                      subscription?.nextBillingDate && (
                        <div>
                          Next Billing:{" "}
                          {new Date(
                            subscription.nextBillingDate,
                          ).toLocaleDateString()}
                        </div>
                      )}
                    {subscription?.source === "tournament" &&
                      subscription?.status === "active" && (
                        <button
                          onClick={() =>
                            (window.location.href =
                              "https://buy.stripe.com/eVq4gB3XqeNS0iw6vAfnO02")
                          }
                          className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors text-xs"
                        >
                          Cancel Subscription
                        </button>
                      )}
                  </div>
                </div>
              </div>
            )}

            {/* Profile Photo */}
            <div className="card">
              <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2 text-cyan-100">
                  <Eye className="w-5 h-5" /> Profile Photo
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () =>
                        setProfilePhoto(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full text-xs text-slate-100"
                />
              </div>
            </div>

            {/* Online & Socials */}
            <div className="card">
              <div className="p-3 rounded-xl border border-purple-500/40 bg-purple-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2 text-purple-100">
                  <MessageCircle className="w-5 h-5" /> Online & Socials
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="allowSpectate"
                      checked={allowSpectate}
                      onChange={(e) => setAllowSpectate(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label
                      htmlFor="allowSpectate"
                      className="text-sm text-purple-100"
                    >
                      Allow spectators
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Data & Privacy */}
            <div className="card">
              <div className="p-3 rounded-xl border border-orange-500/40 bg-orange-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2 text-orange-100">
                  <Shield className="w-5 h-5" /> Data & Privacy
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="allowAnalytics"
                      checked={allowAnalytics}
                      onChange={(e) => setAllowAnalytics(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label
                      htmlFor="allowAnalytics"
                      className="text-sm text-orange-100"
                    >
                      Allow analytics
                    </label>
                  </div>
                  <button
                    onClick={() => {
                      const data = {
                        achievements,
                        bio: { favPlayer, favTeam, favDarts, bio },
                      };
                      const blob = new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `my-data-${new Date().toISOString().split("T")[0]}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="btn bg-orange-600 hover:bg-orange-700 w-full"
                  >
                    Export My Data
                  </button>
                </div>
              </div>
            </div>

            {/* Privacy & Copyright Notice */}
            <div className="card">
              <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" /> Privacy &
                  Copyright
                </div>
                <div className="space-y-3 text-sm text-slate-300">
                  <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3">
                    <p className="font-semibold text-red-300 mb-2">
                      ⚠️ Legal Notice
                    </p>
                    <p className="mb-2 text-xs">
                      <strong>Copyright:</strong> All content is protected by
                      copyright law.
                    </p>
                    <p className="text-xs">
                      <strong>Privacy:</strong> Your data is protected and
                      unauthorized access is prohibited.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Blocked Users */}
            <div className="card">
              <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2 text-yellow-100">
                  <Shield className="w-5 h-5" /> Blocked Users
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-yellow-100">
                    Manage players you've blocked from contacting you.
                  </p>
                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("ndn:open-blocklist"),
                      )
                    }
                    className="btn bg-yellow-600 hover:bg-yellow-700 w-full text-sm"
                  >
                    View Blocked Users
                  </button>
                </div>
              </div>
            </div>

            {/* Contact & Support */}
            <div className="card">
              <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2 text-blue-100">
                  <MessageCircle className="w-5 h-5" /> Contact & Support
                </div>
                <div className="space-y-2">
                  <a
                    href="mailto:support@ninedartnation.com"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    📧 Email Support
                  </a>
                  <a
                    href="https://ninedartnation.com/help"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    ❓ Help Center
                  </a>
                  <a
                    href="https://ninedartnation.com/faq"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    📋 FAQ
                  </a>
                </div>
              </div>
            </div>

            {/* Account Deletion */}
            <div className="card">
              <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2 text-red-100">
                  <Shield className="w-5 h-5" /> Delete Account
                </div>
                <div className="space-y-3">
                  <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-xs text-red-200">
                    <p className="font-semibold mb-1">⚠️ Warning</p>
                    <p>
                      Deleting your account is permanent and cannot be undone.
                      All your stats, achievements, and data will be erased.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const confirm = window.confirm(
                        "Are you absolutely sure you want to delete your account? This action cannot be undone.\n\nAll your stats, achievements, and data will be permanently erased.",
                      );
                      if (confirm) {
                        const finalConfirm = window.confirm(
                          "This is your final warning. Click OK to permanently delete your account.",
                        );
                        if (finalConfirm) {
                          window.dispatchEvent(
                            new CustomEvent("ndn:delete-account"),
                          );
                        }
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Permanently Delete Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==== CALIBRATION PILL ==== */}
      <div className="relative rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-1">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1">
          <PillButton
            label="Calibration"
            icon={Camera}
            pill="calibration"
            color="from-purple-500 to-pink-500 shadow-purple-500/30"
          />
        </div>
      </div>

      {/* CALIBRATION CONTENT */}
      {expandedPill === "calibration" && (
        <div data-testid="pill-calibration-content" className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Camera & Vision */}
            <div className="card">
              <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-blue-400" /> Camera & Vision
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="cameraEnabled"
                      checked={cameraEnabled}
                      onChange={(e) => setCameraEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label htmlFor="cameraEnabled" className="text-sm">
                      Enable camera
                    </label>
                  </div>
                  {cameraEnabled && (
                    <>
                      <div>
                        <label
                          htmlFor="cameraScale"
                          className="block text-sm mb-2"
                        >
                          Scale: {cameraScale?.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          id="cameraScale"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={cameraScale || 1}
                          onChange={(e) =>
                            setCameraScale(parseFloat(e.target.value))
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="cameraAspect"
                          className="block text-sm mb-2"
                        >
                          Aspect Ratio
                        </label>
                        <select
                          onPointerDown={(e) => { (e as any).stopPropagation(); }}
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onTouchStart={(e) => { (e as any).stopPropagation?.(); }}
                          id="cameraAspect"
                          value={cameraAspect || "wide"}
                          onChange={(e) =>
                            setCameraAspect(e.target.value as "wide" | "square")
                          }
                          className="input w-full"
                        >
                          <option value="wide">Wide (16:9)</option>
                          <option value="square">Square (1:1)</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="cameraFitMode"
                          className="block text-sm mb-2"
                        >
                          Fit Mode
                        </label>
                        <select
                          onPointerDown={(e) => { (e as any).stopPropagation(); }}
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onTouchStart={(e) => { (e as any).stopPropagation?.(); }}
                          id="cameraFitMode"
                          value={cameraFitMode || "fit"}
                          onChange={(e) =>
                            setCameraFitMode(e.target.value as "fill" | "fit")
                          }
                          className="input w-full"
                        >
                          <option value="fill">Fill (crop)</option>
                          <option value="fit">Fit (letterbox)</option>
                        </select>
                      </div>
                      <button
                        onClick={() => {}}
                        className="btn bg-indigo-600 hover:bg-indigo-700 w-full"
                      >
                        Calibration Guide
                      </button>
                      <div className="flex items-center gap-3 mt-3">
                        <input
                          type="checkbox"
                          id="preserveOverlaySize"
                          checked={preserveCalibrationOverlay}
                          onChange={(e) => setPreserveCalibrationOverlay(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor="preserveOverlaySize" className="text-sm">
                          Preserve overlay display size when locking calibration
                        </label>
                      </div>
                      <div>
                        <label
                          htmlFor="autoscoreProvider"
                          className="block text-sm mb-2"
                        >
                          Auto-score Provider
                        </label>
                        <select
                          onPointerDown={(e) => { (e as any).stopPropagation(); }}
                          onMouseDown={(e) => { e.stopPropagation(); }}
                          onTouchStart={(e) => { (e as any).stopPropagation?.(); }}
                          id="autoscoreProvider"
                          value={autoscoreProvider || "manual"}
                          onChange={(e) =>
                            setAutoscoreProvider(
                              e.target.value as
                                | "manual"
                                | "built-in"
                                | "external-ws",
                            )
                          }
                          className="input w-full"
                        >
                          <option value="manual">Manual Scoring</option>
                          <option value="built-in">Built-in Vision</option>
                          <option value="external-ws">
                            External (WebSocket)
                          </option>
                        </select>
                      </div>
                      {autoscoreProvider === "external-ws" && (
                        <input
                          type="text"
                          placeholder="WebSocket URL"
                          value={autoscoreWsUrl || ""}
                          onChange={(e) => setAutoscoreWsUrl(e.target.value)}
                          className="input w-full text-xs"
                        />
                      )}
                      {autoscoreProvider !== "manual" && (
                        <div>
                          <label
                            htmlFor="autoCommitMode"
                            className="block text-sm mb-2"
                          >
                            Turn Advance
                          </label>
                          <select
                            onPointerDown={(e) => { (e as any).stopPropagation(); }}
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onTouchStart={(e) => { (e as any).stopPropagation?.(); }}
                            id="autoCommitMode"
                            value={autoCommitMode || "wait-for-clear"}
                            onChange={(e) =>
                              setAutoCommitMode(
                                e.target.value as
                                  | "wait-for-clear"
                                  | "immediate",
                              )
                            }
                            className="input w-full"
                          >
                            <option value="wait-for-clear">
                              Wait for darts to be removed
                            </option>
                            <option value="immediate">
                              Advance immediately after 3 darts/bust
                            </option>
                          </select>
                          <p className="text-xs opacity-70 mt-1">
                            Waiting prevents the turn from rotating until you
                            clear the board (or 6.5s pass).
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Audio & Voice */}
            <div className="card">
              <div className="p-3 rounded-xl border border-purple-500/40 bg-purple-500/10">
                <div className="font-semibold mb-4 flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-purple-400" /> Audio & Voice
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="callerEnabled"
                      checked={callerEnabled}
                      onChange={(e) => setCallerEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label htmlFor="callerEnabled" className="text-sm">
                      Enable voice caller
                    </label>
                  </div>
                  {callerEnabled && (
                    <>
                      <div>
                        <label
                          htmlFor="callerVoice"
                          className="block text-sm mb-2"
                        >
                          Voice
                        </label>
                            <select
                              onPointerDown={(e) => { (e as any).stopPropagation(); }}
                              onMouseDown={(e) => { e.stopPropagation(); }}
                              onTouchStart={(e) => { (e as any).stopPropagation?.(); }}
                          id="callerVoice"
                          value={callerVoice || ""}
                          onChange={(e) => setCallerVoice(e.target.value)}
                          className="input w-full text-xs"
                        >
                          <option value="">Default</option>
                          {availableVoices.map((v, i) => (
                            <option key={i} value={v.voiceURI}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="callerVolume"
                          className="block text-sm mb-2"
                        >
                          Volume: {Math.round((callerVolume || 1) * 100)}%
                        </label>
                        <input
                          type="range"
                          id="callerVolume"
                          min="0"
                          max="1"
                          step="0.1"
                          value={callerVolume || 1}
                          onChange={(e) =>
                            setCallerVolume(parseFloat(e.target.value))
                          }
                          className="w-full"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="speakCheckoutOnly"
                          checked={speakCheckoutOnly}
                          onChange={(e) =>
                            setSpeakCheckoutOnly(e.target.checked)
                          }
                          className="w-4 h-4"
                        />
                        <label htmlFor="speakCheckoutOnly" className="text-sm">
                          Only speak checkout scores
                        </label>
                      </div>
                      <button
                        onClick={() => {
                          const phrases = [
                            "Treble twenty... Treble twenty... One hundred and eighty!",
                            "And he leaves... double sixteen.",
                            "Lovely darts! One hundred and forty!",
                            "Game shot! And the match!",
                          ];
                          const phrase = phrases[Math.floor(Math.random() * phrases.length)];
                          const utterance = new SpeechSynthesisUtterance(phrase);
                          utterance.voice =
                            availableVoices.find(
                              (v) => v.voiceURI === callerVoice,
                            ) || null;
                          utterance.volume = callerVolume || 1;
                          utterance.rate = 0.92;
                          utterance.pitch = 1.0;
                          speechSynthesis.cancel();
                          speechSynthesis.speak(utterance);
                        }}
                        className="btn bg-purple-600 hover:bg-purple-700 w-full"
                      >
                        Test Voice
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==== SETTINGS SECTIONS PILL ==== */}
      <div className="relative rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-1">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1">
          <PillButton
            label="Settings"
            icon={Settings}
            pill="settings"
            color="from-cyan-500 to-blue-500 shadow-cyan-500/30"
          />
        </div>
      </div>

      {/* SETTINGS CONTENT */}
      {expandedPill === "settings" && (
        <div data-testid="pill-settings-content" className="space-y-4">
          {/* Profile Bio */}
          <div className="card">
            <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold flex items-center gap-2">
                  <User className="w-5 h-5 text-brand-400" /> Profile Bio
                </div>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 text-sm transition-colors"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </button>
                ) : (
                  <button
                    onClick={saveBio}
                    className="flex items-center gap-2 px-3 py-1 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 text-sm transition-colors"
                  >
                    <Save className="w-4 h-4" /> Save
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {isEditing ? (
                  <>
                    <div>
                      <label className="block text-sm mb-1">
                        Favorite Player
                      </label>
                      <input
                        type="text"
                        value={favPlayer}
                        onChange={(e) => setFavPlayer(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">
                        Favorite Team
                      </label>
                      <input
                        type="text"
                        value={favTeam}
                        onChange={(e) => setFavTeam(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">
                        Favorite Darts
                      </label>
                      <input
                        type="text"
                        value={favDarts}
                        onChange={(e) => setFavDarts(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Bio / Quote</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="input w-full"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      Favorite Player:{" "}
                      <span className="text-brand-300">
                        {favPlayer || "Not set"}
                      </span>
                    </div>
                    <div>
                      Favorite Team:{" "}
                      <span className="text-brand-300">
                        {favTeam || "Not set"}
                      </span>
                    </div>
                    <div>
                      Favorite Darts:{" "}
                      <span className="text-brand-300">
                        {favDarts || "Not set"}
                      </span>
                    </div>
                    <div>
                      Bio:{" "}
                      <span className="text-brand-300">
                        {bio || "No bio set"}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Game Preferences */}
          <div className="card">
            <div className="p-3 rounded-xl border border-green-500/40 bg-green-500/10">
              <div className="font-semibold mb-4 flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-green-400" /> Game Preferences
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="dartTimerEnabled"
                    checked={!!dartTimerEnabled}
                    onChange={(e) => setDartTimerEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="dartTimerEnabled" className="text-sm">
                    Enable per-dart throw timer
                  </label>
                </div>
                {dartTimerEnabled && (
                  <div>
                    <label className="block mb-2 text-sm font-medium">
                      Time per throw:{" "}
                      {dartTimerSeconds ? Math.round(dartTimerSeconds) : 0}s
                    </label>
                    <input
                      type="range"
                      min="3"
                      max="30"
                      value={dartTimerSeconds || 10}
                      onChange={(e) =>
                        setDartTimerSeconds(parseInt(e.target.value))
                      }
                      className="w-full"
                    />
                    <div className="text-xs opacity-70 mt-1">
                      When the timer reaches zero, the dart is recorded as a
                      miss and advances to the next throw.
                    </div>
                  </div>
                )}
                <div>
                  <label
                    htmlFor="favoriteDouble"
                    className="block text-sm mb-2"
                  >
                    Favorite Finish Double
                  </label>
                        <select
                          onPointerDown={(e) => { (e as any).stopPropagation(); }}
                          onMouseDown={(e) => { e.stopPropagation(); }}
                    id="favoriteDouble"
                    value={favoriteDouble}
                    onChange={(e) => setFavoriteDouble(e.target.value)}
                    className="input w-full"
                  >
                    <option value="any">Any Double</option>
                    <option value="D20">Double 20</option>
                    <option value="D10">Double 10</option>
                    <option value="D5">Double 5</option>
                    <option value="D1">Double 1</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="avgMode" className="block text-sm mb-2">
                    Average Display Mode
                  </label>
                  <select
                    id="avgMode"
                    value={avgMode}
                    onChange={(e) =>
                      setAvgMode(e.target.value as "all-time" | "24h")
                    }
                    className="input w-full"
                  >
                    <option value="all-time">All Time Average</option>
                    <option value="24h">24 Hour Average</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="x01DoubleIn"
                    checked={!!x01DoubleIn}
                    onChange={(e) => setX01DoubleIn(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="x01DoubleIn" className="text-sm">
                    Require Double-In for X01
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* UI & Accessibility */}
          <div className="card">
            <div className="p-3 rounded-xl border border-pink-500/40 bg-pink-500/10">
              <div className="font-semibold mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-pink-400" /> UI & Accessibility
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="autoStartOffline"
                    checked={autoStartOffline}
                    onChange={(e) => setAutoStartOffline(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="autoStartOffline" className="text-sm">
                    Auto-start offline games
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="rememberLastOffline"
                    checked={rememberLastOffline}
                    onChange={(e) => setRememberLastOffline(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="rememberLastOffline" className="text-sm">
                    Remember last offline game settings
                  </label>
                </div>
                <div>
                  <label htmlFor="offlineLayout" className="block text-sm mb-2">
                    Offline Layout
                  </label>
                  <select
                    id="offlineLayout"
                    value={offlineLayout || "classic"}
                    onChange={(e) =>
                      setOfflineLayout(e.target.value as "classic" | "modern")
                    }
                    className="input w-full"
                  >
                    <option value="classic">Classic Layout</option>
                    <option value="modern">Modern Layout</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="reducedMotion"
                    checked={reducedMotion}
                    onChange={(e) => setReducedMotion(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="reducedMotion" className="text-sm">
                    Reduce motion/animations
                  </label>
                </div>
                {/* theme toggle moved to its own section below */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="compactHeader"
                    checked={compactHeader}
                    onChange={(e) => setCompactHeader(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="compactHeader" className="text-sm">
                    Compact header
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Theme */}
          <div className="card">
            <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/6">
              <div className="font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-yellow-400" /> Theme
              </div>
              <div>
                <ThemeToggle />
              </div>
            </div>
          </div>

          {/* Support & Help */}
          <div className="card">
            <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10">
              <div className="font-semibold mb-4 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-400" /> Support & Help
              </div>
              <div className="space-y-2">
                <p className="text-sm opacity-80">
                  Need help? Contact us via email:
                </p>
                <a
                  href="mailto:support@ninedartnation.com"
                  className="btn bg-blue-600 hover:bg-blue-700 w-full text-xs"
                >
                  Email Support
                </a>
              </div>
            </div>
          </div>

          {/* Help Assistant */}
          <div className="card">
            <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10">
              <div className="font-semibold mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-cyan-400" /> Help
                Assistant
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {helpMessages.map((msg, i) => (
                  <div key={i} className={`${msg.isUser ? "text-right" : ""}`}>
                    <div
                      className={`inline-block max-w-xs px-3 py-2 rounded-lg text-sm ${msg.isUser ? "bg-indigo-600 text-white" : "bg-white/10 text-slate-100"}`}
                    >
                      {typeof msg.text === "string" ? (
                        msg.text
                      ) : (
                        <>
                          <div>{msg.text.text}</div>
                          {msg.text.links && (
                            <div className="mt-2 space-y-1">
                              {msg.text.links.map((link, j) => (
                                <button
                                  key={j}
                                  onClick={() => navigateToTab(link.tab)}
                                  className="block w-full text-left text-xs px-2 py-1 bg-white/20 hover:bg-white/30 rounded transition"
                                >
                                  {link.text}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={helpInput}
                  onChange={(e) => setHelpInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleHelpSend()}
                  placeholder="Ask me anything..."
                  className="flex-1 input"
                />
                <button
                  onClick={handleHelpSend}
                  className="btn bg-blue-600 hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==== ACHIEVEMENTS & BADGES (ALWAYS VISIBLE) ==== */}
      <div className="card">
        <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-yellow-400" /> Achievements &
            Badges
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {achievements.map((a) => (
              <div
                key={a.key}
                className={`p-3 rounded-lg border ${a.unlocked ? "border-yellow-500/40 bg-yellow-500/10" : "border-white/10 bg-white/5"}`}
                title={a.desc}
              >
                <div className="text-lg">{a.icon}</div>
                <div className="text-xs font-semibold mt-1">{a.label}</div>
                <div className="text-[10px] opacity-70">
                  {a.unlocked ? "✓ Unlocked" : "Locked"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
