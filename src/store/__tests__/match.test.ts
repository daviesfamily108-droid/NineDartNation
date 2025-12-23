import { beforeEach, describe, expect, it } from "vitest";
import { useMatch } from "../match";

describe("three-dart average calculations", () => {
  beforeEach(() => {
    // reset store
    useMatch.setState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });

  it("excludes pre-open darts from the average and updates after 3 counted darts", () => {
    useMatch.getState().newMatch(["Alice"], 501);
    // First visit: two pre-open darts (double-in) -> should not count toward avg
    useMatch.getState().addVisit(0, 2, { preOpenDarts: 2 });
    // No avg yet
    expect(useMatch.getState().players[0].currentThreeDartAvg ?? 0).toBe(0);

    // Next visit: 180 in 3 darts -> counted darts = 3 -> avg should be 180
    useMatch.getState().addVisit(180, 3);
    expect(useMatch.getState().players[0].currentThreeDartAvg).toBeCloseTo(
      180,
      6,
    );
  });

  it("updates average on leg finish even when counted darts are not multiple of 3", () => {
    // Start with a small starting score so a two-dart finish is possible
    useMatch.getState().newMatch(["Bob"], 101);
    // Bob finishes the leg in 2 darts with 101 points
    useMatch.getState().addVisit(101, 2);
    // avg = (101 / 2) * 3
    expect(useMatch.getState().players[0].currentThreeDartAvg).toBeCloseTo(
      (101 / 2) * 3,
      6,
    );
  });

  it("counts bust darts (zeros) in average calculation", () => {
    useMatch.getState().newMatch(["Carol"], 501);
    // A bust of 3 darts (no score)
    useMatch.getState().addVisit(0, 3);
    // Next visit scores 180 in 3 darts -> total scored 180 over 6 darts => avg = (180/6)*3 = 90
    useMatch.getState().addVisit(180, 3);
    expect(useMatch.getState().players[0].currentThreeDartAvg).toBeCloseTo(
      90,
      6,
    );
  });
});
