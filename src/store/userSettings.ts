import { create } from "zustand";
// Import logger for side-effects (initialization/patching in some builds)
import "../utils/logger";

type LastOffline = {
  mode: string;
  x01Start: number;
  firstTo: number;
  aiLevel: string;
};

type SettingsState = {
  user?: {
    username?: string;
    name?: string;
    displayName?: string;
    email?: string;
  } | null;
  favoriteDouble: string;
  callerEnabled: boolean;
  callerVoice: string; // voice name
  callerVolume: number; // 0..1
  speakCheckoutOnly: boolean;
  avgMode: "all-time" | "24h";
  autoStartOffline: boolean;
  rememberLastOffline: boolean;
  lastOffline: LastOffline;
  reducedMotion: boolean;
  compactHeader: boolean;
  allowSpectate: boolean;
  // UI tuning
  cameraScale: number; // 0.5 .. 2.0
  cameraAspect?: "wide" | "square";
  cameraFitMode?: "fit" | "fill";
  // External autoscore provider
  autoscoreProvider?: "built-in" | "built-in-v2" | "external-ws" | "manual";
  autoscoreWsUrl?: string;
  autoCommitMode?: "wait-for-clear" | "immediate";
  // Autoscore quality gating
  // If enabled, detections below the threshold must be confirmed by the user.
  confirmUncertainDarts?: boolean;
  // 0..1 confidence threshold used by built-in autoscore.
  autoScoreConfidenceThreshold?: number;
  // Built-in detector tuning (advanced)
  // These primarily affect the DartDetector blob segmentation and stability gating.
  autoscoreDetectorMinArea?: number;
  autoscoreDetectorThresh?: number;
  autoscoreDetectorRequireStableN?: number;
  // Lighting / glare mitigation (optional)
  harshLightingMode?: boolean;
  // Visual aid: emphasize big trebles (T20/T19/T18)
  enhanceBigTrebles?: boolean;
  // Allow immediate autocommit when playing online/tournaments
  allowAutocommitInOnline?: boolean;
  calibrationGuide: boolean;
  // Use RANSAC-based homography for auto-detection
  calibrationUseRansac?: boolean;
  // Preserve calibration overlay display size when calibration is locked
  preserveCalibrationOverlay: boolean;
  // When true, don't auto-override the calibration state when camera device changes or auto detection runs
  preserveCalibrationOnCameraChange: boolean;
  // Devices & preferences
  preferredCameraId?: string;
  preferredCameraLabel?: string;
  preferredCameraLocked?: boolean;
  // Camera control
  cameraEnabled: boolean;
  hideCameraOverlay: boolean;
  // Show segment labels (e.g., 'T20') in UI/detection logs. Some users prefer numeric-only.
  cameraShowLabels?: boolean;
  // Reduce resolution + processing for lower-latency preview (good for slow devices)
  cameraLowLatency?: boolean;
  // Processing FPS used by the detection loop (frames/sec). Lower reduces CPU and latency.
  cameraProcessingFps?: number;
  // When true, allow the camera detector to add/record darts automatically.
  // Some users prefer to use the camera for detection/counting only without
  // committing darts to visits automatically.
  cameraRecordDarts?: boolean;
  ignorePreferredCameraSync: boolean;
  // UI variants
  offlineLayout?: "classic" | "modern";
  // Match UI
  hideInGameSidebar?: boolean;
  // Admin-controlled section visibility
  hiddenSections?: string[];
  // Text size
  textSize: "small" | "medium" | "large";
  // Box size
  boxSize: "small" | "medium" | "large";
  // Stats UI tuning
  statsCardMinHeight?: number;
  // Card depth (padding-bottom) applied to page cards like the stats card
  cardPaddingBottom?: number;
  // Match configuration
  matchType?: "singles" | "doubles";
  teamAName?: string;
  teamBName?: string;
  setFavoriteDouble: (d: string) => void;
  setCallerEnabled: (v: boolean) => void;
  setCallerVoice: (name: string) => void;
  setAvgMode: (mode: "all-time" | "24h") => void;
  setCallerVolume: (v: number) => void;
  setSpeakCheckoutOnly: (v: boolean) => void;
  setAutoStartOffline: (v: boolean) => void;
  setRememberLastOffline: (v: boolean) => void;
  setLastOffline: (cfg: Partial<LastOffline>) => void;
  setReducedMotion: (v: boolean) => void;
  setCompactHeader: (v: boolean) => void;
  setAllowSpectate: (v: boolean) => void;
  setCameraScale: (n: number) => void;
  setCameraAspect: (a: "wide" | "square") => void;
  setCameraFitMode: (m: "fit" | "fill") => void;
  setCalibrationGuide: (v: boolean) => void;
  setCalibrationUseRansac: (v: boolean) => void;
  setPreserveCalibrationOverlay: (v: boolean) => void;
  setPreserveCalibrationOnCameraChange: (v: boolean) => void;
  setPreferredCamera: (
    id: string | undefined,
    label?: string,
    force?: boolean,
  ) => void;
  setPreferredCameraLocked: (v: boolean) => void;
  setCameraEnabled: (v: boolean) => void;
  setHideCameraOverlay: (v: boolean) => void;
  setCameraShowLabels: (v: boolean) => void;
  setCameraLowLatency: (v: boolean) => void;
  setCameraProcessingFps: (n: number) => void;
  setCameraRecordDarts: (v: boolean) => void;
  setIgnorePreferredCameraSync: (v: boolean) => void;
  setOfflineLayout: (mode: "classic" | "modern") => void;
  setHideInGameSidebar: (v: boolean) => void;
  setHiddenSections: (sections: string[]) => void;
  setAutoscoreProvider: (
    p: "built-in" | "built-in-v2" | "external-ws" | "manual",
  ) => void;
  setAutoscoreWsUrl: (u: string) => void;
  setAutoCommitMode: (mode: "wait-for-clear" | "immediate") => void;
  setConfirmUncertainDarts: (v: boolean) => void;
  setAutoScoreConfidenceThreshold: (n: number) => void;
  setAutoscoreDetectorMinArea: (n: number) => void;
  setAutoscoreDetectorThresh: (n: number) => void;
  setAutoscoreDetectorRequireStableN: (n: number) => void;
  setHarshLightingMode: (v: boolean) => void;
  setEnhanceBigTrebles: (v: boolean) => void;
  setAllowAutocommitInOnline: (v: boolean) => void;
  setTextSize: (size: "small" | "medium" | "large") => void;
  setBoxSize: (size: "small" | "medium" | "large") => void;
  setStatsCardMinHeight: (n: number) => void;
  setCardPaddingBottom: (n: number) => void;
  setMatchType: (t: "singles" | "doubles") => void;
  setTeamAName: (name: string) => void;
  setTeamBName: (name: string) => void;
  // Throw timer per dart
  dartTimerEnabled?: boolean;
  dartTimerSeconds?: number;
  setDartTimerEnabled: (v: boolean) => void;
  setDartTimerSeconds: (n: number) => void;
  // X01 rules
  x01DoubleIn?: boolean;
  setX01DoubleIn: (v: boolean) => void;
};
const KEY = "ndn_user_settings";

