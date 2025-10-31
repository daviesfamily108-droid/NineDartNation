import React, { useEffect, useRef, useState } from 'react'
import { useCameraSession } from '../store/cameraSession'

/**
 * PhoneCameraOverlay - Displays the phone camera stream in a floating preview
 * when user has paired phone camera and is navigated to Online/Offline/Tournament modes
 * 
 * Shows a draggable, resizable canvas that mirrors frames from the Calibrator's video element
 */
export default function PhoneCameraOverlay() {
	const cameraSession = useCameraSession()
	const [position, setPosition] = useState({ x: 20, y: 20 })
	const [dragging, setDragging] = useState(false)
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
	const [minimized, setMinimized] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const animationFrameRef = useRef<number | null>(null)

	// Don't show preview if:
	// - Camera session not streaming
	// - Or no video element available
	// - Or mode is not 'phone'
	const shouldShow = cameraSession.isStreaming && cameraSession.mode === 'phone' && cameraSession.videoElementRef

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

		const sourceVideo = cameraSession.videoElementRef

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
	}, [shouldShow, minimized, cameraSession.videoElementRef])

	if (!shouldShow) {
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
				<button
					onClick={() => setMinimized(!minimized)}
					className="text-white hover:bg-blue-800 px-2 py-0.5 rounded text-xs font-bold transition-colors"
					title={minimized ? 'Expand' : 'Minimize'}
				>
					{minimized ? '▶' : '▼'}
				</button>
			</div>

			{/* Canvas content - hidden when minimized */}
			{!minimized && (
				<div className="bg-black w-full relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
					<canvas
						ref={canvasRef}
						className="w-full h-full object-contain bg-black"
					/>
				</div>
			)}
		</div>
	)
}
