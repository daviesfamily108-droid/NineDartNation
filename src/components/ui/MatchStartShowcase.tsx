import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getAllTimeAvg, getAllTimeFirstNineAvg, getAllTimeBestCheckout, getAllTimeBestLeg, getAllTime, getAllTime180s } from '../../store/profileStats'
import type { Player } from '../../store/match'
import { useCalibration } from '../../store/calibration'

function StatBlock({ label, value, className = '', scale = 1 }: { label: string; value: string | number; className?: string; scale?: number }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-2xl sm:text-3xl font-bold transform transition-transform duration-200 ease-out" style={{ transform: `scale(${scale})` }}>{value}</div>
    </div>
  )
}

function PlayerCalibrationPreview({ player, user, playerCalibrations }: { player: Player; user?: any; playerCalibrations: {[playerName: string]: any} }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const calib = playerCalibrations[player.name]
  const isCalibrated = !!calib

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw a simple dartboard circle
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const radius = Math.min(centerX, centerY) - 2

    // Outer circle
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.stroke()

    // Bullseye
    ctx.fillStyle = '#f00'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI)
    ctx.fill()

    // If calibrated, draw calibration points
    if (isCalibrated) {
      ctx.fillStyle = '#0f0'
      // Draw some sample points (simplified)
      const points = [
        [centerX - radius * 0.5, centerY],
        [centerX + radius * 0.5, centerY],
        [centerX, centerY - radius * 0.5],
        [centerX, centerY + radius * 0.5]
      ]
      points.forEach(([x, y]) => {
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, 2 * Math.PI)
        ctx.fill()
      })
    }
  }, [isCalibrated])

  return (
    <div className="flex items-center gap-2 mt-1">
      <canvas ref={canvasRef} width={40} height={40} className="border border-white/20 rounded" />
      <span className={`text-xs ${isCalibrated ? 'text-green-400' : 'text-gray-400'}`}>
        {isCalibrated ? 'Calibrated' : 'Not Calibrated'}
      </span>
    </div>
  )
}

