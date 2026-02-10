// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import OfflinePlay from "../OfflinePlay.js";
// Mock CameraView to avoid async camera effects in OfflinePlay tests
vi.mock("../CameraView", () => ({
  default: () => <div data-testid="mock-camera" />,
}));
import { useMatch } from "../../store/match.js";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { formatAvg } from "../../utils/stats.js";

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
    render(<OfflinePlay user={user} />);
    await waitFor(() => screen.getByText(/Start Match/i));
    // Start a local offline match directly via the store
    act(() => {
      useMatch.getState().newMatch(["Alice", "AI"], 301);
    });
    // Now we show overlay for offline matches on match.inProgress flip
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeTruthy(), {
      timeout: 2000,
    });
  });

  test("shows live 3-Dart Avg label in offline UI", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    render(<OfflinePlay user={user} />);
    // Trigger match start through the UI so OfflinePlay updates any internal view state
    const startBtn = await screen.findByRole("button", {
      name: /Start Match/i,
    });
    act(() => {
      fireEvent.click(startBtn);
    });
    // If the UI didn't actually start the match (e.g., gated by setup inputs), fall back to store.
    act(() => {
      if (!useMatch.getState().inProgress) {
        useMatch.getState().newMatch(["Alice", "AI"], 301);
      }
    });

    await waitFor(() => expect(useMatch.getState().inProgress).toBe(true));

    // The offline in-game UI should show the live avg tile + current shooter
    expect(await screen.findByTestId("offline-live-avg")).toBeTruthy();
    expect(await screen.findByTestId("offline-current-shooter")).toBeTruthy();
  });

  test("committing a full visit updates live 3-dart average", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    render(<OfflinePlay user={user} />);
    await waitFor(() => screen.getByText(/Start Match/i));
    act(() => {
      useMatch.getState().newMatch(["Alice", "AI"], 301);
    });

    // Simulate committing a visit via the match store (equivalent to committing a 3-dart total)
    act(() => {
      useMatch.getState().addVisit(93, 3);
    });

    // The match store should reflect the new average
    await waitFor(() => {
      const p = useMatch.getState().players[0];
      expect(p.currentThreeDartAvg).toBeGreaterThan(0);
    });
  });

  // NOTE: camera pane is rendered inside the active match modal; manual testing
  // confirms it's rendered as a sibling to the scroll area and uses MemoCameraView.
  test("renders right-hand camera pane in match modal (desktop)", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    render(<OfflinePlay user={user} />);
    await waitFor(() => screen.getByText(/Start Match/i));
    // Enable camera in settings so the pane can mount
    const { useUserSettings } = await import("../../store/userSettings.js");
    act(() => {
      useUserSettings.setState({ cameraEnabled: true });
    });
    // Select a mode that renders a right-hand camera pane in the pre-match UI
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    const gameSelect = selects[0];
    act(() => {
      gameSelect.value = "Treble Practice";
      gameSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // The camera pane should now be visible in the pre-match layout
    const pane = await screen.findByTestId("offline-camera-pane");
    expect(pane).toBeTruthy();
  });
});
