import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Homography, Point } from "../utils/vision";

type CalibrationState = {
  H: Homography | null; // board->image
  createdAt: number | null;
  errorPx: number | null;
  imageSize: { w: number; h: number } | null;
  anchors: { src: Point[]; dst: Point[] } | null;
  locked: boolean;
  _hydrated: boolean; // Track hydration state
  setCalibration: (
    c: Partial<
      Omit<CalibrationState, "setCalibration" | "reset" | "_hydrated">
    >,
  ) => void;
  reset: () => void;
};

export const useCalibration = create<CalibrationState>()(
  persist(
    (set, get) => ({
      H: null,
      createdAt: null,
      errorPx: null,
      imageSize: null,
      anchors: null,
      locked: false,
      _hydrated: false,
      setCalibration: (c) => set((s) => ({ ...s, ...c })),
      reset: () =>
        set({
          H: null,
          createdAt: null,
          errorPx: null,
          imageSize: null,
          anchors: null,
          locked: false,
        }),
    }),
    {
      name: "ndn-calibration-v1",
      storage: createJSONStorage(() => localStorage),
      // If we ever had alternate keys (legacy), gently import once after hydration
      onRehydrateStorage: () => (state, error) => {
        // No-op on error; best-effort fallback
        if (error || !state) return;
        try {
          if (state && !state.H) {
            const legacy = localStorage.getItem("ndn:calibration:v1");
            if (legacy) {
              const j = JSON.parse(legacy);
              if (j && (j.H || j.imageSize)) {
                state.setCalibration({
                  H: j.H ?? null,
                  createdAt: j.createdAt ?? null,
                  errorPx: j.errorPx ?? null,
                  imageSize: j.imageSize ?? null,
                  anchors: j.anchors ?? null,
                  locked: !!j.locked,
                });
              }
            }
          }
          // Mark as hydrated
          state._hydrated = true;
        } catch {}
      },
    },
  ),
);
