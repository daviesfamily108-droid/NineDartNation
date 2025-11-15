// High-accuracy dart detector for built-in autoscore
// Strategy:
// - Maintain a grayscale background model (running average) when no darts are present
// - For each frame, compute abs-diff mask vs background and apply a 3x3 morphological closing to reduce noise
// - Restrict detection to a circular ROI around board center (from calibration) to ignore background
// - Find the largest foreground blob; compute PCA on blob pixels to estimate shaft orientation
// - Estimate the tip as the extreme along the principal axis in the outward radial direction from board center
// - Stabilize across consecutive frames (2+) before emitting a detection; debounce between darts

export type Point = { x: number; y: number }

export type DartDetection = {
  tip: Point
  axis?: { x1: number; y1: number; x2: number; y2: number }
  area: number
  bbox: { x: number; y: number; w: number; h: number }
  confidence: number // 0..1 heuristic
}

export class DartDetector {
  private width = 0
  private height = 0
  private bg: Float32Array | null = null // grayscale background
  private lastAcceptTs = 0
  private cooldownMs = 600
  private roiRadius = 0 // pixels; 0 means disabled
  private roiCx = 0
  private roiCy = 0
  private initialized = false

  // Tuning
  private thresh = 28 // intensity threshold for foreground
  private minArea = 90 // min connected pixels to consider a dart
  private maxArea = 6000 // guard against massive motion
  // temporal stabilization
  private prevTip: Point | null = null
  private prevArea: number = 0
  private stableCount = 0
  private requireStableN = 1

  constructor() {}

  setROI(cx: number, cy: number, radius: number) {
    this.roiCx = cx; this.roiCy = cy; this.roiRadius = Math.max(0, radius|0)
  }

  reset(width: number, height: number) {
    this.width = width
    this.height = height
    this.bg = new Float32Array(width * height)
    this.initialized = false
  }

