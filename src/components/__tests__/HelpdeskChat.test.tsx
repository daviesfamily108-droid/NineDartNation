// @vitest-environment jsdom
import React from "react";
// using built-in vitest assertions
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import HelpdeskChat from "../HelpdeskChat";
import { vi, describe, it, beforeEach, expect } from "vitest";

let mockSend = vi.fn();

// Mock WS provider used by the chat component
vi.mock("../WSProvider", () => ({
  useWS: () => ({
    send: (m: any) => mockSend(m),
    addListener: (fn: any) => {
      // no-op listener in test
      return () => {};
    },
  }),
}));

describe("HelpdeskChat", () => {
  beforeEach(() => {
    mockSend = vi.fn();
  });

  it("renders messages and sends new message via WS", async () => {
    const req = {
      id: "r1",
      username: "testuser",
      messages: [
        { fromName: "User", message: "Hello", ts: Date.now(), admin: false },
      ],
    };
    const user = { email: "user@example.com", username: "user" };
    render(<HelpdeskChat request={req} user={user} onClose={() => {}} />);

    expect(screen.getByText("Hello")).toBeTruthy();

    const input = screen.getByPlaceholderText(
      /Ask a question/i,
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Reply from admin" } });
    });
    const sendBtn = screen.getByRole("button", { name: /send message/i });
    // Click send and wait for send to be called
    fireEvent.click(sendBtn);
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
  });
});
