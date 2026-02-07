import { useEffect, useRef } from "react";
import { useUserSettings } from "../store/userSettings.js";
import { useCameraSession } from "../store/cameraSession.js";
import {
  dispatchCameraRecovery,
  type CameraRecoveryReason,
} from "../utils/cameraRecovery.js";
import { dispatchCameraRecoveryUi } from "../utils/cameraRecoveryEvents.js";

/**
 * GlobalCameraWatchdog
 *
 * Goal: make the camera experience resilient.
 *
 * What it does:
 * - Watches the active video element + media stream.
 * - Detects "stalls" (no currentTime progress) while camera is expected to be live.
 * - Triggers recovery actions with backoff:
 *    1) Dispatch `ndn:camera-reset` (local camera restart path)
 *    2) Dispatch `ndn:phone-camera-reconnect` (phone pairing restart)
 *
 * Notes:
 * - This is intentionally conservative: it only triggers when camera is enabled
 *   AND a stream is expected to be live.
 */
export default function GlobalCameraWatchdog() {
  const cameraEnabled = useUserSettings((s: any) => !!s.cameraEnabled);
  const preferredCameraLabel = useUserSettings((s: any) => s.preferredCameraLabel);
  const shouldWatch = cameraEnabled;
  const session = useCameraSession();

  const lastVideoTimeRef = useRef<number>(-1);
  const stallTicksRef = useRef<number>(0);
  const lastRecoveryAtRef = useRef<number>(0);
  const backoffStepRef = useRef<number>(0);
  const recoveringRef = useRef<boolean>(false);
  const lastReasonRef = useRef<CameraRecoveryReason | null>(null);

  useEffect(() => {
    if (!shouldWatch) return;

    const jitter = (ms: number) => {
      // +/- 15% jitter to avoid pathological sync loops.
      const j = ms * 0.15;
      const delta = (Math.random() * 2 - 1) * j;
      return Math.max(500, Math.round(ms + delta));
    };

    const maybeRecover = (reason: CameraRecoveryReason) => {
      const now = Date.now();
      // Backoff ladder; step increases only when we actually attempt recovery.
      const base = [2500, 5000, 10000, 18000, 30000][
        Math.min(backoffStepRef.current, 4)
      ];
      const backoffMs = jitter(base);
      if (now - lastRecoveryAtRef.current < backoffMs) return;
      if (recoveringRef.current) return;

      recoveringRef.current = true;
      lastRecoveryAtRef.current = now;
      lastReasonRef.current = reason;
      backoffStepRef.current = Math.min(backoffStepRef.current + 1, 5);

      try {
        dispatchCameraRecovery(reason);
        dispatchCameraRecoveryUi({ reason, ts: now });
      } catch {
        // ignore
      }

      // Release single-flight after a short window.
      window.setTimeout(() => {
        recoveringRef.current = false;
      }, 1500);
    };

    const tick = () => {
      try {
        // Only watch when session says we're streaming OR we actually have a stream.
        const stream = session.getMediaStream?.() || null;
        const streaming = !!session.isStreaming || !!stream;
        if (!streaming) {
          stallTicksRef.current = 0;
          lastVideoTimeRef.current = -1;
          backoffStepRef.current = 0;
          recoveringRef.current = false;
          lastReasonRef.current = null;
          return;
        }

        const video = session.getVideoElementRef?.() || null;
        if (!video) {
          // No element to sample; don't spam recovery.
          stallTicksRef.current = 0;
          lastVideoTimeRef.current = -1;
          // Still potentially a recoverable state: stream exists but no element.
          if (stream) maybeRecover("watchdog-detached");
          return;
        }

        // If the video element isn't attached, try attaching.
        if (stream && !video.srcObject) {
          try {
            video.srcObject = stream;
          } catch {}
        }

        // If track ended (permissions revoked, device unplugged, phone stream dropped), recover.
        try {
          const tracks = (stream?.getVideoTracks?.() ||
            []) as MediaStreamTrack[];
          if (
            stream &&
            tracks.length > 0 &&
            tracks.every((t) => t.readyState === "ended" || (t as any).muted)
          ) {
            maybeRecover("watchdog-ended-track");
            return;
          }
        } catch {}

        // If user/tab pauses playback, nudge play; if it remains paused while streaming, recover.
        try {
          if ((video as HTMLVideoElement).paused) {
            (video as any).play?.().catch?.(() => {});
            // If it stays paused for multiple ticks, treat as a failure.
            stallTicksRef.current += 1;
            if (stallTicksRef.current >= 6) {
              maybeRecover("watchdog-paused");
              return;
            }
          }
        } catch {}

        const ct = Number((video as HTMLVideoElement).currentTime || 0);
        if (!Number.isFinite(ct)) return;

        if (lastVideoTimeRef.current === ct) {
          stallTicksRef.current += 1; // 1/sec
        } else {
          stallTicksRef.current = 0;
        }
        lastVideoTimeRef.current = ct;

        // Require a few consecutive seconds of no progress before attempting recovery.
        if (stallTicksRef.current < 4) return;
        maybeRecover("watchdog-stall");
      } catch {
        // never throw from watchdog
      }
    };

    const onVis = () => {
      try {
        if (document.visibilityState === "visible") {
          // Returning to foreground often resolves a frozen renderer; give it a kick.
          const v = session.getVideoElementRef?.() || null;
          try {
            (v as any)?.play?.().catch?.(() => {});
          } catch {}
          // If we were already in a bad state, attempt a recover.
          if (!!session.isStreaming || !!session.getMediaStream?.()) {
            maybeRecover("watchdog-visibility-resume");
          }
        }
      } catch {}
    };

    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [shouldWatch, preferredCameraLabel, session]);

  return null;
}
