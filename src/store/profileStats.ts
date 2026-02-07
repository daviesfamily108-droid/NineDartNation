import { broadcastMessage } from "../utils/broadcast.js";
import { apiFetch } from "../utils/api.js";
import type { Player, Leg } from "./match.js";

export type AllTimeTotals = {
  darts: number;
  scored: number;
  fnDarts?: number;
  fnScored?: number;
  // All-time quality metrics
  best3?: number; // highest 3-dart avg achieved in a finished leg
  worst3?: number; // lowest 3-dart avg achieved in a finished leg
  bestLegDarts?: number; // fewest darts to finish a winning leg
  bestCheckout?: number; // highest checkout score achieved
  worstCheckout?: number; // lowest checkout score achieved (positive)
  worstLegDarts?: number; // most darts in a winning leg (optional)
  bestFNAvg?: number; // best per-leg first-nine average
  worstFNAvg?: number; // worst per-leg first-nine average
  num180s?: number;
  scoreFreq?: Record<string, number>; // visit score frequency (e.g. {"60": 10, "100": 4})
};
export type StatEntry = {
  t: number;
  darts: number;
  scored: number;
  fnDarts?: number;
  fnScored?: number;
};
export type GameModeStat = { played: number; won: number };
export type GameModeStats = Record<string, GameModeStat>;

const keyFor = (name: string) => `ndn_stats_${name}`;
const keySeriesFor = (name: string) => `ndn_stats_ts_${name}`;
const keyDailyFor = (name: string) => `ndn_stats_daily_${name}`;
const keyMetaFor = (name: string) => `ndn_stats_meta_${name}`;

type StatsMeta = { updatedAt: number };
type UserStatsPayload = {
  updatedAt: number;
  allTime: AllTimeTotals;
  series: StatEntry[];
  daily: DailySnapshot | null;
  gameModes: GameModeStats;
};

const syncTimers = new Map<string, number>();
const syncInFlight = new Set<string>();

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("authToken");
  } catch {
    return null;
  }
}

function getStatsMeta(name: string): StatsMeta {
  try {
    const raw = localStorage.getItem(keyMetaFor(name));
    if (!raw) return { updatedAt: 0 };
    const parsed = JSON.parse(raw || "{}");
    return { updatedAt: Number(parsed.updatedAt) || 0 };
  } catch {
    return { updatedAt: 0 };
  }
}

function setStatsMeta(name: string, meta: StatsMeta) {
  try {
    localStorage.setItem(keyMetaFor(name), JSON.stringify(meta));
  } catch {}
}

function buildStatsPayload(name: string): UserStatsPayload {
  return {
    updatedAt: getStatsMeta(name).updatedAt || Date.now(),
    allTime: getAllTime(name),
    series: getStatSeries(name),
    daily: getDailySnapshot(name),
    gameModes: getGameModeStats(),
  };
}

async function pushStatsToServer(name: string) {
  const token = getAuthToken();
  if (!token || !name) return;
  if (syncInFlight.has(name)) return;
  syncInFlight.add(name);
  try {
    const payload = buildStatsPayload(name);
    await apiFetch("/api/user/stats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stats: payload }),
    });
  } catch {}
  syncInFlight.delete(name);
}

function scheduleStatsSync(name: string) {
  if (!name) return;
  const existing = syncTimers.get(name);
  if (existing) window.clearTimeout(existing);
  const id = window.setTimeout(() => {
    syncTimers.delete(name);
    pushStatsToServer(name);
  }, 2500);
  syncTimers.set(name, id);
}

