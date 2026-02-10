declare const process: any;

declare interface ImportMeta {
  env?: Record<string, any>;
}

declare module "../utils/dartDetector";
declare module "../utils/vision";
declare module "../utils/markerCalibration";
declare module "../utils/boardDetection";
declare module "../utils/networkDevices";
declare module "../utils/api";
declare module "../store/calibration";
declare module "../store/cameraSession";
declare module "../store/userSettings";
declare module "../store/match";
declare module "./WSProvider";

declare module "../utils/*";
declare module "../store/*";
declare module "./WSProvider";