function load(): Pick<
  SettingsState,
  | "favoriteDouble"
  | "callerEnabled"
  | "callerVoice"
  | "avgMode"
  | "callerVolume"
  | "speakCheckoutOnly"
  | "autoStartOffline"
  | "rememberLastOffline"
  | "lastOffline"
  | "reducedMotion"
  | "compactHeader"
  | "allowSpectate"
  | "cameraScale"
  | "cameraAspect"
  | "cameraFitMode"
  | "cameraRecordDarts"
  | "cameraShowLabels"
  | "cameraLowLatency"
  | "cameraProcessingFps"
  | "calibrationGuide"
  | "calibrationUseRansac"
  | "preserveCalibrationOverlay"
  | "preserveCalibrationOnCameraChange"
  | "preferredCameraId"
  | "preferredCameraLabel"
  | "preferredCameraLocked"
  | "cameraEnabled"
  | "hideCameraOverlay"
  | "offlineLayout"
  | "hideInGameSidebar"
  | "hiddenSections"
  | "autoscoreProvider"
  | "autoscoreWsUrl"
  | "autoCommitMode"
  | "confirmUncertainDarts"
  | "autoScoreConfidenceThreshold"
  | "autoscoreDetectorMinArea"
  | "autoscoreDetectorThresh"
  | "autoscoreDetectorRequireStableN"
  | "harshLightingMode"
  | "enhanceBigTrebles"
  | "allowAutocommitInOnline"
  | "textSize"
  | "boxSize"
  | "statsCardMinHeight"
  | "cardPaddingBottom"
  | "matchType"
  | "teamAName"
  | "teamBName"
  | "dartTimerEnabled"
  | "dartTimerSeconds"
  | "x01DoubleIn"
> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw)
      return {
        favoriteDouble: "D16",
        callerEnabled: true,
        callerVoice: "",
        callerVolume: 1,
        speakCheckoutOnly: false,
        avgMode: "all-time",
        autoStartOffline: false,
        rememberLastOffline: true,
        lastOffline: {
          mode: "X01",
          x01Start: 501,
          firstTo: 1,
          aiLevel: "None",
        },
        reducedMotion: false,
        compactHeader: false,
        allowSpectate: true,
        cameraScale: 1.0,
        cameraAspect: "wide",
        cameraFitMode: "fit",
        cameraRecordDarts: true,
        cameraShowLabels: false,
        cameraLowLatency: false,
        cameraProcessingFps: 15,
        calibrationGuide: true,
        preferredCameraId: undefined,
        preferredCameraLabel: undefined,
        preserveCalibrationOverlay: true,
        preserveCalibrationOnCameraChange: true,
        cameraEnabled: true,
        hideCameraOverlay: false,
        offlineLayout: "modern",
        hideInGameSidebar: true,
        hiddenSections: [],
        autoscoreProvider: "built-in",
        autoscoreWsUrl: "",
        autoCommitMode: "immediate",
        confirmUncertainDarts: false,
        autoScoreConfidenceThreshold: 0.82,
        autoscoreDetectorMinArea: 30,
        autoscoreDetectorThresh: 15,
        autoscoreDetectorRequireStableN: 2,
        harshLightingMode: false,
        enhanceBigTrebles: false,
        allowAutocommitInOnline: false,
        textSize: "medium",
        boxSize: "medium",
        statsCardMinHeight: 220,
        cardPaddingBottom: 900,
        matchType: "singles",
        teamAName: "Team A",
        teamBName: "Team B",
        dartTimerEnabled: false,
        dartTimerSeconds: 10,
        x01DoubleIn: false,
      };
    const j = JSON.parse(raw);
    const version = Number((j as any)?.__version || 0);
    if (version < 2) {
      // Smooth autoscore migration: reduce manual steps for existing users.
      const migrated = {
        ...j,
        autoCommitMode: "immediate",
        confirmUncertainDarts: false,
        cameraRecordDarts: true,
        autoScoreConfidenceThreshold: 0.82,
        __version: 2,
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(migrated));
      } catch {}
    }
    // Version 3: Fix stats panel padding to fully cover score distribution
    if (version < 3) {
      const migrated = {
        ...j,
        cardPaddingBottom: 900,
        __version: 3,
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(migrated));
      } catch {}
    }
    // Version 4: Ensure stats card padding-bottom is at least 900px
    if (version < 4) {
      const migrated = {
        ...j,
        cardPaddingBottom: 900,
        __version: 4,
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(migrated));
      } catch {}
    }
    return {
      favoriteDouble: j.favoriteDouble || "D16",
      callerEnabled:
        typeof j.callerEnabled === "boolean" ? j.callerEnabled : true,
      callerVoice: j.callerVoice || "",
      callerVolume:
        typeof j.callerVolume === "number"
          ? Math.max(0, Math.min(1, j.callerVolume))
          : 1,
      speakCheckoutOnly: !!j.speakCheckoutOnly,
      avgMode: j.avgMode === "24h" ? "24h" : "all-time",
      autoStartOffline: !!j.autoStartOffline,
      rememberLastOffline:
        typeof j.rememberLastOffline === "boolean"
          ? j.rememberLastOffline
          : true,
      lastOffline:
        j.lastOffline && typeof j.lastOffline === "object"
          ? {
              mode: j.lastOffline.mode || "X01",
              x01Start: Number(j.lastOffline.x01Start) || 501,
              firstTo: Number(j.lastOffline.firstTo) || 1,
              aiLevel: j.lastOffline.aiLevel || "None",
            }
          : { mode: "X01", x01Start: 501, firstTo: 1, aiLevel: "None" },
      reducedMotion: !!j.reducedMotion,
      compactHeader: !!j.compactHeader,
      allowSpectate:
        typeof j.allowSpectate === "boolean" ? j.allowSpectate : true,
      cameraScale:
        typeof j.cameraScale === "number" && isFinite(j.cameraScale)
          ? Math.max(0.5, Math.min(1.25, j.cameraScale))
          : 1.0,
      cameraAspect: j.cameraAspect === "square" ? "square" : "wide",
      cameraFitMode:
        j.cameraFitMode === "fit" || j.cameraFitMode === "fill"
          ? j.cameraFitMode
          : "fit",
      calibrationUseRansac:
        typeof j.calibrationUseRansac === "boolean"
          ? j.calibrationUseRansac
          : true,
      autoscoreProvider: (() => {
        let val = j.autoscoreProvider;
        if (
          val !== "external-ws" &&
          val !== "manual" &&
          val !== "built-in" &&
          val !== "built-in-v2"
        ) {
          val = "built-in";
        }
        return val;
      })(),
      autoscoreWsUrl:
        typeof j.autoscoreWsUrl === "string" ? j.autoscoreWsUrl : "",
      autoCommitMode:
        j.autoCommitMode === "immediate" ? "immediate" : "wait-for-clear",
      confirmUncertainDarts:
        typeof j.confirmUncertainDarts === "boolean"
          ? j.confirmUncertainDarts
          : false,
      autoScoreConfidenceThreshold:
        typeof j.autoScoreConfidenceThreshold === "number" &&
        isFinite(j.autoScoreConfidenceThreshold)
          ? Math.max(0.5, Math.min(0.99, j.autoScoreConfidenceThreshold))
          : 0.82,
      autoscoreDetectorMinArea:
        typeof j.autoscoreDetectorMinArea === "number" &&
        isFinite(j.autoscoreDetectorMinArea)
          ? Math.max(5, Math.min(500, Math.round(j.autoscoreDetectorMinArea)))
          : 30,
      autoscoreDetectorThresh:
        typeof j.autoscoreDetectorThresh === "number" &&
        isFinite(j.autoscoreDetectorThresh)
          ? Math.max(5, Math.min(60, Math.round(j.autoscoreDetectorThresh)))
          : 15,
      autoscoreDetectorRequireStableN:
        typeof j.autoscoreDetectorRequireStableN === "number" &&
        isFinite(j.autoscoreDetectorRequireStableN)
          ? Math.max(
              1,
              Math.min(10, Math.round(j.autoscoreDetectorRequireStableN)),
            )
          : 2,
      harshLightingMode:
        typeof j.harshLightingMode === "boolean" ? j.harshLightingMode : false,
      enhanceBigTrebles:
        typeof j.enhanceBigTrebles === "boolean" ? j.enhanceBigTrebles : false,
      allowAutocommitInOnline: !!j.allowAutocommitInOnline,
      calibrationGuide:
        typeof j.calibrationGuide === "boolean" ? j.calibrationGuide : true,
      preferredCameraId:
        typeof j.preferredCameraId === "string"
          ? j.preferredCameraId
          : undefined,
      preserveCalibrationOverlay:
        typeof j.preserveCalibrationOverlay === "boolean"
          ? j.preserveCalibrationOverlay
          : true,
      preserveCalibrationOnCameraChange:
        typeof j.preserveCalibrationOnCameraChange === "boolean"
          ? j.preserveCalibrationOnCameraChange
          : true,
      preferredCameraLabel:
        typeof j.preferredCameraLabel === "string"
          ? j.preferredCameraLabel
          : undefined,
      preferredCameraLocked:
        typeof j.preferredCameraLocked === "boolean"
          ? j.preferredCameraLocked
          : false,
      cameraEnabled:
        typeof j.cameraEnabled === "boolean" ? j.cameraEnabled : true,
      hideCameraOverlay:
        typeof j.hideCameraOverlay === "boolean" ? j.hideCameraOverlay : false,
      offlineLayout: j.offlineLayout === "classic" ? "classic" : "modern",
      hideInGameSidebar:
        typeof j.hideInGameSidebar === "boolean" ? j.hideInGameSidebar : true,
      hiddenSections: Array.isArray(j.hiddenSections)
        ? j.hiddenSections.filter((v: any) => typeof v === "string")
        : [],
      textSize:
        j.textSize === "small" || j.textSize === "large"
          ? j.textSize
          : "medium",
      boxSize:
        j.boxSize === "small" || j.boxSize === "large" ? j.boxSize : "medium",
      statsCardMinHeight:
        typeof j.statsCardMinHeight === "number" &&
        isFinite(j.statsCardMinHeight)
          ? Math.max(160, Math.min(520, Math.round(j.statsCardMinHeight)))
          : 220,
      cardPaddingBottom:
        typeof j.cardPaddingBottom === "number" && isFinite(j.cardPaddingBottom)
          ? Math.max(0, Math.min(1200, Math.round(j.cardPaddingBottom)))
          : 900,
      matchType: j.matchType === "doubles" ? "doubles" : "singles",
      teamAName: typeof j.teamAName === "string" ? j.teamAName : "Team A",
      teamBName: typeof j.teamBName === "string" ? j.teamBName : "Team B",
      dartTimerEnabled:
        typeof j.dartTimerEnabled === "boolean" ? j.dartTimerEnabled : false,
      dartTimerSeconds:
        typeof j.dartTimerSeconds === "number" && isFinite(j.dartTimerSeconds)
          ? Math.max(3, Math.min(60, j.dartTimerSeconds))
          : 10,
      x01DoubleIn: typeof j.x01DoubleIn === "boolean" ? j.x01DoubleIn : false,
      cameraRecordDarts:
        typeof j.cameraRecordDarts === "boolean" ? j.cameraRecordDarts : true,
      cameraShowLabels:
        typeof j.cameraShowLabels === "boolean" ? j.cameraShowLabels : false,
    };
  } catch {
    return {
      favoriteDouble: "D16",
      callerEnabled: true,
      callerVoice: "",
      callerVolume: 1,
      speakCheckoutOnly: false,
      avgMode: "all-time",
      autoStartOffline: false,
      rememberLastOffline: true,
      lastOffline: { mode: "X01", x01Start: 501, firstTo: 1, aiLevel: "None" },
      reducedMotion: false,
      compactHeader: false,
      allowSpectate: true,
      cameraScale: 1.0,
      cameraAspect: "wide",
      cameraFitMode: "fit",
      calibrationGuide: true,
      calibrationUseRansac: true,
      preferredCameraId: undefined,
      preferredCameraLabel: undefined,
      preferredCameraLocked: false,
      preserveCalibrationOverlay: true,
      preserveCalibrationOnCameraChange: true,
      cameraEnabled: true,
      hideCameraOverlay: false,
      offlineLayout: "modern",
      hideInGameSidebar: true,
      hiddenSections: [],
      autoscoreProvider: "built-in",
      autoscoreWsUrl: "",
      autoCommitMode: "immediate",
      confirmUncertainDarts: false,
      autoScoreConfidenceThreshold: 0.82,
      harshLightingMode: false,
      enhanceBigTrebles: false,
      textSize: "medium",
      boxSize: "medium",
      statsCardMinHeight: 220,
      cardPaddingBottom: 900,
      matchType: "singles",
      teamAName: "Team A",
      teamBName: "Team B",
      dartTimerEnabled: false,
      dartTimerSeconds: 10,
      x01DoubleIn: false,
    };
  }
}

