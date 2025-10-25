import React, { useEffect, useRef } from 'react'
import useHeatmapStore from '../store/heatmap'
import { BoardRadii } from '../utils/vision'

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg - 90) * Math.PI / 180.0
  return { x: cx + (r * Math.cos(a)), y: cy + (r * Math.sin(a)) }
}

function sectorAngle(sector: number) {
  // SectorOrder puts 20 at top; 360/20 = 18deg per sector
  const SectorOrder = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
  const idx = SectorOrder.indexOf(sector)
  const mid = (idx * 18) + 9 // middle of sector
  return mid
}

export default function HeatMap({ width = 320, height = 320 }: { width?: number; height?: number }) {
  const samples = useHeatmapStore(s => s.samples)
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    c.width = width; c.height = height
    ctx.clearRect(0,0,width,height)
    // Draw a faint dartboard backdrop (rings)
    const cx = width / 2
    const cy = height / 2
    const scale = Math.min(width, height) / (BoardRadii.doubleOuter * 2 + 20)
    const radii = {
      bullInner: BoardRadii.bullInner * scale,
      bullOuter: BoardRadii.bullOuter * scale,
      trebleInner: BoardRadii.trebleInner * scale,
      trebleOuter: BoardRadii.trebleOuter * scale,
      doubleInner: BoardRadii.doubleInner * scale,
      doubleOuter: BoardRadii.doubleOuter * scale,
    }
    // rings
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    const ringOrder = ['doubleOuter','doubleInner','trebleOuter','trebleInner','bullOuter','bullInner'] as const
    for (const k of ringOrder) {
      ctx.beginPath(); ctx.arc(cx, cy, (radii as any)[k], 0, Math.PI*2); ctx.stroke();
    }

    // Aggregate sample weights by approximate xy
    const points: { x:number;y:number;w:number }[] = []
    for (const s of samples) {
      // if sector unknown, scatter in board
      let angle = Math.random() * 360
      let r = Math.random() * radii.doubleOuter
      if (typeof s.sector === 'number' && s.sector >= 1 && s.sector <= 20) {
        angle = sectorAngle(s.sector)
        // choose radius by mult/ring
        if (s.ring === 'DOUBLE') r = (radii.doubleInner + radii.doubleOuter)/2
        else if (s.ring === 'TRIPLE') r = (radii.trebleInner + radii.trebleOuter)/2
        else if (s.ring === 'INNER_BULL') r = radii.bullInner * 0.5
        else if (s.ring === 'BULL') r = radii.bullOuter * 0.8
        else r = (radii.trebleOuter + radii.doubleInner)/2 * (0.6 + Math.random()*0.4)
      }
      const p = polarToCartesian(cx, cy, r, angle)
      points.push({ x: p.x, y: p.y, w: 1 })
    }

    // Draw heat circles additive
    for (const p of points) {
      const grd = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 60)
      grd.addColorStop(0, 'rgba(255,0,0,0.9)')
      grd.addColorStop(0.3, 'rgba(255,100,0,0.5)')
      grd.addColorStop(1, 'rgba(255,100,0,0)')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(p.x, p.y, 60, 0, Math.PI*2); ctx.fill()
    }

    // Optionally overlay counts per sector
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '12px ui-sans-serif'
    // compute counts per sector
    const sectorCounts: Record<number, number> = {}
    for (const s of samples) if (s.sector) sectorCounts[s.sector] = (sectorCounts[s.sector] || 0) + 1
    for (const secStr of Object.keys(sectorCounts)) {
      const sec = Number(secStr)
      const a = sectorAngle(sec)
      const pos = polarToCartesian(cx, cy, radii.trebleOuter + 18, a)
      ctx.fillText(String(sectorCounts[sec]), pos.x-6, pos.y+4)
    }
  }, [samples, width, height])

  return <canvas ref={ref} style={{ width: '100%', height: 'auto', borderRadius: 8, background: '#081018' }} />
}
