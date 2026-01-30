/**
 * Turn-based calibration controller
 *
 * Manages calibration access across all game modes (Offline, Online, Tournaments).
 * Only allows calibration during a player's active turn.
 */

import { useEffect, useState } from "react";
import { useMatch } from "../store/match";

export interface TurnState {
  isMyTurn: boolean;
  currentPlayerName: string;
  currentPlayerIndex: number;
}

/**
 * Hook to track if it's the current player's turn for calibration
 */
export function useCalibrationTurnControl(localPlayerName?: string): TurnState {
  const match = useMatch();
  const [turnState, setTurnState] = useState<TurnState>({
    isMyTurn: true, // Default to true for offline single player
    currentPlayerName: "",
    currentPlayerIndex: 0,
  });

  useEffect(() => {
    if (!match.inProgress) {
      // Not in a match, allow calibration
      setTurnState({
        isMyTurn: true,
        currentPlayerName: localPlayerName || "",
        currentPlayerIndex: 0,
      });
      return;
    }

    // Determine current player
    const currentIdx = match.currentPlayerIdx ?? 0;
    const currentPlayer = match.players?.[currentIdx];
    const currentName = currentPlayer?.name || "";

    // Check if it's this player's turn
    const myTurn = !localPlayerName || currentName === localPlayerName;

    const newState = {
      isMyTurn: myTurn,
      currentPlayerName: currentName,
      currentPlayerIndex: currentIdx,
    };

    setTurnState(newState);

    // Broadcast turn update for other components (CameraView, etc.)
    try {
      window.dispatchEvent(
        new CustomEvent("ndn:turn-update", {
          detail: newState,
        }),
      );
    } catch (err) {
      console.warn("[TurnControl] Failed to broadcast turn update", err);
    }
  }, [
    match.inProgress,
    match.currentPlayerIdx,
    match.players,
    localPlayerName,
  ]);

  return turnState;
}

/**
 * Check if calibration should be allowed right now
 */
export function canCalibrate(turnState: TurnState): boolean {
  return turnState.isMyTurn;
}

/**
 * Attempt to open calibrator with turn check
 */
export function openCalibratorIfAllowed(turnState: TurnState): boolean {
  if (!canCalibrate(turnState)) {
    console.warn(
      `[Calibration] Blocked: It's ${turnState.currentPlayerName}'s turn`,
    );
    // Optionally show toast notification
    try {
      window.dispatchEvent(
        new CustomEvent("ndn:toast", {
          detail: {
            message: `Wait for your turn to calibrate (${turnState.currentPlayerName} is throwing)`,
            type: "warning",
            timeout: 3000,
          },
        }),
      );
    } catch {}
    return false;
  }

  // Dispatch calibrator open event
  try {
    window.dispatchEvent(new CustomEvent("ndn:open-calibrator"));
    return true;
  } catch (err) {
    console.error("[Calibration] Failed to open calibrator", err);
    return false;
  }
}
