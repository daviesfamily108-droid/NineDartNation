import { describe, it, expect } from "vitest";

import { getCalibrationConfidenceForGame } from "../gameCalibrationRequirements.js";

describe("getCalibrationConfidenceForGame", () => {
  it("returns 0 confidence when errorPx is missing", () => {
    expect(getCalibrationConfidenceForGame("X01", null)).toBe(0);
    // Also tolerate undefined flowing in from legacy store shapes
    expect(getCalibrationConfidenceForGame("X01", undefined as any)).toBe(0);
  });

  it("does not treat 0px as missing (should be ~100%)", () => {
    expect(getCalibrationConfidenceForGame("X01", 0)).toBe(100);
  });
});
