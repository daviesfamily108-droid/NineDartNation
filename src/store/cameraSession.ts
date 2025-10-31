import { create } from 'zustand'

export type CameraStreamMode = 'local' | 'phone' | 'wifi'

type CameraSessionState = {
  // Stream state - persists across navigation
  isStreaming: boolean
  mode: CameraStreamMode
  pairingCode: string | null
  expiresAt: number | null
  isPaired: boolean
  mobileUrl: string | null
  
  // Shared video element - Calibrator renders video, other components read srcObject
  videoElementRef: HTMLVideoElement | null
  mediaStream: MediaStream | null
  
  // WebRTC connection reference
  pcRef: RTCPeerConnection | null
  wsRef: WebSocket | null
  
  // Actions
  setStreaming: (streaming: boolean) => void
  setMode: (mode: CameraStreamMode) => void
  setPairingCode: (code: string | null) => void
  setExpiresAt: (time: number | null) => void
  setPaired: (paired: boolean) => void
  setMobileUrl: (url: string | null) => void
  setVideoElementRef: (ref: HTMLVideoElement | null) => void
  setMediaStream: (stream: MediaStream | null) => void
  setPcRef: (pc: RTCPeerConnection | null) => void
  setWsRef: (ws: WebSocket | null) => void
  
  // Clear session when user stops camera
  clearSession: () => void
}

export const useCameraSession = create<CameraSessionState>((set) => ({
  isStreaming: false,
  mode: (() => {
    try {
      return (localStorage.getItem('ndn:cal:mode') as CameraStreamMode) || 'local'
    } catch {
      return 'local'
    }
  })(),
  pairingCode: null,
  expiresAt: null,
  isPaired: false,
  mobileUrl: null,
  videoElementRef: null,
  mediaStream: null,
  pcRef: null,
  wsRef: null,
  
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setMode: (mode) => {
    try {
      localStorage.setItem('ndn:cal:mode', mode)
    } catch {}
    set({ mode })
  },
  setPairingCode: (code) => set({ pairingCode: code }),
  setExpiresAt: (time) => set({ expiresAt: time }),
  setPaired: (paired) => set({ isPaired: paired }),
  setMobileUrl: (url) => set({ mobileUrl: url }),
  setVideoElementRef: (ref) => set({ videoElementRef: ref }),
  setMediaStream: (stream) => set({ mediaStream: stream }),
  setPcRef: (pc) => set({ pcRef: pc }),
  setWsRef: (ws) => set({ wsRef: ws }),
  
  clearSession: () => set({
    isStreaming: false,
    pairingCode: null,
    expiresAt: null,
    isPaired: false,
    mobileUrl: null,
    videoElementRef: null,
    mediaStream: null,
    pcRef: null,
    wsRef: null,
  }),
}))
