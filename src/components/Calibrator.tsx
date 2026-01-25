import { sym } from "../ui/icons";
// Omni-Style Calibrator
// Professional real-time feedback with confidence meter, undo/redo, game compatibility
// Multi-camera support: Phone camera, OBS Virtual Cam, USB cameras, etc
// Auto-Calibration: Snap a picture and auto-detect board features

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useCalibration } from "../store/calibration";
import {
  computeHomographyDLT,
  rmsError,
  applyHomography,
  imageToBoard,
  type Point,
  canonicalRimTargets,
  BoardRadii,
  type Homography,
  detectBoardOrientation,
  ransacHomography,
  translateHomography,
  refinePointSobel,
} from "../utils/vision";
import { thetaRadToDeg } from "../utils/math";
import {
  buildDiagnosticBundle,
  downloadDiagnostic,
} from "../utils/calibrationDiagnostics";
import {
  detectBoard,
  refineRingDetection,
  type BoardDetectionResult,
} from "../utils/boardDetection";
import { useUserSettings } from "../store/userSettings";
import { useCameraSession } from "../store/cameraSession";
import { getGlobalCalibrationConfidence } from "../utils/gameCalibrationRequirements";
import { dlog } from "../utils/logger";

interface CameraDevice {
  deviceId: string;
  label: string;
  kind: "videoinput" | "audioinput" | "audiooutput";
}

type ActiveDragState = {
  targetIndex: number;
  offsetX: number;
  offsetY: number;
  pointerId?: number;
};

type CanvasInputEvent =
  | React.MouseEvent<HTMLCanvasElement>
  | React.TouchEvent<HTMLCanvasElement>
  | React.PointerEvent<HTMLCanvasElement>;

type CanvasPointerEvent = React.PointerEvent<HTMLCanvasElement>;

// Game mode calibration requirements
const GAME_CALIBRATION_REQUIREMENTS: Record<
  string,
  { minConfidence: number; label: string; color: string }
> = {
  "501": { minConfidence: 75, label: "501", color: "text-cyan-400" },
  Cricket: { minConfidence: 70, label: "Cricket", color: "text-green-400" },
  X01: { minConfidence: 80, label: "X01 (Strict)", color: "text-red-400" },
  "Around the World": {
    minConfidence: 60,
    label: "Around the World",
    color: "text-yellow-400",
  },
  Shanghai: { minConfidence: 65, label: "Shanghai", color: "text-purple-400" },
};

const TARGET_LABELS = [
  "📍 D20 (Center of double ring)",
  "📍 D6 (Center of double ring)",
  "📍 D3 (Center of double ring)",
  "📍 D11 (Center of double ring)",
  "📍 Bull (Center)",
];
const TARGET_COLORS = ["#c62828", "#00796b", "#ff8f00", "#2e7d32", "#512da8"];

// Storage for calibration history
function getSavedCalibrations(): Array<{
  id: string;
  date: string;
  errorPx: number | null;
  H: Homography;
  imageSize?: { w: number; h: number };
  overlaySize?: { w: number; h: number };
  confidence?: number | null;
  theta?: number | null;
  sectorOffset?: number | null;
  rotationOffsetRad?: number | null;
}> {
  try {
    const saved = localStorage.getItem("ndn-calibration-history");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveCalibrationToHistory(
  H: Homography,
  errorPx: number | null,
  imageSize?: { w: number; h: number },
  overlaySize?: { w: number; h: number },
  confidence?: number | null,
  theta?: number | null,
  sectorOffset?: number | null,
  rotationOffsetRad?: number | null,
) {
  try {
    const history = getSavedCalibrations();
    const newEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      // IMPORTANT: keep null as null.
      // Treating unknown error as 0 makes calibration look "perfect".
      errorPx: typeof errorPx === "number" ? errorPx : null,
      H,
      ...(imageSize ? { imageSize } : {}),
      ...(overlaySize ? { overlaySize } : {}),
      ...(typeof confidence === "number" ? { confidence } : {}),
      ...(typeof theta === "number" ? { theta } : {}),
      ...(typeof sectorOffset === "number" ? { sectorOffset } : {}),
      ...(typeof rotationOffsetRad === "number" ? { rotationOffsetRad } : {}),
    };
    history.unshift(newEntry); // Add to beginning
    history.splice(10); // Keep only last 10
    localStorage.setItem("ndn-calibration-history", JSON.stringify(history));
  } catch (err) {
    console.error("Failed to save calibration history:", err);
  }
}

function deleteCalibrationFromHistory(id: string) {
  try {
    const history = getSavedCalibrations();
    const filtered = history.filter((cal) => cal.id !== id);
    localStorage.setItem("ndn-calibration-history", JSON.stringify(filtered));
  } catch (err) {
    console.error("Failed to delete calibration from history:", err);
  }
}

// Get all available cameras
async function getAvailableCameras(): Promise<CameraDevice[]> {
  try {
    if (
      !(
        navigator &&
        navigator.mediaDevices &&
        typeof (navigator.mediaDevices as any).enumerateDevices === "function"
      )
    ) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput",
    );

    // Map to our interface and provide friendly names
    return videoDevices.map((device) => {
      let friendlyLabel =
        device.label || `Camera ${device.deviceId.substring(0, 5)}`;

      // Add helpful hints for common camera types
      if (device.label.includes("OBS")) {
        friendlyLabel = `📺 ${device.label} (Virtual)`;
      } else if (
        device.label.includes("Virtual") ||
        device.label.includes("Evostream")
      ) {
        friendlyLabel = `📹 ${device.label} (Virtual)`;
      } else if (device.label.includes("USB")) {
        friendlyLabel = `📽️ ${device.label} (USB)`;
      } else if (
        device.label.toLowerCase().includes("front") ||
        device.label.toLowerCase().includes("front camera")
      ) {
        friendlyLabel = `📱 ${device.label} (Front)`;
      } else if (
        device.label.toLowerCase().includes("back") ||
        device.label.toLowerCase().includes("rear")
      ) {
        friendlyLabel = `📱 ${device.label} (Back)`;
      }

      return {
        deviceId: device.deviceId,
        label: friendlyLabel,
        kind: device.kind,
      };
    });
  } catch (err) {
    console.error("Failed to enumerate devices:", err);
    return [];
  }
}

