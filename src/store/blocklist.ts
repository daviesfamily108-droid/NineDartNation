import { create } from "zustand";

type BlockState = {
  blocked: Record<string, number>; // email/username -> ts
  isBlocked: (id: string) => boolean;
  block: (id: string) => void;
  unblock: (id: string) => void;
  all: () => string[];
};

const LS = "ndn:blocked:v1";

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function save(map: Record<string, number>) {
  try {
    localStorage.setItem(LS, JSON.stringify(map));
  } catch {}
}

export const useBlocklist = create<BlockState>((set, get) => ({
  blocked: load(),
  isBlocked: (id) => !!get().blocked[(id || "").toLowerCase()],
  block: (id) =>
    set((s) => {
      const map = { ...s.blocked };
      map[(id || "").toLowerCase()] = Date.now();
      save(map);
      return { blocked: map };
    }),
  unblock: (id) =>
    set((s) => {
      const map = { ...s.blocked };
      delete map[(id || "").toLowerCase()];
      save(map);
      return { blocked: map };
    }),
  all: () => Object.keys(get().blocked),
}));
