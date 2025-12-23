// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { vi, describe, it, beforeEach, expect } from "vitest";

let listener: any = null;
let mockSend = vi.fn();

vi.mock("../WSProvider", () => ({
  useWS: () => ({
    send: (m: any) => mockSend(m),
    addListener: (fn: any) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  }),
}));

import HelpdeskChat from "../HelpdeskChat";

describe("HelpdeskChat behavior", () => {
  beforeEach(() => {
    mockSend = vi.fn();
    listener = null;
  });

  it("shows timestamps and reacts to typing events", async () => {
    const now = Date.now();
    const req = {
      id: "r-123",
      username: "tester",
      messages: [
        { fromName: "User", message: "Hi", ts: now - 60000, admin: false },
      ],
    };
    const user = {
      email: "admin@example.com",
      username: "admin",
      isAdmin: true,
    };

    render(<HelpdeskChat request={req} user={user} onClose={() => {}} />);

    // timestamp should be visible in HH:MM format
    const timeString = new Date(now - 60000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(screen.getByText(timeString)).toBeTruthy();

    // simulate typing event from admin
    expect(listener).toBeTruthy();
    await act(async () => {
      listener({ type: "help-typing", requestId: "r-123", fromName: "Admin" });
    });

    expect(await screen.findByText(/Admin typing/i)).toBeTruthy();

    // send a new message and verify ws.send was called
    const input = screen.getByPlaceholderText(
      /Ask a question/i,
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Replying now" } });
    });
    const sendBtn = screen.getByRole("button", { name: /send message/i });
    fireEvent.click(sendBtn);
    await waitFor(() => expect(mockSend).toHaveBeenCalled());

    // new message content is rendered
    expect(await screen.findByText("Replying now")).toBeTruthy();
  });
});
