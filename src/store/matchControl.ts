import { create } from "zustand";

type MatchControlState = {
  paused: boolean;
  pauseEndsAt: number | null;
  pauseStartedAt?: number | null;
  pauseInitiator?: string | null;
  setPaused: (
    v: boolean,
    endsAt?: number | null,
    initiator?: string | null,
  ) => void;
};

export const useMatchControl = create<MatchControlState>((set) => ({
  paused: false,
  pauseEndsAt: null,
  pauseStartedAt: null,
  pauseInitiator: null,
  setPaused: (v, endsAt = null, initiator = null) =>
    set({
      paused: v,
      pauseEndsAt: endsAt ?? null,
      pauseStartedAt: v ? Date.now() : null,
      pauseInitiator: v ? initiator : null,
    }),
}));
