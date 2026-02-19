import React, { useCallback, useEffect, useRef, useState } from "react";
import Calibrator from "./Calibrator.js";
import { isMobileDevice } from "../utils/deviceDetect.js";
import { useUserSettings } from "../store/userSettings.js";
import { useCameraSession } from "../store/cameraSession.js";
import { ensureVideoPlays } from "../utils/ensureVideoPlays.js";

/**
 * Mobile-first Camera Setup page.
 *
 * On mobile: immediately shows a live camera preview with a device picker
 * dropdown and a lock button.  No "Choose Mode" gate, no separate page.
 *
 * On desktop: renders the full Calibrator as before.
 */
export default function CameraSetup() {
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());

  useEffect(() => {
    const check = () => setIsMobile(isMobileDevice());
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!isMobile) {
    return (
      <div className="card ndn-game-shell relative overflow-hidden">
        <h2 className="text-3xl font-bold text-brand-700 mb-4">Camera Setup</h2>
        <div className="ndn-shell-body">
          <Calibrator />
        </div>
      </div>
    );
  }

  return <MobileCameraSetup />;
}

/* ------------------------------------------------------------------ */
/*  Streamlined mobile camera view                                     */
/* ------------------------------------------------------------------ */

function MobileCameraSetup() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preferredCameraId = useUserSettings((s) => s.preferredCameraId);
  const preferredCameraLabel = useUserSettings((s) => s.preferredCameraLabel);
  const preferredCameraLocked = useUserSettings((s) => s.preferredCameraLocked);
  const setPreferredCamera = useUserSettings.getState().setPreferredCamera;
  const cameraSession = useCameraSession();

  // Enumerate cameras
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      setCameras(list.filter((d) => d.kind === "videoinput"));
    } catch {}
  }, []);

  useEffect(() => {
    refreshDevices();
    try {
      navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    } catch {}
    return () => {
      try {
        navigator.mediaDevices.removeEventListener(
          "devicechange",
          refreshDevices,
        );
      } catch {}
    };
  }, [refreshDevices]);

  // Start the camera stream
  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (starting) return;
      setStarting(true);
      setError(null);
      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
              }
            : {
                facingMode: "environment",
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
              },
          audio: false,
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err: any) {
          // Fallback: drop constraint specifics
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await ensureVideoPlays({
            video: videoRef.current,
            stream,
            onPlayError: () => {},
          });
        }

        // Publish to global session
        try {
          cameraSession.setMediaStream?.(stream);
          cameraSession.setMode?.("local");
          cameraSession.setStreaming?.(true);
          cameraSession.setStarting?.(false);
          if (videoRef.current) {
            cameraSession.setVideoElementRef?.(videoRef.current);
          }
        } catch {}

        setStreaming(true);

        // Re-enumerate so labels appear (browsers only show labels after permission)
        await refreshDevices();
      } catch (err: any) {
        const name = err?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError(
            "Camera permission denied. Allow camera access in your browser settings.",
          );
        } else if (
          name === "NotFoundError" ||
          name === "OverconstrainedError"
        ) {
          setError("Camera not found. Try selecting a different device.");
        } else {
          setError("Could not start camera. Please try again.");
        }
      } finally {
        setStarting(false);
      }
    },
    [starting, cameraSession, refreshDevices],
  );

  // Stop the camera stream
  const stopCamera = useCallback(() => {
    try {
      const s = cameraSession.getMediaStream?.();
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch {}
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
    try {
      cameraSession.setMediaStream?.(null);
      cameraSession.setStreaming?.(false);
      cameraSession.setVideoElementRef?.(null);
    } catch {}
    setStreaming(false);
  }, [cameraSession]);

  // Auto-start on mount
  useEffect(() => {
    const existingStream = cameraSession.getMediaStream?.();
    if (existingStream?.getVideoTracks()?.length) {
      // Already have a stream — attach it
      if (videoRef.current && !videoRef.current.srcObject) {
        videoRef.current.srcObject = existingStream;
        try {
          Promise.resolve(videoRef.current.play()).catch(() => {});
        } catch {}
      }
      setStreaming(true);
      refreshDevices();
    } else {
      startCamera(preferredCameraId || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch camera when dropdown changes
  const onDeviceChange = useCallback(
    async (deviceId: string | undefined) => {
      const label = cameras.find((d) => d.deviceId === deviceId)?.label || "";
      setPreferredCamera(deviceId, label, true);
      stopCamera();
      await new Promise((r) => setTimeout(r, 150));
      await startCamera(deviceId);
    },
    [cameras, setPreferredCamera, stopCamera, startCamera],
  );

  const toggleLock = useCallback(() => {
    useUserSettings.getState().setPreferredCameraLocked(!preferredCameraLocked);
  }, [preferredCameraLocked]);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-black text-white">
      {/* ── Top bar: Device picker + Lock ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-white/10 flex-shrink-0">
        <select
          className="flex-1 min-w-0 bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-white/10 min-h-[2.5rem]"
          value={preferredCameraId || ""}
          onChange={(e) => onDeviceChange(e.target.value || undefined)}
          disabled={starting || preferredCameraLocked}
        >
          <option value="">Auto (back camera)</option>
          {cameras.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label ||
                (d.deviceId ? `Camera (${d.deviceId.slice(0, 8)}…)` : "Camera")}
            </option>
          ))}
        </select>

        <button
          className={`rounded-lg px-3 py-2 text-sm font-semibold border min-h-[2.5rem] transition-colors ${
            preferredCameraLocked
              ? "bg-emerald-600/40 border-emerald-400/50 text-emerald-200"
              : "bg-slate-800 border-white/10 text-white/60"
          }`}
          onClick={toggleLock}
        >
          {preferredCameraLocked ? "🔒 Locked" : "🔓 Lock"}
        </button>

        <button
          className="rounded-lg px-2.5 py-2 bg-slate-800 border border-white/10 text-white/60 text-sm min-h-[2.5rem]"
          onClick={refreshDevices}
          title="Rescan cameras"
        >
          ↻
        </button>
      </div>

      {/* ── Live camera feed ── */}
      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          playsInline
          muted
          autoPlay
        />

        {/* Status overlays */}
        {!streaming && !starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl text-base shadow-lg"
              onClick={() => startCamera(preferredCameraId || undefined)}
            >
              Start Camera
            </button>
          </div>
        )}

        {starting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-white/80 text-sm font-medium animate-pulse">
              Starting camera…
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6">
            <div className="text-center space-y-3 max-w-xs">
              <div className="text-rose-300 text-sm font-medium">{error}</div>
              <button
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-xl text-sm"
                onClick={() => startCamera(preferredCameraId || undefined)}
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom status bar ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${streaming ? "bg-emerald-400" : "bg-slate-500"}`}
          />
          <span className="text-white/60">{streaming ? "Live" : "Idle"}</span>
          {preferredCameraLabel && (
            <span className="text-white/40 truncate max-w-[180px]">
              — {preferredCameraLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {streaming && (
            <button
              className="text-xs text-rose-400 hover:text-rose-300 font-medium"
              onClick={stopCamera}
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
