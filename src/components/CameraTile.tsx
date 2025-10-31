import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import QRCode from 'qrcode'
import { useUserSettings } from '../store/userSettings'
import { discoverNetworkDevices, connectToNetworkDevice, type NetworkDevice, discoverUSBDevices, requestUSBDevice, connectToUSBDevice, type USBDevice } from '../utils/networkDevices'
import { apiFetch } from '../utils/api'

type CameraTileProps = {
  label?: string
  autoStart?: boolean
  scale?: number
  className?: string
  aspect?: 'inherit' | 'wide' | 'square' | 'portrait' | 'classic' | 'free'
  style?: CSSProperties
  fill?: boolean
}

export default function CameraTile({
  label,
  autoStart = false,
  scale: scaleOverride,
  className,
  aspect = 'inherit',
  style,
  fill = false,
}: CameraTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streaming, setStreaming] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [pc, setPc] = useState<RTCPeerConnection | null>(null)
  
  // Initialize mode: prioritize phone camera if preferred, otherwise use localStorage
  const preferredCameraLabel = useUserSettings(s => s.preferredCameraLabel)
  const [mode, setMode] = useState<'local'|'phone'|'wifi'>(() => {
    // If phone camera is selected, start in phone mode
    if (preferredCameraLabel === 'Phone Camera') {
      console.log('[CAMERATILE] Initializing mode to phone (from preferred camera selection)')
      return 'phone'
    }
    // Otherwise use saved mode or default to local
    const saved = localStorage.getItem('ndn:camera:mode') as any
    console.log('[CAMERATILE] Initializing mode to', saved || 'local', '(from localStorage)')
    return saved || 'local'
  })
  
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [now, setNow] = useState<number>(Date.now())
  const [paired, setPaired] = useState<boolean>(false)
  const [lanHost, setLanHost] = useState<string | null>(null)
  const [httpsInfo, setHttpsInfo] = useState<{ https: boolean; port: number } | null>(null)
  const [showTips, setShowTips] = useState<boolean>(true)
  const [wifiDevices, setWifiDevices] = useState<NetworkDevice[]>([])
  const [discoveringWifi, setDiscoveringWifi] = useState<boolean>(false)
  const [usbDevices, setUsbDevices] = useState<USBDevice[]>([])
  const [discoveringUsb, setDiscoveringUsb] = useState<boolean>(false)
  const autoscoreProvider = useUserSettings(s => s.autoscoreProvider)
  const setPreferredCameraLocked = useUserSettings(s => s.setPreferredCameraLocked)

  if (autoscoreProvider === 'manual') {
    const fallbackBase = fill ? 'rounded-2xl overflow-hidden bg-black w-full flex flex-col' : 'rounded-2xl overflow-hidden bg-black w-full mx-auto'
    const fallbackClass = [fallbackBase, className].filter(Boolean).join(' ').trim()
    const fallbackStyle: CSSProperties = { ...(style || {}) }
    if (!fill && fallbackStyle.aspectRatio === undefined && fallbackStyle.height === undefined && fallbackStyle.minHeight === undefined) {
      fallbackStyle.aspectRatio = '4 / 3'
    }
    return (
      <div className={fallbackClass} style={fallbackStyle}>
        <div className="flex-1 w-full h-full flex items-center justify-center bg-slate-900 text-slate-200 text-xs p-4 text-center">
          Manual scoring mode active — camera feeds are disabled.
        </div>
      </div>
    )
  }
  useEffect(() => {
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1') {
      apiFetch(`/api/hosts`).then(r => r.json()).then(j => {
        const ip = Array.isArray(j?.hosts) && j.hosts.find((x: string) => x)
        if (ip) setLanHost(ip)
      }).catch(()=>{})
    }
    // Detect HTTPS support for the phone link
    apiFetch(`/api/https-info`).then(r=>r.json()).then(j=>{
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
  useEffect(() => { 
    console.log('[CAMERATILE] Mode changed to:', mode, '- persisting to localStorage')
    localStorage.setItem('ndn:camera:mode', mode) 
  }, [mode])
  
  // Sync phone camera selection from Calibrator into CameraTile mode state
  // When user locks in phone camera in Calibrator, it updates preferredCameraLabel
  // This effect ensures CameraTile's UI reflects that selection
  useEffect(() => {
    console.log('[CAMERATILE] Checking camera selection sync: preferredCameraLabel=', preferredCameraLabel, 'mode=', mode)
    if (preferredCameraLabel === 'Phone Camera' && mode !== 'phone') {
      console.log('[CAMERATILE] Syncing mode to phone from Calibrator selection')
      setMode('phone')
    }
  }, [preferredCameraLabel, mode])
  
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
  // Intentionally disabled automatic regeneration of phone pairing codes.
  // Codes will only be created when the user explicitly requests it (button click).
  // This prevents a code expiring and the UI silently generating a new one while pairing.

  useEffect(() => {
    if (autoStart) {
      start().catch(()=>{})
    } else {
      stop()
    }
  }, [autoStart, preferredCameraLabel])

  async function start() {
    if (mode === 'wifi') {
      return startWifiConnection()
    }

    // If phone camera is selected and paired, don't try to start local camera
    // The phone camera is displayed via PhoneCameraOverlay
    if (preferredCameraLabel === 'Phone Camera') {
      console.log('[CAMERATILE] Phone camera is selected - skipping local camera startup')
      console.log('[CAMERATILE] Phone camera feed shown via overlay')
      return
    }

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

  async function startWifiConnection() {
    setDiscoveringWifi(true)
    try {
      const devices = await discoverNetworkDevices()
      setWifiDevices(devices)
      if (devices.length === 0) {
        alert('No wifi scoring devices found on your network. Make sure devices are powered on and connected to the same network.')
      }
    } catch (error) {
      console.error('Wifi device discovery failed:', error)
      alert('Failed to discover wifi devices. Please check your network connection.')
    } finally {
      setDiscoveringWifi(false)
    }
  }

  async function connectToWifiDevice(device: NetworkDevice) {
    try {
      setWifiDevices(devices => devices.map(d => 
        d.id === device.id ? { ...d, status: 'connecting' as const } : d
      ))

      const stream = await connectToNetworkDevice(device)
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStreaming(true)
        setWifiDevices(devices => devices.map(d => 
          d.id === device.id ? { ...d, status: 'online' as const } : d
        ))
      } else {
        throw new Error('Failed to get video stream')
      }
    } catch (error) {
      console.error('Failed to connect to wifi device:', error)
      alert(`Failed to connect to ${device.name}. Please check the device and try again.`)
      setWifiDevices(devices => devices.map(d => 
        d.id === device.id ? { ...d, status: 'offline' as const } : d
      ))
    }
  }

  async function startUsbConnection() {
    setDiscoveringUsb(true)
    try {
      // First try to get already paired devices
      const devices = await discoverUSBDevices()
      setUsbDevices(devices)

      // Then request user to select a new device
      const newDevice = await requestUSBDevice()
      if (newDevice) {
        setUsbDevices(prev => [...prev, newDevice])
      }

      if (devices.length === 0 && !newDevice) {
        alert('No USB scoring devices found. Please connect a device and try again.')
      }
    } catch (error) {
      console.error('USB device discovery failed:', error)
      alert('Failed to discover USB devices. Please check device connections.')
    } finally {
      setDiscoveringUsb(false)
    }
  }

  async function connectToUsbDevice(device: USBDevice) {
    try {
      setUsbDevices(devices => devices.map(d => 
        d.id === device.id ? { ...d, status: 'connecting' as const } : d
      ))
      const stream = await connectToUSBDevice(device)
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStreaming(true)
        setMode('wifi') // Using wifi mode for USB devices too
        setUsbDevices(devices => devices.map(d => 
          d.id === device.id ? { ...d, status: 'online' as const } : d
        ))
      } else {
        throw new Error('Failed to get video stream')
      }
    } catch (error) {
      console.error('Failed to connect to USB device:', error)
      alert(`Failed to connect to ${device.name}. Please check the device and try again.`)
      setUsbDevices(devices => devices.map(d => 
        d.id === device.id ? { ...d, status: 'offline' as const } : d
      ))
    }
  }

  // Phone pairing via WebRTC
  function ensureWS() {
    if (ws && ws.readyState === WebSocket.OPEN) return ws
    const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
    const normalizedEnv = envUrl && envUrl.length > 0
      ? (envUrl.endsWith('/ws') ? envUrl : envUrl.replace(/\/$/, '') + '/ws')
      : undefined
    const proto = (window.location.protocol === 'https:' ? 'wss' : 'ws')
    const sameOrigin = `${proto}://${window.location.host}/ws`
    const host = window.location.hostname
    const isLocalhost = host === 'localhost' || host === '127.0.0.1'
    const isRenderHost = host.endsWith('onrender.com')
    // Preferred production fallback (avoids Netlify origin which lacks WS server)
    const renderWS = `wss://ninedartnation.onrender.com/ws`
    let url = normalizedEnv
    if (!url) {
      if (isLocalhost) {
        url = `${proto}://${host}:8787/ws`
      } else if (isRenderHost) {
        url = sameOrigin
      } else {
        url = renderWS
      }
    }
    // As a safety net for unusual ports, fall back to same-origin if all else fails
    if (!url) url = sameOrigin
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
    try { setPreferredCameraLocked(true) } catch {}
  }

  function stopAll() {
    stop()
    setPairCode(null)
    setPaired(false)
    setExpiresAt(null)
    if (pc) { try { pc.close() } catch {}; setPc(null) }
  }
  return (
    <CameraFrame 
      label={label} 
      autoStart={autoStart} 
      start={start} 
      stopAll={stopAll} 
      startPhonePairing={startPhonePairing} 
      startWifiConnection={startWifiConnection}
      startUsbConnection={startUsbConnection}
      connectToWifiDevice={connectToWifiDevice}
      connectToUsbDevice={connectToUsbDevice}
      videoRef={videoRef} 
      streaming={streaming} 
      mode={mode} 
      setMode={setMode} 
      pairCode={pairCode} 
      mobileUrl={mobileUrl} 
      ttl={ttl} 
      qrDataUrl={qrDataUrl} 
      regenerateCode={regenerateCode} 
      httpsInfo={httpsInfo} 
      showTips={showTips} 
      setShowTips={setShowTips} 
      wifiDevices={wifiDevices}
      usbDevices={usbDevices}
      discoveringWifi={discoveringWifi}
      discoveringUsb={discoveringUsb}
      scaleOverride={scaleOverride} 
      className={className}
      aspect={aspect}
      style={style}
      fill={fill}
    />
  )
}

function CameraFrame(props: any) {
  const { cameraScale, cameraAspect: storedAspect } = useUserSettings()
  const scale = Math.max(0.5, Math.min(1.25, Number(props.scaleOverride ?? cameraScale ?? 1)))
  const {
    label,
    start,
    stopAll,
    startPhonePairing,
    startWifiConnection,
    startUsbConnection,
    connectToWifiDevice,
    connectToUsbDevice,
    videoRef,
    streaming,
    mode,
    setMode,
    pairCode,
    mobileUrl,
    ttl,
    qrDataUrl,
    regenerateCode,
    httpsInfo,
    showTips,
    setShowTips,
    wifiDevices,
    usbDevices,
    discoveringWifi,
    discoveringUsb,
    className,
    aspect,
    style,
    fill,
  } = props

  const [copyFeedback, setCopyFeedback] = useState<'link' | 'code' | null>(null)
  const copyTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const aspectChoice: 'wide' | 'square' | 'portrait' | 'classic' | 'free' = aspect && aspect !== 'inherit'
    ? aspect
    : (storedAspect as any) || 'wide'

  const shouldMaintainAspect = aspectChoice !== 'free'
  const aspectClass = shouldMaintainAspect
    ? aspectChoice === 'square'
      ? 'aspect-square'
      : aspectChoice === 'portrait'
        ? 'aspect-[3/4]'
        : aspectChoice === 'classic'
          ? 'aspect-[4/3]'
          : 'aspect-video'
    : ''

  const containerBase = fill
    ? 'rounded-2xl overflow-hidden bg-black w-full flex flex-col'
    : 'rounded-2xl overflow-hidden bg-black w-full mx-auto flex flex-col'
  const containerClass = [containerBase, className].filter(Boolean).join(' ').trim()
  const containerStyle: CSSProperties = { ...(style || {}) }

  const viewportClass = fill ? 'relative flex-1 min-h-[220px] bg-black' : 'relative w-full bg-black'

  const commonVideoProps = {
    style: { transform: `scale(${scale})`, transformOrigin: 'center' as const },
  }

  const videoElement = (() => {
    const videoClass = 'absolute inset-0 w-full h-full object-contain object-center bg-black'
    if (fill) {
      if (shouldMaintainAspect) {
        return (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`relative w-full max-w-full max-h-full ${aspectClass}`}>
              <video ref={videoRef} className={videoClass} {...commonVideoProps} />
            </div>
          </div>
        )
      }
      return <video ref={videoRef} className={videoClass} {...commonVideoProps} />
    }
    if (shouldMaintainAspect) {
      return (
        <div className={`relative w-full ${aspectClass}`}>
          <video ref={videoRef} className={videoClass} {...commonVideoProps} />
        </div>
      )
    }
    return <video ref={videoRef} className="w-full h-full object-contain object-center bg-black" {...commonVideoProps} />
  })()

  async function copyValue(value: string | null | undefined, type: 'link' | 'code') {
    if (!value) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopyFeedback(type)
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = window.setTimeout(() => setCopyFeedback(null), 1500)
    } catch (err) {
      console.warn('Copy to clipboard failed:', err)
      setCopyFeedback(null)
    }
  }

  return (
    <div className={containerClass} style={containerStyle}>
      <div className={viewportClass}>
        {mode === 'phone' && streaming ? (
          // When phone camera is active, display a placeholder since feed shows in overlay
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2">📱</div>
              <div className="font-semibold">Phone Camera Active</div>
              <div className="text-xs opacity-75 mt-1">Feed displayed above in floating overlay</div>
            </div>
          </div>
        ) : (
          videoElement
        )}
      </div>
      <div className="p-1 flex items-center justify-between bg-black/60 text-white text-[10px] gap-1">
        <span className="truncate">{label || (streaming ? (mode==='phone' ? 'PHONE LIVE' : mode==='wifi' ? 'WIFI LIVE' : 'LIVE') : 'Camera')}</span>
        <div className="flex items-center gap-1">
          {!streaming && (
            <>
              <button className={`px-1 py-0.5 rounded ${mode==='local'?'bg-emerald-600':'bg-slate-700'}`} onClick={() => { setMode('local'); start() }}>Local</button>
              <button className={`px-1 py-0.5 rounded ${mode==='phone'?'bg-emerald-600':'bg-slate-700'}`} onClick={startPhonePairing}>Phone</button>
              <button className={`px-1 py-0.5 rounded ${mode==='wifi'?'bg-emerald-600':'bg-slate-700'}`} onClick={() => { setMode('wifi'); startWifiConnection() }}>Wifi</button>
              <button className={`px-1 py-0.5 rounded ${mode==='wifi'?'bg-emerald-600':'bg-slate-700'}`} onClick={() => { setMode('wifi'); startUsbConnection() }}>USB</button>
            </>
          )}
          {streaming ? (
            <button className="px-1 py-0.5 rounded bg-rose-600" onClick={stopAll}>Stop</button>
          ) : null}
        </div>
      </div>
      {mode==='phone' && pairCode && !streaming && (
        <div className="p-2 text-white text-[10px] bg-black/50">
          <div className="text-xs opacity-80">Launch on your mobile:</div>
          <button
            type="button"
            className="mt-1 w-full text-left px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center gap-2"
            onClick={() => copyValue(mobileUrl, 'link')}
            title="Copy mobile camera link"
          >
            <span className="flex-1 min-w-0 font-mono break-all">{mobileUrl}</span>
            <span className="text-[9px] uppercase tracking-wide whitespace-nowrap text-emerald-200">{copyFeedback === 'link' ? 'Copied!' : 'Copy'}</span>
          </button>
          <div className="mt-1 flex items-center gap-2">
            <a
              href={mobileUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded border border-indigo-500/30 text-indigo-100 hover:bg-indigo-500/20 transition"
            >
              Open link
            </a>
            <button
              type="button"
              className="flex-1 text-left px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-between gap-2"
              onClick={() => copyValue(pairCode, 'code')}
              title="Copy pairing code"
            >
              <span className="font-mono tracking-[0.3em] text-sm">{pairCode}</span>
              <span className="text-[9px] uppercase tracking-wide whitespace-nowrap text-emerald-200">{copyFeedback === 'code' ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
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
      {mode==='wifi' && !streaming && (
        <div className="p-2 text-white text-[10px] bg-black/50">
          <div className="font-semibold mb-2">Scoring Devices</div>
          
          {/* WiFi Devices */}
          <div className="mb-3">
            <div className="font-medium mb-1">WiFi Devices</div>
            {discoveringWifi ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                <span>Scanning network...</span>
              </div>
            ) : wifiDevices.length > 0 ? (
              <div className="space-y-1">
                {wifiDevices.map((device: NetworkDevice) => (
                  <div key={device.id} className="flex items-center justify-between p-1 rounded bg-slate-900/60">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{device.name}</div>
                      <div className="opacity-70 text-[9px]">{device.ip}:{device.port}</div>
                    </div>
                    <button 
                      className={`px-1 py-0.5 rounded text-[9px] ${
                        device.status === 'connecting' ? 'bg-yellow-600' :
                        device.status === 'online' ? 'bg-green-600' : 'bg-blue-600'
                      }`}
                      onClick={() => connectToWifiDevice(device)}
                      disabled={device.status === 'connecting'}
                    >
                      {device.status === 'connecting' ? '...' : 'Connect'}
                    </button>
                  </div>
                ))}
                <div className="text-center mt-2">
                  <button className="px-1 py-0.5 rounded bg-slate-700 text-[9px]" onClick={startWifiConnection}>Rescan WiFi</button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-1 opacity-70">No WiFi devices found</div>
                <button className="px-1 py-0.5 rounded bg-slate-700 text-[9px]" onClick={startWifiConnection}>Scan WiFi</button>
              </div>
            )}
          </div>

          {/* USB Devices */}
          <div>
            <div className="font-medium mb-1">USB Devices</div>
            {discoveringUsb ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                <span>Scanning USB...</span>
              </div>
            ) : usbDevices.length > 0 ? (
              <div className="space-y-1">
                {usbDevices.map((device: USBDevice) => (
                  <div key={device.id} className="flex items-center justify-between p-1 rounded bg-slate-900/60">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{device.name}</div>
                      <div className="opacity-70 text-[9px]">{device.type.toUpperCase()}</div>
                    </div>
                    <button 
                      className={`px-1 py-0.5 rounded text-[9px] ${
                        device.status === 'connecting' ? 'bg-yellow-600' :
                        device.status === 'online' ? 'bg-green-600' : 'bg-blue-600'
                      }`}
                      onClick={() => connectToUsbDevice(device)}
                      disabled={device.status === 'connecting'}
                    >
                      {device.status === 'connecting' ? '...' : 'Connect'}
                    </button>
                  </div>
                ))}
                <div className="text-center mt-2">
                  <button className="px-1 py-0.5 rounded bg-slate-700 text-[9px]" onClick={startUsbConnection}>Rescan USB</button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-1 opacity-70">No USB devices found</div>
                <button className="px-1 py-0.5 rounded bg-slate-700 text-[9px]" onClick={startUsbConnection}>Scan USB</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
