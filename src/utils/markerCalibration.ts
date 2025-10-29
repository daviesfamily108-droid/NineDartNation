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
    for (const marker of markers) {
      const center = centerFromCorners(marker.corners)
      found.push({ id: marker.id, center })
      const key = (Object.keys(MARKER_TARGETS) as MarkerKey[]).find(k => MARKER_TARGETS[k] === marker.id)
      if (key) assignments[key] = { id: marker.id, center }
    }
    const missing = (Object.keys(MARKER_TARGETS) as MarkerKey[]).filter(k => !assignments[k])
    if (missing.length > 0) {
      return {
        success: false,
        points: [],
        missing,
        markersFound: found,
        assignments,
        homography: null,
        errorPx: null,
        message: 'Not all calibration markers were detected.',
      }
    }
    const dst = [assignments.top!.center, assignments.right!.center, assignments.bottom!.center, assignments.left!.center]
    const src = canonicalRimTargets()
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
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return detectMarkersFromImage(imageData)
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
