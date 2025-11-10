import { AR } from 'js-aruco'
import { canonicalRimTargets, computeHomographyDLT, rmsError, type Homography, type Point } from './vision'

export type MarkerKey = 'top' | 'right' | 'bottom' | 'left'

export const MARKER_ORDER: MarkerKey[] = ['top', 'right', 'bottom', 'left']

export const MARKER_TARGETS: Record<MarkerKey, number> = {
  top: 0,
  right: 1,
  bottom: 2,
  left: 3,
}

export type MarkerDetection = {
  success: boolean
  points: Point[]
  missing: MarkerKey[]
  markersFound: Array<{ id: number; center: Point }>
  assignments: Partial<Record<MarkerKey, { id: number; center: Point }>>
  homography: Homography | null
  errorPx: number | null
  message?: string
}

let detector: AR.Detector | null = null

function ensureDetector() {
  if (!detector) detector = new AR.Detector()
  return detector
}

function centerFromCorners(corners: { x: number; y: number }[]): Point {
  const acc = corners.reduce((sum, corner) => ({ x: sum.x + corner.x, y: sum.y + corner.y }), { x: 0, y: 0 })
  const count = corners.length || 1
  return { x: acc.x / count, y: acc.y / count }
}

export function detectMarkersFromImage(image: ImageData): MarkerDetection {
  try {
    const det = ensureDetector()
    const markers = det.detect(image) || []
    const assignments: Partial<Record<MarkerKey, { id: number; center: Point }>> = {}
    const found: Array<{ id: number; center: Point }> = []
    
    // Map detected markers to their positions
    for (const marker of markers) {
      const center = centerFromCorners(marker.corners)
      found.push({ id: marker.id, center })
      const key = (Object.keys(MARKER_TARGETS) as MarkerKey[]).find(k => MARKER_TARGETS[k] === marker.id)
      if (key) assignments[key] = { id: marker.id, center }
    }
    
    const missing = (Object.keys(MARKER_TARGETS) as MarkerKey[]).filter(k => !assignments[k])
    
    // If we found some markers but not all, provide helpful info in the error
    if (missing.length > 0) {
      return {
        success: false,
        points: [],
        missing,
        markersFound: found,
        assignments,
        homography: null,
        errorPx: null,
        message: found.length > 0 
          ? `Detected ${found.length} of 4 markers. Some markers may have incorrect IDs or be unclear.`
          : 'Not all calibration markers were detected.',
      }
    }
    
    // All 4 markers found - compute homography
    const dst = [assignments.top!.center, assignments.right!.center, assignments.bottom!.center, assignments.left!.center]
    // Use only the first 4 canonical rim targets (TOP, RIGHT, BOTTOM, LEFT) to match the 4 marker points
    const allTargets = canonicalRimTargets()
    const src = allTargets.slice(0, 4)
    const H = computeHomographyDLT(src, dst)
    const error = rmsError(H, src, dst)
    return {
      success: true,
      points: dst,
      missing: [],
      markersFound: found,
      assignments,
      homography: H,
      errorPx: error,
    }
  } catch (err) {
    return {
      success: false,
      points: [],
      missing: (Object.keys(MARKER_TARGETS) as MarkerKey[]),
      markersFound: [],
      assignments: {},
      homography: null,
      errorPx: null,
      message: err instanceof Error ? err.message : 'Marker detection failed',
    }
  }
}

export function detectMarkersFromCanvas(canvas: HTMLCanvasElement): MarkerDetection {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return {
      success: false,
      points: [],
      missing: (Object.keys(MARKER_TARGETS) as MarkerKey[]),
      markersFound: [],
      assignments: {},
      homography: null,
      errorPx: null,
      message: 'Canvas context unavailable for marker detection.',
    }
  }
  const tryDetect = (img: ImageData): MarkerDetection => detectMarkersFromImage(img)

  // Pass 1: raw image
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let result = tryDetect(imageData)
  if (result.success || (result.markersFound?.length||0) > 0) return result

  // Pass 2: scale up 1.75x (helps low-resolution streams)
  try {
    const scale = 1.75
    const off = document.createElement('canvas')
    off.width = Math.round(canvas.width * scale)
    off.height = Math.round(canvas.height * scale)
    const octx = off.getContext('2d')!
    octx.imageSmoothingEnabled = false
    octx.drawImage(canvas, 0, 0, off.width, off.height)
    imageData = octx.getImageData(0, 0, off.width, off.height)
    result = tryDetect(imageData)
    if (result.success || (result.markersFound?.length||0) > 0) return result
  } catch {}

  // Pass 3: contrast boost (simple linear stretch)
  try {
    const w = canvas.width, h = canvas.height
    const id = ctx.getImageData(0, 0, w, h)
    const data = id.data
    let min = 255, max = 0
    // Compute luminance min/max
    for (let i = 0; i < data.length; i += 4) {
      const y = (0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2])
      if (y < min) min = y
      if (y > max) max = y
    }
    const range = Math.max(1, max - min)
    for (let i = 0; i < data.length; i += 4) {
      const y = (0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2])
      const yn = Math.max(0, Math.min(255, ((y - min) * 255) / range))
      data[i] = data[i+1] = data[i+2] = yn
    }
    result = tryDetect(id)
    if (result.success || (result.markersFound?.length||0) > 0) return result
  } catch {}

  // Pass 4: aggressive threshold (convert to pure black & white)
  try {
    const w = canvas.width, h = canvas.height
    const id = ctx.getImageData(0, 0, w, h)
    const data = id.data
    // Find middle gray
    let sum = 0, count = 0
    for (let i = 0; i < data.length; i += 4) {
      const y = (0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2])
      sum += y; count++
    }
    const threshold = sum / count
    // Convert to pure B&W
    for (let i = 0; i < data.length; i += 4) {
      const y = (0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2])
      const v = y > threshold ? 255 : 0
      data[i] = data[i+1] = data[i+2] = v
    }
    result = tryDetect(id)
    if (result.success || (result.markersFound?.length||0) > 0) return result
  } catch {}

  // If still nothing, return the last result (with helpful message)
  return {
    success: false,
    points: [],
    missing: (Object.keys(MARKER_TARGETS) as MarkerKey[]),
    markersFound: result.markersFound || [],
    assignments: result.assignments || {},

    homography: null,
    errorPx: null,
    message: result.message || 'No calibration markers detected. Ensure you are using the provided TOP/RIGHT/BOTTOM/LEFT ArUco markers printed at 100% on white paper.',
  }
}

const ROW_PATTERNS: Record<string, number[]> = {
  '0,0': [1, 0, 0, 0, 0],
  '0,1': [1, 0, 1, 1, 1],
  '1,0': [0, 1, 0, 0, 1],
  '1,1': [0, 1, 1, 1, 0],
}

export function markerIdToMatrix(id: number): number[][] {
  const rows: number[][] = new Array(5)
  let bits = id >>> 0
  for (let row = 4; row >= 0; row--) {
    const bit3 = bits & 1; bits >>= 1
    const bit1 = bits & 1; bits >>= 1
    const pattern = ROW_PATTERNS[`${bit1},${bit3}`]
    if (!pattern) throw new Error(`Unsupported marker id pattern for row ${row}`)
    rows[row] = pattern.slice()
  }
  const matrix = Array.from({ length: 7 }, () => new Array(7).fill(0))
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      matrix[y + 1][x + 1] = rows[y][x]
    }
  }
  return matrix
}
