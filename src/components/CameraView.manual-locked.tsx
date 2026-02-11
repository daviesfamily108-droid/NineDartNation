/**
 * CameraView Manual-Only with Simplified Camera Locking
 *
 * This is a simplified version of CameraView for strict manual-only mode:
 * - No complex calibration/homography mapping
 * - Only camera view alignment and locking (scale, aspect, fit mode)
 * - Works across offline/online/tournament play
 * - Lock persists for the entire session
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { MutableRefObject } from "react";
import { dlog } from "../utils/logger.js";
import { ensureVideoPlays } from "../utils/ensureVideoPlays.js";
import { useUserSettings } from "../store/userSettings.js";
import { useCalibration } from "../store/calibration.js";
import { useMatch } from "../store/match.js";
import { useMatchControl } from "../store/matchControl.js";
import { useCameraSession } from "../store/cameraSession.js";
import { usePendingVisit } from "../store/pendingVisit.js";
import ResizablePanel from "./ui/ResizablePanel.js";
import FocusLock from "react-focus-lock";
import PauseQuitModal from "./ui/PauseQuitModal.js";
import PauseTimerBadge from "./ui/PauseTimerBadge.js";
import PauseOverlay from "./ui/PauseOverlay.js";
import { writeMatchSnapshot } from "../utils/matchSync.js";
import { broadcastMessage } from "../utils/broadcast.js";
import { sayScore } from "../utils/checkout.js";

type Ring = "MISS" | "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL";

export type CameraViewHandle = {
  runDetectionTick?: () => void;
  __test_addDart?: (
    value: number,
    label: string,
    ring: Ring,
    meta?: any,
  ) => void;
  __test_commitVisit?: () => void;
};

export default forwardRef(function CameraViewManualLocked(
  {
    onVisitCommitted,
    showToolbar = true,
    onAddVisit,
    onEndLeg,
    cameraAutoCommit: _cameraAutoCommit = "camera",
    forceAutoStart = false,
  }: {
    onVisitCommitted?: (
      score: number,
      darts: number,
      finished: boolean,
      meta?: any,
    ) => void;
    showToolbar?: boolean;
    onAddVisit?: (score: number, darts: number, meta?: any) => void;
    onEndLeg?: (score?: number) => void;
    cameraAutoCommit?: "camera" | "parent" | "both";
    forceAutoStart?: boolean;
  },
  ref: any,
) {
  const videoRef = useRef<HTMLVideoElement>(
    null,
  ) as MutableRefObject<HTMLVideoElement | null>;

  // Simple user settings for camera display
  const cameraAspect = useUserSettings((s: any) => s.cameraAspect);
  const cameraFitMode = useUserSettings((s: any) => s.cameraFitMode);
  const cameraScale = useUserSettings((s: any) => s.cameraScale);
  const cameraEnabled = useUserSettings((s: any) => s.cameraEnabled);
  const preferredCameraId = useUserSettings((s: any) => s.preferredCameraId);
  const preferredCameraLabel = useUserSettings(
    (s: any) => s.preferredCameraLabel,
  );
  const callerEnabled = useUserSettings((s: any) => s.callerEnabled);
  const speakCheckoutOnly = useUserSettings((s: any) => s.speakCheckoutOnly);
  const callerVoice = useUserSettings((s: any) => s.callerVoice);
  const callerVolume = useUserSettings((s: any) => s.callerVolume);
  const dartTimerEnabled = useUserSettings((s: any) => s.dartTimerEnabled);
  const dartTimerSeconds =
    useUserSettings((s: any) => s.dartTimerSeconds) || 10;

  // Actions
  const setCameraEnabled = useUserSettings.getState().setCameraEnabled;
  const setCameraScale = useUserSettings.getState().setCameraScale;
  const setCameraAspect = useUserSettings.getState().setCameraAspect;
  const setCameraFitMode = useUserSettings.getState().setCameraFitMode;

  // Simplified calibration: only camera view locking
  const {
    locked,
    lockedScale,
    lockedAspect,
    lockedFitMode,
    lockCameraView,
    unlockCameraView,
  } = useCalibration();

  const [streaming, setStreaming] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const cameraSession = useCameraSession();
  const matchState = useMatch((s: any) => s);
  const paused = useMatchControl((s: any) => s.paused);
  const inProgress = (matchState as any)?.inProgress;

  // Simple pending visit tracking
  const [pendingDarts, setPendingDarts] = useState(0);
  const [pendingScore, setPendingScore] = useState(0);
  const [pendingEntries, setPendingEntries] = useState<
    Array<{ label: string; value: number; ring: Ring }>
  >([]);
  const [showQuitPause, setShowQuitPause] = useState(false);
  const localPlayerName = useUserSettings((s: any) => s.user?.username);
  const [dartTimeLeft, setDartTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const setVisit = usePendingVisit((s: any) => s.setVisit);

  // Sync pending visit to global store
  useEffect(() => {
    try {
      setVisit(pendingEntries as any, pendingDarts, pendingScore);
    } catch (e) {}
  }, [pendingEntries, pendingDarts, pendingScore, setVisit]);

  // Dart timer management
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current as any);
      timerRef.current = null;
    }

    const shouldRun =
      !!dartTimerEnabled && inProgress && !paused && pendingDarts < 3;
    if (!shouldRun) {
      setDartTimeLeft(null);
      return;
    }

    setDartTimeLeft(dartTimerSeconds);
    timerRef.current = window.setInterval(() => {
      setDartTimeLeft((prev) => {
        const next = (prev ?? dartTimerSeconds) - 1;
        if (next <= 0) {
          // Time expired: auto-fill remaining darts as MISS
          const remaining = Math.max(0, 3 - pendingDarts);
          for (let i = 0; i < remaining; i++) {
            addDart(0, "MISS 0", "MISS");
          }
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
  }, [dartTimerEnabled, dartTimerSeconds, pendingDarts, inProgress, paused]);

  // Match state helpers
  const currentPlayerId = matchState.players[matchState.currentPlayerIdx]?.id;
  const addVisit = useMatch((s: any) => s.addVisit);
  const endLeg = useMatch((s: any) => s.endLeg);

  const getCurrentRemaining = useCallback((): number => {
    const s = matchState;
    if (!s.players.length) return s.startingScore;
    const p = s.players[s.currentPlayerIdx];
    const leg = p.legs[p.legs.length - 1];
    if (!leg) return s.startingScore;
    return leg.totalScoreRemaining;
  }, [matchState]);

  const sayVisitTotal = useCallback(
    (visitTotal: number) => {
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
    },
    [
      callerEnabled,
      matchState,
      getCurrentRemaining,
      callerVoice,
      callerVolume,
      speakCheckoutOnly,
    ],
  );

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

  const addDart = useCallback(
    (value: number, label: string, ring: Ring, meta?: any) => {
      if (pendingDarts >= 3) {
        // Auto-commit previous visit and start new one
        const previousScore = pendingScore;
        const previousDarts = pendingDarts;
        try {
          callAddVisit(previousScore, previousDarts, {
            visitTotal: previousScore,
          });
        } catch (e) {}
        // Start new visit
        setPendingDarts(1);
        setPendingScore(value);
        setPendingEntries([{ label, value, ring }]);
        playBell();
        return;
      }

      const newDarts = pendingDarts + 1;
      const newScore = pendingScore + value;
      const remaining = getCurrentRemaining();
      const after = remaining - newScore;

      // Bust check (simple: negative or 1, or 0 without double)
      const isFinish =
        after === 0 && (ring === "DOUBLE" || ring === "INNER_BULL");
      const isBust = after < 0 || after === 1 || (after === 0 && !isFinish);

      if (isBust) {
        callAddVisit(0, newDarts);
        sayVisitTotal(0);
        setPendingDarts(0);
        setPendingScore(0);
        setPendingEntries([]);
        return;
      }

      setPendingDarts(newDarts);
      setPendingScore(newScore);
      setPendingEntries((e) => [...e, { label, value, ring }]);
      playBell();

      if (isFinish) {
        callAddVisit(newScore, newDarts);
        try {
          endLeg(newScore);
        } catch (e) {}
        setPendingDarts(0);
        setPendingScore(0);
        setPendingEntries([]);
        return;
      }

      if (newDarts >= 3) {
        callAddVisit(newScore, newDarts);
        sayVisitTotal(newScore);
        setPendingDarts(0);
        setPendingScore(0);
        setPendingEntries([]);
      }
    },
    [pendingDarts, pendingScore, getCurrentRemaining, playBell, sayVisitTotal],
  );

  const callAddVisit = useCallback(
    (score: number, darts: number, meta?: any) => {
      if (onAddVisit) {
        onAddVisit(score, darts, meta);
      } else {
        addVisit(score, darts, meta);
      }
    },
    [onAddVisit, addVisit],
  );

  // Camera controls
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

  // Lock camera view settings
  const lockCameraForSession = useCallback(() => {
    try {
      lockCameraView(
        cameraScale ?? 1,
        (cameraAspect as "wide" | "square") || "wide",
        (cameraFitMode as "fit" | "fill") || "fit",
        preferredCameraId || null,
      );
      alert(
        "Camera view locked! This alignment will persist throughout offline/online/tournament play.",
      );
    } catch (e) {
      console.error("Failed to lock camera:", e);
    }
  }, [
    cameraScale,
    cameraAspect,
    cameraFitMode,
    preferredCameraId,
    lockCameraView,
  ]);

  // Restore locked settings
  useEffect(() => {
    if (locked && lockedScale && lockedAspect && lockedFitMode) {
      if (setCameraScale) setCameraScale(lockedScale);
      if (setCameraAspect) setCameraAspect(lockedAspect);
      if (setCameraFitMode) setCameraFitMode(lockedFitMode);
    }
  }, [
    locked,
    lockedScale,
    lockedAspect,
    lockedFitMode,
    setCameraScale,
    setCameraAspect,
    setCameraFitMode,
  ]);

  // Camera startup
  async function startCamera() {
    const hasStream =
      !!cameraSession.getMediaStream?.() || !!videoRef.current?.srcObject;
    if (streaming || cameraStarting || hasStream) return;

    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: preferredCameraId
            ? { exact: preferredCameraId }
            : "environment",
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await ensureVideoPlays({
          video: videoRef.current,
          stream,
        });
        cameraSession.setMediaStream?.(stream);
        cameraSession.setStreaming?.(true);
      }
      setStreaming(true);
    } catch (e) {
      console.error("Camera start failed:", e);
    } finally {
      setCameraStarting(false);
    }
  }

  function stopCamera() {
    const stream = cameraSession.getMediaStream?.() as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  }

  // Auto-start camera
  useLayoutEffect(() => {
    if (forceAutoStart && cameraEnabled) {
      void startCamera();
    }
  }, [forceAutoStart, cameraEnabled]);

  useImperativeHandle(ref, () => ({
    runDetectionTick: () => {},
    __test_addDart: (v: number, l: string, r: Ring, meta?: any) => {
      try {
        addDart(v, l, r, meta);
      } catch (e) {}
    },
    __test_commitVisit: () => {
      try {
        if (pendingDarts > 0) {
          callAddVisit(pendingScore, pendingDarts);
          setPendingDarts(0);
          setPendingScore(0);
          setPendingEntries([]);
        }
      } catch (e) {}
    },
  }));

  // Video styling
  const videoScale = locked && lockedScale ? lockedScale : (cameraScale ?? 1);
  const aspect = locked && lockedAspect ? lockedAspect : cameraAspect || "wide";
  const fitMode =
    locked && lockedFitMode
      ? lockedFitMode
      : (cameraFitMode || "fit") === "fit"
        ? "fit"
        : "fill";

  const videoClass =
    aspect === "square"
      ? "absolute left-0 top-1/2 -translate-y-1/2 min-w-full min-h-full object-cover object-left bg-black"
      : fitMode === "fit"
        ? "absolute inset-0 w-full h-full object-contain object-center bg-black"
        : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover object-center bg-black";

  const videoStyle = {
    transform: `scale(${videoScale})`,
    transformOrigin: "center center" as const,
    filter: "saturate(1.25) contrast(1.12) brightness(1.04)",
    imageRendering: "crisp-edges" as const,
  };

  const containerClass =
    aspect === "square"
      ? "relative w-full mx-auto aspect-square bg-black"
      : "relative w-full aspect-[4/3] bg-black";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full min-w-0">
      {showToolbar && (
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold">Manual Scoring Mode</span>
            {locked && (
              <span className="text-xs bg-emerald-500/20 text-emerald-200 px-2 py-1 rounded">
                ?? Camera Locked
              </span>
            )}
          </div>
        </div>
      )}

      <div className="card lg:col-span-2">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Camera Setup</h2>

          <ResizablePanel
            storageKey="ndn:camera-manual:size"
            className="relative rounded-2xl overflow-hidden bg-black"
            defaultWidth={480}
            defaultHeight={360}
            minWidth={360}
            minHeight={270}
            maxWidth={800}
            maxHeight={600}
            autoFill
          >
            <div className={containerClass}>
              <video
                ref={videoRef}
                className={videoClass}
                style={videoStyle}
                playsInline
                muted
                autoPlay
              />
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                {[0, 1, 2].map((i) => {
                  const e = pendingEntries[i];
                  const isHit = !!e && e.value > 0;
                  const color = !e
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
            </div>
          </ResizablePanel>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              Zoom
            </span>
            <button
              className="btn btn--ghost px-2 py-1"
              onClick={() => adjustCameraScale(-0.05)}
            >
              −
            </button>
            <span className="w-12 text-center font-semibold">
              {Math.round(videoScale * 100)}%
            </span>
            <button
              className="btn btn--ghost px-2 py-1"
              onClick={() => adjustCameraScale(0.05)}
            >
              +
            </button>
            <button
              className={`btn px-2 py-1 text-xs ${fitMode === "fill" ? "bg-emerald-500" : ""}`}
              onClick={setFullPreview}
            >
              Full
            </button>
            <button
              className={`btn px-2 py-1 text-xs ${fitMode === "fit" ? "bg-slate-500" : ""}`}
              onClick={setWidePreview}
            >
              Wide
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {!streaming ? (
              <button
                className="btn bg-blue-600 hover:bg-blue-700"
                onClick={startCamera}
                disabled={cameraStarting}
              >
                {cameraStarting ? "Connecting..." : "Start Camera"}
              </button>
            ) : (
              <button
                className="btn bg-rose-600 hover:bg-rose-700"
                onClick={stopCamera}
              >
                Stop Camera
              </button>
            )}
            <button
              className="btn bg-purple-600 hover:bg-purple-700"
              onClick={lockCameraForSession}
              disabled={!streaming}
              title="Lock current camera alignment for entire session"
            >
              {locked ? "?? Locked" : "Lock View"}
            </button>
            {locked && (
              <button
                className="btn bg-slate-600 hover:bg-slate-700"
                onClick={unlockCameraView}
              >
                Unlock
              </button>
            )}
          </div>

          {inProgress && (
            <>
              <PauseTimerBadge compact />
              <button
                className="btn bg-rose-600 hover:bg-rose-700"
                onClick={() => setShowQuitPause(true)}
              >
                Quit / Pause
              </button>
              {showQuitPause && (
                <PauseQuitModal
                  onClose={() => setShowQuitPause(false)}
                  onQuit={() => {
                    try {
                      window.dispatchEvent(new CustomEvent("ndn:match-quit"));
                      broadcastMessage({ type: "quit" });
                    } catch (e) {}
                    setShowQuitPause(false);
                  }}
                  onPause={(minutes: number) => {
                    const endsAt = Date.now() + minutes * 60 * 1000;
                    try {
                      useMatchControl
                        .getState()
                        .setPaused(true, endsAt, localPlayerName || null);
                      broadcastMessage({
                        type: "pause",
                        pauseEndsAt: endsAt,
                        pauseStartedAt: Date.now(),
                        pauseInitiator: localPlayerName || null,
                      });
                    } catch (e) {}
                    setShowQuitPause(false);
                  }}
                />
              )}
            </>
          )}
          <PauseOverlay
            localPlayerName={localPlayerName}
            onResume={() => {
              useMatchControl.getState().setPaused(false, null);
              try {
                broadcastMessage({ type: "unpause" });
              } catch {}
            }}
          />
        </div>
      </div>

      {/* Pending Visit Panel */}
      <div className="card">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Pending Visit</h2>

          <div className="flex items-center gap-4">
            <div className="font-semibold">Darts: {pendingDarts}/3</div>
            <div className="font-semibold">Total: {pendingScore}</div>
          </div>

          <ul className="text-sm list-disc pl-5">
            {pendingEntries.length === 0 ? (
              <li className="opacity-60">No darts yet</li>
            ) : (
              pendingEntries.map((e, i) => <li key={i}>{e.label}</li>)
            )}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (pendingDarts > 0) {
                  callAddVisit(pendingScore, pendingDarts);
                  setPendingDarts(0);
                  setPendingScore(0);
                  setPendingEntries([]);
                }
              }}
              disabled={pendingDarts === 0}
            >
              Commit Visit
            </button>
            <button
              className="btn bg-slate-600 hover:bg-slate-700"
              onClick={() => {
                setPendingDarts(0);
                setPendingScore(0);
                setPendingEntries([]);
              }}
              disabled={pendingDarts === 0}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
