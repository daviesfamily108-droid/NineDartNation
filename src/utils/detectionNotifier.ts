import type { DartDetector as DD } from "./dartDetector";
import { scoreFromImagePoint } from "./autoscore";
import type { Homography, Point } from "./vision";

export async function runDetectionAndNotify(
  detector: any,
  frame: ImageData | any,
  H: Homography,
  imageSize: { w: number; h: number },
  onAutoDart?: (
    value: number,
    ring: string,
    info?: { sector: number | null; mult: number },
  ) => void,
) {
  if (!detector || !onAutoDart) return;
  const det = detector.detect(frame);
  if (!det || typeof det.confidence !== "number" || det.confidence < 0.6)
    return;
  // Assume det.tip is already in calibration image pixel coords
  const pCal: Point = { x: det.tip.x, y: det.tip.y };
  const score = scoreFromImagePoint(H, pCal);
  try {
    // If parent handler returns an ack/promise, await it so callers can coordinate commits
    if (onAutoDart) await Promise.resolve(onAutoDart(score.base, score.ring as any, {
      sector: score.sector ?? null,
      mult: (score.mult as any) ?? 0,
    }));
  } catch {}
}
