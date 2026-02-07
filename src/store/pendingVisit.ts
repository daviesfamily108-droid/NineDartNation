import { create } from "zustand";
import type { Ring } from "../utils/scoring";

export type PendingEntry = {
  label: string;
  value: number;
  ring: Ring;
  // Optional metadata (e.g., source/camera calibration) used by CameraView.
  // Kept optional so existing usages remain compatible.
  meta?: {
    calibrationValid?: boolean;
    pBoard?: { x: number; y: number } | null;
    source?: "camera" | "manual";
  };
};

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