export async function syncStatsFromServer(name: string) {
  const token = getAuthToken();
  if (!token || !name) return;
  try {
    const res = await apiFetch("/api/user/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res?.ok) return;
    const data = await res.json().catch(() => ({}));
    const remote = data?.stats as UserStatsPayload | undefined;
    if (!remote || !remote.updatedAt) return;
    const localMeta = getStatsMeta(name);
    if (remote.updatedAt > (localMeta.updatedAt || 0)) {
      setAllTime(name, remote.allTime || { darts: 0, scored: 0 }, {
        skipSync: true,
      });
      setSeries(name, remote.series || [], { skipSync: true });
      if (remote.daily)
        setDailySnapshot(name, remote.daily, { skipSync: true });
      if (remote.gameModes)
        setGameModeStats(remote.gameModes, { skipSync: true });
      setStatsMeta(name, { updatedAt: remote.updatedAt });
    } else if (localMeta.updatedAt > remote.updatedAt) {
      scheduleStatsSync(name);
    }
  } catch {}
}

export function getAllTime(name: string): AllTimeTotals {
  try {
    const raw = localStorage.getItem(keyFor(name));
    if (!raw) return { darts: 0, scored: 0 };
    const parsed = JSON.parse(raw);
    return {
      darts: Number(parsed.darts) || 0,
      scored: Number(parsed.scored) || 0,
      fnDarts: Number(parsed.fnDarts) || 0,
      fnScored: Number(parsed.fnScored) || 0,
      best3: typeof parsed.best3 === "number" ? parsed.best3 : 0,
      worst3: typeof parsed.worst3 === "number" ? parsed.worst3 : 0,
      bestLegDarts:
        typeof parsed.bestLegDarts === "number" ? parsed.bestLegDarts : 0,
      bestCheckout:
        typeof parsed.bestCheckout === "number" ? parsed.bestCheckout : 0,
      worstCheckout:
        typeof parsed.worstCheckout === "number" ? parsed.worstCheckout : 0,
      worstLegDarts:
        typeof parsed.worstLegDarts === "number" ? parsed.worstLegDarts : 0,
      bestFNAvg: typeof parsed.bestFNAvg === "number" ? parsed.bestFNAvg : 0,
      worstFNAvg: typeof parsed.worstFNAvg === "number" ? parsed.worstFNAvg : 0,
      num180s: typeof parsed.num180s === "number" ? parsed.num180s : 0,
      scoreFreq:
        parsed.scoreFreq && typeof parsed.scoreFreq === "object"
          ? (parsed.scoreFreq as Record<string, number>)
          : {},
    };
  } catch {
    return { darts: 0, scored: 0 };
  }
}

export function addScoreFrequencies(
  name: string,
  freq: Record<number, number> | Map<number, number>,
) {
  if (!name) return;
  const obj: Record<string, number> =
    freq instanceof Map
      ? Object.fromEntries(
          Array.from(freq.entries()).map(([k, v]) => [String(k), Number(v)]),
        )
      : Object.fromEntries(
          Object.entries(freq).map(([k, v]) => [String(k), Number(v)]),
        );
  const hasAny = Object.values(obj).some((v) => (Number(v) || 0) > 0);
  if (!hasAny) return;

  const prev = getAllTime(name);
  const prevFreq =
    prev.scoreFreq && typeof prev.scoreFreq === "object" ? prev.scoreFreq : {};
  const nextFreq: Record<string, number> = { ...prevFreq };
  for (const [k, v] of Object.entries(obj)) {
    const add = Number(v) || 0;
    if (add <= 0) continue;
    nextFreq[k] = (Number(nextFreq[k]) || 0) + add;
  }
  setAllTime(name, { ...prev, scoreFreq: nextFreq });
}

export function setAllTime(
  name: string,
  totals: AllTimeTotals,
  opts?: { skipSync?: boolean },
) {
  try {
    localStorage.setItem(keyFor(name), JSON.stringify(totals));
    window.dispatchEvent(
      new CustomEvent("ndn:stats-updated", { detail: { name, totals } }),
    );
    // Notify other tabs/windows so headers and panels refresh immediately
    try {
      broadcastMessage({ type: "statsUpdated", name, totals });
    } catch {}
  } catch {}
  if (!opts?.skipSync) {
    setStatsMeta(name, { updatedAt: Date.now() });
    scheduleStatsSync(name);
  }
}

// Clear all stored stats for a user (all-time totals, time-series, and daily snapshot)
export function clearAllStats(name: string) {
  try {
    localStorage.removeItem(keyFor(name));
    localStorage.removeItem(keySeriesFor(name));
    localStorage.removeItem(keyDailyFor(name));
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent("ndn:stats-updated", { detail: { name, cleared: true } }),
    );
  } catch {}
}

