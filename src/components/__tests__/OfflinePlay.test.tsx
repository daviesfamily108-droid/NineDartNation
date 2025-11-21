// @vitest-environment jsdom
import React from "react";
import { render, screen, act } from "@testing-library/react";
import OfflinePlay from "../OfflinePlay";
// Mock CameraView to avoid async camera effects in OfflinePlay tests
vi.mock("../CameraView", () => ({
  default: () => <div data-testid="mock-camera" />,
}));
import { useMatch } from "../../store/match";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("OfflinePlay", () => {
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
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });

  test("shows MatchStartShowcase for offline matches", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    await act(async () => {
      render(<OfflinePlay user={user} />);
      await new Promise((r) => setTimeout(r, 0));
    });
    // Start a local offline match directly via the store
    await act(async () => {
      useMatch.getState().newMatch(["Alice", "AI"], 301);
      await new Promise((r) => setTimeout(r, 0));
    });
    // Now we show overlay for offline matches on match.inProgress flip
    const found = await screen.findByRole("dialog");
    expect(found).toBeTruthy();
  });
});
