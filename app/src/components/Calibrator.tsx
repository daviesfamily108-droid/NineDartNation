// Pure re-export of the canonical Calibrator component
export { default } from '../../../src/components/Calibrator'

// NOTE: This file intentionally contains only a re-export. The canonical
// implementation lives at `src/components/Calibrator.tsx`. Keeping a single
// authoritative source prevents divergent behavior across duplicate copies.
// Re-export the canonical Calibrator component from the root `src/components` folder.
// This ensures there is a single authoritative implementation that reads
// the shared `useUserSettings` store for the static dropdown selection.
export { default } from '../../../src/components/Calibrator'
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import DartLoader from './DartLoader'

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
		const { H, setCalibration, reset, errorPx, locked } = useCalibration()
	const { calibrationGuide, setCalibrationGuide, preferredCameraId, preferredCameraLabel, setPreferredCamera, preferredCameraLocked, setPreferredCameraLocked } = useUserSettings()
		// Detected ring data (from auto-detect) in image pixels
	const [detected, setDetected] = useState<null | {
		cx: number; cy: number;
		bullInner: number; bullOuter: number;
		trebleInner: number; trebleOuter: number;
		doubleInner: number; doubleOuter: number;
	}>(null)
		// Live detection and confidence state
		const [liveDetect, setLiveDetect] = useState<boolean>(false)
		const [confidence, setConfidence] = useState<number>(0)

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
		const [streaming, setStreaming] = useState(false)
		// Pure re-export of the canonical Calibrator component
		export { default } from '../../../src/components/Calibrator'
		}
		// Try to detect if server exposes HTTPS info
		fetch(`/api/https-info`).then(r=>r.json()).then(j=>{
			if (j && typeof j.https === 'boolean') setHttpsInfo({ https: !!j.https, port: Number(j.port)||8788 })
		}).catch(()=>{})
	}, [])

	// Removed automatic phone pairing effect. Only pair on explicit user action.
	const mobileUrl = useMemo(() => {
		const code = pairCode || '____'
		// Prefer configured WS host (Render) when available to build the correct server origin
		const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
		if (envUrl && envUrl.length > 0) {
			try {
				const u = new URL(envUrl)
				const isSecure = u.protocol === 'wss:'
				const origin = `${isSecure ? 'https' : 'http'}://${u.host}${u.pathname.endsWith('/ws') ? '' : u.pathname}`
				const base = origin.replace(/\/?ws$/i, '')
				return `${base}/mobile-cam.html?code=${code}`
			} catch {}
		}
		// Local dev fallback using detected LAN or current host
		const host = (lanHost || window.location.hostname)
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
	// Do not auto-regenerate pairing codes. Only create codes on explicit user action.
	// This prevents silent reconfiguration while a user is pairing a phone.

	useEffect(() => {
		return () => stopCamera()
	}, [])

	function ensureWS() {
		if (ws && ws.readyState === WebSocket.OPEN) return ws
		// Prefer configured WS endpoint; normalize to include '/ws'. Fallback to same-origin '/ws'.
			const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
			const normalizedEnv = envUrl && envUrl.length > 0
				? (envUrl.endsWith('/ws') ? envUrl : envUrl.replace(/\/$/, '') + '/ws')
				: undefined
			const proto = (window.location.protocol === 'https:' ? 'wss' : 'ws')
			const sameOrigin = `${proto}://${window.location.host}/ws`
			const host = window.location.hostname
			const fallbacks = [sameOrigin, `${proto}://${host}:8787/ws`, `${proto}://${host}:3000/ws`]
			const url = normalizedEnv || fallbacks[0]
			let socket: WebSocket = new WebSocket(url)
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
				// Re-export the canonical Calibrator component from the root `src/components` folder.
				// This ensures there is a single authoritative implementation that reads
				// the shared `useUserSettings` store for the static dropdown selection.
				export { default } from '../../../src/components/Calibrator'
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
		}
		const ringScores = Object.fromEntries(
			Object.keys(ratios).map(key => [ key, radialScore(BoardRadii[key as keyof typeof BoardRadii] / BoardRadii.doubleOuter) ])
		)
		const sorted = Object.entries(ringScores).sort((a, b) => b[1] - a[1])
		const bestRings = new Map<string, number>()
		for (const [key, score] of sorted) {
			if (score <= 0) break
			bestRings.set(key, Math.round(score))
		}
		console.log('Best rings:', bestRings)
		// Heuristic: require at least 3 rings detected
		if (bestRings.size < 3) return alert('Not enough rings detected. Please adjust the camera or lighting and try again.')
		const selected = new Set<string>()
		const addBest = (key: string) => {
			if (selected.size >= 3) return
			selected.add(key)
			const ratio = ratios[key as keyof typeof ratios]
			const rInner = BoardRadii.doubleOuter * ratio
			const rOuter = BoardRadii.doubleOuter * (ratio + 0.05)
			for (const [k, s] of sorted) {
				if (selected.size >= 3) break
				if (s < 10) break // arbitrary noise threshold
				if (k === key) continue
				const r = BoardRadii.doubleOuter * (ratios[k as keyof typeof ratios] + 0.025)
				if (Math.abs(r - rInner) < 10) addBest(k)
				if (Math.abs(r - rOuter) < 10) addBest(k)
			}
		}
		for (const [key, score] of sorted) {
			if (score <= 0) break
			addBest(key)
		}
		console.log('Selected rings:', selected)
		const cx = OCX, cy = OCY
		const rInners = Object.fromEntries(
			Array.from(selected).map(key => [ key, BoardRadii.doubleOuter * ratios[key as keyof typeof BoardRadii] ])
		)
		const rOuters = Object.fromEntries(
			Array.from(selected).map(key => [ key, BoardRadii.doubleOuter * (ratios[key as keyof typeof BoardRadii] + 0.05) ])
		)
		setDetected({ cx, cy, ...rInners, ...rOuters })
		const src = canonicalRimTargets()
		const dst = Array.from(selected).flatMap(key => {
			const rInner = rInners[key]!
			const rOuter = rOuters[key]!
			return [
				{ x: cx + rInner, y: cy },    // inner right
				{ x: cx, y: cy - rInner },    // inner top
				{ x: cx - rInner, y: cy },    // inner left
				{ x: cx, y: cy + rInner },    // inner bottom
				{ x: cx + rOuter, y: cy },    // outer right
				{ x: cx, y: cy - rOuter },    // outer top
				{ x: cx - rOuter, y: cy },    // outer left
				{ x: cx, y: cy + rOuter },    // outer bottom
			]
		})
		setDstPoints(dst)
		drawOverlay(dst)
		const Hcalc = computeHomographyDLT(src, dst)
		drawOverlay(dst, Hcalc)
		const err = rmsError(Hcalc, src, dst)
		setCalibration({ H: Hcalc as Homography, createdAt: Date.now(), errorPx: err, imageSize: { w: canvasRef.current.width, h: canvasRef.current.height }, anchors: { src, dst } })
		setPhase('computed')
	}

	// --- Drawing utilities ---
	function drawOverlay(points: Point[], H?: Homography) {
		if (!overlayRef.current) return
		const ctx = overlayRef.current.getContext('2d')
		if (!ctx) return
		ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
		ctx.save()
		ctx.lineWidth = 2 / zoom
		ctx.strokeStyle = 'cyan'
		ctx.fillStyle = 'rgba(0, 255, 255, 0.3)'
		if (H) {
			ctx.setLineDash([6/zoom, 3/zoom])
			ctx.strokeStyle = 'magenta'
			drawPolyline(ctx, points, true)
			ctx.setLineDash([])
			ctx.strokeStyle = 'cyan'
			for (let i = 0; i < points.length; i++) {
				const p0 = points[i]
				const p1 = points[(i + 1) % points.length]
				drawCross(ctx, p0, 8 / zoom, 'cyan')
				drawCross(ctx, p1, 8 / zoom, 'cyan')
				const hp0 = H[i]
				const hp1 = H[(i + 1) % H.length]
				if (hp0 && hp1) {
					ctx.strokeStyle = 'magenta'
					ctx.beginPath()
					ctx.moveTo(hp0.x, hp0.y)
					ctx.lineTo(hp1.x, hp1.y)
					ctx.stroke()
				}
			}
		} else {
			drawPolyline(ctx, points, true)
			for (const p of points) {
				drawCross(ctx, p, 8 / zoom, 'cyan')
			}
		}
		ctx.restore()
	}

	return (
		<div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<div className="flex flex-col">
					<div className="flex-1">
						<div className="aspect-video rounded-lg overflow-hidden bg-slate-900/50">
							<video ref={videoRef} className="w-full h-full object-cover" autoPlay muted={true} />
							<canvas ref={canvasRef} className="hidden" />
							<canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
						</div>
					</div>
					<div className="mt-4">
						<label className="block text-sm font-medium text-slate-300 mb-1">
							Zoom
						</label>
						<input
							type="range"
							min="0.5"
							max="2"
							step="0.1"
							value={zoom}
							onChange={e => setZoom(Number(e.target.value))}
							className="w-full range range-primary"
						/>
					</div>
					<div className="mt-4">
						<button
							onClick={() => setPhase('capture')}
							className="btn w-full h-12 text-lg"
						>
							{phase === 'capture' ? 'Retake Snapshot' : 'Capture Snapshot'}
						</button>
					</div>
					<div className="mt-4">
						<button
							onClick={resetAll}
							className="btn btn--ghost w-full h-12 text-lg"
						>
							Reset
						</button>
					</div>
				</div>
				<div className="flex flex-col">
					<div className="flex-1">
						{phase === 'computed' && (
							<div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/50">
								<div className="text-sm text-slate-400 mb-2">
									Calibration computed! You can now use this calibration to improve the accuracy of your measurements.
								</div>
								<button
									onClick={() => setPhase('select')}
									className="btn w-full h-12 text-lg"
								>
									Use This Calibration
								</button>
							</div>
						)}
						{phase === 'select' && (
							<div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/50">
								<div className="text-sm text-slate-400 mb-2">
									Select a calibration to use for this session:
								</div>
								{/* TODO: List available calibrations */}
								<div className="flex flex-col gap-2">
									<button className="btn w-full h-12 text-lg">
										Calibration 1
									</button>
									<button className="btn w-full h-12 text-lg">
										Calibration 2
									</button>
								</div>
							</div>
						)}
						{phase === 'camera' && (
							<div className="flex flex-col gap-4">
								<div className="text-sm text-slate-400">
									{streaming ? 'Camera is active.' : 'Starting camera...'}
								</div>
								<div className="flex-1 flex items-center justify-center">
									<DartLoader visible={!streaming} />
								</div>
							</div>
						)}
						{phase === 'idle' && (
							<div className="text-sm text-slate-400">
								Calibration is idle. Please start the camera to begin.
							</div>
						)}
					</div>
					<div className="mt-2">
						{/* Phone pairing UI */}
						{paired ? (
							<div className="p-4 rounded-lg bg-green-900/50 border border-green-700/50">
								<div className="text-sm text-green-200 mb-2">
									Phone is paired! You can now use the app on your phone.
								</div>
								<button className="btn w-full h-12 text-lg" onClick={() => setPaired(false)}>
									Unpair Phone
								</button>
							</div>
						) : (
							<div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/50">
								<div className="text-sm text-slate-400 mb-2">
									Scan this QR code with the app on your phone to pair:
								</div>
								<div className="flex items-center justify-center">
									{qrDataUrl ? (
										<img src={qrDataUrl} alt="QR Code" className="w-32 h-32" />
									) : (
										<DartLoader visible={true} />
									)}
								</div>
								<div className="mt-2 text-center">
									{expiresAt && (
										<div className="text-xs text-slate-400 mb-1">
											Code expires in {ttl} seconds
										</div>
									)}
									<button className="btn px-2 py-1 text-xs" onClick={regenerateCode}>
										Regenerate Code
									</button>
								</div>
								{showTips && (
									<div className="mt-2 p-2 rounded bg-slate-900/60 border border-slate-700/50 text-slate-200">
										<div className="font-semibold mb-1">Troubleshooting</div>
										<ul className="list-disc pl-4 space-y-1">
											<li>Phone and desktop must be on the same Wi‑Fi network.</li>
											<li>Allow the server through your firewall (ports 8787 and {httpsInfo?.https ? httpsInfo.port : 8788}).</li>
											<li>On iPhone, use HTTPS links (QR will prefer https when enabled).</li>
										</ul>
										<div className="mt-2 text-right">
											<button className="btn btn--ghost px-2 py-1 text-xs" onClick={() => setShowTips(false)}>
												Hide tips
											</button>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
			<div className="mt-4 text-sm opacity-80">
				<div>Phase: {phase}</div>
				<div>Clicked: {dstPoints.length} / 4</div>
				{errorPx != null && <div>Fit error: {errorPx.toFixed(2)} px</div>}
			</div>
		</div>
	)
}
