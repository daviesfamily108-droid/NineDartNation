import { scoreFromImagePoint } from "./autoscore.js";
import type { Homography, Point } from "./vision.js";

export async function runDetectionAndNotify(
  detector: any,
  frame: ImageData | any,
  H: Homography,
  imageSize: { w: number; h: number },
  thetaOrCallback?:
    | number
    | ((
        value: number,
        ring: string,
        info?: { sector: number | null; mult: number },
      ) => void),
  maybeCallback?: (
    value: number,
    ring: string,
    info?: { sector: number | null; mult: number },
  ) => void,
) {
  const theta =
    typeof thetaOrCallback === "number" ? thetaOrCallback : undefined;
  const onAutoDart =
    typeof thetaOrCallback === "function" ? thetaOrCallback : maybeCallback;
  if (!detector || !onAutoDart) return;
  const det = detector.detect(frame);
  if (!det || typeof det.confidence !== "number" || det.confidence < 0.6)
    return;
  // Assume det.tip is already in calibration image pixel coords
  const pCal: Point = { x: det.tip.x, y: det.tip.y };
  // Support both old and new signatures: where theta is optional and
  // onAutoDart may have been passed as the 5th argument.
  const score = scoreFromImagePoint(H, pCal, theta);
  try {
    // If parent handler returns an ack/promise, await it so callers can coordinate commits
    if (onAutoDart)
      await Promise.resolve(
        onAutoDart(score.base, score.ring as any, {
          sector: score.sector ?? null,
          mult: (score.mult as any) ?? 0,
        }),
      );
  } catch {}
}
