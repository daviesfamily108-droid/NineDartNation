// @vitest-environment jsdom
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
// Mock WSProvider to avoid real network connections during unit tests
let __wsListeners: ((msg: any) => void)[] = [];
const __sendSpy = vi.fn();
vi.mock("../WSProvider", () => ({
  WSProvider: ({ children }: any) => <>{children}</>,
  useWS: () => ({
    connected: true,
    status: "connected",
    send: __sendSpy,
    addListener: (fn: (msg: any) => void) => {
      __wsListeners.push(fn);
      return () => {
        __wsListeners = __wsListeners.filter((l) => l !== fn);
      };
    },
    reconnect: () => {},
    __emit: (m: any) => {
      __wsListeners.forEach((l) => {
        try {
          l(m);
        } catch {}
      });
    },
    __getSend: () => __sendSpy,
  }),
}));
// Mock CameraView to avoid async camera effects within OnlinePlay
vi.mock("../CameraView", () => ({
  default: () => <div data-testid="mock-camera" />,
}));
import OnlinePlay from "../OnlinePlay.clean";
import { useMatch } from "../../store/match";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("OnlinePlay", () => {
  beforeEach(() => {
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });
  afterEach(() => {
    // Reset match state
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });

  test("shows MatchStartShowcase when a match starts", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    await act(async () => {
      render(<OnlinePlay user={user} />);
      await new Promise((r) => setTimeout(r, 0));
    });
    // Start a new match via the store
    await act(async () => {
      useMatch.getState().newMatch(["Alice", "Bob"], 501);
      // Give any microtasks a chance to flush so effects update inside act
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Expect the overlay dialog to appear; be tolerant of async timing
    expect(
      await screen.findByRole("dialog", {}, { timeout: 2000 }),
    ).toBeTruthy();
  });

  test("prestart choices and bull flow via WS", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    await act(async () => {
      render(<OnlinePlay user={user} />);
      await new Promise((r) => setTimeout(r, 0));
    });
    const useWS = (await import("../WSProvider")).useWS as any;
    // Simulate match prestart push from server with short time so prestart choice UI appears
    await act(async () => {
      // Simulate joined / presence messages so client can map IDs to names
      useWS().__emit({ type: "joined", id: "self-id" });
      useWS().__emit({ type: "presence", id: "other", username: "Bob" });
      useWS().__emit({
        type: "match-prestart",
        roomId: "m-1",
        match: {
          id: "m-1",
          creatorId: "other",
          createdBy: "Bob",
          game: "X01",
          modeType: "firstto",
          legs: 3,
          startingScore: 501,
        },
        prestartEndsAt: Date.now() + 1000,
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    // Modal should appear
    expect(await screen.findByText("Join Match")).toBeTruthy();
    // Choose Bull Up - should send prestart-choice message
    const bullBtn = await screen.findByText("Bull Up");
    await act(async () => {
      bullBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(__sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "prestart-choice",
        roomId: "m-1",
        choice: "bull",
      }),
    );
    // Server notifies opponent chose Skip
    await act(async () => {
      useWS().__emit({
        type: "prestart-choice-notify",
        roomId: "m-1",
        playerId: "other",
        choice: "skip",
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    // The presence mapping should display the opponent's username
    expect(await screen.findByText("Bob chose: skip")).toBeTruthy();
    // Server starts bull-up flow
    await act(async () => {
      useWS().__emit({ type: "prestart-bull", roomId: "m-1" });
      await new Promise((r) => setTimeout(r, 0));
    });
    // Find and click throw bull
    const throwBtn = await screen.findByText("Throw Bull");
    const input = (await screen.findByRole("spinbutton")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "50" } });
      throwBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(__sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "prestart-bull-throw",
        roomId: "m-1",
        score: 50,
      }),
    );
    // Server declares winner and then starts match
    await act(async () => {
      useWS().__emit({
        type: "prestart-bull-winner",
        roomId: "m-1",
        winnerId: "other",
      });
      useWS().__emit({
        type: "match-start",
        roomId: "m-1",
        match: { id: "m-1" },
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    // Join modal should close
    expect(screen.queryByText("Join Match")).toBeNull();
  });

  test("shows Room badge when a world match comes from a named room", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    await act(async () => {
      render(<OnlinePlay user={user} />);
      await new Promise((r) => setTimeout(r, 0));
    });
    const useWS = (await import("../WSProvider")).useWS as any;
    // Simulate server 'matches' list with a world match that has a roomName
    await act(async () => {
      useWS().__emit({
        type: "matches",
        matches: [
          {
            id: "m-world-10",
            game: "X01",
            createdBy: "Carlos",
            modeType: "firstto",
            legs: 3,
            startingScore: 501,
            roomName: "room-99",
          },
        ],
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    // The match item should appear and show the Room badge text
    const badges = await screen.findAllByText(/Room: room-99/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  test("renders a 3-column grid and card height for matches", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    await act(async () => {
      render(<OnlinePlay user={user} />);
      await new Promise((r) => setTimeout(r, 0));
    });
    const useWS = (await import("../WSProvider")).useWS as any;
    // Create 13 matches to exceed a 3x4 capacity (12), ensuring grid shows many items
    const matches = Array.from({ length: 13 }).map((_, idx) => ({
      id: `m-${idx}`,
      game: "X01",
      createdBy: `Player${idx}`,
      modeType: "firstto",
      legs: 3,
      startingScore: 501,
    }));
    await act(async () => {
      useWS().__emit({ type: "matches", matches });
      await new Promise((r) => setTimeout(r, 0));
    });
    const grid = await screen.findByTestId("matches-grid");
    expect(grid).toBeTruthy();
    // Has 3 columns and max height limitations via classes
    expect(grid.className.includes("grid-cols-3")).toBeTruthy();
    expect(grid.className.includes("max-h-[28rem]")).toBeTruthy();
    // All matches should be rendered as grid children
    matches.forEach((m) => {
      expect(screen.getByTestId(`match-${m.id}`)).toBeTruthy();
    });
    // Assert each card uses the fixed height class
    const firstCard = screen.getByTestId("match-m-0");
    expect(firstCard.className.includes("h-28")).toBeTruthy();
  });
});
