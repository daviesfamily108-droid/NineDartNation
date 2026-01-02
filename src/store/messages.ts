import { create } from "zustand";

export type DM = {
  id: string;
  from: string;
  message: string;
  ts: number;
  /** Populated for true threads (server /api/friends/thread). */
  to?: string;
  /** Legacy inbox read flag (server /api/friends/messages). */
  read?: boolean;
  /** True thread read tracking (server /api/friends/thread). */
  readBy?: string[];
};

export type DMThread = {
  other: string;
  messages: DM[];
};

type MessagesState = {
  inbox: DM[];
  unread: number;
  threads: Record<string, DMThread>;
  inGame: boolean;
  setInGame: (v: boolean) => void;
  add: (m: DM) => void;
  load: (arr: DM[]) => void;
  loadThread: (other: string, arr: DM[]) => void;
  markAllRead: () => void;
  pushThread: (other: string, m: DM) => void;
  remove: (id: string) => void;
};

const LS_INBOX = "ndn:messages:inbox";
const LS_UNREAD = "ndn:messages:unread";
const LS_THREADS = "ndn:messages:threads";

function loadInitial() {
  try {
    const raw = localStorage.getItem(LS_INBOX);
    const arr = raw ? (JSON.parse(raw) as DM[]) : [];
    const unread = Number(localStorage.getItem(LS_UNREAD) || "0") || 0;
    const rawThreads = localStorage.getItem(LS_THREADS);
    const parsedThreads = rawThreads
      ? (JSON.parse(rawThreads) as Record<string, DMThread>)
      : {};
    // sanitize
    const inbox = Array.isArray(arr)
      ? arr.filter((m) => m && typeof m.id === "string").slice(0, 200)
      : [];
    const threads =
      parsedThreads && typeof parsedThreads === "object" ? parsedThreads : {};
    return { inbox, unread, threads };
  } catch {
    return { inbox: [], unread: 0, threads: {} };
  }
}

function save(inbox: DM[], unread: number, threads?: Record<string, DMThread>) {
  try {
    localStorage.setItem(LS_INBOX, JSON.stringify(inbox));
  } catch {}
  try {
    localStorage.setItem(LS_UNREAD, String(unread));
  } catch {}
  if (threads) {
    try {
      localStorage.setItem(LS_THREADS, JSON.stringify(threads));
    } catch {}
  }
}

const initial = loadInitial();

export const useMessages = create<MessagesState>((set, get) => ({
  inbox: initial.inbox,
  unread: initial.unread,
  threads: initial.threads,
  inGame: false,
  setInGame: (v) => set({ inGame: v }),
  add: (m) =>
    set((s) => {
      const exists = s.inbox.some((x) => x.id === m.id && x.ts === m.ts);
      const list = exists ? s.inbox : [m, ...s.inbox].slice(0, 200);
      const unread = s.unread + (exists ? 0 : 1);
      save(list, unread, s.threads);
      return { inbox: list, unread };
    }),
  load: (arr) =>
    set((s) => {
      const sorted = [...arr].sort((a, b) => b.ts - a.ts).slice(0, 200);
      save(sorted, s.unread, s.threads);
      return { inbox: sorted, unread: s.unread };
    }),
  loadThread: (other, arr) =>
    set((s) => {
      const key = String(other || "").toLowerCase();
      if (!key) return s;
      const sorted = [...arr].sort((a, b) => a.ts - b.ts).slice(-400);
      const threads = {
        ...s.threads,
        [key]: { other: key, messages: sorted },
      };
      save(s.inbox, s.unread, threads);
      return { threads };
    }),
  markAllRead: () => {
    const s = get();
    save(s.inbox, 0, s.threads);
    set({ unread: 0 });
  },
  pushThread: (other, m) =>
    set((s) => {
      const key = String(other || "").toLowerCase();
      if (!key) return s;
      const existing = s.threads[key]?.messages || [];
      const next = [...existing, m].sort((a, b) => a.ts - b.ts).slice(-400);
      const threads = {
        ...s.threads,
        [key]: { other: key, messages: next },
      };
      save(s.inbox, s.unread, threads);
      return { threads };
    }),
  remove: (id) =>
    set((s) => {
      const list = s.inbox.filter((m) => m.id !== id);
      const unread = s.unread; // keep unread count stable on deletion from history
      save(list, unread, s.threads);
      return { inbox: list, unread };
    }),
}));
