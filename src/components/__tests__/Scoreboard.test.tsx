// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
  act,
  waitFor,
} from "@testing-library/react";
import Scoreboard from "../Scoreboard";
import { useMatch } from "../../store/match";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

describe("Scoreboard", () => {
  const originalStoreFuncs = {
    addVisit: useMatch.getState().addVisit,
    endLeg: useMatch.getState().endLeg,
  };
  beforeEach(() => {
    // Reset to default match state
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });
  afterEach(() => {
    useMatch.getState().addVisit = originalStoreFuncs.addVisit;
    useMatch.getState().endLeg = originalStoreFuncs.endLeg;
    vi.resetAllMocks();
    cleanup();
  });

  test("uses provided matchActions.addVisit from quick buttons", async () => {
    let propCalled = false;
    const mockAddVisit = vi.fn((s: number, d: number) => {
      propCalled = true;
    });
    const matchActions = {
      addVisit: mockAddVisit as any,
      undoVisit: vi.fn(),
      nextPlayer: vi.fn(),
      endLeg: vi.fn(),
      endGame: vi.fn(),
    };
    // Also spy on the store addVisit to ensure the prop is used instead
    useMatch.getState().addVisit = vi.fn() as any;
    // Setup a minimal in-progress match so MatchControls renders
    await act(async () => {
      useMatch.getState().newMatch(["Alice", "Bob"], 501);
    });
    render(<Scoreboard matchActions={matchActions} />);
    // Click a quick 180 button located in the Score Input card to avoid collisions
    const headings = await screen.findAllByText("Score Input");
    let card: Element | null = null;
    for (const h of headings) {
      const c = h.closest(".card");
      if (
        c &&
        within(c as HTMLElement).queryByRole("button", { name: "180" })
      ) {
        card = c;
        break;
      }
    }
    if (!card)
      throw new Error("Could not find Score Input card with quick 180 button");
    const btn = (
      await within(card as HTMLElement).findAllByRole("button", { name: "180" })
    )[0];
    // quick action should call the provided prop handler instead of the store
    fireEvent.click(btn);
    await waitFor(() => expect(mockAddVisit).toHaveBeenCalledWith(180, 3));
    expect(propCalled).toBeTruthy();
    expect(useMatch.getState().addVisit).not.toHaveBeenCalled();
  });

  test("finishing visit triggers endLeg via matchActions when remaining goes to zero", async () => {
    let propCalled2 = false;
    const mockAddVisit2 = vi.fn((s: number, d: number) => {
      propCalled2 = true;
    });
    const matchActions = {
      addVisit: mockAddVisit2 as any,
      undoVisit: vi.fn(),
      nextPlayer: vi.fn(),
      endLeg: vi.fn(),
      endGame: vi.fn(),
    };
    // Spy on store functions so we can assert they were NOT called
    useMatch.getState().addVisit = vi.fn() as any;
    useMatch.getState().endLeg = vi.fn() as any;
    // We expect the matchActions prop handlers to be used instead
    // Import state with current player's leg at 41 remaining
    const now = Date.now();
    useMatch.getState().importState({
      roomId: "",
      players: [
        {
          id: "0",
          name: "Alice",
          legsWon: 0,
          legs: [
            {
              visits: [],
              totalScoreStart: 501,
              totalScoreRemaining: 41,
              dartsThrown: 0,
              finished: false,
              checkoutScore: null,
              startTime: now,
            },
          ],
        },
        { id: "1", name: "Bob", legsWon: 0, legs: [] },
      ],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: true,
    });
    render(<Scoreboard matchActions={matchActions} />);
    // Input 41 and click Add Visit (avoid coupling to card DOM structure)
    const input = (await screen.findByPlaceholderText(
      "Score",
    )) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "41" } });
    });
    // Ensure the input was updated
    expect((input as HTMLInputElement).value).toBe("41");
    const addBtn = await screen.findByRole("button", { name: /add visit/i });
    fireEvent.click(addBtn);
    await waitFor(() =>
      expect(matchActions.addVisit).toHaveBeenCalledWith(41, 3),
    );
    // Assert that the provided matchActions.addVisit and endLeg are called for finishing visit
    // Assert that the provided matchActions.addVisit and endLeg are called for finishing visit
    expect(useMatch.getState().addVisit).not.toHaveBeenCalled();
    expect(propCalled2).toBeTruthy();
    expect(matchActions.addVisit).toHaveBeenCalledWith(41, 3);
    // We assert that the endLeg handler was invoked when the remaining became zero.
    expect(matchActions.endLeg).toHaveBeenCalledWith(41);
  });

  test("updates current three-dart average after every 3 darts scored", async () => {
    // Reset to a new match
    await act(async () => {
      useMatch.getState().newMatch(["Alice", "Bob"], 501);
    });
    // Add three visits of 60 (T20+T20+S20 each) to make a 180 total
    await act(async () => {
      useMatch.getState().addVisit(60, 3);
      useMatch.getState().addVisit(60, 3);
      useMatch.getState().addVisit(60, 3);
    });
    const p = useMatch.getState().players[0];
    // After three visits (9 darts), the avg should be a 3-dart average per 3 darts, i.e., (501-start)?? We compute from leg
    const leg = p.legs[p.legs.length - 1];
    const scored = leg.totalScoreStart - leg.totalScoreRemaining;
    const expectedAvg = (scored / leg.dartsThrown) * 3;
    expect(p.currentThreeDartAvg).toBeCloseTo(expectedAvg);
  });

  test("shows live 3-dart average in the UI and updates after every 3 darts", async () => {
    await act(async () => {
      useMatch.getState().newMatch(["Alice", "Bob"], 501);
    });
    const { formatAvg } = await import("../../utils/stats");
    // Initially render the scoreboard
    const { getByText } = render(<Scoreboard />);
    // Before any visits, the avg tile label should exist in each player's card
    const aliceCard = await screen.findByText("Alice");
    const aliceCardRoot = aliceCard.closest(".card") as HTMLElement;
    const aliceWithin = within(aliceCardRoot);
    expect(aliceWithin.getByText("3-Dart Avg (Live)")).toBeTruthy();

    // Add a single visit of 60 darts=3
    await act(async () => {
      useMatch.getState().addVisit(60, 3);
    });
    // After one visit (3 darts) the live avg should be updated to 60 (in Alice's card)
    const liveAvgTile = aliceWithin
      .getByText("3-Dart Avg (Live)")
      .closest(".metric-tile") as HTMLElement;
    expect(liveAvgTile).toBeTruthy();
    expect(
      within(liveAvgTile).getByText(
        formatAvg(useMatch.getState().players[0].currentThreeDartAvg ?? 0),
      ),
    ).toBeTruthy();

    // Add two more visits of 60 to make 9 darts total and check UI updates
    await act(async () => {
      useMatch.getState().addVisit(60, 3);
      useMatch.getState().addVisit(60, 3);
    });
    const expected = useMatch.getState().players[0].currentThreeDartAvg ?? 0;
    expect(within(liveAvgTile).getByText(formatAvg(expected))).toBeTruthy();
  });

  test("allows manual editing of current three-dart average", async () => {
    await act(async () => {
      useMatch.getState().newMatch(["Alice", "Bob"], 501);
    });
    await act(async () => {
      useMatch.getState().setPlayerCurrentAverage(0, 63.4);
    });
    expect(useMatch.getState().players[0].currentThreeDartAvg).toBeCloseTo(
      63.4,
    );
  });
});
