import { create } from "zustand";
import { useAudit } from "./audit";
import { broadcastMessage } from "../utils/broadcast";

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
  // Exclude any 'preOpenDarts' from the divisor (these darts are thrown before
  // scoring opens in double-in games and should not count toward the average).
  const totalPreOpen = (leg.visits || []).reduce(
    (acc, v) => acc + (v.preOpenDarts || 0),
    0,
  );
  const dartsForAvg = Math.max(0, leg.dartsThrown - totalPreOpen);
  if (dartsForAvg === 0) return 0;
  const scored = leg.totalScoreStart - leg.totalScoreRemaining;
  return (scored / dartsForAvg) * 3;
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
      console.debug("[useMatch] newMatch", playerNames, startingScore, roomId);
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
      console.debug("[useMatch] addVisit", {
        score,
        darts,
        inProgress: state.inProgress,
        currentPlayerIdx: state.currentPlayerIdx,
        players: state.players.length,
      });
      if (!state.inProgress) return state;
      const playerIdx = state.currentPlayerIdx;
      const oldPlayer = state.players[playerIdx];
      // ensure a current leg exists
      const oldLeg = oldPlayer.legs[oldPlayer.legs.length - 1];
      let leg: Leg;
      let legsArr: Leg[];
      if (!oldLeg || oldLeg.finished) {
        leg = {
          visits: [],
          totalScoreStart: state.startingScore,
          totalScoreRemaining: state.startingScore,
          dartsThrown: 0,
          finished: false,
          checkoutScore: null,
          startTime: Date.now(),
        };
        legsArr = [...oldPlayer.legs, leg];
      } else {
        leg = { ...oldLeg, visits: [...oldLeg.visits] };
        legsArr = [...oldPlayer.legs.slice(0, -1), leg];
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
      // Create new player object with updated leg and currentThreeDartAvg
      const p: Player = { ...oldPlayer, legs: legsArr };
      // Audit record (best-effort; ignore failures)
      try {
        const bust = score === 0 && darts > 0 && postRem === preRem;
        const finish = postRem === 0;
        const avgPayload: any = {};
        // Exclude pre-open darts from the divisor used for averages
        const totalPreOpen = (leg.visits || []).reduce(
          (acc, v) => acc + (v.preOpenDarts || 0),
          0,
        );
        const dartsForAvg = Math.max(0, leg.dartsThrown - totalPreOpen);
        if (dartsForAvg > 0 && (dartsForAvg % 3 === 0 || finish)) {
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
      try {
        // notify other windows a visit occurred
        broadcastMessage({
          type: "visit",
          score,
          darts,
          playerIdx: state.currentPlayerIdx,
          ts: Date.now(),
        });
      } catch {}
      // Create new players array with the updated player to trigger re-render
      const newPlayers = state.players.map((pl, i) =>
        i === playerIdx ? p : pl,
      );
      return { ...state, players: newPlayers };
    }),

  undoVisit: () =>
    set((state) => {
      const playerIdx = state.currentPlayerIdx;
      const oldPlayer = state.players[playerIdx];
      const oldLeg = oldPlayer.legs[oldPlayer.legs.length - 1];
      if (!oldLeg || oldLeg.finished || oldLeg.visits.length === 0)
        return state;
      const newVisits = oldLeg.visits.slice(0, -1);
      const last = oldLeg.visits[oldLeg.visits.length - 1];
      const newLeg: Leg = {
        ...oldLeg,
        visits: newVisits,
        dartsThrown: oldLeg.dartsThrown - last.darts,
        totalScoreRemaining: oldLeg.totalScoreRemaining + last.score,
      };
      const newLegs = [...oldPlayer.legs.slice(0, -1), newLeg];
      const newPlayer: Player = { ...oldPlayer, legs: newLegs };
      const newPlayers = state.players.map((pl, i) =>
        i === playerIdx ? newPlayer : pl,
      );
      return { ...state, players: newPlayers };
    }),

  endLeg: (checkoutScore) =>
    set((state) => {
      const playerIdx = state.currentPlayerIdx;
      const oldPlayer = state.players[playerIdx];
      const oldLeg = oldPlayer.legs[oldPlayer.legs.length - 1];
      if (!oldLeg || oldLeg.finished) return state;
      const endTime = Date.now();
      const newLeg: Leg = {
        ...oldLeg,
        finished: true,
        checkoutScore,
        endTime,
      };
      const newLegs = [...oldPlayer.legs.slice(0, -1), newLeg];
      let newLegsWon = oldPlayer.legsWon;
      let newBestLeg = state.bestLegThisMatch;
      if (newLeg.totalScoreRemaining === 0) {
        newLegsWon += 1;
        // Check if this leg is the new best for this match (fewest darts)
        if (!newBestLeg || newLeg.dartsThrown < newBestLeg.darts) {
          newBestLeg = {
            playerId: oldPlayer.id,
            darts: newLeg.dartsThrown,
            timestamp: endTime,
          };
        }
      }
      const newPlayer: Player = {
        ...oldPlayer,
        legs: newLegs,
        legsWon: newLegsWon,
      };
      const newPlayers = state.players.map((pl, i) =>
        i === playerIdx ? newPlayer : pl,
      );
      try {
        broadcastMessage({
          type: "endLeg",
          checkoutScore,
          playerIdx: state.currentPlayerIdx,
          ts: Date.now(),
        });
      } catch {}
      return { ...state, players: newPlayers, bestLegThisMatch: newBestLeg };
    }),

  nextPlayer: () =>
    set((state) => {
      const next = (state.currentPlayerIdx + 1) % state.players.length;
      try {
        broadcastMessage({
          type: "nextPlayer",
          currentPlayerIdx: next,
          ts: Date.now(),
        });
      } catch {}
      return { ...state, currentPlayerIdx: next };
    }),

  endGame: () =>
    set((state) => {
      // Only now compute best/worst 3-dart, best 9-dart, best checkout
      // Create new player objects with updated stats
      const newPlayers = state.players.map((p) => {
        const updated = { ...p };
        updatePlayerEndOfGameStats(updated);
        return updated;
      });
      try {
        broadcastMessage({ type: "endGame", ts: Date.now() });
      } catch {}
      return { ...state, players: newPlayers, inProgress: false };
    }),

  importState: (newState) => set(() => ({ ...newState })),
  setPlayerCurrentAverage: (playerIndex, avg) =>
    set((state) => {
      const oldPlayer = state.players[playerIndex];
      if (!oldPlayer) return state;
      if (Math.abs((oldPlayer.currentThreeDartAvg ?? 0) - avg) > 0.0001) {
        const newPlayer: Player = { ...oldPlayer, currentThreeDartAvg: avg };
        const newPlayers = state.players.map((pl, i) =>
          i === playerIndex ? newPlayer : pl,
        );
        return { ...state, players: newPlayers };
      }
      return state;
    }),
}));
