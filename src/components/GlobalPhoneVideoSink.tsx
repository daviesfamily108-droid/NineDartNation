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
  const lastTimeRef = useRef<number>(0)
  const stallSecondsRef = useRef<number>(0)
  const lastReconnectAtRef = useRef<number>(0)
  const attemptRef = useRef<number>(0)

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

  // Watchdog: if the video currentTime doesn't advance for >3s while streaming, request a reconnect with backoff
  useEffect(() => {
    const tick = () => {
      const v = vref.current
      const now = Date.now()
      if (!v || !camera.isStreaming || camera.mode !== 'phone' || !v.srcObject) {
        stallSecondsRef.current = 0
        return
      }
      const ct = (v as HTMLVideoElement).currentTime || 0
      if (!Number.isFinite(ct)) return
      if (ct === lastTimeRef.current) {
        stallSecondsRef.current += 1
      } else {
        stallSecondsRef.current = 0
      }
      lastTimeRef.current = ct
      if (stallSecondsRef.current >= 3) {
        const minBackoff = [3000, 6000, 10000][Math.min(attemptRef.current, 2)]
        if (now - lastReconnectAtRef.current >= minBackoff) {
          lastReconnectAtRef.current = now
          attemptRef.current = Math.min(attemptRef.current + 1, 3)
          try {
            window.dispatchEvent(new CustomEvent('ndn:phone-camera-reconnect', { detail: { reason: 'stall', ts: now } }))
            // Try to nudge playback locally as well
            v.play().catch(()=>{})
          } catch {}
        }
      } else if (stallSecondsRef.current === 0) {
        // Reset attempts on healthy playback
        attemptRef.current = 0
      }
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
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