// Calculate quality of a single click point - validates actual dartboard geometry
// For 4 double points: must be within double ring (162-170mm in board coordinates)
// For bull point: must be within outer bull (0-15.9mm in board coordinates)
function evaluateClickQuality(
  targetIndex: number,
  clickPoint: Point,
  targetPoint: Point,
  H?: Homography,
): {
  distance: number;
  boardDistance?: number;
  boardCoords?: Point;
  quality: "Excellent" | "Good" | "Fair" | "Poor";
  icon: string;
  isValid: boolean;
} {
  // BEFORE all 5 points clicked: visual validation (image space)
  // AFTER all 5 points clicked: geometric validation (board space via H)

  let isValid = true;
  let boardDistance = 0;
  let boardCoords: Point | undefined;
  let distance = 0;

  if (H) {
    // H computed (all 5 points collected) - STRICT geometric validation
    try {
      // Apply inverse homography to transform image coords to board coords
      // H is board->image, so we need to invert it
      const boardPoint = imageToBoard(H, clickPoint);

      if (!boardPoint) {
        console.warn(
          "[evaluateClickQuality] Failed to transform point to board space",
        );
        isValid = false;
      } else {
        boardCoords = boardPoint;

        // Distance in board space from target
        const distToTarget = Math.hypot(
          boardPoint.x - targetPoint.x,
          boardPoint.y - targetPoint.y,
        );
        distance = distToTarget;

        const r = Math.hypot(boardPoint.x, boardPoint.y);
        boardDistance = r;

        if (targetIndex < 4) {
          // For double ring points, validate:
          // 1. The click is in the double ring (162-170mm)
          // 2. The click is close to the target position
          const DOUBLE_INNER = BoardRadii.doubleInner - 5; // 157mm (with tolerance)
          const DOUBLE_OUTER = BoardRadii.doubleOuter + 5; // 175mm (with tolerance)

          const inDoubleRing = r >= DOUBLE_INNER && r <= DOUBLE_OUTER;
          const closeToTarget = distToTarget < 30; // Within ~30mm of target point

          isValid = inDoubleRing && closeToTarget;

          dlog(
            `[evaluateClickQuality] Point ${targetIndex} (D${[20, 6, 3, 11][targetIndex]}):` +
              ` boardCoords=${JSON.stringify({ x: boardPoint.x.toFixed(1), y: boardPoint.y.toFixed(1) })}` +
              ` radius=${r.toFixed(1)}mm (need ${DOUBLE_INNER}-${DOUBLE_OUTER})` +
              ` dist_to_target=${distToTarget.toFixed(1)}mm` +
              ` valid=${isValid}`,
          );
        } else {
          // For bull point, just check radius
          const BULL_OUTER = BoardRadii.bullOuter + 2; // 17.9mm
          isValid = r <= BULL_OUTER;

          dlog(
            `[evaluateClickQuality] Bull:` +
              ` boardCoords=${JSON.stringify({ x: boardPoint.x.toFixed(1), y: boardPoint.y.toFixed(1) })}` +
              ` radius=${r.toFixed(1)}mm (need ≤${BULL_OUTER})` +
              ` valid=${isValid}`,
          );
        }
      }
    } catch (err) {
      console.warn(
        "[evaluateClickQuality] Failed to apply homography for validation:",
        err,
      );
      // Fallback: if H exists but fails, mark as invalid
      isValid = false;
    }
  } else {
    // No homography yet (first 4 clicks) - can't validate board-space yet
    // Just mark as tentatively valid - will be validated once H is computed after click 5
    distance = 0;
    isValid = true; // Marks click was made - board validation happens after H is computed

    dlog(
      `[evaluateClickQuality] Click ${targetIndex} made (H not yet available)`,
    );
  }

  let quality: "Excellent" | "Good" | "Fair" | "Poor";
  let icon: string;

  if (distance < 10) {
    quality = "Excellent";
    icon = "•";
  } else if (distance < 25) {
    quality = "Good";
    icon = "✓";
  } else if (distance < 50) {
    quality = "Fair";
    icon = "⚠";
  } else {
    quality = "Poor";
    icon = "✗";
  }

  return { distance, boardDistance, boardCoords, quality, icon, isValid };
}

type PlacementQualityStats = {
  allValid: boolean;
  avgBoardMiss: number | null;
  maxBoardMiss: number | null;
  samples: number;
};

function summarizePlacementQuality(
  qualities: Array<ReturnType<typeof evaluateClickQuality>>,
): PlacementQualityStats {
  if (!qualities.length) {
    return {
      allValid: false,
      avgBoardMiss: null,
      maxBoardMiss: null,
      samples: 0,
    };
  }

  let allValid = true;
  let sum = 0;
  let max = 0;
  let samples = 0;

  for (const quality of qualities) {
    if (!quality.isValid) {
      allValid = false;
    }
    if (
      typeof quality.distance === "number" &&
      !Number.isNaN(quality.distance)
    ) {
      const miss = Math.abs(quality.distance);
      sum += miss;
      max = Math.max(max, miss);
      samples += 1;
    }
  }

  return {
    allValid,
    avgBoardMiss: samples > 0 ? sum / samples : null,
    maxBoardMiss: samples > 0 ? max : null,
    samples,
  };
}

// Calculate overall confidence based on error AND validity of point placement
type ConfidenceDescriptor = {
  level: "Low" | "Fair" | "Good" | "Excellent" | "Perfect";
  color: string;
};

function describeConfidenceLevel(percentage: number): ConfidenceDescriptor {
  if (percentage >= 99.5) {
    return { level: "Perfect", color: "text-indigo-400" };
  }
  if (percentage >= 90) {
    return { level: "Excellent", color: "text-emerald-400" };
  }
  if (percentage >= 75) {
    return { level: "Good", color: "text-cyan-400" };
  }
  if (percentage >= 50) {
    return { level: "Fair", color: "text-yellow-400" };
  }
  return { level: "Low", color: "text-red-400" };
}

function calculateConfidence(
  errorPx: number,
  placementQuality: PlacementQualityStats | null,
): {
  percentage: number;
  level: "Low" | "Fair" | "Good" | "Excellent" | "Perfect";
  color: string;
} {
  const quality = placementQuality ?? {
    allValid: true,
    avgBoardMiss: null,
    maxBoardMiss: null,
    samples: 0,
  };

  // If any point is invalid (not on the double ring/bull), automatically fail
  if (!quality.allValid) {
    return {
      percentage: 0,
      level: "Low",
      color: "text-red-400",
    };
  }

  const base = getGlobalCalibrationConfidence(errorPx);
  let percentage = typeof base === "number" ? base : 0;

  // Placement quality can at most NUDGE confidence upward.
  // It must never force high confidence when perspective/errorPx is poor.
  if (quality.maxBoardMiss != null) {
    const maxMiss = Math.min(Math.max(0, quality.maxBoardMiss), 40);
    const avgMiss = quality.avgBoardMiss ?? quality.maxBoardMiss;
    const avgMissClamped =
      avgMiss != null ? Math.min(Math.max(0, avgMiss), 40) : null;

    // A tight placement (very low miss distance) earns a small bonus.
    // 0px miss => +4, 20px miss => +2, 40px miss => +0
    const maxBonus = 4 * Math.max(0, 1 - maxMiss / 40);
    const avgBonus =
      avgMissClamped != null ? 4 * Math.max(0, 1 - avgMissClamped / 40) : 0;

    // Use the stronger signal but cap the total bonus.
    const bonus = Math.min(4, Math.max(maxBonus, avgBonus));
    percentage = percentage + bonus;
  }

  percentage = Math.min(100, Number(percentage.toFixed(1)));

  const { level, color } = describeConfidenceLevel(percentage);

  return { percentage: Number(percentage.toFixed(1)), level, color };
}

