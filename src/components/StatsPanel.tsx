import { useMatch } from "../store/match.js";
import { formatAvg } from "../utils/stats.js";
import { apiFetch } from "../utils/api.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BarChart from "./BarChart.js";
import {
  getGameModeStats,
  getMonthlyAvg3,
  getMonthlyFirstNineAvg,
  getAllTimeAvg,
  getAllTimeFirstNineAvg,
  getAllTime,
  getDailyAdjustedAvg,
  getRollingAvg,
  getStatSeries,
} from "../store/profileStats.js";
import { allGames } from "../utils/games.js";
import TabPills from "./ui/TabPills.js";

export default function StatsPanel({ user }: { user?: any }) {
  const {
    players,
    inProgress,
    startingScore: _startingScore,
    newMatch: _newMatch,
  } = useMatch();
  const [family, setFamily] = useState<"x01" | "other">("x01");
  const [_playersText, _setPlayersText] = useState("Player 1, Player 2");
  const [_start, _setStart] = useState(501);
  const [selectedGameMode, setSelectedGameMode] = useState<string>("");
  // Opponent compare: select a friend to render on the second card
  const [friends, setFriends] = useState<
    Array<{ email: string; username?: string }>
  >([]);
  const [opponent, setOpponent] = useState<string>("");
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const [q, setQ] = useState<string>("");
  const [results, setResults] = useState<
    Array<{ email: string; username?: string }>
  >([]);
  const [searching, setSearching] = useState<boolean>(false);
  const searchTimerRef = useRef<number | null>(null);
  const me = String(user?.email || "").toLowerCase();
  const timeframeOptions = ["Daily", "Monthly", "All-Time"] as const;
  type TimeframeOption = (typeof timeframeOptions)[number];
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<TimeframeOption>("Daily");
  useEffect(() => {
    if (!showPicker || !me) {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch(
          `/api/friends/list?email=${encodeURIComponent(me)}`,
        );
        const j = await res.json().catch(() => ({ friends: [] }));
        if (!cancelled)
          setFriends(
            (j.friends || []) as Array<{ email: string; username?: string }>,
          );
      } catch {}
    }
    load();
    const id = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [me, showPicker]);

  // Rehydrate previously selected opponent from localStorage (per-user key)
  useEffect(() => {
    try {
      const key = me ? `ndn:stats:opponent:${me}` : "ndn:stats:opponent";
      const saved = localStorage.getItem(key);
      if (saved) setOpponent(saved);
    } catch {}
  }, [me]);

  // Persist opponent selection
  useEffect(() => {
    try {
      const key = me ? `ndn:stats:opponent:${me}` : "ndn:stats:opponent";
      if (opponent) localStorage.setItem(key, opponent);
      else localStorage.removeItem(key);
    } catch {}
  }, [opponent, me]);

  const runSearch = useCallback(
    (term: string) => {
      setQ(term);
      if (!term.trim()) {
        setResults([]);
        return;
      }
      if (!showPicker) {
        return;
      }
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = window.setTimeout(async () => {
        setSearching(true);
        try {
          const res = await apiFetch(
            `/api/friends/search?q=${encodeURIComponent(term)}`,
          );
          const j = await res.json().catch(() => ({ results: [] }));
          setResults(
            (j.results || []) as Array<{
              email: string;
              username?: string;
            }>,
          );
        } finally {
          setSearching(false);
        }
      }, 350);
    },
    [showPicker],
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // Build a score-frequency distribution for the selected family using bucketed ranges.
  const scoreBuckets = [
    { min: 0, max: 25, label: "0-25" },
    { min: 26, max: 40, label: "26-40" },
    { min: 41, max: 45, label: "41-45" },
    { min: 46, max: 55, label: "46-55" },
    { min: 56, max: 60, label: "56-60" },
    { min: 61, max: 80, label: "61-80" },
    { min: 81, max: 99, label: "81-99" },
    { min: 100, max: 119, label: "100-119" },
    { min: 120, max: 139, label: "120-139" },
    { min: 140, max: 159, label: "140-159" },
    { min: 160, max: 179, label: "160-179" },
    { min: 180, max: 180, label: "180" },
  ];
  const dist = useMemo(() => {
    const counts = scoreBuckets.map(() => 0);
    if (family === "x01") {
      for (const p of players) {
        for (const leg of p.legs) {
          for (const v of leg.visits) {
            const s = Math.max(0, Math.min(180, v.score));
            for (let i = 0; i < scoreBuckets.length; i++) {
              if (s >= scoreBuckets[i].min && s <= scoreBuckets[i].max) {
                counts[i]++;
                break;
              }
            }
          }
        }
      }
    }
    return scoreBuckets.map((b, i) => ({ label: b.label, value: counts[i] }));
  }, [players, family]);

  // Build Other Modes dataset: one bar per mode with value = played, label = mode name, and show played/won in label
  const otherData = useMemo(() => {
    const gm = getGameModeStats(allGames as unknown as string[]);
    return (allGames as unknown as string[]).map((mode) => {
      const e = gm[mode] || { played: 0, won: 0 };
      // Bar label stays short; detailed caption rendered below values via custom footer
      return { label: mode, value: e.played, extra: e.won };
    });
  }, [family]);

  const distSummary = useMemo(() => {
    if (!dist.length) return null;
    let total = 0;
    let most = dist[0];
    let least = dist[0];
    for (const entry of dist) {
      total += entry.value;
      if (entry.value > most.value) most = entry;
      if (entry.value < least.value) least = entry;
    }
    return { total, most, least };
  }, [dist]);

  const statSeries = useMemo(() => {
    if (!me) return [];
    return getStatSeries(me);
  }, [me]);

  const rollingAvg = useMemo(() => (me ? getRollingAvg(me) : 0), [me]);

  const timeframeAverage = useMemo(() => {
    if (!me) return 0;
    switch (selectedTimeframe) {
      case "Daily":
        return getDailyAdjustedAvg(me);
      case "Monthly":
        return getMonthlyAvg3(me);
      default:
        return getAllTimeAvg(me);
    }
  }, [me, selectedTimeframe]);

  const sparklineData = useMemo(() => {
    if (!statSeries.length) return [];
    const now = Date.now();
    const DAY = 1000 * 60 * 60 * 24;
    const THIRTY_DAYS = DAY * 30;
    const windowMs =
      selectedTimeframe === "Daily"
        ? DAY
        : selectedTimeframe === "Monthly"
          ? THIRTY_DAYS
          : Number.POSITIVE_INFINITY;
    const filtered = statSeries
      .filter(
        (entry) =>
          windowMs === Number.POSITIVE_INFINITY || now - entry.t <= windowMs,
      )
      .map((entry) => ({
        t: entry.t,
        value: entry.darts ? (entry.scored / entry.darts) * 3 : 0,
      }))
      .sort((a, b) => a.t - b.t);
    if (!filtered.length) return [];
    const maxPoints = 32;
    const step = Math.max(1, Math.floor(filtered.length / maxPoints));
    return filtered.filter(
      (_, idx) => idx % step === 0 || idx === filtered.length - 1,
    );
  }, [statSeries, selectedTimeframe]);

  const sparklinePath = useMemo(() => {
    if (!sparklineData.length) return "";
    const width = 220;
    const height = 40;
    const values = sparklineData.map((point) => point.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const count = sparklineData.length;
    return sparklineData
      .map((point, idx) => {
        const x = count === 1 ? width / 2 : (idx / (count - 1)) * width;
        const normalized = (point.value - minVal) / range;
        const y = height - normalized * height;
        return `${x},${y}`;
      })
      .join(" ");
  }, [sparklineData]);

  const sparklineGradientId = useMemo(
    () => `ndn-stats-sparkline-${Math.random().toString(36).slice(2)}`,
    [],
  );

  // Trigger re-render when any game-mode stat updates elsewhere
  useEffect(() => {
    const onUpdate = () => setFamily((f) => f); // noop to refresh memo
    window.addEventListener("ndn:stats-updated", onUpdate as any);
    return () =>
      window.removeEventListener("ndn:stats-updated", onUpdate as any);
  }, []);

  // Mobile layout hooks: ensure content is fully visible above bottom nav

  return (
    <div
      className="card ndn-game-shell ndn-page ndn-stats-page pb-[700px] overflow-visible"
      style={{
        background: "linear-gradient(135deg, #393053 0%, #635985 100%)",
      }}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-extrabold text-white ndn-section-title">
            Match Stats 🎯
          </h2>
          <span className="text-xs opacity-70">View 🎯</span>
        </div>
        <div className="relative z-20 mt-2">
          <TabPills
            tabs={[
              { key: "x01", label: "X01 🎯" },
              { key: "other", label: "Other Modes 🎯" },
            ]}
            active={family}
            onChange={(k) => setFamily(k as "x01" | "other")}
          />
        </div>
      </div>
      {inProgress && (
        <div className="mb-3 p-2 rounded-lg text-sm border border-amber-500/40 bg-amber-500/10 text-amber-200">
          Note: Detailed leg stats are finalized at the end of the game.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {players.map((p, idx) => {
          const playerName = p.name || `Player ${idx + 1}`;
          const all = getAllTime(playerName);
          const resolvedBest3 = Math.max(
            p.bestThreeDartAvg ?? 0,
            all.best3 ?? 0,
          );
          const resolvedWorst3 = (() => {
            const values = [p.worstThreeDartAvg ?? 0, all.worst3 ?? 0].filter(
              (v) => v > 0,
            );
            return values.length ? Math.min(...values) : 0;
          })();
          const resolvedBestLegDarts = (() => {
            const values: number[] = [];
            if (typeof p.bestNineDart?.darts === "number") {
              values.push(p.bestNineDart.darts);
            }
            if (typeof all.bestLegDarts === "number" && all.bestLegDarts > 0) {
              values.push(all.bestLegDarts);
            }
            return values.length ? Math.min(...values) : 0;
          })();
          const resolvedBestCheckout = Math.max(
            p.bestCheckout ?? 0,
            all.bestCheckout ?? 0,
          );

          return (
            <div
              key={p.id}
              className="p-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-700/6 to-indigo-900/6 shadow-sm transform transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">
                  {idx === 1 && !opponent
                    ? p.name || "Opponent"
                    : idx === 1 && opponent
                      ? opponent
                      : playerName}
                </div>
                {idx === 1 && (
                  <div className="flex gap-2 items-center overflow-x-auto py-1">
                    <button
                      className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
                      onClick={() => setShowPicker((s) => !s)}
                      title="Search user to compare"
                    >
                      Select Friend 🎯
                    </button>
                    {friends.slice(0, 6).map((f) => {
                      const lbl = f.username || f.email;
                      const active = opponent === lbl;
                      return (
                        <button
                          key={f.email}
                          className={`text-[11px] px-3 py-1 rounded-full border ${active ? "bg-indigo-500/30 border-indigo-400/50" : "bg-white/6 border-white/8 hover:bg-white/10 transform hover:-translate-y-0.5 transition-all duration-150"}`}
                          onClick={() => setOpponent(lbl)}
                          title={`Compare vs ${lbl}`}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                    {friends.length === 0 && (
                      <button
                        className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/10"
                        disabled
                      >
                        Find friends to compare
                      </button>
                    )}
                  </div>
                )}
              </div>
              {idx === 1 && showPicker && (
                <div className="mb-2 p-2 rounded-lg bg-black/20 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      className="input flex-1 py-1"
                      placeholder="Search by name or email"
                      value={q}
                      onChange={(e) => runSearch(e.target.value)}
                    />
                    <button
                      className="btn px-3 py-1 text-sm"
                      onClick={() => runSearch(q)}
                      disabled={searching}
                    >
                      Search 🎯
                    </button>
                  </div>
                  <ul className="max-h-40 overflow-auto space-y-1">
                    {results.map((r) => {
                      const lbl = r.username || r.email;
                      return (
                        <li key={r.email}>
                          <button
                            className="w-full text-left px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                            onClick={() => {
                              setOpponent(lbl);
                              setShowPicker(false);
                            }}
                          >
                            {lbl}
                          </button>
                        </li>
                      );
                    })}
                    {!results.length && (
                      <li className="text-xs opacity-70">
                        {q.trim() ? "No results" : "Type to search…"}
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {/* If second card and an opponent is selected, show their all-time stats; otherwise show the match/player stats */}
              {idx === 1 && opponent ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">Best 3-Dart</div>
                    <div className="font-semibold">
                      {formatAvg(getAllTime(opponent).best3 || 0)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">Worst 3-Dart</div>
                    <div className="font-semibold">
                      {formatAvg(getAllTime(opponent).worst3 || 0)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">
                      Best 9-Dart (fewest darts)
                    </div>
                    <div className="font-semibold">
                      {(() => {
                        const a = getAllTime(opponent);
                        return a.bestLegDarts ? `${a.bestLegDarts} darts` : "—";
                      })()}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">Best Checkout</div>
                    <div className="font-semibold">
                      {getAllTime(opponent).bestCheckout || "—"}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                    <div className="text-slate-300">
                      Averages (All-time vs Monthly)
                    </div>
                    <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                      <span>
                        3-dart: {formatAvg(getAllTimeAvg(opponent))} ·{" "}
                        {formatAvg(getMonthlyAvg3(opponent))}
                      </span>
                      <span>
                        First 9: {formatAvg(getAllTimeFirstNineAvg(opponent))} ·{" "}
                        {formatAvg(getMonthlyFirstNineAvg(opponent))}
                      </span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                    <div className="text-slate-300">All-time snapshot</div>
                    {(() => {
                      const all = getAllTime(opponent);
                      return (
                        <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                          <span>Best 3-dart: {formatAvg(all.best3 || 0)}</span>
                          <span>
                            Worst 3-dart: {formatAvg(all.worst3 || 0)}
                          </span>
                          <span>Best leg: {all.bestLegDarts || 0} darts</span>
                          <span>Best checkout: {all.bestCheckout || 0}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">Best 3-Dart</div>
                    <div className="font-semibold">
                      {formatAvg(resolvedBest3)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">Worst 3-Dart</div>
                    <div className="font-semibold">
                      {formatAvg(resolvedWorst3)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">
                      Best 9-Dart (fewest darts)
                    </div>
                    <div className="font-semibold">
                      {resolvedBestLegDarts
                        ? `${resolvedBestLegDarts} darts`
                        : "—"}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-slate-300">Best Checkout</div>
                    <div className="font-semibold">
                      {resolvedBestCheckout || "—"}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                    <div className="text-slate-300">
                      Averages (All-time vs Monthly)
                    </div>
                    <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                      <span>
                        3-dart: {formatAvg(getAllTimeAvg(playerName))} ·{" "}
                        {formatAvg(getMonthlyAvg3(playerName))}
                      </span>
                      <span>
                        First 9: {formatAvg(getAllTimeFirstNineAvg(playerName))}{" "}
                        · {formatAvg(getMonthlyFirstNineAvg(playerName))}
                      </span>
                    </div>
                  </div>
                  {/* Live current three-dart average for in-progress matches */}
                  {inProgress && (
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                      <div className="text-slate-300">
                        Current 3-Dart (live)
                      </div>
                      <div className="font-semibold">
                        {formatAvg(p.currentThreeDartAvg)}
                      </div>
                    </div>
                  )}
                  {/* All-time snapshot */}
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                    <div className="text-slate-300">All-time snapshot</div>
                    {(() => {
                      const all = getAllTime(playerName);
                      return (
                        <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                          <span>Best 3-dart: {formatAvg(all.best3 || 0)}</span>
                          <span>
                            Worst 3-dart: {formatAvg(all.worst3 || 0)}
                          </span>
                          <span>Best leg: {all.bestLegDarts || 0} darts</span>
                          <span>Best checkout: {all.bestCheckout || 0}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* Opponent compare card: if there are fewer than 2 players, show a selector to compare with a friend */}
        {players.length <= 1 && (
          <div className="p-3 rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-800/6 to-pink-800/6">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Opponent</div>
              <div className="flex flex-wrap gap-2">
                {friends.slice(0, 6).map((f) => {
                  const lbl = f.username || f.email;
                  const active = opponent === (f.username || f.email);
                  return (
                    <button
                      key={f.email}
                      className={`text-[11px] px-3 py-1 rounded-full border ${active ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent shadow-sm" : "bg-gradient-to-r from-purple-500/8 to-pink-500/8 border-white/10 hover:from-purple-500/12 hover:to-pink-500/12"}`}
                      onClick={() => setOpponent(lbl)}
                      title={`Compare vs ${lbl}`}
                    >
                      {lbl}
                    </button>
                  );
                })}
                {friends.length === 0 && (
                  <span className="text-xs opacity-70">
                    Add friends to compare stats.
                  </span>
                )}
              </div>
            </div>
            {opponent ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">Comparing to</div>
                  <div className="font-semibold">{opponent}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best 3-Dart</div>
                  <div className="font-semibold">
                    {formatAvg(getAllTimeAvg(opponent))}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Worst 3-Dart</div>
                  <div className="font-semibold">
                    {formatAvg(getAllTime(opponent).worst3 || 0)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">
                    Best 9-Dart (fewest darts)
                  </div>
                  <div className="font-semibold">
                    {(() => {
                      const a = getAllTime(opponent);
                      return a.bestLegDarts ? `${a.bestLegDarts} darts` : "—";
                    })()}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best Checkout</div>
                  <div className="font-semibold">
                    {getAllTime(opponent).bestCheckout || "—"}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">
                    Averages (All-time vs Monthly)
                  </div>
                  <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                    <span>
                      3-dart: {formatAvg(getAllTimeAvg(opponent))} ·{" "}
                      {formatAvg(getMonthlyAvg3(opponent))}
                    </span>
                    <span>
                      First 9: {formatAvg(getAllTimeFirstNineAvg(opponent))} ·{" "}
                      {formatAvg(getMonthlyFirstNineAvg(opponent))}
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">All-time snapshot</div>
                  {(() => {
                    const all = getAllTime(opponent);
                    return (
                      <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                        <span>Best 3-dart: {formatAvg(all.best3 || 0)}</span>
                        <span>Worst 3-dart: {formatAvg(all.worst3 || 0)}</span>
                        <span>Best leg: {all.bestLegDarts || 0} darts</span>
                        <span>Best checkout: {all.bestCheckout || 0}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-sm opacity-70">
                Select a friend above to compare.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Score distribution for X01 family OR Game Stats for Other Modes */}
      {family !== "other" ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
          <div className="mb-2 text-sm opacity-80">
            Score Distribution ({family.toUpperCase()}): Visits by scored points
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-slate-300">
            {timeframeOptions.map((option) => (
              <button
                key={option}
                className={`px-3 py-1 rounded-full border transition-all duration-200 ${
                  selectedTimeframe === option
                    ? "bg-white/20 border-white/40 text-white"
                    : "bg-white/5 border-white/10 text-slate-200"
                }`}
                onClick={() => setSelectedTimeframe(option)}
              >
                {option}
              </button>
            ))}
            <span className="text-xs opacity-50">sparkline window</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-300">
            <div className="rounded-lg bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] uppercase opacity-70">Average</div>
              <div className="text-lg font-semibold text-white">
                {formatAvg(timeframeAverage)}
              </div>
              <div className="text-[10px] opacity-50">{selectedTimeframe}</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] uppercase opacity-70">
                Rolling 24h
              </div>
              <div className="text-lg font-semibold text-white">
                {formatAvg(rollingAvg)}
              </div>
              <div className="text-[10px] opacity-50">live trend</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] uppercase opacity-70">Visits</div>
              <div className="text-lg font-semibold text-white">
                {distSummary ? distSummary.total : 0}
              </div>
              <div className="text-[10px] opacity-50">Match legs</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] uppercase opacity-70">Range</div>
              <div className="text-[10px] text-slate-200">
                {distSummary
                  ? `${distSummary.most.label} → ${distSummary.least.label}`
                  : "—"}
              </div>
              <div className="text-[10px] opacity-50">Most → Least</div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            {sparklinePath ? (
              <svg
                viewBox="0 0 220 40"
                className="w-full h-12"
                role="presentation"
              >
                <defs>
                  <linearGradient
                    id={sparklineGradientId}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <polyline
                  fill="none"
                  stroke={`url(#${sparklineGradientId})`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparklinePath}
                />
              </svg>
            ) : (
              <div className="text-xs text-slate-400">
                No historical trend data yet. Finish more legs to seed the
                sparkline.
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-[11px] text-slate-300/80 mb-2">
            <span>
              Most frequent:{" "}
              {distSummary
                ? `${distSummary.most.label} (${distSummary.most.value})`
                : "—"}
            </span>
            <span className="sm:text-right">
              Least frequent:{" "}
              {distSummary
                ? `${distSummary.least.label} (${distSummary.least.value})`
                : "—"}
            </span>
          </div>
          <div
            className="rounded-xl border border-indigo-500/20 p-3 min-h-[220px] transform transition-shadow duration-200 hover:shadow-lg overflow-x-auto overflow-y-hidden -mx-1 px-1"
            style={{
              background: "linear-gradient(135deg, #393053 0%, #635985 100%)",
              scrollbarColor: "#8F43EE #18122B",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <BarChart data={dist} showValues={false} />
          </div>
        </div>
      ) : selectedGameMode &&
        otherData.find((d) => d.label === selectedGameMode) ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          {(() => {
            const game = otherData.find((d) => d.label === selectedGameMode)!;
            return (
              <div>
                <div className="mb-2 text-sm opacity-80">
                  Game Stats for {game.label}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-white/10 border border-white/20">
                    <div className="text-slate-300 text-sm mb-1">
                      Games Played
                    </div>
                    <div className="text-3xl font-bold text-white">
                      {game.value}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-white/10 border border-white/20">
                    <div className="text-slate-300 text-sm mb-1">Games Won</div>
                    <div className="text-3xl font-bold text-green-400">
                      {game.extra}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-white/10 border border-white/20">
                    <div className="text-slate-300 text-sm mb-1">Win Rate</div>
                    <div className="text-3xl font-bold text-blue-400">
                      {game.value > 0
                        ? ((game.extra / game.value) * 100).toFixed(1)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {/* Other Modes: Game Mode Selector with Pills */}
      {family === "other" && (
        <div className="mt-6">
          <div className="mb-3">
            <div className="text-sm opacity-80 mb-3">
              Other Modes: Click a game to view stats
            </div>
            <div className="rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-2 flex items-center gap-2 overflow-x-auto no-scrollbar flex-wrap">
              {otherData.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setSelectedGameMode(d.label)}
                  className={`transition-all select-none whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98] ${
                    selectedGameMode === d.label
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                      : "bg-gradient-to-r from-slate-700 to-slate-600 text-white hover:from-slate-600 hover:to-slate-500"
                  }`}
                >
                  {d.label} 🎯
                </button>
              ))}
            </div>
          </div>

          {!selectedGameMode && (
            <div
              className="rounded-xl border border-indigo-500/20 p-4"
              style={{
                background: "linear-gradient(135deg, #393053 0%, #635985 100%)",
              }}
            >
              <div className="text-center text-slate-300">
                Select a game mode above to view detailed stats
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
