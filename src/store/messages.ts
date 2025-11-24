import { create } from "zustand";

export type DM = { id: string; from: string; message: string; ts: number };

type MessagesState = {
  inbox: DM[];
  unread: number;
  inGame: boolean;
  setInGame: (v: boolean) => void;
  add: (m: DM) => void;
  load: (arr: DM[]) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
};

const LS_INBOX = "ndn:messages:inbox";
const LS_UNREAD = "ndn:messages:unread";

function loadInitial() {
  try {
    const raw = localStorage.getItem(LS_INBOX);
    const arr = raw ? (JSON.parse(raw) as DM[]) : [];
    const unread = Number(localStorage.getItem(LS_UNREAD) || "0") || 0;
    // sanitize
    const inbox = Array.isArray(arr)
      ? arr.filter((m) => m && typeof m.id === "string").slice(0, 200)
      : [];
    return { inbox, unread };
  } catch {
    return { inbox: [], unread: 0 };
  }
}

function save(inbox: DM[], unread: number) {
  try {
    localStorage.setItem(LS_INBOX, JSON.stringify(inbox));
  } catch {}
  try {
    localStorage.setItem(LS_UNREAD, String(unread));
  } catch {}
}

const initial = loadInitial();

export const useMessages = create<MessagesState>((set, get) => ({
  inbox: initial.inbox,
  unread: initial.unread,
  inGame: false,
  setInGame: (v) => set({ inGame: v }),
  add: (m) =>
    set((s) => {
      const exists = s.inbox.some((x) => x.id === m.id && x.ts === m.ts);
      const list = exists ? s.inbox : [m, ...s.inbox].slice(0, 200);
      const unread = s.unread + (exists ? 0 : 1);
      save(list, unread);
      return { inbox: list, unread };
    }),
  load: (arr) =>
    set((s) => {
      const sorted = [...arr].sort((a, b) => b.ts - a.ts).slice(0, 200);
      save(sorted, s.unread);
      return { inbox: sorted, unread: s.unread };
    }),
  markAllRead: () => {
    const s = get();
    save(s.inbox, 0);
    set({ unread: 0 });
  },
  remove: (id) =>
    set((s) => {
      const list = s.inbox.filter((m) => m.id !== id);
      const unread = s.unread; // keep unread count stable on deletion from history
      save(list, unread);
      return { inbox: list, unread };
    }),
}));
