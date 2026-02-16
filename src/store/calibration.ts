import { create } from "zustand";
import type { Homography } from "../utils/vision.js";
import { useUserSettings } from "./userSettings.js";

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

  // Legacy calibration fields (kept for type-compat with existing components).
  // Manual-only mode keeps these as null by default.
  H: Homography | null;
  imageSize: { w: number; h: number } | null;
  overlaySize: { w: number; h: number } | null;
  theta: number | null;
  rotationOffsetRad: number | null;
  sectorOffset: number | null;
  errorPx: number | null;
  confidence: number | null;
  anchors: { src: any[]; dst: any[] } | null;

  // Legacy setter used across the app
  setCalibration: (partial: Partial<CalibrationState>) => void;
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

  H: null,
  imageSize: null,
  overlaySize: null,
  theta: null,
  rotationOffsetRad: null,
  sectorOffset: null,
  errorPx: null,
  confidence: null,
  anchors: null,

  setCalibration: (partial) =>
    set((state) => {
      try {
        const preserve =
          useUserSettings.getState?.()?.preserveCalibrationOnCameraChange;
        const incomingCamera = (partial as any)?.cameraId;
        if (
          preserve &&
          state.locked &&
          incomingCamera &&
          incomingCamera !== state.cameraId
        ) {
          // Ignore camera/homography changes while locked when preserve flag is set
          const nextPartial = { ...(partial as any) };
          nextPartial.cameraId = state.cameraId;
          if ("H" in nextPartial) nextPartial.H = state.H;
          return { ...state, ...nextPartial } as any;
        }
      } catch {}
      return { ...state, ...(partial as any) } as any;
    }),

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
