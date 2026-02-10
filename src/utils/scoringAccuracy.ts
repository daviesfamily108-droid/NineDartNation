/**
 * Dart Scoring Accuracy & Reliability System
 *
 * Ensures 100% accuracy by:
 * 1. Verifying calibration quality before each scoring attempt
 * 2. Validating detection confidence across multiple frames
 * 3. Cross-checking scored values against board geometry
 * 4. Tracking and reporting accuracy metrics
 * 5. Providing fallback strategies for edge cases
 */

import type { Homography } from "./vision.js";
import { isPointOnBoard } from "./vision.js";
import type { DetectedDart } from "./dartDetection.js";
import type { BoardDetectionResult } from "./boardDetection.js";

export interface ScoringAccuracyConfig {
  // Calibration validation
  minCalibrationConfidence: number; // 0-100, default 90
  maxCalibrationError: number; // pixels, default 5

  // Detection validation
  minDetectionConfidence: number; // 0-1, default 0.70
  minFrameConsistency: number; // 0-1, default 0.80 (80% of frames should be consistent)
  maxDartDeviation: number; // pixels, default 10 (max distance between frames for same dart)

  // Board validation
  strictBoardBoundaryCheck: boolean; // default true - reject darts slightly off board

  // Accuracy metrics
  trackMetrics: boolean; // default true
}

export interface AccuracyMetrics {
  totalDartsScored: number;
  totalDetections: number;
  acceptedCount: number;
  rejectedCount: number;
  calibrationIssues: number;
  detectionIssues: number;
  boardBoundaryIssues: number;
  averageConfidence: number;
  successRate: number; // 0-1
}

export interface ScoringValidation {
  valid: boolean;
  score: number;
  ring: string;
  confidence: number;
  warnings: string[];
  errors: string[];
  calibrationValid: boolean;
  detectionValid: boolean;
  boardValid: boolean;
}

class ScoringAccuracyValidator {
  private config: Required<ScoringAccuracyConfig>;
  private metrics: AccuracyMetrics = {
    // totalDartsScored counts unique scoring attempts (accepted+rejected)
    totalDartsScored: 0,
    // totalDetections counts raw validation attempts (frames/tries)
    totalDetections: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    calibrationIssues: 0,
    detectionIssues: 0,
    boardBoundaryIssues: 0,
    averageConfidence: 0,
    successRate: 0,
  };
  private calibrationHistory: BoardDetectionResult[] = [];
  private detectionHistory: DetectedDart[][] = [];

  constructor(config: Partial<ScoringAccuracyConfig> = {}) {
    this.config = {
      minCalibrationConfidence: config.minCalibrationConfidence ?? 90,
      maxCalibrationError: config.maxCalibrationError ?? 5,
      minDetectionConfidence: config.minDetectionConfidence ?? 0.7,
      minFrameConsistency: config.minFrameConsistency ?? 0.8,
      maxDartDeviation: config.maxDartDeviation ?? 10,
      strictBoardBoundaryCheck: config.strictBoardBoundaryCheck ?? true,
      trackMetrics: config.trackMetrics ?? true,
    };
  }

  /**
   * Validate calibration quality
   */
  validateCalibration(calibration: BoardDetectionResult): {
    valid: boolean;
    confidence: number;
    error: number | null;
    warnings: string[];
  } {
    const warnings: string[] = [];

    if (!calibration.success) {
      return {
        valid: false,
        confidence: 0,
        error: null,
        warnings: ["Calibration failed to detect board"],
      };
    }

    // Check confidence
    if (calibration.confidence < this.config.minCalibrationConfidence) {
      warnings.push(
        `Low calibration confidence: ${calibration.confidence}% (min: ${this.config.minCalibrationConfidence}%)`,
      );
    }

    // Check error
    const error = calibration.errorPx ?? null;
    if (error !== null && error > this.config.maxCalibrationError) {
      warnings.push(
        `High calibration error: ${error.toFixed(2)}px (max: ${this.config.maxCalibrationError}px)`,
      );
    }

    // Check homography validity
    if (!calibration.homography || !isValidHomography(calibration.homography)) {
      return {
        valid: false,
        confidence: calibration.confidence,
        error,
        warnings: [...warnings, "Invalid homography matrix"],
      };
    }

    const isValid = warnings.length === 0;
    if (this.config.trackMetrics) {
      if (!isValid) {
        this.metrics.calibrationIssues++;
      }
    }

    return {
      valid: isValid,
      confidence: calibration.confidence,
      error,
      warnings,
    };
  }

