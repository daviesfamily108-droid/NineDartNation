/**
 * Camera-based Auto-Scoring Integration
 *
 * Integrates dart detection with perfect calibration for automatic scoring
 * Manages detection pipeline, confidence filtering, and scoring
 */

import type { Homography, Point } from "./vision";
import {
  detectDarts,
  scoreDarts,
  type DetectedDart,
  type DartDetectionResult,
} from "./dartDetection";
import type { BoardDetectionResult } from "./boardDetection";

export interface AutoScoringConfig {
  enabled: boolean;
  minDartConfidence: number; // 0-1, default 0.7
  minOverallConfidence: number; // 0-1, default 0.8
  maxDartsPerFrame: number; // default 3
  requireStableDetection: number; // frames, default 2
  autoCommit: boolean; // auto-commit scored darts, default false
}

export interface ScoredDart extends DetectedDart {
  stable: boolean; // detected in N consecutive frames
  framesSeen: number;
  timestamp?: number;
}

export class CameraAutoScorer {
  private config: Required<AutoScoringConfig>;
  private detectionHistory: Map<string, ScoredDart> = new Map();
  private calibration: BoardDetectionResult | null = null;

  constructor(config: Partial<AutoScoringConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      minDartConfidence: config.minDartConfidence ?? 0.7,
      minOverallConfidence: config.minOverallConfidence ?? 0.8,
      maxDartsPerFrame: config.maxDartsPerFrame ?? 3,
      requireStableDetection: config.requireStableDetection ?? 2,
      autoCommit: config.autoCommit ?? false,
    };
  }

  /**
   * Set calibration from perfect board detection
   */
  setCalibration(result: BoardDetectionResult) {
    this.calibration = result;
    console.log(
      `[CameraAutoScorer] Calibration set: confidence=${result.confidence}%, error=${result.errorPx}px`,
    );
  }

  /**
   * Process frame: detect darts and track stability
   */
  processFrame(canvas: HTMLCanvasElement): {
    darts: ScoredDart[];
    stableDarts: ScoredDart[];
    confidence: number;
  } {
    if (!this.config.enabled || !this.calibration?.homography) {
      return { darts: [], stableDarts: [], confidence: 0 };
    }

    const now = Date.now();

    // 1. Detect red darts in image
    const detection = detectDarts(canvas, {
      minConfidence: this.config.minDartConfidence,
      maxDarts: this.config.maxDartsPerFrame,
    });

    console.log(
      `[CameraAutoScorer] Frame quality: ${detection.frameQuality.toFixed(2)}, darts: ${detection.darts.length}`,
    );

    if (detection.darts.length === 0) {
      return { darts: [], stableDarts: [], confidence: 0 };
    }

    // 2. Apply homography and score
    const scored = scoreDarts(
      detection.darts,
      // scoreDarts expects a board->image homography
      this.calibration.homography as any,
      this.calibration.theta,
    );

    // 3. Match to history and update tracking
    const currentDarts: ScoredDart[] = [];
    for (const dart of scored) {
      const key = `${Math.round(dart.boardPoint?.x ?? 0)}_${Math.round(
        dart.boardPoint?.y ?? 0,
      )}`;

      let tracked = this.detectionHistory.get(key);
      if (!tracked) {
        // New dart
        tracked = {
          ...dart,
          stable: false,
          framesSeen: 1,
          timestamp: now,
        };
      } else {
        // Update existing
        tracked.framesSeen++;
        tracked.stable =
          tracked.framesSeen >= this.config.requireStableDetection;
        tracked.confidence = Math.max(tracked.confidence, dart.confidence);
        tracked.timestamp = now;
      }

      this.detectionHistory.set(key, tracked);
      currentDarts.push(tracked);
    }

    // 4. Clean up old detections
    const cutoff = now - 1000; // 1 second window
    for (const [key, dart] of this.detectionHistory.entries()) {
      if (dart.timestamp && dart.timestamp < cutoff) {
        this.detectionHistory.delete(key);
      }
    }

    // 5. Filter stable darts
    const stableDarts = currentDarts.filter((d) => d.stable);

    return {
      darts: currentDarts,
      stableDarts,
      confidence: detection.confidence,
    };
  }

  /**
   * Get darts ready for scoring
   */
  getReadyDarts(): ScoredDart[] {
    return Array.from(this.detectionHistory.values()).filter(
      (d) =>
        d.stable &&
        d.confidence >= this.config.minDartConfidence &&
        d.score !== undefined,
    );
  }

  /**
   * Clear tracking (when user throws new dart or match resets)
   */
  resetTracking() {
    this.detectionHistory.clear();
  }
}

/**
 * Integration helper: continuous frame processing
 */
export function createAutoScoringPipeline(
  videoElement: HTMLVideoElement,
  config: Partial<AutoScoringConfig> = {},
): {
  scorer: CameraAutoScorer;
  start: () => void;
  stop: () => void;
  getDarts: () => ScoredDart[];
} {
  const scorer = new CameraAutoScorer(config);
  let frameId: number | null = null;

  function processFrame() {
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoElement, 0, 0);
      const result = scorer.processFrame(canvas);
      console.log(`[Pipeline] Stable darts: ${result.stableDarts.length}`);
    }

    frameId = requestAnimationFrame(processFrame);
  }

  return {
    scorer,
    start: () => {
      if (!frameId) frameId = requestAnimationFrame(processFrame);
    },
    stop: () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
    getDarts: () => scorer.getReadyDarts(),
  };
}

export default { CameraAutoScorer, createAutoScoringPipeline };
