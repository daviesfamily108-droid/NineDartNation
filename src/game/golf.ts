export type GolfHole =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18;

// Simple darts golf: each hole targets a predefined number (map); par is 2 throws; score is number of darts used to hit the target ring.
// For simplicity, we count a hole complete on first valid hit (single/double/triple of the target), score increments by darts used.

export const GOLF_TARGETS: Record<GolfHole, number> = {
  1: 5,
  2: 20,
  3: 1,
  4: 18,
  5: 4,
  6: 13,
  7: 6,
  8: 10,
  9: 15,
  10: 2,
  11: 17,
  12: 3,
  13: 19,
  14: 7,
  15: 16,
  16: 8,
  17: 11,
  18: 14,
};

export type GolfState = {
  hole: GolfHole;
  strokes: number;
  dartsThisHole: number;
  finished: boolean;
};

export function createGolf(): GolfState {
  return { hole: 1, strokes: 0, dartsThisHole: 0, finished: false };
}

export function applyGolfDart(
  state: GolfState,
  value: number,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE",
  sector?: number | null,
): boolean {
  if (state.finished) return false;
  const target = GOLF_TARGETS[state.hole];
  state.dartsThisHole += 1;
  const hit =
    (typeof sector === "number" &&
      sector === target &&
      (ring === "SINGLE" || ring === "DOUBLE" || ring === "TRIPLE")) ||
    (!sector &&
      (value === target || value === target * 2 || value === target * 3));
  if (hit) {
    state.strokes += state.dartsThisHole;
    // advance to next hole
    const next = (state.hole + 1) as GolfHole;
    if (next > 18) state.finished = true;
    else {
      state.hole = next;
      state.dartsThisHole = 0;
    }
    return true;
  }
  // If not finished and took 3 darts, score 3 and advance hole
  if (state.dartsThisHole >= 3) {
    state.strokes += 3;
    const next = (state.hole + 1) as GolfHole;
    if (next > 18) state.finished = true;
    else {
      state.hole = next;
      state.dartsThisHole = 0;
    }
  }
  return false;
}
