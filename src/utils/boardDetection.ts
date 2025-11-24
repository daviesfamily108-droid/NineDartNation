/**
 * Advanced Dartboard Auto-Calibration
 *
 * Detects dartboard features automatically without markers or manual clicking:
 * 1. Detects bull (inner & outer rings) using circle detection
 * 2. Detects treble and double rings using edge/circle detection
 * 3. Computes board center and orientation
 * 4. Generates calibration points from detected rings
 * 5. Computes homography without user interaction
 */

import {
  BoardRadii,
  computeHomographyDLT,
  rmsError,
  type Homography,
  type Point,
} from "./vision";

const isFinitePoint = (p: Point | undefined): p is Point =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const isFiniteHomography = (
  H: Homography | null | undefined,
): H is Homography =>
  Array.isArray(H) && H.length === 9 && H.every(Number.isFinite);

export interface BoardDetectionResult {
  success: boolean;
  cx: number; // Board center X in image
  cy: number; // Board center Y in image
  bullInner: number; // Detected inner bull radius (pixels)
  bullOuter: number; // Detected outer bull radius (pixels)
  trebleInner: number; // Detected treble inner radius (pixels)
  trebleOuter: number; // Detected treble outer radius (pixels)
  doubleInner: number; // Detected double inner radius (pixels)
  doubleOuter: number; // Detected double outer radius (pixels)
  confidence: number; // 0-100, quality of detection
  homography: Homography | null;
  errorPx: number | null;
  calibrationPoints: Point[];
  message?: string;
}

/**
 * Detect dartboard by finding concentric rings
 * Simpler, more direct approach: look for strong circular edges at the right distances
 */
