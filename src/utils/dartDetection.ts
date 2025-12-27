/**
 * Dart Detection System
 *
 * Detects red dart tips in the camera image using:
 * 1. Red color filtering (HSV hue 340-20°)
 * 2. Circle detection (Hough or contour)
 * 3. Tip localization (sub-pixel accuracy)
 * 4. Confidence scoring
 */

import type { Point, Homography } from "./vision";
import { imageToBoard, scoreAtBoardPoint, isPointOnBoard, BoardRadii } from "./vision";

export interface DartDetectionConfig {
  minConfidence?: number; // 0-1, default 0.7 (we'll override to 0.8 for stricter)
  maxDarts?: number; // max darts to detect, default 3
  tipRadiusPx?: number; // search radius for tip center, default 8
  minArea?: number; // minimum blob area to consider
  hsv?: { hMin?: number; hMax?: number; sMin?: number; vMin?: number };
}

export interface DetectedDart {
  x: number; // image x coordinate
  y: number; // image y coordinate
  radius: number; // dart tip radius in pixels
  confidence: number; // 0-1
  color?: { r: number; g: number; b: number; h: number; s: number; v: number };
  boardPoint?: Point; // after homography transformation
  score?: number; // 0-180
  ring?: string; // "BULL" | "INNER_BULL" | "TRIPLE" | "DOUBLE" | "SINGLE" | "MISS"
}

export interface DartDetectionResult {
  darts: DetectedDart[];
  confidence: number; // overall confidence 0-1
  frameQuality: number; // 0-1, how good the frame is for dart detection
  timestamp: number;
}

/**
 * Detect red dart tips in canvas
 * Optimized for standard red darts with black flights
 */
export function detectDarts(
  canvas: HTMLCanvasElement,
  config: DartDetectionConfig = {},
): DartDetectionResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      darts: [],
      confidence: 0,
      frameQuality: 0,
      timestamp: Date.now(),
    };
  }

  const w = canvas.width;
  const h = canvas.height;
  const cfg: Required<DartDetectionConfig> = {
    minConfidence: config.minConfidence ?? 0.8,
    maxDarts: config.maxDarts ?? 3,
    tipRadiusPx: config.tipRadiusPx ?? 8,
    minArea: config.minArea ?? 60,
    hsv: {
      hMin: config.hsv?.hMin ?? 340,
      hMax: config.hsv?.hMax ?? 20,
      sMin: config.hsv?.sMin ?? 0.5,
      vMin: config.hsv?.vMin ?? 0.35,
    },
  };

  // 1. Get image data
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 2. RGB to HSV and filter red
  const redMask = new Uint8Array(w * h); // 0 = not red, 255 = red
  let redPixelCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const pixelIdx = i / 4;

    const { h, s, v } = rgb2hsv(r, g, b);

    // Check if red (hue 340-360 or 0-20 degrees)
    const isRed =
      (h >= (cfg.hsv?.hMin ?? 340) || h <= (cfg.hsv?.hMax ?? 20)) &&
      s >= (cfg.hsv?.sMin ?? 0.4) &&
      v >= (cfg.hsv?.vMin ?? 0.3);

    if (isRed) {
      redMask[pixelIdx] = 255;
      redPixelCount++;
    }
  }

  // 3. Evaluate frame quality
  const frameQuality = Math.min(1, redPixelCount / (w * h * 0.05)); // 5% red = perfect
  console.log(
    `[detectDarts] Frame quality: ${frameQuality.toFixed(2)} (red pixels: ${redPixelCount})`,
  );

  if (frameQuality < 0.1) {
    // Very few red pixels, probably wrong lighting
    return {
      darts: [],
      confidence: 0,
      frameQuality,
      timestamp: Date.now(),
    };
  }

  // 4. Find circles using contour/blob detection
  // Simple approach: find connected components in red mask
  const visited = new Uint8Array(w * h);
  const blobs: Array<{
    cx: number;
    cy: number;
    size: number;
    pixels: number[];
  }> = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (redMask[idx] === 255 && visited[idx] === 0) {
        // Start flood fill
        const blob = floodFill(redMask, visited, x, y, w, h);
        if (blob.size >= cfg.minArea) {
          // Only keep blobs with reasonable size
          blobs.push(blob);
        }
      }
    }
  }

  console.log(`[detectDarts] Found ${blobs.length} red blobs`);

  // 5. Convert blobs to circles and estimate tip
  const candidates: DetectedDart[] = [];

  for (const blob of blobs) {
    const tipCandidate = blobToCircle(blob, data, w, h);
    if (tipCandidate && tipCandidate.confidence >= cfg.minConfidence) {
      candidates.push(tipCandidate);
    }
  }

  // 6. Sort by confidence and keep top N
  candidates.sort((a, b) => b.confidence - a.confidence);
  const darts = candidates.slice(0, cfg.maxDarts);

  console.log(
    `[detectDarts] Detected ${darts.length} darts with confidence`,
    darts.map((d) => d.confidence.toFixed(2)),
  );

  // 7. Compute overall confidence
  const overallConfidence =
    darts.length > 0
      ? darts.reduce((sum, d) => sum + d.confidence, 0) / darts.length
      : 0;

  return {
    darts,
    confidence: overallConfidence,
    frameQuality,
    timestamp: Date.now(),
  };
}

/**
 * Apply homography to detected darts and calculate scores
 */
