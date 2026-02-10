// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  within,
  cleanup,
  act,
  waitFor,
} from "@testing-library/react";
import Tournaments from "../Tournaments.js";
import { useMatch } from "../../store/match.js";
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";

describe("Tournaments", () => {
  beforeEach(() => {
    // reset match state
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });
  afterEach(() => {
    cleanup();
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });

  test("shows start overlay when match starts", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    render(<Tournaments user={user} />);
    await waitFor(() => screen.getByRole("heading", { name: /Tournaments/i }));
    // Simulate a match starting
    act(() => {
      useMatch.getState().newMatch(["Alice", "Bob"], 501);
    });
    // Now the overlay should show via our useEffect
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // Close overlay by flipping inProgress false
    act(() => {
      useMatch.getState().endGame();
    });
  });
});
