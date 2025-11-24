// @vitest-environment jsdom
import React from "react";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
// Mock WSProvider to avoid real network connections during unit tests
const mockSend = vi.fn();
vi.mock("../WSProvider", () => ({
  WSProvider: ({ children }: any) => <>{children}</>,
  useWS: () => ({
    connected: true,
    status: "connected",
    send: mockSend,
    addListener: () => () => {},
    reconnect: () => {},
  }),
}));
import OnlinePlay from "../OnlinePlay.clean";
import { useMatch } from "../../store/match";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("OnlinePlay create modal", () => {
  beforeEach(() => {
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
    mockSend.mockClear();
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

  test("renders create modal and uses per-game mapping options", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    render(<OnlinePlay user={user} />);
    await waitFor(() => screen.getByText(/Create Match \+/i));
    // Click the Create Match + button
    const createButton = await screen.findByText("Create Match +");
    fireEvent.click(createButton);
    await waitFor(() => screen.getByRole('heading', { name: /Create Match/i }));
    // The modal card should show the header
    expect(
      await screen.findByRole("heading", { name: /Create Match/i }),
    ).toBeTruthy();
    // Select game X01 and ensure Starting Score select is present
    const gameSelect = await screen.findByLabelText(/game/i);
    expect(gameSelect).toBeTruthy();
    const startSelect = await screen.findByLabelText(/X01 Starting Score/i);
    expect(startSelect).toBeTruthy();
  });

  test("mode pills set legs and focus the legs input", async () => {
    const user = { email: "a@example.com", username: "Alice" };
    render(<OnlinePlay user={user} />);
    await waitFor(() => screen.getByText(/Create Match \+/i));
    // Open modal
    const createButton = await screen.findByText("Create Match +");
    fireEvent.click(createButton);
    await waitFor(() => screen.getByRole('heading', { name: /Create Match/i }));
    // Switch to First To, set legs to 2
    const firstTo = await screen.findByText(/First To/i);
    fireEvent.click(firstTo);
    await waitFor(() => screen.getByRole('spinbutton', { name: /First To/i }));
  const legsInputFirst = await screen.findByRole('spinbutton', { name: /First To/i });
    fireEvent.change(legsInputFirst, { target: { value: '2' } });
    await waitFor(() => expect((legsInputFirst as HTMLInputElement).value).toBe('2'));
    expect((legsInputFirst as HTMLInputElement).value).toBe('2');
    // Now click Best Of and assert legs becomes odd (2 -> 3)
    const bestOf = await screen.findByText(/Best Of/i);
    fireEvent.click(bestOf);
    await waitFor(() => screen.getByRole('spinbutton', { name: /Best Of/i }));
  const legsInputBest = await screen.findByRole('spinbutton', { name: /Best Of/i });
    expect((legsInputBest as HTMLInputElement).value).toBe('3');
  });
});
