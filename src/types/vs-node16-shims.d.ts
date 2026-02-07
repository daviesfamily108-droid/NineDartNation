// Visual Studio/tsserver sometimes type-checks with NodeNext/Node16 rules.
// These looser shims keep the editor build from failing due to Vite-style imports.

declare module "../utils/dartDetector" {
  export const DartDetector: any;
}

declare module "../utils/dartDetector.js" {
  export const DartDetector: any;
}

declare module "../store/calibration" {
  export const useCalibration: any;
}

declare module "../store/calibration.js" {
  export const useCalibration: any;
}

declare module "../store/cameraSession" {
  export const useCameraSession: any;
}

declare module "../store/cameraSession.js" {
  export const useCameraSession: any;
}

declare module "../utils/vision" {
  export const BoardRadii: any;
  export const CalibrationGuideRadii: any;
  export const canonicalRimTargets: any;
  export const computeHomographyDLT: any;
  export const drawCross: any;
  export const drawPolyline: any;
  export const rmsError: any;
  export const sampleRing: any;
  export const refinePointsSobel: any;
  export const applyHomography: any;
  export const imageToBoard: any;
  export const scoreAtBoardPoint: any;
  export const scoreAtBoardPointTheta: any;
  export const scaleHomography: any;
  export const rotateHomography: any;
  export const matMul3: any;
  export const SectorOrder: any;
  export const estimateSectorOffsetFromHomography: any;
  export type Homography = any;
  export type Point = any;
}

declare module "../utils/vision.js" {
  export const BoardRadii: any;
  export const CalibrationGuideRadii: any;
  export const canonicalRimTargets: any;
  export const computeHomographyDLT: any;
  export const drawCross: any;
  export const drawPolyline: any;
  export const rmsError: any;
  export const sampleRing: any;
  export const refinePointsSobel: any;
  export const applyHomography: any;
  export const imageToBoard: any;
  export const scoreAtBoardPoint: any;
  export const scoreAtBoardPointTheta: any;
  export const scaleHomography: any;
  export const rotateHomography: any;
  export const matMul3: any;
  export const SectorOrder: any;
  export const estimateSectorOffsetFromHomography: any;
  export type Homography = any;
  export type Point = any;
}

declare module "../utils/markerCalibration" {
  export const detectMarkersFromCanvas: any;
  export const MARKER_TARGETS: any;
  export const markerIdToMatrix: any;
  export type MarkerDetection = any;
}

declare module "../utils/markerCalibration.js" {
  export const detectMarkersFromCanvas: any;
  export const MARKER_TARGETS: any;
  export const markerIdToMatrix: any;
  export type MarkerDetection = any;
}

declare module "../utils/boardDetection" {
  export const detectBoard: any;
  export const refineRingDetection: any;
  export type BoardDetectionResult = any;
}

declare module "../utils/boardDetection.js" {
  export const detectBoard: any;
  export const refineRingDetection: any;
  export type BoardDetectionResult = any;
}

declare module "../store/userSettings" {
  export const useUserSettings: any;
}

declare module "../store/userSettings.js" {
  export const useUserSettings: any;
}

declare module "../utils/networkDevices" {
  export const discoverNetworkDevices: any;
  export const connectToNetworkDevice: any;
  export type NetworkDevice = any;
}

declare module "../utils/networkDevices.js" {
  export const discoverNetworkDevices: any;
  export const connectToNetworkDevice: any;
  export type NetworkDevice = any;
}

declare module "../utils/api" {
  export const apiFetch: any;
}

declare module "../utils/api.js" {
  export const apiFetch: any;
}

declare module "../store/match" {
  export const useMatch: any;
}

declare module "../store/match.js" {
  export const useMatch: any;
}

declare module "./WSProvider" {
  export const useWS: any;
}

declare module "./WSProvider.js" {
  export const useWS: any;
}

// Some hosts rewrite missing-module diagnostics for *.js ESM specifiers to extensionless paths.
// Provide both forms.
declare module "../utils/dartDetector" {
  export const DartDetector: any;
}
declare module "../store/calibration" {
  export const useCalibration: any;
}
declare module "../store/cameraSession" {
  export const useCameraSession: any;
}
declare module "../utils/vision" {
  export const BoardRadii: any;
  export const CalibrationGuideRadii: any;
  export const canonicalRimTargets: any;
  export const computeHomographyDLT: any;
  export const drawCross: any;
  export const drawPolyline: any;
  export const rmsError: any;
  export const sampleRing: any;
  export const refinePointsSobel: any;
  export const applyHomography: any;
  export const imageToBoard: any;
  export const scoreAtBoardPoint: any;
  export const scoreAtBoardPointTheta: any;
  export const scaleHomography: any;
  export const rotateHomography: any;
  export const matMul3: any;
  export const SectorOrder: any;
  export const estimateSectorOffsetFromHomography: any;
  export type Homography = any;
  export type Point = any;
}
declare module "../utils/markerCalibration" {
  export const detectMarkersFromCanvas: any;
  export const MARKER_TARGETS: any;
  export const markerIdToMatrix: any;
  export type MarkerDetection = any;
}
declare module "../utils/boardDetection" {
  export const detectBoard: any;
  export const refineRingDetection: any;
  export type BoardDetectionResult = any;
}
declare module "../store/userSettings" {
  export const useUserSettings: any;
}
declare module "../utils/networkDevices" {
  export const discoverNetworkDevices: any;
  export const connectToNetworkDevice: any;
  export type NetworkDevice = any;
}
declare module "../utils/api" {
  export const apiFetch: any;
}
declare module "../store/match" {
  export const useMatch: any;
}
declare module "./WSProvider" {
  export const useWS: any;
}
