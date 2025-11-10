# Calibration & Game Mode Alignment Analysis

## Current State

### Calibration System Overview
- **Location**: `src/store/calibration.ts`
- **Type**: Global, single calibration matrix (Homography H)
- **Persistence**: LocalStorage (`ndn-calibration-v1`)
- **Properties**:
  - `H`: Homography matrix (board→image transformation)
  - `errorPx`: Calibration error in pixels
  - `imageSize`: Capture dimensions
  - `createdAt`: Timestamp
  - `locked`: Prevents accidental reset

### Game Modes (22 Total)

**Free Games (2)**:
1. X01 (501, 301, 101)
2. Double Practice

**Premium Games (20)**:
- Around the Clock
- Cricket
- Halve It
- Shanghai
- High-Low
- Killer
- Bob's 27
- Count-Up
- High Score
- Low Score
- Checkout 170
- Checkout 121
- Treble Practice
- Baseball
- Golf
- Tic Tac Toe
- American Cricket
- Scam
- Fives
- Sevens

### Current Calibration Issues

#### Issue 1: Single Global Calibration
**Problem**: All games use the same calibration matrix regardless of game-specific needs
- **X01**: Needs accuracy across entire board (single, double, treble)
- **Cricket**: Only needs 6 targets (20, 19, 18, 17, 16, 15, bullseye)
- **Treble Practice**: Only needs treble ring accuracy
- **Around the Clock**: Needs all 20 numbers
- **Checkout**: Needs high double precision

**Current Behavior**:
```typescript
// In OfflinePlay.tsx
const { H: calibH } = useCalibration() // Single H used for all games
```

#### Issue 2: No Per-Game Calibration Validation
**Problem**: Calibration quality isn't verified against specific game requirements
- No check: Is calibration suitable for this game?
- No warning: "This calibration is weak for Cricket"
- No suggestion: "Recalibrate focusing on 20s and bullseye"

#### Issue 3: Static Calibration Feedback
**Problem**: No dynamic response when switching game modes
- Switching from X01 → Cricket: No recalibration prompt
- Switching from Cricket → Treble Practice: No warning
- Error metrics stay generic, not game-specific

#### Issue 4: Game Usage Stats Not Linked to Calibration
**Problem**: `bumpGameMode()` doesn't correlate with calibration quality
```typescript
// Current: Just counts plays/wins
try { bumpGameMode(selectedMode, winner === 'player') } catch {}

// Missing: Calibration quality at time of play
// Should track: gameMode + calibrationQuality + accuracy
```

---

## Recommended Architecture

### 1. Create Game-Mode-Specific Calibration Store

**File**: `src/store/gameCalibration.ts`

```typescript
export type GameCalibrationProfile = {
  gameMode: string
  requiredTargets: string[] // e.g., ['20', '19', '18', '17', '16', '15', 'BULL'] for Cricket
  tolerancePx: number // Min acceptable error for this game (in pixels)
  lastVerified: number | null // Timestamp of last check
  verified: boolean // Is this calibration suitable for this game?
  notes: string // e.g., "Good for X01, weak for Treble Practice"
}

export type GameCalibrationState = {
  profiles: Record<string, GameCalibrationProfile>
  activeGameMode: string | null
  setGameMode: (mode: string) => void
  verifyForGame: (mode: string, H: Homography | null) => boolean
  getGameCalibStatus: (mode: string) => GameCalibrationProfile
  recordGameCalibQuality: (mode: string, errorPx: number, wasSuccessful: boolean) => void
}
```

### 2. Define Target Requirements Per Game

**File**: `src/utils/gameCalibrationRequirements.ts`

```typescript
export const GAME_CALIBRATION_REQUIREMENTS = {
  'X01': {
    requiredTargets: ['SINGLE', 'DOUBLE', 'TREBLE', 'BULL', 'OUTER_BULL'],
    tolerancePx: 10, // Strict for accuracy
    criticalZones: ['D20', 'D1', 'BULLSEYE']
  },
  'Cricket': {
    requiredTargets: ['20', '19', '18', '17', '16', '15', 'BULL'],
    tolerancePx: 15, // Slightly relaxed
    criticalZones: ['20', 'BULL']
  },
  'Treble Practice': {
    requiredTargets: ['TREBLE'],
    tolerancePx: 8, // Very strict
    criticalZones: ['T20', 'T1']
  },
  'Double Practice': {
    requiredTargets: ['DOUBLE'],
    tolerancePx: 12,
    criticalZones: ['D20', 'D1']
  },
  'Around the Clock': {
    requiredTargets: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 
                     '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
    tolerancePx: 12,
    criticalZones: ['1', '20']
  },
  'Checkout 170': {
    requiredTargets: ['DOUBLE'],
    tolerancePx: 8,
    criticalZones: ['D17', 'D20']
  },
  'Checkout 121': {
    requiredTargets: ['DOUBLE'],
    tolerancePx: 8,
    criticalZones: ['D20', 'D25']
  },
  // ... other 16 games
}
```

### 3. Implement Calibration Verification Function

**Purpose**: Check if current calibration meets game requirements