export default function Calibrator() {
  const {
    H,
    setCalibration,
    reset,
    locked,
    imageSize,
    overlaySize,
    confidence: storedConfidence,
  } = useCalibration();
  const cameraSession = useCameraSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [diagnosticEnabled, setDiagnosticEnabled] = useState<boolean>(false);
  const [errorPx, setErrorPx] = useState<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [_showVideo, _setShowVideo] = useState(true); // Default to camera
  const [history, setHistory] = useState<Point[][]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [savedCalibrations, setSavedCalibrations] = useState(
    getSavedCalibrations(),
  );
  const [showHistory, setShowHistory] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [showCameraSelector, setShowCameraSelector] = useState(false);
  // NEW: Angle adjustment state
  const [theta, setTheta] = useState<number | null>(null);
  const [sectorOffset, setSectorOffset] = useState<number>(0);
  const [rotationOffsetRad, setRotationOffsetRad] = useState<number>(0);
  const [showAngleAdjust, setShowAngleAdjust] = useState(false);
  // NEW: Zoom state for camera view
  const [zoom, setZoom] = useState<number>(1.0);
  // NEW: Auto-calibration state
  const [autoDetectResult, setAutoDetectResult] =
    useState<BoardDetectionResult | null>(null);
  const [showAutoDetect, setShowAutoDetect] = useState(false);
  const [autoDetectting, setAutoDetecting] = useState(false);
  const [calMode, setCalMode] = useState<string>(
    () =>
      (typeof window !== "undefined" && localStorage.getItem("ndn:cal:mode")) ||
      "local",
  );
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const targetOverridesRef = useRef<(Point | null)[]>(new Array(5).fill(null));
  const cropInfoRef = useRef({
    cropX: 0,
    cropY: 0,
    cropW: 1,
    cropH: 1,
    canvasWidth: 1,
    canvasHeight: 1,
  });
  const targetScreenPositionsRef = useRef<(Point | null)[]>(
    new Array(5).fill(null),
  );
  const dragStateRef = useRef<ActiveDragState | null>(null);
  const dragMovedRef = useRef(false);
  const dragUpdateFrameRef = useRef<number | null>(null);
  const dragPendingPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTypeRef = useRef<CanvasPointerEvent["pointerType"] | null>(
    null,
  );
  const autoPlacementFrozenRef = useRef(false);

  // Persistence for target overrides (guide circles)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ndn:cal:target-overrides");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) {
          targetOverridesRef.current = parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to load target overrides", e);
    }
  }, []);

  const saveTargetOverrides = useCallback((overrides: (Point | null)[]) => {
    try {
      localStorage.setItem(
        "ndn:cal:target-overrides",
        JSON.stringify(overrides),
      );
    } catch (e) {}
  }, []);

  useEffect(() => {
    // Ensure target screen positions reset on mount so stale refs don't linger
    targetScreenPositionsRef.current = new Array(5).fill(null);
  }, []);

  // Log component lifecycle
  useEffect(() => {
    dlog("Calibrator component mounted");
    return () => {
      dlog("Calibrator component unmounting");
    };
  }, []);

  // Target positions for 5 points (canonical board coordinates)
  const canonicalTargets = useMemo(() => {
    const targets = canonicalRimTargets("outer").slice(0, 4);
    targets.push({ x: 0, y: 0 }); // Bull center
    return targets;
  }, []);

  const lockTargetsToEstimate = (estimate: {
    cx: number;
    cy: number;
    radius: number;
  }) => {
    const pxPerMm = estimate.radius / BoardRadii.doubleOuter;
    const overrides = canonicalTargets.map((target) => ({
      x: estimate.cx + target.x * pxPerMm,
      y: estimate.cy + target.y * pxPerMm,
    }));
    targetOverridesRef.current = overrides;
  };

  // Initialize camera on mount AND enumerate devices
  useEffect(() => {
    const initializeCamera = async () => {
      try {
        // First, enumerate all available cameras
        const cameras = await getAvailableCameras();
        setAvailableCameras(cameras);

        if (cameras.length === 0) {
          setCameraError(
            "No cameras found. Please connect a camera or virtual camera.",
          );
          setCameraReady(false);
          return;
        }

        // Try to use previously selected camera, or default to first one
        const savedCameraId = localStorage.getItem("ndn-selected-camera");
        const cameraIdToUse =
          savedCameraId && cameras.some((c) => c.deviceId === savedCameraId)
            ? savedCameraId
            : cameras[0].deviceId;

        setSelectedCameraId(cameraIdToUse);

        // Start the selected camera
        await startCamera(cameraIdToUse);
      } catch (err: any) {
        console.error("Failed to initialize camera:", err);
        setCameraError("Camera initialization failed. Check permissions.");
      }
    };

    initializeCamera();

    // Enumerate devices on mount - guard for environments that don't implement
    // mediaDevices.addEventListener (server / headless tests) to avoid runtime errors.
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof (navigator.mediaDevices as any).addEventListener === "function"
      ) {
        navigator.mediaDevices.addEventListener("devicechange", async () => {
          const cameras = await getAvailableCameras();
          setAvailableCameras(cameras);
        });
      }
    } catch (e) {
      // Ignore - test or server environments often stub mediaDevices
    }

    return () => {
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
      try {
        cameraSession.setStreaming(false);
        cameraSession.setMediaStream(null);
      } catch {}
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.mediaDevices &&
          typeof (navigator.mediaDevices as any).removeEventListener ===
            "function"
        ) {
          navigator.mediaDevices.removeEventListener("devicechange", () => {});
        }
      } catch {}
    };
  }, []);

  // Mode pills (legacy/testing compatibility) - not a core feature but used by tests
  const handleSetMode = (m: string) => {
    setCalMode(m);
    try {
      localStorage.setItem("ndn:cal:mode", m);
    } catch {}
  };

  // Device picker interactions: minimal implementation to satisfy tests
  const userSettings = useUserSettings();
  const calibrationUseRansac = useUserSettings((s) => s.calibrationUseRansac);
  const toggleDevicePicker = () => setDevicePickerOpen((s) => !s);
  const handleCamLockToggle = () => {
    // When user toggles lock, we set ignorePreferredCameraSync to true briefly
    // so external auto-lock attempts are ignored. Tests assert on this behavior.
    try {
      userSettings.setIgnorePreferredCameraSync(true);
      const newLockedState = !userSettings.preferredCameraLocked;
      userSettings.setPreferredCameraLocked(newLockedState);

      // Also update the calibration store's locked property
      setCalibration({ locked: newLockedState });

      setTimeout(() => {
        try {
          userSettings.setIgnorePreferredCameraSync(false);
        } catch {}
      }, 1500);
    } catch {}
  };

  // Sync locked state from userSettings to calibration store on mount
  useEffect(() => {
    try {
      const persistedLocked = userSettings.preferredCameraLocked;
      if (persistedLocked && locked !== persistedLocked) {
        // If userSettings says it's locked but calibration store doesn't, sync it
        setCalibration({ locked: persistedLocked });
      }
    } catch (e) {
      console.warn("Failed to sync locked state from userSettings", e);
    }
  }, []); // Run only on mount

  // Setup video element event listeners
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    const handleLoadedMetadata = () => {
      dlog("Video metadata loaded - dimensions:", {
        width: video.videoWidth,
        height: video.videoHeight,
      });

      // Update canvas to match actual video dimensions
      if (canvasRef.current) {
        canvasRef.current.width = video.videoWidth || 640;
        canvasRef.current.height = video.videoHeight || 480;
        dlog("Canvas updated to:", {
          width: canvasRef.current.width,
          height: canvasRef.current.height,
        });
      }
    };

    const handlePlay = () => {
      dlog("Video play event fired");
    };

    const handlePlaying = () => {
      dlog("Video playing event fired (frames available)");
    };

    const handleError = (e: Event) => {
      console.error("Video error event:", e);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
    };
  }, []);

  // Helper function to start a specific camera
  const startCamera = async (cameraId: string) => {
    try {
      dlog("Starting camera with ID:", cameraId);

      // Stop any existing stream
      stream?.getTracks().forEach((track) => {
        track.stop();
      });

      setCameraError(null);

      try {
        const label =
          availableCameras.find((cam) => cam.deviceId === cameraId)?.label ||
          "";
        userSettings.setPreferredCamera(cameraId || undefined, label, true);
        if (!userSettings.preferredCameraLocked && cameraId) {
          userSettings.setPreferredCameraLocked(true);
        }
      } catch {}

      const baseVideoWithDevice: MediaTrackConstraints = {
        deviceId: cameraId ? { exact: cameraId } : undefined,
      };
      const baseVideoNoDevice: MediaTrackConstraints = {
        facingMode: "environment",
      };
      const q4k: MediaTrackConstraints = {
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30 },
      };
      const q720: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      };
      const q1440: MediaTrackConstraints = {
        width: { ideal: 2560 },
        height: { ideal: 1440 },
        frameRate: { ideal: 30 },
      };
      const q1080: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      };

      const cameraLowLatency =
        useUserSettings.getState?.()?.cameraLowLatency ?? false;

      const isRetryable = (e: any) => {
        const name = String(e?.name || e?.code || "");
        return (
          name === "OverconstrainedError" ||
          name === "NotFoundError" ||
          name === "NotReadableError" ||
          name === "NotSupportedError"
        );
      };

      const tryGet = async (
        label: string,
        base: MediaTrackConstraints,
        hints: MediaTrackConstraints,
      ) => {
        dlog("Requesting camera stream:", label, { ...base, ...hints });
        return navigator.mediaDevices.getUserMedia({
          video: { ...base, ...hints },
          audio: false,
        });
      };

      const getStreamRobust = async (): Promise<MediaStream> => {
        const hintStack = cameraLowLatency
          ? [
              { label: "720p", hints: q720 },
              { label: "1080p", hints: q1080 },
              { label: "1440p", hints: q1440 },
            ]
          : [
              { label: "4k", hints: q4k },
              { label: "1440p", hints: q1440 },
              { label: "1080p", hints: q1080 },
              { label: "720p", hints: q720 },
            ];

        // 1) Try with explicit deviceId (if provided)
        if (cameraId) {
          for (const step of hintStack) {
            try {
              return await tryGet(
                `${step.label} (device)`,
                baseVideoWithDevice,
                step.hints,
              );
            } catch (e) {
              console.warn(`[Calibrator] ${step.label} (device) failed:`, e);
              if (!isRetryable(e)) throw e;
            }
          }
        }

        // 2) Fallback without deviceId (use facingMode)
        for (const step of hintStack) {
          try {
            return await tryGet(
              `${step.label} (fallback)`,
              baseVideoNoDevice,
              step.hints,
            );
          } catch (e) {
            console.warn(`[Calibrator] ${step.label} (fallback) failed:`, e);
            if (!isRetryable(e)) throw e;
          }
        }

        // 3) Last resort: plain video: true
        console.warn("[Calibrator] Falling back to video: true");
        return navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      };

      const mediaStream = await getStreamRobust();

      dlog("Got media stream:", {
        tracks: mediaStream.getTracks().length,
      });

      setStream(mediaStream);

      // Sync with global camera session so header/other components know we are online
      try {
        cameraSession.setMediaStream(mediaStream);
        cameraSession.setMode("local");
        if (videoRef.current) {
          cameraSession.setVideoElementRef(videoRef.current);
        }
        // Set streaming last to trigger re-render with all refs ready
        cameraSession.setStreaming(true);
      } catch (err) {
        console.warn("Failed to sync with camera session:", err);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        dlog("Set video srcObject, attempting to play");

        // Ensure video plays (autoPlay attribute may not be enough)
        // Add small delay to ensure browser has attached the stream
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play().catch((err) => {
              console.error("Video playback failed:", err);
            });
          }
        }, 100);
      }
      setCameraReady(true);
      dlog("Camera ready!");

      // Save preference (best-effort)
      try {
        localStorage.setItem("ndn-selected-camera", cameraId);
      } catch {}
    } catch (err: any) {
      const errorMsg =
        err.message || "Camera access denied. Check permissions.";
      console.error("Camera access error:", err);
      setCameraError(errorMsg);
      setCameraReady(false);
    }
  };

  // Handle camera selection change
  const handleCameraChange = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    resetAutoPlacementFreeze();
    await startCamera(cameraId);
    setShowCameraSelector(false);
  };

  const handleCanvasPointerDown = (e: CanvasPointerEvent) => {
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const coords = getCanvasPointFromPointer(e);
    if (!coords) return;
    lastPointerTypeRef.current = e.pointerType;
    if (tryBeginTargetDrag(coords.canvasX, coords.canvasY, e.pointerType)) {
      freezeAutoPlacement();
      if (dragStateRef.current) {
        dragStateRef.current.pointerId = e.pointerId;
      }
      canvasRef.current?.setPointerCapture?.(e.pointerId);
      if (canvasRef.current && !locked) {
        canvasRef.current.style.cursor = "grabbing";
      }
      scheduleDragUpdate(coords.canvasX, coords.canvasY, true);
      e.preventDefault();
    }
  };

  const handleCanvasPointerMove = (e: CanvasPointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const coords = getCanvasPointFromPointer(e);
    if (!coords) return;
    dragMovedRef.current = true;
    scheduleDragUpdate(coords.canvasX, coords.canvasY);
    e.preventDefault();
  };

  const handleCanvasPointerUp = (e: CanvasPointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    endTargetDrag(e.pointerId);
    e.preventDefault();
  };

  const handleCanvasPointerLeave = (e: CanvasPointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    endTargetDrag(e.pointerId);
  };

  const handleCanvasPointerCancel = (e: CanvasPointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    endTargetDrag(e.pointerId);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current || dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    if (!canvasRef.current || calibrationPoints.length >= 5 || locked) return;
    freezeAutoPlacement();

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Get click position relative to canvas display
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;

    // Convert from display coordinates to actual canvas/image coordinates
    // The canvas has internal resolution (canvas.width, canvas.height) but is displayed at (rect.width, rect.height)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Get the click position in canvas coordinates (before zoom adjustment)
    const canvasX = displayX * scaleX;
    const canvasY = displayY * scaleY;

    // Now adjust for zoom: when zoomed, the canvas shows a cropped/centered portion of the video
    // We need to map the canvas click back to the original video coordinates
    // The video is cropped from center: cropX = (vw - vw/zoom) / 2, cropW = vw/zoom
    // So a point at canvasX maps to: cropX + (canvasX / canvas.width) * cropW
    const video = videoRef.current;
    const vw = video?.videoWidth || canvas.width;
    const vh = video?.videoHeight || canvas.height;

    // Calculate the cropped region based on zoom (matches drawImage logic)
    const cropW = vw / zoom;
    const cropH = vh / zoom;
    const cropX = (vw - cropW) / 2;
    const cropY = (vh - cropH) / 2;

    // Map canvas coordinates to original video coordinates
    const imageX = cropX + (canvasX / canvas.width) * cropW;
    const imageY = cropY + (canvasY / canvas.height) * cropH;

    // NEW: Check if clicked near an uncaptured guide circle (target Screen Positions)
    // This allows the user to just "click the circles" to accept them.
    let finalClickPoint = { x: imageX, y: imageY };
    const nextTargetIdx = calibrationPoints.length;
    if (nextTargetIdx < 5) {
      const guidePos = targetScreenPositionsRef.current[nextTargetIdx];
      if (guidePos) {
        const dx = canvasX - guidePos.x;
        const dy = canvasY - guidePos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // If clicked within 40px of the guide circle, snap exactly to its image-space position
        if (dist < 40) {
          const override = targetOverridesRef.current[nextTargetIdx];
          if (override) {
            finalClickPoint = override;
          } else {
            // Calculate what the image-space position would be for the fallback
            const targetPoint = canonicalTargets[nextTargetIdx];
            const fallbackScale = Math.min(canvas.width, canvas.height) / 360;
            const fallbackCanvasX =
              canvas.width / 2 + targetPoint.x * fallbackScale;
            const fallbackCanvasY =
              canvas.height / 2 + targetPoint.y * fallbackScale;

            // Map that fallback canvas pos back to image space
            finalClickPoint = {
              x: cropX + (fallbackCanvasX / canvas.width) * cropW,
              y: cropY + (fallbackCanvasY / canvas.height) * cropH,
            };
          }
          dlog("[Calibrator] Snapped click to guide circle", {
            index: nextTargetIdx,
            finalClickPoint,
          });
        }
      }
    }

    // NEW: Click Snap - refine the click point to the nearest strong edge (ring boundary)
    // Only refine if we didn't already snap to a guide circle
    const wasSnappedToGuide =
      finalClickPoint !== (undefined as any) &&
      (finalClickPoint.x !== imageX || finalClickPoint.y !== imageY);
    const refinedPoint = wasSnappedToGuide
      ? finalClickPoint
      : refinePointSobel(canvas, finalClickPoint, 10);

    // Store the refined image-space point for homography computation
    const clickPointInImageSpace = refinedPoint;

    dlog("[Calibrator] Click mapping with zoom & snap:", {
      display: { x: displayX, y: displayY },
      canvas: { x: canvasX, y: canvasY },
      zoom,
      crop: { x: cropX, y: cropY, w: cropW, h: cropH },
      image: { x: imageX, y: imageY },
      snapped: refinedPoint,
      videoSize: { w: vw, h: vh },
    });

    const newPoints = [...calibrationPoints, clickPointInImageSpace];
    setCalibrationPoints(newPoints);
    setHistory([...history, calibrationPoints]); // Save state for undo

    // If complete, compute homography
    if (newPoints.length === 5) {
      try {
        const useR = useUserSettings.getState?.()?.calibrationUseRansac;
        let H: Homography;
        let error: number;
        if (useR) {
          const r = ransacHomography(canonicalTargets, newPoints, {
            thresholdPx: 8,
            maxIter: 200,
          });
          if (r.H) {
            H = r.H;
            error = r.errorPx ?? rmsError(r.H, canonicalTargets, newPoints);
          } else {
            H = computeHomographyDLT(canonicalTargets, newPoints);
            error = rmsError(H, canonicalTargets, newPoints);
          }
        } else {
          H = computeHomographyDLT(canonicalTargets, newPoints);
          error = rmsError(H, canonicalTargets, newPoints);
        }

        // Recenter homography on bull click to prevent small translation drift.
        try {
          const bullPoint = newPoints[4];
          if (bullPoint && H) {
            const projected = applyHomography(H, { x: 0, y: 0 });
            const dx = bullPoint.x - projected.x;
            const dy = bullPoint.y - projected.y;
            if (Math.hypot(dx, dy) > 0.25) {
              H = translateHomography(H, dx, dy);
              error = rmsError(H, canonicalTargets, newPoints);
            }
          }
        } catch {}

        const solvedQualities = newPoints.map((pt, idx) =>
          evaluateClickQuality(idx, pt, canonicalTargets[idx], H),
        );
        const placementStats = summarizePlacementQuality(solvedQualities);
        const derivedConfidence = calculateConfidence(error, placementStats);
        setErrorPx(error);
        // Persist the image/canvas capture size and overlay size along with
        // the homography so overlay scaling and scoring use the same
        // intrinsic resolution.
        setCalibration({
          H,
          locked: false,
          errorPx: error,
          confidence: derivedConfidence.percentage,
          imageSize: { w: canvas.width, h: canvas.height },
          overlaySize: {
            w:
              videoRef.current?.clientWidth ||
              videoRef.current?.videoWidth ||
              canvas.width,
            h:
              videoRef.current?.clientHeight ||
              videoRef.current?.videoHeight ||
              canvas.height,
          },
        }); // Not locked yet

        // Debug: show where each click mapped to (use imageToBoard for image->board mapping)
        dlog("[Calibrator] Homography computed:", {
          H,
          errorPx: error,
          pointMappings: newPoints.map((pt, i) => ({
            index: i,
            imageSpace: pt,
            boardSpace: imageToBoard(H, pt),
          })),
        });
      } catch (err) {
        console.error("Homography computation failed:", err);
        setErrorPx(null);
      }
    }
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const previousState = history[history.length - 1];
      setCalibrationPoints(previousState);
      setHistory(history.slice(0, -1));
      setErrorPx(null);
    }
  };

  const handleReset = () => {
    reset();
    setCalibrationPoints([]);
    setHistory([]);
    setErrorPx(null);
    setTheta(null);
    setSectorOffset(0);
    setRotationOffsetRad(0);
    setShowAngleAdjust(false);
    resetTargetOverrides();
    resetAutoPlacementFreeze();
  };

  const currentOverlaySize = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    return {
      w: v?.clientWidth || v?.videoWidth || c?.width || 0,
      h: v?.clientHeight || v?.videoHeight || c?.height || 0,
    };
  };

  const handleLock = () => {
    if (errorPx !== null && H) {
      // Auto-detect board orientation
      const detectedTheta = detectBoardOrientation(H, canonicalTargets);
      setTheta(detectedTheta);

      // Save calibration with theta
      setCalibration({
        locked: true,
        cameraId: selectedCameraId,
        theta: detectedTheta,
        sectorOffset,
        rotationOffsetRad,
        imageSize: {
          w: canvasRef.current?.width || 0,
          h: canvasRef.current?.height || 0,
        },
        overlaySize: currentOverlaySize(),
      });
      const imageSizeSnapshot = {
        w: canvasRef.current?.width || 0,
        h: canvasRef.current?.height || 0,
      };
      const overlaySizeSnapshot = currentOverlaySize();
      saveCalibrationToHistory(
        H as Homography,
        errorPx,
        imageSizeSnapshot,
        overlaySizeSnapshot,
        confidence?.percentage ?? null,
        detectedTheta,
        sectorOffset,
        rotationOffsetRad,
      );
      setSavedCalibrations(getSavedCalibrations());

      // Show angle adjustment UI
      setShowAngleAdjust(true);
    }
  };

  const handleUnlock = () => {
    reset();
    setCalibrationPoints([]);
    setHistory([]);
    setErrorPx(null);
    setTheta(null);
    setSectorOffset(0);
    setRotationOffsetRad(0);
    setShowAngleAdjust(false);
    resetTargetOverrides();
    resetAutoPlacementFreeze();
  };

  const handleAngleSaved = () => {
    if (H) {
      setCalibration({
        locked: true,
        theta,
        sectorOffset,
        rotationOffsetRad,
        imageSize: {
          w: canvasRef.current?.width || 0,
          h: canvasRef.current?.height || 0,
        },
        overlaySize: currentOverlaySize(),
      });
      setShowAngleAdjust(false);
    }
  };

  // NEW: Snap and auto-calibrate from board detection
  const handleSnapAndCalibrate = async () => {
    if (!canvasRef.current || !videoRef.current) return;

    try {
      setAutoDetecting(true);

      // Draw current frame to canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setAutoDetectResult({
          success: false,
          cx: 0,
          cy: 0,
          bullInner: 0,
          bullOuter: 0,
          trebleInner: 0,
          trebleOuter: 0,
          doubleInner: 0,
          doubleOuter: 0,
          confidence: 0,
          homography: null,
          errorPx: null,
          calibrationPoints: [],
          message: "Failed to capture frame",
        });
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      // Run detection
      const result = detectBoard(canvas);
      const refined = refineRingDetection(result);

      setAutoDetectResult(refined);

      const autoConfidence = getGlobalCalibrationConfidence(
        typeof refined.errorPx === "number" ? refined.errorPx : null,
      );

      if (refined.success && refined.homography) {
        // Auto-calibration successful!
        // Set the homography and auto-lock
        setCalibrationPoints([]);
        setHistory([]);
        setErrorPx(refined.errorPx);

        // Detect board orientation
        const detectedTheta = refined.theta
          ? refined.theta
          : detectBoardOrientation(refined.homography, canonicalTargets);

        // Save and lock. Include imageSize (intrinsic capture size) and an
        // overlaySize to make overlay rendering consistent across UI.
        setCalibration({
          H: refined.homography,
          locked: true,
          errorPx: refined.errorPx,
          confidence:
            typeof autoConfidence === "number" ? autoConfidence : null,
          cameraId: selectedCameraId,
          theta: detectedTheta,
          sectorOffset: 0,
          rotationOffsetRad: 0,
          imageSize: { w: canvas.width, h: canvas.height },
          overlaySize: {
            w: videoRef.current?.videoWidth || canvas.width,
            h: videoRef.current?.videoHeight || canvas.height,
          },
        });

        // Save to local calibration history for easy restore
        try {
          saveCalibrationToHistory(
            refined.homography,
            typeof refined.errorPx === "number" ? refined.errorPx : null,
            { w: canvas.width, h: canvas.height },
            {
              w: videoRef.current?.videoWidth || canvas.width,
              h: videoRef.current?.videoHeight || canvas.height,
            },
            typeof autoConfidence === "number" ? autoConfidence : null,
            detectedTheta,
            0,
            0,
          );
        } catch (e) {
          console.warn("Failed to write calibration to history:", e);
        }

        setTheta(detectedTheta);
        setSectorOffset(0);
        setRotationOffsetRad(0);
        setShowAngleAdjust(true);

        dlog("[Auto-Calibrate] Success:", {
          confidence: refined.confidence,
          errorPx: refined.errorPx,
          theta: detectedTheta,
        });
      }

      setShowAutoDetect(true);
    } catch (err) {
      console.error("[Auto-Calibrate] Error:", err);
      setAutoDetectResult({
        success: false,
        cx: 0,
        cy: 0,
        bullInner: 0,
        bullOuter: 0,
        trebleInner: 0,
        trebleOuter: 0,
        doubleInner: 0,
        doubleOuter: 0,
        confidence: 0,
        homography: null,
        errorPx: null,
        calibrationPoints: [],
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      setShowAutoDetect(true);
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleLoadPrevious = (savedCal: any) => {
    setCalibration({
      H: savedCal.H,
      locked: true,
      errorPx: savedCal.errorPx,
      confidence:
        typeof savedCal.confidence === "number" ? savedCal.confidence : null,
      ...(typeof savedCal.theta === "number" ? { theta: savedCal.theta } : {}),
      ...(typeof savedCal.sectorOffset === "number"
        ? { sectorOffset: savedCal.sectorOffset }
        : {}),
      ...(typeof savedCal.rotationOffsetRad === "number"
        ? { rotationOffsetRad: savedCal.rotationOffsetRad }
        : {}),
      ...(savedCal.imageSize ? { imageSize: savedCal.imageSize } : {}),
      ...(savedCal.overlaySize ? { overlaySize: savedCal.overlaySize } : {}),
    });
    setCalibrationPoints([]);
    setHistory([]);
    setErrorPx(savedCal.errorPx);
    setTheta(typeof savedCal.theta === "number" ? savedCal.theta : null);
    setSectorOffset(
      typeof savedCal.sectorOffset === "number" ? savedCal.sectorOffset : 0,
    );
    setRotationOffsetRad(
      typeof savedCal.rotationOffsetRad === "number"
        ? savedCal.rotationOffsetRad
        : 0,
    );
    setShowHistory(false);
    resetTargetOverrides();
  };

  const currentPointIndex = calibrationPoints.length;
  const isComplete = calibrationPoints.length === 5;

  // Check if all points are validly placed (on double ring or bull)
  const placementQuality = useMemo<PlacementQualityStats | null>(() => {
    if (calibrationPoints.length !== 5 || !H) {
      return null;
    }

    const qualities = calibrationPoints.map((point, idx) =>
      evaluateClickQuality(idx, point, canonicalTargets[idx], H),
    );
    return summarizePlacementQuality(qualities);
  }, [calibrationPoints, canonicalTargets, H]);

  const confidence = useMemo(() => {
    if (errorPx !== null && placementQuality) {
      return calculateConfidence(errorPx, placementQuality);
    }
    if (typeof storedConfidence === "number") {
      const normalized = Number(storedConfidence.toFixed(1));
      return {
        percentage: normalized,
        ...describeConfidenceLevel(normalized),
      };
    }
    if (errorPx !== null) {
      return calculateConfidence(errorPx, null);
    }
    return null;
  }, [errorPx, placementQuality, storedConfidence]);

  const derivedAutoDetectConfidence = useMemo(() => {
    if (!autoDetectResult || typeof autoDetectResult.errorPx !== "number") {
      return null;
    }
    return getGlobalCalibrationConfidence(autoDetectResult.errorPx);
  }, [autoDetectResult]);

  const mapImageToCanvas = (imgX: number, imgY: number) => {
    const { cropX, cropY, cropW, cropH, canvasWidth, canvasHeight } =
      cropInfoRef.current;
    if (!canvasWidth || !canvasHeight || !cropW || !cropH) {
      return { x: imgX, y: imgY };
    }
    const normX = (imgX - cropX) / cropW;
    const normY = (imgY - cropY) / cropH;
    return {
      x: normX * canvasWidth,
      y: normY * canvasHeight,
    };
  };

  const mapCanvasToImage = (canvasX: number, canvasY: number) => {
    const { cropX, cropY, cropW, cropH, canvasWidth, canvasHeight } =
      cropInfoRef.current;
    if (!canvasWidth || !canvasHeight) {
      return { x: canvasX, y: canvasY };
    }
    const imgX = cropX + (canvasX / canvasWidth) * cropW;
    const imgY = cropY + (canvasY / canvasHeight) * cropH;
    return { x: imgX, y: imgY };
  };

  const getCanvasPointFromPointer = (event: CanvasInputEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;
    if ("touches" in event) {
      if (event.touches.length === 0) return null;
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    const canvasX = ((clientX - rect.left) * canvas.width) / rect.width;
    const canvasY = ((clientY - rect.top) * canvas.height) / rect.height;
    return { canvasX, canvasY };
  };

  const resetTargetOverrides = () => {
    targetOverridesRef.current = new Array(5).fill(null);
    targetScreenPositionsRef.current = new Array(5).fill(null);
    localStorage.removeItem("ndn:cal:target-overrides");
  };

  const freezeAutoPlacement = () => {
    if (!autoPlacementFrozenRef.current) {
      autoPlacementFrozenRef.current = true;
    }
  };

  const resetAutoPlacementFreeze = () => {
    autoPlacementFrozenRef.current = false;
  };

  const getDragHitRadius = (
    pointerType?: CanvasPointerEvent["pointerType"] | null,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return 32;
    const base = Math.min(canvas.width, canvas.height) / 600;
    const scaled = Math.max(28, Math.min(70, 32 * (base || 1)));
    if (pointerType === "touch") {
      return scaled * 1.35;
    }
    if (pointerType === "pen") {
      return scaled * 1.15;
    }
    return scaled;
  };

  const tryBeginTargetDrag = (
    canvasX: number,
    canvasY: number,
    pointerType?: CanvasPointerEvent["pointerType"],
  ) => {
    if (locked) return false;
    const positions = targetScreenPositionsRef.current;
    const hitRadius = getDragHitRadius(
      pointerType ?? lastPointerTypeRef.current,
    );
    for (let i = calibrationPoints.length; i < positions.length; i++) {
      const pos = positions[i];
      if (!pos) continue;
      const dist = Math.hypot(pos.x - canvasX, pos.y - canvasY);
      if (dist <= hitRadius) {
        dragStateRef.current = {
          targetIndex: i,
          offsetX: canvasX - pos.x,
          offsetY: canvasY - pos.y,
        };
        dragMovedRef.current = false;
        return true;
      }
    }
    return false;
  };

  const updateDraggedTarget = (canvasX: number, canvasY: number) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;
    const adjustedX = canvasX - dragState.offsetX;
    const adjustedY = canvasY - dragState.offsetY;
    const canvas = canvasRef.current;
    const maxX = canvas?.width ?? adjustedX;
    const maxY = canvas?.height ?? adjustedY;
    const clampedX = Math.max(0, Math.min(maxX, adjustedX));
    const clampedY = Math.max(0, Math.min(maxY, adjustedY));
    const imagePoint = mapCanvasToImage(clampedX, clampedY);
    targetOverridesRef.current[dragState.targetIndex] = imagePoint;
    targetScreenPositionsRef.current[dragState.targetIndex] = {
      x: clampedX,
      y: clampedY,
    };
  };

  const flushPendingDragUpdate = () => {
    if (!dragPendingPointRef.current) return;
    const { x, y } = dragPendingPointRef.current;
    dragPendingPointRef.current = null;
    updateDraggedTarget(x, y);
  };

  const scheduleDragUpdate = (
    canvasX: number,
    canvasY: number,
    immediate = false,
  ) => {
    dragPendingPointRef.current = { x: canvasX, y: canvasY };
    if (immediate) {
      if (dragUpdateFrameRef.current !== null) {
        cancelAnimationFrame(dragUpdateFrameRef.current);
        dragUpdateFrameRef.current = null;
      }
      flushPendingDragUpdate();
      return;
    }
    if (dragUpdateFrameRef.current === null) {
      dragUpdateFrameRef.current = requestAnimationFrame(() => {
        dragUpdateFrameRef.current = null;
        flushPendingDragUpdate();
      });
    }
  };

  const endTargetDrag = (pointerId?: number) => {
    flushPendingDragUpdate();
    if (dragUpdateFrameRef.current !== null) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = null;
    }
    dragPendingPointRef.current = null;
    const activePointerId = pointerId ?? dragStateRef.current?.pointerId;
    if (
      typeof activePointerId === "number" &&
      canvasRef.current?.hasPointerCapture?.(activePointerId)
    ) {
      canvasRef.current.releasePointerCapture(activePointerId);
    }
    dragStateRef.current = null;
    saveTargetOverrides(targetOverridesRef.current);
    if (canvasRef.current && !locked) {
      canvasRef.current.style.cursor = "crosshair";
    }
    lastPointerTypeRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (dragUpdateFrameRef.current !== null) {
        cancelAnimationFrame(dragUpdateFrameRef.current);
        dragUpdateFrameRef.current = null;
      }
    };
  }, []);

  // Draw canvas with target zones - ALWAYS from camera
  const boardEstimateRef = useRef<{
    cx: number;
    cy: number;
    radius: number;
    timestamp: number;
  } | null>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const drawCanvas = useCallback(
    (ref: React.RefObject<HTMLCanvasElement>) => {
      try {
        const canvas = ref.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const video = videoRef.current;
        const showGuides = false; // Keep the camera view clean; no calibration overlays
        let vw = canvas.width;
        let vh = canvas.height;
        let cropW = canvas.width / zoom;
        let cropH = canvas.height / zoom;
        let cropX = (vw - cropW) / 2;
        let cropY = (vh - cropH) / 2;

        const drawFallbackBackground = (message?: string) => {
          ctx.fillStyle = "#374151";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (message) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            ctx.font = "14px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(message, canvas.width / 2, canvas.height / 2);
          }
        };

        if (video) {
          const hasStream = video.srcObject instanceof MediaStream;
          const readyState = video.readyState;

          if (hasStream && readyState >= 2) {
            try {
              vw = video.videoWidth || canvas.width;
              vh = video.videoHeight || canvas.height;
              cropW = vw / zoom;
              cropH = vh / zoom;
              cropX = (vw - cropW) / 2;
              cropY = (vh - cropH) / 2;

              ctx.drawImage(
                video,
                cropX,
                cropY,
                cropW,
                cropH,
                0,
                0,
                canvas.width,
                canvas.height,
              );
            } catch (err) {
              console.error("Failed to draw video frame:", err);
              drawFallbackBackground();
            }

            // Periodically run board detection on the full video frame (not cropped)
            if (showGuides) {
              const now = performance.now();
              const allowDetection =
                (typeof document === "undefined" ||
                  document.visibilityState !== "hidden") &&
                !autoPlacementFrozenRef.current &&
                !dragStateRef.current;
              const needsDetection =
                allowDetection &&
                calibrationPoints.length < 5 &&
                video.videoWidth > 0 &&
                video.videoHeight > 0 &&
                (!boardEstimateRef.current ||
                  now - boardEstimateRef.current.timestamp > 600);

              if (needsDetection) {
                if (!detectionCanvasRef.current) {
                  detectionCanvasRef.current = document.createElement("canvas");
                }
                const detectCanvas = detectionCanvasRef.current;
                if (detectCanvas) {
                  detectCanvas.width = video.videoWidth;
                  detectCanvas.height = video.videoHeight;
                  const detectCtx = detectCanvas.getContext("2d");
                  if (detectCtx) {
                    detectCtx.drawImage(
                      video,
                      0,
                      0,
                      detectCanvas.width,
                      detectCanvas.height,
                    );
                    try {
                      const detection = detectBoard(detectCanvas);
                      if (detection?.success && detection.doubleOuter > 0) {
                        const estimate = {
                          cx: detection.cx,
                          cy: detection.cy,
                          radius: detection.doubleOuter,
                          timestamp: now,
                        };
                        boardEstimateRef.current = estimate;
                        if (!autoPlacementFrozenRef.current) {
                          freezeAutoPlacement();
                          lockTargetsToEstimate(estimate);
                        }
                      }
                    } catch (err) {
                      console.warn("Board detection failed", err);
                    }
                  }
                }
              }
            }
          } else {
            drawFallbackBackground(
              readyState < 2 ? "Loading video..." : undefined,
            );
          }
        } else {
          drawFallbackBackground("Camera feed unavailable");
        }

        cropInfoRef.current = {
          cropX,
          cropY,
          cropW,
          cropH,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        };

        if (!showGuides) {
          targetScreenPositionsRef.current = new Array(5).fill(null);
          return;
        }

        const boardEstimate = boardEstimateRef.current;
        const activeDragIndex = dragStateRef.current?.targetIndex ?? null;

        const ensureVisible = (point: Point | null): Point | null => {
          if (!point) return null;
          const { x, y } = point;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
          }
          const margin = 40;
          if (
            x < -margin ||
            y < -margin ||
            x > canvas.width + margin ||
            y > canvas.height + margin
          ) {
            return null;
          }
          return point;
        };

        // Draw target circles for uncaptured points
        for (let i = 0; i < 5; i++) {
          if (i >= calibrationPoints.length) {
            const targetPoint = canonicalTargets[i];
            const fallbackScale = Math.min(canvas.width, canvas.height) / 360;
            const fallbackPos: Point = {
              x: canvas.width / 2 + targetPoint.x * fallbackScale,
              y: canvas.height / 2 + targetPoint.y * fallbackScale,
            };

            let resolved: Point | null = null;

            const override = targetOverridesRef.current[i];
            if (override) {
              resolved = ensureVisible(
                mapImageToCanvas(override.x, override.y),
              );
            }

            if (!resolved && boardEstimate) {
              const pxPerMm = boardEstimate.radius / BoardRadii.doubleOuter;
              const imageX = boardEstimate.cx + targetPoint.x * pxPerMm;
              const imageY = boardEstimate.cy + targetPoint.y * pxPerMm;
              resolved = ensureVisible(mapImageToCanvas(imageX, imageY));
            }

            if (!resolved) {
              resolved = fallbackPos;
            }

            const drawX = resolved.x;
            const drawY = resolved.y;

            targetScreenPositionsRef.current[i] = resolved;
            const isDraggingTarget = activeDragIndex === i;

            if (isDraggingTarget) {
              ctx.strokeStyle = "rgba(255,255,255,0.8)";
              ctx.lineWidth = 7;
              ctx.globalAlpha = 0.2;
              ctx.beginPath();
              ctx.arc(drawX, drawY, 30, 0, Math.PI * 2);
              ctx.stroke();
            }

            ctx.strokeStyle = TARGET_COLORS[i];
            ctx.lineWidth = isDraggingTarget ? 4 : 3;
            ctx.globalAlpha = isDraggingTarget ? 1 : 0.8;
            ctx.beginPath();
            ctx.arc(drawX, drawY, 22, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(drawX, drawY, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = TARGET_COLORS[i];
            ctx.beginPath();
            ctx.arc(drawX, drawY, 5, 0, Math.PI * 2);
            if (typeof ctx.fill === "function") ctx.fill();
            ctx.globalAlpha = 1;

            ctx.fillStyle = TARGET_COLORS[i];
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(TARGET_LABELS[i].split(" ")[0], drawX, drawY - 35);
          }
        }

        // Draw completed points with larger markers
        calibrationPoints.forEach((point, i) => {
          targetScreenPositionsRef.current[i] = null;
          const mapped = mapImageToCanvas(point.x, point.y);
          const drawX = mapped.x;
          const drawY = mapped.y;

          const quality = evaluateClickQuality(
            i,
            point,
            canonicalTargets[i],
            H || undefined,
          );

          // Use green if valid, red if invalid
          const pointColor = quality.isValid ? "#22c55e" : "#ef4444";

          // Draw outer circle (validation ring)
          ctx.strokeStyle = pointColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(drawX, drawY, 15, 0, Math.PI * 2);
          ctx.stroke();

          // Draw filled circle background
          ctx.fillStyle = pointColor;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(drawX, drawY, 12, 0, Math.PI * 2);
          if (typeof ctx.fill === "function") ctx.fill();

          // Draw checkmark or X (white text)
          ctx.fillStyle = "#fff";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = 1;
          ctx.fillText(quality.isValid ? "✓" : "✗", drawX, drawY);
          ctx.fillText(quality.isValid ? sym("ok") : sym("no"), drawX, drawY);

          // Draw glow effect around valid clicks
          if (quality.isValid) {
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.3;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(drawX, drawY, 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });

        // Draw calibration status circle when complete
        if (isComplete && errorPx !== null && confidence) {
          // Only draw the status badge at the top (small indicator)
          // Individual point circles above show pass/fail for each point

          const badgeWidth = 140;
          const badgeHeight = 36;
          const badgeX = canvas.width / 2 - badgeWidth / 2;
          const badgeY = 15;

          // Determine color based on confidence level
          let badgeColor: string;
          if (confidence.percentage >= 75) {
            // PASS: Bright green
            badgeColor = "#22c55e";
          } else {
            // FAIL: Bright red
            badgeColor = "#ef4444";
          }

          // Draw badge background with slight shadow
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = badgeColor;
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === "function") {
            (ctx as any).roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
          } else {
            // Fallback for environments (jsdom) without roundRect/arcTo support
            // Draw a simple rectangle instead of a rounded rect to avoid errors
            ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
          }
          if (typeof ctx.fill === "function") ctx.fill();

          // Draw badge text
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#fff";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const statusText =
            confidence.percentage >= 75
              ? `${sym("ok")} PASS ${confidence.percentage}%`
              : `${sym("no")} FAIL ${confidence.percentage}%`;
          ctx.fillText(statusText, canvas.width / 2, badgeY + badgeHeight / 2);
        }
      } catch (err) {
        // In test environments (jsdom) some Canvas APIs are missing. We
        // swallow drawing errors to avoid breaking test flow; drawing is
        // non-critical for logic and mapping correctness.
        // console.debug("drawCanvas skipped due to unsupported canvas API", err);
        return;
      }
    },
    [
      calibrationPoints,
      canonicalTargets,
      confidence,
      errorPx,
      isComplete,
      zoom,
      H,
    ],
  );

  // Redraw when points change - continuous animation loop
  useEffect(() => {
    const render = () => {
      drawCanvas(canvasRef);
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [drawCanvas]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-blue-950/30 to-slate-950 text-white overflow-x-hidden"
    >
      {/* Modern Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur-xl border-b border-blue-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div>
            <div className="flex items-center gap-4">
              <div className="text-4xl">📷</div>
              <div>
                <h2 className="text-2xl font-black tracking-tight">
                  Camera Connection
                </h2>
                <p className="text-white/40 text-sm font-medium">
                  Connect and preview your dartboard camera
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Camera Error Alert */}
        {cameraError && (
          <div className="mb-6 bg-gradient-to-r from-red-500/10 to-red-600/5 border border-red-500/30 backdrop-blur-md p-4 sm:p-6 rounded-2xl animate-pulse">
            <div className="flex gap-3">
              <div className="text-2xl flex-shrink-0">⚠️</div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-300 mb-1">
                  Camera Access Required
                </h3>
                <p className="text-sm text-red-200/80 mb-2">{cameraError}</p>
                <p className="text-xs text-red-200/60">
                  Grant camera permissions in your browser settings to proceed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left: Camera Canvas */}
          <div className="lg:col-span-2">
            {/* Zoom Slider - moved above the camera feed as requested */}
            <div className="mb-4 flex items-center gap-3 bg-slate-800/80 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-700/50 shadow-lg">
              <span className="text-sm text-slate-400 font-bold whitespace-nowrap flex items-center gap-2">
                🔍 <span className="hidden sm:inline">ZOOM</span>
              </span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-sm font-mono font-bold text-cyan-400 min-w-[3.5rem] text-right bg-slate-900/50 px-2 py-1 rounded border border-slate-700/50">
                {zoom.toFixed(1)}x
              </span>
            </div>

            <div className="bg-gradient-to-b from-slate-800/60 to-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">
              {/* Canvas Container */}
              <div
                className="relative bg-black/20 aspect-video sm:aspect-auto"
                style={{ minHeight: "300px" }}
              >
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={600}
                  className="w-full h-full object-cover"
                  style={{
                    cursor: "default",
                    touchAction: "auto",
                  }}
                />

                {/* Status Badge */}
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-2 rounded-full border border-blue-400/30 text-sm font-semibold">
                  <span
                    className={`w-2.5 h-2.5 rounded-full animate-pulse ${cameraReady ? "bg-emerald-400" : "bg-yellow-400"}`}
                  ></span>
                  <span className="text-slate-200">
                    {cameraReady ? "Live 🔴" : "Ready ✅"}
                  </span>
                </div>

                {/* Lock Overlay */}
                {locked && (
                  <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="bg-emerald-600/90 backdrop-blur-md px-6 py-3 rounded-xl font-bold text-white flex items-center gap-2 shadow-2xl">
                      <span>🔒</span> LOCKED
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/60 bg-slate-900/40 text-sm text-slate-200">
                <div>
                  <p className="font-semibold">Match showcase & in-game feed</p>
                  <p className="text-slate-400 text-xs">
                    What you see here is exactly what players see before and
                    during the match.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  Stable feed
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-5">
            {/* Legacy Mode Pills (test compatibility) */}
            <div className="flex items-center gap-2">
              <button
                data-testid="mode-local"
                className={`btn btn--ghost ${calMode === "local" ? "bg-blue-600/20" : ""}`}
                onClick={() => handleSetMode("local")}
              >
                Local 💻
              </button>
              <button
                data-testid="mode-phone"
                className={`btn btn--ghost ${calMode === "phone" ? "bg-blue-600/20" : ""}`}
                onClick={() => handleSetMode("phone")}
              >
                Phone 📱
              </button>
              <button
                data-testid="mode-wifi"
                className={`btn btn--ghost ${calMode === "wifi" ? "bg-blue-600/20" : ""}`}
                onClick={() => handleSetMode("wifi")}
              >
                WiFi 📶
              </button>
            </div>
            {/* Minimal DevicePicker UI for tests */}
            <div
              data-testid="device-picker-root"
              data-open={devicePickerOpen ? "true" : "false"}
              className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3"
            >
              <div className="flex items-center gap-2">
                <button
                  data-testid="device-picker-toggle"
                  className="btn btn--ghost"
                  onClick={toggleDevicePicker}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  Device
                </button>
                <button
                  data-testid="cam-lock-toggle"
                  className="btn btn--ghost"
                  onClick={handleCamLockToggle}
                >
                  {userSettings.preferredCameraLocked ? "Unlock" : "Lock"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-300/80 font-semibold">
                    Match readiness
                  </p>
                  <p className="text-sm text-slate-200 font-semibold">
                    Pre-match showcase & live game view
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${cameraReady ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-yellow-500/10 border-yellow-400/40 text-yellow-200"}`}
                >
                  {cameraReady ? "Live" : "Standing by"}
                </span>
              </div>
              <div className="space-y-2 text-sm text-slate-200">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    🎬 <span>Pre-match showcase feed</span>
                  </span>
                  <span className="text-emerald-300 font-semibold">
                    {locked ? "Locked" : "Select & lock"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    🎯 <span>In-game camera feed</span>
                  </span>
                  <span className="text-emerald-300 font-semibold">
                    {cameraReady ? "Visible" : "Awaiting"}
                  </span>
                </div>
              </div>
              <button
                className="mt-4 w-full btn btn--primary"
                onClick={handleCamLockToggle}
              >
                {locked || userSettings.preferredCameraLocked
                  ? "Unlock camera"
                  : "Lock this camera for match"}
              </button>
              <p className="mt-2 text-xs text-slate-300/80">
                Locking keeps the same camera for lobby showcase and every leg.
                Change cameras anytime from here.
              </p>
            </div>
          </div>
        </div>
        {/* Camera Selector */}
        {availableCameras.length > 1 && (
          <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-5">
            <button
              onClick={() => setShowCameraSelector(!showCameraSelector)}
              className="w-full flex items-center justify-between font-semibold text-purple-300 hover:text-purple-200 transition-colors mb-3"
            >
              <span>📹 Cameras ({availableCameras.length})</span>
              <span className="text-lg">{showCameraSelector ? "▼" : "▶"}</span>
            </button>
            {showCameraSelector && (
              <div className="space-y-2">
                {availableCameras.map((cam) => (
                  <button
                    key={cam.deviceId}
                    onClick={() => {
                      handleCameraChange(cam.deviceId);
                      setShowCameraSelector(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-all border ${
                      selectedCameraId === cam.deviceId
                        ? "bg-cyan-600/30 border-cyan-400/40 text-cyan-200 font-semibold"
                        : "bg-slate-700/40 hover:bg-slate-700/60 border-slate-600/30 hover:border-slate-500/30 text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{cam.label}</span>
                      {selectedCameraId === cam.deviceId && <span>✅</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: "none" }}
        width={640}
        height={480}
      />
    </div>
  );
}
