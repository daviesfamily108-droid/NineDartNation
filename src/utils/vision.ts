// Vision and calibration utilities for dartboard mapping
// Standard dartboard: 18 inches (457.2 mm) outer diameter
// Board dimensions follow standard measurements (millimeters)
// - Inner bull radius: 6.35 mm (12.7 mm diameter)
// - Outer bull radius: 15.9 mm (31.8 mm diameter)
// - Treble inner radius: 99 mm
// - Treble outer radius: 107 mm
// - Double inner radius: 162 mm
// - Double outer radius: 170 mm (playing field outer edge = 340 mm diameter)

export type Point = { x: number; y: number };
export type Homography = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]; // row-major 3x3

export const BoardRadii = {
  bullInner: 6.35,
  bullOuter: 15.9,
  trebleInner: 99,
  trebleOuter: 107,
  doubleInner: 162,
  doubleOuter: 170,
};

export const CalibrationGuideRadii = BoardRadii;

export const SectorOrder = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];

// Basic 3x3 matrix operations
export function matMul3(a: Homography, b: Homography): Homography {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
      }
    }
  }
  return r as Homography;
}

export function applyHomography(H: Homography, p: Point): Point {
  const x = p.x,
    y = p.y;
  const w = H[6] * x + H[7] * y + H[8];
  const nx = (H[0] * x + H[1] * y + H[2]) / w;
  const ny = (H[3] * x + H[4] * y + H[5]) / w;
  return { x: nx, y: ny };
}

// Scale a homography by sx, sy on the destination/image side: H' = S * H
// Where S = diag([sx, sy, 1])
export function scaleHomography(
  H: Homography,
  sx: number,
  sy: number,
): Homography {
  return [
    sx * H[0],
    sx * H[1],
    sx * H[2],
    sy * H[3],
    sy * H[4],
    sy * H[5],
    H[6],
    H[7],
    H[8],
  ] as Homography;
}

// Rotate a homography around the board center by angle (in radians, counter-clockwise)
// Creates a rotation matrix R and applies it: H' = R * H
export function rotateHomography(
  H: Homography,
  angleRadians: number,
): Homography {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  // Rotation matrix R = [cos -sin 0; sin cos 0; 0 0 1]
  const R: Homography = [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
  // We want to rotate the board coordinates before applying the homography
  // so the correct composition is H' = H * R (rotate board, then map to image).
  // Applying R on the left (R * H) would instead rotate the image space.
  return matMul3(H, R);
}

// Translate a homography on the destination/image side by (tx, ty): H' = T * H
// Where T = [1 0 tx; 0 1 ty; 0 0 1]
export function translateHomography(
  H: Homography,
  tx: number,
  ty: number,
): Homography {
  const T: Homography = [1, 0, tx, 0, 1, ty, 0, 0, 1];
  return matMul3(T, H);
}

export function invertHomography(H: Homography): Homography {
  // Inverse of 3x3 matrix
  const m = H;
  const a = m[0],
    b = m[1],
    c = m[2],
    d = m[3],
    e = m[4],
    f = m[5],
    g = m[6],
    h = m[7],
    i = m[8];
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const Hh = b * g - a * h;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) throw new Error("Singular homography");
  const inv = [
    A / det,
    B / det,
    C / det,
    D / det,
    E / det,
    F / det,
    G / det,
    Hh / det,
    I / det,
  ] as Homography;
  return inv;
}

// Compute homography H that maps src (board space) -> dst (image space)
// Using N correspondences via DLT (solved by Gaussian elimination) with least-squares fit
// Supports overdetermined systems (N > 4) for improved accuracy
export function computeHomographyDLT(src: Point[], dst: Point[]): Homography {
  if (src.length < 4 || dst.length < 4)
    throw new Error("Need at least 4 correspondences");
  if (src.length !== dst.length)
    throw new Error("Correspondences must have equal length");
  // Build A * h = b where h = [h11 h12 h13 h21 h22 h23 h31 h32]^T and h33 = 1
  const A: number[][] = [];
  const B: number[] = [];
  for (let k = 0; k < src.length; k++) {
    const { x: X, y: Y } = src[k];
    const { x: x, y: y } = dst[k];
    // x = (h11 X + h12 Y + h13) / (h31 X + h32 Y + 1)
    // y = (h21 X + h22 Y + h23) / (h31 X + h32 Y + 1)
    // => x*(h31 X + h32 Y + 1) = h11 X + h12 Y + h13
    // => y*(h31 X + h32 Y + 1) = h21 X + h22 Y + h23
    A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]);
    B.push(x);
    A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]);
    B.push(y);
  }
  const h = solveLeastSquares(A, B); // length 8
  const H: Homography = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  return H;
}

