import { create } from "zustand";
import { dlog } from "../utils/logger";
import { persist, createJSONStorage } from "zustand/middleware";

const TEST_MODE =
  process.env.NODE_ENV === "test" ||
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.MODE === "test");

export type CameraStreamMode = "local" | "phone" | "wifi";

// CRITICAL: All non-serializable objects kept OUTSIDE state to avoid React #185 error
// These must NOT be in Zustand state, even though we set them there momentarily
let videoElementRefHolder: HTMLVideoElement | null = null;
let mediaStreamRefHolder: MediaStream | null = null;
let pcRefHolder: RTCPeerConnection | null = null;
let wsRefHolder: WebSocket | null = null;

// Prevent UI transitions (like the pre-game overlay mounting/unmounting) from
// accidentally tearing down the shared stream.
let keepAliveCount = 0;
// Debounce/lock helpers to avoid rapid swaps of the global video element ref
let pendingVideoRef: HTMLVideoElement | null = null;
let pendingVideoRefTimer: number | null = null;
const VIDEO_REF_DEBOUNCE_MS = 200;

type CameraSessionState = {
  // Stream state - persists across navigation (ONLY serializable data)
  isStreaming: boolean;
  mode: CameraStreamMode;
  pairingCode: string | null;
  expiresAt: number | null;
  isPaired: boolean;
  mobileUrl: string | null;
  // UI: whether the floating phone overlay is visible
  showOverlay: boolean;
  // Whether camera is currently in a starting state
  isStarting: boolean;

  // Actions
  setStreaming: (streaming: boolean) => void;
  setStarting: (starting: boolean) => void;
  setMode: (mode: CameraStreamMode) => void;
  setPairingCode: (code: string | null) => void;
  setExpiresAt: (time: number | null) => void;
  setPaired: (paired: boolean) => void;
  setMobileUrl: (url: string | null) => void;
  setShowOverlay: (v: boolean) => void;

  // Methods for managing non-serializable refs (not in state)
  setMediaStream: (stream: MediaStream | null) => void;
  getMediaStream: () => MediaStream | null;
  setPcRef: (pc: RTCPeerConnection | null) => void;
  getPcRef: () => RTCPeerConnection | null;
  setWsRef: (ws: WebSocket | null) => void;
  getWsRef: () => WebSocket | null;

  // Get video element ref (not stored in state to avoid serialization)
  getVideoElementRef: () => HTMLVideoElement | null;
  setVideoElementRef: (ref: HTMLVideoElement | null) => void;

  // Keep-alive helpers for UI surfaces that briefly mount/unmount
  acquireKeepAlive: (reason?: string) => void;
  releaseKeepAlive: (reason?: string) => void;

  // Clear session when user stops camera
  clearSession: () => void;
};

