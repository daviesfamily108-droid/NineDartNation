import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getAllTimeAvg, getAllTimeFirstNineAvg, getAllTimeBestCheckout, getAllTimeBestLeg, getAllTime, getAllTime180s } from '../../store/profileStats'
import type { Player } from '../../store/match'

function StatBlock({ label, value, className = '', scale = 1 }: { label: string; value: string | number; className?: string; scale?: number }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-2xl sm:text-3xl font-bold transform transition-transform duration-200 ease-out" style={{ transform: `scale(${scale})` }}>{value}</div>
    </div>
  )
}

import FocusLock from 'react-focus-lock'
export default function MatchStartShowcase({ players, onDone }: { players: Player[]; onDone?: () => void }) {
  const [seconds, setSeconds] = useState(15)
  const [scaleState, setScaleState] = useState(1)
  const [visible, setVisible] = useState(true)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const startNowRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const prevActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!visible) return
    // Ensure initial focus is on the Start Now button for convenience
    try { setTimeout(() => { try { startNowRef.current?.focus() } catch {} }, 0) } catch {}
  // remember previous active element so we can restore on close
  try { prevActiveElement.current = document.activeElement as HTMLElement } catch {}
    // Hide app content from screen readers while overlay is open
    const appRoot = document.getElementById('root')
    const prevAria: string | null = appRoot ? (appRoot.getAttribute('aria-hidden')) : null
    try { if (appRoot) appRoot.setAttribute('aria-hidden', 'true') } catch {}
    const t = setInterval(() => setSeconds(s => s - 1), 1000)
  const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setVisible(false)
        try { onDone?.() } catch {}
        try { prevActiveElement.current?.focus() } catch {}
      }
    }
  document.addEventListener('keydown', onKey)
    // Cleanup and restore aria-hidden
    return () => {
      try {
        if (appRoot && prevAria === null) { appRoot.setAttribute('aria-hidden', 'false') }
        else if (appRoot && prevAria !== null) { appRoot.setAttribute('aria-hidden', prevAria) }
      } catch {}
      document.removeEventListener('keydown', onKey)
      clearInterval(t)
    }
  }, [visible, onDone])

  useEffect(() => {
    if (!visible) return
    if (seconds <= 3 && seconds > 0) {
      setScaleState(s => s + 0.4)
    }
    if (seconds <= 0) {
      // Done; small delay to let the "Game On" message show
      setTimeout(() => {
        setVisible(false)
        try { onDone?.() } catch {}
        // Return focus to previous element
        try { prevActiveElement.current?.focus() } catch {}
      }, 1000)
    }
  }, [seconds, onDone, visible])

  const stats = useMemo(() => players.map(p => {
    const avg3 = getAllTimeAvg(p.name)
    const best9 = getAllTimeFirstNineAvg(p.name)
    const bestCheckout = getAllTimeBestCheckout(p.name)
    const bestLeg = getAllTimeBestLeg(p.name)
    const all = getAllTime(p.name)
    const career180s = getAllTime180s(p.name)
    // Count match 180s for the provided player
    let match180s = 0
    try {
      for (const L of (p.legs || [])) {
        for (const v of (L.visits || [])) {
          if (Number(v.score || 0) === 180) match180s += 1
        }
      }
    } catch {}
    const one80s = `${match180s}/${career180s}`
    return { id: p.id, name: p.name, avg3: avg3.toFixed(1), best9: best9.toFixed(1), bestCheckout, bestLeg, one80s }
  }), [players])

  if (!visible) return null

  const getScaleFor = (s: number) => {
    if (s <= 0) return 1.8
    if (s === 1) return 1.6
    if (s === 2) return 1.4
    if (s === 3) return 1.2
    return 1
  }

  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="match-start-heading" tabIndex={-1}>
        <FocusLock returnFocus={true}>
          <div ref={hostRef}>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-6 max-w-3xl w-full backdrop-blur-sm">
            <div className="flex items-center justify-between">
            <div id="match-start-heading" className="text-sm opacity-80">Match starting in</div>
            <div className="flex items-center gap-2">
              <div className="text-4xl font-extrabold" aria-live="polite">{seconds > 0 ? seconds : 'GO'}</div>
              <button ref={startNowRef} className="btn btn-sm" onClick={() => { setVisible(false); try{ onDone?.() } catch{} }} aria-label="Start match now">Start now</button>
              <button ref={closeRef} className="btn btn-ghost btn-sm" onClick={() => { setVisible(false); try{ onDone?.() } catch{} }} aria-label="Close match start showcase">Close</button>
            </div>
          </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {stats.map(st => (
            <div key={st.id} className="p-3 rounded-lg bg-white/6 border border-white/8 flex flex-col items-center">
              <div className="text-sm mb-2 font-semibold">{st.name}</div>
              <div className="grid grid-cols-2 gap-2 w-full">
                <StatBlock label="3-Dart Avg" value={st.avg3} scale={getScaleFor(seconds)} />
                <StatBlock label="First-9 Avg" value={st.best9} scale={getScaleFor(seconds)} />
                <StatBlock label="Best Checkout" value={st.bestCheckout || '—'} scale={getScaleFor(seconds)} />
                <StatBlock label="Best Leg" value={st.bestLeg || '—'} scale={getScaleFor(seconds)} />
              </div>
              <div className="mt-3 opacity-70 text-xs">180s (match / career): {st.one80s}</div>
            </div>
          ))}
        </div>
  <div className="mt-4 text-center">
          {seconds <= 1 ? (
            <div className="text-lg font-bold">Good luck — Game on! {players.map(p=>p.name).join(' vs ')}</div>
          ) : (
            <div className="text-sm opacity-70">Players: {players.map(p=>p.name).join(' vs ')}</div>
          )}
        </div>
          </div>
          </div>
  </FocusLock>
      </div>
    </div>
  )
  return createPortal(overlay, document.body)
}