// Solve A x = b in least squares sense using Gaussian elimination with partial pivoting
function solveLeastSquares(A: number[][], b: number[]): number[] {
  // Normal equations: (A^T A) x = A^T b
  const m = A.length,
    n = A[0].length;
  const AtA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Atb: number[] = new Array(n).fill(0);
  for (let r = 0; r < m; r++) {
    for (let i = 0; i < n; i++) {
      Atb[i] += A[r][i] * b[r];
      for (let j = 0; j < n; j++) {
        AtA[i][j] += A[r][i] * A[r][j];
      }
    }
  }
  return gaussianSolve(AtA, Atb);
}

function gaussianSolve(M: number[][], v: number[]): number[] {
  const n = v.length;
  // Augment matrix
  const A = M.map((row, i) => row.concat([v[i]]));
  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) maxRow = r;
    }
    if (Math.abs(A[maxRow][i]) < 1e-12) throw new Error("Singular matrix");
    if (maxRow !== i) {
      const tmp = A[i];
      A[i] = A[maxRow];
      A[maxRow] = tmp;
    }
    // Eliminate
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c];
    }
  }
  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

// Canonical calibration targets in board space (mm)
// We now anchor the homography with four evenly spaced double-ring sectors:
// D20 (top), D6 (right), D3 (bottom), D11 (left), plus bullseye (center).
export function canonicalRimTargets(
  mode: "center" | "outer" = "center",
): Point[] {
  // Target the CENTER of the double ring (166mm radius)
  // This is more stable than the outer edge and ensures the point is
  // clearly within the double segment, avoiding the outer light ring.
  const radius =
    mode === "outer"
      ? (BoardRadii.doubleInner + BoardRadii.doubleOuter) / 2 // 166mm - center of double ring
      : (BoardRadii.doubleInner + BoardRadii.doubleOuter) / 2;
  const targetSectors = [20, 6, 3, 11] as const;
  const rimPoints = targetSectors.map((sector) => {
    const idx = SectorOrder.indexOf(sector);
    const angle = (idx / SectorOrder.length) * Math.PI * 2 - Math.PI / 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    return {
      x: Math.abs(x) < 1e-9 ? 0 : x,
      y: Math.abs(y) < 1e-9 ? 0 : y,
    };
  });
  // Add bullseye (center) as 5th calibration point
  rimPoints.push({ x: 0, y: 0 });
  return rimPoints;
}

// Given a homography mapping board->image, produce polylines for overlay rings (in image px)
export function sampleRing(
  H: Homography,
  radius: number,
  steps = 256,
): Point[] {
  const pts: Point[] = [];
  for (let k = 0; k < steps; k++) {
    const theta = (k / steps) * Math.PI * 2;
    const p = applyHomography(H, {
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
    });
    pts.push(p);
  }
  return pts;
}

// Estimate sectorOffset from a calibrated homography so that sector 20 aligns to the image "top".
// We measure the image-space angle from the mapped board center to the mapped D20 mid-point
// and convert that angular discrepancy into an integer sector offset in steps of 18 degrees.
export function estimateSectorOffsetFromHomography(
  H: Homography,
  mode: "center" | "outer" = "outer",
): number {
  // Board-space center and D20 mid-point
  const centerImg = applyHomography(H, { x: 0, y: 0 });
  const radius =
    mode === "outer"
      ? BoardRadii.doubleOuter
      : (BoardRadii.doubleInner + BoardRadii.doubleOuter) / 2;
  const d20Board = { x: 0, y: -radius }; // -Y points to top (sector 20 center)
  const d20Img = applyHomography(H, d20Board);
  const vx = d20Img.x - centerImg.x;
  const vy = d20Img.y - centerImg.y;
  // Image-space angle: atan2(y, x) in degrees, normalized to [0, 360)
  let degImg = (Math.atan2(vy, vx) * 180) / Math.PI;
  degImg = (degImg + 360) % 360;
  // Desired top direction is -Y, which is 270 degrees in image atan2 convention
  const desiredTop = 270; // degrees
  let delta = degImg - desiredTop; // positive if rotated clockwise relative to desired top
  // Normalize delta to [-180, 180)
  delta = ((delta + 180) % 360) - 180;
  // Convert angular delta to nearest sector steps (18 degrees per sector)
  const offset = Math.round(delta / 18);
  // Ensure offset in [0, 19] for consistency
  return ((offset % 20) + 20) % 20;
}

