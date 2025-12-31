// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
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
    const addButton = screen.getByText(/Add Visit/i);
    fireEvent.click(addButton);
    await waitFor(() => expect(onAddVisit).toHaveBeenCalledWith(60, 3));
    // Quick button
    const quick = screen.getByText("180");
    fireEvent.click(quick);
    await waitFor(() => expect(onAddVisit).toHaveBeenCalledWith(180, 3));

    // Undo
    const undo = screen.getByTitle("Undo");
    fireEvent.click(undo);
    await waitFor(() => expect(onUndo).toHaveBeenCalled());

    // Next Player
    const next = screen.getByText(/Next Player/i);
    fireEvent.click(next);
    await waitFor(() => expect(onNextPlayer).toHaveBeenCalled());

    // End Leg
    const endLeg = screen.getByText(/End Leg/) as HTMLButtonElement;
    fireEvent.click(endLeg);
    await waitFor(() => expect(onEndLeg).toHaveBeenCalled());

    // End Game
    const endGame = screen.getByText(/End Game/i);
    fireEvent.click(endGame);
    await waitFor(() => expect(onEndGame).toHaveBeenCalled());
  });

  test("pressing Enter on score input commits the visit and resets", async () => {
    const onAddVisit = vi.fn();

    render(
      <MatchControls
        inProgress={true}
        startingScore={501}
        onAddVisit={onAddVisit}
      />,
    );

    const input = screen.getByRole("spinbutton") as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "45" } });
    });

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", charCode: 13 });

    await waitFor(() => expect(onAddVisit).toHaveBeenCalledWith(45, 3));
    expect(input.value).toBe("0");
  });
});
