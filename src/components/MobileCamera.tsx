import React, { useCallback, useEffect, useRef, useState } from "react";
import { isMobileDevice } from "../utils/deviceDetect.js";
import { useCameraSession } from "../store/cameraSession.js";
import { ensureVideoPlays } from "../utils/ensureVideoPlays.js";
import { Camera, SwitchCamera, X } from "lucide-react";

type Facing = "environment" | "user";

interface MobileCameraProps {
  /** Start the camera automatically on mount. */
  autoStart?: boolean;
  /** CSS class applied to the root wrapper. */
  className?: string;
  /** If true the flip-camera button is hidden. */
  hideFlip?: boolean;
  /** Called with the live MediaStream once it starts. */
  onStream?: (stream: MediaStream) => void;
  /** Called when the stream stops. */
  onStop?: () => void;
}

/**
 * A lightweight camera component that uses the device's native cameras
 * directly via `getUserMedia`. On mobile, this renders a video preview
 * with a flip button (front ↔ back). On desktop it falls back to a
 * simple webcam capture with no flip control.
 */
export default function MobileCamera({
  autoStart = true,
  className,
  hideFlip = false,
  onStream,
  onStop,
}: MobileCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<Facing>("environment");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const cameraSession = useCameraSession();
  const isMobile = isMobileDevice();

  /** Enumerate available video devices. */
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch {}
  }, []);

  /** Stop any running stream and clean up. */
  const stop = useCallback(() => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    try {
      cameraSession.setStreaming?.(false);
      cameraSession.setMediaStream?.(null);
    } catch {}
    onStop?.();
  }, [cameraSession, onStop]);

  /** Start (or restart) the camera with the given facing mode. */
  const start = useCallback(
    async (face: Facing = facing) => {
      if (starting) return;
      setStarting(true);
      setError(null);

      // Stop previous stream first
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: face },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e: any) {
          // Fallback — some browsers reject facingMode on desktop
          if (
            e?.name === "OverconstrainedError" ||
            e?.name === "NotFoundError"
          ) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
              },
            });
          } else {
            throw e;
          }
        }

        streamRef.current = stream;

        if (videoRef.current) {
          await ensureVideoPlays({
            video: videoRef.current,
            stream,
            onPlayError: (e: any) =>
              console.warn("[MobileCamera] play error:", e),
          });
        }

        // Push into the global camera session so the rest of the app
        // (autoscoring, calibration, etc.) can consume it.
        try {
          cameraSession.setMediaStream?.(stream);
          cameraSession.setStreaming?.(true);
          cameraSession.setMode?.("local");
          if (videoRef.current) {
            cameraSession.setVideoElementRef?.(videoRef.current);
          }
        } catch {}

        setActive(true);
        setFacing(face);
        onStream?.(stream);

        // Refresh device list after permission is granted
        await refreshDevices();
      } catch (e: any) {
        console.error("[MobileCamera] start failed:", e);
        const name = e?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Camera permission denied. Please allow camera access.");
        } else if (name === "NotFoundError") {
          setError("No camera found on this device.");
        } else {
          setError("Could not start camera. Please try again.");
        }
      } finally {
        setStarting(false);
      }
    },
    [facing, starting, cameraSession, onStream, refreshDevices],
  );

  /** Flip between front and back camera. */
  const flip = useCallback(() => {
    const next: Facing = facing === "environment" ? "user" : "environment";
    start(next);
  }, [facing, start]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart) {
      start();
    }
    return () => {
      stop();
    };
    // Only on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative ${className || ""}`}>
      {/* Video preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover rounded-2xl bg-black"
        style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
      />

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-2xl p-4 text-center">
          <Camera className="w-10 h-10 text-rose-400 mb-3" />
          <p className="text-rose-300 text-sm font-medium mb-3">{error}</p>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold transition-all"
            onClick={() => start()}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Starting state */}
      {starting && !active && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Starting camera…
          </div>
        </div>
      )}

      {/* Controls overlay */}
      {active && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
          {/* Flip camera (mobile only, when device has multiple cameras) */}
          {isMobile && !hideFlip && cameras.length !== 1 && (
            <button
              type="button"
              className="p-2.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-white/20 text-white transition-all active:scale-90"
              onClick={flip}
              title={
                facing === "environment"
                  ? "Switch to front camera"
                  : "Switch to back camera"
              }
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          )}

          {/* Stop */}
          <button
            type="button"
            className="p-2.5 rounded-full bg-rose-600/60 hover:bg-rose-600/80 backdrop-blur-sm border border-rose-400/30 text-white transition-all active:scale-90"
            onClick={stop}
            title="Stop camera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Facing label */}
      {active && isMobile && (
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-[10px] text-white/70 font-semibold uppercase tracking-wider">
          {facing === "user" ? "Front" : "Back"}
        </div>
      )}

      {/* Not started — show start button */}
      {!active && !starting && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl">
          <button
            type="button"
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 border border-emerald-400/30 text-white font-semibold shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
            onClick={() => start()}
          >
            <Camera className="w-5 h-5" />
            Start Camera
          </button>
        </div>
      )}
    </div>
  );
}
