import { create } from "zustand";
import { useUserSettings } from "./userSettings";
import type { Homography, Point } from "../utils/vision";

type CalibrationState = {
  H: Homography | null; // board->image
  createdAt: number | null;
  errorPx: number | null;
  confidence: number | null;
  imageSize: { w: number; h: number } | null;
  // The visual overlay size (in pixels) used when calibration was locked.
  // If present, we preserve this display size for drawing overlays so it "sticks".
  overlaySize: { w: number; h: number } | null;
  anchors: { src: Point[]; dst: Point[] } | null;
  // Detected board orientation (radians). 0 means canonical orientation with 20 at top.
  theta: number | null;
  // Optional integer sector offset to correct any residual rotation mismatch (units: sectors)
  sectorOffset: number | null;
  // Camera ID that was used for this calibration
  cameraId: string | null;
  locked: boolean;
  _hydrated: boolean; // Track hydration state
  setCalibration: (
    c: Partial<
      Omit<CalibrationState, "setCalibration" | "reset" | "_hydrated">
    >,
  ) => void;
  reset: () => void;
};

export const useCalibration = create<CalibrationState>()((set, _get) => ({
  H: null,
  createdAt: null,
  errorPx: null,
  confidence: null,
  imageSize: null,
  overlaySize: null,
  anchors: null,
  theta: null,
  sectorOffset: 0,
  cameraId: null,
  locked: false,
  _hydrated: true, // No hydration needed for non-persistent store
  setCalibration: (c) =>
    set((s) => {
      try {
        const preserve =
          useUserSettings.getState().preserveCalibrationOnCameraChange;
        // If the user asked to preserve calibration on camera changes, and
        // the current calibration is locked, then ignore any incoming
        // auto-updates which are attempting to set a different cameraId.
        if (preserve && s.locked && c.cameraId && c.cameraId !== s.cameraId) {
          console.info(
            "[CALIBRATION] preserveCalibrationOnCameraChange enabled and camera change detected; ignoring auto-update",
          );
          return s;
        }
      } catch {}
      return { ...s, ...c };
    }),
  reset: () =>
    set({
      H: null,
      createdAt: null,
      errorPx: null,
      confidence: null,
      imageSize: null,
      overlaySize: null,
      anchors: null,
      theta: null,
      sectorOffset: 0,
      cameraId: null,
      locked: false,
    }),
}));