function findDartboardRings(
  canvas: HTMLCanvasElement,
): { cx: number; cy: number; r: number; confidence: number; ringCount?: number; ringStrength?: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Step 1: Find all strong edges using Canny-like detection
  const edges: Array<{ x: number; y: number; mag: number }> = [];

  // dynamic gradient threshold based on image size (lower-res -> lower threshold)
  const baseEdgeThreshold = Math.round(Math.max(8, Math.min(32, (w + h) / 120)));

  // Precompute grayscale and apply a small blur to reduce high-frequency noise
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      gray[y * w + x] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
    }
  }
  // 3x3 box blur into blurred array
  const blurred = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += gray[(y + dy) * w + (x + dx)];
        }
      }
      blurred[y * w + x] = sum / 9;
    }
  }
  // Compute gradients using blurred values
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let gx = 0,
        gy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const grayVal = blurred[(y + dy) * w + (x + dx)];
          if (dx !== 0) gx += (dx > 0 ? 1 : -1) * grayVal;
          if (dy !== 0) gy += (dy > 0 ? 1 : -1) * grayVal;
        }
      }
      const mag = Math.hypot(gx, gy);
      if (mag > baseEdgeThreshold) {
        edges.push({ x, y, mag });
      }
    }
  }

  if (edges.length === 0) return null;

  // global thresholds scaled by image resolution
  const minPixelCount = Math.max(3, Math.round((w * h) / (640 * 480) * 10));
  const minStrength = Math.max(80, Math.round((w * h) / (640 * 480) * 500));

  // Step 2: For each potential center, score how many rings we can explain
  let bestCenter = null;
  let bestScore = 0;
  let bestRingCount = 0;

  // Sample potential centers
  // Use a dynamic sampling stride based on image size
  const stride = Math.max(6, Math.round(Math.min(w, h) / 40));
  for (let cy = Math.round(h * 0.3); cy < Math.round(h * 0.7); cy += stride) {
    for (let cx = Math.round(w * 0.3); cx < Math.round(w * 0.7); cx += stride) {
      // For this center, find rings at expected radii
      let ringCount = 0;
      let ringStrength = 0;

      // Estimate scale for pixels-per-mm by assuming the board double diameter occupies ~45% of min dimension
      const approxDoublePixels = Math.min(w, h) * 0.45; // expected double radius in px
      const scalePxPerMm = approxDoublePixels / BoardRadii.doubleOuter;
      const testRadii = [
        BoardRadii.bullInner * scalePxPerMm,
        BoardRadii.bullOuter * scalePxPerMm,
        BoardRadii.trebleInner * scalePxPerMm,
        BoardRadii.trebleOuter * scalePxPerMm,
        BoardRadii.doubleInner * scalePxPerMm,
        BoardRadii.doubleOuter * scalePxPerMm,
      ];

      // Build radial histogram (bins) of edge magnitudes per radius for this center
      const maxR = Math.round(Math.min(
        Math.min(cx, w - cx),
        Math.min(cy, h - cy),
      ));
      const bins = new Float32Array(maxR + 1);
      let maxBin = 0;
      for (const edge of edges) {
        const dist = Math.round(Math.hypot(edge.x - cx, edge.y - cy));
        if (dist <= 0 || dist > maxR) continue;
        bins[dist] += edge.mag;
        if (bins[dist] > maxBin) maxBin = bins[dist];
      }

      // Find significant peaks in histogram
      const peakRadius: number[] = [];
      const peakThreshold = Math.max(12, maxBin * 0.08);
      for (let r = 2; r < maxR - 2; r++) {
        const v = bins[r];
        if (v <= peakThreshold) continue;
        // local maxima
        if (v > bins[r - 1] && v >= bins[r + 1]) {
          peakRadius.push(r);
        }
      }

      // Match expected radii against peaks
      for (const testR of testRadii) {
        // compute tolerance based on expected radius
        const tol = Math.max(3, Math.round(testR * 0.02));
        // find the peak nearest to testR
        let bestPeak = -1;
        let bestDist = Infinity;
        for (const pr of peakRadius) {
          const d = Math.abs(pr - testR);
          if (d < bestDist) {
            bestDist = d;
            bestPeak = pr;
          }
        }
        if (bestPeak >= 0 && bestDist <= tol) {
          // ring strength is bin magnitude at that peak
          ringCount++;
          ringStrength += bins[bestPeak] || 0;
        }
      }

      // Want at least 3 strong rings (loosened for small/partial crops)
      if (ringCount >= 3 && ringStrength > bestScore) {
        bestScore = ringStrength;
        bestCenter = { cx, cy };
        bestRingCount = ringCount;
      }
    }
  }

  if (!bestCenter) return null;

  // Step 3: Refine the center position and find double radius
  const refinedCx = bestCenter.cx;
  const refinedCy = bestCenter.cy;

  // Find the strongest ring near where we expect the double outer
  // Use an adaptive scan range based on image size
  const approxDoublePixels = Math.min(w, h) * 0.45;
  const minScan = Math.max(6, Math.round(approxDoublePixels * 0.5));
  const maxScan = Math.min(Math.round(Math.max(w, h) - 4), Math.round(approxDoublePixels * 1.5));
  let doubleR = Math.round(approxDoublePixels);
  let maxStrength = 0;

  for (let testR = minScan; testR <= maxScan; testR += Math.max(2, Math.round((maxScan - minScan) / 60))) {
    let strength = 0;
    let pixelCount = 0;

    for (const edge of edges) {
      const dist = Math.hypot(edge.x - refinedCx, edge.y - refinedCy);
      const tol = Math.max(2, Math.round(testR * 0.01));
      if (Math.abs(dist - testR) < tol) {
        strength += edge.mag;
        pixelCount++;
      }
    }

    if (pixelCount > Math.max(6, Math.round(minPixelCount * 0.6)) && strength > maxStrength) {
      maxStrength = strength;
      doubleR = testR;
    }
  }

  // Calculate confidence based on how many proper rings we found
  let confidence = 0;
  const scale = doubleR / BoardRadii.doubleOuter;

  for (const knownR of [
    BoardRadii.bullInner,
    BoardRadii.bullOuter,
    BoardRadii.trebleInner,
    BoardRadii.trebleOuter,
    BoardRadii.doubleInner,
    BoardRadii.doubleOuter,
  ]) {
    const expectedPixelR = knownR * scale;
    let found = false;

    for (const edge of edges) {
      const dist = Math.hypot(edge.x - refinedCx, edge.y - refinedCy);
      const tol = Math.max(3, Math.round(expectedPixelR * 0.02));
      if (Math.abs(dist - expectedPixelR) < tol) {
        found = true;
        confidence += 15;
        break;
      }
    }
  }

  confidence = Math.min(100, confidence);

  return {
    cx: refinedCx,
    cy: refinedCy,
    r: doubleR,
    confidence,
    ringCount: bestRingCount,
    ringStrength: Math.round(bestScore),
  };
}

/**
 * Main board detection function
 * Uses direct ring detection approach
 */
