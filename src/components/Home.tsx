import { useEffect, useState } from "react";
import { useToast } from "../store/toast.js";
import { formatAvg } from "../utils/stats.js";
import { getAllTime } from "../store/profileStats.js";
import { useUserSettings } from "../store/userSettings.js";
import ProfilePanel from "./ProfilePanel.js";
import { sym } from "../ui/icons.js";
import { getApiBaseUrl } from "../utils/api.js";
import { dispatchOpenNotifications } from "../utils/events.js";

function goTab(tab: string) {
  try {
    window.dispatchEvent(
      new CustomEvent("ndn:change-tab", { detail: { tab } }),
    );
  } catch {}
}

const API_URL = getApiBaseUrl();

export default function Home({ user }: { user?: any }) {
  const [showLegal, setShowLegal] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [fact, setFact] = useState<string>("");
  const { lastOffline } = useUserSettings();
  const toast = useToast();

  const openNotifications = () => {
    dispatchOpenNotifications();
  };

  // Listen for profile open events
  useEffect(() => {
    const onOpenProfile = () => setShowProfile(true);
    window.addEventListener("ndn:open-profile", onOpenProfile as any);
    return () =>
      window.removeEventListener("ndn:open-profile", onOpenProfile as any);
  }, []);

  // Rotate a random "Did you know?" each time Home mounts
  useEffect(() => {
    const facts: string[] = [
      "The fastest televised 9-darter took roughly 25 seconds!",
      "A perfect leg (501) can be finished in nine darts.",
      "Standard dartboards are made from compressed sisal fibers.",
      "Doubles and trebles are the thin outer and middle rings.",
      "Professional oche (throw line) distance is 7 ft 9¼ in (2.37 m).",
      "“Dartitis” is a real condition affecting a player’s throwing motion.",
      "Phil Taylor holds a record number of World Championship titles.",
      "Checkout routes often end on a double—classic “double-out”.",
      "The highest 3-dart score is 180 (triple 20, triple 20, triple 20).",
    ];
    const idx = Math.floor(Math.random() * facts.length);
    setFact(facts[idx]);
  }, []);
  return (
    <div
      className={`${user?.fullAccess ? "premium-main" : ""} home-shell relative min-h-screen flex flex-col items-center justify-start overflow-hidden px-4 pb-20 pt-0 sm:pt-0`}
    >
      <div className="home-background" aria-hidden>
        <div className="home-background__gradient"></div>
        <div className="home-background__pulse home-background__pulse--one"></div>
        <div className="home-background__pulse home-background__pulse--two"></div>
      </div>

      <div className="home-content relative z-10 w-full max-w-6xl mx-auto bg-white/10 backdrop-blur-lg rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 md:p-8 lg:p-10 flex flex-col">
        <div className="home-intro space-y-3 text-center flex flex-col items-center">
          <div className="home-brand-row flex w-full items-center justify-center gap-3 text-xs sm:text-sm uppercase tracking-[0.25em] text-white/80 font-semibold flex-wrap">
            <span className="home-brand-tag">Nine Dart Nation 🎯</span>
            <button
              onClick={openNotifications}
              className="home-menu-button btn px-4 py-2 text-sm rounded-full bg-amber-400 text-slate-900 font-bold transition hover:scale-105 active:scale-95"
            >
              Notifications 🔔
            </button>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-400 to-blue-400 drop-shadow-xl leading-tight px-2">
            Welcome to Nine Dart Nation 🎯
          </h2>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-white/80 font-semibold px-2">
            Your home for competitive darts, stats, and online play.
          </p>
          <p className="text-sm sm:text-base md:text-lg text-white/60 italic px-2">
            "Where every dart counts and every player matters."
          </p>
        </div>

        {/* Did You Know */}
        {fact && (
          <div className="w-full my-4 sm:my-6 px-2 sm:px-0">
            <div className="mx-auto max-w-full sm:max-w-xl rounded-full px-4 sm:px-5 py-3 text-center text-indigo-100 bg-gradient-to-r from-indigo-600/80 to-fuchsia-600/80 shadow-md">
              <span className="font-semibold text-sm sm:text-base block sm:inline">
                Did you know? 💡
              </span>{" "}
              <span className="opacity-90 text-sm sm:text-base block sm:inline mt-1 sm:mt-0">
                {fact}
              </span>
            </div>
          </div>
        )}

        <div className="w-full max-w-4xl mx-auto mb-6 sm:mb-8">
          <div className="home-actions-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <button
              onClick={() => {
                goTab("offline");
                try {
                  window.dispatchEvent(
                    new CustomEvent("ndn:offline-format", {
                      detail: {
                        formatType: "first",
                        formatCount: Number(lastOffline?.firstTo) || 1,
                        startScore: Number(lastOffline?.x01Start) || 501,
                      },
                    }),
                  );
                } catch {}
                try {
                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent("ndn:auto-start", {
                        detail: { mode: lastOffline?.mode || "X01" },
                      }),
                    );
                  }, 50);
                } catch {}
              }}
              className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold shadow-xl hover:scale-105 active:scale-95 transition-transform duration-150 flex items-center justify-center gap-2 text-base sm:text-lg touch-manipulation"
            >
              <span aria-hidden>{sym("target")}</span>
              <span>Start New Match ⚔️</span>
            </button>
            <button
              onClick={() => goTab("stats")}
              className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold shadow-xl hover:scale-105 active:scale-95 transition-transform duration-150 flex items-center justify-center gap-2 text-base sm:text-lg touch-manipulation"
            >
              <span aria-hidden>{sym("info")}</span>
              <span>View Stats 📊</span>
            </button>
            <button
              onClick={() => goTab("online")}
              className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-green-500 to-blue-400 text-white font-bold shadow-xl hover:scale-105 active:scale-95 transition-transform duration-150 flex items-center justify-center gap-2 text-base sm:text-lg touch-manipulation"
            >
              <span aria-hidden>{sym("ok")}</span>
              <span>Join Online Match 🎯</span>
            </button>
            <button
              onClick={() => setShowProfile(true)}
              className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold shadow-xl hover:scale-105 active:scale-95 transition-transform duration-150 flex items-center justify-center gap-2 text-base sm:text-lg touch-manipulation"
            >
              <span aria-hidden>{sym("bullet")}</span>
              <span>Profile 👤</span>
            </button>
            <button
              onClick={() => {
                goTab("offline");
                try {
                  window.dispatchEvent(
                    new CustomEvent("ndn:auto-start", {
                      detail: { mode: "Double Practice" },
                    }),
                  );
                } catch {}
              }}
              className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 text-white font-bold shadow-xl hover:scale-105 active:scale-95 transition-transform duration-150 flex items-center justify-center gap-2 text-base sm:text-lg touch-manipulation"
            >
              <span aria-hidden>{sym("dash")}</span>
              <span>Practice Doubles 🎯</span>
            </button>
          </div>
          <p className="mt-3 text-center text-xs sm:text-sm text-white/60">
            Tip: rotate your phone for more room — the buttons auto-reflow.
          </p>
        </div>

        {/* Removed older stat pill grid; now using BEST/WORST grid below */}

        {/* Replaced Free/Premium cards with BEST/WORST vertical grid */}
        {(() => {
          const name = user?.username || "Player 1";
          const all = getAllTime(name);
          const isPremium = !!user?.fullAccess;
          const GRID =
            "grid grid-cols-[120px,1fr,1fr] sm:grid-cols-[160px,1fr,1fr]";
          const Row = ({
            label,
            left,
            right,
            lock,
          }: {
            label: string;
            left: string;
            right: string;
            lock?: boolean;
          }) => (
            <div
              className={`relative ${GRID} gap-2 items-center p-2 rounded-lg ${lock ? "bg-white/5 border border-white/10 overflow-hidden" : "bg-indigo-500/10 border border-indigo-500/40"} mb-2`}
            >
              <div className="text-[12px] opacity-80 pl-2 text-left">
                {label}
              </div>
              <div
                className={`text-sm font-semibold text-center ${lock ? "opacity-50 blur-[0.5px]" : ""}`}
              >
                {left}
              </div>
              <div
                className={`text-sm font-semibold text-center ${lock ? "opacity-50 blur-[0.5px]" : ""}`}
              >
                {right}
              </div>
              {lock && (
                <button
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/35 hover:bg-slate-900/45 transition"
                  onClick={async () => {
                    try {
                      const res = await fetch(
                        `${API_URL}/api/stripe/create-checkout-session`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: user.email }),
                        },
                      );
                      const data = await res.json();
                      if (data.ok && data.url) {
                        window.location.href = data.url;
                      } else if (data.error === "STRIPE_NOT_CONFIGURED") {
                        toast(
                          "Premium purchases are not available in this development environment. Please visit the production site to upgrade.",
                          { type: "error", timeout: 4000 },
                        );
                      } else {
                        toast(
                          "Failed to create checkout session. Please try again.",
                          { type: "error", timeout: 4000 },
                        );
                      }
                    } catch (err) {
                      toast("Error creating checkout. Please try again.", {
                        type: "error",
                        timeout: 4000,
                      });
                    }
                  }}
                  title="Unlock with PREMIUM"
                >
                  <span className="text-[12px] font-semibold">
                    Unlock PREMIUM ✨
                  </span>
                </button>
              )}
            </div>
          );
          return (
            <div className="w-full mt-2 rounded-2xl p-2 sm:p-3 bg-white/5 border border-white/10 overflow-x-auto">
              <div
                className={`${GRID} gap-2 mb-2 px-1 items-center min-w-[280px] sm:min-w-0`}
              >
                <div className="text-[12px] opacity-0 select-none">label</div>
                <div className="text-[12px] font-semibold text-center">
                  BEST
                </div>
                <div className="text-[12px] font-semibold text-center">
                  WORST
                </div>
              </div>
              <Row
                label="3-dart avg"
                left={formatAvg(all.best3 || 0)}
                right={formatAvg(all.worst3 || 0)}
              />
              <Row
                label="9-dart avg"
                left={formatAvg(all.bestFNAvg || 0)}
                right={formatAvg(all.worstFNAvg || 0)}
                lock={!isPremium}
              />
              <Row
                label="Leg (darts)"
                left={String(all.bestLegDarts || 0)}
                right={String(all.worstLegDarts || 0)}
                lock={!isPremium}
              />
              <Row
                label="Checkout"
                left={String(all.bestCheckout || 0)}
                right={String(all.worstCheckout || 0)}
                lock={!isPremium}
              />
            </div>
          );
        })()}

        <button
          className="mt-5 sm:mt-8 md:mt-10 px-6 sm:px-8 md:px-10 py-3 md:py-4 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150 text-base sm:text-lg md:text-xl touch-manipulation"
          onClick={() => setShowHowTo(true)}
        >
          How to Play / Getting Started 📖
        </button>
      </div>

      {/* Footer */}
      <footer
        className="w-full py-2 md:py-2 text-center text-white/80 text-xs md:text-sm font-medium absolute left-0 z-20 flex items-center justify-center gap-1 md:gap-2"
        style={{
          bottom:
            "calc(var(--ndn-bottomnav-h, 0px) + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <button
          className="flex items-center gap-1 md:gap-2 hover:text-white transition"
          onClick={() => setShowLegal(true)}
        >
          <span>©</span>
          <span style={{ letterSpacing: "0.05em" }}>NINEDARTNATION 🎯</span>
        </button>
      </footer>

      {/* Legal Dialog */}
      {showLegal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="card max-w-lg w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button
              className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold"
              onClick={() => setShowLegal(false)}
            >
              Close ✕
            </button>
            <h3 className="text-xl font-bold mb-2">Legal Information ⚖️</h3>
            <ul className="list-disc pl-5 mb-2">
              <li>
                Terms & Conditions: All users must follow fair play and site
                rules.
              </li>
              <li>
                Privacy Policy: Your data is protected and never shared without
                consent.
              </li>
              <li>
                Copyright © {new Date().getFullYear()} NINEDARTNATION 🎯. All
                rights reserved.
              </li>
              <li>Contact: support@ninedartnation.com</li>
            </ul>
            <p className="text-sm text-purple-200">
              For full legal details, please contact us or visit our legal page.
            </p>
          </div>
        </div>
      )}

      {/* How to Play Dialog */}
      {showHowTo && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="card max-w-lg w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button
              className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold"
              onClick={() => setShowHowTo(false)}
            >
              Close ✕
            </button>
            <h3 className="text-xl font-bold mb-2">Getting Started 📖</h3>
            <ul className="list-disc pl-5 mb-2">
              <li>Choose a game mode and invite friends or play solo.</li>
              <li>Track your stats and progress in the Stats tab.</li>
              <li>Join the BullseyeDartsLeague for online competition.</li>
              <li>Upgrade to PREMIUM for advanced features and modes.</li>
              <li>Need help? Visit the Settings tab for support and tips.</li>
            </ul>
            <p className="text-sm text-purple-200">
              Ready to play? Hit "Start New Match" and let the darts fly! 🚀
            </p>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close profile"
            onClick={() => setShowProfile(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative w-full max-w-4xl bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto">
              <button
                className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white transition-colors"
                aria-label="Close"
                onClick={() => setShowProfile(false)}
              >
                ✕
              </button>
              <ProfilePanel user={user} onClose={() => setShowProfile(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