function save(partial: Partial<SettingsState>) {
  try {
    const prev = load();
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...partial }));
  } catch {}
}

export const useUserSettings = create<SettingsState>((set, get) => ({
  ...load(),
  setFavoriteDouble: (d) => {
    save({ favoriteDouble: d });
    set({ favoriteDouble: d });
  },
  setCallerEnabled: (v) => {
    save({ callerEnabled: v });
    set({ callerEnabled: v });
  },
  setCallerVoice: (name) => {
    save({ callerVoice: name });
    set({ callerVoice: name });
  },
  setAvgMode: (mode) => {
    save({ avgMode: mode });
    set({ avgMode: mode });
  },
  setCallerVolume: (v) => {
    const vol = Math.max(0, Math.min(1, v));
    save({ callerVolume: vol });
    set({ callerVolume: vol });
  },
  setSpeakCheckoutOnly: (v) => {
    save({ speakCheckoutOnly: v });
    set({ speakCheckoutOnly: v });
  },
  setAutoStartOffline: (v) => {
    save({ autoStartOffline: v });
    set({ autoStartOffline: v });
  },
  setRememberLastOffline: (v) => {
    save({ rememberLastOffline: v });
    set({ rememberLastOffline: v });
  },
  setLastOffline: (cfg) => {
    const prev = load().lastOffline;
    const next = { ...prev, ...cfg };
    save({ lastOffline: next });
    set({ lastOffline: next });
  },
  setReducedMotion: (v) => {
    save({ reducedMotion: v });
    set({ reducedMotion: v });
  },
  setCompactHeader: (v) => {
    save({ compactHeader: v });
    set({ compactHeader: v });
  },
  setAllowSpectate: (v) => {
    save({ allowSpectate: v });
    set({ allowSpectate: v });
  },
  // Temporarily suppress external camera-mode syncing (used while user is interacting with device picker)
  ignorePreferredCameraSync: false,
  setIgnorePreferredCameraSync: (v: boolean) => {
    save({} as any);
    set({ ignorePreferredCameraSync: v });
  },
  setCameraScale: (n) => {
    const s = Math.max(0.5, Math.min(2.0, n));
    save({ cameraScale: s });
    set({ cameraScale: s });
  },
  setCameraAspect: (a) => {
    const v = a === "square" ? "square" : "wide";
    save({ cameraAspect: v });
    set({ cameraAspect: v });
  },
  setCameraFitMode: (m) => {
    const v = m === "fit" ? "fit" : "fill";
    save({ cameraFitMode: v });
    set({ cameraFitMode: v });
  },
  setAutoscoreProvider: (p) => {
    // Force set next to p
    const next = p;
    // Persist
    save({ autoscoreProvider: next });
    set({ autoscoreProvider: next });
  },
  setAutoscoreWsUrl: (u) => {
    save({ autoscoreWsUrl: u });
    set({ autoscoreWsUrl: u });
  },
  setAutoCommitMode: (mode) => {
    const v = mode === "immediate" ? "immediate" : "wait-for-clear";
    save({ autoCommitMode: v });
    set({ autoCommitMode: v });
  },
  setConfirmUncertainDarts: (v) => {
    const next = !!v;
    save({ confirmUncertainDarts: next });
    set({ confirmUncertainDarts: next });
  },
  setAutoScoreConfidenceThreshold: (n) => {
    const next =
      typeof n === "number" && isFinite(n)
        ? Math.max(0.5, Math.min(0.99, n))
        : 0.85;
    save({ autoScoreConfidenceThreshold: next });
    set({ autoScoreConfidenceThreshold: next });
  },
  setAutoscoreDetectorMinArea: (n) => {
    const next =
      typeof n === "number" && isFinite(n)
        ? Math.max(5, Math.min(500, Math.round(n)))
        : 30;
    save({ autoscoreDetectorMinArea: next } as any);
    set({ autoscoreDetectorMinArea: next });
  },
  setAutoscoreDetectorThresh: (n) => {
    const next =
      typeof n === "number" && isFinite(n)
        ? Math.max(5, Math.min(60, Math.round(n)))
        : 15;
    save({ autoscoreDetectorThresh: next } as any);
    set({ autoscoreDetectorThresh: next });
  },
  setAutoscoreDetectorRequireStableN: (n) => {
    const next =
      typeof n === "number" && isFinite(n)
        ? Math.max(1, Math.min(10, Math.round(n)))
        : 2;
    save({ autoscoreDetectorRequireStableN: next } as any);
    set({ autoscoreDetectorRequireStableN: next });
  },
  setHarshLightingMode: (v) => {
    const next = !!v;
    save({ harshLightingMode: next } as any);
    set({ harshLightingMode: next });
  },
  setEnhanceBigTrebles: (v) => {
    const next = !!v;
    save({ enhanceBigTrebles: next } as any);
    set({ enhanceBigTrebles: next });
  },
  setAllowAutocommitInOnline: (v) => {
    save({ allowAutocommitInOnline: v } as any);
    set({ allowAutocommitInOnline: v });
  },
  setCalibrationGuide: (v) => {
    save({ calibrationGuide: v });
    set({ calibrationGuide: v });
  },
  setCalibrationUseRansac: (v) => {
    save({ calibrationUseRansac: v } as any);
    set({ calibrationUseRansac: v } as any);
  },
  setPreserveCalibrationOverlay: (v) => {
    save({ preserveCalibrationOverlay: v } as any);
    set({ preserveCalibrationOverlay: v });
  },
  setPreserveCalibrationOnCameraChange: (v) => {
    save({ preserveCalibrationOnCameraChange: v } as any);
    set({ preserveCalibrationOnCameraChange: !!v });
  },
  setPreferredCamera: (id, label, force = false) => {
    try {
      const state = get();
      // Intentionally no logs here to avoid noisy console output in user flows
      if (state.preferredCameraLocked && !force) {
        // Locked: ignore programmatic updates unless explicitly forced by user action
        console.log(
          "[USERSETTINGS] Camera selection locked and force=false, ignoring update",
        );
        return;
      }
    } catch {}
    // Avoid redundant writes and accidental clears when values are unchanged.
    try {
      const prev = get();
      if (
        prev.preferredCameraId === id &&
        prev.preferredCameraLabel === label
      ) {
        // Nothing changed; avoid writing to storage to reduce unexpected updates
        return;
      }
    } catch {}
    // No logging on successful save to keep runtime output quiet
    save({ preferredCameraId: id, preferredCameraLabel: label });
    set({ preferredCameraId: id, preferredCameraLabel: label });
  },
  setPreferredCameraLocked: (v) => {
    // Respect a temporary user-interaction guard which prevents automatic
    // re-locking while the user is actively interacting with the picker.
    try {
      const state = get();
      if (state.ignorePreferredCameraSync && v === true) {
        // Ignore attempts to auto-lock while the user has signalled they're
        // interacting with the picker. This prevents the lock "bouncing"
        // back on immediately after a user unlocks and selects a new camera.
        console.debug(
          "[USERSETTINGS] Ignoring auto-lock due to ignorePreferredCameraSync",
        );
        return;
      }
    } catch {}
    save({ preferredCameraLocked: v });
    set({ preferredCameraLocked: v });
  },
  setCameraEnabled: (v) => {
    save({ cameraEnabled: v });
    set({ cameraEnabled: v });
  },
  setHideCameraOverlay: (v) => {
    save({ hideCameraOverlay: v });
    set({ hideCameraOverlay: v });
  },
  setCameraShowLabels: (v) => {
    save({ cameraShowLabels: v } as any);
    set({ cameraShowLabels: !!v } as any);
  },
  setCameraRecordDarts: (v: boolean) => {
    const next = !!v;
    save({ cameraRecordDarts: next } as any);
    set({ cameraRecordDarts: next } as any);
  },
  setCameraLowLatency: (v: boolean) => {
    const next = !!v;
    save({ cameraLowLatency: next } as any);
    set({ cameraLowLatency: next } as any);
  },
  setCameraProcessingFps: (n: number) => {
    const s = Math.max(5, Math.min(30, Math.round(n)));
    save({ cameraProcessingFps: s } as any);
    set({ cameraProcessingFps: s } as any);
  },
  setOfflineLayout: (mode) => {
    save({ offlineLayout: mode });
    set({ offlineLayout: mode });
  },
  setHideInGameSidebar: (v) => {
    save({ hideInGameSidebar: v });
    set({ hideInGameSidebar: v });
  },
  setHiddenSections: (sections) => {
    const next = Array.isArray(sections)
      ? sections.filter((v) => typeof v === "string")
      : [];
    save({ hiddenSections: next });
    set({ hiddenSections: next });
  },
  setTextSize: (size) => {
    save({ textSize: size });
    set({ textSize: size });
  },
  setBoxSize: (size) => {
    save({ boxSize: size });
    set({ boxSize: size });
  },
  setStatsCardMinHeight: (n) => {
    const next = Math.max(160, Math.min(520, Math.round(n)));
    save({ statsCardMinHeight: next });
    set({ statsCardMinHeight: next });
  },
  setCardPaddingBottom: (n) => {
    const next = Math.max(0, Math.min(1200, Math.round(n)));
    save({ cardPaddingBottom: next });
    set({ cardPaddingBottom: next });
  },
  setMatchType: (t) => {
    const v = t === "doubles" ? "doubles" : "singles";
    save({ matchType: v });
    set({ matchType: v });
  },
  setTeamAName: (name) => {
    const v = name?.trim() || "Team A";
    save({ teamAName: v });
    set({ teamAName: v });
  },
  setTeamBName: (name) => {
    const v = name?.trim() || "Team B";
    save({ teamBName: v });
    set({ teamBName: v });
  },
  setDartTimerEnabled: (v) => {
    save({ dartTimerEnabled: v });
    set({ dartTimerEnabled: v });
  },
  setDartTimerSeconds: (n) => {
    const s = Math.max(3, Math.min(60, Math.round(n)));
    save({ dartTimerSeconds: s });
    set({ dartTimerSeconds: s });
  },
  setX01DoubleIn: (v) => {
    save({ x01DoubleIn: v });
    set({ x01DoubleIn: v });
  },
}));
