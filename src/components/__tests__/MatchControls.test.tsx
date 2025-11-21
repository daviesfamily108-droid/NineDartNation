// @vitest-environment jsdom
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import MatchControls from "../MatchControls";

describe("MatchControls component", () => {
  test("calls onAddVisit, onUndo, onNextPlayer, onEndLeg, onEndGame as expected", async () => {
    const onAddVisit = vi.fn();
    const onUndo = vi.fn();
    const onNextPlayer = vi.fn();
    const onEndLeg = vi.fn();
    const onEndGame = vi.fn();

    render(
      <MatchControls
        inProgress={true}
        startingScore={501}
        onAddVisit={onAddVisit}
        onUndo={onUndo}
        onNextPlayer={onNextPlayer}
        onEndLeg={onEndLeg}
        onEndGame={onEndGame}
      />,
    );

    // Enter score and add visit
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "60" } });
    });
    const addButton = screen.getByText("Add Visit");
    await act(async () => {
      fireEvent.click(addButton);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onAddVisit).toHaveBeenCalledWith(60, 3);
    // Quick button
    const quick = screen.getByText("180");
    await act(async () => {
      fireEvent.click(quick);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onAddVisit).toHaveBeenCalledWith(180, 3);

    // Undo
    const undo = screen.getByTitle("Undo");
    await act(async () => {
      fireEvent.click(undo);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onUndo).toHaveBeenCalled();

    // Next Player
    const next = screen.getByText("Next Player");
    await act(async () => {
      fireEvent.click(next);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onNextPlayer).toHaveBeenCalled();

    // End Leg
    const endLeg = screen.getByText(/End Leg/) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(endLeg);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onEndLeg).toHaveBeenCalled();

    // End Game
    const endGame = screen.getByText("End Game");
    await act(async () => {
      fireEvent.click(endGame);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onEndGame).toHaveBeenCalled();
  });
});