export function getAllTimeAvg(name: string): number {
  const { darts, scored } = getAllTime(name);
  if (!darts) return 0;
  return (scored / darts) * 3;
}

export function getAllTimeFirstNineAvg(name: string): number {
  const { fnDarts = 0, fnScored = 0 } = getAllTime(name);
  if (!fnDarts) return 0;
  return (fnScored / fnDarts) * 3;
}

// All-time quality metric getters
export function getAllTimeBestWorst(name: string): {
  best3: number;
  worst3: number;
} {
  const { best3 = 0, worst3 = 0 } = getAllTime(name);
  return { best3, worst3 };
}
export function getAllTimeBestLeg(name: string): number {
  const { bestLegDarts = 0 } = getAllTime(name);
  return bestLegDarts || 0;
}
export function getAllTimeBestCheckout(name: string): number {
  const { bestCheckout = 0 } = getAllTime(name);
  return bestCheckout || 0;
}

export function getAllTime180s(name: string): number {
  const { num180s = 0 } = getAllTime(name);
  return Number(num180s || 0);
}

// --- Per-game-mode played/won stats (local-only demo) ---
const keyGameModes = "ndn_game_mode_stats";

export function getGameModeStats(allModeKeys?: string[]): GameModeStats {
  let obj: GameModeStats = {};
  try {
    const raw = localStorage.getItem(keyGameModes);
    if (raw) obj = JSON.parse(raw);
  } catch {}
  // Ensure requested keys exist with zeros so charts are stable
  if (Array.isArray(allModeKeys)) {
    for (const k of allModeKeys) {
      if (!obj[k]) obj[k] = { played: 0, won: 0 };
    }
  }
  return obj;
}

export function setGameModeStats(
  stats: GameModeStats,
  opts?: { skipSync?: boolean },
) {
  try {
    localStorage.setItem(keyGameModes, JSON.stringify(stats));
    window.dispatchEvent(
      new CustomEvent("ndn:stats-updated", { detail: { gameModes: true } }),
    );
  } catch {}
  if (!opts?.skipSync) {
    const stored = localStorage.getItem("ndn:currentUser") || "";
    if (stored) {
      setStatsMeta(stored, { updatedAt: Date.now() });
      scheduleStatsSync(stored);
    }
  }
}

export function bumpGameMode(mode: string, won: boolean) {
  const current = getGameModeStats();
  const entry = current[mode] || { played: 0, won: 0 };
  entry.played += 1;
  if (won) entry.won += 1;
  current[mode] = entry;
  setGameModeStats(current);
}

// Time-series helpers for rolling averages
function getSeries(name: string): StatEntry[] {
  try {
    const raw = localStorage.getItem(keySeriesFor(name));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((e: any) => ({
        t: Number(e.t) || 0,
        darts: Number(e.darts) || 0,
        scored: Number(e.scored) || 0,
        fnDarts: Number(e.fnDarts) || 0,
        fnScored: Number(e.fnScored) || 0,
      }))
      .filter((e) => e.t > 0);
  } catch {
    return [];
  }
}

function setSeries(
  name: string,
  entries: StatEntry[],
  opts?: { skipSync?: boolean },
) {
  try {
    localStorage.setItem(keySeriesFor(name), JSON.stringify(entries));
    window.dispatchEvent(
      new CustomEvent("ndn:stats-updated", { detail: { name } }),
    );
  } catch {}
  if (!opts?.skipSync) {
    setStatsMeta(name, { updatedAt: Date.now() });
    scheduleStatsSync(name);
  }
}

export function getStatSeries(name: string): StatEntry[] {
  return getSeries(name);
}

