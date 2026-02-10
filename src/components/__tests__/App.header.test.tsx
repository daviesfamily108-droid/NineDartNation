// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import App from "../../App.js";
import { useMatch } from "../../store/match.js";

describe("App header", () => {
  beforeEach(() => {
    // ensure no stale token
    try {
      localStorage.removeItem("authToken");
    } catch (e) {}
    vi.restoreAllMocks();
  });

  afterEach(() => {
    try {
      localStorage.removeItem("authToken");
    } catch (e) {}
    // reset match state
    useMatch.getState().importState({
      roomId: "",
      players: [],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: false,
    });
  });

  test("hides all-time avg when in-game view is active and shows again when returning home", async () => {
    // Pretend user is signed in by returning an auth token.
    // Avoid assigning to window.localStorage (can be read-only depending on Vitest pool).
    vi.spyOn(window.localStorage as any, "getItem").mockImplementation(
      (...args: unknown[]) => {
        const k = String(args[0] ?? "");
        if (k === "authToken") return "fake-token";
        return null;
      },
    );
    // Mock fetch to return a user for /api/auth/me and an empty array for /api/notifications
    const fakeUser = { username: "Alice", email: "a@example.com" };
    vi.spyOn(global, "fetch").mockImplementation((url: any) => {
      if (String(url).includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ user: fakeUser }),
        } as any);
      }
      if (String(url).includes("/api/notifications")) {
        return Promise.resolve({ ok: true, json: async () => [] } as any);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as any);
    });

    render(<App />);

    // Wait for header to render
    await waitFor(() => expect(screen.getByTestId("ndn-header")).toBeTruthy());

    // Start a local match
    act(() => {
      useMatch.getState().newMatch(["Alice", "AI"], 301);
    });

    // Switch away from home to simulate being in the in-game view (dispatch tab change)
    act(() => {
      window.dispatchEvent(
        new CustomEvent("ndn:change-tab", { detail: { tab: "offline" } }),
      );
    });

    // The header should still exist but be in compact mode; the All-time avg text should be hidden
    await waitFor(() => expect(screen.getByTestId("ndn-header")).toBeTruthy());
    expect(screen.getByText(/All-time 3-dart avg/i)).toBeTruthy();

    // Simulate returning to Home (header is hidden while in-game so we can't click it)
    act(() => {
      window.dispatchEvent(
        new CustomEvent("ndn:change-tab", { detail: { tab: "score" } }),
      );
    });

    // The header should reappear and show the All-time avg again when returning home
    await waitFor(() => expect(screen.getByTestId("ndn-header")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText(/All-time 3-dart avg/i)).toBeTruthy(),
    );
  });
});
