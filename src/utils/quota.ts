// Simple localStorage-based weekly quota for free online games
// 3 free online games per week per user (by username). Premium users are exempt.

const KEY = (user: string) => `ndn_online_quota_${user}`;

type Usage = {
  week: string; // e.g., YYYY-WW
  used: number;
};

function getWeekId(d = new Date()): string {
  // ISO week-numbering year and week
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  const week = String(weekNo).padStart(2, "0");
  return `${date.getUTCFullYear()}-${week}`;
}

export function getOnlineUsage(user: string): Usage {
  try {
    const raw = localStorage.getItem(KEY(user));
    if (!raw) return { week: getWeekId(), used: 0 };
    const u = JSON.parse(raw);
    const currentWeek = getWeekId();
    if (!u.week || u.week !== currentWeek)
      return { week: currentWeek, used: 0 };
    return { week: String(u.week), used: Number(u.used) || 0 };
  } catch {
    return { week: getWeekId(), used: 0 };
  }
}

export function setOnlineUsage(user: string, usage: Usage) {
  try {
    localStorage.setItem(KEY(user), JSON.stringify(usage));
  } catch {}
}

export function incOnlineUsage(user: string, cap = 3): Usage {
  const currentWeek = getWeekId();
  const u = getOnlineUsage(user);
  const next: Usage = {
    week: currentWeek,
    used: (u.week === currentWeek ? u.used : 0) + 1,
  };
  // clamp to cap, though we still store the number
  setOnlineUsage(user, next);
  return next;
}

export function getFreeRemaining(user: string, cap = 3): number {
  const u = getOnlineUsage(user);
  return Math.max(0, cap - (u.used || 0));
}
