import { useEffect, useRef } from "react";
import { useToast } from "../store/toast.js";
import {
  NDN_CAMERA_RECOVERY_EVENT,
  type CameraRecoveryUiDetail,
} from "../utils/cameraRecoveryEvents.js";
import { dispatchCameraRecovery } from "../utils/cameraRecovery.js";

function prettyReason(r: string) {
  if (r.includes("ended-track")) return "Camera stream ended. Recovering…";
  if (r.includes("paused")) return "Camera paused. Recovering…";
  if (r.includes("detached")) return "Camera preview detached. Reconnecting…";
  if (r.includes("visibility")) return "Welcome back. Refreshing camera…";
  return "Camera froze. Recovering…";
}

export default function GlobalCameraRecoveryToasts() {
  const toast = useToast();
  const lastShownAtRef = useRef<number>(0);

  useEffect(() => {
    const onRecover = (e: Event) => {
      const ev = e as CustomEvent<CameraRecoveryUiDetail>;
      const detail = ev.detail;
      if (!detail?.ts) return;

      // Avoid spamming toasts if watchdog retries.
      const now = Date.now();
      if (now - lastShownAtRef.current < 8000) return;
      lastShownAtRef.current = now;

      toast(prettyReason(detail.reason), {
        type: "info",
        actionLabel: "Retry now",
        onAction: () => {
          try {
            dispatchCameraRecovery("user-click");
          } catch {}
        },
      } as any);
    };

    window.addEventListener(NDN_CAMERA_RECOVERY_EVENT as any, onRecover as any);
    return () => {
      window.removeEventListener(
        NDN_CAMERA_RECOVERY_EVENT as any,
        onRecover as any,
      );
    };
  }, [toast]);

  return null;
}
