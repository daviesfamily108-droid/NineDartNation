export type ShanghaiRound =
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
  | 18
  | 19
  | 20;

export type ShanghaiState = {
  round: ShanghaiRound;
  score: number;
  finished: boolean;
  shanghaiAchieved: boolean; // single+double+triple of target in same 3-dart turn
  turnHits: { singles: number; doubles: number; triples: number };
};

export function createShanghaiState(): ShanghaiState {
  return {
    round: 1,
    score: 0,
    finished: false,
    shanghaiAchieved: false,
    turnHits: { singles: 0, doubles: 0, triples: 0 },
  };
}

export function getRoundTarget(state: ShanghaiState): number {
  return state.round;
}

// Apply one dart; returns points scored on this dart
export function applyShanghaiDart(
  state: ShanghaiState,
  value: number,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
  sector?: number | null,
): number {
  if (state.finished) return 0;
  const target = getRoundTarget(state);
  let points = 0;
  if (typeof sector === "number" && sector === target) {
    if (ring === "TRIPLE") {
      points = target * 3;
      state.turnHits.triples++;
    } else if (ring === "DOUBLE") {
      points = target * 2;
      state.turnHits.doubles++;
    } else if (ring === "SINGLE") {
      points = target * 1;
      state.turnHits.singles++;
    }
  } else if (
    !sector &&
    (value === target || value === target * 2 || value === target * 3)
  ) {
    // manual numeric entry fallback
    if (value === target * 3) {
      points = target * 3;
      state.turnHits.triples++;
    } else if (value === target * 2) {
      points = target * 2;
      state.turnHits.doubles++;
    } else if (value === target) {
      points = target;
      state.turnHits.singles++;
    }
  }
  state.score += points;
  return points;
}

// Call at end of 3-dart turn; advances round and checks Shanghai
export function endShanghaiTurn(state: ShanghaiState) {
  if (!state.finished) {
    if (
      state.turnHits.singles > 0 &&
      state.turnHits.doubles > 0 &&
      state.turnHits.triples > 0
    ) {
      state.shanghaiAchieved = true;
      state.finished = true;
      return;
    }
    const next = (state.round + 1) as ShanghaiRound;
    if (next > 20) {
      state.finished = true;
    } else {
      state.round = next;
    }
  }
  // reset per-turn hits
  state.turnHits = { singles: 0, doubles: 0, triples: 0 };
}
