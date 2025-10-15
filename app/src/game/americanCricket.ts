export type AmCricketMark = 0 | 1 | 2 | 3
export type AmCricketNumber = 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 25

export type AmCricketState = {
  marks: Record<AmCricketNumber, AmCricketMark>
  points: number
}

export const AM_CRICKET_NUMBERS: AmCricketNumber[] = [20, 19, 18, 17, 16, 15, 14, 13, 12, 25]

export function createAmCricketState(): AmCricketState {
  const marks: any = {}
  AM_CRICKET_NUMBERS.forEach(n => { marks[n] = 0 })
  return { marks, points: 0 }
}

export function applyAmCricketDart(state: AmCricketState, value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null, opponentClosed: (n: AmCricketNumber) => boolean = () => false): number {
  let num: AmCricketNumber | null = null
  let hits = 0
  if (ring === 'BULL' || ring === 'INNER_BULL' || value === 25 || value === 50) {
    num = 25
    hits = (ring === 'INNER_BULL' || value === 50) ? 2 : 1
  } else if (typeof sector === 'number' && sector >= 12 && sector <= 20) {
    num = sector as AmCricketNumber
    if (ring === 'TRIPLE') hits = 3
    else if (ring === 'DOUBLE') hits = 2
    else hits = 1
  } else if (value) {
    for (const c of [20,19,18,17,16,15,14,13,12] as AmCricketNumber[]) {
      if (value === c) { num = c; hits = 1; break }
      if (value === c*2) { num = c; hits = 2; break }
      if (value === c*3) { num = c; hits = 3; break }
    }
    if (!num && (value === 25 || value === 50)) { num = 25; hits = (value === 50) ? 2 : 1 }
  }
  if (!num) return 0

  const before = state.marks[num]
  const toClose = Math.max(0, 3 - before)
  const toApply = Math.min(toClose, hits)
  const overflow = Math.max(0, hits - toApply)
  const after = (before + toApply) as AmCricketMark
  state.marks[num] = after > 3 ? 3 : after

  let points = 0
  if (overflow > 0 && !opponentClosed(num)) {
    if (num === 25) {
      if (ring === 'INNER_BULL') points += 50 * overflow
      else points += 25 * overflow
    } else {
      points += (num as number) * overflow
    }
  }
  state.points += points
  return points
}

export function hasClosedAllAm(state: AmCricketState): boolean {
  return AM_CRICKET_NUMBERS.every(n => (state.marks[n] || 0) >= 3)
}
