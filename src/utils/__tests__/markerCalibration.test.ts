import { describe, expect, it } from "vitest";
import {
  markerIdToMatrix,
  MARKER_ORDER,
  MARKER_TARGETS,
} from "../markerCalibration.js";

describe("markerIdToMatrix", () => {
  const deriveId = (matrix: number[][]) => {
    let id = 0;
    for (let row = 0; row < 5; row++) {
      const dataRow = matrix[row + 1];
      id = (id << 1) | (dataRow[2] ?? 0);
      id = (id << 1) | (dataRow[4] ?? 0);
    }
    return id >>> 0;
  };

  it("produces a valid 7x7 grid with black border", () => {
    for (const key of MARKER_ORDER) {
      const id = MARKER_TARGETS[key];
      const grid = markerIdToMatrix(id);
      expect(grid.length).toBe(7);
      grid.forEach((row) => expect(row.length).toBe(7));
      // Border cells should all be zeros (black)
      for (let i = 0; i < 7; i++) {
        expect(grid[0][i]).toBe(0);
        expect(grid[6][i]).toBe(0);
        expect(grid[i][0]).toBe(0);
        expect(grid[i][6]).toBe(0);
      }
    }
  });

  it("round-trips ids through mat2id logic", () => {
    for (const key of MARKER_ORDER) {
      const id = MARKER_TARGETS[key];
      const grid = markerIdToMatrix(id);
      expect(deriveId(grid)).toBe(id);
    }
  });
});
