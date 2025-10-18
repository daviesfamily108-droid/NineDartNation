import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useUserSettings } from '../store/userSettings'

export default function CameraTile({ label, autoStart = false, scale: scaleOverride }: { label?: string; autoStart?: boolean; scale?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streaming, setStreaming] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [pc, setPc] = useState<RTCPeerConnection | null>(null)
  const [mode, setMode] = useState<'local'|'phone'>(() => (localStorage.getItem('ndn:camera:mode') as any) || 'local')
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [now, setNow] = useState<number>(Date.now())
  const [paired, setPaired] = useState<boolean>(false)
  const [lanHost, setLanHost] = useState<string | null>(null)
  const [httpsInfo, setHttpsInfo] = useState<{ https: boolean; port: number } | null>(null)
  const [showTips, setShowTips] = useState<boolean>(true)
  useEffect(() => {
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1') {
      fetch(`/api/hosts`).then(r => r.json()).then(j => {
        const ip = Array.isArray(j?.hosts) && j.hosts.find((x: string) => x)
        if (ip) setLanHost(ip)
      }).catch(()=>{})
    }
    // Detect HTTPS support for the phone link
    fetch(`/api/https-info`).then(r=>r.json()).then(j=>{
      if (j && typeof j.https === 'boolean') setHttpsInfo({ https: !!j.https, port: Number(j.port)||8788 })
    }).catch(()=>{})
  }, [])
  const mobileUrl = useMemo(() => {
    const code = pairCode || '____'
    // If a hosted WS URL is configured (e.g., Render), derive the server origin from it
    const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
    if (envUrl && envUrl.length > 0) {
      try {
        // Convert ws(s)://host[/ws] -> http(s)://host (strip trailing /ws)
        const u = new URL(envUrl)
        const isSecure = u.protocol === 'wss:'
        const origin = `${isSecure ? 'https' : 'http'}://${u.host}${u.pathname.endsWith('/ws') ? '' : u.pathname}`
        const base = origin.replace(/\/?ws$/i, '')
        return `${base}/mobile-cam.html?code=${code}`
      } catch {}
    }
    // Fallback to local development: prefer LAN host if detected
    const host = (lanHost || window.location.hostname)
    const useHttps = !!httpsInfo?.https
    const port = useHttps ? (httpsInfo?.port || 8788) : 8787
    const proto = useHttps ? 'https' : 'http'
    return `${proto}://${host}:${port}/mobile-cam.html?code=${code}`
  }, [pairCode, lanHost, httpsInfo])
  useEffect(() => { localStorage.setItem('ndn:camera:mode', mode) }, [mode])
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  useEffect(() => {
    if (!pairCode) { setQrDataUrl(''); return }
    QRCode.toDataURL(mobileUrl, { width: 160, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [mobileUrl, pairCode])
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const ttl = useMemo(() => expiresAt ? Math.max(0, Math.ceil((expiresAt - now)/1000)) : null, [expiresAt, now])
  // Auto-regenerate only if code expired and phone has not joined yet
  useEffect(() => {
    if (ttl === null) return
    if (ttl <= 0 && !paired && !streaming && mode === 'phone') {
      regenerateCode()
    }
  }, [ttl, paired, streaming, mode])

  useEffect(() => {
    if (!autoStart) return
    start().catch(()=>{})
    return () => stop()
  }, [autoStart])

  async function start() {
    try {
      // Prefer saved camera if available
      const { preferredCameraId, setPreferredCamera } = useUserSettings.getState()
      const constraints: MediaStreamConstraints = preferredCameraId ? { video: { deviceId: { exact: preferredCameraId } }, audio: false } : { video: true, audio: false }
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err: any) {
        const name = (err && (err.name || err.code)) || ''
        if (preferredCameraId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } else {
          throw err
        }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStreaming(true)
      }
      // Camera started successfully - no automatic preference updates
    } catch {}
  }
  function stop() {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach(t => t.stop())
      videoRef.current.srcObject = null
      setStreaming(false)
    }
  }

  // Phone pairing via WebRTC
  function ensureWS() {
    if (ws && ws.readyState === WebSocket.OPEN) return ws
    const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
    // Normalize env URL to ensure it targets the WS endpoint path
    const normalizedEnv = envUrl && envUrl.length > 0
      ? (envUrl.endsWith('/ws') ? envUrl : envUrl.replace(/\/$/, '') + '/ws')
      : undefined
    // Fallbacks prefer same-origin when available; always include '/ws'
    const proto = (window.location.protocol === 'https:' ? 'wss' : 'ws')
    const sameOrigin = `${proto}://${window.location.host}/ws`
    const host = window.location.hostname
    const fallbacks = [sameOrigin, `${proto}://${host}:8787/ws`, `${proto}://${host}:3000/ws`]
    const url = normalizedEnv || fallbacks[0]
    const socket = new WebSocket(url)
    setWs(socket)
    return socket
  }
  async function startPhonePairing() {
    setMode('phone')
    setPaired(false)
    const socket = ensureWS()
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'cam-create' }))
    } else {
      socket.onopen = () => socket.send(JSON.stringify({ type: 'cam-create' }))
    }
    socket.onmessage = async (ev) => {
      const data = JSON.parse(ev.data)
      if (data.type === 'cam-code') {
        setPairCode(data.code)
        if (data.expiresAt) setExpiresAt(data.expiresAt)
      } else if (data.type === 'cam-peer-joined') {
        setPaired(true)
        // Create offer to the phone
        const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
        setPc(peer)
        peer.onicecandidate = (e) => {
          if (e.candidate && pairCode) socket.send(JSON.stringify({ type: 'cam-ice', code: pairCode, payload: e.candidate }))
        }
        peer.ontrack = (ev) => {
          if (videoRef.current) {
            const inbound = ev.streams?.[0]
            if (inbound) {
              videoRef.current.srcObject = inbound
              videoRef.current.play().catch(()=>{})
              setStreaming(true)
            }
          }
        }
        const offer = await peer.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true })
        await peer.setLocalDescription(offer)
        if (pairCode) socket.send(JSON.stringify({ type: 'cam-offer', code: pairCode, payload: offer }))
      } else if (data.type === 'cam-answer') {
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.payload))
      } else if (data.type === 'cam-ice') {
        if (pc) try { await pc.addIceCandidate(data.payload) } catch {}
      }
    }
  }
  function regenerateCode() {
    setPairCode(null)
    setExpiresAt(null)
    setPaired(false)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cam-create' }))
    } else {
      startPhonePairing()
    }
  }

  function stopAll() {
    stop()
    setPairCode(null)
    setPaired(false)
    setExpiresAt(null)
    if (pc) { try { pc.close() } catch {}; setPc(null) }
  }
  return (
    <CameraFrame label={label} autoStart={autoStart} start={start} stopAll={stopAll} startPhonePairing={startPhonePairing} videoRef={videoRef} streaming={streaming} mode={mode} setMode={setMode} pairCode={pairCode} mobileUrl={mobileUrl} ttl={ttl} qrDataUrl={qrDataUrl} regenerateCode={regenerateCode} httpsInfo={httpsInfo} showTips={showTips} setShowTips={setShowTips} scaleOverride={scaleOverride} />
  )
}