import FocusLock from 'react-focus-lock'
export default function MatchStartShowcase({ players, user, onDone }: { players: Player[]; user?: any; onDone?: () => void }) {
  const [seconds, setSeconds] = useState(15)
  const [scaleState, setScaleState] = useState(1)
  const [visible, setVisible] = useState(true)
  const [showCalibration, setShowCalibration] = useState(false)
  const [calibrationSkipped, setCalibrationSkipped] = useState<{[playerId: string]: boolean}>({})
  const [playerCalibrations, setPlayerCalibrations] = useState<{[playerName: string]: any}>({})
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
    const t = allPlayersSkipped ? setInterval(() => setSeconds(s => s - 1), 1000) : null
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
      if (t) clearInterval(t)
      document.removeEventListener('keydown', onKey)
    }
  }, [visible, onDone])

  const allPlayersSkipped = players.every(p => calibrationSkipped[p.id])
  const canStartMatch = allPlayersSkipped

  useEffect(() => {
    if (!visible) return
    // Show calibration popup immediately when countdown starts
    if (seconds === 15 && !showCalibration) {
      setShowCalibration(true)
      // Fetch calibrations for all players
      const fetchCalibrations = async () => {
        const calibs: {[playerName: string]: any} = {}
        for (const player of players) {
          if (user?.username && player.name === user.username) {
            // Local user: use store
            const { H, imageSize, locked } = useCalibration.getState()
            if (H && locked) calibs[player.name] = { H, imageSize, locked }
          } else {
            // Remote user: fetch from server
            try {
              const res = await fetch(`/api/users/${encodeURIComponent(player.name)}/calibration`)
              if (res.ok) {
                const data = await res.json()
                if (data.calibration) calibs[player.name] = data.calibration
              }
            } catch (err) {
              console.warn('Failed to fetch calibration for', player.name, err)
            }
          }
        }
        setPlayerCalibrations(calibs)
      }
      fetchCalibrations()
    }
    // Only start countdown when all players have skipped calibration
    if (allPlayersSkipped) {
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
    }
  }, [seconds, onDone, visible, showCalibration, allPlayersSkipped, players, user])

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

  const CalibrationPopup = () => {
    const skippedPlayers = players.filter(p => calibrationSkipped[p.id])
    const remainingPlayers = players.filter(p => !calibrationSkipped[p.id])
    
    return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-2xl w-full">
        <h3 className="text-xl font-bold mb-4 text-center">Calibration Check</h3>
        <p className="text-sm opacity-70 mb-6 text-center">
          Check your dartboard calibration before the match starts. Both players must skip or confirm to begin.
        </p>
        
        {skippedPlayers.length > 0 && remainingPlayers.length > 0 && (
          <div className="mb-4 p-3 bg-blue-900/50 border border-blue-600 rounded-lg">
            <p className="text-sm text-blue-200">
              {skippedPlayers.map(p => p.name).join(', ')} {skippedPlayers.length === 1 ? 'has' : 'have'} chosen to skip. 
              {remainingPlayers.map(p => p.name).join(', ')}, would you like to skip as well?
            </p>
          </div>
        )}
        
        <div className="space-y-4">
          {players.map(player => {
            const skipped = calibrationSkipped[player.id]
            return (
              <div key={player.id} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-lg font-bold text-white">
                    {player.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">{player.name}</span>
                    {/* Show a tiny calibration preview if local calibration exists (remote calibs require server support) */}
                    <PlayerCalibrationPreview player={player} user={user} playerCalibrations={playerCalibrations} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      // Open the Calibrator tab (App listens for this custom event)
                      try { window.dispatchEvent(new CustomEvent('ndn:change-tab', { detail: { tab: 'calibrate' } })) } catch {}
                      // Close the showcase so user can focus on calibrator
                      try { setVisible(false); setShowCalibration(false); onDone?.() } catch {}
                    }}
                  >
                    Bull Up
                  </button>
                  <button 
                    className={`btn btn-sm ${skipped ? 'bg-emerald-600' : 'btn-primary'}`}
                    onClick={() => {
                      setCalibrationSkipped(prev => ({ ...prev, [player.id]: true }))
                    }}
                    disabled={skipped}
                  >
                    {skipped ? 'Skipped ✓' : 'Skip'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex justify-center gap-4">
          <button 
            className={`btn ${canStartMatch ? 'btn-primary' : 'btn-ghost opacity-50 cursor-not-allowed'}`}
            onClick={() => {
              if (canStartMatch) {
                setShowCalibration(false)
              }
            }}
            disabled={!canStartMatch}
          >
            Start Match ({remainingPlayers.length} remaining)
          </button>
        </div>
      </div>
    </div>
  )}

  const getScaleFor = (s: number) => {
    if (s <= 0) return 1.8
    if (s === 1) return 1.6
    if (s === 2) return 1.4
    if (s === 3) return 1.2
    return 1
  }

  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="match-start-heading" tabIndex={-1}>
        <FocusLock returnFocus={true}>
          <div ref={hostRef}>
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 md:p-12 max-w-7xl w-full backdrop-blur-sm shadow-2xl">
            <div className="flex items-center justify-between mb-8">
            <div id="match-start-heading" className="text-2xl font-bold opacity-90">Match Starting Soon</div>
            <div className="flex items-center gap-4">
              <div className="text-6xl font-extrabold text-emerald-400" aria-live="polite">{seconds > 0 ? seconds : 'GO'}</div>
              <div className="flex flex-col gap-2">
                <button ref={startNowRef} className="btn btn-lg" onClick={() => { setVisible(false); try{ onDone?.() } catch{} }} aria-label="Start match now">Start Now</button>
                <button ref={closeRef} className="btn btn-ghost btn-sm" onClick={() => { setVisible(false); try{ onDone?.() } catch{} }} aria-label="Close match start showcase">Close</button>
              </div>
            </div>
          </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {stats.map(st => (
            <div key={st.id} className="p-6 rounded-2xl bg-white/8 border border-white/12 flex flex-col items-center shadow-xl">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-2xl font-bold text-white mb-4 shadow-lg">
                {st.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="text-xl font-semibold mb-4 text-center">{st.name}</div>
              <div className="grid grid-cols-2 gap-4 w-full">
                <StatBlock label="3-Dart Avg" value={st.avg3} scale={getScaleFor(seconds)} />
                <StatBlock label="First-9 Avg" value={st.best9} scale={getScaleFor(seconds)} />
                <StatBlock label="Best Checkout" value={st.bestCheckout || '—'} scale={getScaleFor(seconds)} />
                <StatBlock label="Best Leg" value={st.bestLeg || '—'} scale={getScaleFor(seconds)} />
              </div>
              <div className="mt-4 opacity-70 text-sm">180s (match / career): {st.one80s}</div>
            </div>
          ))}
        </div>
  <div className="text-center">
          {seconds <= 1 ? (
            <div className="text-3xl font-bold text-emerald-400">Good luck — Game on! 🎯</div>
          ) : (
            <div className="text-lg opacity-70">{players.map(p=>p.name).join(' vs ')}</div>
          )}
        </div>
          </div>
          </div>
  </FocusLock>
      </div>
    </div>
  )
  return createPortal(
    <>
      {showCalibration && <CalibrationPopup />}
      {overlay}
    </>,
    document.body
  )
}
