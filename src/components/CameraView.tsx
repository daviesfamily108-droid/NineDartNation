import { useEffect, useRef, useState } from 'react'
import { useCalibration } from '../store/calibration'
import { useMatch } from '../store/match'
import { BoardRadii, drawPolyline, sampleRing, scaleHomography, type Point } from '../utils/vision'
import { scoreFromImagePoint } from '../utils/autoscore'
import { addSample } from '../store/profileStats'
import ResizablePanel from './ui/ResizablePanel'
import ResizableModal from './ui/ResizableModal'

export default function CameraView({
  onVisitCommitted,
  showToolbar = true,
  onAutoDart,
  immediateAutoCommit = false,
}: {
  onVisitCommitted?: (score: number, darts: number, finished: boolean) => void
  showToolbar?: boolean
  onAutoDart?: (value: number, ring: 'MISS'|'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', info?: { sector: number | null; mult: 0|1|2|3 }) => void
  immediateAutoCommit?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [streaming, setStreaming] = useState(false)
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)
  const { H, imageSize, reset: resetCalibration } = useCalibration()
  const [lastAutoScore, setLastAutoScore] = useState<string>('')
  const [manualScore, setManualScore] = useState<string>('')
  const [lastAutoValue, setLastAutoValue] = useState<number>(0)
  type Ring = 'MISS'|'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'
  const [lastAutoRing, setLastAutoRing] = useState<Ring>('MISS')
  const [pendingDarts, setPendingDarts] = useState<number>(0)
  const [pendingScore, setPendingScore] = useState<number>(0)
  const [pendingEntries, setPendingEntries] = useState<{ label: string; value: number; ring: Ring }[]>([])
  const addVisit = useMatch(s => s.addVisit)
  const endLeg = useMatch(s => s.endLeg)
  const matchState = useMatch(s => s)
  // Quick entry dropdown selections
  const [quickSelAuto, setQuickSelAuto] = useState('')
  const [quickSelManual, setQuickSelManual] = useState('')
  const [nonRegCount, setNonRegCount] = useState(0)
  const [showRecalModal, setShowRecalModal] = useState(false)
  const [hadRecentAuto, setHadRecentAuto] = useState(false)
  const [activeTab, setActiveTab] = useState<'auto'|'manual'>('auto')
  const [showManualModal, setShowManualModal] = useState(false)
  const [showAutoModal, setShowAutoModal] = useState(false)
  const manualPreviewRef = useRef<HTMLCanvasElement | null>(null)
  // Open Autoscore modal from parent via global event
  useEffect(() => {
    const onOpen = () => setShowAutoModal(true)
    window.addEventListener('ndn:open-autoscore' as any, onOpen)
    return () => window.removeEventListener('ndn:open-autoscore' as any, onOpen)
  }, [])

  // Allow parent to open/close the manual modal via global events
  useEffect(() => {
    const onOpen = () => { setActiveTab('manual'); setShowManualModal(true) }
    const onClose = () => { setActiveTab('auto'); setShowManualModal(false) }
    window.addEventListener('ndn:open-manual' as any, onOpen)
    window.addEventListener('ndn:close-manual' as any, onClose)
    return () => {
      window.removeEventListener('ndn:open-manual' as any, onOpen)
      window.removeEventListener('ndn:close-manual' as any, onClose)
    }
  }, [])

  // Drive a lightweight live preview inside the manual modal from the main video element
  useEffect(() => {
    if (!showManualModal) return
    const id = setInterval(() => {
      try {
        const v = videoRef.current
        const c = manualPreviewRef.current
        if (!v || !c) return
        const vw = v.videoWidth || 0
        const vh = v.videoHeight || 0
        if (!vw || !vh) return
        const cw = c.clientWidth || 640
        const ch = c.clientHeight || 360
        // Set backing size to match display for crisp rendering
        if (c.width !== cw) c.width = cw
        if (c.height !== ch) c.height = ch
        const ctx = c.getContext('2d')!
        ctx.imageSmoothingEnabled = true
        // Letterbox fit
        const scale = Math.min(cw / vw, ch / vh)
        const dw = Math.round(vw * scale)
        const dh = Math.round(vh * scale)
        const dx = Math.floor((cw - dw) / 2)
        const dy = Math.floor((ch - dh) / 2)
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, cw, ch)
        ctx.drawImage(v, dx, dy, dw, dh)
      } catch {}
    }, 120)
    return () => clearInterval(id)
  }, [showManualModal])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setStreaming(true)
    } catch (e) {
      alert('Camera permission denied or not available.')
    }
  }

  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(t => t.stop())
      videoRef.current.srcObject = null
      setStreaming(false)
    }
  }

  function capture() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/png')
    setSnapshotUrl(url)
  }

  function drawOverlay() {
    if (!overlayRef.current || !videoRef.current || !H || !imageSize) return
    const o = overlayRef.current
    const v = videoRef.current
    const w = v.clientWidth
    const h = v.clientHeight
    o.width = w; o.height = h
    const ctx = o.getContext('2d')!
    ctx.clearRect(0,0,w,h)

    // scale homography from calibration image size to current rendered size
    const sx = w / imageSize.w
    const sy = h / imageSize.h
    const Hs = scaleHomography(H, sx, sy)
    const rings = [BoardRadii.bullInner, BoardRadii.bullOuter, BoardRadii.trebleInner, BoardRadii.trebleOuter, BoardRadii.doubleInner, BoardRadii.doubleOuter]
    for (const r of rings) {
      const poly = sampleRing(Hs, r, 360)
      drawPolyline(ctx, poly, r === BoardRadii.doubleOuter ? '#22d3ee' : '#a78bfa', r === BoardRadii.doubleOuter ? 3 : 2)
    }
  }

  useEffect(() => {
    const id = setInterval(drawOverlay, 250)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [H, imageSize, streaming])

  function onOverlayClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!overlayRef.current || !H || !imageSize) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Map to calibration coordinate space by reversing the display scaling
    const sx = overlayRef.current.width / imageSize.w
    const sy = overlayRef.current.height / imageSize.h
    const pCal: Point = { x: x / sx, y: y / sy }
  const score = scoreFromImagePoint(H, pCal)
  const s = `${score.ring} ${score.base > 0 ? score.base : ''}`.trim()
    setLastAutoScore(s)
  setLastAutoValue(score.base)
  setLastAutoRing(score.ring as Ring)
    setHadRecentAuto(true)
    // Optional immediate commit hook (e.g., Double Practice)
    try {
      if (immediateAutoCommit && onAutoDart) {
        onAutoDart(score.base, score.ring as Ring, { sector: score.sector, mult: score.mult })
        setHadRecentAuto(false)
      }
    } catch {}
  }

  function parseManual(input: string): { label: string; value: number; ring: Ring } | null {
    const t = input.trim().toUpperCase()
    if (!t) return null
    const bull = t === 'BULL' || t === '50' || t === 'DBULL' || t === 'IBULL'
    const outerBull = t === '25' || t === 'OBULL'
    if (bull) return { label: 'INNER_BULL 50', value: 50, ring: 'INNER_BULL' }
    if (outerBull) return { label: 'BULL 25', value: 25, ring: 'BULL' }
    const m = t.match(/^(S|D|T)?\s*(\d{1,2})$/)
    if (!m) return null
    const mult = (m[1] || 'S') as 'S'|'D'|'T'
    const num = parseInt(m[2], 10)
    if (num < 1 || num > 20) return null
    const multVal = mult === 'S' ? 1 : mult === 'D' ? 2 : 3
    const ring: Ring = mult === 'S' ? 'SINGLE' : mult === 'D' ? 'DOUBLE' : 'TRIPLE'
    return { label: `${mult}${num} ${num*multVal}`, value: num * multVal, ring }
  }

  function getCurrentRemaining(): number {
    const s = matchState
    if (!s.players.length) return s.startingScore
    const p = s.players[s.currentPlayerIdx]
    const leg = p.legs[p.legs.length-1]
    if (!leg) return s.startingScore
    return leg.totalScoreRemaining
  }

  function addDart(value: number, label: string, ring: Ring) {
    if (pendingDarts >= 3) return
    const newDarts = pendingDarts + 1
    const newScore = pendingScore + value
    const remaining = getCurrentRemaining()
    const after = remaining - newScore

    // Bust conditions (double-out): negative or 1, or 0 without double/inner bull
    const isFinish = after === 0 && (ring === 'DOUBLE' || ring === 'INNER_BULL')
    const isBust = after < 0 || after === 1 || (after === 0 && !isFinish)

    if (isBust) {
      // Commit bust visit: 0 score, darts thrown so far including this one
      addVisit(0, newDarts)
      setPendingDarts(0); setPendingScore(0); setPendingEntries([])
      if (onVisitCommitted) onVisitCommitted(0, newDarts, false)
      return
    }

    // Normal add
    setPendingDarts(newDarts)
    setPendingScore(newScore)
    setPendingEntries(e => [...e, { label, value, ring }])

    if (isFinish) {
      // Commit visit with current total and end leg
      addVisit(newScore, newDarts)
      endLeg(newScore)
      setPendingDarts(0); setPendingScore(0); setPendingEntries([])
      if (onVisitCommitted) onVisitCommitted(newScore, newDarts, true)
      return
    }

    if (newDarts >= 3) {
      addVisit(newScore, newDarts)
      setPendingDarts(0); setPendingScore(0); setPendingEntries([])
      if (onVisitCommitted) onVisitCommitted(newScore, newDarts, false)
    }
  }

  function onAddAutoDart() {
    if (lastAutoScore) {
      if (onAutoDart) {
        try { onAutoDart(lastAutoValue, lastAutoRing, undefined) } catch {}
      } else {
        addDart(lastAutoValue, lastAutoScore, lastAutoRing)
      }
      setNonRegCount(0)
      setHadRecentAuto(false)
    }
  }

  function onApplyManual() {
    const parsed = parseManual(manualScore)
    if (!parsed) { alert('Enter like T20, D16, 5, 25, 50'); return }
    // If autoscore didn't register recently, count toward recalibration
    if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
      const c = nonRegCount + 1
      setNonRegCount(c)
      if (c >= 3) setShowRecalModal(true)
    } else {
      setNonRegCount(0)
    }
    addDart(parsed.value, parsed.label, parsed.ring)
    setManualScore('')
    setHadRecentAuto(false)
  }

  // Replace the last pending dart with a manually typed correction
  function onReplaceManual() {
    const parsed = parseManual(manualScore)
    if (!parsed) { alert('Enter like T20, D16, 5, 25, 50'); return }
    if (pendingDarts === 0 || pendingEntries.length === 0) {
      onApplyManual()
      return
    }
    if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
      const c = nonRegCount + 1
      setNonRegCount(c)
      if (c >= 3) setShowRecalModal(true)
    } else setNonRegCount(0)

    const last = pendingEntries[pendingEntries.length-1]
    const prevDarts = pendingDarts - 1
    const prevScore = pendingScore - (last?.value || 0)
    const remaining = getCurrentRemaining()
    const newScore = prevScore + parsed.value
    const newDarts = prevDarts + 1
    const after = remaining - newScore
    const isFinish = after === 0 && (parsed.ring === 'DOUBLE' || parsed.ring === 'INNER_BULL')
    const isBust = after < 0 || after === 1 || (after === 0 && !isFinish)

    if (isBust) {
      addVisit(0, newDarts)
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name
        if (name) addSample(name, newDarts, 0)
      } catch {}
      setPendingDarts(0); setPendingScore(0); setPendingEntries([])
      if (onVisitCommitted) onVisitCommitted(0, newDarts, false)
      setManualScore('')
      setHadRecentAuto(false)
      return
    }

    setPendingDarts(newDarts)
    setPendingScore(newScore)
    setPendingEntries((e)=>[...e.slice(0,-1), { label: parsed.label, value: parsed.value, ring: parsed.ring }])

    if (isFinish) {
      addVisit(newScore, newDarts)
      endLeg(newScore)
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name
        if (name) addSample(name, newDarts, newScore)
      } catch {}
      setPendingDarts(0); setPendingScore(0); setPendingEntries([])
      if (onVisitCommitted) onVisitCommitted(newScore, newDarts, true)
      setManualScore('')
      setHadRecentAuto(false)
      return
    }

    if (newDarts >= 3) {
      addVisit(newScore, newDarts)
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name
        if (name) addSample(name, newDarts, newScore)
      } catch {}
      setPendingDarts(0); setPendingScore(0); setPendingEntries([])
      if (onVisitCommitted) onVisitCommitted(newScore, newDarts, false)
    }
    setManualScore('')
    setHadRecentAuto(false)
  }

  function onRecalibrateNow() {
    setShowRecalModal(false)
    setNonRegCount(0)
    // Ask App to switch to calibrate tab
    try { window.dispatchEvent(new CustomEvent('ndn:request-calibrate')) } catch {}
  }

  function onResetCalibration() {
    resetCalibration()
    setShowRecalModal(false)
    setNonRegCount(0)
  }

  // Centralized quick-entry handler for S/D/T 1-20 buttons
  function onQuickEntry(num: number, mult: 'S'|'D'|'T') {
    if (pendingDarts >= 3) return
    const val = num * (mult==='S'?1:mult==='D'?2:3)
    const ring: Ring = mult==='S' ? 'SINGLE' : mult==='D' ? 'DOUBLE' : 'TRIPLE'
    // If autoscore didn't register recently, count toward recalibration
    if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
      const c = nonRegCount + 1
      setNonRegCount(c)
      if (c >= 3) setShowRecalModal(true)
    } else {
      setNonRegCount(0)
    }
    addDart(val, `${mult}${num} ${val}`, ring)
    setHadRecentAuto(false)
  }

  function onUndoDart() {
    if (pendingDarts === 0) return
    const last = pendingEntries[pendingEntries.length-1]
    setPendingDarts(d => d - 1)
    setPendingScore(s => s - (last?.value || 0))
    setPendingEntries(e => e.slice(0, -1))
  }

  function onCommitVisit() {
    if (pendingDarts === 0) return
    addVisit(pendingScore, pendingDarts)
    try {
      const name = matchState.players[matchState.currentPlayerIdx]?.name
      if (name) addSample(name, pendingDarts, pendingScore)
    } catch {}
    setPendingDarts(0); setPendingScore(0); setPendingEntries([])
    if (onVisitCommitted) onVisitCommitted(pendingScore, pendingDarts, false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Pills (optional; can be hidden and controlled by parent) */}
      {showToolbar && (
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <button
              className={`btn px-3 py-1 text-sm ${activeTab==='auto' ? 'tab--active' : ''}`}
              onClick={()=>{ setActiveTab('auto'); setShowManualModal(false); setShowAutoModal(true) }}
            >Autoscore</button>
            <button
              className={`btn px-3 py-1 text-sm ${activeTab==='manual' ? 'tab--active' : ''}`}
              onClick={()=>{ setActiveTab('manual'); setShowManualModal(true) }}
              title="Open Manual Correction"
            >Manual Correction</button>
          </div>
        </div>
      )}
      <div className="card">
        <h2 className="text-xl font-semibold mb-3">Camera</h2>
        <ResizablePanel storageKey="ndn:camera:size" className="relative rounded-2xl overflow-hidden bg-black" defaultWidth={720} defaultHeight={405} minWidth={480} minHeight={270} maxWidth={1600} maxHeight={900}>
          <video ref={videoRef} className="w-full h-full object-cover" />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" onClick={onOverlayClick} />
        </ResizablePanel>
        <div className="flex gap-2 mt-3">
          {!streaming ? (
            <button className="btn" onClick={startCamera}>Start Camera</button>
          ) : (
            <button className="btn bg-rose-600 hover:bg-rose-700" onClick={stopCamera}>Stop Camera</button>
          )}
          {/* Removed Snapshot panel; Capture remains for future features (e.g., quick preview) */}
          <button className="btn" onClick={capture} disabled={!streaming}>Capture Still</button>
          <button className="btn bg-slate-700 hover:bg-slate-800" onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:camera-reset' as any)) }catch{} }}>Reset Camera Size</button>
        </div>
      </div>
      {/* Snapshot panel removed to reduce unused space */}
      <canvas ref={canvasRef} className="hidden"></canvas>
      {/* Autoscore moved into a pill-triggered modal to reduce on-screen clutter */}
      {/* Modal: Autoscore */}
      {showAutoModal && (
        <div className="fixed inset-0 bg-black/60 z-[100]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <ResizableModal
              storageKey="ndn:autoscore:size"
              className="w-full max-w-3xl"
              defaultWidth={720}
              defaultHeight={520}
              minWidth={420}
              minHeight={320}
              maxWidth={1400}
              maxHeight={900}
              initialFitHeight
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">Autoscore</h2>
                <div className="flex items-center gap-2">
                  <button className="btn btn--ghost" onClick={()=>setShowAutoModal(false)}>Close</button>
                </div>
              </div>
              <div className="text-sm opacity-80 mb-3">Click the camera overlay to autoscore. Use Manual Correction if the last auto is off.</div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="font-semibold">Last auto:</span>
                <span>{lastAutoScore || '—'}</span>
                <button className="btn" onClick={onAddAutoDart} disabled={pendingDarts>=3}>Add Auto Dart</button>
                {nonRegCount>0 && <span className="text-sm opacity-80">No-registers: {nonRegCount}/3</span>}
              </div>
              <div className="mt-2">
                <div className="text-sm font-semibold mb-2">Quick entry</div>
                {/* Bulls */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <button className="btn" disabled={pendingDarts>=3} onClick={()=>{
                    if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
                      const c = nonRegCount + 1
                      setNonRegCount(c)
                      if (c >= 3) setShowRecalModal(true)
                    } else setNonRegCount(0)
                    addDart(25, 'BULL 25', 'BULL'); setHadRecentAuto(false)
                  }}>25</button>
                  <button className="btn" disabled={pendingDarts>=3} onClick={()=>{
                    if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
                      const c = nonRegCount + 1
                      setNonRegCount(c)
                      if (c >= 3) setShowRecalModal(true)
                    } else setNonRegCount(0)
                    addDart(50, 'INNER_BULL 50', 'INNER_BULL'); setHadRecentAuto(false)
                  }}>50</button>
                </div>
                {/* Grouped dropdown: Doubles, Singles, Trebles */}
                <div className="flex items-center gap-2 mb-3">
                  <select
                    className="input w-full max-w-sm"
                    value={quickSelAuto}
                    onChange={e=>setQuickSelAuto(e.target.value)}
                  >
                    <option value="" disabled>Select quick entry…</option>
                    <optgroup label="Doubles">
                      {Array.from({length:20}, (_,i)=>20-i).map(num => (
                        <option key={`D${num}`} value={`D${num}`}>{`D${num}`}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Singles">
                      {Array.from({length:20}, (_,i)=>20-i).map(num => (
                        <option key={`S${num}`} value={`S${num}`}>{`S${num}`}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Trebles">
                      {Array.from({length:20}, (_,i)=>20-i).map(num => (
                        <option key={`T${num}`} value={`T${num}`}>{`T${num}`}</option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    className="btn"
                    disabled={!quickSelAuto || pendingDarts>=3}
                    onClick={()=>{
                      const m = quickSelAuto.match(/^(S|D|T)(\d{1,2})$/)
                      if (!m) return
                      const mult = m[1] as 'S'|'D'|'T'
                      const num = parseInt(m[2], 10)
                      onQuickEntry(num, mult)
                    }}
                  >Add</button>
                </div>
              </div>
            </ResizableModal>
          </div>
        </div>
      )}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/60 z-[100]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 flex flex-col">
            <div className="p-3 md:p-4 flex items-center justify-between">
              <h3 className="text-xl md:text-2xl font-semibold">Manual Correction</h3>
              <div className="flex items-center gap-2">
                <button className="btn bg-slate-700 hover:bg-slate-800" onClick={()=>{ setShowManualModal(false); }}>Close</button>
              </div>
            </div>
            <div className="flex-1 p-3 md:p-4">
              <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Live preview */}
                <div className="card relative flex flex-col">
                  <div className="text-sm font-semibold mb-2">Live Preview</div>
                  <div className="relative flex-1 rounded-2xl overflow-hidden bg-black">
                    <canvas ref={manualPreviewRef} className="absolute inset-0 w-full h-full" />
                  </div>
                </div>
                {/* Manual controls */}
                <div className="card flex flex-col">
                  <div className="text-sm opacity-80 mb-2">Type a correction or replace the last dart. The preview updates live.</div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">Last auto:</span>
                    <span>{lastAutoScore || '—'}</span>
                    <button className="btn" onClick={onAddAutoDart} disabled={pendingDarts>=3}>Add Auto Dart</button>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      className="input flex-1"
                      placeholder="Manual (T20, D16, 5, 25, 50)"
                      value={manualScore}
                      onChange={e => setManualScore(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onApplyManual() }
                        if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); onReplaceManual() }
                      }}
                    />
                    <button className="btn btn--ghost" onClick={onReplaceManual} disabled={pendingDarts===0}>Replace Last</button>
                    <button className="btn" onClick={onApplyManual} disabled={pendingDarts>=3}>Add</button>
                  </div>
                  <div className="text-xs opacity-70 mb-4">Press Enter to Add · Shift+Enter to Replace Last</div>
                  <div className="mt-auto">
                    <div className="text-sm font-semibold mb-2">Quick entry</div>
                    {/* Bulls */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button className="btn" disabled={pendingDarts>=3} onClick={()=>{
                        if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
                          const c = nonRegCount + 1
                          setNonRegCount(c)
                          if (c >= 3) setShowRecalModal(true)
                        } else setNonRegCount(0)
                        addDart(25, 'BULL 25', 'BULL'); setHadRecentAuto(false)
                      }}>25</button>
                      <button className="btn" disabled={pendingDarts>=3} onClick={()=>{
                        if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
                          const c = nonRegCount + 1
                          setNonRegCount(c)
                          if (c >= 3) setShowRecalModal(true)
                        } else setNonRegCount(0)
                        addDart(50, 'INNER_BULL 50', 'INNER_BULL'); setHadRecentAuto(false)
                      }}>50</button>
                    </div>
                    {/* Grouped dropdown: Doubles, Singles, Trebles */}
                    <div className="flex items-center gap-2 mb-3">
                      <select
                        className="input w-full max-w-sm"
                        value={quickSelManual}
                        onChange={e=>setQuickSelManual(e.target.value)}
                      >
                        <option value="" disabled>Select quick entry…</option>
                        <optgroup label="Doubles">
                          {Array.from({length:20}, (_,i)=>20-i).map(num => (
                            <option key={`D${num}`} value={`D${num}`}>{`D${num}`}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Singles">
                          {Array.from({length:20}, (_,i)=>20-i).map(num => (
                            <option key={`S${num}`} value={`S${num}`}>{`S${num}`}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Trebles">
                          {Array.from({length:20}, (_,i)=>20-i).map(num => (
                            <option key={`T${num}`} value={`T${num}`}>{`T${num}`}</option>
                          ))}
                        </optgroup>
                      </select>
                      <button
                        className="btn"
                        disabled={!quickSelManual || pendingDarts>=3}
                        onClick={()=>{
                          const m = quickSelManual.match(/^(S|D|T)(\d{1,2})$/)
                          if (!m) return
                          const mult = m[1] as 'S'|'D'|'T'
                          const num = parseInt(m[2], 10)
                          onQuickEntry(num, mult)
                        }}
                      >Add</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showRecalModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full">
            <h3 className="text-xl font-semibold mb-2">Recalibration Recommended</h3>
            <p className="opacity-80 mb-3">We detected 3 incorrect autoscores in a row. You can recalibrate now or reset calibration and try again.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={onRecalibrateNow}>Go to Calibrate</button>
              <button className="btn" onClick={onResetCalibration}>Reset Calibration</button>
              <button className="btn bg-gray-200 text-gray-800" onClick={()=>{setShowRecalModal(false); setNonRegCount(0)}}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <h2 className="text-xl font-semibold mb-3">Pending Visit</h2>
        <div className="text-sm opacity-80 mb-2">Up to 3 darts per visit.</div>
        <ul className="text-sm mb-2 list-disc pl-5">
          {pendingEntries.length === 0 ? <li className="opacity-60">No darts yet</li> : pendingEntries.map((e,i) => <li key={i}>{e.label}</li>)}
        </ul>
        <div className="flex items-center gap-4 mb-2">
          <div className="font-semibold">Darts: {pendingDarts}/3</div>
          <div className="font-semibold">Total: {pendingScore}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={onUndoDart} disabled={pendingDarts===0}>Undo Dart</button>
          <button className="btn" onClick={onCommitVisit} disabled={pendingDarts===0}>Commit Visit</button>
          <button className="btn" onClick={()=>{setPendingDarts(0);setPendingScore(0);setPendingEntries([])}} disabled={pendingDarts===0}>Clear</button>
        </div>
      </div>
    </div>
  )
}
