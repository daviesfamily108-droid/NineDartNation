// Minimal marker calibration utilities retained for test compatibility
// Provides tiny helpers to convert marker IDs to 7x7 bit-grid matrices
// and simple canonical marker order + targets used by the calibrator tests.

export const MARKER_ORDER = ["top", "right", "bottom", "left", "bull"] as const;

// Provide deterministic 10-bit IDs for the five targets. These are arbitrary
// but stable values used only in tests and calibration placeholder logic.
export const MARKER_TARGETS: Record<(typeof MARKER_ORDER)[number], number> = {
  top: 0b0001100011, // 195
  right: 0b0010011010, // 154
  bottom: 0b0011110001, // 241
  left: 0b0001010101, // 85
  bull: 0b0000000000, // 0 - bull uses all zeros
};

// Convert the 10-bit id into a 7x7 grid where the outer border is zeros
// and the central 5x5 encodes the id using columns 2 and 4 as data columns.
export function markerIdToMatrix(id: number): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => 0),
  );
  // Extract 10 bits MSB -> LSB
  const bits: number[] = [];
  for (let i = 9; i >= 0; i--) {
    bits.push((id >> i) & 1);
  }
  // Fill into rows 1..5 columns 2 and 4
  for (let r = 0; r < 5; r++) {
    const rowIdx = r + 1;
    const bitA = bits[2 * r] ?? 0; // MSB first
    const bitB = bits[2 * r + 1] ?? 0;
    grid[rowIdx][2] = bitA;
    grid[rowIdx][4] = bitB;
  }
  return grid;
}

export default {};