function CameraFrame(props: any) {
  const { cameraScale } = useUserSettings()
  const scale = Math.max(0.5, Math.min(1.25, Number(props.scaleOverride ?? cameraScale ?? 1)))
  const { label, start, stopAll, startPhonePairing, videoRef, streaming, mode, setMode, pairCode, mobileUrl, ttl, qrDataUrl, regenerateCode, httpsInfo, showTips, setShowTips } = props
  return (
    <div className="rounded-2xl overflow-hidden bg-black w-full mx-auto" style={{ aspectRatio: '16 / 9', transform: `scale(${scale})`, transformOrigin: 'center' }}>
      <video ref={videoRef} className="w-full h-full object-contain object-center bg-black" />
      <div className="p-1 flex items-center justify-between bg-black/60 text-white text-[10px] gap-1">
        <span className="truncate">{label || (streaming ? (mode==='phone' ? 'PHONE LIVE' : 'LIVE') : 'Camera')}</span>
        <div className="flex items-center gap-1">
          {!streaming && (
            <>
              <button className={`px-1 py-0.5 rounded ${mode==='local'?'bg-emerald-600':'bg-slate-700'}`} onClick={() => { setMode('local'); start() }}>Local</button>
              <button className={`px-1 py-0.5 rounded ${mode==='phone'?'bg-emerald-600':'bg-slate-700'}`} onClick={startPhonePairing}>Phone</button>
            </>
          )}
          {streaming ? (
            <button className="px-1 py-0.5 rounded bg-rose-600" onClick={stopAll}>Stop</button>
          ) : null}
        </div>
      </div>
      {mode==='phone' && pairCode && !streaming && (
        <div className="p-2 text-white text-[10px] bg-black/50">
          <div>Open on your phone:</div>
          <div className="font-mono">{mobileUrl}</div>
          <div>Code: <span className="font-mono">{pairCode}</span></div>
          {qrDataUrl && <img className="mt-1 w-[160px] h-[160px] bg-white rounded" alt="Scan to open" src={qrDataUrl} />}
          <div className="mt-1 flex items-center gap-2">
            {ttl !== null && <span>Expires in {ttl}s</span>}
            <button className="px-1 py-0.5 rounded bg-slate-700" onClick={regenerateCode}>Regenerate</button>
          </div>
          {showTips && (
            <div className="mt-2 p-2 rounded bg-slate-900/60 border border-slate-700/50 text-slate-200">
              <div className="font-semibold mb-1">Troubleshooting</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Phone and desktop must be on the same Wi‑Fi network.</li>
                <li>Allow the server through your firewall (ports 8787 and {httpsInfo?.https ? httpsInfo.port : 8788}).</li>
                <li>On iPhone, use HTTPS links (QR will prefer https when enabled).</li>
              </ul>
              <div className="mt-2 text-right"><button className="btn btn--ghost px-2 py-1 text-xs" onClick={()=>setShowTips(false)}>Hide tips</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