export const useCameraSession = create<CameraSessionState>()(
  persist(
    (set) => ({
      isStreaming: false,
      mode: "local",
      pairingCode: null,
      expiresAt: null,
      isPaired: false,
      mobileUrl: null,
      showOverlay: true,
      isStarting: false,

      setStreaming: (streaming) => {
        dlog("[CAMERA_SESSION] setStreaming:", streaming);
        set({ isStreaming: streaming });
        // If we finished streaming, we are definitely not starting anymore
        if (streaming) set({ isStarting: false });
      },
      setStarting: (starting) => {
        dlog("[CAMERA_SESSION] setStarting:", starting);
        set({ isStarting: starting });
      },
      setMode: (mode) => {
        dlog("[CAMERA_SESSION] setMode:", mode);
        set({ mode });
      },
      setPairingCode: (code) => set({ pairingCode: code }),
      setExpiresAt: (time) => set({ expiresAt: time }),
      setPaired: (paired) => set({ isPaired: paired }),
      setMobileUrl: (url) => set({ mobileUrl: url }),
      setShowOverlay: (v) => set({ showOverlay: !!v }),

      // Non-serializable refs stored outside state
      setMediaStream: (stream) => {
        // If the UI is holding a keep-alive, never clear the holder.
        if (!stream && keepAliveCount > 0) return;
        mediaStreamRefHolder = stream;
      },
      getMediaStream: () => {
        // Primary: explicit holder
        if (mediaStreamRefHolder) return mediaStreamRefHolder;
        // Fallback: if some other component registered a global video element ref
        // (e.g., the hidden GlobalPhoneVideoSink), use its srcObject.
        try {
          const v = videoElementRefHolder;
          const s = (v?.srcObject as MediaStream | null) || null;
          if (s) return s;
        } catch {}
        return null;
      },

      setPcRef: (pc) => {
        pcRefHolder = pc;
      },
      getPcRef: () => pcRefHolder,

      setWsRef: (ws) => {
        wsRefHolder = ws;
      },
      getWsRef: () => wsRefHolder,

      // Keep video element ref outside of state to avoid serialization issues
      getVideoElementRef: () => {
        const ref = videoElementRefHolder;
        if (!ref && !TEST_MODE) {
          dlog("[cameraSession] ⚠️ getVideoElementRef called but ref is NULL");
        }
        return ref;
      },
      setVideoElementRef: (ref) => {
        try {
          // Immediate clear requests should take effect synchronously so
          // components unmounting don't lose their cleanup window.
          if (ref === null) {
            if (pendingVideoRefTimer) {
              clearTimeout(pendingVideoRefTimer);
              pendingVideoRefTimer = null;
              pendingVideoRef = null;
            }
            dlog("[cameraSession] 🛑 setVideoElementRef called - clearing ref");
            videoElementRefHolder = null;
            return;
          }

          // If there is no current holder, claim immediately.
          if (!videoElementRefHolder) {
            dlog(
              "[cameraSession] ✓ setVideoElementRef called - storing HTMLVideoElement",
              {
                tagName: ref.tagName,
                hasStream: !!ref.srcObject,
              },
            );
            videoElementRefHolder = ref;
            return;
          }

          // If the same element is being set again, do nothing.
          if (videoElementRefHolder === ref) return;

          // Another surface currently holds the global ref. Defer the set by a
          // small debounce window; if the holder is released soon after, the
          // pending ref will be applied. This avoids rapid toggles that cause
          // video.play() AbortError races.
          if (pendingVideoRefTimer) {
            clearTimeout(pendingVideoRefTimer);
            pendingVideoRefTimer = null;
          }
          pendingVideoRef = ref;
          pendingVideoRefTimer = window.setTimeout(() => {
            try {
              dlog(
                "[cameraSession] (deferred) setVideoElementRef applying pending ref",
                {
                  tagName: pendingVideoRef?.tagName,
                  hasStream: !!pendingVideoRef?.srcObject,
                },
              );
              videoElementRefHolder = pendingVideoRef;
            } catch (e) {
              dlog("[cameraSession] Failed to apply pending video ref:", e);
            } finally {
              pendingVideoRef = null;
              pendingVideoRefTimer = null;
            }
          }, VIDEO_REF_DEBOUNCE_MS as any) as any;
        } catch (e) {
          dlog("[cameraSession] setVideoElementRef error:", e);
        }
      },

      acquireKeepAlive: (_reason?: string) => {
        keepAliveCount += 1;
      },
      releaseKeepAlive: (_reason?: string) => {
        keepAliveCount = Math.max(0, keepAliveCount - 1);
      },

      clearSession: () => {
        // If a UI surface is currently asking us to keep the stream alive
        // (e.g., pre-game overlay), don't clear shared refs.
        if (keepAliveCount === 0) {
          videoElementRefHolder = null;
          mediaStreamRefHolder = null;
        }
        pcRefHolder = null;
        wsRefHolder = null;
        set({
          isStreaming: false,
          pairingCode: null,
          expiresAt: null,
          isPaired: false,
          mobileUrl: null,
          // Keep overlay state; do not forcibly hide on clear so user choice persists
        });
      },
    }),
    {
      name: "ndn-camera-session",
      storage: createJSONStorage(() => localStorage),
      // ONLY persist serializable primitives
      partialize: (state) => ({
        isStreaming: state.isStreaming,
        mode: state.mode,
        pairingCode: state.pairingCode,
        expiresAt: state.expiresAt,
        isPaired: state.isPaired,
        mobileUrl: state.mobileUrl,
        showOverlay: state.showOverlay,
      }),
    },
  ),
);
