import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type CameraStreamMode = 'local' | 'phone' | 'wifi'

// CRITICAL: All non-serializable objects kept OUTSIDE state to avoid React #185 error
// These must NOT be in Zustand state, even though we set them there momentarily
let videoElementRefHolder: HTMLVideoElement | null = null
let mediaStreamRefHolder: MediaStream | null = null
let pcRefHolder: RTCPeerConnection | null = null
let wsRefHolder: WebSocket | null = null

type CameraSessionState = {
  // Stream state - persists across navigation (ONLY serializable data)
  isStreaming: boolean
  mode: CameraStreamMode
  pairingCode: string | null
  expiresAt: number | null
  isPaired: boolean
  mobileUrl: string | null
  
  // Actions
  setStreaming: (streaming: boolean) => void
  setMode: (mode: CameraStreamMode) => void
  setPairingCode: (code: string | null) => void
  setExpiresAt: (time: number | null) => void
  setPaired: (paired: boolean) => void
  setMobileUrl: (url: string | null) => void
  
  // Methods for managing non-serializable refs (not in state)
  setMediaStream: (stream: MediaStream | null) => void
  getMediaStream: () => MediaStream | null
  setPcRef: (pc: RTCPeerConnection | null) => void
  getPcRef: () => RTCPeerConnection | null
  setWsRef: (ws: WebSocket | null) => void
  getWsRef: () => WebSocket | null
  
  // Get video element ref (not stored in state to avoid serialization)
  getVideoElementRef: () => HTMLVideoElement | null
  setVideoElementRef: (ref: HTMLVideoElement | null) => void
  
  // Clear session when user stops camera
  clearSession: () => void
}

export const useCameraSession = create<CameraSessionState>()(persist((set, get) => ({
  isStreaming: false,
  mode: 'local',
  pairingCode: null,
  expiresAt: null,
  isPaired: false,
  mobileUrl: null,
  
  setStreaming: (streaming) => {
    console.log('[CAMERA_SESSION] setStreaming:', streaming)
    set({ isStreaming: streaming })
  },
  setMode: (mode) => {
    console.log('[CAMERA_SESSION] setMode:', mode)
    set({ mode })
  },
  setPairingCode: (code) => set({ pairingCode: code }),
  setExpiresAt: (time) => set({ expiresAt: time }),
  setPaired: (paired) => set({ isPaired: paired }),
  setMobileUrl: (url) => set({ mobileUrl: url }),
  
  // Non-serializable refs stored outside state
  setMediaStream: (stream) => {
    mediaStreamRefHolder = stream
  },
  getMediaStream: () => mediaStreamRefHolder,
  
  setPcRef: (pc) => {
    pcRefHolder = pc
  },
  getPcRef: () => pcRefHolder,
  
  setWsRef: (ws) => {
    wsRefHolder = ws
  },
  getWsRef: () => wsRefHolder,
  
  // Keep video element ref outside of state to avoid serialization issues
  getVideoElementRef: () => videoElementRefHolder,
  setVideoElementRef: (ref) => {
    videoElementRefHolder = ref
  },
  
  clearSession: () => {
    videoElementRefHolder = null
    mediaStreamRefHolder = null
    pcRefHolder = null
    wsRefHolder = null
    set({
      isStreaming: false,
      pairingCode: null,
      expiresAt: null,
      isPaired: false,
      mobileUrl: null,
    })
  },
}), {
  name: 'ndn-camera-session',
  storage: createJSONStorage(() => localStorage),
  // ONLY persist serializable primitives
  partialize: (state) => ({
    isStreaming: state.isStreaming,
    mode: state.mode,
    pairingCode: state.pairingCode,
    expiresAt: state.expiresAt,
    isPaired: state.isPaired,
    mobileUrl: state.mobileUrl,
  }),
}))
