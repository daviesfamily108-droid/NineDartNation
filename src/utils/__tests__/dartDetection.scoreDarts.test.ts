import { describe, it, expect } from "vitest";
import { scoreDarts } from "../dartDetection";
import { BoardRadii, SectorOrder } from "../vision";

describe("scoreDarts", () => {
  it("scores using board->image homography and orients sectors via theta", () => {
    // Build a simple board->image homography that maps board mm into image pixels
    // with the board center at (160,120).
    const H_boardToImage = [1, 0, 160, 0, 1, 120, 0, 0, 1] as any;

    // Pick a point that's clearly in a SINGLE band and away from boundaries.
    // Base orientation: pointing up (0,-r) is sector 20 in this codebase.
    const r = 120; // safely between trebleOuter(107) and doubleInner(162)
    const pBoardUp = { x: 0, y: -r };
    const pImg = { x: pBoardUp.x + 160, y: pBoardUp.y + 120 };

    const [scored0] = scoreDarts(
      [{ x: pImg.x, y: pImg.y, radius: 5, confidence: 1 } as any],
      H_boardToImage,
      0,
    );
    // Single 20 => 20
    expect(scored0.score).toBe(20);
    expect(scored0.ring).toBe("SINGLE");

    // Rotate by +18 degrees (one sector). That should shift from sector 20 to sector 1.
    const theta = (18 * Math.PI) / 180;
    const [scored1] = scoreDarts(
      [{ x: pImg.x, y: pImg.y, radius: 5, confidence: 1 } as any],
      H_boardToImage,
      theta,
    );
    // Sector after rotating 1 step clockwise in our index space should be SectorOrder[1] = 1
    // => single 1 = 1
    const expectedSector = SectorOrder[1];
    expect(expectedSector).toBe(1);
    expect(scored1.score).toBe(1);
    expect(scored1.ring).toBe("SINGLE");
  });
});
