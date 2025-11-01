import { useEffect, useRef } from 'react'
import { useCameraSession } from '../store/cameraSession'

// GlobalCameraLogger: attaches to the camera session and emits detailed logs
// about video element, media stream, and peer connection state so logs are
// visible even when navigating away from Calibrator.
export default function GlobalCameraLogger() {
  const camera = useCameraSession()
  const lastStateRef = useRef<any>({})
  const listenersRef = useRef<any>({})

  useEffect(() => {
    function dumpState(prefix = '[GlobalCamera]') {
      try {
        const video = camera.getVideoElementRef()
        const media = camera.getMediaStream()
        const pc = camera.getPcRef && camera.getPcRef()
        const ws = camera.getWsRef && camera.getWsRef()
        console.log(prefix, {
          isStreaming: camera.isStreaming,
          mode: camera.mode,
          showOverlay: camera.showOverlay,
          hasVideoElement: !!video,
          video: video ? { videoWidth: video.videoWidth, videoHeight: video.videoHeight, srcObject: !!video.srcObject } : null,
          mediaTracks: media ? media.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id })) : null,
          pcState: pc ? pc.connectionState || pc.iceConnectionState : null,
          wsState: ws ? (ws.readyState || 'unknown') : null
        })
      } catch (e) { console.warn('[GlobalCamera] dumpState failed', e) }
    }

    // Initial dump
    dumpState('[GlobalCamera] INIT')

    // Subscribe to Zustand changes by polling minimal differences (safe & simple)
    let mounted = true
    const interval = setInterval(() => {
      if (!mounted) return
      try {
        const video = camera.getVideoElementRef()
        const media = camera.getMediaStream()
        const pc = camera.getPcRef && camera.getPcRef()
        const snapshot = {
          isStreaming: camera.isStreaming,
          mode: camera.mode,
          hasVideo: !!video,
          videoW: video ? video.videoWidth : 0,
          videoH: video ? video.videoHeight : 0,
          tracks: media ? media.getTracks().length : 0,
          pcState: pc ? pc.connectionState || pc.iceConnectionState : null
        }
        const prev = lastStateRef.current
        // Shallow compare a few keys
        if (
          snapshot.isStreaming !== prev.isStreaming ||
          snapshot.hasVideo !== prev.hasVideo ||
          snapshot.videoW !== prev.videoW ||
          snapshot.videoH !== prev.videoH ||
          snapshot.tracks !== prev.tracks ||
          snapshot.pcState !== prev.pcState ||
          camera.showOverlay !== prev.showOverlay
        ) {
          lastStateRef.current = snapshot
          dumpState('[GlobalCamera] CHANGE')
        }
      } catch (e) { console.warn('[GlobalCamera] poll failed', e) }
    }, 750)

    // Attach video element listeners when available to capture events like loadedmetadata/playing
    function attachVideoListeners(v: HTMLVideoElement | null) {
      try {
        const prev = listenersRef.current.video
        if (prev && prev.el === v) return
        if (prev && prev.el) {
          try { prev.el.removeEventListener('loadedmetadata', prev.loadedmetadata) } catch {}
          try { prev.el.removeEventListener('playing', prev.playing) } catch {}
          try { prev.el.removeEventListener('pause', prev.pause) } catch {}
          try { prev.el.removeEventListener('ended', prev.ended) } catch {}
        }
        listenersRef.current.video = null
        if (v) {
          const loadedmetadata = () => console.log('[GlobalCamera] video loadedmetadata', { videoWidth: v.videoWidth, videoHeight: v.videoHeight })
          const playing = () => {
            console.log('[GlobalCamera] video playing', { paused: v.paused })
            try { camera.setStreaming(true) } catch {}
          }
          const pause = () => {
            console.log('[GlobalCamera] video pause')
            try { camera.setStreaming(false) } catch {}
          }
          const ended = () => {
            console.log('[GlobalCamera] video ended')
            try { camera.setStreaming(false) } catch {}
          }
          v.addEventListener('loadedmetadata', loadedmetadata)
          v.addEventListener('playing', playing)
          v.addEventListener('pause', pause)
          v.addEventListener('ended', ended)
          listenersRef.current.video = { el: v, loadedmetadata, playing, pause, ended }
        }
      } catch (e) { console.warn('[GlobalCamera] attachVideoListeners failed', e) }
    }

    // Watch for PC state changes if RTCPeerConnection is present
    function attachPc(pc: RTCPeerConnection | null) {
      try {
        const prev = listenersRef.current.pc
        if (prev && prev.pc === pc) return
        if (prev && prev.pc) {
          try { prev.pc.removeEventListener('connectionstatechange', prev.connChange) } catch {}
        }
        listenersRef.current.pc = null
        if (pc) {
          const connChange = () => console.log('[GlobalCamera] pc state change', { connectionState: pc.connectionState, iceState: (pc as any).iceConnectionState })
          pc.addEventListener('connectionstatechange', connChange)
          listenersRef.current.pc = { pc, connChange }
        }
      } catch (e) { console.warn('[GlobalCamera] attachPc failed', e) }
    }

    // Periodically re-attach listeners if refs change
    const attachInterval = setInterval(() => {
      try {
        attachVideoListeners(camera.getVideoElementRef())
        attachPc(camera.getPcRef && camera.getPcRef())
      } catch (e) {}
    }, 1000)

    return () => {
      mounted = false
      clearInterval(interval)
      clearInterval(attachInterval)
      // cleanup listeners
      try {
        const v = listenersRef.current.video
        if (v && v.el) {
          v.el.removeEventListener('loadedmetadata', v.loadedmetadata)
          v.el.removeEventListener('playing', v.playing)
        }
      } catch (e) {}
      try {
        const p = listenersRef.current.pc
        if (p && p.pc) p.pc.removeEventListener('connectionstatechange', p.connChange)
      } catch (e) {}
    }
  }, [camera])

  return null
}
