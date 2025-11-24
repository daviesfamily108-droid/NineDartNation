import { create } from "zustand";

type MatchControlState = {
  paused: boolean;
  pauseEndsAt: number | null;
  setPaused: (v: boolean, endsAt?: number | null) => void;
};

export const useMatchControl = create<MatchControlState>((set) => ({
  paused: false,
  pauseEndsAt: null,
  setPaused: (v, endsAt = null) =>
    set({ paused: v, pauseEndsAt: endsAt ?? null }),
}));
