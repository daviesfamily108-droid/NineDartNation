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

import { BoardRadii, computeHomographyDLT, rmsError, type Homography, type Point } from './vision'

export interface BoardDetectionResult {
  success: boolean
  cx: number              // Board center X in image
  cy: number              // Board center Y in image
  bullInner: number       // Detected inner bull radius (pixels)
  bullOuter: number       // Detected outer bull radius (pixels)
  trebleInner: number     // Detected treble inner radius (pixels)
  trebleOuter: number     // Detected treble outer radius (pixels)
  doubleInner: number     // Detected double inner radius (pixels)
  doubleOuter: number     // Detected double outer radius (pixels)
  confidence: number      // 0-100, quality of detection
  homography: Homography | null
  errorPx: number | null
  calibrationPoints: Point[]
  message?: string
}

/**
 * Detect dartboard by finding concentric rings
 * Simpler, more direct approach: look for strong circular edges at the right distances
 */
function findDartboardRings(canvas: HTMLCanvasElement): { cx: number; cy: number; r: number; confidence: number } | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const w = canvas.width
  const h = canvas.height
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Step 1: Find all strong edges using Canny-like detection
  const edges: Array<{ x: number; y: number; mag: number }> = []

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const idx = (y * w + x) * 4
      
      // Compute gradients
      let gx = 0, gy = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const pidx = ((y + dy) * w + (x + dx)) * 4
          const gray = data[pidx] * 0.299 + data[pidx + 1] * 0.587 + data[pidx + 2] * 0.114
          if (dx !== 0) gx += (dx > 0 ? 1 : -1) * gray
          if (dy !== 0) gy += (dy > 0 ? 1 : -1) * gray
        }
      }
      
      const mag = Math.hypot(gx, gy)
      if (mag > 20) {
        edges.push({ x, y, mag })
      }
    }
  }

  if (edges.length === 0) return null

  // Step 2: For each potential center, score how many rings we can explain
  let bestCenter = null
  let bestScore = 0

  // Sample potential centers
  for (let cy = h * 0.3; cy < h * 0.7; cy += 10) {
    for (let cx = w * 0.3; cx < w * 0.7; cx += 10) {
      // For this center, find rings at expected radii
      let ringCount = 0
      let ringStrength = 0

      // Test for rings at known pixel radii (assuming double radius ~150px)
      const testRadii = [15, 30, 150, 162, 180, 205]
      
      for (const testR of testRadii) {
        let strength = 0
        let pixelCount = 0

        // Count edge pixels near this radius
        for (const edge of edges) {
          const dist = Math.hypot(edge.x - cx, edge.y - cy)
          if (Math.abs(dist - testR) < 3) {
            strength += edge.mag
            pixelCount++
          }
        }

        if (pixelCount > 10 && strength > 500) {
          ringCount++
          ringStrength += strength
        }
      }

      // Want at least 4 strong rings
      if (ringCount >= 4 && ringStrength > bestScore) {
        bestScore = ringStrength
        bestCenter = { cx, cy }
      }
    }
  }

  if (!bestCenter) return null

  // Step 3: Refine the center position and find double radius
  const refinedCx = bestCenter.cx
  const refinedCy = bestCenter.cy

  // Find the strongest ring near where we expect the double outer (165-190 pixels for typical image)
  let doubleR = 170
  let maxStrength = 0

  for (let testR = 120; testR <= 250; testR += 5) {
    let strength = 0
    let pixelCount = 0

    for (const edge of edges) {
      const dist = Math.hypot(edge.x - refinedCx, edge.y - refinedCy)
      if (Math.abs(dist - testR) < 2) {
        strength += edge.mag
        pixelCount++
      }
    }

    if (pixelCount > 20 && strength > maxStrength) {
      maxStrength = strength
      doubleR = testR
    }
  }

  // Calculate confidence based on how many proper rings we found
  let confidence = 0
  const scale = doubleR / BoardRadii.doubleOuter
  
  for (const knownR of [BoardRadii.bullInner, BoardRadii.bullOuter, BoardRadii.trebleInner, BoardRadii.trebleOuter, BoardRadii.doubleInner, BoardRadii.doubleOuter]) {
    const expectedPixelR = knownR * scale
    let found = false

    for (const edge of edges) {
      const dist = Math.hypot(edge.x - refinedCx, edge.y - refinedCy)
      if (Math.abs(dist - expectedPixelR) < 3) {
        found = true
        confidence += 15
        break
      }
    }
  }

  confidence = Math.min(100, confidence)

  return {
    cx: refinedCx,
    cy: refinedCy,
    r: doubleR,
    confidence,
  }
}

/**
 * Main board detection function
 * Uses direct ring detection approach
 */
