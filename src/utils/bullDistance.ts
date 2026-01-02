import type { Point } from "./vision";

// The physical dartboard dimensions are standardized.
// Source: World Darts Federation / common dartboard specs.
// - Bull ("inner bull") radius: 6.35mm (12.7mm diameter)
// - Outer bull radius: 15.9mm (31.8mm diameter)
// These are the most important for "bulling up" distance-to-bull.
export const DARTBOARD_MM = {
  bullInnerRadiusMm: 6.35,
  bullOuterRadiusMm: 15.9,
} as const;

export type BullDistanceResult = {
  // Euclidean distance from bull center in millimetres.
  distanceMm: number;
  // Convenience: bull rings for messaging.
  inInnerBull: boolean;
  inOuterBull: boolean;
};

// NOTE: This assumes pBoard is in the same "board units" as BoardRadii.
// In this codebase, vision helpers treat the board as a radius-normalized model
// (i.e. bull/triple/double rings are represented as radii in the same unit).
// If calibration changes those units, only `mmPerBoardUnit` needs updating.
export function mmPerBoardUnitFromBullOuter(params: {
  bullOuterRadiusBoardUnits: number;
}): number {
  const r = params.bullOuterRadiusBoardUnits;
  if (!Number.isFinite(r) || r <= 0) return 0;
  return DARTBOARD_MM.bullOuterRadiusMm / r;
}

export function distanceFromBullMm(params: {
  // Dart tip location in board-model coordinates.
  pBoard: Point;
  // Bull center in board-model coordinates.
  bullCenter?: Point;
  // Conversion scalar.
  mmPerBoardUnit: number;
  // Optional board bull radii in board units (for in-bull checks).
  bullInnerRadiusBoardUnits?: number;
  bullOuterRadiusBoardUnits?: number;
}): BullDistanceResult {
  const {
    pBoard,
    bullCenter = { x: 0, y: 0 },
    mmPerBoardUnit,
    bullInnerRadiusBoardUnits,
    bullOuterRadiusBoardUnits,
  } = params;

  const dx = (pBoard?.x ?? 0) - (bullCenter?.x ?? 0);
  const dy = (pBoard?.y ?? 0) - (bullCenter?.y ?? 0);
  const dBoard = Math.sqrt(dx * dx + dy * dy);
  const mm = Math.max(
    0,
    dBoard * (Number.isFinite(mmPerBoardUnit) ? mmPerBoardUnit : 0),
  );

  const inInnerBull =
    typeof bullInnerRadiusBoardUnits === "number" &&
    bullInnerRadiusBoardUnits > 0 &&
    dBoard <= bullInnerRadiusBoardUnits + 1e-9;

  const inOuterBull =
    typeof bullOuterRadiusBoardUnits === "number" &&
    bullOuterRadiusBoardUnits > 0 &&
    dBoard <= bullOuterRadiusBoardUnits + 1e-9;

  return { distanceMm: mm, inInnerBull, inOuterBull };
}
