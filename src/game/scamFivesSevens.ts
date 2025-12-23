/**
 * Scam, Fives, and Sevens game logic
 * All three follow a similar score-race pattern:
 * - Players accumulate scores
 * - Only certain numbers count
 * - First to reach target wins
 */

// SCAM/SCUM - Hit targets 1→20→Bull in sequence
export interface ScamState {
  targetIndex: number; // 0-20 for numbers 1-20, 21 for bull (25/50)
  darts: number;
  finished: boolean;
}

export function createScamState(): ScamState {
  return {
    targetIndex: 0,
    darts: 0,
    finished: false,
  };
}

export const SCAM_TARGETS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25,
];
export const SCAM_TARGET_NAMES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "Bull",
];

export function getScamTarget(state: ScamState): number {
  return SCAM_TARGETS[state.targetIndex];
}

export function addScamAuto(
  state: ScamState,
  value: number,
  ring?: string,
): ScamState {
  if (state.finished) return state;

  const target = getScamTarget(state);
  const targetHit =
    (ring === "SINGLE" && value === target) ||
    (ring === "DOUBLE" && value === target) ||
    (ring === "TRIPLE" && value === target) ||
    (ring === "INNER_BULL" && target === 25);

  if (!targetHit) return state;

  // Hit! Move to next target
  const newIndex = state.targetIndex + 1;
  const finished = newIndex >= SCAM_TARGETS.length;

  return {
    targetIndex: newIndex,
    darts: state.darts + 1,
    finished,
  };
}

export function addScamNumeric(state: ScamState, value: number): ScamState {
  // For manual input, assume single ring hit
  return addScamAuto(state, value, "SINGLE");
}

export function resetScam(): ScamState {
  return createScamState();
}

// FIVES - Only multiples of 5 count (5,10,15,20,25,50)
export interface FivesState {
  score: number;
  darts: number;
  finished: boolean;
  target: number; // default 50
}

export function createFivesState(target: number = 50): FivesState {
  return {
    score: 0,
    darts: 0,
    finished: false,
    target,
  };
}

export const FIVES_VALID_NUMBERS = [5, 10, 15, 20, 25, 50];

export function isFivesValid(value: number): boolean {
  return FIVES_VALID_NUMBERS.includes(value);
}

export function addFivesAuto(
  state: FivesState,
  value: number,
  ring?: string,
): FivesState {
  if (state.finished) return state;

  // Only multiples of 5 count
  if (!isFivesValid(value)) {
    return { ...state, darts: state.darts + 1 };
  }

  const newScore = state.score + value;
  const finished = newScore >= state.target;

  return {
    score: finished ? state.target : newScore,
    darts: state.darts + 1,
    finished,
    target: state.target,
  };
}

export function addFivesNumeric(state: FivesState, value: number): FivesState {
  return addFivesAuto(state, value, "SINGLE");
}

export function resetFives(target: number = 50): FivesState {
  return createFivesState(target);
}

// SEVENS - Only multiples of 7 count (7,14,21)
export interface SevensState {
  score: number;
  darts: number;
  finished: boolean;
  target: number; // default 70
}

export function createSevensState(target: number = 70): SevensState {
  return {
    score: 0,
    darts: 0,
    finished: false,
    target,
  };
}

export const SEVENS_VALID_NUMBERS = [7, 14, 21];

export function isSevensValid(value: number): boolean {
  return SEVENS_VALID_NUMBERS.includes(value);
}

export function addSevensAuto(
  state: SevensState,
  value: number,
  ring?: string,
): SevensState {
  if (state.finished) return state;

  // Only multiples of 7 count
  if (!isSevensValid(value)) {
    return { ...state, darts: state.darts + 1 };
  }

  const newScore = state.score + value;
  const finished = newScore >= state.target;

  return {
    score: finished ? state.target : newScore,
    darts: state.darts + 1,
    finished,
    target: state.target,
  };
}

export function addSevensNumeric(
  state: SevensState,
  value: number,
): SevensState {
  return addSevensAuto(state, value, "SINGLE");
}

export function resetSevens(target: number = 70): SevensState {
  return createSevensState(target);
}
