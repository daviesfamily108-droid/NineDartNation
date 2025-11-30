import { create } from "zustand";

type MatchControlState = {
  paused: boolean;
  pauseEndsAt: number | null;
  pauseStartedAt?: number | null;
  setPaused: (v: boolean, endsAt?: number | null) => void;
};

export const useMatchControl = create<MatchControlState>((set) => ({
  paused: false,
  pauseEndsAt: null,
  pauseStartedAt: null,
  setPaused: (v, endsAt = null) =>
    set({ paused: v, pauseEndsAt: endsAt ?? null, pauseStartedAt: v ? Date.now() : null }),
}));
