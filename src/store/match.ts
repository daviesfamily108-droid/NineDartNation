import { create } from 'zustand'

export type ThrowVisit = { darts: number; score: number } // e.g., 3 darts, scored 100
export type Leg = {
  visits: ThrowVisit[]
  totalScoreStart: number // e.g., 501
  totalScoreRemaining: number
  dartsThrown: number
  finished: boolean
  checkoutScore: number | null // score taken on final visit to finish leg
  startTime: number
  endTime?: number
}

export type Player = {
  id: string
  name: string
  legsWon: number
  legs: Leg[]
  bestThreeDartAvg?: number
  worstThreeDartAvg?: number
  bestNineDart?: { darts: number; timestamp: number }
  bestCheckout?: number
}

export type MatchState = {
  roomId: string
  players: Player[]
  currentPlayerIdx: number
  startingScore: number
  inProgress: boolean
  bestLegThisMatch?: { playerId: string; darts: number; timestamp: number }
}

function calcThreeDartAvg(leg: Leg): number {
  if (leg.dartsThrown === 0) return 0
  const scored = leg.totalScoreStart - leg.totalScoreRemaining
  return (scored / leg.dartsThrown) * 3
}

function finishedLegStats(leg: Leg) {
  // compute 3-dart avg, was it a 9-dart (or lowest darts)?
  const avg = calcThreeDartAvg(leg)
  const isCompleted = leg.finished
  return { avg, isCompleted, darts: leg.dartsThrown, checkout: leg.checkoutScore ?? 0 }
}

function updatePlayerEndOfGameStats(player: Player) {
  if (player.legs.length === 0) return
  const avgs: number[] = []
  let bestNine: { darts: number; timestamp: number } | undefined
  let bestCheckout = player.bestCheckout ?? 0

  for (const leg of player.legs) {
    if (!leg.finished) continue
    const st = finishedLegStats(leg)
    avgs.push(st.avg)
    // best "9-dart leg" meaning fewest darts; if tie pick earliest
    if (!bestNine || st.darts < bestNine.darts || (st.darts === bestNine.darts && (leg.endTime ?? 0) < bestNine.timestamp)) {
      bestNine = { darts: st.darts, timestamp: leg.endTime ?? Date.now() }
    }
    if (st.checkout > bestCheckout) bestCheckout = st.checkout
  }

  if (avgs.length) {
    player.bestThreeDartAvg = Math.max(...avgs)
    player.worstThreeDartAvg = Math.min(...avgs)
  }
  if (bestNine) player.bestNineDart = bestNine
  player.bestCheckout = bestCheckout
}

export type Actions = {
  newMatch: (players: string[], startingScore: number, roomId?: string) => void
  addVisit: (score: number, darts: number) => void
  undoVisit: () => void
  endLeg: (checkoutScore: number) => void
  nextPlayer: () => void
  endGame: () => void
  importState: (state: MatchState) => void
}

export const useMatch = create<MatchState & Actions>((set, get) => ({
  roomId: '',
  players: [],
  currentPlayerIdx: 0,
  startingScore: 501,
  inProgress: false,

  newMatch: (playerNames, startingScore, roomId='') => set(() => {
    const players = playerNames.map((name, i) => ({
      id: `${i}`,
      name,
      legsWon: 0,
      legs: [],
    } as Player))
    return { players, currentPlayerIdx: 0, startingScore, inProgress: true, roomId, bestLegThisMatch: undefined }
  }),

  addVisit: (score, darts) => set((state) => {
    if (!state.inProgress) return state
    const p = state.players[state.currentPlayerIdx]
    // ensure a current leg exists
    let leg = p.legs[p.legs.length-1]
    if (!leg || leg.finished) {
      leg = {
        visits: [], totalScoreStart: state.startingScore, totalScoreRemaining: state.startingScore,
        dartsThrown: 0, finished: false, checkoutScore: null, startTime: Date.now()
      }
      p.legs.push(leg)
    }
    leg.visits.push({ darts, score })
    leg.dartsThrown += darts
    leg.totalScoreRemaining = Math.max(0, leg.totalScoreRemaining - score)
    return { ...state }
  }),

  undoVisit: () => set((state) => {
    const p = state.players[state.currentPlayerIdx]
    const leg = p.legs[p.legs.length-1]
    if (!leg || leg.finished || leg.visits.length === 0) return state
    const last = leg.visits.pop()!
    leg.dartsThrown -= last.darts
    leg.totalScoreRemaining += last.score
    return { ...state }
  }),

  endLeg: (checkoutScore) => set((state) => {
    const p = state.players[state.currentPlayerIdx]
    const leg = p.legs[p.legs.length-1]
    if (!leg || leg.finished) return state
    leg.finished = true
    leg.checkoutScore = checkoutScore
    leg.endTime = Date.now()
    if (leg.totalScoreRemaining === 0) {
      p.legsWon += 1
      // Check if this leg is the new best for this match (fewest darts)
      const best = state.bestLegThisMatch
      if (!best || (leg.dartsThrown < best.darts)) {
        state.bestLegThisMatch = { playerId: p.id, darts: leg.dartsThrown, timestamp: leg.endTime }
      }
    }
    return { ...state }
  }),

  nextPlayer: () => set((state) => ({
    ...state,
    currentPlayerIdx: (state.currentPlayerIdx + 1) % state.players.length
  })),

  endGame: () => set((state) => {
    // Only now compute best/worst 3-dart, best 9-dart, best checkout
    for (const p of state.players) updatePlayerEndOfGameStats(p)
    return { ...state, inProgress: false }
  }),

  importState: (newState) => set(() => ({ ...newState })),
}))
