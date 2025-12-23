/**
 * QUICK START: Using the 100% Accuracy Scoring System
 *
 * This file provides example code snippets for integrating the accuracy
 * validation system into your scoring pipeline.
 *
 * See: DART_SCORING_100_PERCENT_ACCURACY.md for detailed documentation
 *
 * Quick reference:
 * 1. Import: import { getEnhancedDartScorer } from './enhancedScoring'
 * 2. Initialize: const scorer = getEnhancedDartScorer()
 * 3. Validate: const result = scorer.scoreDart(dart, calibration)
 * 4. Use: if (result.valid) { applyDart() } else { showManual() }
 */

// Example usage patterns:

// Pattern 1: Basic validation before scoring
// ============================================================================
// import { getEnhancedDartScorer } from './enhancedScoring';
//
// const scorer = getEnhancedDartScorer({
//   minDetectionConfidence: 0.70,
//   enableMetrics: true
// });
//
// // In your dart handler:
// const result = scorer.scoreDart(detectedDart, calibration);
// if (result.valid) {
//   addDartToGame(result.score, result.ring);
// } else {
//   showManualScoringFallback();
// }

// Pattern 2: Monitoring accuracy over time
// ============================================================================
// const scorer = getEnhancedDartScorer();
// const metrics = scorer.getMetrics();
// console.log(scorer.getAccuracyReport());
//
// // Check if recalibration needed
// if (scorer.needsRecalibration()) {
//   triggerRecalibration();
// }

// Pattern 3: Running comprehensive accuracy tests
// ============================================================================
// import { getScoringTester } from './scoringTester';
//
// const tester = getScoringTester();
// const report = tester.runAllTests(calibration, detectedDarts);
// console.log(DartScoringAccuracyTester.formatReport(report));
//
// if (report.overallAccuracy === 100) {
//   console.log('✅ Ready for production');
// }

// Pattern 4: Direct validation of any scoring attempt
// ============================================================================
// import { getScoringValidator } from './scoringAccuracy';
//
// const validator = getScoringValidator({
//   minCalibrationConfidence: 90,
//   strictBoardBoundaryCheck: true
// });
//
// const validation = validator.validateScoring(dart, calibration);
// if (!validation.valid) {
//   console.warn('Scoring failed:', validation.errors);
// }

// ============================================================================
// Configuration Presets
// ============================================================================

// Strict: Maximum accuracy, may miss some darts
// Use when: Accuracy is critical, don't care about speed
export const STRICT_CONFIG = {
  minDetectionConfidence: 0.85,
  minCalibrationConfidence: 95,
  maxCalibrationError: 2,
  minFrameConsistency: 0.95,
  maxConsecutiveFails: 2,
  logToConsole: true,
};

// Balanced: Recommended for most use cases
// Use when: Want both accuracy and reliability
export const BALANCED_CONFIG = {
  minDetectionConfidence: 0.7,
  minCalibrationConfidence: 90,
  maxCalibrationError: 5,
  minFrameConsistency: 0.8,
  maxConsecutiveFails: 3,
  recalibrateInterval: 30000,
  logToConsole: true,
};

// Relaxed: Catch more darts, may have false positives
// Use when: Better to score than miss, can manually correct
export const RELAXED_CONFIG = {
  minDetectionConfidence: 0.6,
  minCalibrationConfidence: 80,
  maxCalibrationError: 8,
  minFrameConsistency: 0.7,
  maxConsecutiveFails: 5,
  logToConsole: false,
};

// ============================================================================
// See full documentation:
// File: DART_SCORING_100_PERCENT_ACCURACY.md
// ==========================================================================
