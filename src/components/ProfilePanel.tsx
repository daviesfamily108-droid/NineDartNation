import React, { useEffect, useState } from "react";
import {
  User,
  Trophy,
  Target,
  TrendingUp,
  Camera,
  Shield,
  Edit3,
  Save,
  Star,
  Award,
  Zap,
  Crown,
  Medal,
  Heart,
  Settings,
  LogOut,
  CreditCard,
  Download,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
  Percent,
  Hash,
} from "lucide-react";
import { useUserSettings } from "../store/userSettings";
import { getAllTime, getRollingAvg, getAllTimeAvg, getGameModeStats } from "../store/profileStats";
import { formatAvg } from "../utils/stats";
import { apiFetch } from "../utils/api";
import ThemeToggle from "./ThemeToggle";

interface ProfilePanelProps {
  user?: any;
  onClose?: () => void;
}

export default function ProfilePanel({ user, onClose }: ProfilePanelProps) {
  // Profile bio fields
  const [isEditing, setIsEditing] = useState(false);
  const [favPlayer, setFavPlayer] = useState("");
  const [favTeam, setFavTeam] = useState("");
  const [favDarts, setFavDarts] = useState("");
  const [bio, setBio] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  
  // Account data
  const [wallet, setWallet] = useState<any | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  
  // Achievements
  const [achievements, setAchievements] = useState([
    { key: "first180", label: "First 180", unlocked: false, icon: "🎯", desc: "Score 180 in a match." },
    { key: "hundredGames", label: "100 Games", unlocked: false, icon: "🏅", desc: "Play 100 games." },
    { key: "tournamentWin", label: "Tournament Winner", unlocked: false, icon: "🥇", desc: "Win a tournament." },
    { key: "bestLeg", label: "Best Leg", unlocked: false, icon: "⚡", desc: "Finish a leg in 12 darts or less." },
    { key: "comeback", label: "Comeback", unlocked: false, icon: "🔥", desc: "Win after trailing by 3 legs." },
    { key: "perfectGame", label: "Perfect Game", unlocked: false, icon: "💎", desc: "Win a match without missing a double." },
    { key: "streakMaster", label: "Streak Master", unlocked: false, icon: "🌟", desc: "Win 5 matches in a row." },
    { key: "nightOwl", label: "Night Owl", unlocked: false, icon: "🦉", desc: "Play a match after midnight." },
  ]);
  
  // Username change
  const [newUsername, setNewUsername] = useState("");
  const [changingUsername, setChangingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  
  // Expanded sections
  const [expandedSection, setExpandedSection] = useState<string | null>("overview");
  
  // Settings from store
  const {
    favoriteDouble,
    setFavoriteDouble,
    callerEnabled,
    setCallerEnabled,
    callerVoice,
    setCallerVoice,
    callerVolume,
    setCallerVolume,
    avgMode,
    setAvgMode,
  } = useUserSettings();

  // Load bio data
  useEffect(() => {
    const uname = user?.username || "";
    if (!uname) return;
    try {
      setFavPlayer(localStorage.getItem(`ndn:bio:favPlayer:${uname}`) || "");
      setFavTeam(localStorage.getItem(`ndn:bio:favTeam:${uname}`) || "");
      setFavDarts(localStorage.getItem(`ndn:bio:favDarts:${uname}`) || "");
      setBio(localStorage.getItem(`ndn:bio:bio:${uname}`) || "");
      setProfilePhoto(localStorage.getItem(`ndn:bio:profilePhoto:${uname}`) || "");
    } catch {}
  }, [user?.username]);

  // Load achievements
  useEffect(() => {
    const uname = user?.username || "";
    if (!uname) return;
    setAchievements((prev) =>
      prev.map((a) => ({
        ...a,
        unlocked: !!localStorage.getItem(`ndn:achieve:${a.key}:${uname}`),
      }))
    );
  }, [user?.username]);

  // Load subscription & wallet
  useEffect(() => {
    if (!user?.email) return;
    apiFetch(`/api/subscription?email=${encodeURIComponent(user.email)}`)
      .then((r) => r.json())
      .then(setSubscription)
      .catch(() => {});
    
    (async () => {
      try {
        const token = localStorage.getItem("authToken");
        const headers: any = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(
          `/api/wallet/balance?email=${encodeURIComponent(user.email)}`,
          { headers }
        );
        if (res.ok) setWallet(await res.json());
      } catch {}
    })();
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
      window.dispatchEvent(
        new CustomEvent("ndn:avatar-updated", {
          detail: { username: uname, avatar: profilePhoto },
        })
      );
      setIsEditing(false);
    } catch {}
  };

  // Get stats
  const username = user?.username || "Player 1";
  const allTimeStats = getAllTime(username);
  const allTimeAvg = getAllTimeAvg(username);
  const rollingAvg = getRollingAvg(username);
  const gameModeStats = getGameModeStats(username);
  
  // Calculate derived stats
  const totalGames = Object.values(gameModeStats).reduce((sum, s) => sum + (s.played || 0), 0);
  const totalWins = Object.values(gameModeStats).reduce((sum, s) => sum + (s.won || 0), 0);

  const Section = ({
    id,
    title,
    icon: Icon,
    children,
    color = "indigo",
  }: {
    id: string;
    title: string;
    icon: any;
    children: React.ReactNode;
    color?: string;
  }) => {
    const isOpen = expandedSection === id;
    const colorClasses: Record<string, string> = {
      indigo: "border-indigo-500/40 bg-indigo-500/10 text-indigo-100",
      green: "border-green-500/40 bg-green-500/10 text-green-100",
      yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-100",
      blue: "border-blue-500/40 bg-blue-500/10 text-blue-100",
      purple: "border-purple-500/40 bg-purple-500/10 text-purple-100",
      orange: "border-orange-500/40 bg-orange-500/10 text-orange-100",
      red: "border-red-500/40 bg-red-500/10 text-red-100",
      cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
    };

    return (
      <div className={`rounded-xl border ${colorClasses[color]} overflow-hidden`}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpandedSection(isOpen ? null : id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedSection(isOpen ? null : id); }}
          className="w-full p-4 flex items-center justify-between hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer select-none"
          style={{ touchAction: 'manipulation' }}
        >
          <div className="flex items-center gap-3 font-semibold">
            <Icon className="w-5 h-5" />
            {title}
          </div>
          <div>
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
        {isOpen && <div className="p-4 pt-0 border-t border-white/10">{children}</div>}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4">
      {/* Header with avatar and basic info */}
      <div className="relative rounded-2xl bg-gradient-to-br from-indigo-600/30 to-purple-600/30 border border-white/20 p-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10" />
        <div className="relative flex flex-col sm:flex-row items-center gap-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center overflow-hidden border-4 border-white/20 shadow-xl">
              {profilePhoto ? (
                <img src={profilePhoto} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 sm:w-16 sm:h-16 text-white/80" />
              )}
            </div>
            {subscription?.status === "active" && (
              <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full p-1.5 shadow-lg">
                <Crown className="w-4 h-4 text-white" />
              </div>
            )}
          </div>

          {/* User info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
              {user?.username || "Guest"}
            </h1>
            <p className="text-white/60 text-sm mb-3">{user?.email || ""}</p>
            
            {/* Quick stats row */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {formatAvg(allTimeAvg)}
                </div>
                <div className="text-xs text-white/60">All-Time Avg</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {totalGames}
                </div>
                <div className="text-xs text-white/60">Games</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {allTimeStats.num180s || 0}
                </div>
                <div className="text-xs text-white/60">180s</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">
                  {allTimeStats.bestCheckout || 0}
                </div>
                <div className="text-xs text-white/60">High CO</div>
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-col gap-2">
            {subscription?.status === "active" ? (
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-sm font-semibold flex items-center gap-1">
                <Crown className="w-4 h-4" /> Premium
              </span>
            ) : (
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("ndn:change-tab", { detail: { tab: "premium" } }));
                }}
                className="px-3 py-1 rounded-full bg-gradient-to-r from-gray-600 to-gray-700 text-white text-sm font-semibold hover:from-yellow-500 hover:to-orange-500 transition-all"
              >
                Upgrade to Premium
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Overview Section */}
      <Section id="overview" title="Profile Overview" icon={User} color="indigo">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Edit Profile</span>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 text-sm transition-colors"
              >
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <button
                onClick={saveBio}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 text-sm transition-colors"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-white/60 mb-1 block">Favourite Player</label>
                <input
                  className="input w-full"
                  value={favPlayer}
                  onChange={(e) => setFavPlayer(e.target.value)}
                  placeholder="e.g., Michael van Gerwen"
                />
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Favourite Team</label>
                <input
                  className="input w-full"
                  value={favTeam}
                  onChange={(e) => setFavTeam(e.target.value)}
                  placeholder="e.g., Netherlands"
                />
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Favourite Darts</label>
                <input
                  className="input w-full"
                  value={favDarts}
                  onChange={(e) => setFavDarts(e.target.value)}
                  placeholder="e.g., Target Bolide 22g"
                />
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Profile Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => setProfilePhoto(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="text-xs text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-white/60 mb-1 block">Bio</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {favPlayer && (
                <div>
                  <div className="text-white/60 text-xs">Favourite Player</div>
                  <div className="font-medium">{favPlayer}</div>
                </div>
              )}
              {favTeam && (
                <div>
                  <div className="text-white/60 text-xs">Favourite Team</div>
                  <div className="font-medium">{favTeam}</div>
                </div>
              )}
              {favDarts && (
                <div>
                  <div className="text-white/60 text-xs">Favourite Darts</div>
                  <div className="font-medium">{favDarts}</div>
                </div>
              )}
              {bio && (
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-white/60 text-xs">Bio</div>
                  <div className="font-medium">{bio}</div>
                </div>
              )}
              {!favPlayer && !favTeam && !favDarts && !bio && (
                <div className="col-span-4 text-white/40 text-center py-4">
                  Click Edit to add your profile info
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Statistics Section */}
      <Section id="stats" title="My Statistics" icon={BarChart3} color="blue">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <Target className="w-6 h-6 mx-auto mb-1 text-blue-400" />
            <div className="text-lg font-bold">{formatAvg(allTimeAvg)}</div>
            <div className="text-xs text-white/60">All-Time Average</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-1 text-green-400" />
            <div className="text-lg font-bold">{formatAvg(rollingAvg)}</div>
            <div className="text-xs text-white/60">Rolling Average</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <Hash className="w-6 h-6 mx-auto mb-1 text-purple-400" />
            <div className="text-lg font-bold">{totalGames}</div>
            <div className="text-xs text-white/60">Games Played</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <Zap className="w-6 h-6 mx-auto mb-1 text-yellow-400" />
            <div className="text-lg font-bold">{allTimeStats.num180s || 0}</div>
            <div className="text-xs text-white/60">180s Hit</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <Star className="w-6 h-6 mx-auto mb-1 text-orange-400" />
            <div className="text-lg font-bold">{allTimeStats.bestCheckout || 0}</div>
            <div className="text-xs text-white/60">Highest Checkout</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <Percent className="w-6 h-6 mx-auto mb-1 text-cyan-400" />
            <div className="text-lg font-bold">{allTimeStats.best3?.toFixed(1) || 0}</div>
            <div className="text-xs text-white/60">Best 3-Dart Avg</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <Trophy className="w-6 h-6 mx-auto mb-1 text-amber-400" />
            <div className="text-lg font-bold">{totalWins}</div>
            <div className="text-xs text-white/60">Wins</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <Clock className="w-6 h-6 mx-auto mb-1 text-rose-400" />
            <div className="text-lg font-bold">{allTimeStats.bestLegDarts || "-"}</div>
            <div className="text-xs text-white/60">Best Leg (darts)</div>
          </div>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("ndn:change-tab", { detail: { tab: "stats" } }))}
          className="mt-4 w-full py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 text-sm transition-colors"
        >
          View Detailed Statistics →
        </button>
      </Section>

      {/* Achievements Section */}
      <Section id="achievements" title="Achievements & Badges" icon={Award} color="yellow">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {achievements.map((a) => (
            <div
              key={a.key}
              className={`relative rounded-lg p-3 text-center transition-all ${
                a.unlocked
                  ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/40"
                  : "bg-white/5 border border-white/10 opacity-50"
              }`}
            >
              <div className="text-2xl mb-1">{a.icon}</div>
              <div className="text-xs font-semibold">{a.label}</div>
              <div className="text-[10px] text-white/60 mt-1">{a.desc}</div>
              {a.unlocked && (
                <div className="absolute top-1 right-1 text-green-400">
                  <Unlock className="w-3 h-3" />
                </div>
              )}
              {!a.unlocked && (
                <div className="absolute top-1 right-1 text-white/30">
                  <Lock className="w-3 h-3" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Preferences Section */}
      <Section id="preferences" title="Game Preferences" icon={Settings} color="purple">
        <div className="space-y-4">
          {/* Favourite Double */}
          <div className="flex items-center justify-between">
            <label className="text-sm">Favourite Double</label>
            <select
              className="input w-32"
              value={favoriteDouble ?? ""}
              onChange={(e) => setFavoriteDouble(e.target.value)}
            >
              <option value="">None</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => (
                <option key={n} value={String(n)}>D{n}</option>
              ))}
            </select>
          </div>

          {/* Average Mode */}
          <div className="flex items-center justify-between">
            <label className="text-sm">Average Display</label>
            <select
              className="input w-40"
              value={avgMode}
              onChange={(e) => setAvgMode(e.target.value as any)}
            >
              <option value="3-dart">3-Dart Average</option>
              <option value="per-dart">Per-Dart Average</option>
            </select>
          </div>

          {/* Voice Caller */}
          <div className="flex items-center justify-between">
            <label className="text-sm">Voice Caller</label>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={callerEnabled}
                onChange={(e) => setCallerEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-xs text-white/60">{callerEnabled ? "On" : "Off"}</span>
            </div>
          </div>

          {callerEnabled && (
            <div className="flex items-center justify-between pl-4">
              <label className="text-sm text-white/60">Volume</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={callerVolume}
                onChange={(e) => setCallerVolume(Number(e.target.value))}
                className="w-32"
              />
            </div>
          )}

          {/* Theme */}
          <div>
            <label className="text-sm mb-2 block">Theme</label>
            <ThemeToggle />
          </div>
        </div>
      </Section>

      {/* Account & Subscription Section */}
      <Section id="account" title="Account & Subscription" icon={CreditCard} color="green">
        <div className="space-y-4">
          {/* Subscription Status */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div>
              <div className="font-medium">Subscription Status</div>
              <div className={`text-sm ${subscription?.status === "active" ? "text-green-400" : "text-white/60"}`}>
                {subscription?.status === "active" ? "Premium Active" : "Free Plan"}
              </div>
            </div>
            {subscription?.status !== "active" && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("ndn:change-tab", { detail: { tab: "premium" } }))}
                className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Upgrade
              </button>
            )}
          </div>

          {/* Wallet */}
          <div className="p-3 bg-white/5 rounded-lg">
            <div className="font-medium mb-2">Wallet Balance</div>
            <div className="text-lg font-bold">
              {wallet?.wallet?.balances
                ? Object.entries(wallet.wallet.balances)
                    .map(([c, v]: [string, any]) => `${c} ${(v / 100).toFixed(2)}`)
                    .join(" • ")
                : "£0.00"}
            </div>
          </div>

          {/* Username Change */}
          <div className="p-3 bg-white/5 rounded-lg">
            <div className="font-medium mb-2">
              Change Username 
              <span className="text-xs text-white/60 ml-2">
                ({user?.usernameChangeCount || 0}/2 free changes used)
              </span>
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="New username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                disabled={changingUsername}
              />
              <button
                onClick={async () => {
                  if (!newUsername.trim()) return;
                  setChangingUsername(true);
                  setUsernameError("");
                  try {
                    const token = localStorage.getItem("authToken");
                    const res = await apiFetch("/api/user/change-username", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({
                        email: user?.email,
                        newUsername: newUsername.trim(),
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      throw new Error(data.error || "Failed to change username");
                    }
                    setNewUsername("");
                    window.location.reload();
                  } catch (err: any) {
                    setUsernameError(err.message);
                  } finally {
                    setChangingUsername(false);
                  }
                }}
                disabled={changingUsername || !newUsername.trim()}
                className="btn bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {changingUsername ? "..." : "Change"}
              </button>
            </div>
            {usernameError && <div className="text-red-400 text-xs mt-1">{usernameError}</div>}
          </div>

          {/* Logout & Data Export */}
          <div className="flex gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("ndn:logout"))}
              className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
            <button
              onClick={() => {
                const data = {
                  username: user?.username,
                  stats: allTimeStats,
                  achievements: achievements.filter((a) => a.unlocked),
                  bio: { favPlayer, favTeam, favDarts, bio },
                  exportedAt: new Date().toISOString(),
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `ndn-profile-${user?.username || "guest"}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Export Data
            </button>
          </div>
        </div>
      </Section>

      {/* Close button if in modal */}
      {onClose && (
        <button
          onClick={onClose}
          className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium transition-colors"
        >
          Close
        </button>
      )}
    </div>
  );
}
