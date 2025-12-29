/**
 * Game-Mode-Specific Calibration Requirements
 *
 * Each game mode has different accuracy requirements:
 * - X01: Needs all zones (singles, doubles, trebles, bulls)
 * - Cricket: Only needs 6 numbers + bullseye
 * - Treble Practice: Only needs treble ring (strictest)
 * - Checkout modes: Need double precision
 */

export type CalibrationRequirement = {
  tolerancePx: number; // Maximum acceptable error in pixels
  requiredTargets: string[]; // Key areas needed for this game
  criticalZones: string[]; // Most important areas to focus on during calibration
  minConfidence: number; // Minimum acceptable calibration confidence (0-100)
};

export function getGlobalCalibrationConfidence(
  errorPx: number | null,
): number | null {
  if (errorPx == null || Number.isNaN(errorPx as any) || errorPx < 0) {
    return null;
  }

  let percentage: number;
  if (errorPx <= 0.25) percentage = 99.5 + (0.25 - errorPx) * 2;
  else if (errorPx <= 1.0) percentage = 98 + (1.0 - errorPx) * 2;
  else if (errorPx <= 2.0) percentage = 95 + (2.0 - errorPx) * 3;
  else if (errorPx <= 5.0) percentage = 90 + (5.0 - errorPx) * 1.66;
  else percentage = Math.max(0, 90 - (errorPx - 5) * 5);

  const clamped = Math.max(0, Math.min(100, percentage));
  return Number(clamped.toFixed(1));
}

export const GAME_CALIBRATION_REQUIREMENTS: Record<
  string,
  CalibrationRequirement
