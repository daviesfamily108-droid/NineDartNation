import {
  BoardRadii,
  drawPolyline,
  sampleRing,
  scaleHomography,
  type Point,
  applyHomography,
  refinePointSobel,
  imageToBoard,
} from "../utils/vision";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { MutableRefObject } from "react";
import { dlog } from "../utils/logger";
import { useUserSettings } from "../store/userSettings";
import { useCalibration } from "../store/calibration";
import { useMatch } from "../store/match";
import { scoreFromImagePoint } from "../utils/autoscore";
import { getGlobalCalibrationConfidence } from "../utils/gameCalibrationRequirements";
import { DartDetector } from "../utils/dartDetector";
import { addSample } from "../store/profileStats";
import { subscribeExternalWS } from "../utils/scoring";
import ResizablePanel from "./ui/ResizablePanel";
import ResizableModal from "./ui/ResizableModal";
import FocusLock from "react-focus-lock";
import useHeatmapStore from "../store/heatmap";
import { usePendingVisit } from "../store/pendingVisit";
import { useCameraSession } from "../store/cameraSession";
import { useMatchControl } from "../store/matchControl";
import { useAudit } from "../store/audit";
import PauseQuitModal from "./ui/PauseQuitModal";
import PauseTimerBadge from "./ui/PauseTimerBadge";
import { writeMatchSnapshot } from "../utils/matchSync";
import { broadcastMessage } from "../utils/broadcast";
import { startForwarding, stopForwarding } from "../utils/cameraHandoff";
import { sayScore } from "../utils/checkout";
import {
  distanceFromBullMm,
  mmPerBoardUnitFromBullOuter,
} from "../utils/bullDistance";

type VideoDiagnostics = {
  ts: number;
  hasVideoEl: boolean;
  video: {
    hasSrcObject: boolean;
    readyState: number | null;
    paused: boolean | null;
    ended: boolean | null;
    videoWidth: number;
    videoHeight: number;
  };
  stream: {
    exists: boolean;
    videoTracks: number;
    audioTracks: number;
    videoTrackStates: Array<{
      enabled: boolean;
      muted?: boolean;
      readyState: string;
    }>;
  };
  session: {
    mode?: any;
    isStreaming?: any;
  };
  preferredCamera: {
    id?: string;
    label?: string;
    locked?: boolean;
  };
  error?: string | null;
};

// Shared ring type across autoscore/manual flows
type Ring = "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL";

// Require at least two frames showing a candidate to reduce false positives
// In tests, use 0 to allow deterministic single-frame commits for faster test assertions.
// Require more consecutive frames before auto-committing to avoid ghost darts
const AUTO_COMMIT_MIN_FRAMES = process.env.NODE_ENV === "test" ? 0 : 4;
// Allow a short hold time as fallback for single-frame candidates
const AUTO_COMMIT_HOLD_MS = 250;
// Use a small cooldown even in tests to reduce non-deterministic duplicate commits
const AUTO_COMMIT_COOLDOWN_MS = process.env.NODE_ENV === "test" ? 150 : 400;
const AUTO_STREAM_IGNORE_MS = process.env.NODE_ENV === "test" ? 0 : 800;
const DETECTION_ARM_DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 1500;
const DETECTION_MIN_FRAMES = process.env.NODE_ENV === "test" ? 0 : 10;
// Raise confidence threshold slightly to further reduce ghost detections
// Slightly raise confidence and stability requirements to clamp false positives
const AUTO_COMMIT_CONFIDENCE = 0.85;
// Real-world reliability: require the detected tip to be stable (low jitter)
// across multiple frames before allowing a commit.
// Real cameras often have small inter-frame jitter; requiring too many stable
// frames can cause missed darts. These values aim to block flicker while still
// committing quickly once the dart is actually in the board.
const TIP_STABLE_MIN_FRAMES = process.env.NODE_ENV === "test" ? 1 : 4;
// Tighter jitter tolerance so a dart must stay pinned in nearly the same spot
const TIP_STABLE_MAX_JITTER_PX = process.env.NODE_ENV === "test" ? 999 : 3;
// After any detection appears/disappears, wait briefly before arming so we don't
// commit on motion blur or lighting flicker.
// Give the scene a bit longer to settle after motion/lighting changes
const DETECTION_SETTLE_MS = process.env.NODE_ENV === "test" ? 0 : 900;
const BOARD_CLEAR_GRACE_MS = 6500;
// Disable all camera overlays (rings, debug bboxes/axis) while keeping scoring intact.
// This hides the cyan debug boxes/rings shown around trebles/doubles and detections.
const DISABLE_CAMERA_OVERLAY = true;
// Unit tests for this repo run under Vitest and rely on CameraView's autoscore
// effect running. We keep "TEST_MODE" disabled and use explicit NODE_ENV checks
// for small test-only knobs.
const TEST_MODE = false;

const CAMERA_VERBOSE_LOGS =
  String(import.meta.env?.VITE_CAMERA_VERBOSE_LOGS ?? "")
    .trim()
    .toLowerCase() === "1";
const cameraVerboseLog = (...args: unknown[]) => {
  if (!CAMERA_VERBOSE_LOGS) return;
  console.log(...args);
};

// Ring-light / glare mitigation
// When enabled, we apply a lightweight highlight compression to the captured
// frame BEFORE running background subtraction / blob detection.
// Enable via DevTools:
//   localStorage.setItem('ndn.glareClamp', '1'); location.reload();
// Disable:
//   localStorage.removeItem('ndn.glareClamp'); location.reload();
function glareClampFrameInPlace(
  frame: ImageData,
  opts?: { knee?: number; strength?: number },
) {
  // knee: luma threshold where compression starts (0..255)
  // strength: 0..1, higher compresses highlights more
  const knee = Math.max(0, Math.min(255, opts?.knee ?? 210));
  const strength = Math.max(0, Math.min(1, opts?.strength ?? 0.65));

  const d = frame.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];

    const b = d[i + 2];

    // Fast approx luma (integer math)
    const y = (r * 77 + g * 150 + b * 29) >> 8; // ~0.299,0.587,0.114
    if (y <= knee) continue;

    // Normalize how far above the knee we are
    const over = y - knee; // 0..(255-knee)
    const t = over / Math.max(1, 255 - knee); // 0..1

    // Compression curve: dampen highlights; keeps midtones stable.
    // y' = y - strength * over * t
    const y2 = y - strength * over * t;
    const ratio = y > 0 ? y2 / y : 1;

    d[i] = Math.max(0, Math.min(255, Math.round(r * ratio)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(g * ratio)));
    d[i + 2] = Math.max(0, Math.min(255, Math.round(b * ratio)));
    // alpha unchanged
  }
}

type FitTransform = {
  // Map a point in the processing canvas (video pixel space) into the
  // calibration image space used by the homography.
  toCalibration: (pVideoPx: Point) => Point;
};

function makeFitTransform(params: {
  videoW: number;
  videoH: number;
  calibW: number;
  calibH: number;
  fitMode: "fit" | "fill";
}): FitTransform {
  const { videoW, videoH, calibW, calibH, fitMode } = params;
  const sx = videoW / calibW;
  const sy = videoH / calibH;
  // We assume the processing canvas matches the intrinsic video size (vw/vh).
  // The mismatch happens because calibration was captured against a different
  // sized image (calibW/calibH). Additionally, UI fit-mode can implicitly crop
  // the visible region, which affects where the user thinks the tip is.
  //
  // We correct by projecting the *video-space* point back into calibration-space
  // under the same contain/cover rules.
  const vr = videoW / videoH;
  const cr = calibW / calibH;
  let cropXCal = 0;
  let cropYCal = 0;

  if (fitMode === "fill") {
    // Cover: calibration image is effectively cropped to match the video aspect.
    // Determine how much of the calibration image would be cropped.
    if (vr > cr) {
      // video is wider => crop calibration left/right
      const targetWCal = calibH * vr;
      cropXCal = Math.max(0, (targetWCal - calibW) / 2);
    } else if (vr < cr) {
      // video is taller => crop calibration top/bottom
      const targetHCal = calibW / vr;
      cropYCal = Math.max(0, (targetHCal - calibH) / 2);
    }
  } else {
    // Contain: no crop, but there would be letterbox on display.
    // Since detector works in full video pixels, we only need uniform scaling.
    cropXCal = 0;
    cropYCal = 0;
  }

  return {
    toCalibration: (pVideoPx: Point) => {
      // First map video px -> calibration px via simple scale
      const p = { x: pVideoPx.x / sx, y: pVideoPx.y / sy };
      // Then undo cover-cropping in calibration space (if any)
      return { x: p.x + cropXCal, y: p.y + cropYCal };
    },
  };
}

type AutoCandidate = {
  value: number;
  ring: Ring;
  label: string;
  sector: number | null;
  mult: 0 | 1 | 2 | 3;
  firstTs: number;
  frames: number;
};

type DetectionLogEntry = {
  ts: number;
  label: string;
  value: number;
  ring: Ring;
  confidence: number;
  ready: boolean;
  accepted: boolean;
  warmup: boolean;
  // If present, explains why the hit was not accepted/committed.
  // Useful for diagnosing missed darts.
  rejectReason?:
    | "below-confidence"
    | "calibration-invalid"
    | "tip-outside-video"
    | "pCal-outside-image"
    | "off-board"
    | "ghost"
    | "not-settled"
    | "unstable-tip"
    | "candidate-hold"
    | "cooldown"
    | "warmup"
    | string
    | null;
  pCal?: Point;
  tip?: Point;
  frame?: string | null; // small dataURL thumbnail for quick review
};

type _BounceoutEvent = {
  ts: number;
  // Best-effort derived distance (from last seen tip point) so a bounceout can
  // still feel "real" in online play.
  bullDistanceMm?: number;
};

type CameraDartMeta = {
  calibrationValid?: boolean;
  pBoard?: Point | null;
  source?: "camera" | "manual";
  // Optional testing/advanced flags
  __allowMultipleBullUp?: boolean;
};

export type CameraViewHandle = {
  runDetectionTick: () => void;
  runSelfTest?: () => Promise<boolean>;
  // Test-only helper to directly add a dart without relying on detector
  __test_addDart?: (
    value: number,
    label: string,
    ring: Ring,
    meta?: any,
    opts?: { emulateApplyAutoHit?: boolean },
  ) => void;
  // Test-only helper to commit the currently pending visit.
  __test_commitVisit?: () => void;
};