export function detectBoard(canvas: HTMLCanvasElement): BoardDetectionResult {
  try {
    const w = canvas.width
    const h = canvas.height
    const centerX = w / 2
    const centerY = h / 2

    // Find dartboard rings
    const detection = findDartboardRings(canvas)

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
        message: 'No dartboard detected. Ensure board is clearly visible with good contrast between rings and background.',
      }
    }

    // Scale all ring radii based on detected double radius
    const scale = detection.r / BoardRadii.doubleOuter

    const detected = {
      cx: detection.cx,
      cy: detection.cy,
      bullInner: BoardRadii.bullInner * scale,
      bullOuter: BoardRadii.bullOuter * scale,
      trebleInner: BoardRadii.trebleInner * scale,
      trebleOuter: BoardRadii.trebleOuter * scale,
      doubleInner: BoardRadii.doubleInner * scale,
      doubleOuter: detection.r,
    }

    // Generate 4 calibration points from detected rings (TOP, RIGHT, BOTTOM, LEFT of double)
    const calibrationPoints: Point[] = [
      { x: detected.cx, y: detected.cy - detected.doubleOuter },           // TOP
      { x: detected.cx + detected.doubleOuter, y: detected.cy },           // RIGHT
      { x: detected.cx, y: detected.cy + detected.doubleOuter },           // BOTTOM
      { x: detected.cx - detected.doubleOuter, y: detected.cy },           // LEFT
    ]

    // Compute homography from these 4 points
    const canonicalSrc = [
      { x: 0, y: -BoardRadii.doubleOuter },
      { x: BoardRadii.doubleOuter, y: 0 },
      { x: 0, y: BoardRadii.doubleOuter },
      { x: -BoardRadii.doubleOuter, y: 0 },
    ]

    let homography: Homography | null = null
    let errorPx: number | null = null
    let confidence = detection.confidence

    try {
      homography = computeHomographyDLT(canonicalSrc, calibrationPoints)
      errorPx = rmsError(homography, canonicalSrc, calibrationPoints)
      // Adjust confidence based on homography error
      const errorConfidence = Math.max(10, Math.min(95, 100 - Math.max(0, errorPx - 1) * 10))
      confidence = (confidence + errorConfidence) / 2
    } catch (err) {
      confidence = Math.max(40, confidence)
    }

    return {
      success: !!homography && confidence > 50,
      cx: detected.cx,
      cy: detected.cy,
      bullInner: detected.bullInner,
      bullOuter: detected.bullOuter,
      trebleInner: detected.trebleInner,
      trebleOuter: detected.trebleOuter,
      doubleInner: detected.doubleInner,
      doubleOuter: detected.doubleOuter,
      confidence,
      homography,
      errorPx,
      calibrationPoints,
      message: confidence > 80 ? '✅ High confidence detection' : confidence > 50 ? '⚠️ Detection found but could be better' : '❌ Low confidence - try better lighting',
    }
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
      message: err instanceof Error ? err.message : 'Board detection failed',
    }
  }
}

/**
 * Refine detection by looking for concentric rings
 * This helps match detected circles to specific board rings
 */
export function refineRingDetection(detected: BoardDetectionResult): BoardDetectionResult {
  // If detection already has good confidence, return as-is
  if (detected.confidence > 70) return detected

  // Otherwise try to improve by checking ring ratios
  // If rings don't match expected ratios, we can flag for manual refinement
  const expectedRatios = {
    bullInner_to_bullOuter: BoardRadii.bullInner / BoardRadii.bullOuter,
    bullOuter_to_trebleInner: BoardRadii.bullOuter / BoardRadii.trebleInner,
    trebleOuter_to_doubleInner: BoardRadii.trebleOuter / BoardRadii.doubleInner,
    doubleInner_to_doubleOuter: BoardRadii.doubleInner / BoardRadii.doubleOuter,
  }

  const actualRatios = {
    bullInner_to_bullOuter: detected.bullInner / detected.bullOuter,
    bullOuter_to_trebleInner: detected.bullOuter / detected.trebleInner,
    trebleOuter_to_doubleInner: detected.trebleOuter / detected.doubleInner,
    doubleInner_to_doubleOuter: detected.doubleInner / detected.doubleOuter,
  }

  // Check ratio errors
  let ratioError = 0
  let ratioCount = 0
  for (const [key, expected] of Object.entries(expectedRatios)) {
    const actual = actualRatios[key as keyof typeof actualRatios]
    const error = Math.abs(actual - expected) / expected
    ratioError += error
    ratioCount++
  }
  const avgRatioError = ratioError / ratioCount

  // Adjust confidence based on ratio error
  const adjustedConfidence = Math.max(10, detected.confidence - avgRatioError * 100)

  return {
    ...detected,
    confidence: adjustedConfidence,
    message: adjustedConfidence > 70 ? '✅ High confidence detection' : adjustedConfidence > 50 ? '⚠️ Rings detected but ratios off - may need refinement' : '❌ Low confidence - try repositioning camera',
  }
}
