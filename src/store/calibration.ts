import { create } from "zustand";
import { useUserSettings } from "./userSettings";

/**
 * Simplified Calibration Store for Manual-Only Mode
 *
 * This store now only tracks camera view locking (alignment with dartboard).
 * No complex homography mapping or board-space calculations needed.
 *
 * Purpose: Allow users to align camera with dartboard and lock that view
 * for consistent alignment throughout offline/online/tournament play.
 */

type CameraViewLock = {
  // Camera alignment/lock state
  locked: boolean;
  lockedAt: number | null;
  // Locked camera view settings
  lockedScale: number | null;
  lockedAspect: "wide" | "square" | null;
  lockedFitMode: "fit" | "fill" | null;
  // Camera ID when locked (for camera switching awareness)
  cameraId: string | null;
};

type CalibrationState = CameraViewLock & {
  // Simple calibration metadata
  createdAt: number | null;
  _hydrated: boolean;
  // Actions
  lockCameraView: (
    scale: number,
    aspect: "wide" | "square",
    fitMode: "fit" | "fill",
    cameraId: string | null,
  ) => void;
  unlockCameraView: () => void;
  reset: () => void;
};

export const useCalibration = create<CalibrationState>()((set) => ({
  // Camera view lock state
  locked: false,
  lockedAt: null,
  lockedScale: null,
  lockedAspect: null,
  lockedFitMode: null,
  cameraId: null,
  createdAt: null,
  _hydrated: true,

  lockCameraView: (scale, aspect, fitMode, cameraId) =>
    set({
      locked: true,
      lockedAt: Date.now(),
      lockedScale: scale,
      lockedAspect: aspect,
      lockedFitMode: fitMode,
      cameraId: cameraId,
      createdAt: Date.now(),
    }),

  unlockCameraView: () =>
    set({
      locked: false,
      lockedAt: null,
      lockedScale: null,
      lockedAspect: null,
      lockedFitMode: null,
    }),

  reset: () =>
    set({
      locked: false,
      lockedAt: null,
      lockedScale: null,
      lockedAspect: null,
      lockedFitMode: null,
      cameraId: null,
      createdAt: null,
    }),
}));
