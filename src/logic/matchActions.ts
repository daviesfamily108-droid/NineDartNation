import type { Actions as MatchActions } from "../store/match.js";

export type UnifiedMatchActions = {
  addVisit: (score: number, darts?: number, meta?: any) => void;
  undoVisit: () => void;
  nextPlayer: () => void;
  endLeg: (score?: number) => void;
  endGame: () => void;
};

export function createOnlineMatchActions(args: {
  match: MatchActions;
  sendState: () => void;
  submitVisitManual?: (v: number) => void;
}): UnifiedMatchActions {
  const { match, sendState, submitVisitManual } = args;
  return {
    addVisit: (score: number, darts = 3, meta?: any) => {
      // Prefer the manual submit helper when available as it computes double/finish meta
      if (submitVisitManual) {
        submitVisitManual(score);
        return;
      }
      try {
        match.addVisit(score, darts, meta);
      } catch (e) {
        match.addVisit(score, darts);
      }
      try {
        sendState();
      } catch (e) {}
    },
    undoVisit: () => {
      match.undoVisit();
      try {
        sendState();
      } catch (e) {}
    },
    nextPlayer: () => {
      match.nextPlayer();
      try {
        sendState();
      } catch (e) {}
    },
    endLeg: (score?: number) => {
      if (typeof score === "number") match.endLeg(score);
      else match.endLeg(0);
      try {
        sendState();
      } catch (e) {}
    },
    endGame: () => {
      match.endGame();
      try {
        sendState();
      } catch {}
    },
  };
}

export function createOfflineMatchActions(args: {
  match: MatchActions;
  commitManualVisitTotal?: (v: number) => boolean;
  endTurn?: (nextRemaining: number) => void;
}): UnifiedMatchActions {
  const { match, commitManualVisitTotal, endTurn } = args;
  return {
    addVisit: (score: number, darts = 3, meta?: any) => {
      if (commitManualVisitTotal) {
        commitManualVisitTotal(score);
        return;
      }
      try {
        match.addVisit(score, darts, meta);
      } catch {
        match.addVisit(score, darts);
      }
    },
    undoVisit: () => {
      match.undoVisit();
    },
    nextPlayer: () => {
      if (endTurn) {
        try {
          endTurn(0);
        } catch {
          match.nextPlayer();
        }
      } else {
        match.nextPlayer();
      }
    },
    endLeg: (score?: number) => {
      if (typeof score === "number") match.endLeg(score);
      else match.endLeg(0);
    },
    endGame: () => {
      match.endGame();
    },
  };
}
