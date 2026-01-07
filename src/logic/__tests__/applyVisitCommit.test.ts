import { describe, it, expect, beforeEach } from "vitest";
import { useMatch } from "../../store/match";
import { applyVisitCommit } from "../applyVisitCommit";

describe("applyVisitCommit", () => {
  beforeEach(() => {
    // reset match state before each test
    useMatch.setState({
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });

  it("applies a 3-dart visit and deducts from remaining score", () => {
    useMatch.getState().newMatch(["A", "B"], 501);
    const res = applyVisitCommit(useMatch.getState(), { value: 60, darts: 3 });
    expect(res.applied).toBeTruthy();
    const p = useMatch.getState().players[0];
    const leg = p.legs[p.legs.length - 1];
    expect(leg.totalScoreRemaining).toBe(441);
    const last = leg.visits[leg.visits.length - 1];
    expect(last.visitTotal).toBe(60);
    expect(last.darts).toBe(3);
  });

  it("finishes a leg and marks finished when visit reduces remaining to 0", () => {
    useMatch.getState().newMatch(["A", "B"], 40);
    // apply finishing visit
    const res = applyVisitCommit(useMatch.getState(), { value: 40, darts: 1 });
    expect(res.applied).toBeTruthy();
    const p = useMatch.getState().players[useMatch.getState().currentPlayerIdx];
    const leg = p.legs[p.legs.length - 1];
    // Leg should be finished
    expect(leg.totalScoreRemaining).toBe(0);
    expect(leg.finished).toBeTruthy();
    expect(p.legsWon).toBe(1);
  });

  it("does not double-apply duplicate visits", () => {
    useMatch.getState().newMatch(["A", "B"], 501);
    const first = applyVisitCommit(useMatch.getState(), {
      value: 60,
      darts: 3,
    });
    expect(first.applied).toBeTruthy();
    const second = applyVisitCommit(useMatch.getState(), {
      value: 60,
      darts: 3,
    });
    expect(second.applied).toBeFalsy();
    expect(second.reason).toBe("duplicate");
  });
});
