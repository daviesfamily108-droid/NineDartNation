import { useRef, useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface FloatingCameraPreviewProps {
  visible: boolean
  onClose: () => void
  videoStream?: MediaStream | null
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  size?: 'small' | 'medium' | 'large'
}

export default function FloatingCameraPreview({
  visible,
  onClose,
  videoStream,
  position = 'bottom-right',
  size = 'small',
}: FloatingCameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [positionState, setPositionState] = useState(position)

  useEffect(() => {
    if (!visible || !videoRef.current) return

    // If we have a video stream passed in, use it
    if (videoStream && videoRef.current.srcObject !== videoStream) {
      videoRef.current.srcObject = videoStream
      videoRef.current.play().catch(() => console.warn('Failed to auto-play preview'))
    }
  }, [visible, videoStream])

  const sizeClasses = {
    small: 'w-48 h-36',
    medium: 'w-80 h-60',
    large: 'w-full h-96',
  }

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-20 right-4',
    'top-left': 'top-20 left-4',
  }

  if (!visible) return null

  return (
    <div
      className={`fixed ${positionClasses[positionState]} ${sizeClasses[size]} bg-black rounded-lg border border-emerald-400/50 shadow-2xl z-50 flex flex-col group cursor-move`}
      draggable
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
    >
      {/* Header */}
      <div className="bg-black/80 px-3 py-2 border-b border-emerald-400/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs font-semibold text-emerald-100">Phone Camera Live</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
          title="Close preview"
        >
          <X className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        className="flex-1 w-full h-full object-cover rounded-b-lg bg-black"
        autoPlay
        muted
        playsInline
        webkit-playsinline="true"
      />

      {/* Status overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
        <div className="bg-black/60 px-3 py-1 rounded text-xs text-emerald-100">
          📱 Drag to move
        </div>
      </div>
    </div>
  )
}