```typescript
export function verifyCalibrationForGame(
  gameMode: string,
  H: Homography | null,
  errorPx: number | null
): {
  suitable: boolean
  confidence: number // 0-100
  warning: string | null
  recommendation: string | null
} {
  if (!H || !errorPx) {
    return {
      suitable: false,
      confidence: 0,
      warning: 'No calibration available',
      recommendation: 'Run calibration first'
    }
  }

  const req = GAME_CALIBRATION_REQUIREMENTS[gameMode]
  if (!req) {
    return {
      suitable: true,
      confidence: 50,
      warning: null,
      recommendation: null
    }
  }

  const suitable = errorPx <= req.tolerancePx
  const confidence = Math.max(0, 100 - (errorPx / req.tolerancePx * 50))

  return {
    suitable,
    confidence,
    warning: !suitable ? `Calibration error (${errorPx}px) exceeds tolerance for ${gameMode}` : null,
    recommendation: confidence < 50 ? `Consider recalibrating focusing on ${req.criticalZones.join(', ')}` : null
  }
}
```

### 4. Link Game Stats to Calibration Quality

**Update**: `src/store/profileStats.ts`

```typescript
export type GameModeStatWithCalibration = {
  played: number
  won: number
  calibrationQuality: 'excellent' | 'good' | 'fair' | 'poor'
  lastCalibrationError: number | null
  avgAccuracy: number // %
}

export function recordGameWithCalibration(
  mode: string,
  won: boolean,
  calibrationError: number | null,
  accuracy: number
) {
  const current = getGameModeStats()
  const entry = current[mode] || { played: 0, won: 0 }
  entry.played += 1
  if (won) entry.won += 1
  // NEW: Track calibration quality
  entry.calibrationQuality = getCalibQuality(calibrationError)
  entry.lastCalibrationError = calibrationError
  entry.avgAccuracy = (entry.avgAccuracy || 0) * 0.9 + accuracy * 0.1 // Rolling avg
  current[mode] = entry
  setGameModeStats(current)
}
```

### 5. Add Per-Game Calibration UI Component

**New File**: `src/components/GameCalibrationStatus.tsx`

```typescript
import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import { useCalibration } from '../store/calibration'
import { verifyCalibrationForGame } from '../utils/gameCalibrationRequirements'

export function GameCalibrationStatus({ gameMode }: { gameMode: string }) {
  const { H, errorPx } = useCalibration()
  const result = verifyCalibrationForGame(gameMode, H, errorPx)

  return (
    <div className={`px-3 py-2 rounded flex items-center gap-2 ${
      result.suitable 
        ? 'bg-emerald-500/20 border border-emerald-600/30'
        : 'bg-amber-500/20 border border-amber-600/30'
    }`}>
      {result.suitable ? (
        <CheckCircle className="w-4 h-4 text-emerald-400" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-400" />
      )}
      
      <div className="flex-1 text-sm">
        <div className="font-medium">
          Calibration: {result.confidence}%
        </div>
        {result.warning && <div className="text-xs opacity-80">{result.warning}</div>}
      </div>

      {result.recommendation && (
        <AlertCircle className="w-3 h-3 text-amber-300 cursor-help" 
          title={result.recommendation} />
      )}
    </div>
  )
}
```

### 6. Integrate into Game Mode Selection

**Update**: `src/components/OfflinePlay.tsx`

```typescript
import { GameCalibrationStatus } from './GameCalibrationStatus'

// In the game mode selector:
{selectedMode === 'X01' && (
  <>
    <GameCalibrationStatus gameMode="X01" />
    {/* X01 setup */}
  </>
)}

// Or in OnlinePlay.tsx for match setup:
{m.game && (
  <GameCalibrationStatus gameMode={m.game} />
)}
```

---

## Implementation Checklist

- [ ] Create `src/store/gameCalibration.ts`
- [ ] Create `src/utils/gameCalibrationRequirements.ts` with all 22 games
- [ ] Implement `verifyCalibrationForGame()` function
- [ ] Update `src/store/profileStats.ts` to track calibration quality
- [ ] Create `src/components/GameCalibrationStatus.tsx` component
- [ ] Integrate status component into OfflinePlay.tsx
- [ ] Integrate status component into OnlinePlay.tsx
- [ ] Add calibration warning/prompt when accuracy is too low
- [ ] Show "Recalibrate" button with game-specific recommendations
- [ ] Track calibration quality in admin dashboard game stats

---

## Benefits

1. **Per-Game Verification**: Each game validates calibration suitability
2. **Intelligent Recommendations**: "Recalibrate focusing on treble ring" (specific to game)
3. **Quality Metrics**: Track calibration quality alongside game wins/losses
4. **Reactive System**: Calibration status updates when game mode changes
5. **Data Insights**: Analytics show correlation between calibration quality and win rate
6. **Better UX**: Users understand why calibration matters for specific games

---

## Example User Flows

### Flow 1: Playing X01 with Poor Calibration
1. User selects "X01"
2. Component shows: "⚠️ Calibration: 35% - Poor for X01. Click to recalibrate."
3. User clicks → Opens Calibrator with suggestion: "Focus on D20, D1, Bullseye"
4. After recalibration: Status updates to "✓ Calibration: 92%"

### Flow 2: Switching from Cricket to Treble Practice
1. Playing Cricket with 80% calibration (suitable)
2. Selects Treble Practice
3. Shows: "⚠️ Calibration: 80% - Fair for Treble Practice. Tolerance: 8px"
4. Suggestion: "Consider fresh calibration for maximum accuracy"

### Flow 3: Admin Dashboard Insights
- Game Usage shows calibration quality per game:
  - "X01: 45 plays, 18 wins | Avg Calibration: 87% | Accuracy: 92%"
  - "Cricket: 23 plays, 11 wins | Avg Calibration: 65% | Accuracy: 78%"