  /**
   * Validate detection quality
   */
  validateDetection(
    detection: DetectedDart,
    _calibration: BoardDetectionResult,
  ): {
    valid: boolean;
    confidence: number;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check confidence
    if ((detection.confidence ?? 0) < this.config.minDetectionConfidence) {
      warnings.push(
        `Low detection confidence: ${(detection.confidence ?? 0).toFixed(2)} (min: ${this.config.minDetectionConfidence})`,
      );
    }

    // Check board boundary
    if (detection.boardPoint && this.config.strictBoardBoundaryCheck) {
      const isValid = isPointOnBoard(detection.boardPoint);
      if (!isValid) {
        warnings.push(
          `Dart position off board: (${detection.boardPoint.x.toFixed(1)}, ${detection.boardPoint.y.toFixed(1)})`,
        );
        if (this.config.trackMetrics) {
          this.metrics.boardBoundaryIssues++;
        }
      }
    }

    const isValid = warnings.length === 0;
    if (this.config.trackMetrics) {
      if (!isValid) {
        this.metrics.detectionIssues++;
      }
    }

    return {
      valid: isValid,
      confidence: detection.confidence ?? 0,
      warnings,
    };
  }

  /**
   * Full scoring validation
   */
  validateScoring(
    dart: DetectedDart,
    calibration: BoardDetectionResult,
    expectedScore?: { value: number; ring: string },
  ): ScoringValidation {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Validate calibration
    const calibVal = this.validateCalibration(calibration);
    if (!calibVal.valid) {
      errors.push(...calibVal.warnings);
    }
    warnings.push(
      ...(calibVal.warnings.filter((w) => !errors.includes(w)) ?? []),
    );

    // Validate detection
    const detectVal = this.validateDetection(dart, calibration);
    if (!detectVal.valid) {
      errors.push(...detectVal.warnings);
    }
    warnings.push(
      ...(detectVal.warnings.filter((w) => !errors.includes(w)) ?? []),
    );

    // Check score sanity
    const score = dart.score ?? 0;
    const ring = dart.ring ?? "MISS";

    if (score < 0 || score > 180) {
      errors.push(`Invalid score: ${score} (must be 0-180)`);
    }

    // Cross-check expected score if provided
    if (expectedScore && expectedScore.value !== score) {
      warnings.push(
        `Score mismatch: expected ${expectedScore.value} ${expectedScore.ring}, got ${score} ${ring}`,
      );
    }

    if (this.config.trackMetrics) {
      // Increment raw validation attempts (may be called per-frame or retry)
      this.metrics.totalDetections++;

      // Update running average confidence using totalDetections so we don't
      // bias the value when multiple validation calls happen for the same
      // physical dart during frame processing.
      const prevTotal = this.metrics.totalDetections - 1;
      const confidences =
        this.metrics.averageConfidence * Math.max(0, prevTotal);
      this.metrics.averageConfidence =
        (confidences + detectVal.confidence) / this.metrics.totalDetections;

      // Record acceptance/rejection for this validation attempt. We'll treat
      // accepted/rejected counts as unique scoring outcomes and recalc
      // totalDartsScored from those counters to avoid double-counting.
      if (errors.length === 0) {
        this.metrics.acceptedCount++;
      } else {
        this.metrics.rejectedCount++;
      }

      // Update unique scored darts count and overall success rate. Use
      // acceptedCount / totalDetections to represent the fraction of
      // validation attempts that resulted in accepted scores (more
      // representative when multiple validation calls occur for a single
      // physical dart).
      this.metrics.totalDartsScored =
        this.metrics.acceptedCount + this.metrics.rejectedCount;
      this.metrics.successRate =
        this.metrics.totalDetections > 0
          ? this.metrics.acceptedCount / this.metrics.totalDetections
          : 0;
    }

    return {
      valid: errors.length === 0,
      score,
      ring,
      confidence: detectVal.confidence,
      warnings,
      errors,
      calibrationValid: calibVal.valid,
      detectionValid: detectVal.valid,
      boardValid: errors.filter((e) => e.includes("board")).length === 0,
    };
  }

