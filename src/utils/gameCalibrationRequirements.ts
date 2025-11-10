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
  tolerancePx: number // Maximum acceptable error in pixels
  requiredTargets: string[] // Key areas needed for this game
  criticalZones: string[] // Most important areas to focus on during calibration
  minConfidence: number // Minimum acceptable calibration confidence (0-100)
}

export const GAME_CALIBRATION_REQUIREMENTS: Record<string, CalibrationRequirement> = {
  // Free Games
  'X01': {
    tolerancePx: 10,
    requiredTargets: ['SINGLE', 'DOUBLE', 'TREBLE', 'BULL', 'OUTER_BULL'],
    criticalZones: ['D20', 'D1', 'BULLSEYE', 'T20', 'SINGLE_20'],
    minConfidence: 80
  },
  'Double Practice': {
    tolerancePx: 12,
    requiredTargets: ['DOUBLE', 'BULL'],
    criticalZones: ['D20', 'D1', 'D6', 'D17'],
    minConfidence: 75
  },

  // Premium - Accuracy Critical
  'Treble Practice': {
    tolerancePx: 8, // Strictest requirement
    requiredTargets: ['TREBLE'],
    criticalZones: ['T20', 'T1', 'T5'],
    minConfidence: 85
  },
  'Checkout 170': {
    tolerancePx: 9,
    requiredTargets: ['DOUBLE'],
    criticalZones: ['D25', 'D20', 'D8'],
    minConfidence: 82
  },
  'Checkout 121': {
    tolerancePx: 9,
    requiredTargets: ['DOUBLE'],
    criticalZones: ['D20', 'D5', 'D1'],
    minConfidence: 82
  },

  // Premium - Target Subset
  'Cricket': {
    tolerancePx: 15,
    requiredTargets: ['20', '19', '18', '17', '16', '15', 'BULL'],
    criticalZones: ['20', '15', 'BULL'],
    minConfidence: 70
  },
  'American Cricket': {
    tolerancePx: 15,
    requiredTargets: ['20', '19', '18', '17', '16', '15', 'BULL'],
    criticalZones: ['20', '15', 'BULL'],
    minConfidence: 70
  },

  // Premium - All Numbers
  'Around the Clock': {
    tolerancePx: 12,
    requiredTargets: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 
                      '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
    criticalZones: ['1', '20', '6', '15'],
    minConfidence: 78
  },
  'Shanghai': {
    tolerancePx: 13,
    requiredTargets: ['1', '2', '3', '4', '5', '6', '7', 'SINGLE', 'DOUBLE', 'TREBLE'],
    criticalZones: ['1', '7', 'S1', 'D1', 'T1'],
    minConfidence: 75
  },

  // Premium - Practice/Training
  'High Score': {
    tolerancePx: 14,
    requiredTargets: ['TREBLE', 'DOUBLE', 'BULL'],
    criticalZones: ['T20', 'BULL', 'D20'],
    minConfidence: 72
  },
  'Low Score': {
    tolerancePx: 11,
    requiredTargets: ['SINGLE'],
    criticalZones: ['1', '2', '3'],
    minConfidence: 76
  },
  'Count-Up': {
    tolerancePx: 13,
    requiredTargets: ['SINGLE', 'DOUBLE', 'TREBLE'],
    criticalZones: ['20', 'DOUBLE', 'TREBLE'],
    minConfidence: 74
  },

  // Premium - Head-to-Head
  'Halve It': {
    tolerancePx: 12,
    requiredTargets: ['TREBLE', 'SINGLE'],
    criticalZones: ['T20', 'T5', 'SINGLE'],
    minConfidence: 73
  },
  'High-Low': {
    tolerancePx: 13,
    requiredTargets: ['SINGLE', 'DOUBLE', 'BULL'],
    criticalZones: ['HIGH (>10)', 'LOW (<5)', 'BULL'],
    minConfidence: 72
  },
  'Killer': {
    tolerancePx: 12,
    requiredTargets: ['ALL_NUMBERS'],
    criticalZones: ['RANDOM_TARGETS'],
    minConfidence: 74
  },

  // Premium - Skill Games
  'Baseball': {
    tolerancePx: 14,
    requiredTargets: ['1-9', 'SINGLE', 'DOUBLE', 'TREBLE'],
    criticalZones: ['1', '9', 'TRIPLE'],
    minConfidence: 71
  },
  'Golf': {
    tolerancePx: 14,
    requiredTargets: ['1-18', 'TREBLE'],
    criticalZones: ['T1', 'T18'],
    minConfidence: 71
  },
  'Tic Tac Toe': {
    tolerancePx: 16,
    requiredTargets: ['1-9', 'SINGLE'],
    criticalZones: ['CENTER', 'CORNERS'],
    minConfidence: 68
  },

  // Premium - Variation Games
  "Bob's 27": {
    tolerancePx: 13,
    requiredTargets: ['SINGLE', 'DOUBLE'],
    criticalZones: ['1-20', 'BULL'],
    minConfidence: 73
  },
  'Scam': {
    tolerancePx: 14,
    requiredTargets: ['ALL_NUMBERS', 'OUTER_BULL'],
    criticalZones: ['TARGET_NUMBER', 'OUTER_BULL'],
    minConfidence: 70
  },
  'Fives': {
    tolerancePx: 14,
    requiredTargets: ['ALL_NUMBERS', 'OUTER_BULL'],
    criticalZones: ['5', '10', '15', '20'],
    minConfidence: 70
  },
  'Sevens': {
    tolerancePx: 14,
    requiredTargets: ['ALL_NUMBERS', 'OUTER_BULL'],
    criticalZones: ['7', '14'],
    minConfidence: 70
  },
}

