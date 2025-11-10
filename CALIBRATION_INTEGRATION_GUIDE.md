# Game-Mode Calibration Integration Guide

## What Has Been Completed ✅

### 1. Game Calibration Requirements File
**File**: `src/utils/gameCalibrationRequirements.ts`

Defines calibration tolerance and requirements for all 22 games:
- Each game has: `tolerancePx` (acceptable error), `requiredTargets` (critical areas), `minConfidence` (0-100)
- Strictest: Treble Practice (8px tolerance) 
- Most relaxed: Tic Tac Toe (16px tolerance)

**Key Functions**:
```typescript
getCalibrationConfidenceForGame(gameMode, errorPx) → 0-100
isCalibrationSuitableForGame(gameMode, errorPx) → boolean
getCalibrationQualityText(gameMode, errorPx) → { quality, text }
getRecalibrationRecommendation(gameMode) → "Recalibrate focusing on X, Y, Z"
```

### 2. Game Calibration Status Component
**File**: `src/components/GameCalibrationStatus.tsx`

Reusable React component showing per-game calibration status:
- Displays confidence percentage with visual bar
- Shows warnings if unsuitable for selected game
- Provides game-specific recalibration recommendations
- Has compact and full display modes

**Props**:
```typescript
gameMode: string  // "X01", "Cricket", "Treble Practice", etc.
compact?: boolean // true for minimal version
onRecalibrate?: () => void // Callback when user clicks recalibrate
```

---

## Next Steps: Integration 🔄

### Step 1: Add Status to Offline Game Mode Selection

**File**: `src/components/OfflinePlay.tsx`

Find the game mode selector section (around line 1026):

```tsx
// BEFORE (around line 1026)
<label className="font-semibold">Select game mode:</label>
<select className="input w-full" value={selectedMode} onChange={e => setSelectedMode(e.target.value)}>
  {freeGames.map(mode => <option key={mode} value={mode}>{mode}</option>)}
  {premiumGames.map(mode => (
    <option key={mode} value={mode} disabled={!user?.fullAccess}>{mode}</option>
  ))}
</select>

// AFTER - Add status below selector
<label className="font-semibold">Select game mode:</label>
<select className="input w-full" value={selectedMode} onChange={e => setSelectedMode(e.target.value)}>
  {freeGames.map(mode => <option key={mode} value={mode}>{mode}</option>)}
  {premiumGames.map(mode => (
    <option key={mode} value={mode} disabled={!user?.fullAccess}>{mode}</option>
  ))}
</select>

{/* NEW: Show calibration status */}
<GameCalibrationStatus 
  gameMode={selectedMode} 
  compact={false}
/>
```

Then add import at top:
```typescript
import GameCalibrationStatus from './GameCalibrationStatus'
```

### Step 2: Add Status to Online Match Creation

**File**: `src/components/OnlinePlay.tsx`

In the match setup section (around line 2700), after game/mode selection:

```tsx
{/* After game and mode dropdown selection */}
<div className="mb-3">
  <GameCalibrationStatus 
    gameMode={game}
    compact={true}
  />
</div>
```

Add import:
```typescript
import GameCalibrationStatus from './GameCalibrationStatus'
```

### Step 3: Show Status During Active Game Play

**File**: `src/components/OfflinePlay.tsx` (Game play section)

In the GameHeaderBar or game display area (around line 1100):

```tsx
{/* During active play, show compact calibration status in header */}
{inMatch && (
  <div className="flex items-center gap-2 text-sm">
    <GameCalibrationStatus 
      gameMode={selectedMode}
      compact={true}
    />
  </div>
)}
```

### Step 4: Link Calibration Quality to Game Stats

**File**: `src/store/profileStats.ts`

Update the `bumpGameMode()` function to track calibration quality:

```typescript
import { getCalibrationQualityText } from '../utils/gameCalibrationRequirements'
import { useCalibration } from './calibration'

export function bumpGameModeWithCalibration(
  mode: string, 
  won: boolean,
  calibrationError: number | null  // Pass error from useCalibration().errorPx
) {
  const current = getGameModeStats()
  const entry = current[mode] || { played: 0, won: 0, calibrationHistory: [] }
  
  entry.played += 1
  if (won) entry.won += 1
  
  // NEW: Track calibration quality at time of play
  if (calibrationError !== null) {
    const { quality } = getCalibrationQualityText(mode, calibrationError)
    entry.calibrationHistory = entry.calibrationHistory || []
    entry.calibrationHistory.push({
      timestamp: Date.now(),
      quality,
      error: calibrationError
    })
  }
  
  current[mode] = entry
  setGameModeStats(current)
}
```

Then update game completion calls:

```typescript
// OLD: try { bumpGameMode(selectedMode, winner === 'player') } catch {}

// NEW:
try { 
  const { errorPx } = useCalibration()
  bumpGameModeWithCalibration(selectedMode, winner === 'player', errorPx)
} catch {}
```

### Step 5: Display Calibration in Admin Dashboard

