// Pure re-export of the canonical Calibrator component
export { default } from '../../../../../src/components/Calibrator'

// Intentionally a re-export to avoid duplicate implementations in nested app trees.
// Re-export canonical Calibrator to centralize implementation
export { default } from '../../../../../src/components/Calibrator'
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

	// Removed automatic phone pairing effect. Only pair on explicit user action.
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
			// Re-export canonical Calibrator to centralize implementation
			export { default } from '../../../../../src/components/Calibrator'
		socket.onmessage = async (ev) => {
