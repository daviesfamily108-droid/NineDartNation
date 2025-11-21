export type CricketMark = 0 | 1 | 2 | 3;
export type CricketNumber = 15 | 16 | 17 | 18 | 19 | 20 | 25; // 25 is bull (outer+inner)

export type CricketState = {
  // marks per number
  marks: Record<CricketNumber, CricketMark>;
  // accumulated points when opponent hasn't closed a number
  points: number;
};

export const CRICKET_NUMBERS: CricketNumber[] = [20, 19, 18, 17, 16, 15, 25];

export function createCricketState(): CricketState {
  const marks: any = {};
  CRICKET_NUMBERS.forEach((n) => {
    marks[n] = 0;
  });
  return { marks, points: 0 };
}

// Apply a single dart to a player's cricket state
// Returns deltaPoints scored on this dart
export function applyCricketDart(
  state: CricketState,
  value: number,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
  sector?: number | null,
  opponentClosed: (n: CricketNumber) => boolean = () => false,
): number {
  // Map autoscore terms to logical hits
  let num: CricketNumber | null = null;
  let hits = 0;
  if (
    ring === "BULL" ||
    ring === "INNER_BULL" ||
    value === 25 ||
    value === 50
  ) {
    num = 25;
    hits = ring === "INNER_BULL" || value === 50 ? 2 : 1;
  } else if (
    typeof sector === "number" &&
    (sector as number) >= 15 &&
    (sector as number) <= 20
  ) {
    num = sector as CricketNumber;
    if (ring === "TRIPLE") hits = 3;
    else if (ring === "DOUBLE") hits = 2;
    else hits = 1;
  } else if (value) {
    // Fallback when only numeric score provided (manual): infer by divisibility
    const cand: CricketNumber[] = [20, 19, 18, 17, 16, 15];
    for (const c of cand) {
      if (value === c) {
        num = c;
        hits = 1;
        break;
      }
      if (value === c * 2) {
        num = c;
        hits = 2;
        break;
      }
      if (value === c * 3) {
        num = c;
        hits = 3;
        break;
      }
    }
    if (!num && (value === 25 || value === 50)) {
      num = 25;
      hits = value === 50 ? 2 : 1;
    }
  }
  if (!num) return 0;

  const before = state.marks[num];
  const remainToClose = Math.max(0, 3 - before);
  const toApply = Math.min(remainToClose, hits);
  const overflow = Math.max(0, hits - toApply);
  // Increase marks up to 3
  const after = (before + toApply) as CricketMark;
  state.marks[num] = after > 3 ? 3 : after;

  // Overflow counts as points only if opponent hasn't closed this number and number is not bull (bull scores too per standard rules when opponent open)
  let points = 0;
  if (overflow > 0 && !opponentClosed(num)) {
    if (num === 25) {
      // Overflow on bull: each extra hit beyond 3 adds 25 or 50 depending on which ring hit overflowed; approximate as 25 per hit except inner counts double. We don't know exact ring for overflow; assume 25 per extra except when ring provided as INNER_BULL and overflow>0.
      if (ring === "INNER_BULL") points += 50 * overflow;
      else points += 25 * overflow;
    } else {
      points += num * overflow;
    }
  }

  state.points += points;
  return points;
}

export function hasClosedAll(state: CricketState): boolean {
  return CRICKET_NUMBERS.every((n) => (state.marks[n] || 0) >= 3);
}

export function cricketWinner(
  self: CricketState,
  opponents: CricketState[],
): boolean {
  // Win when all closed and you have >= opponents' points
  if (!hasClosedAll(self)) return false;
  const maxOppPoints = Math.max(0, ...opponents.map((o) => o.points));
  return self.points >= maxOppPoints;
}