export function rmsError(H: Homography, src: Point[], dst: Point[]): number {
  let e2 = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applyHomography(H, src[i]);
    const dx = p.x - dst[i].x;
    const dy = p.y - dst[i].y;
    e2 += dx * dx + dy * dy;
  }
  return Math.sqrt(e2 / src.length);
}

export interface RansacOptions {
  thresholdPx?: number; // reprojection error threshold
  maxIter?: number;
  minInliers?: number;
  rng?: () => number; // optional RNG for deterministic tests
}

// Robust homography estimation using RANSAC. Returns best H, inlier mask and inlier RMS error.
export function ransacHomography(
  src: Point[],
  dst: Point[],
  opts: RansacOptions = {},
): { H: Homography | null; inliers: boolean[]; errorPx: number | null } {
  const n = src.length;
  if (n < 4 || dst.length < 4)
    throw new Error("Need at least 4 correspondences");
  const threshold = opts.thresholdPx ?? 8;
  const maxIter = opts.maxIter ?? 500;
  const minInliers = opts.minInliers ?? 4;
  const rng = opts.rng ?? Math.random;

  let bestH: Homography | null = null;
  let bestInliers: boolean[] = new Array(n).fill(false);
  let bestCount = 0;
  let bestError = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    // pick 4 unique indices
    const idxs = new Set<number>();
    while (idxs.size < 4) {
      idxs.add(Math.floor(rng() * n));
    }
    const chosen = Array.from(idxs);
    const ssub: Point[] = [];
    const dsub: Point[] = [];
    for (const i of chosen) {
      ssub.push(src[i]);
      dsub.push(dst[i]);
    }
    let Htry: Homography;
    try {
      Htry = computeHomographyDLT(ssub, dsub);
    } catch (e) {
      continue; // singular or invalid, skip
    }

    // Count inliers
    const inliers = new Array(n).fill(false);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const p = applyHomography(Htry, src[i]);
      const dx = p.x - dst[i].x;
      const dy = p.y - dst[i].y;
      const dist = Math.hypot(dx, dy);
      if (dist <= threshold) {
        inliers[i] = true;
        count++;
      }
    }

    if (count < minInliers) continue;

    // Recompute H using all inliers for better fit
    const sIn: Point[] = [];
    const dIn: Point[] = [];
    for (let i = 0; i < n; i++) {
      if (inliers[i]) {
        sIn.push(src[i]);
        dIn.push(dst[i]);
      }
    }
    let Hrefined: Homography;
    try {
      Hrefined = computeHomographyDLT(sIn, dIn);
    } catch (e) {
      continue;
    }
    const err = rmsError(Hrefined, sIn, dIn);

    // Choose better by inlier count first, then lower error
    if (count > bestCount || (count === bestCount && err < bestError)) {
      bestCount = count;
      bestError = err;
      bestH = Hrefined;
      bestInliers = inliers.slice();
    }
  }

  if (!bestH || bestCount < minInliers)
    return { H: null, inliers: new Array(n).fill(false), errorPx: null };

  // Compute final error over inliers
  const sFin: Point[] = [];
  const dFin: Point[] = [];
  for (let i = 0; i < n; i++) {
    if (bestInliers[i]) {
      sFin.push(src[i]);
      dFin.push(dst[i]);
    }
  }
  const finalError = sFin.length > 0 ? rmsError(bestH, sFin, dFin) : null;
  return { H: bestH, inliers: bestInliers, errorPx: finalError };
}

// Map an image point to board coordinates using inverse homography (image->board)
// Returns null if the homography cannot be inverted (singular matrix)
export function imageToBoard(
  H_boardToImage: Homography,
  pImg: Point,
): Point | null {
  try {
    const inv = invertHomography(H_boardToImage);
    const result = applyHomography(inv as Homography, pImg);
    // Validate that the result is finite (not NaN or Infinity)
    if (!isFinite(result.x) || !isFinite(result.y)) {
      return null;
    }
    return result;
  } catch (e) {
    return null;
  }
}

