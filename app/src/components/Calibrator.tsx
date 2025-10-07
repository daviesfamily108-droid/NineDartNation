import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useCalibration } from '../store/calibration'
import { BoardRadii, canonicalRimTargets, computeHomographyDLT, drawCross, drawPolyline, rmsError, sampleRing, refinePointsSobel, type Homography, type Point } from '../utils/vision'

type Phase = 'idle' | 'camera' | 'capture' | 'select' | 'computed'
type CamMode = 'local' | 'phone'

export default function Calibrator() {
	const videoRef = useRef<HTMLVideoElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const overlayRef = useRef<HTMLCanvasElement>(null)
	const [streaming, setStreaming] = useState(false)
	const [phase, setPhase] = useState<Phase>('camera')
	const [mode, setMode] = useState<CamMode>(() => (localStorage.getItem('ndn:cal:mode') as CamMode) || 'local')
	const [dstPoints, setDstPoints] = useState<Point[]>([]) // image points clicked in order TOP, RIGHT, BOTTOM, LEFT
	const [snapshotSet, setSnapshotSet] = useState(false)
	const { H, setCalibration, reset, errorPx } = useCalibration()

	// Phone pairing state (mirrors CameraTile)
	const [ws, setWs] = useState<WebSocket | null>(null)
	const [pairCode, setPairCode] = useState<string | null>(null)
	const [expiresAt, setExpiresAt] = useState<number | null>(null)
	const [now, setNow] = useState<number>(Date.now())
	const [paired, setPaired] = useState<boolean>(false)
	const [pc, setPc] = useState<RTCPeerConnection | null>(null)
	const [qrDataUrl, setQrDataUrl] = useState<string>('')
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
		// Try to detect if server exposes HTTPS info
		fetch(`/api/https-info`).then(r=>r.json()).then(j=>{
			if (j && typeof j.https === 'boolean') setHttpsInfo({ https: !!j.https, port: Number(j.port)||8788 })
		}).catch(()=>{})
	}, [])

	// Auto-start pairing when user switches to Phone mode
	useEffect(() => {
		if (mode === 'phone' && !paired && !streaming) {
			startPhonePairing()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode])
	const mobileUrl = useMemo(() => {
		const host = (lanHost || window.location.hostname)
		const code = pairCode || '____'
		const useHttps = !!httpsInfo?.https
		const port = useHttps ? (httpsInfo?.port || 8788) : 8787
		const proto = useHttps ? 'https' : 'http'
		return `${proto}://${host}:${port}/mobile-cam.html?code=${code}`
	}, [pairCode, lanHost, httpsInfo])

	useEffect(() => { localStorage.setItem('ndn:cal:mode', mode) }, [mode])

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
	useEffect(() => {
		if (ttl === null) return
		if (ttl <= 0 && !paired && !streaming && mode === 'phone') {
			regenerateCode()
		}
	}, [ttl, paired, streaming, mode])

	useEffect(() => {
		return () => stopCamera()
	}, [])

	function ensureWS() {
		if (ws && ws.readyState === WebSocket.OPEN) return ws
		// Prefer secure WS endpoint when server HTTPS is available, regardless of current page protocol
			const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
			let socket: WebSocket
			if (envUrl && envUrl.length > 0) {
				socket = new WebSocket(envUrl)
			} else {
				const useSecure = !!httpsInfo?.https
				const proto = useSecure ? 'wss' : 'ws'
				const port = useSecure ? (httpsInfo?.port || 8788) : 8787
				socket = new WebSocket(`${proto}://${window.location.hostname}:${port}`)
			}
		setWs(socket)
		return socket
	}

	async function startPhonePairing() {
		setPaired(false)
		const socket = ensureWS()
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({ type: 'cam-create' }))
		} else {
			socket.onopen = () => socket.send(JSON.stringify({ type: 'cam-create' }))
		}
		socket.onerror = () => {
			// leave minimal, UI shows status below
		}
		socket.onclose = () => {
			// show that it closed; user can retry
		}
		socket.onmessage = async (ev) => {
			const data = JSON.parse(ev.data)
			if (data.type === 'cam-code') {
				setPairCode(data.code)
				if (data.expiresAt) setExpiresAt(data.expiresAt)
			} else if (data.type === 'cam-peer-joined') {
				setPaired(true)
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
							setPhase('capture')
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
			} else if (data.type === 'cam-error') {
				alert(data.code === 'EXPIRED' ? 'Code expired. Generate a new code.' : 'Invalid code')
			}
		}
	}

	async function startCamera() {
		if (mode === 'phone') return startPhonePairing()
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
			if (videoRef.current) {
				videoRef.current.srcObject = stream
				await videoRef.current.play()
			}
			setStreaming(true)
			setPhase('capture')
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
		if (pc) { try { pc.close() } catch {}; setPc(null) }
		setPairCode(null)
		setExpiresAt(null)
		setPaired(false)
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

	function captureFrame() {
		if (!videoRef.current || !canvasRef.current) return
		const v = videoRef.current
		const c = canvasRef.current
		c.width = v.videoWidth
		c.height = v.videoHeight
		const ctx = c.getContext('2d')!
		ctx.drawImage(v, 0, 0, c.width, c.height)
		setSnapshotSet(true)
		setPhase('select')
		setDstPoints([])
	}

	function drawOverlay(currentPoints = dstPoints, HH: Homography | null = null) {
		if (!canvasRef.current || !overlayRef.current) return
		const img = canvasRef.current
		const o = overlayRef.current
		o.width = img.width; o.height = img.height
		const ctx = o.getContext('2d')!
		ctx.clearRect(0, 0, o.width, o.height)

		// Draw clicked points
		currentPoints.forEach((p) => drawCross(ctx, p, '#f472b6'))

		// If we have a homography, draw rings
		const Huse = HH || H
		if (Huse) {
			const rings = [BoardRadii.bullInner, BoardRadii.bullOuter, BoardRadii.trebleInner, BoardRadii.trebleOuter, BoardRadii.doubleInner, BoardRadii.doubleOuter]
			for (const r of rings) {
				const poly = sampleRing(Huse, r, 360)
				drawPolyline(ctx, poly, r === BoardRadii.doubleOuter ? '#22d3ee' : '#a78bfa', r === BoardRadii.doubleOuter ? 3 : 2)
			}
		}
	}

	function onClickOverlay(e: React.MouseEvent<HTMLCanvasElement>) {
		if (phase !== 'select') return
		const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
		const x = e.clientX - rect.left
		const y = e.clientY - rect.top
		const pts = [...dstPoints, { x, y }]
		if (pts.length <= 4) {
			setDstPoints(pts)
			drawOverlay(pts)
		}
	}

	function undoPoint() {
		const pts = dstPoints.slice(0, -1)
		setDstPoints(pts)
		drawOverlay(pts)
	}

		function refinePoints() {
			if (!canvasRef.current || dstPoints.length === 0) return
			const refined = refinePointsSobel(canvasRef.current, dstPoints, 8)
			setDstPoints(refined)
			drawOverlay(refined)
		}

	function compute() {
		if (!canvasRef.current) return
		if (dstPoints.length !== 4) return alert('Please click 4 points: TOP, RIGHT, BOTTOM, LEFT corners of the double rim.')
		const src = canonicalRimTargets() // board space mm
		const Hcalc = computeHomographyDLT(src, dstPoints)
		drawOverlay(dstPoints, Hcalc)
		const err = rmsError(Hcalc, src, dstPoints)
		setCalibration({ H: Hcalc as Homography, createdAt: Date.now(), errorPx: err, imageSize: { w: canvasRef.current.width, h: canvasRef.current.height }, anchors: { src, dst: dstPoints } })
		setPhase('computed')
	}

	function resetAll() {
		setDstPoints([])
		setSnapshotSet(false)
		setPhase('camera')
		drawOverlay([])
		reset()
	}

	useEffect(() => {
		drawOverlay()
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [snapshotSet, H])

	return (
		<div className="space-y-4">
			<div className="card">
				<h2 className="text-xl font-semibold mb-2">Board Calibrator</h2>
				<p className="text-sm opacity-80 mb-3">
					Click the four points where the outer edge of the double ring touches TOP, RIGHT, BOTTOM, LEFT.
					Then compute to fit the board overlay. Aim for error &lt; 2px for best accuracy.
				</p>
				<div className="flex items-center gap-2 mb-2">
					<span className="text-xs opacity-70">Video Source:</span>
					<div className="flex items-center gap-1 text-xs">
						<button className={`btn px-2 py-1 ${mode==='local'?'bg-emerald-600':''}`} onClick={() => setMode('local')}>Local</button>
						<button className={`btn px-2 py-1 ${mode==='phone'?'bg-emerald-600':''}`} onClick={() => setMode('phone')}>Phone</button>
					</div>
				</div>
				<div className="relative rounded-xl overflow-hidden border border-indigo-400/30 bg-black">
					<video ref={videoRef} className={`w-full ${snapshotSet ? 'opacity-0 absolute -z-10' : 'opacity-100'}`} />
					<canvas ref={canvasRef} className={`${snapshotSet ? 'opacity-100' : 'opacity-0 absolute -z-10'} w-full`} />
					<canvas ref={overlayRef} onClick={onClickOverlay} className="absolute inset-0 w-full h-full" />
				</div>
				{mode==='phone' && !streaming && (
					<div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs">
						<div>Open on your phone:</div>
						<div className="font-mono break-all">{mobileUrl}</div>
						<div className="mt-1 opacity-80">WS: {ws ? (ws.readyState===1?'open':ws.readyState===0?'connecting':ws.readyState===2?'closing':'closed') : 'not started'} · {httpsInfo?.https ? 'HTTPS on' : 'HTTP only'}</div>
						{pairCode && <div>Code: <span className="font-mono">{pairCode}</span></div>}
						{qrDataUrl && <img className="mt-1 w-[160px] h-[160px] bg-white rounded" alt="Scan to open" src={qrDataUrl} />}
						<div className="mt-1 flex items-center gap-2">
							{ttl !== null && <span>Expires in {ttl}s</span>}
							<button className="btn px-2 py-1 text-xs" onClick={regenerateCode}>Regenerate</button>
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
				<div className="flex flex-wrap gap-2 mt-3">
					{!streaming ? (
						<button className="btn" onClick={startCamera}>{mode==='local' ? 'Start Camera' : 'Pair Phone Camera'}</button>
					) : (
						<>
							<button className="btn bg-rose-600 hover:bg-rose-700" onClick={stopCamera}>Stop Camera</button>
							<button className="btn" onClick={captureFrame} disabled={!streaming}>Capture Frame</button>
						</>
					)}
					<button className="btn" disabled={dstPoints.length !== 4} onClick={compute}>Compute</button>
					<button className="btn" disabled={dstPoints.length === 0} onClick={undoPoint}>Undo</button>
								<button className="btn" disabled={dstPoints.length === 0} onClick={refinePoints}>Refine Points</button>
					<button className="btn" onClick={resetAll}>Reset</button>
				</div>
				<div className="mt-2 text-sm opacity-80">
					<div>Phase: {phase}</div>
					<div>Clicked: {dstPoints.length} / 4</div>
					{errorPx != null && <div>Fit error: {errorPx.toFixed(2)} px</div>}
				</div>
			</div>
		</div>
	)
}
