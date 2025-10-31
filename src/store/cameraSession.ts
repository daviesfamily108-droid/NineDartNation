import { create } from 'zustand'

export type CameraStreamMode = 'local' | 'phone' | 'wifi'

// Separate ref holder (not in Zustand state) to avoid serialization issues
let videoElementRefHolder: HTMLVideoElement | null = null

type CameraSessionState = {
  // Stream state - persists across navigation
  isStreaming: boolean
  mode: CameraStreamMode
  pairingCode: string | null
  expiresAt: number | null
  isPaired: boolean
  mobileUrl: string | null
  
  // Shared media stream reference (DOM element kept in separate ref to avoid Zustand serialization)
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
  setMediaStream: (stream: MediaStream | null) => void
  setPcRef: (pc: RTCPeerConnection | null) => void
  setWsRef: (ws: WebSocket | null) => void
  
  // Get video element ref (not stored in state to avoid serialization)
  getVideoElementRef: () => HTMLVideoElement | null
  setVideoElementRef: (ref: HTMLVideoElement | null) => void
  
  // Clear session when user stops camera
  clearSession: () => void
}

export const useCameraSession = create<CameraSessionState>((set, get) => ({
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
  setMediaStream: (stream) => set({ mediaStream: stream }),
  setPcRef: (pc) => set({ pcRef: pc }),
  setWsRef: (ws) => set({ wsRef: ws }),
  
  // Keep video element ref outside of state to avoid serialization issues
  getVideoElementRef: () => videoElementRefHolder,
  setVideoElementRef: (ref) => {
    videoElementRefHolder = ref
  },
  
  clearSession: () => {
    videoElementRefHolder = null
    set({
      isStreaming: false,
      pairingCode: null,
      expiresAt: null,
      isPaired: false,
      mobileUrl: null,
      mediaStream: null,
      pcRef: null,
      wsRef: null,
    })
  },
}))
