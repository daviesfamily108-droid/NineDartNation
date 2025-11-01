import { useEffect, useRef } from 'react'
import { useCameraSession } from '../store/cameraSession'

/**
 * GlobalPhoneVideoSink
 * Keeps a hidden video element alive across navigation and feeds it the phone camera stream
 * so other components (overlay, badge) can draw frames even when Calibrator unmounts.
 */
export default function GlobalPhoneVideoSink() {
  const camera = useCameraSession()
  const vref = useRef<HTMLVideoElement | null>(null)
  const lastStreamRef = useRef<MediaStream | null>(null)

  // Ensure the global ref is registered for others to use
  useEffect(() => {
    if (vref.current) {
      camera.setVideoElementRef(vref.current)
    }
  }, [camera])

  // Apply the current stream and keep it playing
  useEffect(() => {
    let mounted = true

    const apply = async () => {
      if (!mounted) return
      try {
        const s = camera.getMediaStream()
        const vid = vref.current
        if (!vid || !s) return
        if (lastStreamRef.current !== s || vid.srcObject !== s) {
          vid.srcObject = s
          lastStreamRef.current = s
        }
        vid.muted = true
        ;(vid as any).playsInline = true
        try { await vid.play() } catch {}
      } catch {}
    }

    // Try immediately and then poll a bit to catch late streams
    apply()
    const t = setInterval(apply, 750)
    return () => { mounted = false; clearInterval(t) }
  }, [camera])

  // Keep dimensions tiny but visible so playback isn't throttled by display:none in some browsers
  return (
    <video
      ref={vref}
      style={{ position: 'fixed', width: 1, height: 1, left: -9999, top: -9999, opacity: 0 }}
      muted
      playsInline
      aria-hidden
    />
  )
}
