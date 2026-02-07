import type { Homography, Point } from "./vision.js";
import {
  imageToBoard,
  scoreAtBoardPointTheta,
  scoreAtBoardPoint,
} from "./vision.js";

export type AutoscoreV2Config = {
  minConfidence?: number; // default 0.8
  requireStableN?: number; // default 2 frames
  tipRadiusPx?: number; // search radius for tip refinement
};

export type AutoscoreV2Result = {
  base: number;
  ring: "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL";
  sector: number | null;
  mult: 0 | 1 | 2 | 3;
  confidence: number;
  pCal?: Point;
  pBoard?: Point | null;
};

/**
 * Autoscore v2 (scaffold):
 * - Accepts a pre-extracted tip in calibration image coords (or a patch to detect from)
 * - Applies homography to map to board coords
 * - Uses orientation-aware scoring if theta is present
 * - Adds simple stability gating and confidence computation
 */
export class AutoscoreV2 {
  private cfg: Required<AutoscoreV2Config>;
  private lastTip?: Point;
  private stableCount = 0;

  constructor(cfg: AutoscoreV2Config = {}) {
    this.cfg = {
      minConfidence: cfg.minConfidence ?? 0.8,
      requireStableN: cfg.requireStableN ?? 2,
      tipRadiusPx: cfg.tipRadiusPx ?? 6,
    };
  }

  /**
   * Provide a detected tip in calibration image space and compute score.
   * If no tip is provided, returns a MISS with low confidence.
   */
  scoreTip(
    H: Homography,
    pCal: Point,
    theta?: number,
    sectorOffset?: number,
  ): AutoscoreV2Result {
    // Stability: if tip is very close to last tip, increase stable count
    if (this.lastTip) {
      const dx = pCal.x - this.lastTip.x;
      const dy = pCal.y - this.lastTip.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= this.cfg.tipRadiusPx) this.stableCount++;
      else this.stableCount = 1;
    } else {
      this.stableCount = 1;
    }
    this.lastTip = pCal;

    const pBoard = imageToBoard(H, pCal);
    if (!pBoard) {
      return {
        base: 0,
        ring: "MISS",
        sector: null,
        mult: 0,
        confidence: 0.1,
        pCal,
        pBoard: null,
      };
    }
    const s =
      typeof theta === "number"
        ? scoreAtBoardPointTheta(pBoard, theta, sectorOffset ?? 0)
        : scoreAtBoardPoint(pBoard);
    // naive confidence: higher for rings > SINGLE and when stable
    const ringBoost =
      s.ring === "TRIPLE" || s.ring === "DOUBLE" || s.ring === "INNER_BULL"
        ? 0.3
        : s.ring === "BULL"
          ? 0.2
          : 0.1;
    const stableBoost = Math.min(0.4, (this.stableCount - 1) * 0.2);
    const confidence = Math.max(
      this.cfg.minConfidence,
      0.6 + ringBoost + stableBoost,
    );
    return {
      base: s.base,
      ring: s.ring,
      sector: s.sector,
      mult: s.mult,
      confidence,
      pCal,
      pBoard,
    };
  }
}
