import { useEffect, useRef, useState } from 'react'
import { useUserSettings } from '../store/userSettings'
import { useCalibration } from '../store/calibration'
import { useMatch } from '../store/match'
import { BoardRadii, drawPolyline, sampleRing, scaleHomography, type Point } from '../utils/vision'
import { scoreFromImagePoint } from '../utils/autoscore'
import { addSample } from '../store/profileStats'
import { subscribeExternalWS } from '../utils/scoring'
import ResizablePanel from './ui/ResizablePanel'
import ResizableModal from './ui/ResizableModal'
import useHeatmapStore from '../store/heatmap'

// Shared ring type across autoscore/manual flows
type Ring = 'MISS'|'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'

export default function CameraView({
  onVisitCommitted,
  showToolbar = true,
  onAutoDart,
  immediateAutoCommit = false,
  hideInlinePanels = false,
  scoringMode = 'x01',
  onGenericDart,
  onGenericReplace,
}: {
  onVisitCommitted?: (score: number, darts: number, finished: boolean) => void
  showToolbar?: boolean
  onAutoDart?: (value: number, ring: 'MISS'|'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', info?: { sector: number | null; mult: 0|1|2|3 }) => void
  immediateAutoCommit?: boolean
  hideInlinePanels?: boolean
  scoringMode?: 'x01' | 'custom'
  onGenericDart?: (value: number, ring: Ring, meta: { label: string }) => void
  onGenericReplace?: (value: number, ring: Ring, meta: { label: string }) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { preferredCameraId, preferredCameraLabel, setPreferredCamera, autoscoreProvider, autoscoreWsUrl } = useUserSettings()
  const manualOnly = autoscoreProvider === 'manual'
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [streaming, setStreaming] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)
  const { H, imageSize, reset: resetCalibration, _hydrated } = useCalibration()
  const [lastAutoScore, setLastAutoScore] = useState<string>('')
  const [manualScore, setManualScore] = useState<string>('')
  const [lastAutoValue, setLastAutoValue] = useState<number>(0)
  const [lastAutoRing, setLastAutoRing] = useState<Ring>('MISS')
  const [pendingDarts, setPendingDarts] = useState<number>(0)
  const [pendingScore, setPendingScore] = useState<number>(0)
  const [pendingEntries, setPendingEntries] = useState<{ label: string; value: number; ring: Ring }[]>([])
  const addVisit = useMatch(s => s.addVisit)
  const endLeg = useMatch(s => s.endLeg)
  const matchState = useMatch(s => s)
  const addHeatSample = useHeatmapStore(s => s.addSample)
  // Quick entry dropdown selections
  const [quickSelAuto, setQuickSelAuto] = useState('')
  const [quickSelManual, setQuickSelManual] = useState('')
  const [nonRegCount, setNonRegCount] = useState(0)
  const [showRecalModal, setShowRecalModal] = useState(false)
  const [hadRecentAuto, setHadRecentAuto] = useState(false)
  const [activeTab, setActiveTab] = useState<'auto'|'manual'>('auto')
  const [showManualModal, setShowManualModal] = useState(false)
  const [showAutoModal, setShowAutoModal] = useState(false)
  const [showScoringModal, setShowScoringModal] = useState(false)
  const manualPreviewRef = useRef<HTMLCanvasElement | null>(null)
  // Open Autoscore modal from parent via global event
  useEffect(() => {
    const onOpen = () => { if (!manualOnly) setShowAutoModal(true) }
    window.addEventListener('ndn:open-autoscore' as any, onOpen)
    return () => window.removeEventListener('ndn:open-autoscore' as any, onOpen)
  }, [manualOnly])

  // Open Scoring (Camera + Pending Visit) modal from parent via global event
  useEffect(() => {
    const onOpen = () => setShowScoringModal(true)
    window.addEventListener('ndn:open-scoring' as any, onOpen)
    return () => window.removeEventListener('ndn:open-scoring' as any, onOpen)
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

  useEffect(() => {
    if (manualOnly) {
      setActiveTab('manual')
      setShowAutoModal(false)
    }
  }, [manualOnly])

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
        const ctx = c.getContext('2d')
        if (!ctx) return
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
      } catch (e) {
        // Silently ignore preview update errors
        console.warn('Manual preview update error:', e)
      }
    }, 120)
    return () => clearInterval(id)
  }, [showManualModal])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  async function startCamera() {
    if (cameraStarting || streaming) return
    
    // If phone camera is selected, don't try to start a local camera
    // The phone camera is displayed via PhoneCameraOverlay in the game tabs
    if (preferredCameraLabel === 'Phone Camera') {
      console.log('[CAMERA] Phone camera is selected - skipping local camera startup')
      console.log('[CAMERA] Phone camera feed shown via overlay in game tabs')
      setCameraStarting(false)
      return
    }
    
    setCameraStarting(true)
    console.log('[CAMERA] Starting camera...')
    try {
      // If a preferred camera is set, request it; otherwise default to back camera on mobile
      const constraints: MediaStreamConstraints = preferredCameraId 
        ? { video: { deviceId: { exact: preferredCameraId } }, audio: false } 
        : { video: { facingMode: 'environment' }, audio: false } // Prefer back camera on mobile
      console.log('[CAMERA] Using constraints:', constraints)
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        console.log('[CAMERA] Got stream:', !!stream)
      } catch (err: any) {
        console.warn('[CAMERA] First attempt failed:', err)
        // Fallback if specific device isn't available or facingMode not supported
        const name = (err && (err.name || err.code)) || ''
        if (preferredCameraId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
          console.log('[CAMERA] Trying fallback without deviceId')
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } else if (!preferredCameraId && (name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'NotSupportedError')) {
          console.log('[CAMERA] Trying fallback for facingMode not supported')
          // Fallback for devices that don't support facingMode
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } else {
          throw err
        }
      }
      if (videoRef.current) {
        console.log('[CAMERA] Setting stream to video element')
        videoRef.current.srcObject = stream
        console.log('[CAMERA] Stream tracks:', stream.getTracks().length, 'video tracks:', stream.getVideoTracks().length)
        // Add event listeners for debugging
        videoRef.current.addEventListener('loadeddata', () => console.log('[CAMERA] Video loadeddata'))
        videoRef.current.addEventListener('canplay', () => console.log('[CAMERA] Video canplay'))
        videoRef.current.addEventListener('play', () => console.log('[CAMERA] Video started playing'))
        videoRef.current.addEventListener('error', (e) => console.error('[CAMERA] Video error:', e))
        try {
          videoRef.current.play()
          console.log('[CAMERA] Play called successfully')
        } catch (playErr) {
          console.error('[CAMERA] Video play failed:', playErr)
          // Try again after a short delay
          setTimeout(() => {
            try {
              videoRef.current?.play()
              console.log('[CAMERA] Retry play called')
            } catch (retryErr) {
              console.error('[CAMERA] Retry play failed:', retryErr)
            }
          }, 100)
        }
      } else {
        console.error('[CAMERA] Video element not found')
      }
      setStreaming(true)
      // Capture device list for inline picker - no automatic preference updates
      try {
        const list = await navigator.mediaDevices.enumerateDevices()
        setAvailableCameras(list.filter(d=>d.kind==='videoinput'))
        console.log('[CAMERA] Found cameras:', list.filter(d=>d.kind==='videoinput').length)
      } catch (enumErr) {
        console.warn('[CAMERA] Failed to enumerate devices:', enumErr)
      }
    } catch (e) {
      console.error('[CAMERA] Camera start failed:', e)
      alert('Camera permission denied or not available.')
    } finally {
      setCameraStarting(false)
    }
  }

  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(t => t.stop())
      videoRef.current.srcObject = null
      setStreaming(false)
      setCameraStarting(false)
    }
  }

  function capture() {
    try {
      if (!videoRef.current || !canvasRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/png')
      setSnapshotUrl(url)
    } catch (e) {
      console.warn('Capture error:', e)
    }
  }

  // Inline light-weight device switcher (optional)
  function CameraSelector() {
    if (!availableCameras.length) return null
    return (
      <div className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-black/40 rounded px-2 py-1 text-xs">
        <span>Cam:</span>
        <select
          className="bg-black/20 rounded px-1 py-0.5"
          value={preferredCameraId || ''}
          onChange={async (e)=>{
            if (cameraStarting) return
            const id = e.target.value || undefined
            const label = availableCameras.find(d=>d.deviceId===id)?.label
            // This is a user-initiated change so force the preference even when locked
            setPreferredCamera(id, label||'', true)
            // Stop current camera and wait for cleanup
            stopCamera()
            // Small delay to ensure camera device is fully released
            await new Promise(resolve => setTimeout(resolve, 100))
            try {
              await startCamera()
            } catch (err) {
              console.warn('Failed to start camera after device switch:', err)
              // Try one more time after a longer delay
              setTimeout(async () => {
                try {
                  await startCamera()
                } catch (retryErr) {
                  console.error('Camera switch failed after retry:', retryErr)
                  alert('Failed to switch camera. Please try again or refresh the page.')
                }
              }, 500)
            }
          }}
        >
          <option value="">Auto</option>
          {availableCameras.map(d => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
          ))}
        </select>
      </div>
    )
  }

  function drawOverlay() {
    try {
      if (!overlayRef.current || !videoRef.current || !H || !imageSize) return
      const o = overlayRef.current
      const v = videoRef.current
      const w = v.clientWidth
      const h = v.clientHeight
      o.width = w; o.height = h
      const ctx = o.getContext('2d')
      if (!ctx) return
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
    } catch (e) {
      // Silently ignore drawing errors to prevent re-render loops
      console.warn('Overlay drawing error:', e)
    }
  }

  useEffect(() => {
    if (manualOnly) return
    const id = setInterval(drawOverlay, 250)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [H, imageSize, streaming, manualOnly])

  // External autoscore subscription
  useEffect(() => {
    if (autoscoreProvider !== 'external-ws' || !autoscoreWsUrl) return
    const sub = subscribeExternalWS(autoscoreWsUrl, (d) => {
      // Prefer parent hook if provided; otherwise add to visit directly
      if (onAutoDart) {
        try { onAutoDart(d.value, d.ring as any, { sector: d.sector ?? null, mult: (d.mult as any) ?? 0 }) } catch {}
        try { addHeatSample({ playerId: matchState.players[matchState.currentPlayerIdx]?.id ?? null, sector: d.sector ?? null, mult: (d.mult as any) ?? 0, ring: d.ring as any, ts: Date.now() }) } catch {}
      } else {
        const label = d.ring === 'INNER_BULL' ? 'INNER_BULL 50' : d.ring === 'BULL' ? 'BULL 25' : `${d.ring[0]}${(d.value/(d.mult||1))||d.value} ${d.value}`
        addDart(d.value, label, d.ring as any)
        try { addHeatSample({ playerId: matchState.players[matchState.currentPlayerIdx]?.id ?? null, sector: d.sector ?? null, mult: (d.mult as any) ?? 0, ring: d.ring as any, ts: Date.now() }) } catch {}
      }
    })
    return () => sub.close()
  }, [autoscoreProvider, autoscoreWsUrl])

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
        try { addHeatSample({ playerId: matchState.players[matchState.currentPlayerIdx]?.id ?? null, sector: score.sector ?? null, mult: score.mult ?? 0, ring: score.ring as any, ts: Date.now() }) } catch {}
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
    // In generic mode, delegate to parent without X01 bust/finish rules
    if (scoringMode === 'custom') {
      if (onGenericDart) try { onGenericDart(value, ring, { label }) } catch {}
      // Maintain a lightweight pending list for UI only
      if (pendingDarts >= 3) return
      const newDarts = pendingDarts + 1
      setPendingDarts(newDarts)
      setPendingScore(s => s + value)
      setPendingEntries(e => [...e, { label, value, ring }])
      return
    }

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
    if (scoringMode === 'custom') {
      // Let parent handle replacement semantics
      if (!hadRecentAuto || !lastAutoScore || lastAutoRing === 'MISS' || lastAutoValue === 0) {
        const c = nonRegCount + 1
        setNonRegCount(c)
        if (c >= 3) setShowRecalModal(true)
      } else setNonRegCount(0)

      // Update local pending UI
      setPendingEntries((e)=>[...e.slice(0,-1), { label: parsed.label, value: parsed.value, ring: parsed.ring }])
      if (onGenericReplace) try { onGenericReplace(parsed.value, parsed.ring, { label: parsed.label }) } catch {}
      setManualScore('')
      setHadRecentAuto(false)
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
    if (scoringMode === 'custom') {
      // For custom mode, simply clear local pending (parent maintains its own scoring)
      setPendingDarts(0); setPendingScore(0); setPendingEntries([])
      return
    }
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
            {!manualOnly && (
              <button
                className={`btn px-3 py-1 text-sm ${activeTab==='auto' ? 'tab--active' : ''}`}
                onClick={()=>{ setActiveTab('auto'); setShowManualModal(false); setShowAutoModal(true) }}
              >Autoscore</button>
            )}
            <button
              className={`btn px-3 py-1 text-sm ${activeTab==='manual' ? 'tab--active' : ''}`}
              onClick={()=>{ setActiveTab('manual'); setShowManualModal(true) }}
              title="Open Manual Correction"
            >Manual Correction</button>
            {manualOnly && (
              <span className="text-xs opacity-70">Manual scoring mode active</span>
            )}
          </div>
        </div>
      )}
      {!hideInlinePanels && !manualOnly ? (
        <div className="card">
          <h2 className="text-xl font-semibold mb-3">Camera</h2>
          <ResizablePanel storageKey="ndn:camera:size" className="relative rounded-2xl overflow-hidden bg-black" defaultWidth={480} defaultHeight={360} minWidth={320} minHeight={240} maxWidth={1600} maxHeight={900}>
            <CameraSelector />
            {preferredCameraLabel === 'Phone Camera' ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900/50 to-purple-900/50">
                <div className="text-center">
                  <div className="text-4xl mb-4">📱</div>
                  <div className="text-lg font-semibold text-blue-100 mb-2">Phone Camera Active</div>
                  <div className="text-sm text-slate-300 mb-4">Your phone camera feed is shown in the floating overlay</div>
                  <div className="text-xs text-slate-400">Camera controls available in Calibrator tab</div>
                </div>
              </div>
            ) : (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" playsInline webkit-playsinline="true" muted autoPlay />
                <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" onClick={onOverlayClick} />
              </>
            )}
          </ResizablePanel>
          <div className="flex gap-2 mt-3">
            {preferredCameraLabel === 'Phone Camera' ? (
              <div className="text-sm text-blue-200 px-3 py-2 rounded bg-blue-900/30 flex-1">
                📱 Using phone camera from overlay
              </div>
            ) : (
              <>
                {!streaming ? (
                  <button className="btn" onClick={startCamera} disabled={cameraStarting}>
                    {cameraStarting ? 'Connecting Camera...' : 'Connect Camera'}
                  </button>
                ) : (
                  <button className="btn bg-rose-600 hover:bg-rose-700" onClick={stopCamera}>Stop Camera</button>
                )}
                {/* Removed Snapshot panel; Capture remains for future features (e.g., quick preview) */}
                <button className="btn" onClick={capture} disabled={!streaming}>Capture Still</button>
              </>
            )}
            <button className="btn bg-slate-700 hover:bg-slate-800" onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:camera-reset' as any)) }catch{} }}>Reset Camera Size</button>
          </div>
        </div>
      ) : null}
      {!hideInlinePanels && manualOnly && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-3">Manual Scoring</h2>
          <p className="text-sm opacity-80 mb-3">Camera-based autoscore is disabled. Use the manual visit input or open the Manual Correction panel to record darts.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={()=>{ setShowManualModal(true); setActiveTab('manual') }}>Open Manual Correction</button>
            <button className="btn btn--ghost" onClick={()=>{ try { window.dispatchEvent(new Event('ndn:open-scoring' as any)) } catch {} }}>Manage Pending Visit</button>
          </div>
        </div>
      )}
      {/* Snapshot panel removed to reduce unused space */}
      <canvas ref={canvasRef} className="hidden"></canvas>
      {/* Autoscore moved into a pill-triggered modal to reduce on-screen clutter */}
      {/* Modal: Autoscore */}
  {showAutoModal && !manualOnly && (
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
                  <input
                    className="input w-full max-w-sm"
                    list="autoscore-quick-list"
                    placeholder="Type or select (e.g., D16, T20, S5)"
                    value={quickSelAuto}
                    onChange={e=>setQuickSelAuto(e.target.value.toUpperCase())}
                    onKeyDown={e=>{ if(e.key==='Enter'){ const m = quickSelAuto.match(/^(S|D|T)(\d{1,2})$/); if(m){ onQuickEntry(parseInt(m[2],10), m[1] as any); } }} }
                  />
                  <datalist id="autoscore-quick-list">
                    {(['D','S','T'] as const).map(mult => (
                      Array.from({length:20}, (_,i)=>i+1).map(num => (
                        <option key={`${mult}${num}`} value={`${mult}${num}`} />
                      ))
                    ))}
                  </datalist>
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
                      <input
                        className="input w-full max-w-sm"
                        list="manual-quick-list"
                        placeholder="Type or select (e.g., D16, T20, S5)"
                        value={quickSelManual}
                        onChange={e=>setQuickSelManual(e.target.value.toUpperCase())}
                        onKeyDown={e=>{ if(e.key==='Enter'){ const m = quickSelManual.match(/^(S|D|T)(\d{1,2})$/); if(m){ onQuickEntry(parseInt(m[2],10), m[1] as any); } }} }
                      />
                      <datalist id="manual-quick-list">
                        {(['D','S','T'] as const).map(mult => (
                          Array.from({length:20}, (_,i)=>i+1).map(num => (
                            <option key={`${mult}${num}`} value={`${mult}${num}`} />
                          ))
                        ))}
                      </datalist>
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
      {showScoringModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
          <div className="card w-full max-w-4xl relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold" onClick={()=>setShowScoringModal(false)}>Close</button>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">Scoring</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Camera section */}
              <div className="bg-black/30 rounded-2xl p-4">
                <h2 className="text-lg font-semibold mb-3">Camera</h2>
                <ResizablePanel storageKey="ndn:camera:size:modal" className="relative rounded-2xl overflow-hidden bg-black" defaultWidth={480} defaultHeight={360} minWidth={320} minHeight={240} maxWidth={1600} maxHeight={900}>
                  <CameraSelector />
                  {preferredCameraLabel === 'Phone Camera' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900/50 to-purple-900/50">
                      <div className="text-center">
                        <div className="text-4xl mb-4">📱</div>
                        <div className="text-lg font-semibold text-blue-100 mb-2">Phone Camera Active</div>
                        <div className="text-sm text-slate-300 mb-4">Your phone camera feed is shown in the floating overlay</div>
                        <div className="text-xs text-slate-400">Camera controls available in Calibrator tab</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline webkit-playsinline="true" muted autoPlay />
                      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" onClick={onOverlayClick} />
                    </>
                  )}
                </ResizablePanel>
                <div className="flex gap-2 mt-3">
                  {preferredCameraLabel === 'Phone Camera' ? (
                    <div className="text-sm text-blue-200 px-3 py-2 rounded bg-blue-900/30 flex-1">
                      📱 Using phone camera from overlay
                    </div>
                  ) : (
                    <>
                      {!streaming ? (
                        <button className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold" onClick={startCamera}>Connect Camera</button>
                      ) : (
                        <button className="btn bg-gradient-to-r from-rose-600 to-rose-700 text-white font-bold" onClick={stopCamera}>Stop Camera</button>
                      )}
                      <button className="btn bg-gradient-to-r from-indigo-500 to-indigo-700 text-white font-bold" onClick={capture} disabled={!streaming}>Capture Still</button>
                    </>
                  )}
                  <button className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold" onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:camera-reset' as any)) }catch{} }}>Reset Camera Size</button>
                </div>
              </div>
              {/* Pending Visit section */}
              <div className="bg-black/30 rounded-2xl p-4">
                <h2 className="text-lg font-semibold mb-3">Pending Visit</h2>
                <div className="text-sm opacity-80 mb-2">Up to 3 darts per visit.</div>
                <ul className="text-sm mb-2 list-disc pl-5">
                  {pendingEntries.length === 0 ? <li className="opacity-60">No darts yet</li> : pendingEntries.map((e,i) => <li key={i}>{e.label}</li>)}
                </ul>
                <div className="flex items-center gap-4 mb-2">
                  <div className="font-semibold">Darts: {pendingDarts}/3</div>
                  <div className="font-semibold">Total: {pendingScore}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold" onClick={onUndoDart} disabled={pendingDarts===0}>Undo Dart</button>
                  <button className="btn bg-gradient-to-r from-emerald-500 to-emerald-700 text-white font-bold" onClick={onCommitVisit} disabled={pendingDarts===0}>Commit Visit</button>
                  <button className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold" onClick={()=>{setPendingDarts(0);setPendingScore(0);setPendingEntries([])}} disabled={pendingDarts===0}>Clear</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showRecalModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="card max-w-md w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold" onClick={()=>{setShowRecalModal(false); setNonRegCount(0)}}>Close</button>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">Recalibration Recommended</h3>
            <div className="mb-4 text-lg font-semibold text-indigo-200">We detected 3 incorrect autoscores in a row. You can recalibrate now or reset calibration and try again.</div>
            <div className="flex gap-2">
              <button className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold" onClick={onRecalibrateNow}>Go to Calibrate</button>
              <button className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold" onClick={onResetCalibration}>Reset Calibration</button>
              <button className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold" onClick={()=>{setShowRecalModal(false); setNonRegCount(0)}}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
  {!hideInlinePanels ? (
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
  ) : null}
    </div>
  )
}
