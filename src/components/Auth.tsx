import { useState } from "react";
import {
  Eye,
  EyeOff,
  Trophy,
  Users,
  BarChart3,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";
import { getApiBaseUrl } from "../utils/api";

// Demo admin values removed: unused in codebase

export default function Auth({ onAuth }: { onAuth: (user: any) => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reminder, setReminder] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const API_URL = getApiBaseUrl();

  const fetchWithTimeout = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
    timeoutMs = 30000,
  ) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  async function handleSignIn(e: any) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Preload main app chunks so switching to the app is faster
    try {
      void import("./Home");
      void import("./OnlinePlay.clean");
      void import("./OfflinePlay");
      void import("./Scoreboard");
      void import("./StatsPanel");
    } catch (e) {}
    if (!username || !password) {
      setError("Username and password required.");
      setLoading(false);
      return;
    }
    try {
      console.time("Auth:signIn roundtrip");
      const res = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          username.includes("@")
            ? { email: username, password }
            : { username, password },
        ),
      });
      const data = await res.json().catch(() => ({}));
      console.timeEnd("Auth:signIn roundtrip");
      if (res.status === 429) {
        setError(
          "Too many login attempts. Please wait 60 seconds and try again.",
        );
      } else if (res.ok && data?.user && data?.token) {
        localStorage.setItem("authToken", data.token);
        onAuth(data.user);
      } else {
        setError(data?.error || "Invalid username or password.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError(
          "Login timed out. The server may be slow or unavailable. Please try again or contact support if this persists.",
        );
      } else {
        setError("Network error. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: any) {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (!email || !username || !password) {
      setError("Email, username, and password required.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.user && data?.token) {
        localStorage.setItem("authToken", data.token);
        onAuth(data.user);
      } else {
        setError(data?.error || "Signup failed.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("Signup timed out. Please try again.");
      } else {
        setError("Network error.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: any) {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (!email || !email.includes("@")) {
      setError("Enter your email address.");
      setLoading(false);
      return;
    }
    try {
      const r = await fetchWithTimeout(`${API_URL}/api/auth/send-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || "Failed to send reset email");
      setError("Password reset link sent to your email.");
    } catch (err: any) {
      setError(err?.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendUsername(e: any) {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (!email || !email.includes("@")) {
      setError("Enter your email address.");
      setLoading(false);
      return;
    }
    try {
      const r = await fetchWithTimeout(`${API_URL}/api/auth/send-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || "Failed to send username email");
      setError("Your username has been emailed to you.");
    } catch (err: any) {
      setError(err?.message || "Failed to send username email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F0C1D] p-4 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/40 tracking-tighter mb-2">
            NINE-DART-NATION 🎯
          </h1>
          <p className="text-white/40 font-medium uppercase tracking-[0.3em] text-xs">
            {mode === "signin"
              ? "Sign In 🔑"
              : mode === "signup"
                ? "Create Account ✨"
                : "Reset Password 🔄"}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 mb-6">
          {[
            { key: "signin", label: "Sign In" },
            { key: "signup", label: "Sign Up" },
            { key: "reset", label: "Reset" },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key as typeof mode)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all ${mode === option.key ? "bg-white text-indigo-600" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl">
          <form
            className="space-y-4"
            onSubmit={
              mode === "signin"
                ? handleSignIn
                : mode === "signup"
                  ? handleSignUp
                  : handleReset
            }
          >
            {(mode === "signup" || mode === "reset") && (
              <input
                className="input w-full"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            )}
            {mode !== "reset" && (
              <input
                className="input w-full"
                type="text"
                placeholder="Username or Email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            )}
            {mode !== "reset" && (
              <div className="relative">
                <input
                  className="input w-full pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  onFocus={() => setShowPassword(false)}
                  onBlur={() => setShowPassword(false)}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white"
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowPassword(true);
                  }}
                  onMouseUp={(e) => {
                    e.preventDefault();
                    setShowPassword(false);
                  }}
                  onMouseLeave={() => setShowPassword(false)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setShowPassword(true);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    setShowPassword(false);
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            )}
            {mode === "signup" && (
              <input
                className="input w-full"
                type="text"
                placeholder="Password Reminder (optional)"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
                autoComplete="off"
              />
            )}
            {error && (
              <div className="text-red-400 font-semibold text-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </div>
              ) : mode === "signin" ? (
                "Sign In 🔑"
              ) : mode === "signup" ? (
                "Sign Up ✨"
              ) : (
                "Send Reset Link 📧"
              )}
            </button>

            {mode === "signin" && (
              <>
                <button
                  type="button"
                  onClick={handleSendUsername}
                  className="w-full py-2 text-xs font-bold text-white/30 hover:text-white/60 transition-colors"
                >
                  Email me my username 📧
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.clear();
                    setError("Cache cleared. Please try logging in again.");
                  }}
                  className="w-full py-2 text-xs font-bold text-white/20 hover:text-white/40 transition-colors"
                >
                  Clear cache & retry 🔄
                </button>
              </>
            )}
          </form>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4">
          <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5">
            <h3 className="text-xl font-bold mb-3 text-white/90">
              What's inside 📦
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Users className="w-5 h-5 text-indigo-300 mt-1" />
                <div>
                  <div className="font-semibold">Online & Friends</div>
                  <div className="text-sm text-slate-200/90">
                    Challenge friends, chat, and join leagues.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-indigo-300 mt-1" />
                <div>
                  <div className="font-semibold">Deep Stats</div>
                  <div className="text-sm text-slate-200/90">
                    Track 3-dart averages, best legs, and more.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-indigo-300 mt-1" />
                <div>
                  <div className="font-semibold">Game Modes</div>
                  <div className="text-sm text-slate-200/90">
                    Start with 3 free online games upon signup. After that,
                    PREMIUM is required to play all games.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-300 mt-1" />
                <div>
                  <div className="font-semibold">Premium Perks</div>
                  <div className="text-sm text-slate-200/90">
                    Polished UI, upcoming features, and early access.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-indigo-300 mt-1" />
                <div>
                  <div className="font-semibold">Live Support</div>
                  <div className="text-sm text-slate-200/90">
                    Chat with moderators whenever you need a hand.
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