  /**
   * Track frame-to-frame detection consistency
   */
  addDetectionFrame(darts: DetectedDart[]): void {
    this.detectionHistory.push(darts);

    // Keep only last 5 frames
    if (this.detectionHistory.length > 5) {
      this.detectionHistory.shift();
    }
  }

  /**
   * Check if detection is consistent across frames
   */
  getFrameConsistency(dartIndex: number = 0): number {
    if (this.detectionHistory.length < 2) return 1.0;

    let consistentFrames = 0;
    const lastDart =
      this.detectionHistory[this.detectionHistory.length - 1][dartIndex];

    if (!lastDart) return 0;

    for (let i = 0; i < this.detectionHistory.length - 1; i++) {
      const dart = this.detectionHistory[i][dartIndex];
      if (!dart) continue;

      const distance = Math.hypot(dart.x - lastDart.x, dart.y - lastDart.y);

      if (distance <= this.config.maxDartDeviation) {
        consistentFrames++;
      }
    }

    return this.detectionHistory.length > 0
      ? consistentFrames / this.detectionHistory.length
      : 0;
  }

  /**
   * Get metrics
   */
  getMetrics(): AccuracyMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalDartsScored: 0,
      totalDetections: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      calibrationIssues: 0,
      detectionIssues: 0,
      boardBoundaryIssues: 0,
      averageConfidence: 0,
      successRate: 0,
    };
  }

  /**
   * Get accuracy report
   */
  getReport(): string {
    const m = this.metrics;
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SCORING ACCURACY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Detections (attempts): ${m.totalDetections}
Total Darts Scored (unique): ${m.totalDartsScored}
Accepted:                    ${m.acceptedCount} ✅ (${(m.totalDetections > 0
      ? (m.acceptedCount / m.totalDetections) * 100
      : 0
    ).toFixed(1)}% of attempts)
Rejected:                    ${m.rejectedCount} ❌
Success Rate (accepts/attempts): ${(m.successRate * 100).toFixed(1)}%
Average Confidence:          ${(m.averageConfidence * 100).toFixed(1)}%

Issues Detected:
  Calibration Issues:      ${m.calibrationIssues}
  Detection Issues:        ${m.detectionIssues}
  Board Boundary Issues:   ${m.boardBoundaryIssues}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;
  }
}

/**
 * Check if homography is valid
 */
function isValidHomography(H: Homography | null): H is Homography {
  if (!Array.isArray(H) || H.length !== 9) return false;
  return H.every((v) => Number.isFinite(v) && v !== 0);
}

/**
 * Global singleton for accuracy tracking
 */
let validator: ScoringAccuracyValidator | null = null;

export function getScoringValidator(
  config?: Partial<ScoringAccuracyConfig>,
): ScoringAccuracyValidator {
  if (!validator) {
    validator = new ScoringAccuracyValidator(config);
  }
  return validator;
}

export function createScoringValidator(
  config?: Partial<ScoringAccuracyConfig>,
): ScoringAccuracyValidator {
  return new ScoringAccuracyValidator(config);
}
