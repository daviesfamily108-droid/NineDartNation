export type HighLowState = {
  round: number;
  score: number;
  target: "HIGH" | "LOW";
  finished: boolean;
};

export function createHighLow(): HighLowState {
  return { round: 1, score: 0, target: "HIGH", finished: false };
}

export function applyHighLowDart(
  state: HighLowState,
  value: number,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
  sector?: number | null,
): number {
  if (state.finished) return 0;
  // For simplicity: when target is HIGH, count only scores >= 20 (any ring) and bull as 50
  // When LOW, count only scores <= 10 (any ring) and bull does not count
  let scored = 0;
  if (state.target === "HIGH") {
    if (ring === "INNER_BULL") scored = 50;
    else if (typeof sector === "number") {
      const mult = ring === "TRIPLE" ? 3 : ring === "DOUBLE" ? 2 : 1;
      const v = sector * mult;
      if (sector >= 20) scored = v;
    } else {
      // manual numeric fallback
      if (value >= 40) scored = value;
    }
  } else {
    if (typeof sector === "number") {
      const mult = ring === "TRIPLE" ? 3 : ring === "DOUBLE" ? 2 : 1;
      const v = sector * mult;
      if (sector <= 10) scored = v;
    } else {
      if (value > 0 && value <= 30) scored = value;
    }
  }
  state.score += scored;
  return scored;
}

export function endHighLowTurn(state: HighLowState) {
  if (state.finished) return;
  state.round += 1;
  if (state.round > 10) {
    state.finished = true;
    return;
  }
  state.target = state.target === "HIGH" ? "LOW" : "HIGH";
}
