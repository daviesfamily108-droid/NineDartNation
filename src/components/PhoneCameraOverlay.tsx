import React, { useEffect, useRef, useState } from 'react'
import { useCameraSession } from '../store/cameraSession'

/**
 * PhoneCameraOverlay - Displays the phone camera stream in a floating preview
 * when user has paired phone camera and is navigated to Online/Offline/Tournament modes
 * 
 * Shows a draggable, resizable canvas that mirrors frames from the Calibrator's video element
 * Includes refresh button to force canvas redraw and reconnect button to restart camera
 */
export default function PhoneCameraOverlay() {
	const cameraSession = useCameraSession()
	const [hasHydrated, setHasHydrated] = useState(false)
	const [position, setPosition] = useState({ x: 20, y: 20 })
	const [dragging, setDragging] = useState(false)
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
	const [minimized, setMinimized] = useState(false)
	const [showControls, setShowControls] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [isReconnecting, setIsReconnecting] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const animationFrameRef = useRef<number | null>(null)

	// Wait for Zustand hydration before checking conditions
	useEffect(() => {
		const unsubscribe = useCameraSession.persist?.onFinishHydration?.(() => {
			console.log('[PhoneCameraOverlay] Zustand hydration complete')
			setHasHydrated(true)
		})
		setHasHydrated(true) // Also set immediately in case hydration already happened
		return () => {
			if (unsubscribe && typeof unsubscribe === 'function') {
				unsubscribe()
			}
		}
	}, [])

	// Don't show preview if:
	// - Camera session not streaming
	// - Or no video element available
	// - Or mode is not 'phone'
	const videoElement = cameraSession.getVideoElementRef()
	// Consider the stream "available" if we have a video element with a srcObject or readyState indicates data
	const hasLiveVideo = !!(videoElement && ((videoElement as any).srcObject || (videoElement as any).readyState >= 2))
	// Be resilient: show when user wants overlay, in phone mode, and we either think streaming is on OR we detect a live video element
	const shouldShow = cameraSession.showOverlay && cameraSession.mode === 'phone' && (cameraSession.isStreaming || hasLiveVideo) && !!videoElement

	// Log to help debug black screen issue
	useEffect(() => {
		console.log('[PhoneCameraOverlay] Render check:', {
			hasHydrated,
			isStreaming: cameraSession.isStreaming,
			mode: cameraSession.mode,
			hasVideoElement: !!videoElement,
			hasLiveVideo,
			videoElementType: videoElement?.constructor?.name,
			shouldShow,
			minimized
		})
		
		if (!shouldShow) {
			console.warn('[PhoneCameraOverlay] NOT SHOWING - At least one condition failed')
		} else {
			console.log('[PhoneCameraOverlay] ✓ ALL CONDITIONS MET - Should display camera overlay')
		}
	}, [shouldShow, cameraSession.isStreaming, cameraSession.mode, cameraSession.showOverlay, videoElement, hasHydrated])

	// Render video frames to canvas
	useEffect(() => {
		if (!shouldShow || !canvasRef.current || minimized) {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
			return
		}

		const canvas = canvasRef.current
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const sourceVideo = cameraSession.getVideoElementRef()

		const renderFrame = () => {
			if (sourceVideo && ctx) {
				// Set canvas to match video dimensions on first frame
				if (canvas.width === 0 || canvas.height === 0) {
					if (sourceVideo.videoWidth && sourceVideo.videoHeight) {
						canvas.width = sourceVideo.videoWidth
						canvas.height = sourceVideo.videoHeight
					} else {
						// Assume 16:9 if not available yet
						canvas.width = 640
						canvas.height = 360
					}
				}

				// Draw current video frame to canvas
				try {
					ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height)
				} catch (e) {
					// Ignore CORS or security errors
					console.debug('[PhoneCameraOverlay] Canvas render frame error (expected during stream setup):', e)
				}
			}
			animationFrameRef.current = requestAnimationFrame(renderFrame)
		}

		animationFrameRef.current = requestAnimationFrame(renderFrame)

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
		}
	}, [shouldShow, minimized])

	// Listen for global toggle event from header badge (must be before any early returns)
	useEffect(() => {
		const handler = () => {
			try { cameraSession.setShowOverlay(!cameraSession.showOverlay) } catch {}
		}
		window.addEventListener('ndn:toggle-phone-overlay', handler)
		return () => { window.removeEventListener('ndn:toggle-phone-overlay', handler) }
	}, [cameraSession.showOverlay])

	if (!shouldShow) {
		// DEBUG: Show why we're not displaying
		console.warn('[PhoneCameraOverlay] DEBUG: Not showing. State:', {
			isStreaming: cameraSession.isStreaming,
			mode: cameraSession.mode,
			videoElement: !!videoElement,
			hasHydrated,
		})
		// Hide overlay when not eligible
		return null
	}

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		// Only drag from header
		if ((e.target as HTMLElement).classList.contains('phone-camera-header')) {
			setDragging(true)
			setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
		}
	}

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (dragging) {
			setPosition({
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y,
			})
		}
	}

	const handleMouseUp = () => {
		setDragging(false)
	}

	const handleRefresh = async () => {
		setIsRefreshing(true)
		try {
			// Force canvas redraw by clearing and requesting new frame
			if (canvasRef.current) {
				const ctx = canvasRef.current.getContext('2d')
				if (ctx) {
					// Clear canvas
					ctx.fillStyle = '#000000'
					ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
					// Draw current frame immediately
					const sourceVideo = cameraSession.getVideoElementRef()
					if (sourceVideo && canvasRef.current.width > 0) {
						ctx.drawImage(sourceVideo, 0, 0, canvasRef.current.width, canvasRef.current.height)
					}
				}
			}
			console.log('[PhoneCameraOverlay] Camera refreshed')
		} catch (e) {
			console.error('[PhoneCameraOverlay] Refresh failed:', e)
		} finally {
			setIsRefreshing(false)
		}
	}

	const handleReconnect = () => {
		setIsReconnecting(true)
		try {
			// Signal Calibrator to restart phone pairing
			// Dispatch event that Calibrator can listen to
			window.dispatchEvent(new CustomEvent('ndn:phone-camera-reconnect', { 
				detail: { timestamp: Date.now() } 
			}))
			console.log('[PhoneCameraOverlay] Reconnect requested')
			
			// After a moment, stop the refreshing state
			setTimeout(() => {
				setIsReconnecting(false)
			}, 1000)
		} catch (e) {
			console.error('[PhoneCameraOverlay] Reconnect failed:', e)
			setIsReconnecting(false)
		}
	}



	return (
		<div
			ref={containerRef}
			className="fixed z-40 bg-black rounded-lg shadow-xl overflow-hidden border border-blue-500"
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
				width: minimized ? '160px' : '320px',
				transition: dragging ? 'none' : 'all 0.2s ease-out',
				cursor: dragging ? 'grabbing' : 'grab',
				boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
			}}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
		>
			{/* Header - draggable */}
			<div
				className="phone-camera-header bg-gradient-to-r from-blue-600 to-blue-700 px-2 py-1 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
				onMouseDown={handleMouseDown}
			>
				<div className="flex items-center gap-2">
					<div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
					<span className="text-xs font-semibold text-white">Phone Camera</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						onClick={() => setShowControls(!showControls)}
						className="text-white hover:bg-blue-800 px-1.5 py-0.5 rounded text-xs font-bold transition-colors"
						title="Show controls"
					>
						⚙
					</button>
					<button
						onClick={() => setMinimized(!minimized)}
						className="text-white hover:bg-blue-800 px-2 py-0.5 rounded text-xs font-bold transition-colors"
						title={minimized ? 'Expand' : 'Minimize'}
					>
						{minimized ? '▶' : '▼'}
					</button>
				</div>
			</div>

			{/* Control buttons - shown when showControls is true and not minimized */}
			{!minimized && showControls && (
				<div className="bg-slate-800 border-t border-blue-500 px-2 py-2 flex gap-1">
					<button
						onClick={handleRefresh}
						disabled={isRefreshing}
						className={`flex-1 text-xs py-1 px-2 rounded font-semibold transition-colors ${
							isRefreshing
								? 'bg-blue-500/50 text-white cursor-wait'
								: 'bg-blue-600 hover:bg-blue-700 text-white'
						}`}
						title="Refresh camera feed"
					>
						{isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
					</button>
					<button
						onClick={handleReconnect}
						disabled={isReconnecting}
						className={`flex-1 text-xs py-1 px-2 rounded font-semibold transition-colors ${
							isReconnecting
								? 'bg-amber-500/50 text-white cursor-wait'
								: 'bg-amber-600 hover:bg-amber-700 text-white'
						}`}
						title="Reconnect phone camera"
					>
						{isReconnecting ? '⟳ Reconnecting...' : '⟳ Reconnect'}
					</button>
				</div>
			)}

			{/* Canvas content - hidden when minimized */}
			{!minimized && (
				<div className="bg-black w-full relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
					<canvas
						ref={canvasRef}
						// Use object-cover to eliminate any letterboxing in the floating preview
						className="w-full h-full object-cover bg-black"
					/>
				</div>
			)}
		</div>
	)
}
