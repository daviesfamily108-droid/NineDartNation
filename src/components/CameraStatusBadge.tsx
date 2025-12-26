import { useEffect, useRef } from "react";
import { useCameraSession } from "../store/cameraSession";
import { sym } from "../ui/icons";

/**
 * CameraStatusBadge
 * A compact, always-visible header badge that shows a live thumbnail of the phone camera
 * when streaming, with a green tick overlay. Clicking toggles the global phone overlay.
 */
export default function CameraStatusBadge() {
  const camera = useCameraSession();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDrawRef = useRef<number>(0);

  const videoEl = camera.getVideoElementRef();
  const sessionStream = camera.getMediaStream?.();
  const hasActiveStream = !!(sessionStream || videoEl?.srcObject);
  // Show badge for ANY camera mode (local, phone, wifi) as long as it's streaming
  const streaming = camera.isStreaming && hasActiveStream;
  const statusLabel = streaming ? "Camera Active 🟢" : "Camera Offline 🔴";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    // Throttle the badge to a low FPS. Drawing a video thumbnail at 60fps can
    // unnecessarily compete with the main CameraView/Calibrator loops.
    const TARGET_FPS = 10;
    const MIN_MS = 1000 / TARGET_FPS;

    const drawOnce = () => {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (streaming && videoEl && videoEl.readyState >= 2) {
          const vw = videoEl.videoWidth || 640;
          const vh = videoEl.videoHeight || 360;
          // Fit cover into canvas (letterbox/crop to preserve aspect)
          const cw = canvas.width;
          const ch = canvas.height;
          const vr = vw / vh;
          const cr = cw / ch;
          let sx = 0,
            sy = 0,
            sw = vw,
            sh = vh;
          if (vr > cr) {
            const targetW = vh * cr;
            sx = (vw - targetW) / 2;
            sw = targetW;
          } else if (vr < cr) {
            const targetH = vw / cr;
            sy = (vh - targetH) / 2;
            sh = targetH;
          }
          ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, cw, ch);
        } else {
          ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "rgba(226,232,240,0.8)";
          ctx.font = "10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(statusLabel, canvas.width / 2, canvas.height / 2);
        }
      } catch {}
    };

    const loop = (ts: number) => {
      if (!running || !streaming) return;
      if (ts - lastDrawRef.current >= MIN_MS) {
        lastDrawRef.current = ts;
        drawOnce();
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    // Always draw a single frame immediately (shows placeholder if needed)
    drawOnce();

    // Only animate when streaming
    if (streaming) {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Include only essentials; avoid re-creating loop unnecessarily
  }, [streaming, videoEl]);

  const onClick = () => {
    try {
      // Toggle global overlay visibility via event (handled by overlay component)
      window.dispatchEvent(new CustomEvent("ndn:toggle-phone-overlay"));
    } catch (e) {}
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-colors shadow-sm overflow-hidden"
      style={{ height: 36 }}
      title={
        streaming
          ? camera.mode === "phone"
            ? "Camera connected ✅ – click to toggle overlay"
            : "Camera connected ✅"
          : "Camera not connected ❌"
      }
    >
      <canvas ref={canvasRef} width={64} height={36} className="block" />
      <span
        className="pr-2 text-xs text-slate-100 select-none hidden xs:inline"
        aria-live="polite"
      >
        {statusLabel}
      </span>
      {/* Status tick */}
      <span
        className="absolute -top-1 -right-1 text-lg pointer-events-none drop-shadow"
        aria-hidden="true"
      >
        {streaming ? sym("ok") : sym("dash")}
      </span>
    </button>
  );
}