function pruneOld(entries: StatEntry[], maxAgeMs: number): StatEntry[] {
  const now = Date.now();
  return entries.filter((e) => now - e.t <= maxAgeMs);
}

export function addSample(
  name: string,
  darts: number,
  scored: number,
  when: number = Date.now(),
  fnDarts?: number,
  fnScored?: number,
) {
  if (darts <= 0) return;
  const list = getSeries(name);
  const next = pruneOld(
    [...list, { t: when, darts, scored, fnDarts, fnScored }],
    1000 * 60 * 60 * 24 * 30,
  ); // keep ~30 days
  setSeries(name, next);
}

export function getRollingAvg(
  name: string,
  windowMs: number = 1000 * 60 * 60 * 24,
): number {
  const list = getSeries(name);
  if (!list.length) return 0;
  const now = Date.now();
  let darts = 0,
    scored = 0;
  for (const e of list) {
    if (now - e.t <= windowMs) {
      darts += e.darts;
      scored += e.scored;
    }
  }
  if (darts <= 0) return 0;
  return (scored / darts) * 3;
}

export function getRollingFirstNineAvg(
  name: string,
  windowMs: number = 1000 * 60 * 60 * 24 * 30,
): number {
  const list = getSeries(name);
  if (!list.length) return 0;
  const now = Date.now();
  let darts = 0,
    scored = 0;
  for (const e of list) {
    if (now - e.t <= windowMs) {
      darts += e.fnDarts || 0;
      scored += e.fnScored || 0;
    }
  }
  if (darts <= 0) return 0;
  return (scored / darts) * 3;
}

// Daily adjusted average: recompute from last 24h at most once per 24h and persist the last value
type DailySnapshot = { avg: number; ts: number };

function getDailySnapshot(name: string): DailySnapshot | null {
  try {
    const raw = localStorage.getItem(keyDailyFor(name));
    if (!raw) return null;
    const j = JSON.parse(raw);
    return { avg: Number(j.avg) || 0, ts: Number(j.ts) || 0 };
  } catch {
    return null;
  }
}

function setDailySnapshot(
  name: string,
  snap: DailySnapshot,
  opts?: { skipSync?: boolean },
) {
  try {
    localStorage.setItem(keyDailyFor(name), JSON.stringify(snap));
    window.dispatchEvent(
      new CustomEvent("ndn:stats-updated", { detail: { name } }),
    );
  } catch {}
  if (!opts?.skipSync) {
    setStatsMeta(name, { updatedAt: Date.now() });
    scheduleStatsSync(name);
  }
}

export function getDailyAdjustedAvg(name: string): number {
  const snap = getDailySnapshot(name);
  const now = Date.now();
  const DAY = 1000 * 60 * 60 * 24;
  if (snap && now - snap.ts < DAY) return snap.avg;
  // Need to compute a new daily value from the last 24h of samples
  const ra = getRollingAvg(name, DAY);
  const next: DailySnapshot = { avg: ra, ts: now };
  setDailySnapshot(name, next);
  return ra;
}

// Convenience helpers for monthly (last ~30 days) averages
export function getMonthlyAvg3(name: string): number {
  const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
  const list = getSeries(name);
  if (!list.length) return 0;
  const now = Date.now();
  // Prefer match-aggregated entries (those with fnDarts defined) to avoid double counting with per-visit samples
  const windowed = list.filter((e) => now - e.t <= THIRTY_DAYS);
  const matchOnly = windowed.filter((e) => typeof e.fnDarts === "number");
  const use = matchOnly.length ? matchOnly : windowed;
  let darts = 0,
    scored = 0;
  for (const e of use) {
    darts += e.darts;
    scored += e.scored;
  }
  if (darts <= 0) return 0;
  return (scored / darts) * 3;
}
export function getMonthlyFirstNineAvg(name: string): number {
  const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
  return getRollingFirstNineAvg(name, THIRTY_DAYS);
}

