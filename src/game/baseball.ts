export type BaseballInning = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BaseballState = {
  inning: BaseballInning;
  score: number;
  dartsThisInning: number;
  finished: boolean;
};

export function createBaseball(): BaseballState {
  return { inning: 1, score: 0, dartsThisInning: 0, finished: false };
}

// Each inning, only the inning number scores; hits count 1, double 2, triple 3 runs (no bull scoring)
export function applyBaseballDart(
  state: BaseballState,
  value: number,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE",
  sector?: number | null,
): number {
  if (state.finished) return 0;
  let runs = 0;
  if (typeof sector === "number" && sector === state.inning) {
    if (ring === "TRIPLE") runs = 3;
    else if (ring === "DOUBLE") runs = 2;
    else runs = 1;
  } else if (
    !sector &&
    (value === state.inning ||
      value === state.inning * 2 ||
      value === state.inning * 3)
  ) {
    runs = value === state.inning * 3 ? 3 : value === state.inning * 2 ? 2 : 1;
  }
  state.score += runs;
  state.dartsThisInning += 1;
  if (state.dartsThisInning >= 3) {
    const next = (state.inning + 1) as BaseballInning;
    if (next > 9) state.finished = true;
    else {
      state.inning = next;
      state.dartsThisInning = 0;
    }
  }
  return runs;
}
