import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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

export const useCameraSession = create<CameraSessionState>()(persist((set, get) => ({
  isStreaming: false,
  mode: 'local',
  pairingCode: null,
  expiresAt: null,
  isPaired: false,
  mobileUrl: null,
  mediaStream: null,
  pcRef: null,
  wsRef: null,
  
  setStreaming: (streaming) => {
    console.log('[CAMERA_SESSION] setStreaming:', streaming, 'current mode:', get().mode)
    set({ isStreaming: streaming })
  },
  setMode: (mode) => {
    console.log('[CAMERA_SESSION] setMode:', mode, 'will persist to localStorage')
    set({ mode })
    // Force persist immediately
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const currentState = get()
        const toStore = {
          isStreaming: currentState.isStreaming,
          mode: currentState.mode,
          pairingCode: currentState.pairingCode,
          expiresAt: currentState.expiresAt,
          isPaired: currentState.isPaired,
          mobileUrl: currentState.mobileUrl,
        }
        window.localStorage.setItem('ndn-camera-session', JSON.stringify({ state: toStore }))
        console.log('[CAMERA_SESSION] Forced localStorage update:', toStore)
      } catch (e) {
        console.error('[CAMERA_SESSION] Failed to force persist:', e)
      }
    }
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
}), {
  name: 'ndn-camera-session',
  storage: createJSONStorage(() => localStorage),
  // Only persist the serializable parts (not mediaStream or pcRef)
  partialize: (state) => ({
    isStreaming: state.isStreaming,
    mode: state.mode,
    pairingCode: state.pairingCode,
    expiresAt: state.expiresAt,
    isPaired: state.isPaired,
    mobileUrl: state.mobileUrl,
  }),
  onRehydrateStorage: () => (state, error) => {
    if (error) {
      console.error('[CAMERA_SESSION] Rehydration error:', error)
    } else if (state) {
      console.log('[CAMERA_SESSION] Rehydrated from localStorage:', {
        isStreaming: state.isStreaming,
        mode: state.mode,
        isPaired: state.isPaired,
      })
    }
  },
}))