export default forwardRef(function CameraView(
  {
    onVisitCommitted,
    showToolbar = true,
    onAutoDart,
    immediateAutoCommit = false,
    hideInlinePanels = false,
    scoringMode = "x01",
    onGenericDart,
    onGenericReplace,
    x01DoubleInOverride,
    onAddVisit,
    onEndLeg,
    cameraAutoCommit: _cameraAutoCommit = "camera",
    forceAutoStart = false,
  }: {
    onVisitCommitted?: (
      score: number,
      darts: number,
      finished: boolean,
      meta?: {
        label?: string;
        ring?: Ring;
        entries?: { label: string; value: number; ring: string }[];
        frame?: string | null;
      },
    ) => void;
    showToolbar?: boolean;
    onAutoDart?: (
      value: number,
      ring: "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
      info?: {
        sector: number | null;
        mult: 0 | 1 | 2 | 3;
        calibrationValid?: boolean;
        pBoard?: Point | null;
        bullDistanceMm?: number;
        tipVideoPx?: Point;
        bounceout?: boolean;
      },
    ) => boolean | void | Promise<boolean | void>;
    immediateAutoCommit?: boolean;
    hideInlinePanels?: boolean;
    scoringMode?: "x01" | "custom";
    onGenericDart?: (
      value: number,
      ring: Ring,
      meta: { label: string },
    ) => void;
    onGenericReplace?: (
      value: number,
      ring: Ring,
      meta: { label: string },
    ) => void;
    x01DoubleInOverride?: boolean;
    onAddVisit?: (score: number, darts: number, meta?: any) => void;
    onEndLeg?: (score?: number) => void;
    cameraAutoCommit?: "camera" | "parent" | "both";
    // Force the camera to auto-start even if the global toggle was off (useful for match window popouts)
    forceAutoStart?: boolean;
  },
  ref: any,
) {
  const videoRef = useRef<HTMLVideoElement>(
    null,
  ) as MutableRefObject<HTMLVideoElement | null>;
  // IMPORTANT: subscribe to settings granularly to avoid rerender storms.
  const preferredCameraId = useUserSettings((s) => s.preferredCameraId);
  const preferredCameraLabel = useUserSettings((s) => s.preferredCameraLabel);
  const autoscoreProvider = useUserSettings((s) => s.autoscoreProvider);
  const autoscoreWsUrl = useUserSettings((s) => s.autoscoreWsUrl);
  const cameraAspect = useUserSettings((s) => s.cameraAspect);
  const cameraFitMode = useUserSettings((s) => s.cameraFitMode);
  const cameraScale = useUserSettings((s) => s.cameraScale);
  const cameraLowLatency = useUserSettings((s) => s.cameraLowLatency) ?? false;
  const cameraProcessingFps =
    useUserSettings((s) => s.cameraProcessingFps) ?? 15;
  const autoCommitMode =
    useUserSettings((s) => s.autoCommitMode) ?? "wait-for-clear";
  const confirmUncertainDarts =
    useUserSettings((s) => s.confirmUncertainDarts) ?? true;
  const autoScoreConfidenceThreshold =
    useUserSettings((s) => s.autoScoreConfidenceThreshold) ??
    AUTO_COMMIT_CONFIDENCE;
  const autoscoreDetectorMinArea =
    useUserSettings((s) => s.autoscoreDetectorMinArea) ?? 30;
  const autoscoreDetectorThresh =
    useUserSettings((s) => s.autoscoreDetectorThresh) ?? 15;
  const autoscoreDetectorRequireStableN =
    useUserSettings((s) => s.autoscoreDetectorRequireStableN) ?? 2;
  const harshLightingMode =
    useUserSettings((s) => s.harshLightingMode) ?? false;
  const enhanceBigTrebles =
    useUserSettings((s) => s.enhanceBigTrebles) ?? false;
  const cameraEnabled = useUserSettings((s) => s.cameraEnabled);
  const preferredCameraLocked = useUserSettings((s) => s.preferredCameraLocked);
  const hideCameraOverlay = useUserSettings((s) => s.hideCameraOverlay);
  const _cameraRecordDarts = useUserSettings((s) =>
    typeof s.cameraRecordDarts === "boolean" ? s.cameraRecordDarts : true,
  );
  const cameraShowLabels = useUserSettings((s) =>
    typeof s.cameraShowLabels === "boolean" ? s.cameraShowLabels : false,
  );
  const callerEnabled = useUserSettings((s) => s.callerEnabled);
  const speakCheckoutOnly = useUserSettings((s) => s.speakCheckoutOnly);
  const callerVoice = useUserSettings((s) => s.callerVoice);
  const callerVolume = useUserSettings((s) => s.callerVolume);

  // Actions (stable, no need to subscribe to entire state)
  const setPreferredCamera = useUserSettings.getState().setPreferredCamera;
  const setCameraEnabled = useUserSettings.getState().setCameraEnabled;
  const setHideCameraOverlay = useUserSettings.getState().setHideCameraOverlay;
  const setCameraScale = useUserSettings.getState().setCameraScale;
  const setCameraAspect = useUserSettings.getState().setCameraAspect;
  const setCameraFitMode = useUserSettings.getState().setCameraFitMode;
  const preserveCalibrationOverlay = useUserSettings(
    (s) => s.preserveCalibrationOverlay,
  );
  const manualOnly = autoscoreProvider === "manual";
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    [],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [videoReady, setVideoReady] = useState(false); // Track when video has dimensions
  const [showVideoDiagnostics, setShowVideoDiagnostics] = useState(false);
  const [videoDiagnostics, setVideoDiagnostics] =
    useState<VideoDiagnostics | null>(null);
  const cameraSession = useCameraSession();
  const handleVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      (videoRef as unknown as { current: HTMLVideoElement | null }).current =
        el;
      try {
        cameraSession.setVideoElementRef?.(el);
      } catch (e) {
        // Ignore when session store isn't available (should not happen)
      }
    },
    [cameraSession],
  );
  const isPhoneCamera = preferredCameraLabel === "Phone Camera";
  const sessionStream = cameraSession.getMediaStream?.() || null;
  const sessionStreaming = cameraSession.isStreaming;
  const phoneFeedActive =
    isPhoneCamera &&
    cameraSession.mode === "phone" &&
    sessionStreaming &&
    !!sessionStream;
  const effectiveStreaming =
    streaming || sessionStreaming || process.env.NODE_ENV === "test";

  const [cameraStarting, setCameraStarting] = useState(false);

  // Track whether the tab/window is visible so we can pause heavy camera work
  // (overlay drawing + CV detection) when in the background.
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return !document.hidden;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setIsDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Ensure the mounted <video> element always has the active stream attached.
  // This handles cases where the stream is started before the <video> ref mounts
  // (common when switching views or after calibration).
  useEffect(() => {
    if (TEST_MODE) return;
    const v = videoRef.current;
    const s = cameraSession.getMediaStream?.() || null;
    if (!v || !s) return;
    try {
      if (!v.srcObject) {
        v.srcObject = s;
      }
      // Kick playback so metadata/dimensions become available.
      if (typeof v.play === "function") {
        Promise.resolve(v.play()).catch(() => {});
      }
    } catch (e) {}
  }, [cameraSession.isStreaming, cameraSession.mode, preferredCameraId]);

  // Auto-start local camera when enabled and not actively receiving a phone feed.
  useEffect(() => {
    if (TEST_MODE) return;
    if (!cameraEnabled) return;
    if (isPhoneCamera && phoneFeedActive) return;
    const hasAnyStream = !!(cameraSession.getMediaStream?.() || null);
    // If there's no stream at all, start it.
    if (!hasAnyStream && !streaming && !cameraStarting) {
      try {
        void startCamera();
      } catch (e) {}
    }
    // If a stale streaming flag exists but no media tracks, reset and retry
    if (cameraSession.isStreaming && !hasAnyStream && !cameraStarting) {
      try {
        cameraSession.setStreaming(false);
      } catch {}
      try {
        void startCamera();
      } catch (e) {}
    }
  }, [
    cameraEnabled,
    isPhoneCamera,
    phoneFeedActive,
    streaming,
    cameraStarting,
    preferredCameraId,
  ]);

  // Ensure the <video> element begins playback once metadata is ready (covers some browsers blocking autoplay)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) {}
    };
    const onPlaying = () => {
      // When the video transitions to playing, it often gains dimensions.
      try {
        if (v.videoWidth && v.videoHeight) setVideoReady(true);
      } catch {}
    };
    const onResize = () => {
      try {
        if (v.videoWidth && v.videoHeight) setVideoReady(true);
      } catch {}
    };
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("playing", onPlaying);
    // Some browsers fire resize when dimensions become known.
    v.addEventListener("resize", onResize as any);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("resize", onResize as any);
    };
  }, []);

  const collectVideoDiagnostics = useCallback(
    (opts?: { error?: string | null }): VideoDiagnostics => {
      const v = videoRef.current;
      const s = (cameraSession.getMediaStream?.() ||
        null) as MediaStream | null;
      const videoTracks = s ? s.getVideoTracks() : [];
      const audioTracks = s ? s.getAudioTracks() : [];
      return {
        ts: Date.now(),
        hasVideoEl: !!v,
        video: {
          hasSrcObject: !!(v as any)?.srcObject,
          readyState:
            typeof (v as any)?.readyState === "number"
              ? (v as any).readyState
              : null,
          paused:
            typeof (v as any)?.paused === "boolean" ? (v as any).paused : null,
          ended:
            typeof (v as any)?.ended === "boolean" ? (v as any).ended : null,
          videoWidth: v?.videoWidth || 0,
          videoHeight: v?.videoHeight || 0,
        },
        stream: {
          exists: !!s,
          videoTracks: videoTracks.length,
          audioTracks: audioTracks.length,
          videoTrackStates: videoTracks.map((t) => ({
            enabled: t.enabled,
            muted: (t as any).muted,
            readyState: t.readyState,
          })),
        },
        session: {
          mode: (cameraSession as any).mode,
          isStreaming: (cameraSession as any).isStreaming,
        },
        preferredCamera: {
          id: preferredCameraId,
          label: preferredCameraLabel,
          locked: preferredCameraLocked,
        },
        error: opts?.error ?? null,
      };
    },
    [
      cameraSession,
      preferredCameraId,
      preferredCameraLabel,
      preferredCameraLocked,
    ],
  );

  // Poll diagnostics when enabled. This catches the most common "white feed"
  // symptom: stream exists but videoWidth stays 0 and/or track is muted/ended.
  useEffect(() => {
    if (!showVideoDiagnostics) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      try {
        setVideoDiagnostics(collectVideoDiagnostics());
      } catch {}
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [showVideoDiagnostics, collectVideoDiagnostics]);

  // Match window / pop-out helper: always try to start the camera when requested
  useEffect(() => {
    if (TEST_MODE) return;
    if (!forceAutoStart) return;
    try {
      setCameraEnabled(true);
    } catch {}
    if (!streaming && !cameraStarting) {
      try {
        void startCamera();
      } catch (e) {}
    }
  }, [forceAutoStart, streaming, cameraStarting, setCameraEnabled]);

  // Safety net: if the camera is enabled but not yet streaming, attempt to start it.
  // This covers cases where UI shows "calibrated camera linked" but the feed stays black.
  useEffect(() => {
    if (TEST_MODE) return;
    try {
      setCameraEnabled(true);
    } catch {}
    if (!streaming && !cameraStarting) {
      try {
        void startCamera();
      } catch {}
    }
  }, [streaming, cameraStarting, setCameraEnabled]);
  const {
    H,
    imageSize,
    overlaySize,
    theta,
    sectorOffset,
    reset: resetCalibration,
    _hydrated,
    locked,
    errorPx,
  } = useCalibration();
  const ERROR_PX_MAX = 12;
  const CALIBRATION_MIN_CONFIDENCE = 90; // stricter than game-mode minimum; goal is “perfect” autoscore
  // Calibration quality gate: if errorPx is missing, treat it as unknown (not zero).
  // Only allow scoring without errorPx if calibration is explicitly locked.
  const errorPxVal = typeof errorPx === "number" ? errorPx : null;
  const calibrationConfidence = getGlobalCalibrationConfidence(errorPxVal);
  const calibrationValid =
    !!H &&
    !!imageSize &&
    (locked ||
      (errorPxVal != null &&
        errorPxVal <= ERROR_PX_MAX &&
        calibrationConfidence != null &&
        calibrationConfidence >= CALIBRATION_MIN_CONFIDENCE));
  useEffect(() => {
    if (preferredCameraLocked && !hideCameraOverlay) {
      setHideCameraOverlay(true);
    }
  }, [preferredCameraLocked, hideCameraOverlay, setHideCameraOverlay]);
  const [lastAutoScore, setLastAutoScore] = useState<string>("");
  const [manualScore, setManualScore] = useState<string>("");
  const [lastAutoValue, setLastAutoValue] = useState<number>(0);
  const [lastAutoRing, setLastAutoRing] = useState<Ring>("MISS");

  // Visual aid: briefly emphasize big trebles (T20/T19/T18) after detection.
  const bigTrebleFlashRef = useRef<{
    value: 18 | 19 | 20;
    until: number;
  } | null>(null);

  // Bounceout tracking:
  // If a confident candidate is observed but never reaches commit readiness and
  // then disappears, treat it as a bounceout (MISS).
  const bounceoutRef = useRef<{
    pending: boolean;
    lastSeenTs: number;
    lastBullDistanceMm: number | null;
    lastTipVideoPx: Point | null;
  }>({
    pending: false,
    lastSeenTs: 0,
    lastBullDistanceMm: null,
    lastTipVideoPx: null,
  });
  const [pendingDarts, setPendingDarts] = useState<number>(0);
  const pendingDartsRef = useRef<number>(0);
  const [pendingScore, setPendingScore] = useState<number>(0);
  const [pendingEntries, setPendingEntries] = useState<
    {
      label: string;
      value: number;
      ring: Ring;
      meta?: {
        calibrationValid?: boolean;
        pBoard?: Point | null;
        source?: "camera" | "manual";
      };
    }[]
  >([]);

  // 'matchState' hook: declare early to satisfy hook order and be available for gate checks
  const matchState = useMatch((s) => s);
  const [showQuitPause, setShowQuitPause] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  // Gate manual commits in online matches: if any pending entry came from camera and is not calibration-validated, block commit
  const isOnlineMatch = !!(matchState && (matchState as any).roomId);
  const commitBlocked =
    isOnlineMatch &&
    (pendingEntries as any[]).some(
      (e) => e.meta && e.meta.source === "camera" && !e.meta.calibrationValid,
    );
  const [pendingPreOpenDarts, setPendingPreOpenDarts] = useState<number>(0);
  const [pendingDartsAtDouble, setPendingDartsAtDouble] = useState<number>(0);
  const [awaitingClear, setAwaitingClear] = useState(false);
  const pendingCommitRef = useRef<{
    score: number;
    darts: number;
    finished: boolean;
    meta?: {
      label?: string;
      ring?: Ring;
      entries?: { label: string; value: number; ring: string }[];
      frame?: string | null;
    };
  } | null>(null);
  const pendingCommitTimerRef = useRef<number | null>(null);
  // Commit policy:
  // - Default to wait-for-clear for reliability.
  // - Only skip waiting when the user/parent explicitly opts into immediate commits.
  // NOTE: cameraAutoCommit MUST NOT implicitly force immediate commits; that behavior
  // causes premature/incorrect scoring in real play (especially online/tournaments).
  const shouldDeferCommit =
    !immediateAutoCommit && autoCommitMode !== "immediate";
  const [indicatorVersion, setIndicatorVersion] = useState(0);
  const [indicatorEntryVersions, setIndicatorEntryVersions] = useState<
    number[]
  >([]);
  const autoCandidateRef = useRef<AutoCandidate | null>(null);
  const detectionLogRef = useRef<DetectionLogEntry[]>([]);
  const lastAutoCommitRef = useRef<number>(0);
  const streamingStartMsRef = useRef<number>(0);
  const detectionArmedRef = useRef<boolean>(false);
  const detectionArmTimerRef = useRef<number | null>(null);
  const lastMotionLikeEventAtRef = useRef<number>(0);
  const tipStabilityRef = useRef<{
    lastTip: Point | null;
    stableFrames: number;
  }>({ lastTip: null, stableFrames: 0 });
  const frameCountRef = useRef<number>(0);
  const tickRef = useRef<(() => void) | null>(null);
  const [detectionLog, setDetectionLog] = useState<DetectionLogEntry[]>([]);
  const [showDetectionLog, setShowDetectionLog] = useState(false);
  const [lastDetection, setLastDetection] = useState<DetectionLogEntry | null>(
    null,
  );
  const [lastCommit, setLastCommit] = useState<{
    ts: number;
    score: number;
    darts: number;
    frame?: string | null;
  } | null>(null);
  const [_selfTestStatus, setSelfTestStatus] = useState<
    "idle" | "running" | "pass" | "fail"
  >("idle");
  const [_selfTestMessage, setSelfTestMessage] = useState<string | null>(null);

  // Diagnostics overlay (hidden by default)
  // Toggle with Ctrl+Shift+D (or Cmd+Shift+D on Mac).
  const [showDiagnosticsOverlay, setShowDiagnosticsOverlay] = useState(false);
  const diagnosticsRef = useRef<{
    lastTs: number;
    lastTip?: Point | null;
    lastPcal?: Point | null;
    lastPboard?: Point | null;
    lastConfidence?: number | null;
    lastLabel?: string | null;
    lastValue?: number | null;
    lastRing?: Ring | null;
    lastReject?: string | null;
  }>({ lastTs: 0 });
  const [, setDiagnosticsTick] = useState(0);
  const updateDiagnostics = useCallback(
    (patch: Partial<(typeof diagnosticsRef)["current"]>) => {
      try {
        diagnosticsRef.current = {
          ...diagnosticsRef.current,
          ...patch,
          lastTs: Date.now(),
        };
        // Lightweight re-render when overlay is open.
        if (showDiagnosticsOverlay) setDiagnosticsTick((n) => (n + 1) % 100000);
        try {
          (window as any).ndnAutoscoreDiagnostics = diagnosticsRef.current;
        } catch {}
      } catch {}
    },
    [showDiagnosticsOverlay],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      try {
        const key = String(e.key || "").toLowerCase();
        if (key !== "d") return;
        if (!(e.shiftKey && (e.ctrlKey || e.metaKey))) return;
        e.preventDefault();
        setShowDiagnosticsOverlay((v) => !v);
      } catch {}
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // If a detection is below the confidence threshold and confirm is enabled,
  // hold it for user confirmation instead of immediately applying it.
  const [pendingConfirm, setPendingConfirm] = useState<null | {
    label: string;
    value: number;
    ring: Ring;
    confidence: number;
    meta?: any;
  }>(null);

  const maybeHoldForConfirmation = useCallback(
    (payload: {
      value: number;
      label: string;
      ring: Ring;
      confidence?: number;
      meta?: any;
    }) => {
      try {
        if (!confirmUncertainDarts) return false;
        if (pendingConfirm) return true;
        const conf = Number(payload.confidence);
        if (!isFinite(conf)) return false;
        const effectiveThreshold = Math.max(
          0.5,
          Math.min(
            0.99,
            Number(autoScoreConfidenceThreshold) || AUTO_COMMIT_CONFIDENCE,
          ),
        );
        if (conf >= effectiveThreshold) return false;
        setPendingConfirm({
          label: payload.label,
          value: payload.value,
          ring: payload.ring,
          confidence: conf,
          meta: payload.meta,
        });
        return true;
      } catch {
        return false;
      }
    },
    [
      confirmUncertainDarts,
      pendingConfirm,
      autoScoreConfidenceThreshold,
      setPendingConfirm,
    ],
  );

  // Bull-up-only gate: when CameraView is used in custom mode for bull-up,
  // only the first dart should count. Any further darts are void.
  //
  // We implement this entirely inside CameraView so it applies to Offline,
  // Online, and Tournament flows that reuse the same component.
  const bullUpFirstDartTakenRef = useRef(false);
  useEffect(() => {
    // Reset when switching scoring modes (or remount).
    bullUpFirstDartTakenRef.current = false;
  }, [scoringMode]);
  const clearPendingCommitTimer = useCallback(() => {
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
  }, []);

  const clampCameraScale = useCallback((value: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 1;
    return Math.min(1.25, Math.max(0.5, Math.round(value * 100) / 100));
  }, []);

  const adjustCameraScale = useCallback(
    (delta: number) => {
      if (!setCameraScale) return;
      const next = clampCameraScale((cameraScale ?? 1) + delta);
      setCameraScale(next);
    },
    [cameraScale, clampCameraScale, setCameraScale],
  );

  const setFullPreview = useCallback(() => {
    if (setCameraFitMode) setCameraFitMode("fill");
    if (setCameraAspect) setCameraAspect("wide");
  }, [setCameraFitMode, setCameraAspect]);

  const setWidePreview = useCallback(() => {
    if (setCameraFitMode) setCameraFitMode("fit");
    if (setCameraAspect) setCameraAspect("wide");
  }, [setCameraFitMode, setCameraAspect]);

  // Compact rendering path is built later (after dependent callbacks) to avoid TDZ issues.

  useImperativeHandle(ref, () => ({
    runDetectionTick: () => {
      try {
        if (tickRef.current) tickRef.current();
      } catch (e) {}
    },
    // Expose a test-only direct dart add method so tests can deterministically
    // exercise addDart and commit logic without depending on CV timing or detection.
    __test_addDart:
      process.env.NODE_ENV === "test"
        ? (
            v: number,
            l: string,
            r: Ring,
            meta?: any,
            opts?: { emulateApplyAutoHit?: boolean },
          ) => {
            try {
              // Mimic the detection/ack path: notify parent synchronously and allow
              // it to ACK ownership (return true) to prevent the local commit path.
              let skipLocalCommit = false;
              try {
                if (onAutoDart) {
                  const mult =
                    r === "TRIPLE"
                      ? 3
                      : r === "DOUBLE"
                        ? 2
                        : r === "MISS"
                          ? 0
                          : 1;
                  const pSig = `${v}|${r}|${mult}`;
                  const pNow = performance.now();
                  if (
                    !(
                      pSig === lastParentSigRef.current &&
                      pNow - lastParentSigAtRef.current <
                        AUTO_COMMIT_COOLDOWN_MS
                    )
                  ) {
                    const maybe = onAutoDart(v, r, {
                      sector: null,
                      mult: mult as 0 | 1 | 2 | 3,
                      calibrationValid: true,
                      pBoard: meta?.pBoard ?? null,
                    });
                    if (maybe === true) {
                      lastParentSigRef.current = pSig;
                      lastParentSigAtRef.current = pNow;
                      skipLocalCommit = true;
                    }
                  }
                }
              } catch (e) {
                /* swallow */
              }

              if (!skipLocalCommit) {
                // If test provides a confidence for a camera-sourced dart and confirmation
                // mode is on, route into the confirm modal instead of applying.
                try {
                  const conf = meta?.confidence;
                  const src = meta?.source;
                  if (
                    src === "camera" &&
                    maybeHoldForConfirmation({
                      value: v,
                      label: l,
                      ring: r,
                      confidence: conf,
                      meta: meta,
                    })
                  ) {
                    return;
                  }
                } catch {}

                // Keep test helper deterministic: always add to pending, and let each
                // unit test decide whether/when a visit commit should happen.
                //
                // We still emulate dedupe/in-flight locking when requested so tests
                // can validate "no double-commit" behavior without relying on timing.
                if (opts?.emulateApplyAutoHit) {
                  const mult =
                    r === "TRIPLE"
                      ? 3
                      : r === "DOUBLE"
                        ? 2
                        : r === "MISS"
                          ? 0
                          : 1;
                  const sig = `${v}|${r}|${mult}`;
                  const now = performance.now();
                  if (inFlightAutoCommitRef.current) return;
                  inFlightAutoCommitRef.current = true;
                  try {
                    window.setTimeout(
                      () => {
                        inFlightAutoCommitRef.current = false;
                      },
                      Math.max(120, AUTO_COMMIT_COOLDOWN_MS),
                    );
                  } catch (e) {}
                  if (
                    now - lastAutoSigAtRef.current < AUTO_COMMIT_COOLDOWN_MS &&
                    sig === lastAutoSigRef.current
                  )
                    return;
                  lastAutoSigRef.current = sig;
                  lastAutoSigAtRef.current = now;
                }

                try {
                  addDart(v, l, r, meta);
                } catch (e) {
                  /* ignore */
                }
              }
            } catch (e) {}
          }
        : undefined,
    __test_commitVisit:
      process.env.NODE_ENV === "test"
        ? () => {
            try {
              onCommitVisit();
            } catch (e) {}
          }
        : undefined,
    runSelfTest: async () => {
      try {
        return await runSelfTest();
      } catch (e) {
        return false;
      }
    },
    __test_forceSetPendingVisit:
      process.env.NODE_ENV === "test"
        ? (entries: Array<{ label: string; value: number; ring: Ring }>) => {
            try {
              const safe = (entries || []).slice(0, 3);
              const darts = safe.length;
              const total = safe.reduce(
                (sum, e) => sum + (Number((e as any)?.value) || 0),
                0,
              );
              setPendingEntries(
                safe.map((e) => ({
                  ...e,
                  meta: {
                    calibrationValid: true,
                    pBoard: null,
                    source: "camera",
                  },
                })) as any,
              );
              setPendingDarts(darts);
              pendingDartsRef.current = darts;
              setPendingScore(total);
              try {
                usePendingVisit.getState().setVisit(safe as any, darts, total);
              } catch (e) {}
            } catch (e) {}
          }
        : undefined,
  }));

  const captureDetectionLog = useCallback((entry: DetectionLogEntry) => {
    try {
      const f = captureFrame();
      if (f) entry.frame = f;
    } catch (e) {}
    const next = [...detectionLogRef.current.slice(-8), entry];
    detectionLogRef.current = next;
    setDetectionLog(next);
    try {
      setLastDetection(entry);
    } catch (e) {}
    try {
      (window as any).ndnCameraDiagnostics = next;
    } catch (e) {}
  }, []);

  // Play a short bell sound using WebAudio if available. No-op in test env.
  const playBell = useCallback(() => {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 1000;
      g.gain.value = 0.0015;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        try {
          o.stop();
          ctx.close?.();
        } catch (e) {}
      }, 120);
    } catch (e) {}
  }, []);

  // Run a self-test: run a few detection ticks and look for an accepted/ready detection
  const runSelfTest = useCallback(async () => {
    try {
      setSelfTestStatus("running");
      setSelfTestMessage(null);
      // clear recent detections
      detectionLogRef.current = [];
      setDetectionLog([]);
      // run a few ticks spaced out
      const tries = 6;
      for (let i = 0; i < tries; i++) {
        try {
          if (tickRef.current) tickRef.current();
        } catch (e) {}
        // wait a bit
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 180));
      }
      const logs = detectionLogRef.current.slice();
      const ok = logs.some(
        (e) =>
          e.accepted ||
          (e.ready &&
            e.confidence >=
              (autoScoreConfidenceThreshold ?? AUTO_COMMIT_CONFIDENCE)),
      );
      if (ok) {
        setSelfTestStatus("pass");
        setSelfTestMessage("Detection OK");
      } else {
        setSelfTestStatus("fail");
        setSelfTestMessage(
          logs.length
            ? `No accepted detections (best confidence ${(logs[logs.length - 1].confidence || 0).toFixed(2)})`
            : "No detections",
        );
      }
    } catch (e) {
      setSelfTestStatus("fail");
      setSelfTestMessage("Self-test error");
    } finally {
      // reset to idle after a short delay so the UI can rerun
      setTimeout(() => setSelfTestStatus("idle"), 3000);
    }
  }, [autoScoreConfidenceThreshold]);
  const captureFrame = useCallback((): string | null => {
    try {
      const v = videoRef.current as HTMLVideoElement | null;
      if (!v || !v.videoWidth || !v.videoHeight) return null;
      const w = 640;
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.5);
    } catch (e) {
      return null;
    }
  }, []);

  const finalizePendingCommit = useCallback(
    (_trigger: "event" | "timeout" | "teardown") => {
      const pending = pendingCommitRef.current;
      if (!pending) return;
      pendingCommitRef.current = null;
      clearPendingCommitTimer();
      setAwaitingClear(false);

      // Voice announcements happen at the commit boundary (never per-dart).
      // 1) Speak the latest bull distance (mm) for this visit, if available.
      // 2) Speak the final 3-dart visit total.
      try {
        const maybeEntries = (pending.meta as any)?.entries as
          | Array<{ meta?: { bullDistanceMm?: number } }>
          | undefined;
        const lastBull =
          maybeEntries?.[maybeEntries.length - 1]?.meta?.bullDistanceMm;
        sayBullDistanceMm(lastBull);
      } catch {}
      try {
        sayVisitTotal(pending.score);
      } catch {}

      if (onVisitCommitted) {
        try {
          onVisitCommitted(
            pending.score,
            pending.darts,
            pending.finished,
            pending.meta,
          );
          try {
            // Notify other windows that a visit was committed
            broadcastMessage({
              type: "visit",
              score: pending.score,
              darts: pending.darts,
              finished: pending.finished,
              meta: pending.meta,
              playerIdx: matchState.currentPlayerIdx,
              ts: Date.now(),
            });
            // Also write a full snapshot so remote windows can fully reconstruct state
            try {
              writeMatchSnapshot();
            } catch (e) {}
            try {
              const f = captureFrame();
              setLastCommit({
                ts: Date.now(),
                score: pending.score,
                darts: pending.darts,
                frame: f,
              });
            } catch (e) {}
          } catch (e) {}
        } catch (e) {}
      }
    },
    [onVisitCommitted, clearPendingCommitTimer],
  );
  const enqueueVisitCommit = useCallback(
    (payload: {
      score: number;
      darts: number;
      finished: boolean;
      meta?: {
        label?: string;
        ring?: Ring;
        entries?: { label: string; value: number; ring: string }[];
        frame?: string | null;
      };
    }) => {
      if (!onVisitCommitted) return;
      if (!shouldDeferCommit) {
        // Same announcements in immediate mode.
        try {
          const maybeEntries = (payload.meta as any)?.entries as
            | Array<{ meta?: { bullDistanceMm?: number } }>
            | undefined;
          const lastBull =
            maybeEntries?.[maybeEntries.length - 1]?.meta?.bullDistanceMm;
          sayBullDistanceMm(lastBull);
        } catch {}
        try {
          sayVisitTotal(payload.score);
        } catch {}
        try {
          onVisitCommitted(
            payload.score,
            payload.darts,
            payload.finished,
            payload.meta,
          );
        } catch (e) {}
        return;
      }
      pendingCommitRef.current = payload;
      setAwaitingClear(true);
      clearPendingCommitTimer();
      pendingCommitTimerRef.current = window.setTimeout(
        () => finalizePendingCommit("timeout"),
        BOARD_CLEAR_GRACE_MS,
      );
    },
    [
      onVisitCommitted,
      shouldDeferCommit,
      clearPendingCommitTimer,
      finalizePendingCommit,
      sayBullDistanceMm,
      sayVisitTotal,
    ],
  );
  const clearPendingManual = useCallback((reason: "indicator" | "toolbar") => {
    setPendingDarts(0);
    pendingDartsRef.current = 0;
    setPendingScore(0);
    setPendingEntries([]);
    setPendingPreOpenDarts(0);
    setPendingDartsAtDouble(0);
    setHadRecentAuto(false);
    try {
      window.dispatchEvent(
        new CustomEvent("ndn:clear-visit-request", {
          detail: { source: "camera-view", reason, ts: Date.now() },
        }),
      );
    } catch (e) {}
  }, []);
  useEffect(() => {
    if (!shouldDeferCommit) return;
    const handler = () => finalizePendingCommit("event");
    window.addEventListener("ndn:darts-cleared", handler as EventListener);
    return () =>
      window.removeEventListener("ndn:darts-cleared", handler as EventListener);
  }, [shouldDeferCommit, finalizePendingCommit]);
  useEffect(() => {
    if (!shouldDeferCommit) finalizePendingCommit("timeout");
  }, [shouldDeferCommit, finalizePendingCommit]);
  useEffect(
    () => () => finalizePendingCommit("teardown"),
    [finalizePendingCommit],
  );
  const handleIndicatorReset = useCallback(() => {
    clearPendingManual("indicator");
    setIndicatorVersion((v) => v + 1);
  }, [clearPendingManual]);
  const handleToolbarClear = useCallback(() => {
    if (pendingDarts === 0 && pendingScore === 0) return;
    clearPendingManual("toolbar");
    setIndicatorVersion((v) => v + 1);
  }, [clearPendingManual, pendingDarts, pendingScore]);
  const requestDeviceManager = useCallback(() => {
    if (manualOnly) return;
    try {
      window.dispatchEvent(
        new CustomEvent("ndn:open-camera-manager", {
          detail: { source: "camera-view", ts: Date.now() },
        }),
      );
    } catch (err) {
      console.warn("[CameraView] Failed to request camera manager:", err);
    }
  }, [manualOnly]);
  // X01 Double-In handling: per-player opened state in this session
  const x01DoubleInSetting = useUserSettings((s) => s.x01DoubleIn);
  const x01DoubleIn =
    typeof x01DoubleInOverride === "boolean"
      ? !!x01DoubleInOverride
      : !!x01DoubleInSetting;
  const [openedById, setOpenedById] = useState<Record<string, boolean>>({});
  // 'matchState' is intentionally declared above to satisfy hook order.
  const currentPlayerId = matchState.players[matchState.currentPlayerIdx]?.id;
  const isOpened = !!(currentPlayerId && openedById[currentPlayerId]);
  const setOpened = (v: boolean) => {
    if (!currentPlayerId) return;
    setOpenedById((m) => ({ ...m, [currentPlayerId]: v }));
  };
  const inProgress = (matchState as any)?.inProgress;
  // Broadcast pending visit to global store so Scoreboard can visualize dots
  const setVisit = usePendingVisit((s) => s.setVisit);
  const resetPendingVisit = usePendingVisit((s) => s.reset);
  useEffect(() => {
    try {
      setVisit(pendingEntries as any, pendingDarts, pendingScore);
      if (TEST_MODE) return;
      // Broadcast pending visit so remote windows can visualise per-dart hits in near realtime.
      try {
        const msg: any = {
          type: "pendingVisit",
          entries: pendingEntries,
          darts: pendingDarts,
          total: pendingScore,
          playerIdx: matchState.currentPlayerIdx,
          ts: Date.now(),
        };
        // attempt to include a small thumbnail of the camera if available (throttled)
        try {
          const v = videoRef.current as HTMLVideoElement | null;
          if (v && v.videoWidth && v.videoHeight) {
            const w = 320;
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || 180;
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            if (ctx) {
              ctx.drawImage(v, 0, 0, w, h);
              try {
                msg.frame = c.toDataURL("image/jpeg", 0.45);
              } catch (e) {}
            }
          }
        } catch (e) {}
        broadcastMessage(msg);
      } catch (e) {}
    } catch (e) {}
  }, [pendingEntries, pendingDarts, pendingScore, setVisit]);
  useEffect(
    () => () => {
      try {
        resetPendingVisit();
      } catch (e) {}
    },
    [resetPendingVisit],
  );
  const addVisit = useMatch((s) => s.addVisit);
  const endLeg = useMatch((s) => s.endLeg);
  // Helper: convert the current pendingEntries into a minimal, serializable
  // per-dart breakdown that can be stored with the committed visit.
  const snapshotPendingDartEntries = useCallback((entries: any[]) => {
    try {
      if (!Array.isArray(entries)) return undefined;
      return entries.slice(0, 3).map((e) => ({
        label: String(e?.label ?? ""),
        value: Number(e?.value ?? 0),
        ring: String(e?.ring ?? ""),
      }));
    } catch {
      return undefined;
    }
  }, []);
  // Prefer provided adapters (matchActions wrappers) when available
  const callAddVisit = (score: number, darts: number, meta?: any) => {
    try {
      dlog("CameraView: callAddVisit", score, darts, meta);
      if (onAddVisit) onAddVisit(score, darts, meta);
      else addVisit(score, darts, meta);
      try {
        // Broadcast immediate committed visit to remote windows and update snapshot
        broadcastMessage({
          type: "visit",
          score,
          darts,
          playerIdx: matchState.currentPlayerIdx,
          ts: Date.now(),
        });
        try {
          writeMatchSnapshot();
        } catch (e) {}
      } catch (e) {}
    } catch {
      /* noop */
    }
  };
  const callEndLeg = (score?: number) => {
    try {
      if (onEndLeg) onEndLeg(score);
      else endLeg(typeof score === "number" ? score : 0);
    } catch {
      /* noop */
    }
  };
  const addHeatSample = useHeatmapStore((s) => s.addSample);
  // Quick entry dropdown selections
  const [quickSelAuto, setQuickSelAuto] = useState("");
  const [quickSelManual, setQuickSelManual] = useState("");
  const [nonRegCount, setNonRegCount] = useState(0);
  const [showRecalModal, setShowRecalModal] = useState(false);
  const [hadRecentAuto, setHadRecentAuto] = useState(false);
  const [_pulseManualPill, setPulseManualPill] = useState(false);
  const [activeTab, setActiveTab] = useState<"auto" | "manual">("auto");
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const manualPreviewRef = useRef<HTMLCanvasElement | null>(null);
  // Dart timer
  const dartTimerEnabled = useUserSettings((s) => s.dartTimerEnabled);
  const dartTimerSeconds = useUserSettings((s) => s.dartTimerSeconds) || 10;
  const [dartTimeLeft, setDartTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const paused = useMatchControl((s) => s.paused);
  // Built-in CV detector
  const detectorRef = useRef<DartDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastProcessedRef = useRef<number>(0);
  const lastAutoSigRef = useRef<string | null>(null);
  const lastAutoSigAtRef = useRef<number>(0);
  const lastParentSigRef = useRef<string | null>(null);
  const lastParentSigAtRef = useRef<number>(0);
  const inFlightAutoCommitRef = useRef<boolean>(false);
  const pulseTimeoutRef = useRef<number | null>(null);
  const [detectorSeedVersion, setDetectorSeedVersion] = useState(0);
  const handlePhoneReconnect = useCallback(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("ndn:phone-camera-reconnect", {
          detail: { source: "camera-view", ts: Date.now() },
        }),
      );
    } catch (err) {
      console.warn("[CameraView] Phone camera reconnect dispatch failed:", err);
    }
  }, []);
  // Open Autoscore modal from parent via global event
  useEffect(() => {
    const onOpen = () => {
      if (!manualOnly) setShowAutoModal(true);
    };
    window.addEventListener("ndn:open-autoscore" as any, onOpen);
    return () =>
      window.removeEventListener("ndn:open-autoscore" as any, onOpen);
  }, [manualOnly]);

  // cleanup pulse timer on unmount
  useEffect(() => {
    return () => {
      try {
        if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      } catch (e) {}
    };
  }, []);

  // Open Scoring (Camera + Pending Visit) modal from parent via global event
  useEffect(() => {
    const onOpen = () => setShowScoringModal(true);
    window.addEventListener("ndn:open-scoring" as any, onOpen);
    return () => window.removeEventListener("ndn:open-scoring" as any, onOpen);
  }, []);

  useEffect(() => {
    const onDartsCleared = () => {
      setIndicatorVersion((v) => v + 1);
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      setPendingPreOpenDarts(0);
      setPendingDartsAtDouble(0);
      setHadRecentAuto(false);
    };
    window.addEventListener(
      "ndn:darts-cleared",
      onDartsCleared as EventListener,
    );
    return () =>
      window.removeEventListener(
        "ndn:darts-cleared",
        onDartsCleared as EventListener,
      );
  }, []);

  useEffect(() => {
    setIndicatorEntryVersions((prev) => {
      if (pendingEntries.length > prev.length) {
        const diff = pendingEntries.length - prev.length;
        return [...prev, ...Array(diff).fill(indicatorVersion)];
      }
      if (pendingEntries.length < prev.length) {
        return prev.slice(0, pendingEntries.length);
      }
      return prev;
    });
  }, [pendingEntries, indicatorVersion]);

  useEffect(() => {
    if (detectionArmTimerRef.current) {
      clearTimeout(detectionArmTimerRef.current);
      detectionArmTimerRef.current = null;
    }
    if (manualOnly) {
      detectionArmedRef.current = false;
      streamingStartMsRef.current = 0;
      autoCandidateRef.current = null;
      return;
    }
    if (effectiveStreaming) {
      streamingStartMsRef.current = performance.now();
      autoCandidateRef.current = null;
      detectionArmedRef.current = false;
      frameCountRef.current = 0;
      detectionArmTimerRef.current = window.setTimeout(() => {
        detectionArmedRef.current = true;
        detectionArmTimerRef.current = null;
      }, DETECTION_ARM_DELAY_MS);
    } else {
      streamingStartMsRef.current = 0;
      autoCandidateRef.current = null;
      detectionArmedRef.current = false;
      frameCountRef.current = 0;
    }
    return () => {
      if (detectionArmTimerRef.current) {
        clearTimeout(detectionArmTimerRef.current);
        detectionArmTimerRef.current = null;
      }
      detectionArmedRef.current = false;
      frameCountRef.current = 0;
      tickRef.current = null;
    };
  }, [effectiveStreaming, manualOnly]);

  // Enumerate devices on mount and when devices change so USB webcams appear quickly
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        if (!navigator?.mediaDevices?.enumerateDevices) return;
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        setAvailableCameras(list.filter((d) => d.kind === "videoinput"));
      } catch (err) {
        console.warn("[CAMERA] enumerateDevices failed:", err);
      }
    }
    refresh();
    try {
      navigator.mediaDevices.addEventListener("devicechange", refresh);
    } catch {
      try {
        (navigator.mediaDevices as any).ondevicechange = refresh;
      } catch (e) {}
    }
    return () => {
      mounted = false;
      try {
        navigator.mediaDevices.removeEventListener("devicechange", refresh);
      } catch (e) {}
    };
  }, []);

  // Allow parent to open/close the manual modal via global events
  useEffect(() => {
    const onOpen = () => {
      setActiveTab("manual");
      setShowManualModal(true);
    };
    const onClose = () => {
      setActiveTab("auto");
      setShowManualModal(false);
    };
    window.addEventListener("ndn:open-manual" as any, onOpen);
    window.addEventListener("ndn:close-manual" as any, onClose);
    return () => {
      window.removeEventListener("ndn:open-manual" as any, onOpen);
      window.removeEventListener("ndn:close-manual" as any, onClose);
    };
  }, []);

  useEffect(() => {
    if (manualOnly) {
      setActiveTab("manual");
      setShowAutoModal(false);
    }
  }, [manualOnly]);

  // Reset open state at the start of a leg (no darts thrown yet), keep across visits within leg
  useEffect(() => {
    try {
      const p = matchState.players[matchState.currentPlayerIdx];
      const leg = p?.legs?.[p.legs.length - 1];
      if (!p) return;
      if (!leg || leg.dartsThrown === 0) {
        setOpenedById((m) => ({ ...m, [p.id]: false }));
      }
    } catch (e) {}
  }, [
    matchState.currentPlayerIdx,
    matchState.players?.[matchState.currentPlayerIdx]?.legs?.length,
  ]);

  // Manage per-dart timer lifecycle
  useEffect(() => {
    if (TEST_MODE) {
      // TEST_MODE: no-op (keep timers clean)
      if (timerRef.current) {
        clearInterval(timerRef.current as any);
        timerRef.current = null;
      }
      setDartTimeLeft(null);
      return;
    }
    const shouldRun =
      !!dartTimerEnabled && inProgress && !paused && pendingDarts < 3;
    // Clear any existing interval
    if (timerRef.current) {
      clearInterval(timerRef.current as any);
      timerRef.current = null;
    }
    if (!shouldRun) {
      setDartTimeLeft(null);
      return;
    }
    // Reset timer each time dependencies change (new dart, player change, setting change)
    setDartTimeLeft(dartTimerSeconds);
    timerRef.current = window.setInterval(() => {
      setDartTimeLeft((prev) => {
        const next = (prev ?? dartTimerSeconds) - 1;
        if (next <= 0) {
          // Time expired: guarantee the visit completes to 3 darts by auto-filling
          // the remaining darts as MISS. This keeps gameplay moving even when the
          // camera misses a dart or the player pauses.
          try {
            const already = pendingDartsRef.current || 0;
            const remaining = Math.max(0, 3 - already);
            for (let i = 0; i < remaining; i++) {
              addDart(0, "MISS 0", "MISS");
            }
          } catch (e) {}
          // Stop interval until effect re-initializes on state change
          if (timerRef.current) {
            clearInterval(timerRef.current as any);
            timerRef.current = null;
          }
          return 0;
        }
        return next;
      });
    }, 1000) as any;
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current as any);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dartTimerEnabled,
    dartTimerSeconds,
    pendingDarts,
    matchState.currentPlayerIdx,
    (matchState as any)?.inProgress,
    paused,
  ]);

  // Drive a lightweight live preview inside the manual modal from the main video element
  useEffect(() => {
    if (TEST_MODE || !showManualModal) return;
    const id = setInterval(() => {
      try {
        const v = videoRef.current;
        const c = manualPreviewRef.current;
        if (!v || !c) return;
        // In test env and certain fallback cases the video element may not have
        // intrinsic dimensions; use calibration image size as a fallback so
        // detection can proceed in the JSDOM test harness.
        const vw =
          v.videoWidth ||
          (process.env.NODE_ENV === "test" ? (imageSize?.w ?? 0) : 0);
        const vh =
          v.videoHeight ||
          (process.env.NODE_ENV === "test" ? (imageSize?.h ?? 0) : 0);
        if (!vw || !vh) return;
        const cw = c.clientWidth || 640;
        const ch = c.clientHeight || 360;
        const dpr = Math.max(
          1,
          Math.round(((window.devicePixelRatio as number) || 1) * 100) / 100,
        );
        // DPR-aware backing store so the preview isn't blurry on high-DPI screens
        const bw = Math.floor(cw * dpr);
        const bh = Math.floor(ch * dpr);
        if (c.width !== bw) c.width = bw;
        if (c.height !== bh) c.height = bh;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        try {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } catch {}
        // Letterbox fit
        const scale = Math.min(cw / vw, ch / vh);
        const dw = Math.round(vw * scale);
        const dh = Math.round(vh * scale);
        const dx = Math.floor((cw - dw) / 2);
        const dy = Math.floor((ch - dh) / 2);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(v, dx, dy, dw, dh);
      } catch (e) {
        // Silently ignore preview update errors
        console.warn("Manual preview update error:", e);
      }
    }, 120);
    return () => clearInterval(id);
  }, [showManualModal]);

  useEffect(() => {
    // Do not auto-stop the camera when the view unmounts. We want the camera stream
    // to persist across navigation so calibration and pairing aren't lost when switching
    // between Offline/Online/Tournaments. This keeps the global cameraSession's
    // mediaStream active and allows other views to reuse it.
    return () => {
      // intentionally no-op: camera continues running in global session
    };
  }, []);

  const canFallbackToLocal = isPhoneCamera && !phoneFeedActive;

  async function startCamera() {
    const existingStream =
      (cameraSession.getMediaStream?.() as MediaStream | null) ||
      ((videoRef.current?.srcObject as MediaStream | null) ?? null);
    const hasActiveTracks = (() => {
      try {
        const anyStream: any = existingStream as any;
        if (!anyStream) return false;
        const fn = anyStream.getVideoTracks;
        if (typeof fn !== "function") return false;
        return !!fn.call(anyStream)?.length;
      } catch {
        return false;
      }
    })();
    if (cameraStarting || (streaming && hasActiveTracks)) return;

    // Only skip local startup when the phone feed is actively streaming
    if (isPhoneCamera && phoneFeedActive) {
      const phoneTracks = existingStream?.getVideoTracks?.() || [];
      const phoneActive = phoneTracks.some((t) => t.readyState === "live");
      if (phoneActive) {
        dlog("[CAMERA] Phone camera stream active - leaving local camera idle");
        setCameraStarting(false);
        return;
      }
      // If flagged active but no live tracks, fall back to local camera startup
      dlog(
        "[CAMERA] Phone feed flagged active but no live tracks; starting local camera",
      );
    }

    setCameraStarting(true);
    dlog("[CAMERA] Starting camera...");
    try {
      setCameraAccessError(null);
    } catch {}

    // Best-effort anti-glare hints. These are optional constraints; many browsers/devices
    // ignore them. If they fail, we just proceed with the stream as-is.
    const applyAntiGlare = async (track: MediaStreamTrack | undefined) => {
      if (!track) return;
      // Only video tracks support these constraint keys.
      if (track.kind !== "video") return;

      // Only apply camera-track constraints when the user opted into
      // harsh lighting mode OR the legacy localStorage flag is enabled.
      const enabled =
        harshLightingMode ||
        (typeof window !== "undefined" &&
          window.localStorage?.getItem("ndn.glareClamp") === "1");
      if (!enabled) return;
      const caps: any = (track as any).getCapabilities?.() || {};
      const supports = (k: string) => k in caps;

      // Prefer: reduce over-exposure highlights & avoid backlight compensation
      // which can brighten the board and blow out whites.
      const desired: any = {
        // Some cams expose this as a mode rather than a boolean.
        // We try a conservative setting.
        ...(supports("exposureMode") ? { exposureMode: "continuous" } : {}),
        ...(supports("whiteBalanceMode")
          ? { whiteBalanceMode: "continuous" }
          : {}),
        ...(supports("focusMode") ? { focusMode: "continuous" } : {}),
        ...(supports("sharpness") ? { sharpness: caps.sharpness?.max } : {}),
        ...(supports("contrast") ? { contrast: caps.contrast?.max } : {}),
        // Minimize any auto "backlight" boosting.
        ...(supports("backlightCompensation")
          ? { backlightCompensation: false }
          : {}),
      };

      // If nothing is supported, skip.
      if (!Object.keys(desired).length) return;

      try {
        await (track as any).applyConstraints(desired);
        dlog("[CAMERA] Applied anti-glare track constraints:", desired);
      } catch (e) {
        console.warn("[CAMERA] Anti-glare track constraints not supported:", e);
      }
    };
    try {
      // If a preferred camera is set, request it; otherwise default to back camera on mobile
      // Prefer a crisp feed (up to 4K) but let the browser/device fall back.
      // Note: requesting 4K can increase CPU usage; we keep frameRate modest.
      const qualityHints4k: MediaTrackConstraints = {
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30 },
      };
      const qualityHints1440p: MediaTrackConstraints = {
        width: { ideal: 2560 },
        height: { ideal: 1440 },
        frameRate: { ideal: 30 },
      };
      const qualityHints1080p: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      };
      const qualityHints720p: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      };
      const baseVideo: MediaTrackConstraints = preferredCameraId
        ? { deviceId: { exact: preferredCameraId } }
        : { facingMode: "environment" };

      const tryGetStream = async (
        hints: MediaTrackConstraints,
        label: string,
      ): Promise<MediaStream> => {
        const constraints: MediaStreamConstraints = {
          video: { ...baseVideo, ...hints },
          audio: false,
        };
        dlog(`[CAMERA] Using constraints (${label}):`, constraints);
        return navigator.mediaDevices.getUserMedia(constraints);
      };

      let stream: MediaStream;
      try {
        // If user prefers low-latency, attempt 720p first to reduce CPU/bandwidth
        if (cameraLowLatency) {
          try {
            stream = await tryGetStream(qualityHints720p, "720p");
          } catch (e720: any) {
            console.warn("[CAMERA] 720p request failed, falling back:", e720);
            try {
              stream = await tryGetStream(qualityHints1080p, "1080p");
            } catch (err1080: any) {
              console.warn("[CAMERA] 1080p failed, trying 1440p:", err1080);
              stream = await tryGetStream(qualityHints1440p, "1440p");
            }
          }
        } else {
          try {
            stream = await tryGetStream(qualityHints4k, "4k");
          } catch (err4k: any) {
            console.warn("[CAMERA] 4K request failed, trying 1440p:", err4k);
            try {
              stream = await tryGetStream(qualityHints1440p, "1440p");
            } catch (err1440: any) {
              console.warn(
                "[CAMERA] 1440p request failed, trying 1080p:",
                err1440,
              );
              stream = await tryGetStream(qualityHints1080p, "1080p");
            }
          }
        }
        dlog("[CAMERA] Got stream:", !!stream);
      } catch (err: any) {
        console.warn("[CAMERA] First attempt failed:", err);
        // Fallback if specific device isn't available or facingMode not supported
        const name = (err && (err.name || err.code)) || "";
        if (
          preferredCameraId &&
          (name === "OverconstrainedError" || name === "NotFoundError")
        ) {
          dlog("[CAMERA] Trying fallback without deviceId");
          stream = await navigator.mediaDevices.getUserMedia({
            video: { ...qualityHints1440p },
            audio: false,
          });
        } else if (
          !preferredCameraId &&
          (name === "OverconstrainedError" ||
            name === "NotFoundError" ||
            name === "NotSupportedError")
        ) {
          dlog("[CAMERA] Trying fallback for facingMode not supported");
          // Fallback for devices that don't support facingMode
          stream = await navigator.mediaDevices.getUserMedia({
            video: { ...qualityHints1440p },
            audio: false,
          });
        } else {
          throw err;
        }
      }
      if (videoRef.current) {
        dlog("[CAMERA] Setting stream to video element");
        videoRef.current.srcObject = stream;

        // Apply anti-glare hints after we have the actual track.
        // This is particularly helpful at 1080p where glare can blow out ring edges.
        // NOTE: in tests, the MediaStream mock may not implement getVideoTracks.
        try {
          const track = (stream as any)?.getVideoTracks?.()?.[0];
          await applyAntiGlare(track);
        } catch {}

        try {
          await videoRef.current.play();
        } catch (e) {}
        dlog(
          "[CAMERA] Stream tracks:",
          stream.getTracks().length,
          "video tracks:",
          stream.getVideoTracks().length,
        );
        // Add event listeners for debugging
        videoRef.current.addEventListener("loadeddata", () =>
          dlog("[CAMERA] Video loadeddata"),
        );
        videoRef.current.addEventListener("loadedmetadata", () => {
          dlog("[CAMERA] Video loadedmetadata - dimensions available");
          // Set videoReady when we have dimensions
          if (videoRef.current?.videoWidth && videoRef.current?.videoHeight) {
            setVideoReady(true);
          }
        });
        videoRef.current.addEventListener("canplay", () => {
          dlog("[CAMERA] Video canplay");
          // Also set videoReady here as a fallback
          if (videoRef.current?.videoWidth && videoRef.current?.videoHeight) {
            setVideoReady(true);
          }
        });
        videoRef.current.addEventListener("play", () =>
          dlog("[CAMERA] Video started playing"),
        );
        videoRef.current.addEventListener("error", (e) =>
          console.error("[CAMERA] Video error:", e),
        );
        try {
          videoRef.current.play();
          dlog("[CAMERA] Play called successfully");
        } catch (playErr) {
          console.error("[CAMERA] Video play failed:", playErr);
          // Try again after a short delay
          setTimeout(() => {
            try {
              videoRef.current?.play();
              dlog("[CAMERA] Retry play called");
            } catch (retryErr) {
              console.error("[CAMERA] Retry play failed:", retryErr);
            }
          }, 100);
        }
        try {
          cameraSession.setVideoElementRef?.(videoRef.current);
          cameraSession.setMediaStream?.(stream);
          cameraSession.setMode?.("local");
          cameraSession.setStreaming?.(true);
        } catch (err) {
          console.warn(
            "[CAMERA] Failed to sync camera session with local stream:",
            err,
          );
        }

        // If phone camera is selected but we're falling back to local camera,
        // ensure the global session also sees the stream so the rest of the
        // app (and autoscore source selection) stays consistent.
        if (isPhoneCamera) {
          try {
            cameraSession.setMediaStream?.(stream);
            cameraSession.setVideoElementRef?.(videoRef.current);
          } catch (e) {}
        }
      } else {
        console.error("[CAMERA] Video element not found");
      }
      setStreaming(true);
      try {
        setCameraAccessError(null);
      } catch {}
      // Capture device list for inline picker - no automatic preference updates
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setAvailableCameras(list.filter((d) => d.kind === "videoinput"));
        dlog(
          "[CAMERA] Found cameras:",
          list.filter((d) => d.kind === "videoinput").length,
        );
      } catch (enumErr) {
        console.warn("[CAMERA] Failed to enumerate devices:", enumErr);
      }
    } catch (e) {
      console.error("[CAMERA] Camera start failed:", e);
      const name = (e as any)?.name || (e as any)?.code || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraAccessError("permission-denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCameraAccessError("not-found");
      } else if (name === "NotSupportedError") {
        setCameraAccessError("not-supported");
      } else {
        setCameraAccessError("unknown");
      }
    } finally {
      setCameraStarting(false);
    }
  }

  function stopCamera() {
    try {
      const sessionStream = cameraSession.getMediaStream?.() || null;
      if (sessionStream) {
        sessionStream.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      // ignore cleanup errors
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch (e) {}
    }
    try {
      cameraSession.setMediaStream?.(null);
      cameraSession.setStreaming?.(false);
      cameraSession.setVideoElementRef?.(null);
    } catch (e) {}
    setStreaming(false);
    setCameraStarting(false);
  }

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const sessionStream = cameraSession.getMediaStream?.() || null;
    const sessionVideo = TEST_MODE
      ? null
      : cameraSession.getVideoElementRef?.() || null;
    const fallbackStream =
      (sessionVideo?.srcObject as MediaStream | null) || null;
    const activeStream = sessionStream || fallbackStream;
    if (!activeStream) return;
    if (videoEl.srcObject !== activeStream) {
      videoEl.srcObject = activeStream;
    }
    videoEl.muted = true;
    (videoEl as any).playsInline = true;
    try {
      videoEl.play?.();
    } catch (e) {}
    if (!streaming) setStreaming(true);
  }, [cameraSession.mode, cameraSession.isStreaming, streaming, cameraSession]);

  // Track camera access problems so we can show an inline UI instead of repeatedly
  // calling getUserMedia (which can re-trigger the browser permission prompt).
  const [cameraAccessError, setCameraAccessError] = useState<
    null | "permission-denied" | "not-found" | "not-supported" | "unknown"
  >(null);

  // Keep diagnostics in sync with the latest access error.
  useEffect(() => {
    if (!showVideoDiagnostics) return;
    try {
      setVideoDiagnostics(
        collectVideoDiagnostics({ error: cameraAccessError }),
      );
    } catch {}
  }, [showVideoDiagnostics, cameraAccessError, collectVideoDiagnostics]);

  // Inline device refresh (does NOT request permission).
  async function refreshCameraDeviceList() {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) {
        setCameraAccessError("not-supported");
        return;
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setAvailableCameras(list.filter((d) => d.kind === "videoinput"));
    } catch (err) {
      console.warn("[CAMERA] enumerateDevices failed:", err);
    }
  }

  function CameraSelector() {
    const [showRawDevices, setShowRawDevices] = useState(false);
    const [manualDeviceId, setManualDeviceId] = useState("");
    const selectDeviceId = async (id?: string | null) => {
      if (cameraStarting) return;
      const label = availableCameras.find((d) => d.deviceId === id)?.label;
      setPreferredCamera(id || undefined, label || "", true);
      stopCamera();
      await new Promise((r) => setTimeout(r, 150));
      try {
        await startCamera();
      } catch (e) {}
    };
    // Always show a discovery UI so users can rescan / request permission even when no cameras were enumerated
    return (
      <div className="camera-selector absolute top-2 right-2 z-20 flex items-center gap-2 bg-black/40 rounded px-2 py-1 text-xs">
        <span>Cam:</span>
        <select
          onPointerDown={(e) => {
            (e as any).stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            (e as any).stopPropagation?.();
          }}
          className="bg-black/20 rounded px-1 py-0.5"
          value={preferredCameraId || ""}
          onChange={async (e) => {
            if (cameraStarting) return;
            const id = e.target.value || undefined;
            const label = availableCameras.find(
              (d) => d.deviceId === id,
            )?.label;
            // This is a user-initiated change so force the preference even when locked
            setPreferredCamera(id, label || "", true);
            // Stop current camera and wait for cleanup
            stopCamera();
            // Small delay to ensure camera device is fully released
            await new Promise((resolve) => setTimeout(resolve, 150));
            try {
              await startCamera();
            } catch (err) {
              console.warn("Failed to start camera after device switch:", err);
              // Try one more time after a longer delay
              setTimeout(async () => {
                try {
                  await startCamera();
                } catch (retryErr) {
                  console.error("Camera switch failed after retry:", retryErr);
                  alert(
                    "Failed to switch camera. Please try again or refresh the page.",
                  );
                }
              }, 500);
            }
          }}
        >
          <option value="">Auto</option>
          <option value="manual">~ Enter device ID ...</option>
          {availableCameras.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label ||
                (d.deviceId ? `Camera (${d.deviceId.slice(0, 6)})` : "Camera")}
            </option>
          ))}
        </select>
        {preferredCameraId === "manual" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              className="input input--small"
              placeholder="Device ID"
              value={manualDeviceId}
              onChange={(e) => setManualDeviceId(e.target.value)}
            />
            <button
              className="btn btn--ghost btn-sm"
              onClick={() => selectDeviceId(manualDeviceId || undefined)}
            >
              Apply
            </button>
          </div>
        )}
        {availableCameras.length === 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-yellow-300">No cameras found</span>
            <button
              className="btn btn--ghost btn-sm ml-2"
              onClick={refreshCameraDeviceList}
              title="Refresh camera list"
            >
              Refresh
            </button>
          </div>
        )}
        {cameraAccessError === "permission-denied" && (
          <div className="ml-2 text-xs text-rose-300">
            Camera permission denied. Allow camera access in your browser site
            settings, then click Rescan.
          </div>
        )}
        <button
          className="btn btn--ghost btn-sm ml-2"
          onClick={async () => {
            try {
              await refreshCameraDeviceList();
            } catch (err) {
              console.warn("Rescan failed:", err);
            }
          }}
          title="Rescan connected cameras"
        >
          Rescan
        </button>
        <button
          className="btn btn--ghost btn-sm ml-2"
          onClick={() => {
            setShowVideoDiagnostics((v) => !v);
            // prime snapshot immediately when turning on
            try {
              if (!showVideoDiagnostics) {
                setVideoDiagnostics(
                  collectVideoDiagnostics({ error: cameraAccessError }),
                );
              }
            } catch {}
          }}
          title="Show video diagnostics"
        >
          {showVideoDiagnostics ? "Hide diag" : "Diag"}
        </button>
        <div className="flex items-center gap-2 ml-2">
          <button
            className="btn btn--ghost btn-sm"
            onClick={() => {
              setShowRawDevices((v) => !v);
              if (!showRawDevices) {
                (async () => {
                  try {
                    const list =
                      await navigator.mediaDevices.enumerateDevices();
                    setAvailableCameras(
                      list.filter((d) => d.kind === "videoinput"),
                    );
                  } catch (e) {}
                })();
              }
            }}
          >
            {showRawDevices ? "Hide devices" : "Show devices"}
          </button>
        </div>
        {showRawDevices && (
          <div className="mt-2 space-y-1 ml-1 text-xs">
            <div className="opacity-60 text-xxs mb-1">
              If you don't see your virtual camera (e.g., OBS), ensure the
              virtual camera is enabled and your browser has camera permission.
              Click Rescan after enabling.
            </div>
            {availableCameras.map((d) => {
              const isOBS =
                String(d.label || "")
                  .toLowerCase()
                  .includes("obs") ||
                String(d.label || "")
                  .toLowerCase()
                  .includes("virtual");
              return (
                <div key={d.deviceId} className="flex items-center gap-2">
                  <div className="truncate">
                    {d.label || "Unnamed device"}{" "}
                    {isOBS && (
                      <span className="text-xs opacity-60 ml-1">(OBS)</span>
                    )}
                  </div>
                  <div className="opacity-60 ml-1">{d.deviceId}</div>
                  <button
                    className="btn btn--ghost btn-xs ml-2"
                    onClick={() => selectDeviceId(d.deviceId)}
                  >
                    Select
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {showVideoDiagnostics && (
          <div className="mt-2 ml-1 text-xs rounded-lg border border-white/10 bg-black/30 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">Video diagnostics</div>
              <div className="opacity-60 text-xxs">
                {videoDiagnostics?.ts
                  ? new Date(videoDiagnostics.ts).toLocaleTimeString()
                  : ""}
              </div>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="opacity-70">preferred</div>
              <div className="break-all">
                {preferredCameraLabel || "(none)"}{" "}
                {preferredCameraId ? `(${preferredCameraId})` : ""}
              </div>

              <div className="opacity-70">session</div>
              <div>
                mode={String(videoDiagnostics?.session?.mode ?? "?")} stream=
                {String(videoDiagnostics?.session?.isStreaming ?? "?")}
              </div>

              <div className="opacity-70">video el</div>
              <div>
                srcObject=
                {String(videoDiagnostics?.video?.hasSrcObject ?? false)} rs=
                {String(videoDiagnostics?.video?.readyState ?? "?")} paused=
                {String(videoDiagnostics?.video?.paused ?? "?")}
              </div>

              <div className="opacity-70">dimensions</div>
              <div>
                {videoDiagnostics?.video?.videoWidth ?? 0}×
                {videoDiagnostics?.video?.videoHeight ?? 0}
              </div>

              <div className="opacity-70">tracks</div>
              <div>
                v={videoDiagnostics?.stream?.videoTracks ?? 0} a=
                {videoDiagnostics?.stream?.audioTracks ?? 0}
              </div>
            </div>

            {videoDiagnostics?.stream?.videoTrackStates?.length ? (
              <div className="mt-2">
                <div className="opacity-70">video track state</div>
                <div className="mt-1 space-y-1">
                  {videoDiagnostics.stream.videoTrackStates.map((t, idx) => (
                    <div key={idx} className="text-xxs opacity-90">
                      #{idx} ready={t.readyState} enabled={String(t.enabled)}
                      {typeof t.muted === "boolean"
                        ? ` muted=${String(t.muted)}`
                        : ""}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {videoDiagnostics?.error ? (
              <div className="mt-2 text-xxs text-rose-200">
                cameraAccessError={String(videoDiagnostics.error)}
              </div>
            ) : null}

            <div className="mt-2 text-xxs opacity-60">
              If dims stay 0×0 but tracks&gt;0, the video element isn't
              receiving frames (often a virtual cam / autoplay / stream
              ownership issue). If tracks=0, getUserMedia succeeded but no video
              track is being delivered.
            </div>
          </div>
        )}
      </div>
    );
  }

  function drawOverlay() {
    if (DISABLE_CAMERA_OVERLAY) {
      if (overlayRef.current) {
        const ctx = overlayRef.current.getContext("2d");
        if (ctx)
          ctx.clearRect(
            0,
            0,
            overlayRef.current.width,
            overlayRef.current.height,
          );
      }
      return;
    }
    try {
      // Only render overlays when calibration data exists and the phone stream isn't providing the image
      if (!overlayRef.current || !videoRef.current || !H || !imageSize) {
        if (overlayRef.current) {
          const ctx = overlayRef.current.getContext("2d");
          ctx?.clearRect(
            0,
            0,
            overlayRef.current.width,
            overlayRef.current.height,
          );
        }
        return;
      }
      const o = overlayRef.current;
      const v = videoRef.current;
      const w = v.clientWidth;
      const h = v.clientHeight;
      o.width = w;
      o.height = h;
      const ctx = o.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      if (preferredCameraLocked || hideCameraOverlay) return;

      // scale homography from calibration image size to current rendered size
      // If calibration is locked and an overlaySize was saved at lock time, use that to preserve visual scale.
      // Use saved overlay size for consistent visual scale when user chose to preserve it.
      // Apply even when calibration is not currently "locked" so matches and other views can use the same visual size.
      const useOverlay =
        overlaySize && preserveCalibrationOverlay ? overlaySize : { w, h };
      const sx = useOverlay.w && imageSize.w ? useOverlay.w / imageSize.w : 1;
      const sy = useOverlay.h && imageSize.h ? useOverlay.h / imageSize.h : 1;
      const Hs = scaleHomography(H, sx, sy);
      const rings = [
        BoardRadii.bullInner,
        BoardRadii.bullOuter,
        BoardRadii.trebleInner,
        BoardRadii.trebleOuter,
        BoardRadii.doubleInner,
        BoardRadii.doubleOuter,
      ];

      // Visual aid: highlight big trebles (T20/T19/T18) briefly.
      const drawBigTrebleHighlight = (value: 18 | 19 | 20) => {
        // Expire window check
        const now = performance.now();
        const active = bigTrebleFlashRef.current;
        if (!active || active.value !== value || active.until <= now) return;

        // Board wedges: use standard dartboard ordering.
        // 20 segments starting at "20" and going clockwise.
        const standardOrder: number[] = [
          20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
        ];
        const i = Math.max(0, standardOrder.indexOf(value));
        const offset = typeof sectorOffset === "number" ? sectorOffset : 0;
        const a0 = offset + (i * (Math.PI * 2)) / 20;
        const a1 = offset + ((i + 1) * (Math.PI * 2)) / 20;

        // Use a slightly "fatter" radius band than the actual treble ring.
        const rInner = BoardRadii.trebleInner * 0.92;
        const rOuter = BoardRadii.trebleOuter * 1.08;

        const steps = 48;
        const outer: Point[] = [];
        const inner: Point[] = [];
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const a = a0 + (a1 - a0) * t;
          outer.push(
            applyHomography(Hs, {
              x: Math.cos(a) * rOuter,
              y: Math.sin(a) * rOuter,
            }),
          );
          inner.push(
            applyHomography(Hs, {
              x: Math.cos(a) * rInner,
              y: Math.sin(a) * rInner,
            }),
          );
        }

        // Convert to overlay canvas space (crop + drawScale)
        const poly = [...outer, ...inner.reverse()].map((p) => ({
          x: (p.x - cropOverlayX) * drawScaleX,
          y: (p.y - cropOverlayY) * drawScaleY,
        }));

        // Fade out over time
        const alpha = Math.max(0, Math.min(1, (active.until - now) / 900));
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.32 * alpha;
        ctx.fillStyle = "#facc15"; // amber
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.35 + 0.45 * alpha;
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      };
      // If useOverlay differs from actual canvas size, draw scale from useOverlay space to overlay space.
      const drawScaleX = w / useOverlay.w;
      const drawScaleY = h / useOverlay.h;
      // Compute cropping offsets when video is 'fill' (object-cover) so we align homography to
      // the visible portion of the video. When the video is letterboxed (fit), crop offsets are zero.
      const videoIntrinsicW =
        v.videoWidth && v.videoWidth > 0 ? v.videoWidth : imageSize.w;
      const videoIntrinsicH =
        v.videoHeight && v.videoHeight > 0 ? v.videoHeight : imageSize.h;
      const vr = videoIntrinsicW / videoIntrinsicH;
      const cr = useOverlay.w / useOverlay.h;
      let cropSrcX = 0;
      let cropSrcY = 0;
      if (vr > cr) {
        // video is wider than overlay - crop left/right
        const targetW = videoIntrinsicH * cr;
        cropSrcX = Math.max(0, (videoIntrinsicW - targetW) / 2);
      } else if (vr < cr) {
        // video is taller than overlay - crop top/bottom
        const targetH = videoIntrinsicW / cr;
        cropSrcY = Math.max(0, (videoIntrinsicH - targetH) / 2);
      }
      const cropOverlayX = (cropSrcX / imageSize.w) * useOverlay.w;
      const cropOverlayY = (cropSrcY / imageSize.h) * useOverlay.h;
      for (const r of rings) {
        const poly = sampleRing(Hs, r, 720);
        // Scale poly points according to drawScale
        // Adjust for cropping offset and then scale to actual canvas
        const scaledPoly = poly.map((p) => ({
          x: (p.x - cropOverlayX) * drawScaleX,
          y: (p.y - cropOverlayY) * drawScaleY,
        }));
        drawPolyline(
          ctx,
          scaledPoly,
          r === BoardRadii.doubleOuter ? "#22d3ee" : "#a78bfa",
          r === BoardRadii.doubleOuter ? 3 : 2,
        );
      }

      // Draw on top of rings.
      if (enhanceBigTrebles) {
        try {
          const active = bigTrebleFlashRef.current;
          if (active && active.until > performance.now()) {
            drawBigTrebleHighlight(active.value);
          }
        } catch {}
      }
    } catch (e) {
      // Silently ignore drawing errors to prevent re-render loops
      console.warn("Overlay drawing error:", e);
    }
  }

  useEffect(() => {
    if (TEST_MODE || manualOnly || DISABLE_CAMERA_OVERLAY) return;
    if (!isDocumentVisible) return;
    const id = setInterval(drawOverlay, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    H,
    imageSize,
    effectiveStreaming,
    manualOnly,
    isPhoneCamera,
    preferredCameraLocked,
    hideCameraOverlay,
    isDocumentVisible,
  ]);

  // Built-in autoscore loop (offline/local CV)
  useEffect(() => {
    cameraVerboseLog("[DETECTION] Effect running", {
      manualOnly,
      autoscoreProvider,
      videoReady,
      hasH: !!H,
      hasImageSize: !!imageSize,
      hasVideoRef: !!videoRef.current,
      videoWidth: videoRef.current?.videoWidth,
      videoHeight: videoRef.current?.videoHeight,
    });

    if (!isDocumentVisible) return;
    if (TEST_MODE || manualOnly) {
      cameraVerboseLog("[DETECTION] Exiting: TEST_MODE or manualOnly");
      return;
    }
    // Built-in autoscore providers are handled locally (offline CV).
    // built-in-v2 currently shares the same detector/commit loop but may evolve to
    // different scoring/refinement logic.
    if (
      autoscoreProvider !== "built-in" &&
      autoscoreProvider !== "built-in-v2"
    ) {
      cameraVerboseLog(
        "[DETECTION] Exiting: autoscoreProvider is",
        autoscoreProvider,
      );
      return;
    }
    // Choose source: local video element, or paired phone camera element.
    // IMPORTANT: when Phone Camera is selected but there is no active phone feed,
    // fall back to the local <video> element so detection can still run.
    const cameraSession = useCameraSession.getState();
    const preferredLabel = useUserSettings.getState().preferredCameraLabel;
    const isPhone = preferredLabel === "Phone Camera";

    const sessionVideo = cameraSession.getVideoElementRef?.() || null;
    const sessionStream = cameraSession.getMediaStream?.() || null;
    const sessionIsStreaming = !!cameraSession.isStreaming;

    // Prefer a session-provided video element if it exists AND has dimensions.
    // Otherwise, fall back to the local <video> element.
    const localVideo = videoRef.current;
    const sessionVideoHasDims = !!(
      sessionVideo &&
      sessionVideo.videoWidth > 0 &&
      sessionVideo.videoHeight > 0
    );
    let sourceVideo: any = sessionVideoHasDims ? sessionVideo : localVideo;

    // If Phone Camera is selected but there's no session video, still allow local.
    // If not phone, still allow session video if it becomes the only valid one.
    if (!sourceVideo && sessionVideo) sourceVideo = sessionVideo;

    // If we have a streaming session and a mounted target video element but it has
    // no srcObject yet, attach the session stream to kick off metadata/dimensions.
    try {
      if (
        sessionIsStreaming &&
        sessionStream &&
        sourceVideo &&
        !sourceVideo.srcObject
      ) {
        sourceVideo.srcObject = sessionStream;
        if (typeof sourceVideo.play === "function") {
          Promise.resolve(sourceVideo.play()).catch(() => {});
        }
      }
    } catch (e) {}
    // test harness: if running under test, fake a source video so detection can run
    if (!sourceVideo && process.env.NODE_ENV === "test") {
      sourceVideo = {
        videoWidth: 320,
        videoHeight: 240,
        currentTime: 0,
        play: async () => {},
        paused: false,
        srcObject: false,
      } as unknown as HTMLVideoElement;
    }
    if (!sourceVideo) {
      cameraVerboseLog("[DETECTION] Exiting: no sourceVideo", {
        preferredLabel,
        isPhone,
        phoneFeedActive,
        sessionStreaming: sessionIsStreaming,
        cameraSessionMode: (cameraSession as any)?.mode,
        hasSessionVideo: !!sessionVideo,
        hasLocalVideo: !!videoRef.current,
      });
      return;
    }
    if (!sourceVideo.videoWidth || !sourceVideo.videoHeight) {
      // Common race: video element exists but metadata isn't available yet.
      // Retry for a short window so we don't permanently miss starting detection.
      const start = performance.now();
      let canceledLocal = false;
      const retry = () => {
        if (canceledLocal) return;
        const vw = sourceVideo?.videoWidth || 0;
        const vh = sourceVideo?.videoHeight || 0;
        if (vw && vh) {
          // Trigger a re-run of this effect by toggling videoReady.
          try {
            setVideoReady(true);
          } catch (e) {}
          return;
        }
        if (performance.now() - start > 2000) {
          cameraVerboseLog(
            "[DETECTION] Exiting: video has no dimensions yet (after retries)",
            {
              vw,
              vh,
              preferredLabel,
              hasSrcObject: !!(sourceVideo as any)?.srcObject,
              readyState: (sourceVideo as any)?.readyState,
            },
          );
          return;
        }
        window.setTimeout(retry, 120);
      };
      window.setTimeout(retry, 60);
      return () => {
        canceledLocal = true;
      };
    }

    // Mark videoReady true once the chosen source has dimensions.
    if (!videoReady) {
      try {
        setVideoReady(true);
      } catch (e) {}
    }
    if (!H || !imageSize) {
      cameraVerboseLog("[DETECTION] Exiting: no H or imageSize", {
        hasH: !!H,
        hasImageSize: !!imageSize,
        hydrated: _hydrated,
      });
      return;
    }

    cameraVerboseLog(
      "[DETECTION] ✅ All conditions met, starting detection loop!",
    );

    let canceled = false;
    const v = sourceVideo;
    const initVw = v.videoWidth || 0;
    const initVh = v.videoHeight || 0;
    const proc = canvasRef.current;
    if (!proc) return;

    // Initialize or reset detector with tuned params for resolution/phone cameras
    // We also want to re-create the detector if camera resolution changes, because
    // the background model is resolution-dependent.
    const detectorSizeRef =
      (detectorRef as any)._sizeRef ||
      ((detectorRef as any)._sizeRef = { w: 0, h: 0 });
    const shouldResetDetector =
      !detectorRef.current ||
      (initVw > 0 &&
        initVh > 0 &&
        (detectorSizeRef.w !== initVw || detectorSizeRef.h !== initVh));

    if (shouldResetDetector) {
      // default tuning
      let minArea = autoscoreDetectorMinArea;
      let thresh = autoscoreDetectorThresh;
      let requireStableN = autoscoreDetectorRequireStableN;
      let angMaxDeg = 70;

      const px = initVw * initVh;

      // If resolution is low (common for phone cameras), make detector more permissive
      if (initVw > 0 && initVh > 0 && px < 1280 * 720) {
        minArea = Math.min(minArea, 20);
        thresh = Math.min(thresh, 14);
        requireStableN = Math.min(requireStableN, 2);
      }

      // At higher resolutions, the PCA-based angle estimation can be noisy (more
      // pixels of glare/feathering), which can cause the "Rejected - angle too large"
      // spam you’re seeing. Loosen the gate a bit so we don’t throw away real darts.
      if (initVw > 0 && initVh > 0 && px >= 1920 * 1080) {
        angMaxDeg = 82;
        requireStableN = Math.max(requireStableN, 2);
      }

      detectorRef.current = new DartDetector({
        minArea,
        thresh,
        requireStableN,
        angMaxDeg,
      });
      detectorSizeRef.w = initVw;
      detectorSizeRef.h = initVh;
    }

    const tick = () => {
      // throttle detection processing to configured FPS to reduce CPU usage
      try {
        const now = performance.now();
        const interval = 1000 / (cameraProcessingFps || 15);
        if (now - lastProcessedRef.current < interval) {
          rafRef.current = requestAnimationFrame(tick);
          tickRef.current = tick;
          return;
        }
        lastProcessedRef.current = now;
      } catch (e) {}
      let didApplyHitThisTick = false;
      if (process.env.NODE_ENV === "test") {
        try {
          dlog("CameraView.tick invoked", {
            armed: detectionArmedRef.current,
            frameCount: frameCountRef.current,
          });
        } catch (e) {}
      }
      if (canceled) return;
      try {
        const vw = v.videoWidth || 0;
        const vh = v.videoHeight || 0;
        if (!vw || !vh) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        if (proc.width !== vw) proc.width = vw;
        if (proc.height !== vh) proc.height = vh;
        const ctx = proc.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        ctx.drawImage(v, 0, 0, vw, vh);
        const frame = ctx.getImageData(0, 0, vw, vh);

        // Optional detector-side glare clamp (ring-light hotspots).
        // This directly improves edge visibility for the detector.
        const glareClampEnabled =
          harshLightingMode ||
          (typeof window !== "undefined" &&
            window.localStorage?.getItem("ndn.glareClamp") === "1");
        if (glareClampEnabled) {
          // Tuned defaults for bright 360° ring lights.
          glareClampFrameInPlace(frame, { knee: 212, strength: 0.72 });
        }

        frameCountRef.current++;

        // Seed ROI from calibration homography (board center + double radius along X)
        const cImg = applyHomography(H, { x: 0, y: 0 });
        const rImg = applyHomography(H, { x: BoardRadii.doubleOuter, y: 0 });

        // Build a single transform that maps video pixel space -> calibration image space.
        // This compensates for any display fit-mode (contain/cover) mismatches.
        const fitMode = cameraFitMode === "fill" ? "fill" : "fit";
        const fit = makeFitTransform({
          videoW: vw,
          videoH: vh,
          calibW: imageSize.w,
          calibH: imageSize.h,
          fitMode,
        });

        // Approximate scale for ROI placement (used only inside detector ROI)
        const sx = vw / imageSize.w;
        const sy = vh / imageSize.h;
        const cx = cImg.x * sx;
        const cy = cImg.y * sy;
        const rx = rImg.x * sx;
        const ry = rImg.y * sy;
        const roiR = Math.hypot(rx - cx, ry - cy) * 1.08;

        const detector = detectorRef.current!;
        if (detectorSeedVersion >= 0) {
          detector.setROI(
            cx,
            cy,
            Math.max(24, Math.min(Math.max(vw, vh), roiR)),
          );
        }

        // Try to detect a new dart when not paused and visit has room
        {
          const condPaused = !paused;
          const condPending = pendingDarts < 3;
          const condArmed = detectionArmedRef.current;
          const condFrame = frameCountRef.current > DETECTION_MIN_FRAMES;
          dlog("CameraView: detection conditions", {
            condPaused,
            condPending,
            condArmed,
            condFrame,
            frameCount: frameCountRef.current,
            minFrames: DETECTION_MIN_FRAMES,
          });
        }
        if (
          !paused &&
          pendingDarts < 3 &&
          detectionArmedRef.current &&
          frameCountRef.current > DETECTION_MIN_FRAMES
        ) {
          dlog("CameraView: entering detection branch", {
            paused,
            pendingDarts,
            detectionArmed: detectionArmedRef.current,
            frameCount: frameCountRef.current,
            DETECTION_MIN_FRAMES,
          });
          const det = detector.detect(frame);
          dlog("CameraView: raw detection", det);
          const nowPerf = performance.now();

          // Bounceout heuristic: if we were tracking a candidate and the detection
          // vanishes before we ever became ready to commit, treat as a bounceout MISS.
          // This is intentionally conservative to avoid false MISS spam.
          try {
            const pending = bounceoutRef.current.pending;
            const vanished = pending && !det;
            const elapsed = nowPerf - bounceoutRef.current.lastSeenTs;
            if (vanished && elapsed > 40 && elapsed < 900) {
              bounceoutRef.current.pending = false;
              autoCandidateRef.current = null;
              setHadRecentAuto(false);

              const distMm = bounceoutRef.current.lastBullDistanceMm;
              const tipPx = bounceoutRef.current.lastTipVideoPx;

              // Emit as a MISS to any parent handler.
              try {
                if (onAutoDart)
                  onAutoDart(
                    0,
                    "MISS" as any,
                    {
                      sector: null,
                      mult: 0,
                      calibrationValid: true,
                      pBoard: null,
                      bullDistanceMm:
                        typeof distMm === "number" ? distMm : undefined,
                      tipVideoPx: tipPx ?? undefined,
                      bounceout: true,
                    } as any,
                  );
              } catch (e) {}

              // Keep detection log consistent for debugging.
              try {
                captureDetectionLog({
                  ts: nowPerf,
                  label: "BOUNCEOUT",
                  value: 0,
                  ring: "MISS" as Ring,
                  confidence: 0,
                  ready: false,
                  accepted: false,
                  warmup: false,
                });
              } catch {}
            }
          } catch {}

          // Treat sudden appearance/disappearance of detections as a motion-like event.
          // This helps prevent committing on flicker/blur right as a dart is thrown.
          try {
            const hadStable =
              tipStabilityRef.current.stableFrames >= TIP_STABLE_MIN_FRAMES;
            const hasNow = !!det;
            if (hasNow !== hadStable) {
              lastMotionLikeEventAtRef.current = nowPerf;
            }
          } catch (e) {}

          if (
            autoCandidateRef.current &&
            nowPerf - autoCandidateRef.current.firstTs > 900
          ) {
            autoCandidateRef.current = null;
          }
          const effectiveThreshold = Math.max(
            0.5,
            Math.min(
              0.99,
              Number(autoScoreConfidenceThreshold) || AUTO_COMMIT_CONFIDENCE,
            ),
          );

          // If confirm-on-uncertain is enabled, we still want to *see* detections
          // below the threshold, but we should not auto-apply them.
          if (
            det &&
            confirmUncertainDarts &&
            det.confidence > 0 &&
            det.confidence < effectiveThreshold
          ) {
            // Avoid spamming the confirmation prompt.
            if (!pendingConfirm) {
              // We don't need tip stability/settle logic to *prompt*; the user is
              // the final arbiter. We'll still compute the score label for clarity.
              const tipRefined = refinePointSobel(proc, det.tip, 6);
              const fitMode = cameraFitMode === "fill" ? "fill" : "fit";
              const fit = makeFitTransform({
                videoW: vw,
                videoH: vh,
                calibW: imageSize.w,
                calibH: imageSize.h,
                fitMode,
              });
              const pCal = fit.toCalibration({
                x: tipRefined.x,
                y: tipRefined.y,
              });
              const score = scoreFromImagePoint(
                H,
                pCal,
                theta ?? 0,
                sectorOffset ?? 0,
              );
              let pBoard: Point | null = null;
              try {
                // H is board->image; imageToBoard inverts internally.
                pBoard = imageToBoard(H as any, pCal);
              } catch (e) {
                pBoard = null;
              }
              const ring = score.ring as Ring;
              const value = score.base;
              const sector = (score.sector ?? null) as number | null;
              const mult = Math.max(0, Number(score.mult) || 0) as
                | 0
                | 1
                | 2
                | 3;
              let label = "";
              if (ring === "MISS") {
                label = "MISS";
              } else if (ring === "BULL") {
                label = "BULL 25";
              } else if (ring === "INNER_BULL") {
                label = "INNER_BULL 50";
              } else if (sector != null) {
                const prefix = mult === 3 ? "T" : mult === 2 ? "D" : "S";
                label = `${prefix}${sector} ${value}`;
              } else {
                label = `${ring} ${value > 0 ? value : ""}`.trim();
              }
              const hasCalibration = !!H && !!imageSize;
              const calibrationGood = hasCalibration && calibrationValid;

              setPendingConfirm({
                label,
                value,
                ring,
                confidence: det.confidence,
                meta: {
                  calibrationValid: calibrationGood,
                  pBoard,
                  source: "camera",
                },
              });
              captureDetectionLog({
                ts: Date.now(),
                label,
                value,
                ring,
                confidence: det.confidence,
                ready: false,
                accepted: false,
                warmup: false,
                rejectReason: "below-confidence",
                pCal,
                tip: tipRefined,
              });
            }
            return;
          }

          if (det && det.confidence >= effectiveThreshold) {
            dlog("CameraView: detected raw", det.confidence, det.tip);
            // debug logging via dlog to avoid polluting test console
            dlog("CameraView: detected raw", det.confidence, det.tip);
            const warmupActive =
              streamingStartMsRef.current > 0 &&
              nowPerf - streamingStartMsRef.current < AUTO_STREAM_IGNORE_MS;
            const _skipLocalCommit = false;
            // Refine tip on gradients
            const tipRefined = refinePointSobel(proc, det.tip, 6);

            // Declare these up-front so later nested branches can safely reference
            // them (TypeScript doesn't allow using block-scoped vars before declaration).
            let label = "";
            let value = 0;
            let ring: Ring = "MISS" as Ring;
            let shouldAccept = false;

            // Track why we *didn't* accept/commit a detection so users can debug
            // missed darts quickly.
            let rejectReason: string | null = null;

            // Track tip stability (low jitter across frames).
            // We do this in video pixel space for simplicity.
            // If it jumps around too much, reset stability.
            try {
              const prev = tipStabilityRef.current.lastTip;
              if (!prev) {
                tipStabilityRef.current = {
                  lastTip: { ...tipRefined },
                  stableFrames: 1,
                };
              } else {
                const dist = Math.hypot(
                  tipRefined.x - prev.x,
                  tipRefined.y - prev.y,
                );
                if (dist <= TIP_STABLE_MAX_JITTER_PX) {
                  tipStabilityRef.current = {
                    lastTip: { ...tipRefined },
                    stableFrames: tipStabilityRef.current.stableFrames + 1,
                  };
                } else {
                  tipStabilityRef.current = {
                    lastTip: { ...tipRefined },
                    stableFrames: 1,
                  };
                  lastMotionLikeEventAtRef.current = nowPerf;
                }
              }
            } catch (e) {}

            const settled =
              nowPerf - lastMotionLikeEventAtRef.current >= DETECTION_SETTLE_MS;
            const tipStable =
              tipStabilityRef.current.stableFrames >= TIP_STABLE_MIN_FRAMES;

            // NOTE: settled/tipStable are enforced further down the pipeline
            // (in the non-ghost accept/commit path) so we don't prematurely
            // reference scoring variables that haven't been computed yet.

            // Map to calibration image space before scoring (fit-aware)
            const pCal = fit.toCalibration({
              x: tipRefined.x,
              y: tipRefined.y,
            });
            const score = scoreFromImagePoint(
              H,
              pCal,
              theta ?? 0,
              sectorOffset ?? 0,
            );
            // Map the *dart tip* into board-space coordinates via homography.
            // This is the actual point entering the board and is what we should
            // use for bullseye distance.
            let pBoard: Point | null = null;
            try {
              // H is board->image; imageToBoard inverts internally.
              pBoard = imageToBoard(H as any, pCal);
            } catch (e) {
              pBoard = null;
            }
            ring = score.ring as Ring;
            value = score.base;
            const sector = (score.sector ?? null) as number | null;
            const mult = Math.max(0, Number(score.mult) || 0) as 0 | 1 | 2 | 3;
            // Use a stable, caller-friendly label so UI + tests don't depend on
            // the ring enum's spelling.
            if (ring === "MISS") {
              label = "MISS";
            } else if (ring === "BULL") {
              label = "BULL 25";
            } else if (ring === "INNER_BULL") {
              label = "INNER_BULL 50";
            } else if (sector != null) {
              const prefix = mult === 3 ? "T" : mult === 2 ? "D" : "S";
              label = `${prefix}${sector} ${value}`;
            } else {
              label = `${ring} ${value > 0 ? value : ""}`.trim();
            }
            const TIP_MARGIN_PX = 3; // small margin (px) to allow rounding / proc-to-video pixel mismatch
            const PCAL_MARGIN_PX = 3; // allow small margin in calibration image space
            const hasCalibration = !!H && !!imageSize;
            // IMPORTANT: errorPx should reflect real calibration quality.
            // Treat missing errorPx as *unknown* (not zero) unless calibration is locked.
            // This prevents the UI from implying "0.0px" and reduces false-positive scoring.
            const calibrationGood = hasCalibration && calibrationValid;
            const tipInVideo =
              tipRefined.x >= -TIP_MARGIN_PX &&
              tipRefined.x <= vw + TIP_MARGIN_PX &&
              tipRefined.y >= -TIP_MARGIN_PX &&
              tipRefined.y <= vh + TIP_MARGIN_PX;
            const pCalInImage = imageSize
              ? pCal.x >= -PCAL_MARGIN_PX &&
                pCal.x <= imageSize.w + PCAL_MARGIN_PX &&
                pCal.y >= -PCAL_MARGIN_PX &&
                pCal.y <= imageSize.h + PCAL_MARGIN_PX
              : false;
            let _onBoard = false;
            if (pBoard) {
              const boardR = Math.hypot(pBoard.x, pBoard.y);
              const BOARD_MARGIN_MM = 3; // mm tolerance for being on-board
              _onBoard = boardR <= BoardRadii.doubleOuter + BOARD_MARGIN_MM;
            }

            // treat as ghost unless onBoard and calibrationGood
            // Let an onBoard detection pass if calibration is good; otherwise treat as ghost
            const isGhost =
              !calibrationGood ||
              !tipInVideo ||
              !pCalInImage ||
              !_onBoard ||
              warmupActive;
            // Notify parent synchronously for immediate ACKs if they provided an onAutoDart
            // so the parent can take ownership of the dart and prevent camera double-commit.
            const _skipLocalCommit2 = false;
            if (onAutoDart) {
              try {
                const mmPerBoardUnit = mmPerBoardUnitFromBullOuter({
                  bullOuterRadiusBoardUnits: BoardRadii.bullOuter,
                });
                const bullDistance = pBoard
                  ? distanceFromBullMm({
                      pBoard,
                      bullCenter: { x: 0, y: 0 },
                      mmPerBoardUnit,
                      bullInnerRadiusBoardUnits: BoardRadii.bullInner,
                      bullOuterRadiusBoardUnits: BoardRadii.bullOuter,
                    })
                  : null;

                // Track potential bounceouts: if we see a confident detection but it
                // never commits (not stable/settled long enough) and then disappears,
                // we'll emit a MISS bounceout.
                try {
                  if (!isGhost && ring !== "MISS") {
                    bounceoutRef.current.pending = true;
                    bounceoutRef.current.lastSeenTs = nowPerf;
                    bounceoutRef.current.lastBullDistanceMm =
                      typeof bullDistance?.distanceMm === "number"
                        ? bullDistance.distanceMm
                        : null;
                    bounceoutRef.current.lastTipVideoPx = tipRefined;
                  }
                } catch {}

                const pSig = `${score.base}|${score.ring}|${score.mult}`;
                const pNow = performance.now();
                if (
                  !(
                    pSig === lastParentSigRef.current &&
                    pNow - lastParentSigAtRef.current < AUTO_COMMIT_COOLDOWN_MS
                  )
                ) {
                  const maybe = onAutoDart(score.base, score.ring as any, {
                    sector,
                    mult,
                    calibrationValid: Boolean(calibrationGood),
                    pBoard,
                    // The video-space tip point (after refinement). Useful for debugging
                    // and for any future parallax/offset correction.
                    tipVideoPx: tipRefined,
                    // Precise bull-up "feel": distance from bull center in mm.
                    // Consumers can announce/log/send to server without UI.
                    bullDistanceMm: bullDistance?.distanceMm,
                  });
                  if (maybe === true) {
                    lastParentSigRef.current = pSig;
                    lastParentSigAtRef.current = pNow;
                    // Parent claimed ownership, skip internal commit path for this detection
                    // _skipLocalCommit2 = true; // can't reassign const
                  }
                }
              } catch (e) {}
            }
            // (shouldAccept already initialized above)
            dlog("CameraView: detection details", {
              value,
              ring,
              calibrationGood,
              tipInVideo,
              pCalInImage,
              isGhost,
            });

            // Update diagnostics overlay state (best-effort, never throw).
            try {
              updateDiagnostics({
                lastTip: tipRefined ?? null,
                lastPcal: pCal ?? null,
                lastPboard: pBoard ?? null,
                lastConfidence:
                  detectionLogRef.current[detectionLogRef.current.length - 1]
                    ?.confidence ?? null,
                lastLabel: label ?? null,
                lastValue: value ?? null,
                lastRing: ring ?? null,
                lastReject: !calibrationGood
                  ? "calibration-invalid"
                  : !tipInVideo
                    ? "tip-outside-video"
                    : !pCalInImage
                      ? "pCal-outside-image"
                      : !_onBoard
                        ? "off-board"
                        : warmupActive
                          ? "warmup"
                          : null,
              });
            } catch {}
            setLastAutoScore(label);
            setLastAutoValue(value);
            setLastAutoRing(ring);

            // Visual aid: briefly emphasize the big trebles when detected.
            // This is purely a UI overlay hint; it does not affect scoring.
            try {
              if (
                enhanceBigTrebles &&
                ring === "TRIPLE" &&
                (value === 20 || value === 19 || value === 18)
              ) {
                const flash = {
                  value: value as 18 | 19 | 20,
                  until: performance.now() + 900,
                };
                bigTrebleFlashRef.current = flash;
              }
            } catch {}

            const applyAutoHit = async (candidate: AutoCandidate) => {
              dlog(
                "CameraView: applyAutoHit",
                candidate.value,
                candidate.ring,
                candidate.sector,
              );
              // debug logging via dlog to avoid polluting test console
              dlog(
                "CameraView: applyAutoHit",
                candidate.value,
                candidate.ring,
                candidate.sector,
              );

              // Hard gate: never count/commit autoscore darts unless calibration is good.
              // (We still let detection logging + ghost paths run for UI diagnostics.)
              if (!calibrationGood) {
                dlog(
                  "CameraView: applyAutoHit blocked (calibrationGood=false)",
                  candidate.value,
                  candidate.ring,
                );
                try {
                  updateDiagnostics({
                    lastLabel: candidate.label ?? null,
                    lastValue: candidate.value ?? null,
                    lastRing: candidate.ring ?? null,
                    lastConfidence:
                      diagnosticsRef.current.lastConfidence ??
                      detectionLogRef.current[
                        detectionLogRef.current.length - 1
                      ]?.confidence ??
                      null,
                    lastPboard: null,
                    lastReject: "calibration-invalid",
                  });
                } catch {}
                try {
                  // Inform parent for transparency, but mark as not calibration-valid
                  if (onAutoDart)
                    onAutoDart(candidate.value, candidate.ring, {
                      sector: candidate.sector,
                      mult: candidate.mult,
                      calibrationValid: false,
                      pBoard: null,
                    });
                } catch (e) {}
                return;
              }

              const now = performance.now();
              // Prevent multiple synchronous applyAutoHit calls causing duplicate commits
              // (especially in test env where AUTO_COMMIT_COOLDOWN_MS may be 0).
              if (inFlightAutoCommitRef.current) return;
              inFlightAutoCommitRef.current = true;
              // Release the lock after a short window to allow legitimate follow-up darts
              try {
                window.setTimeout(
                  () => {
                    inFlightAutoCommitRef.current = false;
                  },
                  Math.max(120, AUTO_COMMIT_COOLDOWN_MS),
                );
              } catch (e) {}
              // Only dedupe by value/ring/mult to avoid accidental false negatives when
              // the sector or tip fluctuates slightly across frames for the same scoring
              // result. This reduces noisy duplicate notifications while preserving
              // distinct sector-based changes.
              const sig = `${candidate.value}|${candidate.ring}|${candidate.mult}`;
              // Exclude duplicate commits within the cooldown window. This also
              // prevents quick toggles across frames (different sigs) from
              // immediately causing multiple commits in rapid succession.
              // If the same signature reappears during the cooldown, skip it.
              // Allow a different signature to proceed; inFlightAutoCommitRef will
              // still prevent duplicate commits when applyAutoHit runs concurrently.
              if (
                now - lastAutoSigAtRef.current < AUTO_COMMIT_COOLDOWN_MS &&
                sig === lastAutoSigRef.current
              )
                return;
              lastAutoSigRef.current = sig;
              lastAutoSigAtRef.current = now;
              if (candidate.value > 0) {
                setHadRecentAuto(true);
                setPulseManualPill(true);
                try {
                  if (pulseTimeoutRef.current)
                    clearTimeout(pulseTimeoutRef.current);
                } catch (e) {
                  /* ignore */
                }
                pulseTimeoutRef.current = window.setTimeout(() => {
                  setPulseManualPill(false);
                  pulseTimeoutRef.current = null;
                }, 1500);
                try {
                  // Option A: Camera is the single authoritative committer.
                  // We always commit locally (exactly once) and treat onAutoDart as
                  // telemetry/UI only. This guarantees a stable, deterministic
                  // dart counting sequence and avoids double-commit races.
                  try {
                    dlog(
                      "CameraView: committing locally (camera authoritative)",
                      candidate.value,
                      candidate.label,
                      candidate.ring,
                    );
                    addDart(candidate.value, candidate.label, candidate.ring, {
                      calibrationValid: true,
                      pBoard,
                      source: "camera",
                    });
                  } catch (e) {}

                  // Best-effort notify parent for UI/telemetry, but never allow it
                  // to ACK ownership or influence commits.
                  try {
                    const pSig = sig;
                    const pNow = performance.now();
                    if (
                      onAutoDart &&
                      !(
                        pSig === lastParentSigRef.current &&
                        pNow - lastParentSigAtRef.current <
                          AUTO_COMMIT_COOLDOWN_MS
                      )
                    ) {
                      onAutoDart(candidate.value, candidate.ring, {
                        sector: candidate.sector,
                        mult: candidate.mult,
                        calibrationValid: true,
                        pBoard,
                      });
                      lastParentSigRef.current = pSig;
                      lastParentSigAtRef.current = pNow;
                    }
                  } catch (e) {}
                } catch (e) {}
              } else {
                setHadRecentAuto(false);
              }
              // Notify parent for misses or when the candidate wasn't already
              // dispatched to the parent above.
              if (candidate.value <= 0) {
                try {
                  if (onAutoDart)
                    onAutoDart(candidate.value, candidate.ring, {
                      sector: candidate.sector,
                      mult: candidate.mult,
                    });
                } catch (e) {}
              }
            };

            if (!warmupActive) {
              if (isGhost) {
                dlog(
                  "CameraView: ignoring ghost detection (calibrationGood:",
                  calibrationGood,
                  "tipInVideo:",
                  tipInVideo,
                  "pCalInImage:",
                  pCalInImage,
                  ")",
                );
                autoCandidateRef.current = null;
                setHadRecentAuto(false);
                shouldAccept = false;
                rejectReason = !calibrationGood
                  ? "calibration-invalid"
                  : !tipInVideo
                    ? "tip-outside-video"
                    : !pCalInImage
                      ? "pCal-outside-image"
                      : !_onBoard
                        ? "off-board"
                        : "ghost";
                // Still publish to parent so UI can show the detection log but skip commits
                try {
                  if (onAutoDart)
                    onAutoDart(value, ring, {
                      sector,
                      mult,
                      calibrationValid: false,
                      pBoard: null,
                    });
                } catch (e) {}
                captureDetectionLog({
                  ts: nowPerf,
                  label,
                  value,
                  ring,
                  pCal,
                  tip: tipRefined,
                  confidence: det.confidence,
                  ready: false,
                  accepted: false,
                  warmup: warmupActive,
                  rejectReason,
                });
              } else {
                // Reliability hard gate: require settle + stability for *non-miss* candidates.
                // Misses are allowed through for UI diagnostics but won't be committed.
                const allowCommitCandidate = settled && tipStable;

                if (ring === "MISS" || value <= 0) {
                  autoCandidateRef.current = null;
                  setHadRecentAuto(false);
                  try {
                    if (onAutoDart)
                      onAutoDart(value, ring, {
                        sector,
                        mult,
                        calibrationValid: Boolean(calibrationGood),
                        pBoard: calibrationGood ? pBoard : null,
                      });
                  } catch (e) {}
                  shouldAccept = true;
                } else {
                  // If we're not settled/stable yet, keep tracking but don't start/advance
                  // the auto-commit candidate count.
                  if (!allowCommitCandidate) {
                    shouldAccept = false;
                    rejectReason = !settled
                      ? "not-settled"
                      : !tipStable
                        ? "unstable-tip"
                        : "not-ready";
                    captureDetectionLog({
                      ts: nowPerf,
                      label,
                      value,
                      ring,
                      pCal,
                      tip: tipRefined,
                      confidence: det.confidence,
                      ready: false,
                      accepted: false,
                      warmup: warmupActive,
                      rejectReason,
                    });
                  } else {
                    const existing = autoCandidateRef.current;
                    if (
                      !existing ||
                      existing.value !== value ||
                      existing.ring !== ring
                    ) {
                      autoCandidateRef.current = {
                        value,
                        ring,
                        label,
                        sector,
                        mult,
                        firstTs: nowPerf,
                        frames: 1,
                      };
                    } else {
                      autoCandidateRef.current = {
                        ...existing,
                        label,
                        frames: existing.frames + 1,
                      };
                    }
                    const current = autoCandidateRef.current!;
                    const holdMs = nowPerf - current.firstTs;
                    const ready =
                      current.frames >= AUTO_COMMIT_MIN_FRAMES ||
                      holdMs >= AUTO_COMMIT_HOLD_MS;
                    const cooled =
                      nowPerf - lastAutoCommitRef.current >=
                      AUTO_COMMIT_COOLDOWN_MS;
                    if (ready && cooled) {
                      dlog("CameraView: candidate ready and cooled", {
                        value,
                        ring,
                        frames: current.frames,
                        nowPerf,
                      });
                      applyAutoHit(current);
                      didApplyHitThisTick = true;
                      autoCandidateRef.current = null;
                      lastAutoCommitRef.current = nowPerf;
                      shouldAccept = true;
                      rejectReason = null;
                    } else {
                      // Still tracking candidate; annotate why we didn't commit yet.
                      rejectReason = !ready
                        ? "candidate-hold"
                        : !cooled
                          ? "cooldown"
                          : null;
                    }
                  }
                }
              }
            } else {
              autoCandidateRef.current = null;
              shouldAccept = true;
              rejectReason = "warmup";
            }

            captureDetectionLog({
              ts: nowPerf,
              label,
              value,
              ring,
              pCal,
              tip: tipRefined,
              confidence: det.confidence,
              ready: shouldAccept,
              accepted: shouldAccept && value > 0 && ring !== "MISS",
              warmup: warmupActive,
              rejectReason,
            });
            if (process.env.NODE_ENV === "test") {
              try {
                dlog("CameraView: evaluate after detection", {
                  value,
                  ring,
                  shouldAccept,
                  didApplyHitThisTick,
                  warmupActive,
                  autoCandidate: autoCandidateRef.current,
                  rejectReason,
                });
              } catch (e) {}
            }

            // Draw debug tip and shaft axis on overlay (scaled to overlay canvas)
            try {
              if (DISABLE_CAMERA_OVERLAY || hideCameraOverlay) {
                // If overlays are disabled, keep canvas clean and skip drawing.
                if (overlayRef.current) {
                  const octx = overlayRef.current.getContext("2d");
                  octx?.clearRect(
                    0,
                    0,
                    overlayRef.current.width,
                    overlayRef.current.height,
                  );
                }
              } else {
                const drawOverlayHint =
                  value > 0 && ring !== "MISS" && !isGhost;
                if (drawOverlayHint) {
                  const o = overlayRef.current;
                  if (o) {
                    const octx = o.getContext("2d");
                    if (octx) {
                      // Maintain overlay size and clear a small area
                      const ox = (tipRefined.x / vw) * o.width;
                      const oy = (tipRefined.y / vh) * o.height;
                      octx.save();
                      octx.beginPath();
                      octx.strokeStyle = "#f59e0b";
                      octx.lineWidth = 2;
                      octx.arc(ox, oy, 6, 0, Math.PI * 2);
                      octx.stroke();
                      // axis line if available
                      if ((det as any).axis) {
                        const ax = (det as any).axis;
                        const ax1 = (ax.x1 / vw) * o.width;
                        const ay1 = (ax.y1 / vh) * o.height;
                        const ax2 = (ax.x2 / vw) * o.width;
                        const ay2 = (ax.y2 / vh) * o.height;
                        octx.beginPath();
                        octx.moveTo(ax1, ay1);
                        octx.lineTo(ax2, ay2);
                        octx.stroke();
                      }
                      // bbox
                      if ((det as any).bbox) {
                        const bx = ((det as any).bbox.x / vw) * o.width;
                        const by = ((det as any).bbox.y / vh) * o.height;
                        const bw = ((det as any).bbox.w / vw) * o.width;
                        const bh = ((det as any).bbox.h / vh) * o.height;
                        octx.strokeStyle = "#22d3ee";
                        octx.strokeRect(bx, by, bw, bh);
                      }
                      octx.restore();
                    }
                  }
                }
              }
            } catch (e) {}

            if (shouldAccept && !didApplyHitThisTick) {
              detector.accept(frame, det);
              // Important: auto-commit must happen only through the candidate
              // ready/cooled gate above. Calling applyAutoHit here can cause
              // duplicates and ordering glitches during jittery detections.
            }
          } else {
            if (
              autoCandidateRef.current &&
              nowPerf - autoCandidateRef.current.firstTs > 800
            ) {
              autoCandidateRef.current = null;
            }
          }
        } else {
          // Warmup or paused: update background to adapt to lighting
          if (detectorRef.current) {
            detectorRef.current.updateBackground(frame, 0.05);
          }
        }
      } catch (e) {
        // Soft-fail; continue next frame
        // console.warn('Autoscore tick error:', e)
      }
      rafRef.current = requestAnimationFrame(tick);
      // publish tick for test harnesses
      tickRef.current = tick;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      canceled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    manualOnly,
    autoscoreProvider,
    effectiveStreaming,
    H,
    imageSize,
    paused,
    pendingDarts,
    detectorSeedVersion,
    captureDetectionLog,
    videoReady, // Re-run when video becomes ready
    isDocumentVisible,
    cameraProcessingFps,
  ]);

  const handleUseLocalCamera = useCallback(async () => {
    try {
      if (isPhoneCamera) {
        const fallback = availableCameras.find((c) => c.kind === "videoinput");
        if (fallback) {
          setPreferredCamera(fallback.deviceId, fallback.label || "", true);
        } else {
          setPreferredCamera(undefined, "", true);
        }
      }
      await startCamera();
    } catch (err) {
      console.warn("[CameraView] Local camera fallback failed:", err);
    }
  }, [availableCameras, isPhoneCamera, setPreferredCamera]);

  const compactCameraView = () => {
    if (!hideInlinePanels) return null;
    const aspect =
      cameraAspect || useUserSettings.getState().cameraAspect || "wide";
    const fit =
      (cameraFitMode || useUserSettings.getState().cameraFitMode || "fit") ===
      "fit";
    const videoClass =
      aspect === "square"
        ? "absolute left-0 top-1/2 -translate-y-1/2 min-w-full min-h-full object-cover object-left bg-black"
        : fit
          ? "absolute inset-0 w-full h-full object-contain object-center bg-black ndn-video-smooth"
          : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover object-center bg-black ndn-video-smooth";
    const videoScale = cameraScale ?? 1;

    // Optional, low-risk glare reduction for the *preview* video element.
    // This does not change the underlying detector input (which reads pixels
    // from the raw video into a canvas). It simply makes the board easier to
    // see when bright lights are washing out the white/metallic areas.
    //
    // Enable via localStorage flag so we don't need to add new settings UI.
    // In DevTools console: localStorage.setItem('ndn.glareDimming', '1')
    // Disable: localStorage.removeItem('ndn.glareDimming')
    const glareDimmingEnabled =
      harshLightingMode ||
      (typeof window !== "undefined" &&
        (window.localStorage?.getItem("ndn.glareDimming") === "1" ||
          window.localStorage?.getItem("ndn.glareClamp") === "1"));

    const videoStyle = {
      transform: `scale(${videoScale})`,
      transformOrigin: "center center" as const,
      // When glare-dimming is on, reduce brightness and increase contrast so
      // bright hotspots don't blow out ring edges.
      filter: glareDimmingEnabled
        ? "saturate(1.05) contrast(1.25) brightness(0.86)"
        : "saturate(1.25) contrast(1.12) brightness(1.04)",
      imageRendering: "crisp-edges" as const,
    };
    const activeStream =
      (cameraSession.getMediaStream?.() as MediaStream | null) ||
      ((videoRef.current?.srcObject as MediaStream | null) ?? null);
    const hasTracks = !!activeStream?.getVideoTracks()?.length;
    const showPhoneReconnect = isPhoneCamera && !phoneFeedActive;

    return (
      <div className="relative h-full rounded-xl overflow-hidden bg-black">
        <div className="relative w-full h-full bg-black">
          <video
            ref={handleVideoRef}
            className={videoClass}
            style={videoStyle}
            playsInline
            muted
            autoPlay
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full"
            onClick={onOverlayClick}
          />
          {!hasTracks && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-center px-4">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-white">
                  {showPhoneReconnect
                    ? "Phone camera not streaming"
                    : "Camera not running"}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <button
                    className="btn px-3 py-1 text-sm"
                    onClick={() => {
                      try {
                        setCameraEnabled(true);
                      } catch {}
                      void startCamera();
                    }}
                  >
                    Start camera
                  </button>
                  <button
                    className="btn btn--ghost px-3 py-1 text-sm"
                    onClick={handleUseLocalCamera}
                  >
                    Use local device
                  </button>
                  <button
                    className="btn btn--ghost px-3 py-1 text-sm"
                    onClick={handlePhoneReconnect}
                  >
                    Reconnect phone
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden"></canvas>
      </div>
    );
  };

  const capture = useCallback(() => {
    try {
      if (typeof document === "undefined") return;
      const videoEl =
        videoRef.current || cameraSession.getVideoElementRef?.() || null;
      if (!videoEl) {
        console.warn("[CameraView] capture requested without video element");
        return;
      }
      const width = videoEl.videoWidth || videoEl.clientWidth || 0;
      const height = videoEl.videoHeight || videoEl.clientHeight || 0;
      if (!width || !height) {
        console.warn("[CameraView] capture aborted: video has no dimensions");
        return;
      }
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = width;
      captureCanvas.height = height;
      const ctx = captureCanvas.getContext("2d");
      if (!ctx) {
        console.warn("[CameraView] capture aborted: no 2d context");
        return;
      }
      ctx.drawImage(videoEl, 0, 0, width, height);
      captureCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `ndn-capture-${timestamp}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, "image/png");
    } catch (err) {
      console.warn("[CameraView] capture failed", err);
    }
  }, [cameraSession]);

  // If an OBS (virtual/OBS) camera is present and user hasn't chosen a preferred camera,
  // auto-select it (but do not override a locked user preference).
  useEffect(() => {
    try {
      if (preferredCameraLocked) return;
      if (preferredCameraId) return;
      const obs = availableCameras.find((d) =>
        /obs|virtual/i.test(String(d.label || "")),
      );
      if (obs) {
        setPreferredCamera(obs.deviceId, obs.label || "", true);
      }
    } catch (e) {}
  }, [
    availableCameras,
    preferredCameraId,
    preferredCameraLocked,
    setPreferredCamera,
  ]);

  // Update calibration audit status whenever homography or image size changes
  useEffect(() => {
    try {
      useAudit
        .getState()
        .setCalibrationStatus({ hasHomography: !!H, imageSize });
    } catch (e) {}
  }, [H, imageSize]);

  // Ensure overlay canvas pixel size matches the calibrated image size to avoid scale mismatch
  useEffect(() => {
    try {
      if (!overlayRef.current || !imageSize) return;
      const canvas = overlayRef.current;
      if (typeof imageSize.w === "number" && typeof imageSize.h === "number") {
        if (canvas.width !== imageSize.w || canvas.height !== imageSize.h) {
          canvas.width = imageSize.w;
          canvas.height = imageSize.h;
        }
      }
    } catch (e) {}
  }, [overlayRef, imageSize]);

  // External autoscore subscription
  useEffect(() => {
    if (autoscoreProvider !== "external-ws" || !autoscoreWsUrl) return;
    const sub = subscribeExternalWS(autoscoreWsUrl, (d) => {
      if (
        !detectionArmedRef.current ||
        performance.now() - streamingStartMsRef.current < 5000
      )
        return;
      // Route external provider hits through the same confidence/confirmation gate
      // used by the built-in camera detector so behavior is consistent.
      const ring = d.ring as any as Ring;
      const value = Number(d.value) || 0;
      const sector = (d.sector ?? null) as number | null;
      const mult = Math.max(0, Number(d.mult) || 0) as 0 | 1 | 2 | 3;

      let label = "";
      if (ring === "MISS") {
        label = "MISS";
      } else if (ring === "BULL") {
        label = "BULL 25";
      } else if (ring === "INNER_BULL") {
        label = "INNER_BULL 50";
      } else if (sector != null) {
        const prefix = mult === 3 ? "T" : mult === 2 ? "D" : "S";
        label = `${prefix}${sector} ${value}`;
      } else {
        label = `${ring} ${value > 0 ? value : ""}`.trim();
      }

      const held = maybeHoldForConfirmation({
        value,
        label,
        ring,
        confidence: (d as any)?.confidence,
        meta: {
          calibrationValid: false,
          pBoard: null,
          source: "camera",
        },
      });
      if (held) return;
      // Prefer parent hook if provided; otherwise add to visit directly
      if (onAutoDart) {
        try {
          onAutoDart(d.value, d.ring as any, {
            sector: d.sector ?? null,
            mult: (d.mult as any) ?? 0,
            // NOTE: we intentionally do not forward confidence here because the
            // onAutoDart meta type is constrained in this file.
          });
        } catch (e) {}
        try {
          addHeatSample({
            playerId:
              matchState.players[matchState.currentPlayerIdx]?.id ?? null,
            sector: d.sector ?? null,
            mult: (d.mult as any) ?? 0,
            ring: d.ring as any,
            ts: Date.now(),
          });
        } catch (e) {}
      } else {
        addDart(d.value, label, d.ring as any, {
          calibrationValid: false,
          pBoard: null,
          source: "camera",
        });
        try {
          addHeatSample({
            playerId:
              matchState.players[matchState.currentPlayerIdx]?.id ?? null,
            sector: d.sector ?? null,
            mult: (d.mult as any) ?? 0,
            ring: d.ring as any,
            ts: Date.now(),
          });
        } catch (e) {}
      }
    });
    return () => sub.close();
  }, [autoscoreProvider, autoscoreWsUrl, maybeHoldForConfirmation]);

  function onOverlayClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!overlayRef.current || !H || !imageSize) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Map to calibration coordinate space by reversing the display scaling
    const sx =
      overlayRef.current.width && imageSize.w
        ? overlayRef.current.width / imageSize.w
        : 1;
    const sy =
      overlayRef.current.height && imageSize.h
        ? overlayRef.current.height / imageSize.h
        : 1;
    const pCal: Point = { x: x / sx, y: y / sy };
    const score = scoreFromImagePoint(H, pCal);
    const s = `${score.ring} ${score.base > 0 ? score.base : ""}`.trim();
    setLastAutoScore(s);
    setLastAutoValue(score.base);
    setLastAutoRing(score.ring as Ring);
    setHadRecentAuto(true);
    // Optional immediate commit hook (e.g., Double Practice)
    try {
      if (immediateAutoCommit && onAutoDart) {
        onAutoDart(score.base, score.ring as Ring, {
          sector: score.sector,
          mult: score.mult,
        });
        try {
          addHeatSample({
            playerId:
              matchState.players[matchState.currentPlayerIdx]?.id ?? null,
            sector: score.sector ?? null,
            mult: score.mult ?? 0,
            ring: score.ring as any,
            ts: Date.now(),
          });
        } catch (e) {}
        setHadRecentAuto(false);
      }
    } catch (e) {}
  }

  function parseManual(
    input: string,
  ): { label: string; value: number; ring: Ring } | null {
    const t = input.trim().toUpperCase();
    if (!t) return null;
    const bull = t === "BULL" || t === "50" || t === "DBULL" || t === "IBULL";
    const outerBull = t === "25" || t === "OBULL";
    if (bull) return { label: "INNER_BULL 50", value: 50, ring: "INNER_BULL" };
    if (outerBull) return { label: "BULL 25", value: 25, ring: "BULL" };
    const m = t.match(/^(S|D|T)?\s*(\d{1,2})$/);
    if (!m) return null;
    const mult = (m[1] || "S") as "S" | "D" | "T";
    const num = parseInt(m[2], 10);
    if (num < 1 || num > 20) return null;
    const multVal = mult === "S" ? 1 : mult === "D" ? 2 : 3;
    const ring: Ring =
      mult === "S" ? "SINGLE" : mult === "D" ? "DOUBLE" : "TRIPLE";
    return {
      label: `${mult}${num} ${num * multVal}`,
      value: num * multVal,
      ring,
    };
  }

  function getCurrentRemaining(): number {
    const s = matchState;
    if (!s.players.length) return s.startingScore;
    const p = s.players[s.currentPlayerIdx];
    const leg = p.legs[p.legs.length - 1];
    if (!leg) return s.startingScore;
    return leg.totalScoreRemaining;
  }

  function sayBullDistanceMm(bullDistanceMm?: number) {
    if (!callerEnabled) return;
    if (typeof bullDistanceMm !== "number" || !Number.isFinite(bullDistanceMm))
      return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const msg = new SpeechSynthesisUtterance();
      const rounded = Math.round(bullDistanceMm);
      msg.text = `${rounded} millimetres`;
      msg.rate = 0.95;
      msg.pitch = 1.0;
      if (callerVoice) {
        const v = synth.getVoices().find((v) => v.name === callerVoice);
        if (v) msg.voice = v;
      }
      msg.volume =
        typeof callerVolume === "number"
          ? Math.max(0, Math.min(1, callerVolume))
          : 1;
      try {
        synth.cancel();
      } catch {}
      synth.speak(msg);
    } catch {}
  }

  function sayVisitTotal(visitTotal: number) {
    if (!callerEnabled) return;
    try {
      const name = matchState.players[matchState.currentPlayerIdx]?.name;
      const remaining = getCurrentRemaining();
      sayScore(
        name || "Player",
        visitTotal,
        Math.max(0, remaining),
        callerVoice,
        {
          volume: callerVolume,
          checkoutOnly: speakCheckoutOnly,
        },
      );
    } catch {}
  }

  function addDart(
    value: number,
    label: string,
    ring: Ring,
    meta?: CameraDartMeta,
  ) {
    // Note: we intentionally do NOT voice-announce individual dart segments here.
    // Users want the *visit total* (e.g., 128) rather than "T18 T18 S20".
    // Visit totals are announced when the visit commits (3 darts / bust / finish).

    if (shouldDeferCommit && awaitingClear) {
      // Hardening: never drop a real dart just because we're waiting for an
      // explicit "board cleared" signal. If the player throws again, assume
      // they want to continue play and finalize the pending commit now.
      try {
        finalizePendingCommit("event");
      } catch (e) {}
    }
    const entryMeta: CameraDartMeta = meta ?? {
      calibrationValid: false,
      pBoard: null,
      source: "manual",
    };

    // Allow unit tests to bypass camera auto-dedupe/cooldown by providing a stable,
    // explicit board point. Production callers can omit it.
    if (process.env.NODE_ENV === "test") {
      try {
        const anyMeta = entryMeta as any;
        if (anyMeta?.__test_point && !anyMeta.pBoard) {
          anyMeta.pBoard = anyMeta.__test_point;
        }
      } catch (e) {}
    }
    // In generic mode, delegate to parent without X01 bust/finish rules
    if (scoringMode === "custom") {
      // Bull-up only: accept exactly one dart per session.
      // If the caller explicitly opts out (tests / future callers), respect it.
      if (!entryMeta.__allowMultipleBullUp) {
        if (bullUpFirstDartTakenRef.current) {
          // Void/ignore any further darts.
          return;
        }
        bullUpFirstDartTakenRef.current = true;
      }
      if (onGenericDart)
        try {
          onGenericDart(value, ring, { label });
        } catch (e) {}
      // Maintain a lightweight pending list for UI only
      if ((pendingDartsRef.current || 0) >= 3) {
        // Rotate to next visit locally so we don't drop darts visually
        setPendingDarts(1);
        setPendingScore(value);
        setPendingEntries([{ label, value, ring, meta: entryMeta }]);
        try {
          usePendingVisit
            .getState()
            .setVisit(
              [{ label, value, ring, meta: entryMeta }] as any,
              1,
              value,
            );
        } catch (e) {}
        try {
          if (entryMeta.source === "camera") playBell();
        } catch (e) {}
        return;
      }
      const newDarts = pendingDarts + 1;
      setPendingDarts(newDarts);
      pendingDartsRef.current = newDarts;
      setPendingScore((s) => s + value);
      setPendingEntries((e) => [...e, { label, value, ring, meta: entryMeta }]);
      try {
        const nextEntries = [
          ...(pendingEntries as any[]),
          { label, value, ring, meta: entryMeta },
        ];
        const total = nextEntries.reduce(
          (sum, en) => sum + (Number(en?.value) || 0),
          0,
        );
        usePendingVisit
          .getState()
          .setVisit(nextEntries as any, newDarts, total);
      } catch (e) {}
      return;
    }

    // If a new dart arrives while 3 are pending, auto-commit previous visit and start a new one
    if ((pendingDartsRef.current || 0) >= 3) {
      const previousScore = pendingScore;
      const previousDarts = pendingDarts;
      const previousEntries = snapshotPendingDartEntries(
        pendingEntries as any[],
      );
      // Commit previous full visit
      callAddVisit(previousScore, previousDarts, {
        preOpenDarts: pendingPreOpenDarts || 0,
        doubleWindowDarts: pendingDartsAtDouble || 0,
        finishedByDouble: false,
        visitTotal: previousScore,
        entries: previousEntries,
      });
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name;
        if (name) addSample(name, previousDarts, previousScore);
      } catch (e) {}
      // Start next visit with this dart
      const willCount =
        !x01DoubleIn || isOpened || ring === "DOUBLE" || ring === "INNER_BULL";
      const applied = willCount ? value : 0;
      setPendingDarts(1);
      pendingDartsRef.current = 1;
      setPendingScore(applied);
      setPendingEntries([{ label, value: applied, ring, meta: entryMeta }]);
      try {
        usePendingVisit
          .getState()
          .setVisit(
            [{ label, value: applied, ring, meta: entryMeta }] as any,
            1,
            applied,
          );
      } catch (e) {}
      try {
        if (entryMeta.source === "camera") playBell();
      } catch (e) {}
      setPendingPreOpenDarts(willCount ? 0 : 1);
      setPendingDartsAtDouble(0);
      if (
        x01DoubleIn &&
        !isOpened &&
        (ring === "DOUBLE" || ring === "INNER_BULL")
      ) {
        setOpened(true);
      }
      enqueueVisitCommit({
        score: previousScore,
        darts: previousDarts,
        finished: false,
      });
      return;
    }
    const newDarts = (pendingDartsRef.current || 0) + 1;
    // Apply X01 Double-In rule before scoring if enabled and not opened yet
    const countsForScore =
      !x01DoubleIn || isOpened || ring === "DOUBLE" || ring === "INNER_BULL";
    const appliedValue = countsForScore ? value : 0;
    if (
      x01DoubleIn &&
      !isOpened &&
      (ring === "DOUBLE" || ring === "INNER_BULL")
    ) {
      setOpened(true);
    }
    const newScore = pendingScore + appliedValue;
    const remaining = getCurrentRemaining();
    const after = remaining - newScore;

    // Bust conditions (double-out): negative or 1, or 0 without double/inner bull
    const isFinish =
      after === 0 && (ring === "DOUBLE" || ring === "INNER_BULL");
    const isBust = after < 0 || after === 1 || (after === 0 && !isFinish);

    if (isBust) {
      // Commit bust visit: 0 score, darts thrown so far including this one
      const bustEntries = snapshotPendingDartEntries([
        ...(pendingEntries as any[]),
        { label, value: appliedValue, ring },
      ]);
      const preOpenThis =
        x01DoubleIn &&
        !isOpened &&
        !(ring === "DOUBLE" || ring === "INNER_BULL")
          ? 1
          : 0;
      const preOpenTotal = (pendingPreOpenDarts || 0) + preOpenThis;
      // Count attempts in double-out window
      const postAfter = after;
      const postBefore = after + appliedValue;
      const attemptsThisDart =
        (postBefore > 50 && postAfter <= 50) || postBefore <= 50 ? 1 : 0;
      const attemptsTotal = (pendingDartsAtDouble || 0) + attemptsThisDart;
      callAddVisit(0, newDarts, {
        preOpenDarts: preOpenTotal,
        doubleWindowDarts: attemptsTotal,
        finishedByDouble: false,
        visitTotal: 0,
        entries: bustEntries,
      });
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      setPendingPreOpenDarts(0);
      setPendingDartsAtDouble(0);
      enqueueVisitCommit({ score: 0, darts: newDarts, finished: false });
      try {
        usePendingVisit.getState().reset();
      } catch (e) {}
      return;
    }

    // Normal add (value may be zero if not opened yet)
    setPendingDarts(newDarts);
    pendingDartsRef.current = newDarts;
    setPendingScore(newScore);
    setPendingEntries((e) => {
      const next = [
        ...e,
        { label, value: appliedValue, ring, meta: entryMeta },
      ];
      try {
        const total = next.reduce(
          (sum, en) => sum + (Number(en?.value) || 0),
          0,
        );
        usePendingVisit.getState().setVisit(next as any, newDarts, total);
      } catch (e) {}
      return next;
    });
    try {
      if (entryMeta.source === "camera") playBell();
    } catch (e) {}
    if (
      x01DoubleIn &&
      !isOpened &&
      !(ring === "DOUBLE" || ring === "INNER_BULL")
    ) {
      setPendingPreOpenDarts((n) => (n || 0) + 1);
    }
    // Track double-out attempts within this visit
    {
      const postAfter = after;
      const postBefore = after + appliedValue;
      const countThisDart =
        (postBefore > 50 && postAfter <= 50) || postBefore <= 50;
      if (countThisDart) setPendingDartsAtDouble((c) => (c || 0) + 1);
    }

    if (isFinish) {
      // Commit visit with current total and end leg
      const finishEntries = snapshotPendingDartEntries([
        ...(pendingEntries as any[]),
        { label, value: appliedValue, ring },
      ]);
      const frame = captureFrame();
      callAddVisit(newScore, newDarts, {
        preOpenDarts: pendingPreOpenDarts || 0,
        doubleWindowDarts: pendingDartsAtDouble || 0,
        finishedByDouble: true,
        visitTotal: newScore,
        entries: finishEntries,
      });
      callEndLeg(newScore);
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      setPendingPreOpenDarts(0);
      setPendingDartsAtDouble(0);
      enqueueVisitCommit({
        score: newScore,
        darts: newDarts,
        finished: true,
        meta: {
          label,
          ring,
          entries: finishEntries,
          frame,
        },
      });
      try {
        usePendingVisit.getState().reset();
      } catch (e) {}
      return;
    }

    if (newDarts >= 3) {
      const commitEntries = snapshotPendingDartEntries([
        ...(pendingEntries as any[]),
        { label, value: appliedValue, ring },
      ]);
      callAddVisit(newScore, newDarts, {
        preOpenDarts: pendingPreOpenDarts || 0,
        doubleWindowDarts: pendingDartsAtDouble || 0,
        finishedByDouble: false,
        visitTotal: newScore,
        entries: commitEntries,
      });
      try {
        if (entryMeta.source === "camera") playBell();
      } catch (e) {}
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      setPendingPreOpenDarts(0);
      setPendingDartsAtDouble(0);
      enqueueVisitCommit({ score: newScore, darts: newDarts, finished: false });
      try {
        usePendingVisit.getState().reset();
      } catch (e) {}
    }
  }

  function onAddAutoDart() {
    if (shouldDeferCommit && awaitingClear) return;
    if (lastAutoScore) {
      if (onAutoDart) {
        try {
          onAutoDart(lastAutoValue, lastAutoRing, undefined);
        } catch (e) {}
      } else {
        addDart(lastAutoValue, lastAutoScore, lastAutoRing);
      }
      setNonRegCount(0);
      setHadRecentAuto(false);
    }
  }

  function onApplyManual() {
    if (shouldDeferCommit && awaitingClear) return;
    const parsed = parseManual(manualScore);
    if (!parsed) {
      alert("Enter like T20, D16, 5, 25, 50");
      return;
    }
    // If autoscore didn't register recently, count toward recalibration
    if (
      !hadRecentAuto ||
      !lastAutoScore ||
      lastAutoRing === "MISS" ||
      lastAutoValue === 0
    ) {
      const c = nonRegCount + 1;
      setNonRegCount(c);
      if (c >= 5) setShowRecalModal(true);
    } else {
      setNonRegCount(0);
    }
    addDart(parsed.value, parsed.label, parsed.ring);
    setManualScore("");
    setHadRecentAuto(false);
  }

  // Replace the last pending dart with a manually typed correction
  function onReplaceManual() {
    if (shouldDeferCommit && awaitingClear) return;
    const parsed = parseManual(manualScore);
    if (!parsed) {
      alert("Enter like T20, D16, 5, 25, 50");
      return;
    }
    if (pendingDarts === 0 || pendingEntries.length === 0) {
      onApplyManual();
      return;
    }
    if (scoringMode === "custom") {
      // Let parent handle replacement semantics
      if (
        !hadRecentAuto ||
        !lastAutoScore ||
        lastAutoRing === "MISS" ||
        lastAutoValue === 0
      ) {
        const c = nonRegCount + 1;
        setNonRegCount(c);
        if (c >= 5) setShowRecalModal(true);
      } else setNonRegCount(0);

      // Update local pending UI
      setPendingEntries((e) => [
        ...e.slice(0, -1),
        { label: parsed.label, value: parsed.value, ring: parsed.ring },
      ]);
      if (onGenericReplace)
        try {
          onGenericReplace(parsed.value, parsed.ring, { label: parsed.label });
        } catch {}
      setManualScore("");
      setHadRecentAuto(false);
      return;
    }
    if (
      !hadRecentAuto ||
      !lastAutoScore ||
      lastAutoRing === "MISS" ||
      lastAutoValue === 0
    ) {
      const c = nonRegCount + 1;
      setNonRegCount(c);
      if (c >= 5) setShowRecalModal(true);
    } else setNonRegCount(0);

    const last = pendingEntries[pendingEntries.length - 1];
    const prevDarts = pendingDarts - 1;
    const prevScore = pendingScore - (last?.value || 0);
    const remaining = getCurrentRemaining();
    const newScore = prevScore + parsed.value;
    const newDarts = prevDarts + 1;
    const after = remaining - newScore;
    const isFinish =
      after === 0 && (parsed.ring === "DOUBLE" || parsed.ring === "INNER_BULL");
    const isBust = after < 0 || after === 1 || (after === 0 && !isFinish);

    if (isBust) {
      callAddVisit(0, newDarts);
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name;
        if (name) addSample(name, newDarts, 0);
      } catch (e) {}
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      enqueueVisitCommit({ score: 0, darts: newDarts, finished: false });
      setManualScore("");
      setHadRecentAuto(false);
      return;
    }

    setPendingDarts(newDarts);
    pendingDartsRef.current = newDarts;
    setPendingScore(newScore);
    setPendingEntries((e) => [
      ...e.slice(0, -1),
      { label: parsed.label, value: parsed.value, ring: parsed.ring },
    ]);

    if (isFinish) {
      callAddVisit(newScore, newDarts);
      callEndLeg(newScore);
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name;
        if (name) addSample(name, newDarts, newScore);
      } catch (e) {}
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      enqueueVisitCommit({ score: newScore, darts: newDarts, finished: true });
      setManualScore("");
      setHadRecentAuto(false);
      return;
    }

    if (newDarts >= 3) {
      callAddVisit(newScore, newDarts);
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name;
        if (name) addSample(name, newDarts, newScore);
      } catch (e) {}
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      enqueueVisitCommit({ score: newScore, darts: newDarts, finished: false });
    }
    setManualScore("");
    setHadRecentAuto(false);
  }

  function onRecalibrateNow() {
    setShowRecalModal(false);
    setNonRegCount(0);
    // Ask App to switch to calibrate tab
    try {
      window.dispatchEvent(new CustomEvent("ndn:request-calibrate"));
    } catch (e) {}
  }

  function onResetCalibration() {
    resetCalibration();
    setShowRecalModal(false);
    setNonRegCount(0);
  }

  // Keyboard shortcut: press 'm' to open Manual Correction (if not typing in an input)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      try {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName?.toLowerCase();
        if (e.key === "m" && tag !== "input" && tag !== "textarea") {
          setActiveTab("manual");
          setShowManualModal(true);
        }
      } catch (e) {}
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Centralized quick-entry handler for S/D/T 1-20 buttons
  function onQuickEntry(num: number, mult: "S" | "D" | "T") {
    if (pendingDarts >= 3 || (shouldDeferCommit && awaitingClear)) return;
    const val = num * (mult === "S" ? 1 : mult === "D" ? 2 : 3);
    const ring: Ring =
      mult === "S" ? "SINGLE" : mult === "D" ? "DOUBLE" : "TRIPLE";
    // If autoscore didn't register recently, count toward recalibration
    if (
      !hadRecentAuto ||
      !lastAutoScore ||
      lastAutoRing === "MISS" ||
      lastAutoValue === 0
    ) {
      const c = nonRegCount + 1;
      setNonRegCount(c);
      if (c >= 5) setShowRecalModal(true);
    } else {
      setNonRegCount(0);
    }
    addDart(val, `${mult}${num} ${val}`, ring);
    setHadRecentAuto(false);
  }

  function onUndoDart() {
    if (pendingDarts === 0) return;
    const last = pendingEntries[pendingEntries.length - 1];
    setPendingDarts((d) => d - 1);
    pendingDartsRef.current = Math.max(0, (pendingDartsRef.current || 0) - 1);
    setPendingScore((s) => s - (last?.value || 0));
    setPendingEntries((e) => e.slice(0, -1));
  }

  function onCommitVisit() {
    if (pendingDarts === 0 || (shouldDeferCommit && awaitingClear)) return;
    if (commitBlocked) {
      try {
        window.alert(
          "Cannot commit: pending camera detections are not calibration validated for online matches",
        );
      } catch {}
      return;
    }
    if (scoringMode === "custom") {
      // For custom mode, simply clear local pending (parent maintains its own scoring)
      setPendingDarts(0);
      pendingDartsRef.current = 0;
      pendingDartsRef.current = 0;
      setPendingScore(0);
      setPendingEntries([]);
      return;
    }
    const visitScore = pendingScore;
    const visitDarts = pendingDarts;
    const commitEntries = snapshotPendingDartEntries(pendingEntries as any[]);
    callAddVisit(visitScore, visitDarts, {
      entries: commitEntries,
      visitTotal: visitScore,
    });
    try {
      const name = matchState.players[matchState.currentPlayerIdx]?.name;
      if (name) addSample(name, visitDarts, visitScore);
    } catch (e) {}
    setPendingDarts(0);
    pendingDartsRef.current = 0;
    setPendingScore(0);
    setPendingEntries([]);
    enqueueVisitCommit({
      score: visitScore,
      darts: visitDarts,
      finished: false,
    });
  }

  const mainContent = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full min-w-0">
      {/* Pills (optional; can be hidden and controlled by parent) */}
      {showToolbar && (
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            {!manualOnly && (
              <button
                className={`btn px-3 py-1 text-sm ${activeTab === "auto" ? "tab--active" : ""}`}
                onClick={() => {
                  setActiveTab("auto");
                  setShowManualModal(false);
                  setShowAutoModal(true);
                }}
              >
                Autoscore
              </button>
            )}
            <button
              className={`btn px-3 py-1 text-sm ${activeTab === "manual" ? "tab--active" : ""}`}
              onClick={() => {
                setActiveTab("manual");
                setShowManualModal(true);
              }}
              title="Open Manual Correction"
            >
              Manual Correction
            </button>
            {manualOnly && (
              <span className="text-xs opacity-70">
                Manual scoring mode active
              </span>
            )}
          </div>
        </div>
      )}
      {!hideInlinePanels && !manualOnly ? (
        <div className="card relative camera-fullwidth-card lg:col-span-2 w-full min-w-0">
          <div className="camera-fullwidth-body flex flex-col gap-4 w-full min-w-0">
            <h2 className="text-xl font-semibold mb-3">Camera</h2>
            <ResizablePanel
              storageKey="ndn:camera:size"
              className="relative rounded-2xl overflow-hidden bg-black w-full"
              defaultWidth={480}
              defaultHeight={360}
              minWidth={360}
              minHeight={270}
              maxWidth={800}
              maxHeight={600}
              autoFill
            >
              <CameraSelector />
              {(() => {
                const aspect =
                  cameraAspect ||
                  useUserSettings.getState().cameraAspect ||
                  "wide";
                const fit =
                  (cameraFitMode ||
                    useUserSettings.getState().cameraFitMode ||
                    "fit") === "fit";
                const videoClass =
                  aspect === "square"
                    ? "absolute left-0 top-1/2 -translate-y-1/2 min-w-full min-h-full object-cover object-left bg-black"
                    : fit
                      ? "absolute inset-0 w-full h-full object-contain object-center bg-black"
                      : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover object-center bg-black ndn-video-smooth";
                const videoScale = cameraScale ?? 1;
                const glareDimmingEnabled =
                  typeof window !== "undefined" &&
                  (window.localStorage?.getItem("ndn.glareDimming") === "1" ||
                    window.localStorage?.getItem("ndn.glareClamp") === "1");
                const videoStyle = {
                  transform: `scale(${videoScale})`,
                  transformOrigin: "center center" as const,
                  // Mild pop and clarity boost (safe for detection). Adjusted to be crisper without over-sharpening.
                  filter: glareDimmingEnabled
                    ? "saturate(1.05) contrast(1.25) brightness(0.86)"
                    : "saturate(1.25) contrast(1.12) brightness(1.04)",
                  imageRendering: "crisp-edges" as const,
                };
                const containerClass =
                  aspect === "square"
                    ? "relative w-full mx-auto aspect-square bg-black"
                    : "relative w-full aspect-[4/3] bg-black";
                const renderVideoSurface = () => (
                  <div className={`camera-viewport ${containerClass}`}>
                    <video
                      ref={handleVideoRef}
                      className={videoClass}
                      style={videoStyle}
                      playsInline
                      muted
                      autoPlay
                    />
                    <canvas
                      ref={overlayRef}
                      className="absolute inset-0 w-full h-full"
                      onClick={onOverlayClick}
                    />
                    <div
                      className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 cursor-pointer select-none"
                      onDoubleClick={handleIndicatorReset}
                      aria-label={`Visit status: ${pendingEntries[0] ? (pendingEntries[0].value > 0 ? "hit" : "miss") : "pending"}, ${pendingEntries[1] ? (pendingEntries[1].value > 0 ? "hit" : "miss") : "pending"}, ${pendingEntries[2] ? (pendingEntries[2].value > 0 ? "hit" : "miss") : "pending"}`}
                    >
                      {[0, 1, 2].map((i) => {
                        const e = pendingEntries[i] as any;
                        const entrySeq = indicatorEntryVersions[i];
                        const isPending = !e;
                        const isActive = !!e && entrySeq === indicatorVersion;
                        const hasPositiveValue =
                          typeof e?.value === "number" ? e.value > 0 : false;
                        const hasHitRing =
                          (e?.ring && e.ring !== "MISS") ?? false;
                        const isHit =
                          isActive && (hasPositiveValue || hasHitRing);
                        const color = !isActive
                          ? "bg-gray-500/70"
                          : isHit
                            ? "bg-emerald-400"
                            : "bg-rose-500";
                        const activeState = isActive && !isPending;
                        return (
                          <span
                            key={i}
                            className={`visit-dot ${activeState ? "active" : "inactive"} ${color}`}
                          />
                        );
                      })}
                      {dartTimerEnabled && dartTimeLeft !== null && (
                        <span className="px-2 py-0.5 rounded bg-black/60 text-white text-xs font-semibold">
                          {Math.max(0, dartTimeLeft)}s
                        </span>
                      )}
                    </div>
                    {shouldDeferCommit && awaitingClear ? (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-black/70 text-amber-200 text-xs font-semibold px-3 py-1 rounded-full shadow">
                        Remove darts to continue
                      </div>
                    ) : null}
                  </div>
                );
                if (isPhoneCamera) {
                  if (!phoneFeedActive) {
                    return (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900/50 to-purple-900/50">
                        <div className="text-center space-y-3 max-w-xs mx-auto">
                          <div className="text-2xl font-semibold">CAM</div>
                          <div className="text-lg font-semibold text-blue-100">
                            Phone camera selected
                          </div>
                          <p className="text-sm text-slate-300">
                            Start streaming from the Calibrator tab or reconnect
                            below.
                          </p>
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button
                              className="btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm"
                              onClick={handlePhoneReconnect}
                            >
                              Reconnect Phone
                            </button>
                            <button
                              className="btn bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 text-sm"
                              onClick={() => {
                                try {
                                  cameraSession.setShowOverlay?.(true);
                                } catch (e) {}
                              }}
                            >
                              Show Overlay
                            </button>
                            <button
                              className="btn bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-sm"
                              onClick={handleUseLocalCamera}
                              disabled={!availableCameras.length}
                            >
                              Use Local Camera
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return renderVideoSurface();
                }
                return renderVideoSurface();
              })()}
            </ResizablePanel>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="uppercase tracking-wide text-slate-400">
                Cam
              </span>
              <button
                className="btn btn--ghost px-2 py-1"
                onClick={() => adjustCameraScale(-0.05)}
                title="Decrease camera zoom"
              >
                −
              </button>
              <span className="w-10 text-center font-semibold text-white">
                {Math.round((cameraScale ?? 1) * 100)}%
              </span>
              <button
                className="btn btn--ghost px-2 py-1"
                onClick={() => adjustCameraScale(0.05)}
                title="Increase camera zoom"
              >
                +
              </button>
              <button
                className={`btn btn--ghost px-3 py-1 text-[11px] ${cameraFitMode === "fill" ? "bg-emerald-500 text-white" : ""}`}
                onClick={setFullPreview}
                title="Show dartboard only"
              >
                Full
              </button>
              <button
                className={`btn btn--ghost px-3 py-1 text-[11px] ${cameraFitMode !== "fill" ? "bg-slate-200 text-slate-900" : ""}`}
                onClick={setWidePreview}
                title="Letterbox to wide view"
              >
                Wide
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                className="btn btn--ghost px-3 py-1 text-xs font-semibold"
                onClick={() => setShowDetectionLog((prev) => !prev)}
              >
                {showDetectionLog ? "Hide" : "Show"} detection log
              </button>
              <button
                className={`btn btn--ghost px-3 py-1 text-xs font-semibold ${showDiagnosticsOverlay ? "bg-indigo-500/80 text-white" : ""}`}
                onClick={() => setShowDiagnosticsOverlay((prev) => !prev)}
                title="Toggle diagnostics overlay (Ctrl+Shift+D)"
              >
                {showDiagnosticsOverlay ? "Hide" : "Show"} diagnostics
              </button>
              <span className="text-xs text-slate-400">
                Recent detections: {detectionLog.length}
              </span>
            </div>

            {showDiagnosticsOverlay && (
              <div className="mt-2 rounded-2xl border border-white/15 bg-slate-950/80 p-3 text-[11px] text-white font-mono space-y-1">
                <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                  <span className="text-slate-300">Toggle:</span>
                  <span className="text-slate-400">Ctrl+Shift+D</span>
                  <span className="text-slate-300">Commit:</span>
                  <span>
                    {shouldDeferCommit ? "wait-for-clear" : "immediate"}
                    {awaitingClear ? " (awaiting-clear)" : ""}
                  </span>
                  <span className="text-slate-300">Online:</span>
                  <span>{isOnlineMatch ? "yes" : "no"}</span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-slate-300">Calibration:</span>
                  <span
                    className={
                      calibrationValid ? "text-emerald-300" : "text-rose-300"
                    }
                  >
                    {calibrationValid ? "VALID" : "INVALID"}
                  </span>
                  <span className="text-slate-300">locked:</span>
                  <span>{locked ? "yes" : "no"}</span>
                  <span className="text-slate-300">errorPx:</span>
                  <span>
                    {errorPxVal == null ? "(missing)" : errorPxVal.toFixed(2)}
                  </span>
                  <span className="text-slate-300">conf:</span>
                  <span>
                    {calibrationConfidence == null
                      ? "(n/a)"
                      : `${Math.round(calibrationConfidence)}%`}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <div className="font-semibold text-sm mb-1">
                      Last detection
                    </div>
                    {lastDetection ? (
                      <div className="flex items-center gap-2">
                        {lastDetection.frame ? (
                          <img
                            src={lastDetection.frame}
                            alt="last-detect"
                            className="w-20 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-20 h-12 bg-slate-800 rounded" />
                        )}
                        <div className="text-xs">
                          <div className="font-semibold">
                            {lastDetection.value}
                          </div>
                          <div className="text-slate-400">
                            {lastDetection.ring} •{" "}
                            {lastDetection.confidence.toFixed(2)}
                          </div>
                          <div className="mt-1 flex gap-2">
                            <button
                              className="btn btn--ghost px-2 py-1 text-xs"
                              onClick={() => {
                                try {
                                  addDart(
                                    lastDetection.value,
                                    `${lastDetection.value}`,
                                    lastDetection.ring,
                                    {
                                      calibrationValid: true,
                                      pBoard: lastDetection.pCal ?? null,
                                      source: "camera",
                                    },
                                  );
                                } catch (e) {}
                              }}
                            >
                              Commit
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">
                        No detections yet.
                      </div>
                    )}
                  </div>

                  <div className="col-span-1">
                    <div className="font-semibold text-sm mb-1">
                      Last commit
                    </div>
                    {lastCommit ? (
                      <div className="flex items-center gap-2">
                        {lastCommit.frame ? (
                          <img
                            src={lastCommit.frame}
                            alt="last-commit"
                            className="w-20 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-20 h-12 bg-slate-800 rounded" />
                        )}
                        <div className="text-xs">
                          <div className="font-semibold">
                            {lastCommit.score}
                          </div>
                          <div className="text-slate-400">
                            {lastCommit.darts} darts •{" "}
                            {new Date(lastCommit.ts).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">
                        No commits yet.
                      </div>
                    )}
                  </div>

                  <div className="col-span-1">
                    <div className="font-semibold text-sm mb-1">Tests</div>
                    <div className="flex flex-col gap-2">
                      <button
                        className="btn btn--ghost px-3 py-1 text-xs"
                        onClick={() => {
                          try {
                            if (tickRef.current) tickRef.current();
                          } catch (e) {}
                        }}
                      >
                        Run detection test
                      </button>
                      <button
                        className="btn btn--ghost px-3 py-1 text-xs"
                        onClick={() => {
                          try {
                            addDart(60, "60", "TRIPLE", {
                              calibrationValid: true,
                              pBoard: null,
                              source: "manual",
                            });
                          } catch (e) {}
                        }}
                      >
                        Simulate 60 (T20)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                    <div className="text-slate-300 mb-1">Last detection</div>
                    <div>
                      label: {diagnosticsRef.current.lastLabel ?? "(none)"}
                    </div>
                    <div>
                      confidence:{" "}
                      {diagnosticsRef.current.lastConfidence == null
                        ? "(n/a)"
                        : Number(diagnosticsRef.current.lastConfidence).toFixed(
                            3,
                          )}
                    </div>
                    <div>
                      reject:{" "}
                      <span
                        className={
                          diagnosticsRef.current.lastReject
                            ? "text-amber-300"
                            : "text-emerald-300"
                        }
                      >
                        {diagnosticsRef.current.lastReject ?? "(accepted)"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                    <div className="text-slate-300 mb-1">Mapping</div>
                    <div>
                      tip:{" "}
                      {diagnosticsRef.current.lastTip
                        ? `${Math.round(diagnosticsRef.current.lastTip.x)},${Math.round(diagnosticsRef.current.lastTip.y)}`
                        : "(n/a)"}
                    </div>
                    <div>
                      pCal:{" "}
                      {diagnosticsRef.current.lastPcal
                        ? `${Math.round(diagnosticsRef.current.lastPcal.x)},${Math.round(diagnosticsRef.current.lastPcal.y)}`
                        : "(n/a)"}
                    </div>
                    <div>
                      pBoard:{" "}
                      {diagnosticsRef.current.lastPboard
                        ? `${Math.round(diagnosticsRef.current.lastPboard.x)},${Math.round(diagnosticsRef.current.lastPboard.y)}`
                        : "(n/a)"}
                    </div>
                    <div className="text-slate-500 mt-1">
                      tipStableFrames: {tipStabilityRef.current.stableFrames}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {showDetectionLog && (
              <div className="mt-2 rounded-2xl border border-white/15 bg-slate-900/80 p-3 text-xs text-white font-mono max-h-36 overflow-y-auto space-y-1">
                {detectionLog.length === 0 ? (
                  <div className="text-center text-slate-400">
                    No autoscore detections yet.
                  </div>
                ) : (
                  detectionLog
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <div
                        key={entry.ts}
                        className="flex items-center justify-between gap-3"
                      >
                        <span
                          className="truncate flex-1"
                          title={`Value ${entry.value} ${entry.ring}`}
                        >
                          {cameraShowLabels
                            ? entry.label.padEnd(6, " ")
                            : `${entry.value}`}
                        </span>
                        <span className="text-slate-400">
                          {entry.confidence.toFixed(2)}
                        </span>
                        <span
                          className={`px-2 rounded-full text-[10px] font-semibold ${entry.accepted ? "bg-emerald-500/80" : entry.ready ? "bg-amber-500/80" : "bg-rose-500/80"}`}
                        >
                          {entry.accepted
                            ? "accepted"
                            : entry.ready
                              ? "queued"
                              : "ignored"}
                        </span>
                      </div>
                    ))
                )}
              </div>
            )}

            {/* Keep the camera view clear: no floating status/commit card overlay. */}
            {inProgress ? (
              <div className="sr-only" aria-hidden="true">
                <button
                  data-testid="commit-visit-btn"
                  onClick={onCommitVisit}
                  disabled={pendingDarts === 0 || commitBlocked}
                >
                  Commit
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {isPhoneCamera ? (
                <>
                  <div
                    className={`text-sm px-3 py-2 rounded border flex-1 min-w-[200px] ${phoneFeedActive ? "bg-emerald-500/10 border-emerald-400/40 text-emerald-100" : "bg-amber-500/10 border-amber-400/40 text-amber-100"}`}
                  >
                    {phoneFeedActive
                      ? "CAM Phone camera stream active"
                      : "CAM Waiting for phone camera stream"}
                  </div>
                  <button
                    className="btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm"
                    onClick={handlePhoneReconnect}
                  >
                    Reconnect Phone
                  </button>
                  <button
                    className="btn bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 text-sm"
                    onClick={() => {
                      try {
                        cameraSession.setShowOverlay?.(
                          !cameraSession.showOverlay,
                        );
                      } catch (e) {}
                    }}
                  >
                    {cameraSession.showOverlay
                      ? "Hide Overlay"
                      : "Show Overlay"}
                  </button>
                  <button
                    className="btn bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 text-sm"
                    disabled={!phoneFeedActive}
                    onClick={() => {
                      try {
                        cameraSession.clearSession?.();
                      } catch (e) {}
                    }}
                  >
                    Stop Phone Feed
                  </button>
                  {canFallbackToLocal && (
                    <button
                      className="btn bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-sm"
                      onClick={handleUseLocalCamera}
                      disabled={!availableCameras.length}
                    >
                      Use Local Camera
                    </button>
                  )}
                </>
              ) : (
                <>
                  {!streaming ? (
                    <button
                      className="btn"
                      onClick={startCamera}
                      disabled={cameraStarting}
                    >
                      {cameraStarting
                        ? "Connecting Camera..."
                        : "Connect Camera"}
                    </button>
                  ) : (
                    <button
                      className="btn bg-rose-600 hover:bg-rose-700"
                      onClick={stopCamera}
                    >
                      Stop Camera
                    </button>
                  )}
                </>
              )}
              {!manualOnly && (
                <button
                  className="btn bg-slate-700 hover:bg-slate-800"
                  onClick={requestDeviceManager}
                  title="Open phone, WiFi, and USB camera options"
                >
                  Camera Devices
                </button>
              )}
              <button
                className="btn btn--ghost px-3 py-1 text-sm"
                onClick={() => setHideCameraOverlay(!hideCameraOverlay)}
                title="Toggle the board guide overlay"
              >
                {hideCameraOverlay ? "Show board guides" : "Hide board guides"}
              </button>
              <button
                className={`btn ${cameraEnabled ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
                onClick={() => setCameraEnabled(!cameraEnabled)}
                title="Toggle whether the camera is used for scoring"
              >
                {cameraEnabled ? "Disable camera mode" : "Enable camera mode"}
              </button>
              <button
                className="btn"
                onClick={capture}
                disabled={!effectiveStreaming}
              >
                Capture Still
              </button>
              {matchState?.inProgress && (
                <>
                  <PauseTimerBadge compact />
                  <button
                    className="btn bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 text-sm"
                    onClick={() => setShowQuitPause(true)}
                  >
                    Quit / Pause
                  </button>
                  {showQuitPause && (
                    <PauseQuitModal
                      onClose={() => setShowQuitPause(false)}
                      onQuit={() => {
                        try {
                          // Emit a global event other parts of the app can listen to
                          window.dispatchEvent(
                            new CustomEvent("ndn:match-quit"),
                          );
                          // broadcast to other windows
                          try {
                            broadcastMessage({ type: "quit" });
                          } catch {}
                        } catch (e) {}
                        setShowQuitPause(false);
                      }}
                      onPause={(minutes) => {
                        const endsAt = Date.now() + minutes * 60 * 1000;
                        try {
                          useMatchControl.getState().setPaused(true, endsAt);
                          try {
                            broadcastMessage({
                              type: "pause",
                              pauseEndsAt: endsAt,
                              pauseStartedAt: Date.now(),
                            });
                          } catch {}
                        } catch (e) {}
                        setShowQuitPause(false);
                      }}
                    />
                  )}
                  <button
                    className="btn btn--ghost px-3 py-1 text-sm"
                    onClick={() => {
                      try {
                        writeMatchSnapshot();
                        window.open(
                          `${window.location.origin}${window.location.pathname}?match=1`,
                          "_blank",
                        );
                      } catch (e) {}
                    }}
                  >
                    Open match in new window
                  </button>
                  <button
                    className={`btn btn--ghost px-3 py-1 text-sm ${forwarding ? "bg-emerald-600 text-black" : ""}`}
                    onClick={() => {
                      try {
                        const v = videoRef.current as HTMLVideoElement | null;
                        if (!v) return;
                        if (!forwarding) {
                          startForwarding(v, 600);
                          setForwarding(true);
                        } else {
                          stopForwarding();
                          setForwarding(false);
                        }
                      } catch (e) {}
                    }}
                  >
                    {forwarding
                      ? "Stop preview forward"
                      : "Forward preview (PoC)"}
                  </button>
                  <button
                    className="btn btn--ghost px-3 py-1 text-sm"
                    onClick={async () => {
                      try {
                        if (document.documentElement.requestFullscreen) {
                          await document.documentElement.requestFullscreen();
                        } else if ((document as any).body.requestFullscreen) {
                          await (document as any).body.requestFullscreen();
                        }
                      } catch (e) {}
                    }}
                  >
                    Open full screen
                  </button>
                </>
              )}
              <button
                className="btn bg-slate-700 hover:bg-slate-800"
                disabled={!effectiveStreaming}
                onClick={() => {
                  detectorRef.current = null;
                  setDetectorSeedVersion((v) => v + 1);
                }}
              >
                Reset Autoscore Background
              </button>
              <button
                className="btn bg-slate-700 hover:bg-slate-800"
                onClick={() => {
                  try {
                    window.dispatchEvent(new Event("ndn:camera-reset" as any));
                  } catch (e) {}
                }}
              >
                Reset Camera Size
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Manual Correction button (always available for quick manual typing during games) */}
      {inProgress ? (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            className="btn btn--primary rounded-full w-12 h-12 flex items-center justify-center shadow-lg"
            title="Open Manual Correction (M)"
            onClick={() => {
              setActiveTab("manual");
              setShowManualModal(true);
            }}
          >
            ✍️
          </button>
        </div>
      ) : null}
      {!hideInlinePanels && manualOnly && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-3">Manual Scoring</h2>
          <p className="text-sm opacity-80 mb-3">
            Camera-based autoscore is disabled. Use the manual visit input or
            open the Manual Correction panel to record darts.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn"
              onClick={() => {
                setShowManualModal(true);
                setActiveTab("manual");
              }}
            >
              Open Manual Correction
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                try {
                  window.dispatchEvent(new Event("ndn:open-scoring" as any));
                } catch (e) {}
              }}
            >
              Manage Pending Visit
            </button>
          </div>
        </div>
      )}
      {/* Snapshot panel removed to reduce unused space */}
      <canvas ref={canvasRef} className="hidden"></canvas>
      {/* Autoscore moved into a pill-triggered modal to reduce on-screen clutter */}
      {/* Modal: Autoscore */}
      {showAutoModal && !manualOnly && (
        <div
          className="fixed inset-0 bg-black/60 z-[100]"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <ResizableModal
              storageKey="ndn:autoscore:size"
              className="w-full max-w-3xl"
              defaultWidth={720}
              defaultHeight={520}
              minWidth={420}
              minHeight={320}
              maxWidth={1400}
              maxHeight={900}
              initialFitHeight
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">Autoscore</h2>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn--ghost"
                    onClick={() => setShowAutoModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="text-sm opacity-80 mb-3">
                Click the camera overlay to autoscore. Use Manual Correction if
                the last auto is off.
              </div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="font-semibold">Last auto:</span>
                <span>{lastAutoScore || "—"}</span>
                <button
                  className="btn"
                  onClick={onAddAutoDart}
                  disabled={pendingDarts >= 3}
                >
                  Add Auto Dart
                </button>
                {nonRegCount > 0 && (
                  <span className="text-sm opacity-80">
                    No-registers: {nonRegCount}/3
                  </span>
                )}
              </div>
              <div className="mt-2">
                <div className="text-sm font-semibold mb-2">Quick entry</div>
                {/* Bulls */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    className="btn"
                    disabled={pendingDarts >= 3}
                    onClick={() => {
                      if (
                        !hadRecentAuto ||
                        !lastAutoScore ||
                        lastAutoRing === "MISS" ||
                        lastAutoValue === 0
                      ) {
                        const c = nonRegCount + 1;
                        setNonRegCount(c);
                        if (c >= 5) setShowRecalModal(true);
                      } else setNonRegCount(0);
                      addDart(25, "BULL 25", "BULL");
                      setHadRecentAuto(false);
                    }}
                  >
                    25
                  </button>
                  <button
                    className="btn"
                    disabled={pendingDarts >= 3}
                    onClick={() => {
                      if (
                        !hadRecentAuto ||
                        !lastAutoScore ||
                        lastAutoRing === "MISS" ||
                        lastAutoValue === 0
                      ) {
                        const c = nonRegCount + 1;
                        setNonRegCount(c);
                        if (c >= 5) setShowRecalModal(true);
                      } else setNonRegCount(0);
                      addDart(50, "INNER_BULL 50", "INNER_BULL");
                      setHadRecentAuto(false);
                    }}
                  >
                    50
                  </button>
                </div>
                {/* Grouped dropdown: Doubles, Singles, Trebles */}
                <div className="flex items-center gap-2 mb-3">
                  <input
                    className="input w-full max-w-sm"
                    list="autoscore-quick-list"
                    placeholder="Type or select (e.g., D16, T20, S5)"
                    value={quickSelAuto}
                    onChange={(e) =>
                      setQuickSelAuto(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const m = quickSelAuto.match(/^(S|D|T)(\d{1,2})$/);
                        if (m) {
                          onQuickEntry(parseInt(m[2], 10), m[1] as any);
                        }
                      }
                    }}
                  />
                  <datalist id="autoscore-quick-list">
                    {(["D", "S", "T"] as const).map((mult) =>
                      Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                        <option key={`${mult}${num}`} value={`${mult}${num}`} />
                      )),
                    )}
                  </datalist>
                  <button
                    className="btn"
                    disabled={!quickSelAuto || pendingDarts >= 3}
                    onClick={() => {
                      const m = quickSelAuto.match(/^(S|D|T)(\d{1,2})$/);
                      if (!m) return;
                      const mult = m[1] as "S" | "D" | "T";
                      const num = parseInt(m[2], 10);
                      onQuickEntry(num, mult);
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </ResizableModal>
          </div>
        </div>
      )}

      {/* Confirm uncertain dart (low confidence) */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 bg-black/70 z-[120]"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="card w-full max-w-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">Confirm detected dart</h3>
                <button
                  className="btn btn--ghost"
                  onClick={() => setPendingConfirm(null)}
                >
                  Close
                </button>
              </div>
              <div className="text-sm opacity-80 mb-3">
                This hit was detected with lower confidence.
              </div>
              <div className="flex flex-col gap-2 mb-3">
                <div>
                  <span className="font-semibold">Detected:</span>{" "}
                  {pendingConfirm.label}
                </div>
                <div>
                  <span className="font-semibold">Confidence:</span>{" "}
                  {pendingConfirm.confidence.toFixed(2)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      addDart(
                        pendingConfirm.value,
                        pendingConfirm.label,
                        pendingConfirm.ring,
                        pendingConfirm.meta,
                      );
                    } catch (e) {}
                    setPendingConfirm(null);
                  }}
                >
                  Accept
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => setPendingConfirm(null)}
                >
                  Reject
                </button>
                <button
                  className="btn bg-slate-700 hover:bg-slate-800"
                  onClick={() => {
                    setPendingConfirm(null);
                    setShowManualModal(true);
                    setActiveTab("manual");
                  }}
                >
                  Open Manual Correction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showManualModal && (
        <div
          className="fixed inset-0 bg-black/60 z-[100]"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 flex flex-col">
            <FocusLock returnFocus>
              <div className="p-3 md:p-4 flex items-center justify-between">
                <h3 className="text-xl md:text-2xl font-semibold">
                  Manual Correction
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    className="btn bg-slate-700 hover:bg-slate-800"
                    onClick={() => {
                      setShowManualModal(false);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 p-3 md:p-4">
                <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Live preview */}
                  <div className="card relative flex flex-col">
                    <div className="text-sm font-semibold mb-2">
                      Live Preview
                    </div>
                    <div className="relative flex-1 rounded-2xl overflow-hidden bg-black">
                      <canvas
                        ref={manualPreviewRef}
                        className="absolute inset-0 w-full h-full"
                      />
                    </div>
                  </div>
                  {/* Manual controls */}
                  <div className="card flex flex-col">
                    <div className="text-sm opacity-80 mb-2">
                      Type a correction or replace the last dart. The preview
                      updates live.
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">Last auto:</span>
                      <span>{lastAutoScore || "—"}</span>
                      <button
                        className="btn"
                        onClick={onAddAutoDart}
                        disabled={pendingDarts >= 3}
                      >
                        Add Auto Dart
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        className="input flex-[1.2]"
                        placeholder="Manual (T20, D16, 5, 25, 50)"
                        value={manualScore}
                        onChange={(e) => setManualScore(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onApplyManual();
                          }
                          if (e.key === "Enter" && e.shiftKey) {
                            e.preventDefault();
                            onReplaceManual();
                          }
                        }}
                      />
                      <button
                        className="btn btn--ghost"
                        onClick={onReplaceManual}
                        disabled={pendingDarts === 0}
                      >
                        Replace Last
                      </button>
                      <button
                        className="btn"
                        onClick={onApplyManual}
                        disabled={pendingDarts >= 3}
                      >
                        Add
                      </button>
                    </div>
                    <div className="text-xs opacity-70 mb-4">
                      Press Enter to Add · Shift+Enter to Replace Last
                    </div>
                    {/* Numeric keypad for quick manual numeric entry */}
                    <div className="mb-4">
                      <div className="text-sm font-semibold mb-2">
                        Number pad
                      </div>
                      <div className="grid grid-cols-3 gap-2 max-w-sm">
                        {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"].map(
                          (d) => (
                            <button
                              key={d}
                              className="btn text-lg"
                              onClick={() => {
                                // Append digit to manualScore (keep T/D/T prefixes if present)
                                setManualScore((ms) => {
                                  // If existing starts with letter (S/D/T), append after it
                                  if (/^[SDT]/i.test(ms)) return ms + d;
                                  return (ms || "") + d;
                                });
                              }}
                            >
                              {d}
                            </button>
                          ),
                        )}
                        <button
                          className="btn bg-rose-600 hover:bg-rose-700 text-white"
                          onClick={() => setManualScore("")}
                        >
                          Clear
                        </button>
                        <button
                          className="btn bg-slate-600 hover:bg-slate-700 text-white"
                          onClick={() =>
                            setManualScore((ms) => (ms || "").slice(0, -1))
                          }
                        >
                          ⌫
                        </button>
                        <button
                          className="btn bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => onApplyManual()}
                          disabled={pendingDarts >= 3}
                        >
                          Enter
                        </button>
                      </div>
                      <div className="text-xs opacity-70 mt-2">
                        Tap numbers then press Enter to submit. Use D/T prefixes
                        for doubles/trebles (e.g., D16).
                      </div>
                    </div>
                    <div className="mt-auto">
                      <div className="text-sm font-semibold mb-2">
                        Quick entry
                      </div>
                      {/* Bulls */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        <button
                          className="btn"
                          disabled={pendingDarts >= 3}
                          onClick={() => {
                            if (
                              !hadRecentAuto ||
                              !lastAutoScore ||
                              lastAutoRing === "MISS" ||
                              lastAutoValue === 0
                            ) {
                              const c = nonRegCount + 1;
                              setNonRegCount(c);
                              if (c >= 5) setShowRecalModal(true);
                            } else setNonRegCount(0);
                            addDart(25, "BULL 25", "BULL");
                            setHadRecentAuto(false);
                          }}
                        >
                          25
                        </button>
                        <button
                          className="btn"
                          disabled={pendingDarts >= 3}
                          onClick={() => {
                            if (
                              !hadRecentAuto ||
                              !lastAutoScore ||
                              lastAutoRing === "MISS" ||
                              lastAutoValue === 0
                            ) {
                              const c = nonRegCount + 1;
                              setNonRegCount(c);
                              if (c >= 5) setShowRecalModal(true);
                            } else setNonRegCount(0);
                            addDart(50, "INNER_BULL 50", "INNER_BULL");
                            setHadRecentAuto(false);
                          }}
                        >
                          50
                        </button>
                      </div>
                      {/* Grouped dropdown: Doubles, Singles, Trebles */}
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          className="input w-full max-w-sm"
                          list="manual-quick-list"
                          placeholder="Type or select (e.g., D16, T20, S5)"
                          value={quickSelManual}
                          onChange={(e) =>
                            setQuickSelManual(e.target.value.toUpperCase())
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const m =
                                quickSelManual.match(/^(S|D|T)(\d{1,2})$/);
                              if (m) {
                                onQuickEntry(parseInt(m[2], 10), m[1] as any);
                              }
                            }
                          }}
                        />
                        <datalist id="manual-quick-list">
                          {(["D", "S", "T"] as const).map((mult) =>
                            Array.from({ length: 20 }, (_, i) => i + 1).map(
                              (num) => (
                                <option
                                  key={`${mult}${num}`}
                                  value={`${mult}${num}`}
                                />
                              ),
                            ),
                          )}
                        </datalist>
                        <button
                          className="btn"
                          disabled={!quickSelManual || pendingDarts >= 3}
                          onClick={() => {
                            const m =
                              quickSelManual.match(/^(S|D|T)(\d{1,2})$/);
                            if (!m) return;
                            const mult = m[1] as "S" | "D" | "T";
                            const num = parseInt(m[2], 10);
                            onQuickEntry(num, mult);
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FocusLock>
          </div>
        </div>
      )}
      {showScoringModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
          <FocusLock returnFocus>
            <div
              className="card w-full max-w-4xl relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl"
              role="dialog"
              aria-modal="true"
            >
              <button
                className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold"
                onClick={() => setShowScoringModal(false)}
                aria-label="Close scoring dialog"
              >
                Close
              </button>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                Scoring
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Camera section */}
                <div className="bg-black/30 rounded-2xl p-4">
                  <h2 className="text-lg font-semibold mb-3">Camera</h2>
                  <ResizablePanel
                    storageKey="ndn:camera:size:modal"
                    className="relative rounded-2xl overflow-hidden bg-black"
                    defaultWidth={480}
                    defaultHeight={360}
                    minWidth={360}
                    minHeight={270}
                    maxWidth={800}
                    maxHeight={600}
                  >
                    <CameraSelector />
                    {(() => {
                      const fit =
                        (useUserSettings.getState().cameraFitMode || "fit") ===
                        "fit";
                      const videoClass = fit
                        ? "absolute inset-0 w-full h-full object-contain object-center bg-black ndn-video-smooth"
                        : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover object-center bg-black ndn-video-smooth";
                      const renderVideoSurface = () => (
                        <div className="relative w-full aspect-[4/3] bg-black">
                          <video
                            ref={handleVideoRef}
                            className={videoClass}
                            style={videoStyle}
                            playsInline
                            muted
                            autoPlay
                          />
                          <canvas
                            ref={overlayRef}
                            className="absolute inset-0 w-full h-full"
                            onClick={onOverlayClick}
                          />
                          <div
                            className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3"
                            aria-label={`Visit status: ${pendingEntries[0] ? (pendingEntries[0].value > 0 ? "hit" : "miss") : "pending"}, ${pendingEntries[1] ? (pendingEntries[1].value > 0 ? "hit" : "miss") : "pending"}, ${pendingEntries[2] ? (pendingEntries[2].value > 0 ? "hit" : "miss") : "pending"}`}
                          >
                            {[0, 1, 2].map((i) => {
                              const e = pendingEntries[i] as any;
                              const isPending = !e;
                              const isHit =
                                !!e &&
                                (typeof e.value === "number"
                                  ? e.value > 0
                                  : true);
                              const color = isPending
                                ? "bg-gray-500/70"
                                : isHit
                                  ? "bg-emerald-400"
                                  : "bg-rose-500";
                              return (
                                <span
                                  key={i}
                                  className={`w-3 h-3 rounded-full shadow ${color}`}
                                />
                              );
                            })}
                            {dartTimerEnabled && dartTimeLeft !== null && (
                              <span className="px-2 py-0.5 rounded bg-black/60 text-white text-xs font-semibold">
                                {Math.max(0, dartTimeLeft)}s
                              </span>
                            )}
                          </div>
                          {shouldDeferCommit && awaitingClear ? (
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-black/70 text-amber-200 text-xs font-semibold px-3 py-1 rounded-full shadow">
                              Remove darts to continue
                            </div>
                          ) : null}
                        </div>
                      );
                      if (isPhoneCamera) {
                        if (!phoneFeedActive) {
                          return (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-900/50 to-purple-900/50">
                              <div className="text-center space-y-3 max-w-xs mx-auto">
                                <div className="text-2xl font-semibold">
                                  CAM
                                </div>
                                <div className="text-lg font-semibold text-blue-100">
                                  Phone camera selected
                                </div>
                                <p className="text-sm text-slate-300">
                                  Start streaming from the Calibrator tab or
                                  reconnect below.
                                </p>
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                  <button
                                    className="btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm"
                                    onClick={handlePhoneReconnect}
                                  >
                                    Reconnect Phone
                                  </button>
                                  <button
                                    className="btn bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 text-sm"
                                    onClick={() => {
                                      try {
                                        cameraSession.setShowOverlay?.(true);
                                      } catch (e) {}
                                    }}
                                  >
                                    Show Overlay
                                  </button>
                                  <button
                                    className="btn bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-sm"
                                    onClick={handleUseLocalCamera}
                                    disabled={!availableCameras.length}
                                  >
                                    Use Local Camera
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return renderVideoSurface();
                      }
                      return renderVideoSurface();
                    })()}
                  </ResizablePanel>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {isPhoneCamera ? (
                      <>
                        <div
                          className={`text-sm px-3 py-2 rounded border flex-1 min-w-[200px] ${phoneFeedActive ? "bg-emerald-500/10 border-emerald-400/40 text-emerald-100" : "bg-amber-500/10 border-amber-400/40 text-amber-100"}`}
                        >
                          {phoneFeedActive
                            ? "📱 Phone camera stream active"
                            : "📱 Waiting for phone camera stream"}
                        </div>
                        <button
                          className="btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-sm"
                          onClick={handlePhoneReconnect}
                        >
                          Reconnect Phone
                        </button>
                        <button
                          className="btn bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 text-sm"
                          onClick={() => {
                            try {
                              cameraSession.setShowOverlay?.(
                                !cameraSession.showOverlay,
                              );
                            } catch (e) {}
                          }}
                        >
                          {cameraSession.showOverlay
                            ? "Hide Overlay"
                            : "Show Overlay"}
                        </button>
                        <button
                          className="btn bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 text-sm"
                          disabled={!phoneFeedActive}
                          onClick={() => {
                            try {
                              cameraSession.clearSession?.();
                            } catch (e) {}
                          }}
                        >
                          Stop Phone Feed
                        </button>
                        {canFallbackToLocal && (
                          <button
                            className="btn bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-sm"
                            onClick={handleUseLocalCamera}
                            disabled={!availableCameras.length}
                          >
                            Use Local Camera
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {!streaming ? (
                          <button
                            className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold"
                            onClick={startCamera}
                          >
                            Connect Camera
                          </button>
                        ) : (
                          <button
                            className="btn bg-gradient-to-r from-rose-600 to-rose-700 text-white font-bold"
                            onClick={stopCamera}
                          >
                            Stop Camera
                          </button>
                        )}
                      </>
                    )}
                    <button
                      className="btn bg-gradient-to-r from-indigo-500 to-indigo-700 text-white font-bold"
                      onClick={capture}
                      disabled={!effectiveStreaming}
                    >
                      Capture Still
                    </button>
                    <button
                      className="btn bg-gradient-to-r from-slate-600 to-slate-800 text-white font-bold"
                      disabled={!effectiveStreaming}
                      onClick={() => {
                        detectorRef.current = null;
                        setDetectorSeedVersion((v) => v + 1);
                      }}
                    >
                      Reset Autoscore Background
                    </button>
                    <button
                      className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold"
                      onClick={() => {
                        try {
                          window.dispatchEvent(
                            new Event("ndn:camera-reset" as any),
                          );
                        } catch (e) {}
                      }}
                    >
                      Reset Camera Size
                    </button>
                  </div>
                </div>
                {/* Pending Visit section */}
                <div className="bg-black/30 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-lg font-semibold">Pending Visit</h2>
                    <div className="flex items-center gap-2 text-xs opacity-80 ml-auto">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${calibrationValid ? "bg-emerald-400" : "bg-rose-500"}`}
                      />
                      <span>{calibrationValid ? "Cal OK" : "Cal invalid"}</span>
                    </div>
                  </div>
                  <div className="text-sm opacity-80 mb-2">
                    Up to 3 darts per visit.
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {[0, 1, 2].map((i) => {
                      const e = pendingEntries[i] as any;
                      const isPending = !e;
                      const isHit =
                        !!e &&
                        (typeof e.value === "number" ? e.value > 0 : true);
                      const color = isPending
                        ? "bg-gray-500/70"
                        : isHit
                          ? "bg-emerald-400"
                          : "bg-rose-500";
                      return (
                        <span
                          key={i}
                          className={`w-2.5 h-2.5 rounded-full shadow ${color}`}
                        />
                      );
                    })}
                    {dartTimerEnabled && dartTimeLeft !== null && (
                      <span className="ml-2 px-2 py-0.5 rounded bg-black/40 text-white text-xs font-semibold">
                        {Math.max(0, dartTimeLeft)}s
                      </span>
                    )}
                  </div>
                  <ul className="text-sm mb-2 list-disc pl-5">
                    {pendingEntries.length === 0 ? (
                      <li className="opacity-60">No darts yet</li>
                    ) : (
                      pendingEntries.map((e, i) => <li key={i}>{e.label}</li>)
                    )}
                  </ul>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="font-semibold">Darts: {pendingDarts}/3</div>
                    <div className="font-semibold">Total: {pendingScore}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold"
                      onClick={onUndoDart}
                      disabled={pendingDarts === 0}
                    >
                      Undo Dart
                    </button>
                    <button
                      className="btn bg-gradient-to-r from-emerald-500 to-emerald-700 text-white font-bold"
                      onClick={onCommitVisit}
                      disabled={pendingDarts === 0 || commitBlocked}
                      data-testid="commit-visit-btn"
                    >
                      Commit Visit
                    </button>
                    <button
                      className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold"
                      onClick={handleToolbarClear}
                      disabled={pendingDarts === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </FocusLock>
        </div>
      )}
      {showRecalModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="card max-w-md w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button
              className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold"
              onClick={() => {
                setShowRecalModal(false);
                setNonRegCount(0);
              }}
            >
              Close
            </button>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">
              Recalibration Recommended
            </h3>
            <div className="mb-4 text-lg font-semibold text-indigo-200">
              We detected 3 incorrect autoscores in a row. You can recalibrate
              now or reset calibration and try again.
            </div>
            <div className="flex gap-2">
              <button
                className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold"
                onClick={onRecalibrateNow}
              >
                Go to Calibrate
              </button>
              <button
                className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold"
                onClick={onResetCalibration}
              >
                Reset Calibration
              </button>
              <button
                className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold"
                onClick={() => {
                  setShowRecalModal(false);
                  setNonRegCount(0);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Duplicate Pending Visit panel removed to avoid showing the same controls twice when inline panels are visible. */}
    </div>
  );

  const compact = compactCameraView();
  return hideInlinePanels && compact ? compact : mainContent;
});
