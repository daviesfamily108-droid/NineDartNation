import { create } from "zustand";
import { useAudit } from "./audit";

export type ThrowVisit = {
  darts: number;
  score: number;
  preOpenDarts?: number; // exclude from avg in Double-In
  doubleWindowDarts?: number; // darts thrown while remaining <= 50 (double-out window) in this visit
  finishedByDouble?: boolean; // visit ended the leg with a double or inner bull
  visitTotal?: number; // convenience to detect 180s and summaries
};
export type Leg = {
  visits: ThrowVisit[];
  totalScoreStart: number; // e.g., 501
  totalScoreRemaining: number;
  dartsThrown: number;
  finished: boolean;
  checkoutScore: number | null; // score taken on final visit to finish leg
  startTime: number;
  endTime?: number;
};

export type Player = {
  id: string;
  name: string;
  legsWon: number;
  legs: Leg[];
  bestThreeDartAvg?: number;
  worstThreeDartAvg?: number;
  bestNineDart?: { darts: number; timestamp: number };
  bestCheckout?: number;
  currentThreeDartAvg?: number; // Live stat that updates after every 3 darts
};

export type MatchState = {
  roomId: string;
  players: Player[];
  currentPlayerIdx: number;
  startingScore: number;
  inProgress: boolean;
  bestLegThisMatch?: { playerId: string; darts: number; timestamp: number };
};

function calcThreeDartAvg(leg: Leg): number {
  if (leg.dartsThrown === 0) return 0;
  const scored = leg.totalScoreStart - leg.totalScoreRemaining;
  return (scored / leg.dartsThrown) * 3;
}

function finishedLegStats(leg: Leg) {
  // compute 3-dart avg, was it a 9-dart (or lowest darts)?
  const avg = calcThreeDartAvg(leg);
  const isCompleted = leg.finished;
  return {
    avg,
    isCompleted,
    darts: leg.dartsThrown,
    checkout: leg.checkoutScore ?? 0,
  };
}

function updatePlayerEndOfGameStats(player: Player) {
  if (player.legs.length === 0) return;
  const avgs: number[] = [];
  let bestNine: { darts: number; timestamp: number } | undefined;
  let bestCheckout = player.bestCheckout ?? 0;

  for (const leg of player.legs) {
    if (!leg.finished) continue;
    const st = finishedLegStats(leg);
    avgs.push(st.avg);
    // best "9-dart leg" meaning fewest darts; if tie pick earliest
    if (
      !bestNine ||
      st.darts < bestNine.darts ||
      (st.darts === bestNine.darts && (leg.endTime ?? 0) < bestNine.timestamp)
    ) {
      bestNine = { darts: st.darts, timestamp: leg.endTime ?? Date.now() };
    }
    if (st.checkout > bestCheckout) bestCheckout = st.checkout;
  }

  if (avgs.length) {
    player.bestThreeDartAvg = Math.max(...avgs);
    player.worstThreeDartAvg = Math.min(...avgs);
  }
  if (bestNine) player.bestNineDart = bestNine;
  player.bestCheckout = bestCheckout;
}

export type Actions = {
  newMatch: (players: string[], startingScore: number, roomId?: string) => void;
  addVisit: (
    score: number,
    darts: number,
    meta?: {
      preOpenDarts?: number;
      doubleWindowDarts?: number;
      finishedByDouble?: boolean;
      visitTotal?: number;
    },
  ) => void;
  undoVisit: () => void;
  endLeg: (checkoutScore: number) => void;
  nextPlayer: () => void;
  endGame: () => void;
  importState: (state: MatchState) => void;
  setPlayerCurrentAverage: (playerIndex: number, avg: number) => void;
};