// Update all players' all-time totals given a finished match roster
export function addMatchToAllTime(
  players: Player[],
  opts?: { recordSeries?: boolean },
) {
  const recordSeries = opts?.recordSeries !== false;
  // Resolve the signed-in username (if present) to map generic aliases like "You"
  // back to the user so header stats update correctly.
  let canonicalUser: string | null = null;
  try {
    const stored = localStorage.getItem("ndn:currentUser");
    if (stored) canonicalUser = stored;
    else if (typeof (window as any)?.ndnCurrentUser === "string")
      canonicalUser = (window as any).ndnCurrentUser;
  } catch {}

  for (const raw of players) {
    // Normalize player name: map "You" (and blank) to canonical user when known
    const p: Player = { ...raw };
    if (canonicalUser) {
      const n = (p.name || "").trim();
      if (!n || n.toLowerCase() === "you") p.name = canonicalUser;
    }
    // Sum over finished legs
    let darts = 0;
    let scored = 0;
    let fnDarts = 0;
    let fnScored = 0;
    let matchStart = Number.POSITIVE_INFINITY;
    let matchEnd = 0;
    // Per-match quality metrics
    let matchBest3 = 0;
    let matchWorst3 = 0;
    let matchBestLegDarts = 0; // track fewest darts on a winning leg only
    let matchBestCheckout = 0;
    let matchWorstCheckout = 0;
    let matchWorstLegDarts = 0; // most darts on a winning leg
    let matchBestFNAvg = 0;
    let matchWorstFNAvg = 0;
    let match180s = 0;
    const scoreFreq = new Map<number, number>();
    for (const leg of p.legs) {
      if (!leg.finished) continue;
      darts += leg.dartsThrown;
      scored += Math.max(0, leg.totalScoreStart - leg.totalScoreRemaining);
      // First nine darts aggregation (or fewer if leg ended earlier)
      const { d: legFnDarts, s: legFnScored } = sumFirstNine(leg);
      fnDarts += legFnDarts;
      fnScored += legFnScored;
      // Quality metrics per leg
      const legDarts = Math.max(0, leg.dartsThrown);
      const legScored = Math.max(
        0,
        leg.totalScoreStart - leg.totalScoreRemaining,
      );
      const legAvg = legDarts > 0 ? (legScored / legDarts) * 3 : 0;
      const legFNAvg = legFnDarts > 0 ? (legFnScored / legFnDarts) * 3 : 0;
      if (legAvg > 0) {
        matchBest3 = Math.max(matchBest3, legAvg);
        matchWorst3 =
          matchWorst3 === 0 ? legAvg : Math.min(matchWorst3, legAvg);
      }
      if (legFNAvg > 0) {
        matchBestFNAvg = Math.max(matchBestFNAvg, legFNAvg);
        matchWorstFNAvg =
          matchWorstFNAvg === 0
            ? legFNAvg
            : Math.min(matchWorstFNAvg, legFNAvg);
      }
      const wasCheckout = leg.totalScoreRemaining === 0;
      if (wasCheckout) {
        if (matchBestLegDarts === 0 || legDarts < matchBestLegDarts)
          matchBestLegDarts = legDarts;
        if (matchWorstLegDarts === 0 || legDarts > matchWorstLegDarts)
          matchWorstLegDarts = legDarts;
        const co =
          typeof leg.checkoutScore === "number" ? leg.checkoutScore : 0;
        if (co > matchBestCheckout) matchBestCheckout = co;
        if (co > 0) {
          matchWorstCheckout =
            matchWorstCheckout === 0 ? co : Math.min(matchWorstCheckout, co);
        }
      }
      // Track time window for this match (for rolling stats backfill)
      const legStart = Number(leg.startTime || 0);
      const legEnd = Number(leg.endTime || 0) || legStart || Date.now();
      if (legStart > 0) matchStart = Math.min(matchStart, legStart);
      if (legEnd > 0) matchEnd = Math.max(matchEnd, legEnd);
      // Count 180s from visits
      try {
        for (const v of leg.visits || []) {
          if (Number(v.score || 0) === 180) match180s += 1;
          const s = Math.max(0, Math.min(180, Number(v.score || 0)));
          scoreFreq.set(s, (scoreFreq.get(s) ?? 0) + 1);
        }
      } catch {}
    }
    if (darts > 0) {
      const prev = getAllTime(p.name);
      const next: AllTimeTotals = {
        darts: prev.darts + darts,
        scored: prev.scored + scored,
        fnDarts: (prev.fnDarts || 0) + fnDarts,
        fnScored: (prev.fnScored || 0) + fnScored,
        best3: Math.max(prev.best3 || 0, matchBest3 || 0),
        // For worst3, treat 0 as "unset"; choose the min positive across history
        worst3: (() => {
          const prior = prev.worst3 || 0;
          if (prior === 0) return matchWorst3 || 0;
          if (matchWorst3 === 0) return prior;
          return Math.min(prior, matchWorst3);
        })(),
        // Fewest darts on winning leg; 0 means no winning legs recorded yet
        bestLegDarts: (() => {
          const prior = prev.bestLegDarts || 0;
          if (prior === 0) return matchBestLegDarts || 0;
          if (matchBestLegDarts === 0) return prior;
          return Math.min(prior, matchBestLegDarts);
        })(),
        bestCheckout: Math.max(prev.bestCheckout || 0, matchBestCheckout || 0),
        worstCheckout: (() => {
          const prior = prev.worstCheckout || 0;
          if (prior === 0) return matchWorstCheckout || 0;
          if (matchWorstCheckout === 0) return prior;
          return Math.min(prior, matchWorstCheckout);
        })(),
        worstLegDarts: (() => {
          const prior = prev.worstLegDarts || 0;
          if (prior === 0) return matchWorstLegDarts || 0;
          if (matchWorstLegDarts === 0) return prior;
          return Math.max(prior, matchWorstLegDarts);
        })(),
        bestFNAvg: Math.max(prev.bestFNAvg || 0, matchBestFNAvg || 0),
        worstFNAvg: (() => {
          const prior = prev.worstFNAvg || 0;
          if (prior === 0) return matchWorstFNAvg || 0;
          if (matchWorstFNAvg === 0) return prior;
          return Math.min(prior, matchWorstFNAvg);
        })(),
        num180s: (prev.num180s || 0) + (match180s || 0),
        scoreFreq: (() => {
          const prevFreq =
            prev.scoreFreq && typeof prev.scoreFreq === "object"
              ? prev.scoreFreq
              : {};
          const nextFreq: Record<string, number> = { ...prevFreq };
          for (const [k, v] of scoreFreq.entries()) {
            if (v <= 0) continue;
            const key = String(k);
            nextFreq[key] = (Number(nextFreq[key]) || 0) + v;
          }
          return nextFreq;
        })(),
      };
      setAllTime(p.name, next);
      // Also add a time-series sample for rolling averages (avoid double
      // counting if per-visit samples were recorded during this match).
      if (recordSeries) {
        const series = getSeries(p.name);
        const start = Number.isFinite(matchStart) ? matchStart : Date.now();
        const end = matchEnd > 0 ? matchEnd : start;
        const pad = 5000;
        const hasSamplesInWindow = series.some(
          (e) => e.t >= start - pad && e.t <= end + pad,
        );
        if (!hasSamplesInWindow) {
          addSample(p.name, darts, scored, end, fnDarts, fnScored);
        }
      }
    }
  }
}

// Helper: sum points and darts for the first 9 darts of a leg (or fewer if finished earlier)
function sumFirstNine(leg: Leg): { d: number; s: number } {
  let remain = Math.min(9, leg.dartsThrown);
  if (remain <= 0) return { d: 0, s: 0 };
  let s = 0;
  for (const v of leg.visits) {
    if (remain <= 0) break;
    const take = Math.min(remain, v.darts);
    // Pro-rate score if partial darts from a visit are included
    if (take === v.darts) s += v.score;
    else s += Math.round((v.score / v.darts) * take);
    remain -= take;
  }
  const d = Math.min(9, leg.dartsThrown);
  return { d, s };
}
