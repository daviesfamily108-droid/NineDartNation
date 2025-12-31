import { useCameraSession } from "../store/cameraSession";
import { useUserSettings } from "../store/userSettings";

export type CameraRecoveryReason =
  | "user-click"
  | "watchdog-stall"
  | "watchdog-ended-track"
  | "watchdog-paused"
  | "watchdog-detached"
  | "watchdog-visibility-resume";

/**
 * Dispatch the appropriate recovery event for current camera mode.
 * This keeps CameraView + overlays as the single source of truth for reconnect/reset.
 */
export function dispatchCameraRecovery(reason: CameraRecoveryReason) {
  const session = useCameraSession.getState();
  const settings = useUserSettings.getState();
  const now = Date.now();

  const wantsPhone =
    settings.preferredCameraLabel === "Phone Camera" ||
    session.mode === "phone";

  if (wantsPhone) {
    window.dispatchEvent(
      new CustomEvent("ndn:phone-camera-reconnect", {
        detail: { reason, ts: now },
      }),
    );
  } else {
    window.dispatchEvent(new Event("ndn:camera-reset" as any));
  }
}
