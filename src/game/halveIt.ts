export type HalveItTarget =
  | { kind: "ANY_NUMBER" }
  | { kind: "DOUBLE"; num: number }
  | { kind: "TRIPLE"; num: number }
  | { kind: "BULL" }
  | { kind: "NUMBER"; num: number };

export type HalveItState = {
  stage: number;
  targets: HalveItTarget[];
  score: number;
  finished: boolean;
  hitThisRound: boolean;
};

export function createDefaultHalveIt(): HalveItState {
  const targets: HalveItTarget[] = [
    { kind: "NUMBER", num: 20 },
    { kind: "DOUBLE", num: 16 },
    { kind: "TRIPLE", num: 14 },
    { kind: "NUMBER", num: 19 },
    { kind: "BULL" },
    { kind: "ANY_NUMBER" },
  ];
  return { stage: 0, targets, score: 0, finished: false, hitThisRound: false };
}

export function getCurrentHalveTarget(
  state: HalveItState,
): HalveItTarget | null {
  return state.targets[state.stage] || null;
}

export function applyHalveItDart(
  state: HalveItState,
  value: number,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
  sector?: number | null,
): number {
  if (state.finished) return 0;
  const t = getCurrentHalveTarget(state);
  if (!t) return 0;
  let scored = 0;
  switch (t.kind) {
    case "NUMBER": {
      if (typeof sector === "number" && sector === t.num) {
        if (ring === "TRIPLE") scored = t.num * 3;
        else if (ring === "DOUBLE") scored = t.num * 2;
        else if (ring === "SINGLE") scored = t.num;
      } else if (
        !sector &&
        (value === t.num || value === t.num * 2 || value === t.num * 3)
      ) {
        scored = value;
      }
      if (scored > 0) state.hitThisRound = true;
      break;
    }
    case "DOUBLE": {
      if ((ring === "DOUBLE" && sector === t.num) || value === t.num * 2) {
        scored = t.num * 2;
        state.hitThisRound = true;
      }
      break;
    }
    case "TRIPLE": {
      if ((ring === "TRIPLE" && sector === t.num) || value === t.num * 3) {
        scored = t.num * 3;
        state.hitThisRound = true;
      }
      break;
    }
    case "BULL": {
      if (
        ring === "BULL" ||
        ring === "INNER_BULL" ||
        value === 25 ||
        value === 50
      ) {
        scored = ring === "INNER_BULL" || value === 50 ? 50 : 25;
        state.hitThisRound = true;
      }
      break;
    }
    case "ANY_NUMBER": {
      // any valid score counts
      if (value > 0) {
        scored = value;
        state.hitThisRound = true;
      }
      break;
    }
  }
  state.score += scored;
  return scored;
}

export function endHalveItTurn(state: HalveItState) {
  if (state.finished) return;
  if (!state.hitThisRound) {
    state.score = Math.floor(state.score / 2);
  }
  state.hitThisRound = false;
  state.stage += 1;
  if (state.stage >= state.targets.length) state.finished = true;
}