  // Seed or update background model with the provided frame
  // If not initialized, copy; else running average with small alpha
  updateBackground(frame: ImageData, alpha = 0.05) {
    const { width: w, height: h, data } = frame
    if (!this.bg || w !== this.width || h !== this.height) {
      this.reset(w, h)
    }
    const bg = this.bg!
    const n = w * h
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = data[p], g = data[p+1], b = data[p+2]
      const gray = 0.299*r + 0.587*g + 0.114*b
      if (!this.initialized) bg[i] = gray
      else bg[i] = (1 - alpha) * bg[i] + alpha * gray
    }
    this.initialized = true
  }

  private inRoi(x: number, y: number): boolean {
    if (this.roiRadius <= 0) return true
    const dx = x - this.roiCx
    const dy = y - this.roiCy
    return (dx*dx + dy*dy) <= this.roiRadius * this.roiRadius
  }

  // Returns a detection if a new dart-like blob is found; null otherwise
  detect(frame: ImageData): DartDetection | null {
    const now = Date.now()
    const recent = (now - this.lastAcceptTs) < this.cooldownMs
    const { width: w, height: h, data } = frame
    if (!this.bg || w !== this.width || h !== this.height) this.reset(w, h)
    const bg = this.bg!
    if (!this.initialized) {
      this.updateBackground(frame, 1.0)
      return null
    }

    // Build diff buffer and compute dynamic threshold excluding specular highlights
    const n = w * h
    const mask = new Uint8Array(n)
    const diff = new Float32Array(n)
    let sum = 0, sum2 = 0, cnt = 0
    const isHighlight = new Uint8Array(n)
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = data[p], g = data[p+1], b = data[p+2]
      const maxc = Math.max(r, g, b)
      const minc = Math.min(r, g, b)
      const gray = 0.299*r + 0.587*g + 0.114*b
      const d = Math.abs(gray - bg[i])
      diff[i] = d
      const y = Math.floor(i / w)
      const x = i - y * w
      // specular highlight heuristic: very bright with low chroma
      const satApprox = maxc === 0 ? 0 : (maxc - minc) / maxc
      const isHi = (maxc >= 250) && (satApprox <= 0.12)
      if (isHi) isHighlight[i] = 1
      if (this.inRoi(x, y) && !isHi) { sum += d; sum2 += d*d; cnt++ }
    }
    const mu = cnt ? (sum / cnt) : 0
    const var_ = cnt ? Math.max(0, (sum2 / cnt) - mu*mu) : 0
    const sigma = Math.sqrt(var_)
    const dynamicThresh = Math.max(this.thresh, mu + 1.2 * sigma)
    // Rebuild mask using dynamic threshold and ignoring highlights
    for (let i = 0; i < n; i++) {
      if (isHighlight[i]) { mask[i] = 0; continue }
      if (diff[i] > dynamicThresh) {
        const y = Math.floor(i / w)
        const x = i - y * w
        mask[i] = this.inRoi(x, y) ? 1 : 0
      }
    }

    // Morphological closing (dilate then erode) to consolidate thin shapes
    this._dilate(mask, w, h)
    this._erode(mask, w, h)

    // Connected components (single pass using queue BFS); track largest blob
    const visited = new Uint8Array(n)
    let bestArea = 0
    let bestIdxs: number[] | null = null
    for (let i = 0; i < n; i++) {
      if (mask[i] === 0 || visited[i]) continue
      const idxs: number[] = []
      let area = 0
      let qh = 0
      const q: number[] = [i]
      visited[i] = 1
      while (qh < q.length) {
        const cur = q[qh++]
        idxs.push(cur)
        area++
        const y = (cur / w) | 0
        const x = cur - y * w
        // 4-neighborhood
        const nbs = [cur - 1, cur + 1, cur - w, cur + w]
        for (const nb of nbs) {
          if (nb < 0 || nb >= n) continue
          if (visited[nb]) continue
          // bounds checks for left/right
          if ((nb === cur - 1 || nb === cur + 1) && ((nb / w | 0) !== y)) continue
          if (mask[nb]) { visited[nb] = 1; q.push(nb) }
        }
      }
      if (area > bestArea) { bestArea = area; bestIdxs = idxs }
    }

    if (!bestIdxs || bestArea < this.minArea || bestArea > this.maxArea) {
      // Slowly update background when no valid detection to adapt lighting
      if (!recent) this.updateBackground(frame, 0.02)
      return null
    }

    // Compute PCA (covariance) on blob pixels to estimate shaft orientation
    let minX = w, minY = h, maxX = 0, maxY = 0
    let meanX = 0, meanY = 0
    for (const idx of bestIdxs) {
      const y = (idx / w) | 0
      const x = idx - y * w
      meanX += x; meanY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    meanX /= bestArea; meanY /= bestArea
    let cxx = 0, cyy = 0, cxy = 0
    for (const idx of bestIdxs) {
      const y = (idx / w) | 0
      const x = idx - y * w
      const dx = x - meanX
      const dy = y - meanY
      cxx += dx * dx; cyy += dy * dy; cxy += dx * dy
    }
    cxx /= bestArea; cyy /= bestArea; cxy /= bestArea
    // Principal axis (eigenvector of covariance with largest eigenvalue)
    // For 2x2 symmetric matrix [[cxx,cxy],[cxy,cyy]], eigenvector for largest eigenvalue lambda satisfies (cxx-l)x + cxy y = 0
    const trace = cxx + cyy
    const det = cxx * cyy - cxy * cxy
    const tmp = Math.sqrt(Math.max(0, trace*trace/4 - det))
    const l1 = trace/2 + tmp // largest eigenvalue
    // eigenvector v = (cxy, l1 - cxx) or (l1 - cyy, cxy); choose longer
    let vx = cxy, vy = l1 - cxx
    if (Math.hypot(vx, vy) < 1e-6) { vx = l1 - cyy; vy = cxy }
    const vlen = Math.hypot(vx, vy) || 1
    vx /= vlen; vy /= vlen

    // Determine which direction along the axis points outward from board center
    const dxc = meanX - this.roiCx
    const dyc = meanY - this.roiCy
    const outward = (dxc * vx + dyc * vy) > 0 ? 1 : -1
    vx *= outward; vy *= outward

    // Enforce radial alignment: reject if principal axis deviates too much from radial direction
    const rlen = Math.hypot(dxc, dyc) || 1
    const rx = dxc / rlen, ry = dyc / rlen
    const cosAng = Math.max(-1, Math.min(1, vx * rx + vy * ry))
    const angDeg = Math.acos(cosAng) * 180 / Math.PI
    if (angDeg > 55) {
      // likely glare or non-radial artifact
      if (!recent) this.updateBackground(frame, 0.02)
      return null
    }

    // Project all blob points onto axis and pick extreme (max t) as tip candidate
    let maxT = -Infinity
    let tipX = meanX, tipY = meanY
    for (const idx of bestIdxs) {
      const y = (idx / w) | 0
      const x = idx - y * w
      const t = (x - meanX) * vx + (y - meanY) * vy
      if (t > maxT) { maxT = t; tipX = x; tipY = y }
    }

    // Distance to center for confidence heuristic
    const dxr = tipX - this.roiCx
    const dyr = tipY - this.roiCy
    const minR2 = dxr*dxr + dyr*dyr

    // Confidence heuristic based on compactness and radial extent
    const bboxW = Math.max(1, maxX - minX + 1)
    const bboxH = Math.max(1, maxY - minY + 1)
    const bboxArea = bboxW * bboxH
    const fill = bestArea / bboxArea // 0..1 (thin dart should be small fill)
    const radial = Math.sqrt(minR2) / Math.max(1, this.roiRadius)
    let confidence = 0.5
    // Prefer thin elongated shapes with small fill and inside ROI
    if (fill < 0.45) confidence += 0.2
    if (fill < 0.25) confidence += 0.15
    if (radial < 1.1) confidence += 0.1
    // Orientation confidence: larger principal eigenvalue vs minor
    const l2 = trace - l1
    const elong = (l1 > 0) ? (1 - (l2 / l1)) : 0
    if (elong > 0.3) confidence += 0.1
    confidence = Math.max(0, Math.min(1, confidence))

    // Update background outside the blob to keep stability
    // Optionally, we can inpaint the blob into background upon acceptance by caller

    // Temporal stabilization: require 2+ consistent frames for the same dart
    const stable = this._isStable({ x: tipX + 0.5, y: tipY + 0.5 }, bestArea)
    if (!stable) return null
    // Debounce
    if (recent) return null

    return {
      tip: { x: tipX + 0.5, y: tipY + 0.5 },
      axis: { x1: meanX - vx*20, y1: meanY - vy*20, x2: meanX + vx*20, y2: meanY + vy*20 },
      area: bestArea,
      bbox: { x: minX, y: minY, w: bboxW, h: bboxH },
      confidence,
    }
  }

  // Incorporate the accepted detection into background so it won't trigger again
  accept(frame: ImageData, det: DartDetection) {
    this.lastAcceptTs = Date.now()
    // reset temporal stabilization for next dart
    this.prevTip = null
    this.prevArea = 0
    this.stableCount = 0
    if (!this.bg) return
    const { width: w } = frame
    const bg = this.bg
    const { x, y, w: bw, h: bh } = det.bbox
    const alpha = 0.5
    for (let yy = y; yy < y + bh; yy++) {
      for (let xx = x; xx < x + bw; xx++) {
        const i = yy * w + xx
        const p = i * 4
        const r = frame.data[p], g = frame.data[p+1], b = frame.data[p+2]
        const gray = 0.299*r + 0.587*g + 0.114*b
        bg[i] = (1 - alpha) * bg[i] + alpha * gray
      }
    }
  }

  // --- helpers ---
  private _isStable(tip: Point, area: number): boolean {
    const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= 6
    if (!this.prevTip) {
      this.prevTip = { ...tip }
      this.prevArea = area
      this.stableCount = 1
      return false
    }
    if (close(this.prevTip, tip) && Math.abs(area - this.prevArea) / Math.max(1, area) < 0.3) {
      this.prevTip = { ...tip }
      this.prevArea = area
      this.stableCount++
    } else {
      this.prevTip = { ...tip }
      this.prevArea = area
      this.stableCount = 1
      return false
    }
    return this.stableCount >= this.requireStableN
  }

  private _dilate(mask: Uint8Array, w: number, h: number) {
    const out = new Uint8Array(mask.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let on = 0
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const yy = y + j, xx = x + i
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
            if (mask[yy*w + xx]) { on = 1; break }
          }
          if (on) break
        }
        out[y*w + x] = on
      }
    }
    mask.set(out)
  }

  private _erode(mask: Uint8Array, w: number, h: number) {
    const out = new Uint8Array(mask.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let on = 1
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const yy = y + j, xx = x + i
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
            if (!mask[yy*w + xx]) { on = 0; break }
          }
          if (!on) break
        }
        out[y*w + x] = on
      }
    }
    mask.set(out)
  }
}
