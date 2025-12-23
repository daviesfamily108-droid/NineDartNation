import { create } from "zustand";
import type { Ring } from "../utils/scoring";

export type PendingEntry = { label: string; value: number; ring: Ring };

type PendingVisitState = {
  darts: number;
  total: number;
  entries: PendingEntry[];
  setVisit: (entries: PendingEntry[], darts: number, total: number) => void;
  reset: () => void;
};

export const usePendingVisit = create<PendingVisitState>((set) => ({
  darts: 0,
  total: 0,
  entries: [],
  setVisit: (entries, darts, total) => set({ entries, darts, total }),
  reset: () => set({ darts: 0, total: 0, entries: [] }),
}));
