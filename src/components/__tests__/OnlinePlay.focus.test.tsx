// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { vi } from "vitest";

// Mock WSProvider like other OnlinePlay tests
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

vi.mock("../CameraView", () => ({
  default: () => <div data-testid="mock-camera" />,
}));

import OnlinePlay from "../OnlinePlay.clean";
import { useMatch } from "../../store/match";

describe("OnlinePlay focus mode", () => {
  beforeEach(() => {
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
    __wsListeners = [];
    __sendSpy.mockClear();
  });

  test("toggles focus mode and hides created-by details", async () => {
    render(<OnlinePlay user={{ username: "Alice" }} />);
    const useWS = (await import("../WSProvider")).useWS as any;
    act(() => {
      useWS().__emit({
        type: "matches",
        matches: [
          {
            id: "m-1",
            game: "X01",
            createdBy: "Bob",
            modeType: "firstto",
            legs: 3,
            startingScore: 501,
          },
        ],
      });
    });

    // Wait for match to render
    const match = await screen.findByTestId("match-m-1");
    expect(match).toBeTruthy();

    // Created by should be visible initially
    expect(match.textContent).toContain("Created by:");

    // Click Focus Mode
    const focusBtn = screen.getByRole("button", {
      name: /Focus Mode|Exit Focus/i,
    });
    fireEvent.click(focusBtn);

    // Overlay should show
    expect(await screen.findByText(/FOCUS MODE — Click to exit/)).toBeTruthy();

    // Created by text should be hidden in cards
    expect(screen.queryByText(/Created by:/i)).toBeNull();
    // Avatar initials should not be visible when focus mode is on
    expect(screen.queryByText(/BO|BO/i)).toBeNull();
  });

  test("clicking outside matches grid exits focus mode", async () => {
    render(<OnlinePlay user={{ username: "Alice" }} />);
    const useWS = (await import("../WSProvider")).useWS as any;
    act(() => {
      useWS().__emit({
        type: "matches",
        matches: [
          {
            id: "m-2",
            game: "X01",
            createdBy: "Bob",
            modeType: "firstto",
            legs: 3,
          },
        ],
      });
    });
    await screen.findByTestId("match-m-2");

    const focusBtn = screen.getByRole("button", {
      name: /Focus Mode|Exit Focus/i,
    });
    fireEvent.click(focusBtn);
    await screen.findByText(/FOCUS MODE — Click to exit/);

    // Click outside (document body)
    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(screen.queryByText(/FOCUS MODE — Click to exit/)).toBeNull(),
    );
    // Toggle button should return to 'Focus Mode'
    expect(screen.getByRole("button", { name: /Focus Mode/i })).toBeTruthy();
  });

  test("hides Filters & Controls when a match is in progress", async () => {
    // Set inProgress true
    useMatch.getState().importState({
      inProgress: true,
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
    });
    render(<OnlinePlay user={{ username: "Alice" }} />);

    // The search input from Filters should be absent when inProgress
    expect(
      screen.queryByPlaceholderText(/Search matches, players.../i),
    ).toBeNull();
  });

  test("match card shows avatar initials and Join button in layout", async () => {
    render(<OnlinePlay user={{ username: "Alice" }} />);
    const useWS = (await import("../WSProvider")).useWS as any;
    act(() => {
      useWS().__emit({
        type: "matches",
        matches: [
          {
            id: "m-3",
            game: "X01",
            createdBy: "Bob",
            modeType: "firstto",
            legs: 3,
          },
        ],
      });
    });
    const match = await screen.findByTestId("match-m-3");
    // Avatar initials should appear
    expect(match.textContent).toContain("BO");
    // Join button should appear
    expect(within(match).getByRole("button", { name: /Join/i })).toBeTruthy();
    // And the card should have a subtle hover/transform class applied for polish
    expect(
      match.className.includes("transition-transform") ||
        match.className.includes("transform"),
    ).toBeTruthy();
  });

  test("Focus mode toggle hides/shows header and sidebar", async () => {
    render(<OnlinePlay user={{ username: "TestUser" }} />);

    // Enter focus mode
    const focusBtn = screen.getByTitle(/Toggle focus mode/i);
    fireEvent.click(focusBtn);

  await screen.findByText(/Exit Focus/i);

    // Sidebar and header should be hidden (check for absence of key elements)
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();

    // Exit focus mode
  const exitBtn = screen.getByText(/Exit Focus/i);
    fireEvent.click(exitBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Exit Focus/i)).toBeNull();
    });
  });
});