> = {
  // Free Games
  X01: {
    tolerancePx: 10,
    requiredTargets: ["SINGLE", "DOUBLE", "TREBLE", "BULL", "OUTER_BULL"],
    criticalZones: ["D20", "D1", "BULLSEYE", "T20", "SINGLE_20"],
    minConfidence: 80,
  },
  "Double Practice": {
    tolerancePx: 12,
    requiredTargets: ["DOUBLE", "BULL"],
    criticalZones: ["D20", "D1", "D6", "D17"],
    minConfidence: 75,
  },

  // Premium - Accuracy Critical
  "Treble Practice": {
    tolerancePx: 8, // Strictest requirement
    requiredTargets: ["TREBLE"],
    criticalZones: ["T20", "T1", "T5"],
    minConfidence: 85,
  },
  "Checkout 170": {
    tolerancePx: 9,
    requiredTargets: ["DOUBLE"],
    criticalZones: ["D25", "D20", "D8"],
    minConfidence: 82,
  },
  "Checkout 121": {
    tolerancePx: 9,
    requiredTargets: ["DOUBLE"],
    criticalZones: ["D20", "D5", "D1"],
    minConfidence: 82,
  },

  // Premium - Target Subset
  Cricket: {
    tolerancePx: 15,
    requiredTargets: ["20", "19", "18", "17", "16", "15", "BULL"],
    criticalZones: ["20", "15", "BULL"],
    minConfidence: 70,
  },
  "American Cricket": {
    tolerancePx: 15,
    requiredTargets: ["20", "19", "18", "17", "16", "15", "BULL"],
    criticalZones: ["20", "15", "BULL"],
    minConfidence: 70,
  },

  // Premium - All Numbers
  "Around the Clock": {
    tolerancePx: 12,
    requiredTargets: [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
    ],
    criticalZones: ["1", "20", "6", "15"],
    minConfidence: 78,
  },
  Shanghai: {
    tolerancePx: 13,
    requiredTargets: [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "SINGLE",
      "DOUBLE",
      "TREBLE",
    ],
    criticalZones: ["1", "7", "S1", "D1", "T1"],
    minConfidence: 75,
  },

  // Premium - Practice/Training
  "High Score": {
    tolerancePx: 14,
    requiredTargets: ["TREBLE", "DOUBLE", "BULL"],
    criticalZones: ["T20", "BULL", "D20"],
    minConfidence: 72,
  },
  "Low Score": {
    tolerancePx: 11,
    requiredTargets: ["SINGLE"],
    criticalZones: ["1", "2", "3"],
    minConfidence: 76,
  },
  "Count-Up": {
    tolerancePx: 13,
    requiredTargets: ["SINGLE", "DOUBLE", "TREBLE"],
    criticalZones: ["20", "DOUBLE", "TREBLE"],
    minConfidence: 74,
  },

  // Premium - Head-to-Head
  "Halve It": {
    tolerancePx: 12,
    requiredTargets: ["TREBLE", "SINGLE"],
    criticalZones: ["T20", "T5", "SINGLE"],
    minConfidence: 73,
  },
  "High-Low": {
    tolerancePx: 13,
    requiredTargets: ["SINGLE", "DOUBLE", "BULL"],
    criticalZones: ["HIGH (>10)", "LOW (<5)", "BULL"],
    minConfidence: 72,
  },
  Killer: {
    tolerancePx: 12,
    requiredTargets: ["ALL_NUMBERS"],
    criticalZones: ["RANDOM_TARGETS"],
    minConfidence: 74,
  },

  // Premium - Skill Games
  Baseball: {
    tolerancePx: 14,
    requiredTargets: ["1-9", "SINGLE", "DOUBLE", "TREBLE"],
    criticalZones: ["1", "9", "TRIPLE"],
    minConfidence: 71,
  },
  Golf: {
    tolerancePx: 14,
    requiredTargets: ["1-18", "TREBLE"],
    criticalZones: ["T1", "T18"],
    minConfidence: 71,
  },
  "Tic Tac Toe": {
    tolerancePx: 16,
    requiredTargets: ["1-9", "SINGLE"],
    criticalZones: ["CENTER", "CORNERS"],
    minConfidence: 68,
  },

  // Premium - Variation Games
  "Bob's 27": {
    tolerancePx: 13,
    requiredTargets: ["SINGLE", "DOUBLE"],
    criticalZones: ["1-20", "BULL"],
    minConfidence: 73,
  },
  Scam: {
    tolerancePx: 14,
    requiredTargets: ["ALL_NUMBERS", "OUTER_BULL"],
    criticalZones: ["TARGET_NUMBER", "OUTER_BULL"],
    minConfidence: 70,
  },
  Fives: {
    tolerancePx: 14,
    requiredTargets: ["ALL_NUMBERS", "OUTER_BULL"],
    criticalZones: ["5", "10", "15", "20"],
    minConfidence: 70,
  },
  Sevens: {
    tolerancePx: 14,
    requiredTargets: ["ALL_NUMBERS", "OUTER_BULL"],
    criticalZones: ["7", "14"],
    minConfidence: 70,
  },
};

/**
 * Evaluate calibration quality for a specific game mode
 * Returns confidence level 0-100
 */
export function getCalibrationConfidenceForGame(
  gameMode: string,
  errorPx: number | null,
): number {
  // Treat missing/unknown error as unknown confidence. IMPORTANT: don't treat 0 as falsy.
  if (errorPx == null || Number.isNaN(errorPx as any) || errorPx < 0) return 0;

  const req = GAME_CALIBRATION_REQUIREMENTS[gameMode];
  const tolerance = req?.tolerancePx ?? 12; // Default tolerance if game unknown

  // v2.6: High-precision confidence calculation
  // 0.25px error = 99.5% (User's target)
  // 1.0px error = 98%
  // 2.0px error = 95%
  // 5.0px error = 90%
  // At tolerance = 85%
  // Beyond tolerance = drops linearly to 0% at 3x tolerance

  if (errorPx <= 0.25) return 99.5 + (0.25 - errorPx) * 2; // 99.5% to 100%
  if (errorPx <= 1.0) return 98 + (1.0 - errorPx) * 2; // 98% to 99.5%
  if (errorPx <= 2.0) return 95 + (2.0 - errorPx) * 3; // 95% to 98%
  if (errorPx <= 5.0) return 90 + (5.0 - errorPx) * 1.66; // 90% to 95%

  if (errorPx <= tolerance) {
    // Linear from 90% down to 85% at tolerance
    const range = tolerance - 5;
    if (range <= 0) return 85;
    return 85 + ((tolerance - errorPx) / range) * 5;
  } else {
    // Beyond tolerance: drop linearly to 0 at 3x tolerance
    // This is much less punishing than the previous version
    const maxError = tolerance * 3;
    if (errorPx >= maxError) return 0;
    return 85 * (1 - (errorPx - tolerance) / (maxError - tolerance));
  }
}

