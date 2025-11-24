import { create } from "zustand";

export type HeatSample = {
  playerId: string | null;
  sector: number | null;
  mult: 0 | 1 | 2 | 3;
  ring: "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL";
  ts: number;
};

type HeatState = {
  samples: HeatSample[];
  addSample: (s: HeatSample) => void;
  clear: () => void;
  export: () => HeatSample[];
};

export const useHeatmapStore = create<HeatState>((set, get) => ({
  samples: [],
  addSample: (s) => set((state) => ({ samples: [...state.samples, s] })),
  clear: () => set({ samples: [] }),
  export: () => get().samples.slice(),
}));

export default useHeatmapStore;
