import { useEffect } from "react";
import { useCameraSession } from "../store/cameraSession.js";
import { sym } from "../ui/icons.js";

/**
 * CameraStatusBadge
 * Compact header badge indicating camera streaming status.
 * NO longer renders a live thumbnail in the header — keeps the camera warm offscreen
 * while freeing up header space. Clicking toggles the global phone overlay.
 */
export default function CameraStatusBadge() {
  const camera = useCameraSession();
  const sessionStream = camera.getMediaStream?.();
  const videoEl = camera.getVideoElementRef();
  const hasActiveStream = !!(sessionStream || videoEl?.srcObject);
  const streaming = camera.isStreaming && hasActiveStream;
  const statusLabel = streaming ? "Camera Active" : "Camera Offline";

  // Keep an effect so screen readers get updates when streaming state changes
  useEffect(() => {
    // no-op; dependency ensures component updates when camera state changes
  }, [streaming]);

  const onClick = () => {
    try {
      window.dispatchEvent(new CustomEvent("ndn:toggle-phone-overlay"));
    } catch (e) {}
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-colors shadow-sm px-3 py-1 text-xs"
      title={
        streaming
          ? "Camera connected ✅ – click to toggle overlay"
          : "Camera not connected ❌"
      }
    >
      <span className="font-mono text-[0.75rem]">{sym("camera")}</span>
      <span className="hidden xs:inline text-slate-100 select-none">
        {statusLabel}
      </span>
      <span
        className={`ml-2 w-2 h-2 rounded-full shrink-0 ${streaming ? "bg-emerald-400" : "bg-rose-400"}`}
        aria-hidden
      />
    </button>
  );
}
