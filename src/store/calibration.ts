import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Homography, Point } from '../utils/vision'

type CalibrationState = {
  H: Homography | null // board->image
  createdAt: number | null
  errorPx: number | null
  imageSize: { w: number; h: number } | null
  anchors: { src: Point[]; dst: Point[] } | null
  locked: boolean
  setCalibration: (c: Partial<Omit<CalibrationState, 'setCalibration' | 'reset'>>) => void
  reset: () => void
}

export const useCalibration = create<CalibrationState>()(persist((set, get) => ({
  H: null,
  createdAt: null,
  errorPx: null,
  imageSize: null,
  anchors: null,
  locked: false,
  setCalibration: (c) => set((s) => ({ ...s, ...c })),
  reset: () => set({ H: null, createdAt: null, errorPx: null, imageSize: null, anchors: null, locked: false }),
}), {
  name: 'ndn-calibration-v1',
  storage: createJSONStorage(() => localStorage),
  // If we ever had alternate keys (legacy), gently import once after hydration
  onRehydrateStorage: () => (state) => {
    // No-op on error; best-effort fallback
    try {
      const cur = get()
      if (!cur.H) {
        const legacy = localStorage.getItem('ndn:calibration:v1')
        if (legacy) {
          const j = JSON.parse(legacy)
          if (j && (j.H || j.imageSize)) {
            set({
              H: j.H ?? null,
              createdAt: j.createdAt ?? null,
              errorPx: j.errorPx ?? null,
              imageSize: j.imageSize ?? null,
              anchors: j.anchors ?? null,
              locked: !!j.locked,
            })
          }
        }
      }
    } catch {}
  },
}))
