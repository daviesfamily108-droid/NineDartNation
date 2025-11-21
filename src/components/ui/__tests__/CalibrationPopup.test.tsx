// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import CalibrationPopup from "../CalibrationPopup";
import { describe, test, expect, vi, beforeEach } from "vitest";

describe("CalibrationPopup", () => {
  beforeEach(() => {
    // Add a root element to the document for any potential aria-hidden logic
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
  });

  test("renders players and provides Skip and Bull Up actions", async () => {
    const players = [
      { id: "1", name: "Alice", legsWon: 0, legs: [] },
      { id: "2", name: "Bob", legsWon: 0, legs: [] },
    ] as any;
    const onSkip = vi.fn();
    const onOpenCalibrator = vi.fn();
    const onClose = vi.fn();
    render(
      <CalibrationPopup
        players={players}
        playerCalibrations={{}}
        calibrationSkipped={{}}
        onSkip={onSkip}
        onOpenCalibrator={onOpenCalibrator}
        onClose={onClose}
      />,
    );

    // Confirm both player names are present
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();

    // Click Bull Up for Alice
    // There are multiple Bull Up and Skip buttons -- click the first Bull Up, and the second Skip
    const bullUpButtons = screen.getAllByRole("button", { name: /Bull Up/i });
    expect(bullUpButtons.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      fireEvent.click(bullUpButtons[0]);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onOpenCalibrator).toHaveBeenCalled();

    const skipButtons = screen.getAllByRole("button", { name: /skip/i });
    expect(skipButtons.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      fireEvent.click(skipButtons[1]);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSkip).toHaveBeenCalled();
  });

  test("Start Match button is disabled until all players skipped", async () => {
    const players = [
      { id: "1", name: "Alice", legsWon: 0, legs: [] },
      { id: "2", name: "Bob", legsWon: 0, legs: [] },
    ] as any;
    const onSkip = vi.fn();
    const onOpenCalibrator = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <CalibrationPopup
        players={players}
        playerCalibrations={{}}
        calibrationSkipped={{}}
        onSkip={onSkip}
        onOpenCalibrator={onOpenCalibrator}
        onClose={onClose}
      />,
    );
    // Start button disabled
    const startBtn = screen.getByRole("button", { name: /Start Match/i });
    expect(startBtn).toBeDisabled();

    // Mark both players as skipped: simulate props change
    rerender(
      <CalibrationPopup
        players={players}
        playerCalibrations={{}}
        calibrationSkipped={{ "1": true, "2": true }}
        onSkip={onSkip}
        onOpenCalibrator={onOpenCalibrator}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Start Match/i }),
    ).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Match/i }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
