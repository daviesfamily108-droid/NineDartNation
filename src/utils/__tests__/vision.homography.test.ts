import { describe, expect, it } from "vitest";
import {
  canonicalRimTargets,
  computeHomographyDLT,
  rmsError,
  imageToBoard,
  applyHomography,
  type Homography,
} from "../vision";

describe("homography round-trip", () => {
  it("computes homography and round-trips points (small error)", () => {
    const src = canonicalRimTargets("outer");

    // Create a synthetic ground-truth homography (scale, rotate, translate)
    const scale = 2.3;
    const angle = Math.PI / 12; // 15 degrees
    const tx = 37;
    const ty = -22;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // H maps board (mm) -> image (px) via simple affine + projective last row
    const H_true: Homography = [
      scale * cos,
      -scale * sin,
      tx,
      scale * sin,
      scale * cos,
      ty,
      0.00001,
      -0.00002,
      1,
    ];

    // Generate destination points by applying H_true
    const dst = src.map((p) => applyHomography(H_true, p));

    // Compute homography from correspondences
    const H_est = computeHomographyDLT(src, dst);

    const error = rmsError(H_est, src, dst);
    expect(error).toBeLessThan(1e-6); // near-zero error for exact correspondences

    // Test round-trip: pick a few board points, map to image with true H, then invert H_est
    const boardPoints = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: -50, y: 80 },
      { x: 37.5, y: -22.3 },
    ];

    for (const bp of boardPoints) {
      const imgTrue = applyHomography(H_true, bp);
      const back = imageToBoard(H_est, imgTrue);
      expect(back).not.toBeNull();
      if (back) {
        expect(Math.hypot(back.x - bp.x, back.y - bp.y)).toBeLessThan(1e-3);
      }
    }
  });
});
