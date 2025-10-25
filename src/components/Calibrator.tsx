import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import DartLoader from './DartLoader'

import QRCode from 'qrcode'
import { useCalibration } from '../store/calibration'
import { BoardRadii, canonicalRimTargets, computeHomographyDLT, drawCross, drawPolyline, rmsError, sampleRing, refinePointsSobel, type Homography, type Point } from '../utils/vision'
import { useUserSettings } from '../store/userSettings'
import { discoverNetworkDevices, connectToNetworkDevice, type NetworkDevice } from '../utils/networkDevices'

type Phase = 'idle' | 'camera' | 'capture' | 'select' | 'computed'
type CamMode = 'local' | 'phone' | 'wifi'

export default function Calibrator() {
	const videoRef = useRef<HTMLVideoElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const overlayRef = useRef<HTMLCanvasElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [streaming, setStreaming] = useState(false)
	const [videoPlayBlocked, setVideoPlayBlocked] = useState(false)
	const [phase, setPhase] = useState<Phase>('camera')
	// Default to local or last-used mode, but allow user to freely change
	const [mode, setMode] = useState<CamMode>(() => (localStorage.getItem('ndn:cal:mode') as CamMode) || 'local')
	const [dstPoints, setDstPoints] = useState<Point[]>([]) // image points clicked in order TOP, RIGHT, BOTTOM, LEFT
	const [snapshotSet, setSnapshotSet] = useState(false)
	// Track current frame (video/snapshot) size to preserve aspect ratio in the preview container
	const [frameSize, setFrameSize] = useState<{ w: number, h: number } | null>(null)
	// Zoom for pixel-perfect point picking (0.5x – 2.0x)
	const [zoom, setZoom] = useState<number>(1)
		const { H, setCalibration, reset, errorPx, locked } = useCalibration()
	const { calibrationGuide, setCalibrationGuide, preferredCameraId, cameraEnabled, setCameraEnabled, preferredCameraLocked, setPreferredCameraLocked, setPreferredCamera } = useUserSettings()
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
	const [wifiDevices, setWifiDevices] = useState<NetworkDevice[]>([])
	const [discoveringWifi, setDiscoveringWifi] = useState<boolean>(false)
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

	// Remove automatic phone pairing on mode change; only pair on explicit user action
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
	// Removed automatic regeneration of code when ttl expires. Only regenerate on explicit user action.

	useEffect(() => {
		return () => stopCamera()
	}, [])

	// Remove automatic camera restart on preferredCameraId change to prevent flicker

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
			console.log('[Calibrator] Connecting WebSocket to:', url)
			let socket: WebSocket = new WebSocket(url)
		setWs(socket)
		return socket
	}

	async function startPhonePairing() {
		// Do not reset paired/streaming/phase state here to keep UI static
		// Switch UI into phone pairing mode so the calibrator shows phone-specific hints
		setMode('phone')
		// Lock selection and ensure camera UI is enabled while pairing is active
		lockSelectionForPairing()
		try { setCameraEnabled(true) } catch {}
		const socket = ensureWS()
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({ type: 'cam-create' }))
		} else {
			socket.onopen = () => socket.send(JSON.stringify({ type: 'cam-create' }))
		}
		socket.onerror = (error) => {
			console.error('WebSocket connection error:', error)
			alert('Failed to connect to camera pairing service. Please check your internet connection and try again.')
		}
		socket.onclose = (event) => {
			console.log('WebSocket closed:', event.code, event.reason)
			if (pc) {
				pc.close()
				setPc(null)
			}
			// Only show alert if it wasn't a clean close
			if (event.code !== 1000) {
				alert('Camera pairing connection lost. Please try pairing again.')
			}
		}
		socket.onmessage = async (ev) => {
			const data = JSON.parse(ev.data)
			if (data.type === 'cam-code') {
				setPairCode(data.code)
				if (data.expiresAt) setExpiresAt(data.expiresAt)
			} else if (data.type === 'cam-peer-joined') {
				setPaired(true)
				const peer = new RTCPeerConnection({ 
					iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
					iceCandidatePoolSize: 10
				})
				setPc(peer)
				
				// Add connection state monitoring
				peer.onconnectionstatechange = () => {
					console.log('WebRTC connection state:', peer.connectionState)
					if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
						console.error('WebRTC connection failed')
						alert('Camera connection lost. Please try pairing again.')
						stopCamera()
					} else if (peer.connectionState === 'connected') {
						console.log('WebRTC connection established')
					}
				}
				
				peer.onicecandidate = (e) => {
					if (e.candidate && pairCode) socket.send(JSON.stringify({ type: 'cam-ice', code: pairCode, payload: e.candidate }))
				}
				
				peer.ontrack = (ev) => {
					console.log('WebRTC ontrack received:', ev.streams?.[0])
					if (videoRef.current) {
						const inbound = ev.streams?.[0]
						if (inbound) {
							console.log('Assigning video stream to video element')
							// Ensure video element is visible
							setSnapshotSet(false)
							// Use setTimeout to ensure DOM updates before assigning stream
							setTimeout(() => {
								if (videoRef.current) {
											videoRef.current.srcObject = inbound
												videoRef.current.play().then(() => {
												console.log('Video playback started successfully')
												// Mark that we're streaming from the phone and transition to capture
												setStreaming(true)
												setPhase('capture')
												// Set user settings to reflect that the active camera is the phone
												try { setPreferredCamera(undefined, 'Phone Camera', true) } catch {}
												try { setPreferredCameraLocked(true) } catch {}
												try { setCameraEnabled(true) } catch {}
												// If an overlay prompt was shown earlier, hide it now
												setVideoPlayBlocked(false)
											}).catch((err) => {
												console.error('Video play failed:', err)
												// Show a friendly tap-to-play overlay so user can enable playback
												setVideoPlayBlocked(true)
												console.warn('[Calibrator] video play blocked — prompting user interaction')
											})
								}
							}, 100)
						} else {
							console.error('No inbound stream received')
						}
					} else {
						console.error('Video element not available')
					}
				}
				
				try {
					const offer = await peer.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true })
					await peer.setLocalDescription(offer)
					console.log('[Calibrator] Sending cam-offer for code:', pairCode)
					if (pairCode) socket.send(JSON.stringify({ type: 'cam-offer', code: pairCode, payload: offer }))
				} catch (err) {
					console.error('Failed to create WebRTC offer:', err)
					alert('Failed to establish camera connection. Please try again.')
					stopCamera()
				}
			} else if (data.type === 'cam-answer') {
				console.log('[Calibrator] Received cam-answer')
				if (pc) {
					try {
						await pc.setRemoteDescription(new RTCSessionDescription(data.payload))
						console.log('[Calibrator] Remote description set (answer)')
					} catch (err) {
						console.error('Failed to set remote description:', err)
						alert('Camera pairing failed. Please try again.')
						stopCamera()
					}
				}
			} else if (data.type === 'cam-ice') {
				console.log('[Calibrator] Received cam-ice')
				if (pc) {
					try {
						await pc.addIceCandidate(data.payload)
						console.log('[Calibrator] ICE candidate added')
					} catch (err) {
						console.error('Failed to add ICE candidate:', err)
						// Don't alert for ICE candidate errors as they're often non-critical
					}
				}
			} else if (data.type === 'cam-error') {
				console.error('Camera pairing error:', data.code)
				alert(data.code === 'EXPIRED' ? 'Code expired. Generate a new code.' : `Camera error: ${data.code || 'Unknown error'}`)
				stopCamera()
			}
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
		setPhase('camera')
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
				setPhase('capture')
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

	async function startCamera() {
		if (mode === 'phone') return startPhonePairing()
		if (mode === 'wifi') return startWifiConnection()
		try {
			console.log('[Calibrator] Attempting camera access...')
			const constraints: MediaStreamConstraints = {
				video: preferredCameraId ? { deviceId: { exact: preferredCameraId } } : { facingMode: 'environment' },
				audio: false
			}
			console.log('[Calibrator] Camera constraints:', constraints)
			let stream: MediaStream
			try {
				stream = await navigator.mediaDevices.getUserMedia(constraints)
				console.log('[Calibrator] Camera stream obtained:', stream)
			} catch (err: any) {
				const name = (err && (err.name || err.code)) || ''
				console.warn('[Calibrator] Preferred camera not available:', err)
				if (preferredCameraId && (name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'NotAllowedError')) {
					stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
					console.log('[Calibrator] Fallback camera stream obtained:', stream)
				} else {
					throw err
				}
			}
			if (videoRef.current) {
				videoRef.current.srcObject = stream
				await videoRef.current.play()
				console.log('[Calibrator] Video playback started')
			} else {
				console.warn('[Calibrator] videoRef.current is null')
			}
			setStreaming(true)
			setPhase('capture')
		} catch (e) {
			console.error('[Calibrator] Camera access failed:', e)
			alert(`Camera access failed: ${e instanceof Error ? e.message : 'Unknown error'}. Try refreshing the page or check camera permissions.`)
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
	    // Unlock preferred camera selection when camera pairing/stops so the user can change it again
	    try { setPreferredCameraLocked(false) } catch {}
	}

	function regenerateCode() {
		// Only regenerate code, do not reset UI or camera state
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'cam-create' }))
		} else {
			startPhonePairing()
		}
		// Lock the preferred camera selection while pairing is active so it doesn't
		// flip automatically during the pairing flow.
		lockSelectionForPairing()
	}

	// When user regenerates a pairing code we lock the preferred camera selection so
	// it won't be changed accidentally by other parts of the UI while pairing is active.
	// This implements the user's request that the camera selection 'stay static' after
	// generating a code. The lock can be toggled by the user in the DevicePicker UI.
	function lockSelectionForPairing() {
		try { setPreferredCameraLocked(true) } catch {}
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
			// If liveDetect is on, kick a detect on this captured frame
			if (liveDetect) setTimeout(() => { autoDetectRings() }, 0)
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
				// Use green for all rings when calibration is locked/perfect
				const ringColor = locked ? '#10b981' : (r === BoardRadii.doubleOuter ? '#22d3ee' : '#a78bfa')
				const ringWidth = locked ? 3 : (r === BoardRadii.doubleOuter ? 3 : 2)
				const poly = sampleRing(Huse, r, 360)
				drawPolyline(ctx, poly, ringColor, ringWidth)
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

		// Preferred-view framing guide (if enabled and not yet calibrated)
		if (calibrationGuide && !locked) {
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
			// Legend - draw at fixed size regardless of zoom
			ctx.save()
			ctx.scale(1/zoom, 1/zoom) // Inverse scale to keep text static
			ctx.fillStyle = 'rgba(255,255,255,0.85)'
			ctx.font = '12px sans-serif'
			ctx.fillText('Tip: Frame board centered, edges parallel; slight top-down is okay. Keep bull near center.', pad * zoom, (pad + 18) * zoom)
			ctx.restore()
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
		function refineAround(expectedR: number, pctWindow = 0.08) { // Reduced window for more precision
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
			// Estimate confidence: ratio of ring scores around expected vs local baseline
			// Use normalized edge magnitude at found radii to compute a 0-1 score, then scale to percent
			const totalEdge = (r: number) => {
				const samples = 180
				let s = 0
				for (let a = 0; a < samples; a++) {
					const ang = (a * Math.PI) / 90
					const x = Math.round(best.cx + (r*scale) * Math.cos(ang))
					const y = Math.round(best.cy + (r*scale) * Math.sin(ang))
					if (x <= 0 || x >= dw-1 || y <= 0 || y >= dh-1) continue
					s += mag[y*dw + x]
				}
				return s / samples
			}
			const score = totalEdge(best.r) + totalEdge(tOuter) + totalEdge(tInner) + totalEdge(dInner) + totalEdge(bOuter) + totalEdge(bInner)
			const norm = score / (maxMag * 6)
			const conf = Math.max(0, Math.min(1, norm))
			// Apply stricter confidence calculation for perfect calibration
			const adjustedConf = Math.min(conf, Math.min(
				totalEdge(best.r) / maxMag,    // Double outer
				totalEdge(tOuter) / maxMag,    // Treble outer  
				totalEdge(tInner) / maxMag,    // Treble inner
				totalEdge(dInner) / maxMag,    // Double inner
				totalEdge(bOuter) / maxMag,    // Bull outer
				totalEdge(bInner) / maxMag     // Bull inner
			))
			setConfidence(Math.round(adjustedConf * 100))
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
			// Auto-lock if confidence high and error small
			const autoLock = adjustedConf >= 0.95 // Use adjusted confidence for near-perfect calibration
			setCalibration({ locked: autoLock })
	}

		useEffect(() => {
			drawOverlay()
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [snapshotSet, H])

		// Live detection loop (runs only when streaming and liveDetect is on)
		useEffect(() => {
			if (!liveDetect || !streaming) return
			let raf = 0
			const tick = () => {
				try { captureFrame() } catch {}
				raf = requestAnimationFrame(tick)
			}
			raf = requestAnimationFrame(tick)
			return () => cancelAnimationFrame(raf)
		}, [liveDetect, streaming])

		// When calibration is locked and we have a pairing code, publish calibration to server
		useEffect(() => {
			(async () => {
				try {
					if (!locked || !pairCode) return
					const payload = { H, anchors: (H ? undefined : undefined), imageSize: (imageSize || null), errorPx: (errorPx ?? null), createdAt: Date.now() }
					// include anchors and other calibration metadata if available from store
					try {
						const body = JSON.stringify({ H, anchors: (typeof (H) !== 'undefined' ? null : null), imageSize: imageSize || null, errorPx: errorPx || null })
						await fetch(`/cam/calibration/${pairCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
						console.log('[Calibrator] Posted calibration for code', pairCode)
					} catch (err) {
						console.warn('[Calibrator] Upload calibration failed', err)
					}
						// If user is authenticated, persist calibration to their account (Supabase-backed)
						try {
							const token = localStorage.getItem('authToken')
							if (token) {
								await fetch('/api/user/calibration', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body })
								console.log('[Calibrator] Synced calibration to user account')
							}
						} catch (err) {
							console.warn('[Calibrator] User calibration sync failed', err)
						}
				} catch (e) { /* ignore */ }
			})()
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [locked, pairCode])

		// DevicePicker moved from SettingsPanel
		function DevicePicker() {
			const { preferredCameraId, preferredCameraLabel, setPreferredCamera, cameraEnabled, setCameraEnabled, preferredCameraLocked, setPreferredCameraLocked } = useUserSettings()
			const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
			const [err, setErr] = useState('')
			const [dropdownOpen, setDropdownOpen] = useState(false)
			const dropdownRef = useRef<HTMLDivElement>(null)
			const dropdownPortal = document.getElementById('dropdown-portal-root') || (() => {
				const el = document.createElement('div');
				el.id = 'dropdown-portal-root';
				document.body.appendChild(el);
				return el;
			})();

			async function enumerate() {
				setErr('')
				try {
					// Ensure we have permission; otherwise labels may be empty.
					try { await navigator.mediaDevices.getUserMedia({ video: true }); } catch {}
					const list = await navigator.mediaDevices.enumerateDevices()
					const cams = list.filter(d => d.kind === 'videoinput')
					setDevices(cams)
				} catch (e: any) {
					setErr('Unable to list cameras. Grant camera permission in your browser.')
				}
			}

			useEffect(() => { enumerate() }, [])

			// Close dropdown when clicking outside
			useEffect(() => {
				function handleClickOutside(event: MouseEvent) {
					if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
						setDropdownOpen(false)
					}
				}
				document.addEventListener('mousedown', handleClickOutside)
				return () => document.removeEventListener('mousedown', handleClickOutside)
			}, [])

			const selectedDevice = devices.find(d => d.deviceId === preferredCameraId)
			const selectedLabel = selectedDevice ? 
				`${selectedDevice.label || 'Camera'}` : 
				(preferredCameraId ? 'Camera (unavailable)' : 'Auto (browser default)')

			// If preferred camera is set but not found, show a warning
			const preferredCameraUnavailable = preferredCameraId && !selectedDevice

			return (
				<div className="mt-3 p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5">
					<div className="font-semibold mb-2">Select camera device</div>
					{err && <div className="text-rose-400 text-sm mb-2">{err}</div>}
					{preferredCameraUnavailable && (
						<div className="text-amber-400 text-sm mb-2">
							Selected camera is no longer available. 
							<button 
								className="underline ml-1" 
											onClick={() => setPreferredCamera(undefined, '', true)}
								disabled={streaming}
							>
								Use auto-selection
							</button>
						</div>
					)}
					{/* Lock indicator and toggle for camera selection */}
					<div className="flex items-center gap-2 mb-2">
						{preferredCameraLocked ? (
							<div className="text-xs text-emerald-400">🔒 Camera selection locked</div>
						) : (
							<div className="text-xs text-slate-400">Camera selection unlocked</div>
						)}
						<button className="btn btn--ghost px-2 py-0.5 text-xs ml-2" onClick={() => setPreferredCameraLocked(!preferredCameraLocked)}>{preferredCameraLocked ? 'Unlock' : 'Lock'}</button>
					</div>
					<div className="flex items-center gap-3 mb-3">
						<input
							type="checkbox"
							id="cameraEnabled-calibrator"
							checked={cameraEnabled}
							onChange={e => setCameraEnabled(e.target.checked)}
							className="w-4 h-4"
							disabled={streaming}
						/>
						<label htmlFor="cameraEnabled-calibrator" className="text-sm">Enable camera for scoring</label>
					</div>
					<div className="grid grid-cols-3 gap-2 items-center text-sm">
						<div className="col-span-2 relative" ref={dropdownRef}>
							<div 
								className={`input w-full flex items-center justify-between cursor-pointer ${streaming ? 'opacity-50 cursor-not-allowed' : ''}`}
								onClick={() => !streaming && setDropdownOpen(!dropdownOpen)}
							>
								<span className="truncate">{selectedLabel}</span>
								<svg className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
								</svg>
							</div>
							{dropdownOpen && !streaming && ReactDOM.createPortal(
								<div className="fixed left-0 top-0 w-full h-full z-[9999]" style={{ pointerEvents: 'none' }}>
									<div className="absolute" style={{ left: dropdownRef.current?.getBoundingClientRect().left || 0, top: dropdownRef.current?.getBoundingClientRect().bottom || 0, width: dropdownRef.current?.offsetWidth || 240, pointerEvents: 'auto' }}>
										<div className="bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
											<div 
												className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm"
												onClick={() => {
													setPreferredCamera(undefined, '', true)
												}}
											>
												Auto (browser default)
											</div>
											{devices.map(d => {
												const label = `${d.label || 'Camera'}`
												return (
													<div 
														key={d.deviceId} 
														className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm"
														onClick={() => {
															setPreferredCamera(d.deviceId, d.label || '', true)
														}}
													>
														{label}
													</div>
												)
											})}
											<div 
												key="phone-camera" 
												className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm text-indigo-400"
												onClick={() => {
													setMode('phone');
													setPhase('camera');
													setStreaming(false);
													setSnapshotSet(false);
													// Only start pairing if user clicks 'Pair Phone Camera' button
												}}
											>
												📱 Phone Camera
											</div>
											<div className="px-3 py-2 text-right">
												<button className="btn btn--ghost px-2 py-1 text-xs" onClick={() => setDropdownOpen(false)}>Close</button>
											</div>
										</div>
									</div>
								</div>,
								dropdownPortal
							)}
						</div>
						<div className="text-right">
							<button className="btn px-2 py-1" onClick={enumerate} disabled={streaming}>Refresh</button>
						</div>
					</div>
					{preferredCameraLabel && (
						<div className="text-xs opacity-70 mt-1">Selected: {preferredCameraLabel}</div>
					)}
					<div className="text-xs opacity-70 mt-1">Tip: All camera technology is supported for autoscoring needs—select your camera here and then open Calibrator to align.</div>
				</div>
			)
		}
		return (
			<div className="space-y-4">
				<div className="card">
					{/* Camera device picker moved from SettingsPanel */}
					<DevicePicker />
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
										<button 
											className={`btn px-2 py-1 bg-gray-600 opacity-50 cursor-not-allowed`} 
											disabled
											title="Local camera mode disabled"
										>
											Local
										</button>
										<button 
											className={`btn px-2 py-1 bg-emerald-600`} 
											disabled
											title="Phone camera mode locked"
										>
											Phone
										</button>
										<button 
											className={`btn px-2 py-1 bg-gray-600 opacity-50 cursor-not-allowed`} 
											disabled
											title="Wifi camera mode disabled"
										>
											Wifi
										</button>
									</div>
									{streaming && (
										<span className="text-xs opacity-60 ml-2">
											({mode === 'local' ? 'Local Camera Active' : mode === 'phone' ? 'Phone Camera Paired' : 'Wifi Device Connected'})
										</span>
									)}
								</div>
												<div className="flex items-center gap-2 text-[11px]">
													<span className="opacity-70">View Zoom</span>
													<input type="range" min={50} max={200} step={5} value={Math.round((zoom||1)*100)} onChange={e=>setZoom(Math.max(0.5, Math.min(2, Number(e.target.value)/100)))} />
													<span className="w-10 text-center">{Math.round((zoom||1)*100)}%</span>
													<button className="btn px-2 py-0.5" onClick={()=>setZoom(1)}>Actual</button>
												</div>
												<div className="mt-2 flex items-center gap-2 text-xs">
													<label className="inline-flex items-center gap-2">
														<input type="checkbox" className="accent-indigo-600" checked={liveDetect} onChange={e=>setLiveDetect(e.target.checked)} /> Live auto-detect
													</label>
													<span className={`px-2 py-0.5 rounded-full border ${confidence>=85?'bg-emerald-500/15 border-emerald-400/30':'bg-white/10 border-white/20'}`}>Confidence: {confidence}%</span>
												</div>
								<label className="mt-2 flex items-center gap-2 text-xs">
									<input type="checkbox" className="accent-indigo-600" checked={calibrationGuide} onChange={e=>setCalibrationGuide(e.target.checked)} />
									Show preferred-view guide overlay
								</label>
								{/* Vertical action buttons */}
								<div className="flex flex-col gap-2 mt-3">
									{(!streaming ? (
										<>
											{mode === 'local' && (
												<button className="btn" onClick={startCamera}>Start Camera</button>
											)}
											{mode === 'phone' && (
												<button className="btn" onClick={startPhonePairing}>Pair Phone Camera</button>
											)}
											{mode === 'wifi' && (
												<button className="btn" onClick={startWifiConnection}>Connect Wifi Camera</button>
											)}
										</>
									) : (
										<>
											<button className="btn bg-rose-600 hover:bg-rose-700" onClick={stopCamera}>Stop Camera</button>
											<button className="btn" onClick={captureFrame} disabled={!streaming}>Capture Frame</button>
										</>
									))}
									<div className="flex items-center gap-2 mt-1">
										<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadPhotoChange} />
										<button className="btn" onClick={triggerUpload}>Upload Photo</button>
										<button className="btn" disabled={!snapshotSet} onClick={autoDetectRings}>Auto Detect</button>
									</div>
														<button className="btn" disabled={dstPoints.length !== 4} onClick={compute}>Compute</button>
														<div className="flex items-center gap-2 mt-1">
															<button className={`btn ${locked? 'bg-emerald-600 hover:bg-emerald-700':''}`} onClick={()=>setCalibration({ locked: !locked })}>{locked ? 'Unlock' : 'Lock In'}</button>
															{locked && <span className="text-xs opacity-80">Calibration saved{errorPx!=null?` · error ${errorPx.toFixed(2)}px`:''}</span>}
														</div>
									<button className="btn" disabled={dstPoints.length === 0} onClick={undoPoint}>Undo</button>
									<button className="btn" disabled={dstPoints.length === 0} onClick={refinePoints}>Refine Points</button>
									<button className="btn" onClick={resetAll}>Reset</button>
								</div>
							</div>
							<div className="md:col-span-8 flex items-center justify-end">
								<div
									className="relative w-full max-w-[min(100%,60vh)] rounded-2xl overflow-hidden border border-indigo-400/30 bg-black flex items-center justify-center"
									style={{ aspectRatio: frameSize ? `${frameSize.w} / ${frameSize.h}` : '16 / 9' }}
								>
									{(!streaming || !paired) ? (
										<DartLoader calibrationComplete={phase === 'computed'} />
									) : null}
									<div className="absolute inset-0" style={{ transform: `scale(${zoom||1})`, transformOrigin: 'center center' }}>
										<video
											ref={videoRef}
											onLoadedMetadata={(ev) => {
												try {
													const v = ev.currentTarget as HTMLVideoElement
													if (v.videoWidth && v.videoHeight) setFrameSize({ w: v.videoWidth, h: v.videoHeight })
												} catch {}
											}}
											className={`absolute inset-0 w-full h-full object-cover ${snapshotSet ? 'opacity-0 -z-10' : 'opacity-100 z-10'}`}
											autoPlay
											playsInline
											muted
										/>
										{videoPlayBlocked && (
											<div className="absolute inset-0 z-50 flex items-center justify-center">
												<button
													className="bg-white/90 text-slate-900 px-4 py-2 rounded-lg shadow-lg"
													onClick={async () => {
													try {
														await videoRef.current?.play()
														setVideoPlayBlocked(false)
														setStreaming(true)
														setPhase('capture')
													} catch (e) {
														console.warn('Tap-to-play retry failed', e)
														alert('Tap to enable video failed. Please check browser settings or reload the page.')
													}
												}}
												>
													Tap to allow video
												</button>
											</div>
										)}
										<canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${snapshotSet ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`} />
										<canvas ref={overlayRef} onClick={onClickOverlay} className="absolute inset-0 w-full h-full z-30" />
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
				{mode==='wifi' && !streaming && (
					<div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs">
						<div className="font-semibold mb-2">Wifi Scoring Devices</div>
						{discoveringWifi ? (
							<div className="flex items-center gap-2">
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
								<span>Scanning network for devices...</span>
							</div>
						) : wifiDevices.length > 0 ? (
							<div className="space-y-2">
								{wifiDevices.map(device => (
									<div key={device.id} className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-700/50">
										<div>
											<div className="font-medium">{device.name}</div>
											<div className="opacity-70">{device.ip}:{device.port} · {device.type.toUpperCase()}</div>
											<div className="opacity-70 text-xs">Capabilities: {device.capabilities.join(', ')}</div>
										</div>
										<button 
											className={`btn px-2 py-1 text-xs ${
												device.status === 'connecting' ? 'bg-yellow-600' :
												device.status === 'online' ? 'bg-green-600' : 'bg-blue-600'
											}`}
											onClick={() => connectToWifiDevice(device)}
											disabled={device.status === 'connecting'}
										>
											{device.status === 'connecting' ? 'Connecting...' : 'Connect'}
										</button>
									</div>
								))}
								<div className="text-center">
									<button className="btn px-2 py-1 text-xs" onClick={startWifiConnection}>Rescan Network</button>
								</div>
							</div>
						) : (
							<div className="text-center">
								<div className="mb-2">No wifi scoring devices found.</div>
								<div className="mb-2 opacity-70">Make sure your wifi cameras are powered on and connected to the same network.</div>
								<button className="btn px-2 py-1 text-xs" onClick={startWifiConnection}>Scan Again</button>
							</div>
						)}
					</div>
				)}
				<div className="mt-2 text-sm opacity-80">
					<div>Phase: {phase}</div>
					<div>Clicked: {dstPoints.length} / 4</div>
					{errorPx != null && <div>Fit error: {errorPx.toFixed(2)} px</div>}
				</div>
			</div>
		</div>
	)
}
