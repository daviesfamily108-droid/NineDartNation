import { useCallback, useEffect, useRef, useState } from "react";
import { dlog } from "../utils/logger";
import { useUserSettings } from "../store/userSettings";
import { useCalibration } from "../store/calibration";
import { useMatch } from "../store/match";
import {
  BoardRadii,
  drawPolyline,
  sampleRing,
  scaleHomography,
  type Point,
  applyHomography,
  drawCross,
  refinePointSobel,
} from "../utils/vision";
import { scoreFromImagePoint } from "../utils/autoscore";
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

// Shared ring type across autoscore/manual flows
type Ring = "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL";

const AUTO_COMMIT_MIN_FRAMES = 1;
const AUTO_COMMIT_HOLD_MS = 120;
const AUTO_COMMIT_COOLDOWN_MS = 400;
const AUTO_STREAM_IGNORE_MS = 450;
const DETECTION_ARM_DELAY_MS = 5000;
const AUTO_COMMIT_CONFIDENCE = 0.85;
const BOARD_CLEAR_GRACE_MS = 6500;
const DISABLE_CAMERA_OVERLAY = true;

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
};

export default function CameraView({
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
}: {
  onVisitCommitted?: (score: number, darts: number, finished: boolean) => void;
  showToolbar?: boolean;
  onAutoDart?: (
    value: number,
    ring: "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
    info?: { sector: number | null; mult: 0 | 1 | 2 | 3 },
  ) => void;
  immediateAutoCommit?: boolean;
  hideInlinePanels?: boolean;
  scoringMode?: "x01" | "custom";
  onGenericDart?: (value: number, ring: Ring, meta: { label: string }) => void;
  onGenericReplace?: (
    value: number,
    ring: Ring,
    meta: { label: string },
  ) => void;
  x01DoubleInOverride?: boolean;
  onAddVisit?: (score: number, darts: number, meta?: any) => void;
  onEndLeg?: (score?: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    preferredCameraId,
    preferredCameraLabel,
    setPreferredCamera,
    autoscoreProvider,
    autoscoreWsUrl,
    cameraAspect,
    cameraFitMode,
    autoCommitMode = "wait-for-clear",
    cameraEnabled,
    setCameraEnabled,
    preferredCameraLocked,
    hideCameraOverlay,
    setHideCameraOverlay,
  } = useUserSettings();
  const manualOnly = autoscoreProvider === "manual";
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    [],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const cameraSession = useCameraSession();
  const isPhoneCamera = preferredCameraLabel === "Phone Camera";
  const sessionStream = cameraSession.getMediaStream?.() || null;
  const sessionStreaming = cameraSession.isStreaming;
  const phoneFeedActive =
    isPhoneCamera &&
    cameraSession.mode === "phone" &&
    sessionStreaming &&
    !!sessionStream;
  const effectiveStreaming = streaming || sessionStreaming;
  const [cameraStarting, setCameraStarting] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const { H, imageSize, reset: resetCalibration, _hydrated } = useCalibration();
  useEffect(() => {
    if (preferredCameraLocked && !hideCameraOverlay) {
      setHideCameraOverlay(true);
    }
  }, [preferredCameraLocked, hideCameraOverlay, setHideCameraOverlay]);
  const [lastAutoScore, setLastAutoScore] = useState<string>("");
  const [manualScore, setManualScore] = useState<string>("");
  const [lastAutoValue, setLastAutoValue] = useState<number>(0);
  const [lastAutoRing, setLastAutoRing] = useState<Ring>("MISS");
  const [pendingDarts, setPendingDarts] = useState<number>(0);
  const [pendingScore, setPendingScore] = useState<number>(0);
  const [pendingEntries, setPendingEntries] = useState<
    { label: string; value: number; ring: Ring }[]
  >([]);
  const [pendingPreOpenDarts, setPendingPreOpenDarts] = useState<number>(0);
  const [pendingDartsAtDouble, setPendingDartsAtDouble] = useState<number>(0);
  const [awaitingClear, setAwaitingClear] = useState(false);
  const pendingCommitRef = useRef<{
    score: number;
    darts: number;
    finished: boolean;
  } | null>(null);
  const pendingCommitTimerRef = useRef<number | null>(null);
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
  const frameCountRef = useRef<number>(0);
  const [detectionLog, setDetectionLog] = useState<DetectionLogEntry[]>([]);
  const [showDetectionLog, setShowDetectionLog] = useState(false);
  const clearPendingCommitTimer = useCallback(() => {
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
  }, []);

  const captureDetectionLog = useCallback((entry: DetectionLogEntry) => {
    const next = [...detectionLogRef.current.slice(-8), entry];
    detectionLogRef.current = next;
    setDetectionLog(next);
    try {
      (window as any).ndnCameraDiagnostics = next;
    } catch {}
  }, []);
  const finalizePendingCommit = useCallback(
    (_trigger: "event" | "timeout" | "teardown") => {
      const pending = pendingCommitRef.current;
      if (!pending) return;
      pendingCommitRef.current = null;
      clearPendingCommitTimer();
      setAwaitingClear(false);
      if (onVisitCommitted) {
        try {
          onVisitCommitted(pending.score, pending.darts, pending.finished);
        } catch {}
      }
    },
    [onVisitCommitted, clearPendingCommitTimer],
  );
  const enqueueVisitCommit = useCallback(
    (payload: { score: number; darts: number; finished: boolean }) => {
      if (!onVisitCommitted) return;
      if (!shouldDeferCommit) {
        try {
          onVisitCommitted(payload.score, payload.darts, payload.finished);
        } catch {}
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
    ],
  );
  const clearPendingManual = useCallback((reason: "indicator" | "toolbar") => {
    setPendingDarts(0);
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
    } catch {}
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
  const matchState = useMatch((s) => s);
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
    } catch {}
  }, [pendingEntries, pendingDarts, pendingScore, setVisit]);
  useEffect(
    () => () => {
      try {
        resetPendingVisit();
      } catch {}
    },
    [resetPendingVisit],
  );
  const addVisit = useMatch((s) => s.addVisit);
  const endLeg = useMatch((s) => s.endLeg);
  // Prefer provided adapters (matchActions wrappers) when available
  const callAddVisit = (score: number, darts: number, meta?: any) => {
    try {
      if (onAddVisit) onAddVisit(score, darts, meta);
      else addVisit(score, darts, meta);
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
  const [pulseManualPill, setPulseManualPill] = useState(false);
  const pulseTimeoutRef = useRef<number | null>(null);
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
      } catch {}
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
      } catch {}
    }
    return () => {
      mounted = false;
      try {
        navigator.mediaDevices.removeEventListener("devicechange", refresh);
      } catch {}
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
    } catch {}
  }, [
    matchState.currentPlayerIdx,
    matchState.players?.[matchState.currentPlayerIdx]?.legs?.length,
  ]);

  // Manage per-dart timer lifecycle
  useEffect(() => {
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
          // Time expired: record a MISS and reset will occur via pendingEntries change
          try {
            addDart(0, "MISS 0", "MISS");
          } catch {}
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
    if (!showManualModal) return;
    const id = setInterval(() => {
      try {
        const v = videoRef.current;
        const c = manualPreviewRef.current;
        if (!v || !c) return;
        const vw = v.videoWidth || 0;
        const vh = v.videoHeight || 0;
        if (!vw || !vh) return;
        const cw = c.clientWidth || 640;
        const ch = c.clientHeight || 360;
        // Set backing size to match display for crisp rendering
        if (c.width !== cw) c.width = cw;
        if (c.height !== ch) c.height = ch;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
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
    return () => stopCamera();
  }, []);

  const canFallbackToLocal = isPhoneCamera && !phoneFeedActive;

  async function startCamera() {
    if (cameraStarting || streaming) return;

    // Only skip local startup when the phone feed is actively streaming
    if (isPhoneCamera && phoneFeedActive) {
      dlog("[CAMERA] Phone camera stream active - leaving local camera idle");
      setCameraStarting(false);
      return;
    }

    setCameraStarting(true);
    dlog("[CAMERA] Starting camera...");
    try {
      // If a preferred camera is set, request it; otherwise default to back camera on mobile
      const constraints: MediaStreamConstraints = preferredCameraId
        ? { video: { deviceId: { exact: preferredCameraId } }, audio: false }
        : { video: { facingMode: "environment" }, audio: false }; // Prefer back camera on mobile
      dlog("[CAMERA] Using constraints:", constraints);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
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
            video: true,
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
            video: true,
            audio: false,
          });
        } else {
          throw err;
        }
      }
      if (videoRef.current) {
        dlog("[CAMERA] Setting stream to video element");
        videoRef.current.srcObject = stream;
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
        videoRef.current.addEventListener("canplay", () =>
          dlog("[CAMERA] Video canplay"),
        );
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
      } else {
        console.error("[CAMERA] Video element not found");
      }
      setStreaming(true);
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
      alert("Camera permission denied or not available.");
    } finally {
      setCameraStarting(false);
    }
  }

  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
      setStreaming(false);
      setCameraStarting(false);
    }
  }

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const sessionStream = cameraSession.getMediaStream?.() || null;
    const sessionVideo = cameraSession.getVideoElementRef?.() || null;
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
    } catch {}
    if (!streaming) setStreaming(true);
  }, [cameraSession.mode, cameraSession.isStreaming, streaming, cameraSession]);

  function capture() {
    try {
      if (!canvasRef.current) return;
      const primary = videoRef.current;
      const sessionVideo = cameraSession.getVideoElementRef?.() || null;
      const source =
        primary && primary.videoWidth > 0 && primary.videoHeight > 0
          ? primary
          : sessionVideo || primary;
      if (!source) return;
      const video = source;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/png");
      setSnapshotUrl(url);
    } catch (e) {
      console.warn("Capture error:", e);
    }
  }

  // Inline light-weight device switcher (optional)
  function CameraSelector() {
    if (!availableCameras.length) return null;
    return (
      <div className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-black/40 rounded px-2 py-1 text-xs">
        <span>Cam:</span>
        <select
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
          {availableCameras.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label ||
                (d.deviceId ? `Camera (${d.deviceId.slice(0, 6)})` : "Camera")}
            </option>
          ))}
        </select>
        <button
          className="btn btn--ghost btn-sm ml-2"
          onClick={async () => {
            try {
              // quick user-triggered rescan
              const list = await navigator.mediaDevices.enumerateDevices();
              setAvailableCameras(list.filter((d) => d.kind === "videoinput"));
            } catch (err) {
              console.warn("Rescan failed:", err);
              alert(
                "Failed to rescan devices. Ensure camera permissions are granted.",
              );
            }
          }}
          title="Rescan connected cameras"
        >
          Rescan
        </button>
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
      if (isPhoneCamera) return;
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
      const sx = w / imageSize.w;
      const sy = h / imageSize.h;
      const Hs = scaleHomography(H, sx, sy);
      const rings = [
        BoardRadii.bullInner,
        BoardRadii.bullOuter,
        BoardRadii.trebleInner,
        BoardRadii.trebleOuter,
        BoardRadii.doubleInner,
        BoardRadii.doubleOuter,
      ];
      for (const r of rings) {
        const poly = sampleRing(Hs, r, 720);
        drawPolyline(
          ctx,
          poly,
          r === BoardRadii.doubleOuter ? "#22d3ee" : "#a78bfa",
          r === BoardRadii.doubleOuter ? 3 : 2,
        );
      }
    } catch (e) {
      // Silently ignore drawing errors to prevent re-render loops
      console.warn("Overlay drawing error:", e);
    }
  }

  useEffect(() => {
    if (manualOnly || DISABLE_CAMERA_OVERLAY) return;
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
  ]);

  // Built-in autoscore loop (offline/local CV)
  useEffect(() => {
    if (manualOnly) return;
    if (autoscoreProvider !== "built-in") return;
    // Choose source: local video element, or paired phone camera element
    const cameraSession = useCameraSession.getState();
    const isPhone =
      useUserSettings.getState().preferredCameraLabel === "Phone Camera";
    const sourceVideo: HTMLVideoElement | null = isPhone
      ? cameraSession.getVideoElementRef?.() || null
      : videoRef.current;
    if (!sourceVideo) return;
    if (!H || !imageSize) return;

    let canceled = false;
    const v = sourceVideo;
    const proc = canvasRef.current;
    if (!proc) return;

    // Initialize or reset detector
    if (!detectorRef.current) detectorRef.current = new DartDetector();

    const tick = () => {
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

        frameCountRef.current++;

        // Seed ROI from calibration homography (board center + double radius along X)
        const cImg = applyHomography(H, { x: 0, y: 0 });
        const rImg = applyHomography(H, { x: BoardRadii.doubleOuter, y: 0 });
        // Scale calibration image coordinates to current video size
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
        if (
          !paused &&
          pendingDarts < 3 &&
          detectionArmedRef.current &&
          frameCountRef.current > 150
        ) {
          const det = detector.detect(frame);
          const nowPerf = performance.now();
          if (
            autoCandidateRef.current &&
            nowPerf - autoCandidateRef.current.firstTs > 900
          ) {
            autoCandidateRef.current = null;
          }
          if (det && det.confidence >= AUTO_COMMIT_CONFIDENCE) {
            const warmupActive =
              streamingStartMsRef.current > 0 &&
              nowPerf - streamingStartMsRef.current < AUTO_STREAM_IGNORE_MS;
            // Refine tip on gradients
            const tipRefined = refinePointSobel(proc, det.tip, 6);
            // Map to calibration image space before scoring
            const pCal = { x: tipRefined.x / sx, y: tipRefined.y / sy };
            const score = scoreFromImagePoint(H, pCal);
            const ring = score.ring as Ring;
            const value = score.base;
            const label = `${ring} ${value > 0 ? value : ""}`.trim();
            const sector = (score.sector ?? null) as number | null;
            const mult = Math.max(0, Number(score.mult) || 0) as 0 | 1 | 2 | 3;
            let shouldAccept = false;

            setLastAutoScore(label);
            setLastAutoValue(value);
            setLastAutoRing(ring);

            const applyAutoHit = (candidate: AutoCandidate) => {
              if (candidate.value > 0) {
                setHadRecentAuto(true);
                setPulseManualPill(true);
                try {
                  if (pulseTimeoutRef.current)
                    clearTimeout(pulseTimeoutRef.current);
                } catch {}
                pulseTimeoutRef.current = window.setTimeout(() => {
                  setPulseManualPill(false);
                  pulseTimeoutRef.current = null;
                }, 1500);
                try {
                  addDart(candidate.value, candidate.label, candidate.ring);
                } catch {}
              } else {
                setHadRecentAuto(false);
              }
              try {
                if (onAutoDart)
                  onAutoDart(candidate.value, candidate.ring, {
                    sector: candidate.sector,
                    mult: candidate.mult,
                  });
              } catch {}
            };

            if (!warmupActive) {
              if (ring === "MISS" || value <= 0) {
                autoCandidateRef.current = null;
                setHadRecentAuto(false);
                try {
                  if (onAutoDart) onAutoDart(value, ring, { sector, mult });
                } catch {}
                shouldAccept = true;
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
                  applyAutoHit(current);
                  autoCandidateRef.current = null;
                  lastAutoCommitRef.current = nowPerf;
                  shouldAccept = true;
                }
              }
            } else {
              autoCandidateRef.current = null;
              shouldAccept = true;
            }

            captureDetectionLog({
              ts: nowPerf,
              label,
              value,
              ring,
              confidence: det.confidence,
              ready: shouldAccept,
              accepted: shouldAccept && value > 0 && ring !== "MISS",
              warmup: warmupActive,
            });

            // Draw debug tip and shaft axis on overlay (scaled to overlay canvas)
            try {
              const drawOverlayHint = value > 0 && ring !== "MISS";
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
            } catch {}

            if (shouldAccept) {
              detector.accept(frame, det);
            }
          } else {
            if (
              autoCandidateRef.current &&
              nowPerf - autoCandidateRef.current.firstTs > 800
            ) {
              autoCandidateRef.current = null;
            }
          }
        }
      } catch (e) {
        // Soft-fail; continue next frame
        // console.warn('Autoscore tick error:', e)
      }
      rafRef.current = requestAnimationFrame(tick);
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

  // Update calibration audit status whenever homography or image size changes
  useEffect(() => {
    try {
      useAudit
        .getState()
        .setCalibrationStatus({ hasHomography: !!H, imageSize });
    } catch {}
  }, [H, imageSize]);

  // External autoscore subscription
  useEffect(() => {
    if (autoscoreProvider !== "external-ws" || !autoscoreWsUrl) return;
    const sub = subscribeExternalWS(autoscoreWsUrl, (d) => {
      if (
        !detectionArmedRef.current ||
        performance.now() - streamingStartMsRef.current < 5000
      )
        return;
      // Prefer parent hook if provided; otherwise add to visit directly
      if (onAutoDart) {
        try {
          onAutoDart(d.value, d.ring as any, {
            sector: d.sector ?? null,
            mult: (d.mult as any) ?? 0,
          });
        } catch {}
        try {
          addHeatSample({
            playerId:
              matchState.players[matchState.currentPlayerIdx]?.id ?? null,
            sector: d.sector ?? null,
            mult: (d.mult as any) ?? 0,
            ring: d.ring as any,
            ts: Date.now(),
          });
        } catch {}
      } else {
        const label =
          d.ring === "INNER_BULL"
            ? "INNER_BULL 50"
            : d.ring === "BULL"
              ? "BULL 25"
              : `${d.ring[0]}${d.value / (d.mult || 1) || d.value} ${d.value}`;
        addDart(d.value, label, d.ring as any);
        try {
          addHeatSample({
            playerId:
              matchState.players[matchState.currentPlayerIdx]?.id ?? null,
            sector: d.sector ?? null,
            mult: (d.mult as any) ?? 0,
            ring: d.ring as any,
            ts: Date.now(),
          });
        } catch {}
      }
    });
    return () => sub.close();
  }, [autoscoreProvider, autoscoreWsUrl]);

  function onOverlayClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!overlayRef.current || !H || !imageSize) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Map to calibration coordinate space by reversing the display scaling
    const sx = overlayRef.current.width / imageSize.w;
    const sy = overlayRef.current.height / imageSize.h;
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
        } catch {}
        setHadRecentAuto(false);
      }
    } catch {}
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

  function addDart(value: number, label: string, ring: Ring) {
    if (shouldDeferCommit && awaitingClear) {
      if (!pulseManualPill) {
        setPulseManualPill(true);
        try {
          if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
        } catch {}
        pulseTimeoutRef.current = window.setTimeout(() => {
          setPulseManualPill(false);
          pulseTimeoutRef.current = null;
        }, 1200);
      }
      return;
    }
    // In generic mode, delegate to parent without X01 bust/finish rules
    if (scoringMode === "custom") {
      if (onGenericDart)
        try {
          onGenericDart(value, ring, { label });
        } catch {}
      // Maintain a lightweight pending list for UI only
      if (pendingDarts >= 3) {
        // Rotate to next visit locally so we don't drop darts visually
        setPendingDarts(1);
        setPendingScore(value);
        setPendingEntries([{ label, value, ring }]);
        return;
      }
      const newDarts = pendingDarts + 1;
      setPendingDarts(newDarts);
      setPendingScore((s) => s + value);
      setPendingEntries((e) => [...e, { label, value, ring }]);
      return;
    }

    // If a new dart arrives while 3 are pending, auto-commit previous visit and start a new one
    if (pendingDarts >= 3) {
      const previousScore = pendingScore;
      const previousDarts = pendingDarts;
      // Commit previous full visit
      callAddVisit(previousScore, previousDarts, {
        preOpenDarts: pendingPreOpenDarts || 0,
        doubleWindowDarts: pendingDartsAtDouble || 0,
        finishedByDouble: false,
        visitTotal: previousScore,
      });
      try {
        const name = matchState.players[matchState.currentPlayerIdx]?.name;
        if (name) addSample(name, previousDarts, previousScore);
      } catch {}
      // Start next visit with this dart
      const willCount =
        !x01DoubleIn || isOpened || ring === "DOUBLE" || ring === "INNER_BULL";
      const applied = willCount ? value : 0;
      setPendingDarts(1);
      setPendingScore(applied);
      setPendingEntries([{ label, value: applied, ring }]);
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
    const newDarts = pendingDarts + 1;
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
      });
      setPendingDarts(0);
      setPendingScore(0);
      setPendingEntries([]);
      setPendingPreOpenDarts(0);
      setPendingDartsAtDouble(0);
      enqueueVisitCommit({ score: 0, darts: newDarts, finished: false });
      return;
    }

    // Normal add (value may be zero if not opened yet)
    setPendingDarts(newDarts);
    setPendingScore(newScore);
    setPendingEntries((e) => [...e, { label, value: appliedValue, ring }]);
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
      callAddVisit(newScore, newDarts, {
        preOpenDarts: pendingPreOpenDarts || 0,
        doubleWindowDarts: pendingDartsAtDouble || 0,
        finishedByDouble: true,
        visitTotal: newScore,
      });
      callEndLeg(newScore);
      setPendingDarts(0);
      setPendingScore(0);
      setPendingEntries([]);
      setPendingPreOpenDarts(0);
      setPendingDartsAtDouble(0);
      enqueueVisitCommit({ score: newScore, darts: newDarts, finished: true });
      return;
    }

    if (newDarts >= 3) {
      callAddVisit(newScore, newDarts, {
        preOpenDarts: pendingPreOpenDarts || 0,
        doubleWindowDarts: pendingDartsAtDouble || 0,
        finishedByDouble: false,
        visitTotal: newScore,
      });
      setPendingDarts(0);
      setPendingScore(0);
      setPendingEntries([]);
      setPendingPreOpenDarts(0);
      setPendingDartsAtDouble(0);
      enqueueVisitCommit({ score: newScore, darts: newDarts, finished: false });
    }
  }

  function onAddAutoDart() {
    if (shouldDeferCommit && awaitingClear) return;
    if (lastAutoScore) {
      if (onAutoDart) {
        try {
          onAutoDart(lastAutoValue, lastAutoRing, undefined);
        } catch {}
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
      } catch {}
      setPendingDarts(0);
      setPendingScore(0);
      setPendingEntries([]);
      enqueueVisitCommit({ score: 0, darts: newDarts, finished: false });
      setManualScore("");
      setHadRecentAuto(false);
      return;
    }

    setPendingDarts(newDarts);
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
      } catch {}
      setPendingDarts(0);
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
      } catch {}
      setPendingDarts(0);
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
    } catch {}
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
      } catch {}
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
    setPendingScore((s) => s - (last?.value || 0));
    setPendingEntries((e) => e.slice(0, -1));
  }

  function onCommitVisit() {
    if (pendingDarts === 0 || (shouldDeferCommit && awaitingClear)) return;
    if (scoringMode === "custom") {
      // For custom mode, simply clear local pending (parent maintains its own scoring)
      setPendingDarts(0);
      setPendingScore(0);
      setPendingEntries([]);
      return;
    }
    const visitScore = pendingScore;
    const visitDarts = pendingDarts;
    callAddVisit(visitScore, visitDarts);
    try {
      const name = matchState.players[matchState.currentPlayerIdx]?.name;
      if (name) addSample(name, visitDarts, visitScore);
    } catch {}
    setPendingDarts(0);
    setPendingScore(0);
    setPendingEntries([]);
    enqueueVisitCommit({
      score: visitScore,
      darts: visitDarts,
      finished: false,
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        <div className="card relative camera-fullwidth-card lg:col-span-2">
          <h2 className="text-xl font-semibold mb-3">Camera</h2>
          <ResizablePanel
            storageKey="ndn:camera:size"
            className="relative rounded-2xl overflow-hidden bg-black"
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
                    : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover object-center bg-black";
              const containerClass =
                aspect === "square"
                  ? "relative w-full mx-auto aspect-square bg-black"
                  : "relative w-full aspect-[4/3] bg-black";
              const renderVideoSurface = () => (
                <div className={containerClass}>
                  <video
                    ref={videoRef}
                    className={videoClass}
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
                        <div className="text-4xl">📱</div>
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
                              } catch {}
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

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              className="btn btn--ghost px-3 py-1 text-xs font-semibold"
              onClick={() => setShowDetectionLog((prev) => !prev)}
            >
              {showDetectionLog ? "Hide" : "Show"} detection log
            </button>
            <span className="text-xs text-slate-400">
              Recent detections: {detectionLog.length}
            </span>
          </div>
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
                        {entry.label.padEnd(6, " ")}
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

          {/* Small Manual pill in top-right of camera card so users in any game mode can open Manual Correction */}
          {inProgress ? (
            <div className="absolute top-3 right-3 z-30">
              {/**
               * Autoscore state styles:
               * - success: recent auto detected a valid non-miss score -> green
               * - ambiguous: recent auto detected but result is miss/zero/empty -> amber
               * - idle: default white/neutral
               */}
              {(() => {
                let stateClass = "bg-white/90 text-slate-800";
                let title = "Manual Correction (M)";
                if (hadRecentAuto) {
                  const ok =
                    !!lastAutoScore &&
                    lastAutoRing !== "MISS" &&
                    lastAutoValue > 0;
                  if (ok) {
                    stateClass = "bg-emerald-600 text-white";
                    title = `Manual Correction (M) — Autoscore: ${lastAutoScore} (confirmed)`;
                  } else {
                    stateClass = "bg-amber-400 text-black";
                    title = `Manual Correction (M) — Autoscore ambiguous: ${lastAutoScore || "—"}`;
                  }
                }
                // Larger, clearer pill text and padding
                const baseClasses =
                  "px-4 py-2 rounded-full text-base font-semibold shadow-sm hover:opacity-90";
                const okNow =
                  hadRecentAuto &&
                  !!lastAutoScore &&
                  lastAutoRing !== "MISS" &&
                  lastAutoValue > 0;
                const pulseClass =
                  pulseManualPill && okNow
                    ? "ring-4 ring-emerald-400/60 animate-ping"
                    : hadRecentAuto && !okNow
                      ? "animate-pulse"
                      : "";
                return (
                  <button
                    className={`${baseClasses} ${stateClass} ${pulseClass}`}
                    onClick={() => {
                      setActiveTab("manual");
                      setShowManualModal(true);
                    }}
                    title={title}
                  >
                    Manual
                  </button>
                );
              })()}
            </div>
          ) : null}
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
                    } catch {}
                  }}
                >
                  {cameraSession.showOverlay ? "Hide Overlay" : "Show Overlay"}
                </button>
                <button
                  className="btn bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 text-sm"
                  disabled={!phoneFeedActive}
                  onClick={() => {
                    try {
                      cameraSession.clearSession?.();
                    } catch {}
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
                    {cameraStarting ? "Connecting Camera..." : "Connect Camera"}
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
                } catch {}
              }}
            >
              Reset Camera Size
            </button>
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
            ✏️
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
                } catch {}
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
                        ? "absolute inset-0 w-full h-full object-contain object-center bg-black"
                        : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover object-center bg-black";
                      const renderVideoSurface = () => (
                        <div className="relative w-full aspect-[4/3] bg-black">
                          <video
                            ref={videoRef}
                            className={videoClass}
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
                                <div className="text-4xl">📱</div>
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
                                      } catch {}
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
                            } catch {}
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
                            } catch {}
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
                        } catch {}
                      }}
                    >
                      Reset Camera Size
                    </button>
                  </div>
                </div>
                {/* Pending Visit section */}
                <div className="bg-black/30 rounded-2xl p-4">
                  <h2 className="text-lg font-semibold mb-3">Pending Visit</h2>
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
                      disabled={pendingDarts === 0}
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
}
