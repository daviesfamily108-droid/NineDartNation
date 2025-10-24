// Re-export canonical Calibrator to centralize implementation
export { default } from '../../../../src/components/Calibrator'
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
		// Re-export canonical Calibrator to centralize implementation
		export { default } from '../../../../src/components/Calibrator'
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