**File**: `src/components/AdminDashboard.tsx`

Update the Game Usage section to show calibration quality:

```tsx
{/* In Game Usage boxes section */}
{gmBars.map((d, i) => (
  <div key={i} className="flex items-center justify-between px-2 py-1 rounded-md bg-white/5 border border-white/10">
    <span className="truncate mr-2">{d.label}</span>
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs">Played {d.value} · Won {d.won}</span>
      {/* NEW: Show calibration quality indicator */}
      {d.calibrationQuality && (
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          d.calibrationQuality === 'excellent' ? 'bg-emerald-600/30' :
          d.calibrationQuality === 'good' ? 'bg-cyan-600/30' :
          d.calibrationQuality === 'fair' ? 'bg-amber-600/30' :
          'bg-rose-600/30'
        }`}>
          Cal: {d.calibrationQuality}
        </span>
      )}
    </div>
  </div>
))}
```

---

## Testing Checklist 📋

### Unit Tests
- [ ] `getCalibrationConfidenceForGame()` returns 0-100 for all games
- [ ] `isCalibrationSuitableForGame()` returns boolean
- [ ] `getRecalibrationRecommendation()` returns game-specific zones
- [ ] All 22 games have valid tolerance and min confidence values

### Integration Tests
- [ ] OfflinePlay shows GameCalibrationStatus for selected mode
- [ ] Status updates when game mode changes
- [ ] OnlinePlay shows calibration status in match setup
- [ ] GameHeaderBar shows compact calibration during play
- [ ] Admin dashboard displays calibration quality metrics

### User Flow Tests
1. **Scenario 1: Play X01 with poor calibration**
   - Select X01 (error = 20px, tolerance = 10px)
   - Should show: ⚠️ "Poor (40%)" with warning
   - Recommendation: "Recalibrate focusing on D20, D1, Bullseye"

2. **Scenario 2: Switch from Cricket to Treble Practice**
   - Playing Cricket (error = 12px, tolerance = 15px) ✓ Good
   - Switch to Treble Practice (same error, tolerance = 8px) ⚠️ Fair
   - Shows: "Fair for Treble Practice" with recalibration suggestion

3. **Scenario 3: Fresh calibration for Treble Practice**
   - Run calibration (error = 5px)
   - Select Treble Practice
   - Shows: ✓ "Excellent (100%)" no warnings

---

## Performance Considerations ⚡

- **Computation**: All calibration confidence calculations are O(1)
- **Re-renders**: GameCalibrationStatus only re-renders if `gameMode` or calibration changes
- **Memory**: No additional state stored (uses existing useCalibration hook)
- **Bundle**: New files add ~12KB (unminified, ~3KB gzipped)

---

## Future Enhancements 🚀

1. **Per-Game Calibration Profiles**
   - Allow users to save/restore different calibrations for different games
   - "Calibration preset for Cricket" vs "Preset for Treble Practice"

2. **Calibration History**
   - Track when calibration was done and which games it was good for
   - "Last calibrated 3 days ago - suitable for X01, Cricket, Baseball"

3. **Predictive Warnings**
   - "Your calibration is drifting - it will be unsuitable for Treble Practice in ~5 games"

4. **Guided Recalibration**
   - Open Calibrator pre-focused on critical zones for selected game
   - "Recalibrating for Treble Practice - focus on T20, T1, T5 targets"

5. **Analytics Dashboard**
   - Show: Win rate by calibration quality per game
   - "X01: 72% win rate with excellent calibration vs 45% with fair"

6. **Calibration Marketplace** (stretch)
   - Share calibrations with friends
   - "Use 'John's Cricket Calibration' setup"

---

## Code References

### Import the calibration functions:
```typescript
import {
  getCalibrationConfidenceForGame,
  isCalibrationSuitableForGame,
  getCalibrationQualityText,
  getRecalibrationRecommendation
} from '../utils/gameCalibrationRequirements'
```

### Import the component:
```typescript
import GameCalibrationStatus from './GameCalibrationStatus'
```

### Use the component:
```tsx
<GameCalibrationStatus 
  gameMode="Cricket"
  compact={false}
  onRecalibrate={() => {
    // Navigate to calibrator or show calibration modal
  }}
/>
```

---

## Questions & Troubleshooting 🔧

**Q: Why does Cricket show "Fair" calibration when I just calibrated?**
A: Cricket has a 15px tolerance but your calibration error is ~12px. It's still suitable (confidence ≥ 70%), just not excellent. This is fine for playing.

**Q: Why is Treble Practice the strictest?**
A: Treble rings are narrow targets. Even small calibration errors (>8px) significantly impact treble zone accuracy, so stricter tolerance is needed.

**Q: Can I use the same calibration for all games?**
A: Yes! The system is designed to verify if your current single calibration works for each game. It will warn you if it's not ideal, but won't prevent play.

**Q: How often should I recalibrate?**
A: When the system warns you (confidence < minConfidence for your game), or if you notice accuracy issues. Cameras don't drift much, so recalibration is usually only needed after setup changes.