export const useMatch = create<MatchState & Actions>((set, get) => ({
  roomId: "",
  players: [],
  currentPlayerIdx: 0,
  startingScore: 501,
  inProgress: false,

  newMatch: (playerNames, startingScore, roomId = "") =>
    set(() => {
      const players = playerNames.map(
        (name, i) =>
          ({
            id: `${i}`,
            name,
            legsWon: 0,
            legs: [],
          }) as Player,
      );
      return {
        players,
        currentPlayerIdx: 0,
        startingScore,
        inProgress: true,
        roomId,
        bestLegThisMatch: undefined,
      };
    }),

  addVisit: (score, darts, meta) =>
    set((state) => {
      if (!state.inProgress) return state;
      const p = state.players[state.currentPlayerIdx];
      // ensure a current leg exists
      let leg = p.legs[p.legs.length - 1];
      if (!leg || leg.finished) {
        leg = {
          visits: [],
          totalScoreStart: state.startingScore,
          totalScoreRemaining: state.startingScore,
          dartsThrown: 0,
          finished: false,
          checkoutScore: null,
          startTime: Date.now(),
        };
        p.legs.push(leg);
      }
      const preRem = leg.totalScoreRemaining;
      const postRem = Math.max(0, preRem - score);
      leg.visits.push({
        darts,
        score,
        preOpenDarts: meta?.preOpenDarts,
        doubleWindowDarts: meta?.doubleWindowDarts,
        finishedByDouble: meta?.finishedByDouble,
        visitTotal: meta?.visitTotal ?? score,
      });
      leg.dartsThrown += darts;
      leg.totalScoreRemaining = postRem;
      // Audit record (best-effort; ignore failures)
      try {
        const bust = score === 0 && darts > 0 && postRem === preRem;
        const finish = postRem === 0;
        const avgPayload: any = {};
        if (leg.dartsThrown % 3 === 0) {
          const avg = calcThreeDartAvg(leg);
          if (Math.abs((p.currentThreeDartAvg ?? 0) - avg) > 0.0001) {
            p.currentThreeDartAvg = avg;
          }
          avgPayload.threeDartAvg = avg;
        }
        useAudit.getState().recordVisit("x01-match", darts, score, {
          preOpenDarts: meta?.preOpenDarts ?? 0,
          preRemaining: preRem,
          postRemaining: postRem,
          ...avgPayload,
          bust,
          finish,
        });
      } catch {}
      return { ...state };
    }),

  undoVisit: () =>
    set((state) => {
      const p = state.players[state.currentPlayerIdx];
      const leg = p.legs[p.legs.length - 1];
      if (!leg || leg.finished || leg.visits.length === 0) return state;
      const last = leg.visits.pop()!;
      leg.dartsThrown -= last.darts;
      leg.totalScoreRemaining += last.score;
      return { ...state };
    }),

  endLeg: (checkoutScore) =>
    set((state) => {
      const p = state.players[state.currentPlayerIdx];
      const leg = p.legs[p.legs.length - 1];
      if (!leg || leg.finished) return state;
      leg.finished = true;
      leg.checkoutScore = checkoutScore;
      leg.endTime = Date.now();
      if (leg.totalScoreRemaining === 0) {
        p.legsWon += 1;
        // Check if this leg is the new best for this match (fewest darts)
        const best = state.bestLegThisMatch;
        if (!best || leg.dartsThrown < best.darts) {
          state.bestLegThisMatch = {
            playerId: p.id,
            darts: leg.dartsThrown,
            timestamp: leg.endTime,
          };
        }
      }
      return { ...state };
    }),

  nextPlayer: () =>
    set((state) => ({
      ...state,
      currentPlayerIdx: (state.currentPlayerIdx + 1) % state.players.length,
    })),

  endGame: () =>
    set((state) => {
      // Only now compute best/worst 3-dart, best 9-dart, best checkout
      for (const p of state.players) updatePlayerEndOfGameStats(p);
      return { ...state, inProgress: false };
    }),

  importState: (newState) => set(() => ({ ...newState })),
  setPlayerCurrentAverage: (playerIndex, avg) =>
    set((state) => {
      const p = state.players[playerIndex];
      if (!p) return state;
      if (Math.abs((p.currentThreeDartAvg ?? 0) - avg) > 0.0001) {
        p.currentThreeDartAvg = avg;
        return { ...state };
      }
      return state;
    }),
}));