// Compute score for a board coordinate (mm)
export function scoreAtBoardPoint(p: Point): {
  base: number;
  ring: "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL";
  sector: number | null;
  mult: 0 | 1 | 2 | 3;
} {
  const r = Math.hypot(p.x, p.y);
  const ang = Math.atan2(p.y, p.x); // 0 rad at +X, increasing CCW
  // Rotate so that sector 20 is at the top (negative Y). Top corresponds to -90 degrees (or 270)
  let deg = (ang * 180) / Math.PI;
  deg = (deg + 360 + 90) % 360; // shift so 0 deg is at top

  // Shift by half a sector (9 degrees) to align boundaries.
  // Sector 20 is centered at 0 deg, spanning -9 to +9.
  // Adding 9 maps [-9, 9] to [0, 18], which floor divides to index 0.
  const index = Math.floor(((deg + 9) % 360) / 18);
  const sector = SectorOrder[index];

  // Standard dartboard dimensions (mm)
  const {
    bullInner,
    bullOuter,
    trebleInner,
    trebleOuter,
    doubleInner,
    doubleOuter,
  } = BoardRadii;

  // Apply minimal tolerance for wire-shots (0.75mm is approx half a wire width)
  const tol = 0.75;
  // Minimal outer tolerance: allow a tiny buffer for detection noise but treat
  // anything beyond the double ring as a miss.
  const outerTol = 0.5;

  // Outside board edge
  if (r > doubleOuter + outerTol)
    return { base: 0, ring: "MISS", sector: null, mult: 0 };

  // Double band (clamp to outer edge tolerance)
  if (r >= doubleInner - tol && r <= doubleOuter + outerTol)
    return { base: sector * 2, ring: "DOUBLE", sector, mult: 2 };

  // Single outer band
  if (r > trebleOuter + tol)
    return { base: sector, ring: "SINGLE", sector, mult: 1 };

  // Treble band
  if (r >= trebleInner - tol)
    return { base: sector * 3, ring: "TRIPLE", sector, mult: 3 };

  // Single inner band
  if (r > bullOuter + tol)
    return { base: sector, ring: "SINGLE", sector, mult: 1 };

  // Bulls
  if (r > bullInner + 0.5)
    return { base: 25, ring: "BULL", sector: 25, mult: 1 };

  return { base: 50, ring: "INNER_BULL", sector: 25, mult: 2 };
}

// Orientation-aware scoring: add theta (radians) to angle before sector mapping
export function scoreAtBoardPointTheta(
  p: Point,
  theta: number,
  sectorOffset: number = 0,
  rotationOffsetRad: number = 0,
): {
  base: number;
  ring: "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL";
  sector: number | null;
  mult: 0 | 1 | 2 | 3;
} {
  const r = Math.hypot(p.x, p.y);
  const ang =
    Math.atan2(p.y, p.x) +
    (Number.isFinite(theta) ? theta : 0) +
    (Number.isFinite(rotationOffsetRad) ? rotationOffsetRad : 0);
  let deg = (ang * 180) / Math.PI;
  deg = (deg + 360 + 90) % 360;
  const index = Math.floor(((deg + 9) % 360) / 18);
  const correctedIndex =
    (((index + (Number.isFinite(sectorOffset) ? sectorOffset : 0)) % 20) + 20) %
    20;
  const sector = SectorOrder[correctedIndex];

  // Standard dartboard dimensions (mm)
  const {
    bullInner,
    bullOuter,
    trebleInner,
    trebleOuter,
    doubleInner,
    doubleOuter,
  } = BoardRadii;

  // Apply minimal tolerance for wire-shots
  const tol = 0.75;

  if (r > doubleOuter + tol)
    return { base: 0, ring: "MISS", sector: null, mult: 0 };

  if (r >= doubleInner - tol)
    return { base: sector * 2, ring: "DOUBLE", sector, mult: 2 };

  if (r > trebleOuter + tol)
    return { base: sector, ring: "SINGLE", sector, mult: 1 };

  if (r >= trebleInner - tol)
    return { base: sector * 3, ring: "TRIPLE", sector, mult: 3 };

  if (r > bullOuter + tol)
    return { base: sector, ring: "SINGLE", sector, mult: 1 };

  if (r > bullInner + 0.5)
    return { base: 25, ring: "BULL", sector: 25, mult: 1 };

  return { base: 50, ring: "INNER_BULL", sector: 25, mult: 2 };
}

