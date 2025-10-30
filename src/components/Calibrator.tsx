import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom'
import DartLoader from './DartLoader'

import QRCode from 'qrcode'
import { useCalibration } from '../store/calibration'
import { BoardRadii, canonicalRimTargets, computeHomographyDLT, drawCross, drawPolyline, rmsError, sampleRing, refinePointsSobel, type Homography, type Point } from '../utils/vision'
import { detectMarkersFromCanvas, MARKER_ORDER, MARKER_TARGETS, markerIdToMatrix, type MarkerDetection } from '../utils/markerCalibration'
import { useUserSettings } from '../store/userSettings'
import { discoverNetworkDevices, connectToNetworkDevice, type NetworkDevice } from '../utils/networkDevices'
import { apiFetch } from '../utils/api'

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
	const [mobileLandingOverride, setMobileLandingOverride] = useState<boolean>(() => {
		if (typeof window === 'undefined') return false
		try {
			return window.localStorage.getItem('ndn:cal:forceDesktop') === '1'
		} catch {
			return false
		}
	})
	const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => {
		if (typeof navigator === 'undefined') return false
		return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)
	})
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
	const [markerResult, setMarkerResult] = useState<MarkerDetection | null>(null)

	const createMarkerDataUrl = useCallback((id: number, size = 480) => {
		if (typeof document === 'undefined') throw new Error('Marker rendering only available in browser context')
		const matrix = markerIdToMatrix(id)
		const canvas = document.createElement('canvas')
		canvas.width = size
		canvas.height = size
		const ctx = canvas.getContext('2d')
		if (!ctx) throw new Error('Unable to create marker canvas context')
		ctx.imageSmoothingEnabled = false
		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, size, size)
		const padding = size * 0.08
		const cells = matrix.length
		const gridSize = size - padding * 2
		const cellSize = gridSize / cells
		const origin = padding
		for (let y = 0; y < cells; y++) {
			for (let x = 0; x < cells; x++) {
				const value = matrix[y][x]
				ctx.fillStyle = value === 1 ? '#000000' : '#ffffff'
				ctx.fillRect(origin + x * cellSize, origin + y * cellSize, cellSize, cellSize)
			}
		}
		ctx.strokeStyle = '#000000'
		ctx.lineWidth = Math.max(2, cellSize * 0.08)
		ctx.strokeRect(origin, origin, cellSize * cells, cellSize * cells)
		return canvas.toDataURL('image/png')
	}, [])

	const openMarkerSheet = useCallback(() => {
		try {
			const markers = MARKER_ORDER.map((key) => {
				const id = MARKER_TARGETS[key]
				return { key, id, dataUrl: createMarkerDataUrl(id) }
			})
			const popup = window.open('', '_blank', 'width=900,height=1200')
			if (!popup) throw new Error('Popup blocked by browser')
			const html = `<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8" />
				<title>Nine Dart Nation – Marker Sheet</title>
				<style>
					body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; color: #0f172a; }
					h1 { font-size: 20px; margin-bottom: 4px; }
					p { margin-top: 0; opacity: 0.7; }
					.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; margin-top: 24px; }
					.marker { text-align: center; }
					.marker h2 { font-size: 16px; margin: 12px 0 8px; }
					.marker img { width: 100%; max-width: 360px; border: 1px solid #0f172a; }
					footer { margin-top: 24px; font-size: 12px; opacity: 0.6; }
				</style>
			</head>
			<body>
				<h1>Marker sheet</h1>
				<p>Print at 100% scale on letter/A4 paper. Cut out and tape each marker so it is flush with the outer double ring.</p>
				<div class="grid">
					${markers.map((m) => `
						<div class="marker">
							<h2>${m.key.toUpperCase()} • ID ${m.id}</h2>
							<img src="${m.dataUrl}" alt="Marker ${m.key}" />
						</div>
					`).join('')}
				</div>
				<footer>Tip: Keep markers flat, smooth, and unobstructed for best detection results.</footer>
			</body>
			</html>`
			popup.document.write(html)
			popup.document.close()
		} catch (err: any) {
			console.error('Marker sheet generation failed', err)
			alert(`Unable to open marker sheet: ${err?.message || err}`)
		}
	}, [createMarkerDataUrl])

	// Phone pairing state (mirrors CameraTile)
	const [ws, setWs] = useState<WebSocket | null>(null)
	const autoLockRef = useRef(false)
	const [pairCode, setPairCode] = useState<string | null>(null)
	const pairCodeRef = useRef<string | null>(null)
	const updatePairCode = useCallback((code: string | null) => {
		pairCodeRef.current = code
		setPairCode(code)
	}, [setPairCode])
	const [expiresAt, setExpiresAt] = useState<number | null>(null)
	const [now, setNow] = useState<number>(Date.now())
	const [paired, setPaired] = useState<boolean>(false)
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const [qrDataUrl, setQrDataUrl] = useState<string>('')
	const [lanHost, setLanHost] = useState<string | null>(null)
	const [httpsInfo, setHttpsInfo] = useState<{ https: boolean; port: number } | null>(null)
	const [showTips, setShowTips] = useState<boolean>(true)
	const [wifiDevices, setWifiDevices] = useState<NetworkDevice[]>([])
	const [discoveringWifi, setDiscoveringWifi] = useState<boolean>(false)
	const [copyFeedback, setCopyFeedback] = useState<'link' | 'code' | null>(null)
	const copyTimeoutRef = useRef<number | null>(null)
	useEffect(() => {
		const h = window.location.hostname
		if (h === 'localhost' || h === '127.0.0.1') {
			apiFetch(`/api/hosts`).then(r => r.json()).then(j => {
				const ip = Array.isArray(j?.hosts) && j.hosts.find((x: string) => x)
				if (ip) setLanHost(ip)
			}).catch(()=>{})
		}
		// Try to detect if server exposes HTTPS info
		apiFetch(`/api/https-info`).then(r=>r.json()).then(j=>{
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

	const mobileLandingLink = useMemo(() => {
		if (!mobileUrl) return null
		try {
			const url = new URL(mobileUrl)
			url.searchParams.delete('code')
			return url.toString().replace(/\?$/, '')
		} catch {
			if (typeof window !== 'undefined') {
				const origin = window.location.origin.replace(/\/$/, '')
				return `${origin}/mobile-cam.html`
			}
			return '/mobile-cam.html'
		}
	}, [mobileUrl])

	useEffect(() => { localStorage.setItem('ndn:cal:mode', mode) }, [mode])

	useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			if (mobileLandingOverride) {
				window.localStorage.setItem('ndn:cal:forceDesktop', '1')
			} else {
				window.localStorage.removeItem('ndn:cal:forceDesktop')
			}
		} catch {}
	}, [mobileLandingOverride])

	useEffect(() => {
		if (typeof window === 'undefined') return
		const coarseQuery = window.matchMedia('(pointer: coarse)')
		const detect = () => {
			const uaMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)
			const coarse = typeof coarseQuery.matches === 'boolean' ? coarseQuery.matches : false
			const narrow = window.innerWidth <= 820
			setIsMobileDevice(uaMobile || coarse || narrow)
		}
		detect()
		try {
			if (typeof coarseQuery.addEventListener === 'function') coarseQuery.addEventListener('change', detect)
			else if (typeof coarseQuery.addListener === 'function') coarseQuery.addListener(detect)
		} catch {}
		window.addEventListener('resize', detect)
		return () => {
			try {
				if (typeof coarseQuery.removeEventListener === 'function') coarseQuery.removeEventListener('change', detect)
				else if (typeof coarseQuery.removeListener === 'function') coarseQuery.removeListener(detect)
			} catch {}
			window.removeEventListener('resize', detect)
		}
	}, [])

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
		return () => {
			if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current)
		}
	}, [])

	const copyValue = useCallback(async (value: string | null | undefined, type: 'link' | 'code') => {
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
			console.warn('[Calibrator] Copy failed:', err)
			setCopyFeedback(null)
		}
	}, [])
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
			// Production safeguard: if we are not on the Render backend host and no env URL is set,
			// prefer the known Render service as a fallback instead of Netlify same-origin.
			const renderWS = `wss://ninedartnation.onrender.com/ws`
			const url = normalizedEnv || (host.endsWith('onrender.com') ? sameOrigin : renderWS)
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
			if (pcRef.current) {
				try { pcRef.current.close() } catch {}
				pcRef.current = null
			}
			updatePairCode(null)
			// Only show alert if it wasn't a clean close
			if (event.code !== 1000) {
				alert('Camera pairing connection lost. Please try pairing again.')
			}
		}
		socket.onmessage = async (ev) => {
			const data = JSON.parse(ev.data)
			if (data.type === 'cam-code') {
				updatePairCode(data.code)
				if (data.expiresAt) setExpiresAt(data.expiresAt)
			} else if (data.type === 'cam-peer-joined') {
				// Ensure we have the latest pairing code even if messages arrive out of order
				if (!pairCodeRef.current && data.code) updatePairCode(data.code)
				setPaired(true)
				// When a phone peer joins, proactively send current calibration (if locked)
				const codeForSession = pairCodeRef.current || data.code || null
				if (codeForSession) pairCodeRef.current = codeForSession
				try {
					if (locked && codeForSession) {
						const imgSize = canvasRef.current ? { w: canvasRef.current.width, h: canvasRef.current.height } : null
						const payload = { H, imageSize: imgSize, errorPx: (errorPx ?? null), createdAt: Date.now() }
						socket.send(JSON.stringify({ type: 'cam-calibration', code: codeForSession, payload }))
						console.log('[Calibrator] Sent calibration to joined phone for code', codeForSession)
					}
				} catch (e) {
					console.warn('[Calibrator] Failed to send calibration on peer join', e)
				}
				const peer = new RTCPeerConnection({ 
					iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
					iceCandidatePoolSize: 10
				})
				pcRef.current = peer
				
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
					if (e.candidate && codeForSession) {
						socket.send(JSON.stringify({ type: 'cam-ice', code: codeForSession, payload: e.candidate }))
					}
				}
				
			peer.ontrack = (ev) => {
				console.log('[Calibrator] WebRTC ontrack received:', ev.streams?.length, 'streams, track kind:', ev.track?.kind)
				if (videoRef.current) {
					const inbound = ev.streams?.[0]
					if (inbound) {
						console.log('[Calibrator] Assigning video stream (tracks:', inbound.getTracks().length, ') to video element')
						// Ensure video element is visible
						setSnapshotSet(false)
						// Use setTimeout to ensure DOM updates before assigning stream
						setTimeout(() => {
							if (videoRef.current) {
										console.log('[Calibrator] Setting srcObject and attempting play')
										videoRef.current.srcObject = inbound
										videoRef.current.muted = true // Ensure muted for autoplay policy
										videoRef.current.playsInline = true // Mobile/iOS support
										videoRef.current.play().then(() => {
											console.log('[Calibrator] Video playback started successfully')
											// Mark that we're streaming from the phone and transition to capture
											setStreaming(true)
											setPhase('capture')
											// Set user settings to reflect that the active camera is the phone
											try { setPreferredCamera(undefined, 'Phone Camera', true) } catch {}
												if (!preferredCameraLocked) {
													try {
														setPreferredCameraLocked(true)
														autoLockRef.current = true
													} catch {}
												}
											try { setCameraEnabled(true) } catch {}
											// If an overlay prompt was shown earlier, hide it now
											setVideoPlayBlocked(false)
										}).catch((err) => {
											console.error('[Calibrator] Video play failed:', err)
											// Show a friendly tap-to-play overlay so user can enable playback
											setVideoPlayBlocked(true)
											console.warn('[Calibrator] video play blocked — prompting user interaction')
										})
							}
						}, 100)
					} else {
						console.error('[Calibrator] No inbound stream received in ontrack')
					}
				} else {
					console.error('[Calibrator] Video element not available')
				}
			}

			try {
				const offer = await peer.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true })
					await peer.setLocalDescription(offer)
					console.log('[Calibrator] Sending cam-offer for code:', codeForSession)
					if (codeForSession) socket.send(JSON.stringify({ type: 'cam-offer', code: codeForSession, payload: offer }))
					else console.warn('[Calibrator] Missing pairing code when sending offer')
			} catch (err) {
					console.error('Failed to create WebRTC offer:', err)
					alert('Failed to establish camera connection. Please try again.')
					stopCamera()
				}
			} else if (data.type === 'cam-answer') {
				console.log('[Calibrator] Received cam-answer')
				const peer = pcRef.current
				if (peer) {
					try {
						await peer.setRemoteDescription(new RTCSessionDescription(data.payload))
						console.log('[Calibrator] Remote description set (answer)')
					} catch (err) {
						console.error('Failed to set remote description:', err)
						alert('Camera pairing failed. Please try again.')
						stopCamera()
					}
				} else {
					console.warn('[Calibrator] Received cam-answer but no peer connection exists')
				}
			} else if (data.type === 'cam-ice') {
				console.log('[Calibrator] Received cam-ice')
				const peer = pcRef.current
				if (peer) {
					try {
						await peer.addIceCandidate(data.payload)
						console.log('[Calibrator] ICE candidate added')
					} catch (err) {
						console.error('Failed to add ICE candidate:', err)
						// Don't alert for ICE candidate errors as they're often non-critical
					}
				} else {
					console.warn('[Calibrator] Received ICE candidate but no peer connection exists')
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
		if (pcRef.current) { try { pcRef.current.close() } catch {}; pcRef.current = null }
		updatePairCode(null)
		setExpiresAt(null)
		setPaired(false)
		setMarkerResult(null)
	    // Unlock preferred camera selection only if we auto-locked it for this session
	    if (autoLockRef.current) {
	    	try { setPreferredCameraLocked(false) } catch {}
	    	autoLockRef.current = false
	    }
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
		try {
			if (!preferredCameraLocked) {
				setPreferredCameraLocked(true)
				autoLockRef.current = true
			} else if (autoLockRef.current) {
				// already auto-locked; keep flag as-is
			} else {
				// Respect existing manual lock; do not mark as auto-managed
			}
		} catch {}
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
				setMarkerResult(null)
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
		setMarkerResult(null)
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
		setMarkerResult(null)
		reset()
	}

	// --- Auto-detect the double rim from the current snapshot and compute homography ---
		async function autoDetectRings() {
		if (!canvasRef.current) return alert('Load a photo or capture a frame first.')
		setMarkerResult(null)
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

			function detectMarkers() {
				if (!canvasRef.current) return alert('Capture a frame or upload a photo first.')
				const result = detectMarkersFromCanvas(canvasRef.current)
				setMarkerResult(result)
				if (!result.success || !result.homography) {
					const missingMsg = result.missing.length
						? ` Missing markers: ${result.missing.map(k => `${k.toUpperCase()} (ID ${MARKER_TARGETS[k]})`).join(', ')}`
						: ''
					alert(result.message ? `${result.message}${missingMsg}` : `Marker detection failed.${missingMsg}`)
					return
				}
				setDetected(null)
				setDstPoints(result.points)
				drawOverlay(result.points, result.homography)
				const src = canonicalRimTargets()
				const imageSize = { w: canvasRef.current.width, h: canvasRef.current.height }
				const shouldLock = (result.errorPx ?? Number.POSITIVE_INFINITY) <= 1.2
				setCalibration({
					H: result.homography as Homography,
					createdAt: Date.now(),
					errorPx: result.errorPx ?? null,
					imageSize,
					anchors: { src, dst: result.points },
					locked: shouldLock ? true : locked,
				})
				setPhase('computed')
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
					// Build a compact calibration payload including current canvas size if available
					const imgSize = canvasRef.current ? { w: canvasRef.current.width, h: canvasRef.current.height } : null
					const bodyStr = JSON.stringify({ H, anchors: null, imageSize: imgSize, errorPx: errorPx ?? null })
					try {
						await apiFetch(`/cam/calibration/${pairCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyStr })
						console.log('[Calibrator] Posted calibration for code', pairCode)
					} catch (err) {
						console.warn('[Calibrator] Upload calibration failed', err)
					}
						// If user is authenticated, persist calibration to their account (Supabase-backed)
						try {
							const token = localStorage.getItem('authToken')
							if (token) {
								await apiFetch('/api/user/calibration', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: bodyStr })
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
						<button
							className="btn btn--ghost px-2 py-0.5 text-xs ml-2"
							onClick={() => {
								autoLockRef.current = false
								setPreferredCameraLocked(!preferredCameraLocked)
							}}
						>
							{preferredCameraLocked ? 'Unlock' : 'Lock'}
						</button>
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
		const showMobileLanding = isMobileDevice && !mobileLandingOverride

		if (showMobileLanding) {
			const linkForMobile = mobileLandingLink ?? (typeof window !== 'undefined' ? `${window.location.origin.replace(/\/$/, '')}/mobile-cam.html` : '/mobile-cam.html')
			return (
				<div className="mx-auto flex min-h-[calc(100vh-140px)] w-full max-w-xl flex-col justify-center gap-6 p-6">
					<div className="space-y-5 rounded-3xl border border-indigo-400/30 bg-slate-900/70 p-6 text-slate-100 shadow-xl">
						<div className="space-y-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Mobile camera</p>
							<h2 className="text-2xl font-semibold leading-tight text-white">This device is ready to stream as your dartboard camera</h2>
							<p className="text-sm text-slate-200/80">
								Open the lightweight mobile camera page to stream video to your desktop calibrator. You can still come back here if you need the full desktop tools.
							</p>
						</div>
						<div className="space-y-2">
							<a
								href={linkForMobile}
								className="btn w-full justify-center px-4 py-2 text-base"
							>
								Open mobile camera
							</a>
							<button
								type="button"
								className="btn btn--ghost w-full justify-center px-4 py-2 text-sm"
								onClick={() => copyValue(linkForMobile, 'link')}
							>
								{copyFeedback === 'link' ? 'Link copied!' : 'Copy link'}
							</button>
						</div>
						<p className="text-xs text-slate-300/70">
							On a desktop, open Calibrator and generate a pairing code. Then tap <span className="font-semibold">Pair with Desktop</span> from the mobile camera page to connect this device.
						</p>
					</div>
					<button
						type="button"
						className="self-center text-xs font-medium text-indigo-200 underline decoration-dotted decoration-indigo-300/70 transition hover:text-indigo-100"
						onClick={() => setMobileLandingOverride(true)}
					>
						Continue to desktop calibrator
					</button>
				</div>
			)
		}

		return (
			<div className="space-y-6">
				{isMobileDevice && mobileLandingOverride && (
					<div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4 text-sm text-indigo-100">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<p className="leading-relaxed">Using a phone? Switch back to the streamlined mobile camera interface for an easier pairing flow.</p>
							<button
								type="button"
								className="btn btn--ghost px-3 py-1 text-xs"
								onClick={() => setMobileLandingOverride(false)}
							>
								Open mobile camera mode
							</button>
						</div>
					</div>
				)}
				<div className="card space-y-6 p-6">
					<header className="flex flex-wrap items-start justify-between gap-4">
						<div className="space-y-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Marker calibration</p>
							<h2 className="text-2xl font-semibold leading-tight text-white">Align your board with the autoscoring overlay</h2>
							<p className="max-w-2xl text-sm opacity-80">
								Place the printable fiducial markers around the double ring, capture a clear frame, and let the calibrator compute a precise homography.
							</p>
						</div>
						<div className="flex flex-col items-end gap-2 text-xs font-medium">
							<span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/50 bg-indigo-500/10 px-3 py-1">
								<span className="opacity-60">Mode</span>
								<span>{mode === 'local' ? 'Desktop camera' : mode === 'phone' ? 'Phone camera' : 'Wifi device'}</span>
							</span>
							<span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${streaming ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100' : 'border-white/20 bg-white/5 text-slate-200'}`}>
								<span className={`h-2 w-2 rounded-full ${streaming ? 'bg-emerald-400' : 'bg-slate-400'}`} />
								{streaming ? 'Live stream active' : 'Stream idle'}
							</span>
							{locked ? (
								<span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-emerald-100">
									<span>Locked • {errorPx != null ? `${errorPx.toFixed(2)}px error` : 'ready'}</span>
								</span>
							) : (
								<span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-100">
									<span>Not locked</span>
									{errorPx != null && <span>• {errorPx.toFixed(2)}px</span>}
								</span>
							)}
						</div>
					</header>

					<section className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5">
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div>
								<h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-200">Marker kit</h3>
								<p className="mt-1 text-sm opacity-80">
									Print the fiducials, tape them flush with the outer double ring, then capture a clear frame before running detection.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<button className="btn px-3 py-1.5" onClick={openMarkerSheet}>Open printable sheet</button>
								<button className="btn btn--ghost px-3 py-1.5" onClick={() => setMarkerResult(null)}>Clear marker status</button>
							</div>
						</div>
						<ol className="mt-3 list-decimal list-inside space-y-2 text-sm opacity-75">
							<li>Print and cut out the four markers. Place them on the top, right, bottom, and left edges of the double ring.</li>
							<li>Start your camera or upload a still frame with the full board visible and the markers unobstructed.</li>
							<li>Run <strong>Auto detect</strong> for circle fitting or <strong>Detect markers</strong> for fiducials, then lock calibration when error ≤ 1.2px.</li>
						</ol>
					</section>

					<div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
						<section className="space-y-4">
							<div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-4">
								<div className="flex flex-wrap items-center justify-between gap-4 text-xs">
									<div className="flex flex-wrap items-center gap-3">
										<span className="uppercase tracking-wide opacity-60">Video source</span>
										<div className="flex items-center gap-1">
											<button
												className={`btn px-3 py-1 ${mode === 'local' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'}`}
												onClick={() => { setMode('local'); stopCamera() }}
												title="Use local camera"
											>
												Local
											</button>
											<button
												className={`btn px-3 py-1 ${mode === 'phone' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'}`}
												onClick={() => { setMode('phone'); stopCamera() }}
												title="Pair phone camera"
											>
												Phone
											</button>
											<button
												className={`btn px-3 py-1 ${mode === 'wifi' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'}`}
												onClick={() => {
													setMode('wifi')
													stopCamera()
													startWifiConnection()
												}}
												title="Discover wifi/USB autoscoring devices"
											>
												Wifi
											</button>
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-3">
										<div className="flex items-center gap-2">
											<span className="opacity-70">Zoom</span>
											<input
												type="range"
												min={50}
												max={200}
												step={5}
												value={Math.round((zoom || 1) * 100)}
												onChange={e => setZoom(Math.max(0.5, Math.min(2, Number(e.target.value) / 100)))}
											/>
											<span className="w-12 text-right">{Math.round((zoom || 1) * 100)}%</span>
										</div>
										<button className="btn px-3 py-1" onClick={() => setZoom(1)}>Actual</button>
									</div>
								</div>

								<div
									className="relative w-full overflow-hidden rounded-2xl border border-indigo-400/30 bg-black"
									style={{ aspectRatio: frameSize ? `${frameSize.w} / ${frameSize.h}` : '16 / 9' }}
								>
									{(!streaming || !paired) && (
										<div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-br from-black/40 to-black/10">
											<DartLoader calibrationComplete={phase === 'computed'} />
										</div>
									)}
									<div className="absolute inset-0" style={{ transform: `scale(${zoom || 1})`, transformOrigin: 'center center' }}>
										<video
											ref={videoRef}
											onLoadedMetadata={(ev) => {
												try {
													const v = ev.currentTarget as HTMLVideoElement
													if (v.videoWidth && v.videoHeight) setFrameSize({ w: v.videoWidth, h: v.videoHeight })
												} catch {}
											}}
											className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${snapshotSet ? 'opacity-0 -z-10' : 'opacity-100 z-10'}`}
											autoPlay
											playsInline
											muted
											controls={false}
										/>
										{videoPlayBlocked && (
											<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur">
												<button
													className="rounded-lg bg-white px-4 py-2 font-semibold text-slate-900 shadow-lg"
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
										<canvas ref={canvasRef} className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${snapshotSet ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`} />
										<canvas ref={overlayRef} onClick={onClickOverlay} className="absolute inset-0 z-30 h-full w-full cursor-crosshair" />
									</div>
								</div>

								<label className="flex items-center gap-2 text-xs">
									<input type="checkbox" className="accent-indigo-600" checked={calibrationGuide} onChange={e => setCalibrationGuide(e.target.checked)} />
									Show preferred-view guide overlay
								</label>
							</div>

							<div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
								<div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
									<div className="uppercase tracking-wide opacity-60">Phase</div>
									<div className="text-sm font-semibold capitalize">{phase}</div>
								</div>
								<div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
									<div className="uppercase tracking-wide opacity-60">Points selected</div>
									<div className="text-sm font-semibold">{dstPoints.length} / 4</div>
								</div>
								<div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
									<div className="uppercase tracking-wide opacity-60">Fit error</div>
									<div className="text-sm font-semibold">{errorPx != null ? `${errorPx.toFixed(2)} px` : '—'}</div>
								</div>
							</div>
						</section>

						<aside className="space-y-4">
							<DevicePicker />

							<section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
								<div>
									<h3 className="text-sm font-semibold">Step 1 · Capture image</h3>
									<p className="text-xs opacity-70">Start your preferred camera or upload a static photo of the board.</p>
								</div>
								<div className="flex flex-wrap gap-2">
									{!streaming ? (
										<>
											{mode === 'local' && <button className="btn" onClick={startCamera}>Start camera</button>}
											{mode === 'phone' && <button className="btn" onClick={startPhonePairing}>Pair phone camera</button>}
											{mode === 'wifi' && <button className="btn" onClick={startWifiConnection}>Connect wifi camera</button>}
										</>
									) : (
										<>
											<button className="btn bg-rose-600 hover:bg-rose-700" onClick={stopCamera}>Stop camera</button>
											<button className="btn" onClick={captureFrame} disabled={!streaming}>Capture frame</button>
										</>
									)}
								</div>
								<div className="flex flex-wrap gap-2">
									<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadPhotoChange} />
									<button className="btn" onClick={triggerUpload}>Upload photo</button>
								</div>
							</section>

							<section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
								<div className="flex items-center justify-between gap-2">
									<div>
										<h3 className="text-sm font-semibold">Step 2 · Detect markers</h3>
										<p className="text-xs opacity-70">Use fiducials or auto-detect to seed the rim points.</p>
									</div>
									<span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${confidence >= 85 ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100' : 'border-white/20 bg-white/5 text-slate-200'}`}>
										<span className="opacity-70">Confidence</span>
										<span>{confidence}%</span>
									</span>
								</div>
								<label className="inline-flex items-center gap-2 text-xs">
									<input type="checkbox" className="accent-indigo-600" checked={liveDetect} onChange={e => setLiveDetect(e.target.checked)} />
									Live auto-detect while streaming
								</label>
								<div className="flex flex-wrap gap-2">
									<button className="btn" disabled={!snapshotSet} onClick={autoDetectRings}>Auto detect</button>
									<button className="btn" disabled={!snapshotSet} onClick={detectMarkers}>Detect markers</button>
								</div>
								{markerResult && (
									<div
										className={`rounded-lg border px-3 py-2 text-xs ${markerResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100' : 'bg-rose-500/10 border-rose-500/30 text-rose-100'}`}
									>
										{markerResult.success ? (
											<div className="space-y-1">
												<div>
													Detected markers → board anchors:{' '}
													{MARKER_ORDER.map((key) => {
														const assignment = markerResult.assignments?.[key]
														return `${key.toUpperCase()}→${assignment ? `ID ${assignment.id}` : '—'}`
													}).join(', ')}
												</div>
												{markerResult.errorPx != null && <div>RMS error: {markerResult.errorPx.toFixed(2)} px</div>}
												<div className="opacity-80">Markers correspond to IDs TOP {MARKER_TARGETS.top}, RIGHT {MARKER_TARGETS.right}, BOTTOM {MARKER_TARGETS.bottom}, LEFT {MARKER_TARGETS.left}.</div>
											</div>
										) : (
											<div className="space-y-1">
												<div>{markerResult.message || 'Unable to detect all markers.'}</div>
												{markerResult.missing.length > 0 && (
													<div>Missing: {markerResult.missing.map(k => `${k.toUpperCase()} (ID ${MARKER_TARGETS[k]})`).join(', ')}</div>
												)}
											</div>
										)}
									</div>
								)}
							</section>

							<section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
								<div>
									<h3 className="text-sm font-semibold">Step 3 · Align & lock</h3>
									<p className="text-xs opacity-70">Click points in TOP → RIGHT → BOTTOM → LEFT order, refine edges, then lock the calibration.</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<button className="btn" disabled={dstPoints.length !== 4} onClick={compute}>Compute</button>
									<button className={`btn ${locked ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`} onClick={() => setCalibration({ locked: !locked })}>
										{locked ? 'Unlock' : 'Lock in'}
									</button>
								</div>
								{locked && (
									<div className="text-xs opacity-75">
										Calibration saved {errorPx != null ? `· error ${errorPx.toFixed(2)} px` : ''}
									</div>
								)}
								<div className="flex flex-wrap gap-2">
									<button className="btn" disabled={dstPoints.length === 0} onClick={undoPoint}>Undo</button>
									<button className="btn" disabled={dstPoints.length === 0} onClick={refinePoints}>Refine points</button>
									<button className="btn" onClick={resetAll}>Reset</button>
								</div>
							</section>
						</aside>
					</div>

					{mode === 'phone' && !streaming && (
						<div className="space-y-2 rounded-2xl border border-indigo-400/30 bg-black/40 p-4 text-xs text-white">
							<div className="font-semibold">Phone pairing</div>
							<button
								type="button"
								className="w-full text-left px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center gap-2"
								onClick={() => copyValue(mobileUrl, 'link')}
								title="Copy mobile camera link"
							>
								<span className="flex-1 min-w-0 font-mono break-all text-[11px]">{mobileUrl}</span>
								<span className="text-[10px] uppercase tracking-wide whitespace-nowrap text-emerald-200">{copyFeedback === 'link' ? 'Copied!' : 'Copy link'}</span>
							</button>
							<div className="flex items-center gap-2 text-[11px]">
								<a href={mobileUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted text-indigo-200 hover:text-indigo-100 transition">
									Open link in new tab
								</a>
							</div>
							<div className="opacity-80">
								WS: {ws ? (ws.readyState === 1 ? 'open' : ws.readyState === 0 ? 'connecting' : ws.readyState === 2 ? 'closing' : 'closed') : 'not started'} · {httpsInfo?.https ? 'HTTPS on' : 'HTTP only'}
							</div>
							{pairCode && (
								<button
									type="button"
									className="w-full text-left px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-between gap-2"
									onClick={() => copyValue(pairCode, 'code')}
									title="Copy pairing code"
								>
									<span className="font-mono tracking-[0.3em] text-sm">{pairCode}</span>
									<span className="text-[10px] uppercase tracking-wide whitespace-nowrap text-emerald-200">{copyFeedback === 'code' ? 'Copied!' : 'Copy code'}</span>
								</button>
							)}
							{qrDataUrl && <img className="mt-1 h-40 w-40 rounded bg-white" alt="Scan to open" src={qrDataUrl} />}
							<div className="flex items-center gap-2">
								{ttl !== null && <span>Expires in {ttl}s</span>}
								<button className="btn px-2 py-1 text-xs" onClick={regenerateCode}>Regenerate</button>
							</div>
							{showTips && (
								<div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 text-slate-200">
									<div className="font-semibold">Troubleshooting</div>
									<ul className="list-disc space-y-1 pl-4">
										<li>Phone and desktop must be on the same Wi‑Fi network.</li>
										<li>Allow the server through your firewall (ports 8787 and {httpsInfo?.https ? httpsInfo.port : 8788}).</li>
										<li>On iPhone, use HTTPS links (QR will prefer HTTPS when enabled).</li>
									</ul>
									<div className="text-right">
										<button className="btn btn--ghost px-2 py-1 text-xs" onClick={() => setShowTips(false)}>Hide tips</button>
									</div>
								</div>
							)}
						</div>
					)}

					{mode === 'wifi' && !streaming && (
						<div className="space-y-3 rounded-2xl border border-indigo-400/30 bg-black/40 p-4 text-xs text-white">
							<div className="font-semibold">Wifi scoring devices</div>
							{discoveringWifi ? (
								<div className="flex items-center gap-2">
									<div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
									<span>Scanning network for devices…</span>
								</div>
							) : wifiDevices.length > 0 ? (
								<div className="space-y-2">
									{wifiDevices.map(device => (
										<div key={device.id} className="flex items-center justify-between rounded border border-slate-700/50 bg-slate-900/60 p-2">
											<div>
												<div className="font-medium">{device.name}</div>
												<div className="opacity-70">{device.ip}:{device.port} · {device.type.toUpperCase()}</div>
												<div className="opacity-70 text-xs">Capabilities: {device.capabilities.join(', ')}</div>
											</div>
											<button
												className={`btn px-2 py-1 text-xs ${device.status === 'connecting' ? 'bg-yellow-600' : device.status === 'online' ? 'bg-green-600' : 'bg-blue-600'}`}
												onClick={() => connectToWifiDevice(device)}
												disabled={device.status === 'connecting'}
											>
												{device.status === 'connecting' ? 'Connecting…' : 'Connect'}
											</button>
										</div>
									))}
									<div className="text-center">
										<button className="btn px-2 py-1 text-xs" onClick={startWifiConnection}>Rescan network</button>
									</div>
								</div>
							) : (
								<div className="space-y-2 text-center">
									<div>No wifi scoring devices found.</div>
									<div className="opacity-70">Ensure your wifi cameras are powered on and on the same network.</div>
									<button className="btn px-2 py-1 text-xs" onClick={startWifiConnection}>Scan again</button>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		)
}