/**
 * Check if calibration is suitable for a game
 */
export function isCalibrationSuitableForGame(
  gameMode: string,
  errorPx: number | null,
): boolean {
  // Treat missing/unknown error as not suitable. IMPORTANT: don't treat 0 as missing.
  if (errorPx == null || Number.isNaN(errorPx as any) || errorPx < 0) return false;

  const req = GAME_CALIBRATION_REQUIREMENTS[gameMode];
  if (!req) return true; // Unknown game, assume suitable

  const confidence = getCalibrationConfidenceForGame(gameMode, errorPx);
  return confidence >= req.minConfidence;
}

/**
 * Get a human-readable assessment of calibration quality
 */
export function getCalibrationQualityText(
  gameMode: string,
  errorPx: number | null,
): {
  quality: "perfect" | "excellent" | "good" | "fair" | "poor" | "none";
  text: string;
} {
  // IMPORTANT: don't treat 0 as missing.
  if (errorPx == null || Number.isNaN(errorPx as any) || errorPx < 0) {
    return { quality: "none", text: "Not calibrated" };
  }

  const confidence = getCalibrationConfidenceForGame(gameMode, errorPx);

  if (confidence >= 99.5) {
    return {
      quality: "perfect",
      text: `Perfect (${confidence.toFixed(1)}%)`,
    };
  } else if (confidence >= 90) {
    return {
      quality: "excellent",
      text: `Excellent (${Math.round(confidence)}%)`,
    };
  } else if (confidence >= 75) {
    return { quality: "good", text: `Good (${Math.round(confidence)}%)` };
  } else if (confidence >= 50) {
    return { quality: "fair", text: `Fair (${Math.round(confidence)}%)` };
  } else {
    return { quality: "poor", text: `Poor (${Math.round(confidence)}%)` };
  }
}

export type CalibrationStatus = "verified" | "unknown" | "none";

/**
 * Shared, UI-friendly calibration gate.
 *
 * Contract:
 * - verified: has a homography AND an imageSize AND (locked OR errorPx <= maxErrorPx)
 * - unknown: has a homography but is missing quality metrics (imageSize/errorPx)
 * - none: no homography
 */
export function getCalibrationStatus(params: {
  H: any | null | undefined;
  imageSize?: { w: number; h: number } | null;
  locked?: boolean | null;
  errorPx?: number | null;
  maxErrorPx?: number;
}): CalibrationStatus {
  const { H, imageSize, locked, errorPx, maxErrorPx = 12 } = params;
  if (!H) return "none";

  const hasImageSize = !!(
    imageSize &&
    typeof imageSize.w === "number" &&
    typeof imageSize.h === "number" &&
    imageSize.w > 0 &&
    imageSize.h > 0
  );
  const errorVal = typeof errorPx === "number" && !Number.isNaN(errorPx) ? errorPx : null;

  if (hasImageSize && (locked || (errorVal != null && errorVal <= maxErrorPx))) {
    return "verified";
  }
  return "unknown";
}

/**
 * Get personalized recalibration recommendation for a game
 */
export function getRecalibrationRecommendation(
  gameMode: string,
): string | null {
  const req = GAME_CALIBRATION_REQUIREMENTS[gameMode];
  if (!req || req.criticalZones.length === 0) return null;

  const zones = req.criticalZones.join(", ");
  return `Recalibrate focusing on: ${zones}`;
}

/**
 * Get all games sorted by calibration difficulty (strictest first)
 */
export function getGamesByCalibrationDifficulty(): string[] {
  return Object.entries(GAME_CALIBRATION_REQUIREMENTS)
    .sort((a, b) => a[1].tolerancePx - b[1].tolerancePx)
    .map(([name]) => name);
}