/**
 * Evaluate calibration quality for a specific game mode
 * Returns confidence level 0-100
 */
export function getCalibrationConfidenceForGame(
  gameMode: string,
  errorPx: number | null
): number {
  if (!errorPx || errorPx < 0) return 0

  const req = GAME_CALIBRATION_REQUIREMENTS[gameMode]
  if (!req) return 50 // Unknown game, neutral confidence

  // Confidence drops as error increases beyond tolerance
  if (errorPx <= req.tolerancePx) {
    // Excellent calibration
    return Math.min(100, 100 - (errorPx / req.tolerancePx) * 20)
  } else {
    // Poor calibration - drops steeply
    const excess = errorPx - req.tolerancePx
    return Math.max(0, 50 - excess * 2)
  }
}

/**
 * Check if calibration is suitable for a game
 */
export function isCalibrationSuitableForGame(
  gameMode: string,
  errorPx: number | null
): boolean {
  if (!errorPx) return false

  const req = GAME_CALIBRATION_REQUIREMENTS[gameMode]
  if (!req) return true // Unknown game, assume suitable

  const confidence = getCalibrationConfidenceForGame(gameMode, errorPx)
  return confidence >= req.minConfidence
}

/**
 * Get a human-readable assessment of calibration quality
 */
export function getCalibrationQualityText(
  gameMode: string,
  errorPx: number | null
): { quality: 'excellent' | 'good' | 'fair' | 'poor' | 'none'; text: string } {
  if (!errorPx) {
    return { quality: 'none', text: 'Not calibrated' }
  }

  const confidence = getCalibrationConfidenceForGame(gameMode, errorPx)

  if (confidence >= 90) {
    return { quality: 'excellent', text: `Excellent (${Math.round(confidence)}%)` }
  } else if (confidence >= 75) {
    return { quality: 'good', text: `Good (${Math.round(confidence)}%)` }
  } else if (confidence >= 50) {
    return { quality: 'fair', text: `Fair (${Math.round(confidence)}%)` }
  } else {
    return { quality: 'poor', text: `Poor (${Math.round(confidence)}%)` }
  }
}

/**
 * Get personalized recalibration recommendation for a game
 */
export function getRecalibrationRecommendation(gameMode: string): string | null {
  const req = GAME_CALIBRATION_REQUIREMENTS[gameMode]
  if (!req || req.criticalZones.length === 0) return null

  const zones = req.criticalZones.join(', ')
  return `Recalibrate focusing on: ${zones}`
}

/**
 * Get all games sorted by calibration difficulty (strictest first)
 */
export function getGamesByCalibrationDifficulty(): string[] {
  return Object.entries(GAME_CALIBRATION_REQUIREMENTS)
    .sort((a, b) => a[1].tolerancePx - b[1].tolerancePx)
    .map(([name]) => name)
}
