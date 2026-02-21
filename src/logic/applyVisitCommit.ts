import { useMatch } from "../store/match.js";

// Helper to apply a server-originated visit commit to the local match store.
// Ensures the visit total and darts are applied atomically and avoids
// double-applying the same visit when a client has already added it locally.
export function applyVisitCommit(
  match: ReturnType<typeof useMatch.getState>,
  visit: any,
) {
  try {
    const score = Number(visit?.value ?? visit?.score ?? 0) || 0;
    const darts = Number(visit?.darts ?? 3) || 3;
    const visitTotal = Number(visit?.visitTotal ?? score) || score;

    // Use provided meta if present (entries, preOpenDarts, etc.)
    const meta: any = {};
    if (visit?.entries) meta.entries = visit.entries;
    if (typeof visit?.preOpenDarts === "number")
      meta.preOpenDarts = visit.preOpenDarts;
    if (typeof visit?.doubleWindowDarts === "number")
      meta.doubleWindowDarts = visit.doubleWindowDarts;
    if (typeof visit?.finishedByDouble === "boolean")
      meta.finishedByDouble = visit.finishedByDouble;
    meta.visitTotal = visitTotal;

    // Prevent duplicate application: check the last recorded visit on any
    // player's active leg and skip if it matches the incoming visit.
    const state = useMatch.getState();
    for (const pl of state.players) {
      const l = pl?.legs?.[pl.legs.length - 1];
      if (!l || !l.visits || l.visits.length === 0) continue;
      const last = l.visits[l.visits.length - 1] as any;
      const lastTotal = Number(last?.visitTotal ?? last?.score ?? 0) || 0;
      const lastDarts = Number(last?.darts ?? 3) || 3;
      if (lastTotal === visitTotal && lastDarts === darts) {
        return { applied: false, reason: "duplicate" };
      }
    }

    // Calculate double tracking defaults if not provided by the sender
    const curPlayer = state.players[state.currentPlayerIdx];
    const curLeg = curPlayer?.legs?.[curPlayer.legs.length - 1];
    const preRem = curLeg ? curLeg.totalScoreRemaining : state.startingScore;
    const postRem = Math.max(0, preRem - visitTotal);
    const isCheckout = postRem === 0 && visitTotal > 0;

    if (meta.doubleWindowDarts == null) {
      let dwd = 0;
      if (preRem <= 50) {
        dwd = darts;
      } else if (preRem <= 170) {
        dwd = isCheckout ? 1 : postRem <= 50 ? 1 : 0;
      }
      meta.doubleWindowDarts = dwd;
    }
    if (meta.finishedByDouble == null) {
      meta.finishedByDouble = isCheckout;
    }

    // Apply visit to match store using visitTotal and darts so X01 math is correct
    try {
      state.addVisit(visitTotal, darts, meta);
    } catch (e) {
      try {
        // Best-effort fallback to plain addVisit if meta causes issues
        state.addVisit(visitTotal, darts);
      } catch (e) {}
    }

    // If this visit finished the leg (server may have signalled it via finished flag or finishedByDouble),
    // ensure leg termination is applied locally.
    try {
      const p =
        useMatch.getState().players[useMatch.getState().currentPlayerIdx];
      const leg2 = p?.legs?.[p.legs.length - 1];
      if (leg2 && leg2.totalScoreRemaining === 0) {
        try {
          useMatch.getState().endLeg(visitTotal);
        } catch (e) {}
      } else {
        try {
          useMatch.getState().nextPlayer();
        } catch (e) {}
      }
    } catch (e) {}

    return { applied: true };
  } catch (e) {
    return { applied: false, reason: "error" };
  }
}

export default applyVisitCommit;