export function scoreDarts(
  darts: DetectedDart[],
  H: Homography,
  theta?: number,
): DetectedDart[] {
  return darts.map((dart) => {
    try {
      const boardPoint = imageToBoard(H, { x: dart.x, y: dart.y });
      if (!boardPoint) return dart;

      // Reject off-board or far-out points (extra 2mm tolerance)
      if (!isPointOnBoard(boardPoint)) return dart;

      const score = scoreAtBoardPoint(boardPoint);
      if (!score) return dart;

      return {
        ...dart,
        boardPoint,
        score: score.base * (score.mult as number),
        ring: score.ring,
      };
    } catch (err) {
      console.warn("[scoreDarts] Failed to score dart:", err);
      return dart;
    }
  });
}

/**
 * Flood fill to find connected red pixels
 */
function floodFill(
  mask: Uint8Array,
  visited: Uint8Array,
  startX: number,
  startY: number,
  w: number,
  h: number,
): { cx: number; cy: number; size: number; pixels: number[] } {
  const stack: Array<[number, number]> = [[startX, startY]];
  const pixels: number[] = [];
  let sumX = 0,
    sumY = 0;

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * w + x;

    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (visited[idx] !== 0 || mask[idx] === 0) continue;

    visited[idx] = 1;
    pixels.push(idx);
    sumX += x;
    sumY += y;

    // Check 4-connected neighbors
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const size = pixels.length;
  const cx = sumX / size;
  const cy = sumY / size;

  return { cx, cy, size, pixels };
}

/**
 * Estimate circle from blob
 * Returns dart with tip position and confidence
 */
function blobToCircle(
  blob: { cx: number; cy: number; size: number; pixels: number[] },
  data: Uint8ClampedArray,
  w: number,
  h: number,
): DetectedDart | null {
  // Estimate radius as sqrt(area / π)
  const estimatedRadius = Math.sqrt(blob.size / Math.PI);

   // Reject blobs that are clearly too small/large to be dart tips
  if (estimatedRadius < 3 || estimatedRadius > 40) return null;

  // Refine center by finding densest pixel cluster
  const refinedCenter = refineCircleCenter(blob, w, h);

  // Estimate confidence based on blob circularity
  // Perfect circle = 1.0, very elongated = 0.0
  const circularity = calculateCircularity(blob, refinedCenter, w, h);

  // Sample color at center
  const centerIdx =
    (Math.round(refinedCenter.y) * w + Math.round(refinedCenter.x)) * 4;
  const color = {
    r: data[centerIdx],
    g: data[centerIdx + 1],
    b: data[centerIdx + 2],
  };
  const { h: hue, s, v } = rgb2hsv(color.r, color.g, color.b);

  // Confidence combines:
  // - Circularity (shape)
  // - Size (dart must be reasonable size)
  // - Saturation (must be vivid red)
  const sizeConfidence = Math.min(1, blob.size / 500); // 500px² = good dart size
  const shapeConfidence = circularity;
  const colorConfidence = Math.min(1, s * 2); // High saturation = high confidence

  const confidence =
    0.5 * shapeConfidence + 0.3 * sizeConfidence + 0.2 * colorConfidence;

  // Enforce a minimal shape confidence to avoid elongated/edge noise
  if (shapeConfidence < 0.55) return null;

  return {
    x: refinedCenter.x,
    y: refinedCenter.y,
    radius: estimatedRadius,
    confidence,
    color: { r: color.r, g: color.g, b: color.b, h: hue, s, v },
  };
}

/**
 * Refine circle center by finding local density maximum
 */
function refineCircleCenter(
  blob: { cx: number; cy: number; size: number; pixels: number[] },
  w: number,
  h: number,
): Point {
  // Start at centroid
  let bestX = blob.cx;
  let bestY = blob.cy;
  let bestScore = calculateDensityAt(blob, bestX, bestY, w, h);

  // Hill climbing: try nearby positions
  const searchRadius = 5;
  for (let dx = -searchRadius; dx <= searchRadius; dx++) {
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      const x = blob.cx + dx;
      const y = blob.cy + dy;
      const score = calculateDensityAt(blob, x, y, w, h);
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  return { x: bestX, y: bestY };
}

/**
 * Calculate pixel density around a point
 */
function calculateDensityAt(
  blob: { cx: number; cy: number; size: number; pixels: number[] },
  cx: number,
  cy: number,
  w: number,
  h: number,
): number {
  let count = 0;
  const radius = 10;

  for (const pixelIdx of blob.pixels) {
    const x = pixelIdx % w;
    const y = Math.floor(pixelIdx / w);
    const dist = Math.hypot(x - cx, y - cy);
    if (dist <= radius) count++;
  }

  return count;
}

/**
 * Calculate blob circularity (0-1)
 * 1.0 = perfect circle, 0.0 = very elongated
 */
function calculateCircularity(
  blob: { cx: number; cy: number; size: number; pixels: number[] },
  center: Point,
  w: number,
  h: number,
): number {
  // Calculate distance variance from center
  const distances: number[] = [];
  for (const pixelIdx of blob.pixels) {
    const x = pixelIdx % w;
    const y = Math.floor(pixelIdx / w);
    const dist = Math.hypot(x - center.x, y - center.y);
    distances.push(dist);
  }

  const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance =
    distances.reduce((a, d) => a + Math.pow(d - meanDist, 2), 0) /
    distances.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation: low = circular, high = elongated
  const cv = stdDev / meanDist;

  // Convert to 0-1 confidence (lower CV = higher confidence)
  return Math.max(0, 1 - cv);
}

/**
 * Convert RGB to HSV
 */
function rgb2hsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s, v };
}

export default {
  detectDarts,
  scoreDarts,
};
