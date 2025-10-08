import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { useCalibration } from '../store/calibration'
import { BoardRadii, canonicalRimTargets, computeHomographyDLT, drawCross, drawPolyline, rmsError, sampleRing, refinePointsSobel, type Homography, type Point } from '../utils/vision'
import { useUserSettings } from '../store/userSettings'

type Phase = 'idle' | 'camera' | 'capture' | 'select' | 'computed'
type CamMode = 'local' | 'phone'

export default function Calibrator() {
	const videoRef = useRef<HTMLVideoElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const overlayRef = useRef<HTMLCanvasElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [streaming, setStreaming] = useState(false)
	const [phase, setPhase] = useState<Phase>('camera')
	const [mode, setMode] = useState<CamMode>(() => (localStorage.getItem('ndn:cal:mode') as CamMode) || 'local')
	const [dstPoints, setDstPoints] = useState<Point[]>([]) // image points clicked in order TOP, RIGHT, BOTTOM, LEFT
	const [snapshotSet, setSnapshotSet] = useState(false)
	// Track current frame (video/snapshot) size to preserve aspect ratio in the preview container
	const [frameSize, setFrameSize] = useState<{ w: number, h: number } | null>(null)
	// Zoom for pixel-perfect point picking (0.5x – 2.0x)
	const [zoom, setZoom] = useState<number>(1)
	const { H, setCalibration, reset, errorPx } = useCalibration()
  const { calibrationGuide } = useUserSettings()
	// Detected ring data (from auto-detect) in image pixels
	const [detected, setDetected] = useState<null | {
		cx: number; cy: number;
		bullInner: number; bullOuter: number;
		trebleInner: number; trebleOuter: number;
		doubleInner: number; doubleOuter: number;
	}>(null)

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

	// Allow uploading a photo instead of using a live camera
	function triggerUpload() {
		try { fileInputRef.current?.click() } catch {}
	}

	function onUploadPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0]
		if (!f) return
		const img = new Image()
		img.onload = () => {
			try {
				if (!canvasRef.current) return
				const c = canvasRef.current
				c.width = img.naturalWidth
				c.height = img.naturalHeight
				const ctx = c.getContext('2d')!
				ctx.drawImage(img, 0, 0, c.width, c.height)
				setSnapshotSet(true)
				setFrameSize({ w: c.width, h: c.height })
				setPhase('select')
				setDstPoints([])
				// Clear any previous video stream
				stopCamera()
			} catch {}
		}
		img.onerror = () => { alert('Could not load image. Please try a different photo.') }
		img.src = URL.createObjectURL(f)
		// reset input value so the same file can be reselected
		try { e.target.value = '' } catch {}
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
		setFrameSize({ w: c.width, h: c.height })
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

		// Draw clicked points (with order labels to guide TOP, RIGHT, BOTTOM, LEFT)
		currentPoints.forEach((p, i) => {
			drawCross(ctx, p, '#f472b6')
			ctx.save()
			ctx.fillStyle = '#f472b6'
			ctx.font = '14px sans-serif'
			ctx.fillText(String(i + 1), p.x + 6, p.y - 6)
			ctx.restore()
		})

		// If we have a homography, draw rings (precise, perspective-correct)
		const Huse = HH || H
		if (Huse) {
			const rings = [BoardRadii.bullInner, BoardRadii.bullOuter, BoardRadii.trebleInner, BoardRadii.trebleOuter, BoardRadii.doubleInner, BoardRadii.doubleOuter]
			for (const r of rings) {
				const poly = sampleRing(Huse, r, 360)
				drawPolyline(ctx, poly, r === BoardRadii.doubleOuter ? '#22d3ee' : '#a78bfa', r === BoardRadii.doubleOuter ? 3 : 2)
			}
		}
		// Otherwise, if we have detected circles, draw them as previews (circles in image space)
		if (!Huse && detected) {
			const drawCircle = (r: number, color: string, w = 2) => {
				ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w
				ctx.beginPath(); ctx.arc(detected.cx, detected.cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
			}
			drawCircle(detected.doubleOuter, '#22d3ee', 3)
			drawCircle(detected.doubleInner, '#22d3ee', 2)
			drawCircle(detected.trebleOuter, '#fde047', 2)
			drawCircle(detected.trebleInner, '#fde047', 2)
			drawCircle(detected.bullOuter, '#34d399', 2)
			drawCircle(detected.bullInner, '#10b981', 3)
		}

		// Preferred-view framing guide (if enabled): shaded safe zone and angle lines
		if (calibrationGuide) {
			ctx.save()
			// Semi-transparent vignette to encourage centered, face-on framing
			ctx.fillStyle = 'rgba(59,130,246,0.10)'
			const pad = Math.round(Math.min(o.width, o.height) * 0.08)
			const w = o.width - pad*2
			const h = o.height - pad*2
			ctx.fillRect(pad, pad, w, h)
			// Horizon/tilt line and vertical center line
			ctx.strokeStyle = 'rgba(34,197,94,0.9)'
			ctx.lineWidth = 2
			// Horizontal line roughly through bull height
			ctx.beginPath(); ctx.moveTo(pad, o.height/2); ctx.lineTo(o.width-pad, o.height/2); ctx.stroke()
			// Vertical center
			ctx.beginPath(); ctx.moveTo(o.width/2, pad); ctx.lineTo(o.width/2, o.height-pad); ctx.stroke()
			// Angle brackets to suggest slight top-down 10–15°
			ctx.strokeStyle = 'rgba(234,179,8,0.9)'
			ctx.setLineDash([6,4])
			const ax = pad + 30, ay = pad + 30
			ctx.beginPath(); ctx.moveTo(ax, ay+30); ctx.lineTo(ax+60, ay); ctx.stroke()
			ctx.beginPath(); ctx.moveTo(o.width-ax, ay+30); ctx.lineTo(o.width-ax-60, ay); ctx.stroke()
			ctx.restore()
			// Legend
			ctx.fillStyle = 'rgba(255,255,255,0.85)'
			ctx.font = '12px sans-serif'
			ctx.fillText('Tip: Frame board centered, edges parallel; slight top-down is okay. Keep bull near center.', pad+6, pad+18)
		}
	}

	function onClickOverlay(e: React.MouseEvent<HTMLCanvasElement>) {
		if (phase !== 'select') return
		const el = (e.target as HTMLCanvasElement)
		const rect = el.getBoundingClientRect()
		const cssX = e.clientX - rect.left
		const cssY = e.clientY - rect.top
		// Map CSS coordinates back to the overlay canvas pixel coordinates, accounting for CSS scaling and zoom
		const scaleX = el.width > 0 ? (el.width / rect.width) : 1
		const scaleY = el.height > 0 ? (el.height / rect.height) : 1
		const x = cssX * scaleX
		const y = cssY * scaleY
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

	// --- Auto-detect the double rim from the current snapshot and compute homography ---
	async function autoDetectRings() {
		if (!canvasRef.current) return alert('Load a photo or capture a frame first.')
		const src = canvasRef.current
		// Downscale for speed
		const maxW = 800
		const scale = Math.min(1, maxW / src.width)
		const dw = Math.max(1, Math.round(src.width * scale))
		const dh = Math.max(1, Math.round(src.height * scale))
		const tmp = document.createElement('canvas')
		tmp.width = dw; tmp.height = dh
		const tctx = tmp.getContext('2d')!
		tctx.drawImage(src, 0, 0, dw, dh)
		const img = tctx.getImageData(0, 0, dw, dh)
		// Grayscale + Sobel edge magnitude
		const gray = new Float32Array(dw * dh)
		for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
			const r = img.data[i], g = img.data[i+1], b = img.data[i+2]
			gray[p] = 0.299*r + 0.587*g + 0.114*b
		}
		const gx = new Float32Array(dw * dh)
		const gy = new Float32Array(dw * dh)
		for (let y = 1; y < dh-1; y++) {
			for (let x = 1; x < dw-1; x++) {
				const i = y*dw + x
				const a = gray[i - dw - 1], b = gray[i - dw], c = gray[i - dw + 1]
				const d0 = gray[i - 1],        /*e*/       f0 = gray[i + 1]
				const g0 = gray[i + dw - 1], h0 = gray[i + dw], j0 = gray[i + dw + 1]
				gx[i] = (-a - 2*d0 - g0) + (c + 2*f0 + j0)
				gy[i] = (-a - 2*b - c) + (g0 + 2*h0 + j0)
			}
		}
		const mag = new Float32Array(dw * dh)
		let maxMag = 1
		for (let i = 0; i < mag.length; i++) { const m = Math.hypot(gx[i], gy[i]); mag[i] = m; if (m > maxMag) maxMag = m }
		// Coarse circle search around center for double outer
		const cx0 = Math.floor(dw/2), cy0 = Math.floor(dh/2)
		const rMin = Math.floor(Math.min(dw, dh) * 0.35)
		const rMax = Math.floor(Math.min(dw, dh) * 0.52)
		let best = { score: -1, cx: cx0, cy: cy0, r: Math.floor((rMin + rMax)/2) }
		const stepC = Math.max(2, Math.floor(Math.min(dw, dh) * 0.01)) // center step
		const stepR = Math.max(2, Math.floor(Math.min(dw, dh) * 0.01)) // radius step
		for (let cy = cy0 - Math.floor(dh*0.08); cy <= cy0 + Math.floor(dh*0.08); cy += stepC) {
			for (let cx = cx0 - Math.floor(dw*0.08); cx <= cx0 + Math.floor(dw*0.08); cx += stepC) {
				for (let r = rMin; r <= rMax; r += stepR) {
					let s = 0
					const samples = 360
					for (let a = 0; a < samples; a++) {
						const ang = (a * Math.PI) / 180
						const x = Math.round(cx + r * Math.cos(ang))
						const y = Math.round(cy + r * Math.sin(ang))
						if (x <= 0 || x >= dw-1 || y <= 0 || y >= dh-1) continue
						s += mag[y*dw + x]
					}
					if (s > best.score) best = { score: s, cx, cy, r }
				}
			}
		}
		// Map back to original canvas coords
		const inv = 1/scale
		const OCX = best.cx * inv
		const OCY = best.cy * inv
		const OR  = best.r  * inv
		// With center/doubleOuter radius fixed, locate other rings via 1D radial search
		function radialScore(rPx: number) {
			let s = 0
			const rScaled = rPx * scale
			const samples = 360
			for (let a = 0; a < samples; a++) {
				const ang = (a * Math.PI) / 180
				const x = Math.round(best.cx + rScaled * Math.cos(ang))
				const y = Math.round(best.cy + rScaled * Math.sin(ang))
				if (x <= 0 || x >= dw-1 || y <= 0 || y >= dh-1) continue
				s += mag[y*dw + x]
			}
			return s
		}
		const ratios = {
			bullInner: BoardRadii.bullInner / BoardRadii.doubleOuter,
			bullOuter: BoardRadii.bullOuter / BoardRadii.doubleOuter,
			trebleInner: BoardRadii.trebleInner / BoardRadii.doubleOuter,
			trebleOuter: BoardRadii.trebleOuter / BoardRadii.doubleOuter,
			doubleInner: BoardRadii.doubleInner / BoardRadii.doubleOuter,
			doubleOuter: 1,
		} as const
		function refineAround(expectedR: number, pctWindow = 0.10) {
			const lo = Math.max(1, Math.floor(expectedR * (1 - pctWindow)))
			const hi = Math.max(lo+1, Math.floor(expectedR * (1 + pctWindow)))
			let bestR = lo, bestS = -1
			for (let r = lo; r <= hi; r++) {
				const s = radialScore(r)
				if (s > bestS) { bestS = s; bestR = r }
			}
			return bestR
		}
		const dOuter = OR
		const dInner = refineAround(dOuter * ratios.doubleInner)
		const tOuter = refineAround(dOuter * ratios.trebleOuter)
		const tInner = refineAround(dOuter * ratios.trebleInner)
		const bOuter = refineAround(dOuter * ratios.bullOuter)
		const bInner = refineAround(dOuter * ratios.bullInner)
		setDetected({ cx: OCX, cy: OCY, bullInner: bInner, bullOuter: bOuter, trebleInner: tInner, trebleOuter: tOuter, doubleInner: dInner, doubleOuter: dOuter })
		// Seed the four calibration points and compute
		const pts: Point[] = [
			{ x: OCX,       y: OCY - dOuter },
			{ x: OCX + dOuter,  y: OCY      },
			{ x: OCX,       y: OCY + dOuter },
			{ x: OCX - dOuter,  y: OCY      },
		]
		setDstPoints(pts)
		drawOverlay(pts)
		try { compute() } catch {}
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
						<div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-2 items-start">
							<div className="md:col-span-4">
								<div className="flex items-center gap-2 mb-2">
									<span className="text-xs opacity-70">Video Source:</span>
									<div className="flex items-center gap-1 text-xs">
										<button className={`btn px-2 py-1 ${mode==='local'?'bg-emerald-600':''}`} onClick={() => setMode('local')}>Local</button>
										<button className={`btn px-2 py-1 ${mode==='phone'?'bg-emerald-600':''}`} onClick={() => setMode('phone')}>Phone</button>
									</div>
								</div>
								<div className="flex items-center gap-1 text-[11px]">
									<span className="opacity-70">Zoom</span>
									<button className="btn px-2 py-0.5" onClick={()=>setZoom(z=>Math.max(0.5, Math.round((z-0.1)*10)/10))}>−</button>
									<span className="w-10 text-center">{Math.round((zoom||1)*100)}%</span>
									<button className="btn px-2 py-0.5" onClick={()=>setZoom(z=>Math.min(2, Math.round((z+0.1)*10)/10))}>+</button>
									<button className="btn px-2 py-0.5" onClick={()=>setZoom(1)}>Actual</button>
								</div>
								{/* Vertical action buttons */}
								<div className="flex flex-col gap-2 mt-3">
									{!streaming ? (
										<button className="btn" onClick={startCamera}>{mode==='local' ? 'Start Camera' : 'Pair Phone Camera'}</button>
									) : (
										<>
											<button className="btn bg-rose-600 hover:bg-rose-700" onClick={stopCamera}>Stop Camera</button>
											<button className="btn" onClick={captureFrame} disabled={!streaming}>Capture Frame</button>
										</>
									)}
									<div className="flex items-center gap-2 mt-1">
										<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadPhotoChange} />
										<button className="btn" onClick={triggerUpload}>Upload Photo</button>
										<button className="btn" disabled={!snapshotSet} onClick={autoDetectRings}>Auto Detect</button>
									</div>
									<button className="btn" disabled={dstPoints.length !== 4} onClick={compute}>Compute</button>
									<button className="btn" disabled={dstPoints.length === 0} onClick={undoPoint}>Undo</button>
									<button className="btn" disabled={dstPoints.length === 0} onClick={refinePoints}>Refine Points</button>
									<button className="btn" onClick={resetAll}>Reset</button>
								</div>
							</div>
							<div className="md:col-span-8 flex items-center justify-end">
								<div
									className="relative w-full max-w-[min(100%,60vh)] rounded-2xl overflow-hidden border border-indigo-400/30 bg-black"
									style={{ aspectRatio: frameSize ? `${frameSize.w} / ${frameSize.h}` : '16 / 9' }}
								>
									<div className="absolute inset-0" style={{ transform: `scale(${zoom||1})`, transformOrigin: 'center center' }}>
										<video
											ref={videoRef}
											onLoadedMetadata={(ev) => {
												try {
													const v = ev.currentTarget as HTMLVideoElement
													if (v.videoWidth && v.videoHeight) setFrameSize({ w: v.videoWidth, h: v.videoHeight })
												} catch {}
											}}
											className={`absolute inset-0 w-full h-full ${snapshotSet ? 'opacity-0 -z-10' : 'opacity-100'}`}
										/>
										<canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${snapshotSet ? 'opacity-100' : 'opacity-0 -z-10'}`} />
										<canvas ref={overlayRef} onClick={onClickOverlay} className="absolute inset-0 w-full h-full" />
									</div>
								</div>
							</div>
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
				{/* action buttons moved to left column; removed bottom row */}
				<div className="mt-2 text-sm opacity-80">
					<div>Phase: {phase}</div>
					<div>Clicked: {dstPoints.length} / 4</div>
					{errorPx != null && <div>Fit error: {errorPx.toFixed(2)} px</div>}
				</div>
			</div>
		</div>
	)
}
