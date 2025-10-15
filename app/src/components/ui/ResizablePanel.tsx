import React, { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'

type Props = {
  storageKey: string
  children: ReactNode
  className?: string
  defaultWidth?: number
  defaultHeight?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

type Size = { width?: number; height?: number }

export default function ResizablePanel({
  storageKey,
  children,
  className,
  defaultWidth = 640,
  defaultHeight = 360,
  minWidth = 320,
  minHeight = 200,
  maxWidth = 1600,
  maxHeight = 1200,
}: Props) {
  const [size, setSize] = useState<Size>(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) return JSON.parse(raw) } catch {}
    return { width: defaultWidth, height: defaultHeight }
  })
  const startRef = useRef<{ x: number; y: number; w: number; h: number; dir: string } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onReset() {
      try { localStorage.removeItem(storageKey) } catch {}
      setSize({ width: defaultWidth, height: defaultHeight })
    }
    window.addEventListener('ndn:layout-reset' as any, onReset)
    window.addEventListener('ndn:camera-reset' as any, onReset)
    return () => {
      window.removeEventListener('ndn:layout-reset' as any, onReset)
      window.removeEventListener('ndn:camera-reset' as any, onReset)
    }
  }, [storageKey, defaultWidth, defaultHeight])

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(size)) } catch {} }, [size, storageKey])

  function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }
  function beginResize(e: React.MouseEvent, dir: string) {
    e.preventDefault(); const el = containerRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    startRef.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, dir }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', endResize)
  }
  function onMove(e: globalThis.MouseEvent) {
    const s = startRef.current; if (!s) return
    const dx = e.clientX - s.x; const dy = e.clientY - s.y
    let w = s.w; let h = s.h
    if (s.dir.includes('e')) w = clamp(s.w + dx, minWidth, maxWidth)
    if (s.dir.includes('s')) h = clamp(s.h + dy, minHeight, maxHeight)
    if (s.dir.includes('w')) w = clamp(s.w - dx, minWidth, maxWidth)
    if (s.dir.includes('n')) h = clamp(s.h - dy, minHeight, maxHeight)
    setSize({ width: Math.round(w), height: Math.round(h) })
  }
  function endResize() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', endResize); startRef.current = null }

  const style: CSSProperties = {
    width: size.width ? `${size.width}px` : undefined,
    height: size.height ? `${size.height}px` : undefined,
    maxWidth: '100%',
    maxHeight: '80vh',
    position: 'relative',
  }

  return (
    <div ref={containerRef} className={`${className || ''}`} style={style}>
      {children}
      <div className="resizer resizer-nw" onMouseDown={(e)=>beginResize(e,'nw')} />
      <div className="resizer resizer-ne" onMouseDown={(e)=>beginResize(e,'ne')} />
      <div className="resizer resizer-sw" onMouseDown={(e)=>beginResize(e,'sw')} />
      <div className="resizer resizer-se" onMouseDown={(e)=>beginResize(e,'se')} />
    </div>
  )
}
