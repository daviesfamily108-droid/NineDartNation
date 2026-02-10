// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import HelpAssistant from "../HelpAssistant.js";
import { vi, describe, it, beforeEach, expect } from "vitest";

// Import the real module and spy on apiFetch so the import resolver works in ESM
import * as api from "../../utils/api.js";

// Mock WS provider (no-op)
vi.mock("../WSProvider", () => ({
  useWS: () => ({ send: () => {}, addListener: () => () => {} }),
}));

describe("HelpAssistant escalation", () => {
  beforeEach(() => {
    // reset any existing spies/mocks
    if ((api as any).apiFetch && (api as any).apiFetch.mockReset)
      (api as any).apiFetch.mockReset();
    vi.restoreAllMocks();
  });

  it("posts a help request when user confirms escalation", async () => {
    // Spy on apiFetch
    const spy = vi.spyOn(api, "apiFetch").mockImplementation(vi.fn());

    render(<HelpAssistant />);
    // open help
    const openBtn = screen.getByTitle("Help Assistant");
    fireEvent.click(openBtn);
    await waitFor(() => screen.getByPlaceholderText("Ask me anything..."));

    // type a message that triggers the "not sure" path
    const input = screen.getByPlaceholderText(
      "Ask me anything...",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "blorp unknown topic" } });
    fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });
    await waitFor(() =>
      screen.getByText(/connect you to a member of our admin team/i),
    );

    // the assistant will ask to connect to an admin; wait for that prompt
    await waitFor(() =>
      expect(
        screen.getByText(/connect you to a member of our admin team/i),
      ).toBeTruthy(),
    );

    // Now respond YES
    fireEvent.change(input, { target: { value: "YES" } });
    fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    // apiFetch should have been called to create help request
    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
  });
});