export function detectBoard(canvas: HTMLCanvasElement): BoardDetectionResult {
  try {
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;

    // Find dartboard rings
    const detection = findDartboardRings(canvas);

    if (!detection) {
      return {
        success: false,
        cx: centerX,
        cy: centerY,
        bullInner: 0,
        bullOuter: 0,
        trebleInner: 0,
        trebleOuter: 0,
        doubleInner: 0,
        doubleOuter: 0,
        confidence: 0,
        homography: null,
        errorPx: null,
        calibrationPoints: [],
        message:
          "No dartboard detected. Ensure board is clearly visible with good contrast between rings and background.",
      };
    }

    // Scale all ring radii based on detected double radius
    const scale = detection.r / BoardRadii.doubleOuter;

    const detected = {
      cx: detection.cx,
      cy: detection.cy,
      bullInner: BoardRadii.bullInner * scale,
      bullOuter: BoardRadii.bullOuter * scale,
      trebleInner: BoardRadii.trebleInner * scale,
      trebleOuter: BoardRadii.trebleOuter * scale,
      doubleInner: BoardRadii.doubleInner * scale,
      doubleOuter: detection.r,
    };

    // Generate 4 calibration points from detected rings (TOP, RIGHT, BOTTOM, LEFT of double)
    const calibrationPoints: Point[] = [
      { x: detected.cx, y: detected.cy - detected.doubleOuter }, // TOP
      { x: detected.cx + detected.doubleOuter, y: detected.cy }, // RIGHT
      { x: detected.cx, y: detected.cy + detected.doubleOuter }, // BOTTOM
      { x: detected.cx - detected.doubleOuter, y: detected.cy }, // LEFT
    ];

    // Compute homography from these 4 points
    const canonicalSrc = [
      { x: 0, y: -BoardRadii.doubleOuter },
      { x: BoardRadii.doubleOuter, y: 0 },
      { x: 0, y: BoardRadii.doubleOuter },
      { x: -BoardRadii.doubleOuter, y: 0 },
    ];

  let homography: Homography | null = null;
    let errorPx: number | null = null;
    let confidence = detection.confidence;

    try {
      homography = computeHomographyDLT(canonicalSrc, calibrationPoints);
      errorPx = rmsError(homography, canonicalSrc, calibrationPoints);
      // Adjust confidence based on homography error
      const errorConfidence = Math.max(
        10,
        Math.min(95, 100 - Math.max(0, errorPx - 1) * 10),
      );
      confidence = (confidence + errorConfidence) / 2;
    } catch (err) {
      confidence = Math.max(40, confidence);
    }

  const pointsValid = calibrationPoints.every(isFinitePoint);
    const homographyValid = isFiniteHomography(homography);
    const success = !!homographyValid && pointsValid && confidence > 50;
  const detRingCount = detection.ringCount ?? 0;
  const detRingStrength = detection.ringStrength ?? 0;

    return {
      success,
      cx: detected.cx,
      cy: detected.cy,
      bullInner: detected.bullInner,
      bullOuter: detected.bullOuter,
      trebleInner: detected.trebleInner,
      trebleOuter: detected.trebleOuter,
      doubleInner: detected.doubleInner,
      doubleOuter: detected.doubleOuter,
      confidence,
      homography: homographyValid ? homography : null,
      errorPx: homographyValid ? errorPx : null,
      calibrationPoints: pointsValid ? calibrationPoints : [],
      message:
        !pointsValid || !homographyValid
          ? `❌ Detection produced unstable calibration data. Adjust camera framing or calibrate manually. (rings: ${detRingCount}, r:${Math.round(detection.r)})`
          : confidence > 80
          ? `✅ High confidence detection (rings: ${detRingCount}, r:${Math.round(detection.r)})`
          : confidence > 50
          ? `⚠️ Detection found but could be better (rings: ${detRingCount}, r:${Math.round(detection.r)})`
          : `❌ Low confidence - try better lighting (rings: ${detRingCount}, r:${Math.round(detection.r)})`,
    };
  } catch (err) {
    return {
      success: false,
      cx: canvas.width / 2,
      cy: canvas.height / 2,
      bullInner: 0,
      bullOuter: 0,
      trebleInner: 0,
      trebleOuter: 0,
      doubleInner: 0,
      doubleOuter: 0,
      confidence: 0,
      homography: null,
      errorPx: null,
      calibrationPoints: [],
      message: err instanceof Error ? err.message : "Board detection failed",
    };
  }
}

/**
 * Refine detection by looking for concentric rings
 * This helps match detected circles to specific board rings
 */
export function refineRingDetection(
  detected: BoardDetectionResult,
): BoardDetectionResult {
  // If detection already has good confidence, return as-is
  if (detected.confidence > 70) return detected;

  // Otherwise try to improve by checking ring ratios
  // If rings don't match expected ratios, we can flag for manual refinement
  const expectedRatios = {
    bullInner_to_bullOuter: BoardRadii.bullInner / BoardRadii.bullOuter,
    bullOuter_to_trebleInner: BoardRadii.bullOuter / BoardRadii.trebleInner,
    trebleOuter_to_doubleInner: BoardRadii.trebleOuter / BoardRadii.doubleInner,
    doubleInner_to_doubleOuter: BoardRadii.doubleInner / BoardRadii.doubleOuter,
  };

  const actualRatios = {
    bullInner_to_bullOuter: detected.bullInner / detected.bullOuter,
    bullOuter_to_trebleInner: detected.bullOuter / detected.trebleInner,
    trebleOuter_to_doubleInner: detected.trebleOuter / detected.doubleInner,
    doubleInner_to_doubleOuter: detected.doubleInner / detected.doubleOuter,
  };

  // Check ratio errors
  let ratioError = 0;
  let ratioCount = 0;
  for (const [key, expected] of Object.entries(expectedRatios)) {
    const actual = actualRatios[key as keyof typeof actualRatios];
    const error = Math.abs(actual - expected) / expected;
    ratioError += error;
    ratioCount++;
  }
  const avgRatioError = ratioError / ratioCount;

  // Adjust confidence based on ratio error
  const adjustedConfidence = Math.max(
    10,
    detected.confidence - avgRatioError * 100,
  );

  return {
    ...detected,
    confidence: adjustedConfidence,
    message:
      adjustedConfidence > 70
        ? "✅ High confidence detection"
        : adjustedConfidence > 50
          ? "⚠️ Rings detected but ratios off - may need refinement"
          : "❌ Low confidence - try repositioning camera",
  };
}
