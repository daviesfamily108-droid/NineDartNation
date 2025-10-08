import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

export const useCalibration = create<CalibrationState>()(persist((set) => ({
  H: null,
  createdAt: null,
  errorPx: null,
  imageSize: null,
  anchors: null,
  locked: false,
  setCalibration: (c) => set((s) => ({ ...s, ...c })),
  reset: () => set({ H: null, createdAt: null, errorPx: null, imageSize: null, anchors: null, locked: false }),
}), {
  name: 'ndn-calibration-v1'
}))