// Check if a point is actually on the dartboard (within valid playing area)
export function isPointOnBoard(p: Point): boolean {
  const r = Math.hypot(p.x, p.y);
  // A point is on the board if it's within the double outer radius (the edge of the board)
  // No margin - we want strict checking to ensure darts are actually on the board
  return r <= BoardRadii.doubleOuter;
}

export function drawPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  color = "#10b981",
  width = 2,
) {
  if (!pts.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawCross(
  ctx: CanvasRenderingContext2D,
  p: Point,
  color = "#f59e0b",
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - 8, p.y);
  ctx.lineTo(p.x + 8, p.y);
  ctx.moveTo(p.x, p.y - 8);
  ctx.lineTo(p.x, p.y + 8);
  ctx.stroke();
  ctx.restore();
}

// --- Point refinement using Sobel gradient ---
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function sobelAtGray(img: ImageData, x: number, y: number): number {
  const { width, data } = img;
  // Sobel kernels
  const gx = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const gy = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];
  let sx = 0,
    sy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const xi = clamp(x + i, 0, width - 1);
      const yi = clamp(y + j, 0, img.height - 1);
      const idx = (yi * width + xi) * 4;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      sx += gray * gx[j + 1][i + 1];
      sy += gray * gy[j + 1][i + 1];
    }
  }
  return Math.hypot(sx, sy);
}

export function refinePointSobel(
  canvas: HTMLCanvasElement,
  p: Point,
  radius = 6,
): Point {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cx = clamp(Math.round(p.x), 1, canvas.width - 2);
  const cy = clamp(Math.round(p.y), 1, canvas.height - 2);
  let best = { x: cx, y: cy, mag: -1 };
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x <= 0 || y <= 0 || x >= canvas.width - 1 || y >= canvas.height - 1)
        continue;
      const mag = sobelAtGray(img, x, y);
      if (mag > best.mag) best = { x, y, mag };
    }
  }
  return { x: best.x, y: best.y };
}

export function refinePointsSobel(
  canvas: HTMLCanvasElement,
  pts: Point[],
  radius = 6,
): Point[] {
  return pts.map((p) => refinePointSobel(canvas, p, radius));
}

// Detect board orientation (theta) from calibration homography
// The board has 4 calibration points on the double ring at sectors 20, 6, 3, 11 (top, right, bottom, left)
// If the camera is rotated, these sectors will appear at different angles than expected
// Returns theta in radians that can be used to correct sector calculations
export function detectBoardOrientation(
  H: Homography,
  canonicalTargets: Point[],
): number {
  // Get the 4 double ring points (indices 0-3)
  // In canonical orientation: index 0 = 20 (top), 1 = 6 (right), 2 = 3 (bottom), 3 = 11 (left)
  const rimPoints = canonicalTargets.slice(0, 4);

  // Map each board-space rim point to image space via homography
  const imagePoints = rimPoints.map((p) => applyHomography(H, p));

  // Compute the center of the points in image space
  const centerX =
    imagePoints.reduce((sum, p) => sum + p.x, 0) / imagePoints.length;
  const centerY =
    imagePoints.reduce((sum, p) => sum + p.y, 0) / imagePoints.length;

  // Compute angles of each point relative to center in image space
  // The first point (canonical 20, top) should be at angle -Ï€/2 (negative Y)
  const expectedAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const actualAngles = imagePoints.map((p) =>
    Math.atan2(p.y - centerY, p.x - centerX),
  );

  // Compute the rotation needed to align actual with expected
  // Use the first point as reference (it's the most consistent)
  let theta = expectedAngles[0] - actualAngles[0];

  // Normalize theta to [-Ï€, Ï€]
  while (theta > Math.PI) theta -= 2 * Math.PI;
  while (theta < -Math.PI) theta += 2 * Math.PI;

  return theta;
}

// Convert theta (radians) to human-readable degrees for UI display
export function thetaToDegrees(theta: number | null): number {
  if (theta === null) return 0;
  return -(theta * 180) / Math.PI; // Negate because positive theta is CCW in math, but users think CW
}
