# 🎯 Calibration to Dart Mapping - Diagnostic & Verification Guide

## Current System Architecture ✅

The system **ALREADY HAS** complete dart detection and scoring integration:

### Flow: Camera → Homography → Board Coordinates → Game Score

```
1. Camera feeds video frames
   ↓
2. DartDetector identifies dart tips in pixel coordinates
   ↓
3. Tip refined using Sobel edge detection (refinePointSobel)
   ↓
4. CRITICAL: Convert from video coordinates to calibration space using sx/sy
   ↓
5. Apply homography H to get board coordinates (mm)
   ↓
6. scoreFromImagePoint() maps board coords → sector/ring/value
   ↓
7. Pass score to game mode handler (X01, Cricket, Shanghai, etc.)
   ↓
8. Game mode applies rules and deducts from remaining score
   ↓
9. Score displayed in scoreboard
```

## Key Components

### 1. **Calibration Store** (`src/store/calibration.ts`)
Stores:
- `H`: Homography matrix (3×3) - Maps image coordinates to board coordinates
- `theta`: Board orientation in radians (0 = canonical with 20 at top)
- `sectorOffset`: Manual sector adjustment (if needed)
- `imageSize`: Actual video frame dimensions (w, h)
- `overlaySize`: Display canvas size
- `errorPx`: Calibration error in pixels (should be ≤6px for good quality)

### 2. **Dart Detection Loop** (`src/components/CameraView.tsx`, lines 1450-1740)
```typescript
// Line 1504: Score from homography
let score = scoreFromImagePoint(
  H,                           // Homography matrix
  pCal,                        // Calibration image coords
  typeof theta === "number" ? theta : undefined,  // Board orientation
  sectorOffset ?? 0            // Sector correction
);

// Returns:
{
  base: number,        // 0-50 (point value)
  ring: Ring,          // SINGLE|DOUBLE|TRIPLE|BULL|INNER_BULL|MISS
  sector: number,      // 1-20 (which sector hit) or null for MISS
  mult: 0|1|2|3        // Multiplier (0=miss, 1=single, 2=double, 3=triple)
}
```

### 3. **Scoring Integration** (`src/components/CameraView.tsx`, lines 2259+)
```typescript
function addDart(
  value: number,           // Score value
  ring: Ring,              // Ring type
  meta?: {                 // Optional metadata
    calibrationValid?: boolean,
    pBoard?: Point,        // Board coordinates
    source?: 'camera'|'manual'
  }
)
```

This function:
- Validates dart is on dartboard (using `isPointOnBoard(pBoard)`)
- Applies game-mode-specific rules (X01 double-in/bust, Cricket marks, etc.)
- Calls `callAddVisit()` which updates game state
- Updates scoreboard in real-time

### 4. **Game Mode Handlers** (`src/components/OfflinePlay.tsx`)

#### X01 Modes
```typescript
onAddVisit={makeOfflineAddVisitAdapter(addVisit)}
// Applies darts to legs, checks for bust, double-out rules, etc.
```

#### Cricket
```typescript
onAutoDart={(value, ring, info) => {
  const r = ring === "MISS" ? undefined : ring;
  addCricketAuto(value, r, info?.sector ?? null);
}}
// Applies marks, counts only 15-20 and bullseye, awards points
```

#### Shanghai
```typescript
onAutoDart={(value, ring, info) => {
  addShanghaiAuto(value, r as any, info?.sector ?? null);
}}
// Checks if dart hits round target, awards points for S/D/T
```

## Testing Checklist 🧪

### Step 1: Verify Calibration
**File**: `src/components/Calibrator.tsx`

1. Click "Calibrate" button
2. Click on 5 dartboard points:
   - Center (bullseye)
   - Right edge (approx 50mm at 0°)
   - Bottom-right (approx 35mm at 45°)
   - Top-left (approx 35mm at 225°)
   - Bottom-left (approx 35mm at 315°)
3. See "H Matrix:" output showing 3×3 matrix
4. Check "Error: X.X px" - should be ≤6px (ideally ≤4px)
5. Click "Lock Calibration" button

**Check DevTools Console**:
```
✅ "[CALIBRATOR] H matrix set"
✅ "[CALIBRATOR] locked: true"
✅ "Error: 2.3 px" (or similar low value)
```

### Step 2: Verify Camera Detects Darts
**In Game** (OfflinePlay with X01):

1. Click "Offline"
2. Select "X01" game mode
3. Ensure "Enable camera" is ON in Settings
4. Black camera preview appears
5. Throw dart at dartboard
6. Watch console for:
   ```
   "[CAMERA] detected raw" 0.92 {x: 523, y: 411}
   "[CAMERA] Preferred camera ID set"
   "[CAMERA] Got stream"
   ```

### Step 3: Verify Homography Transformation
**In CameraView.tsx Detection Loop** (line ~1470-1510):

Console should show:
```
"CameraView: detected raw" <confidence> <pixel_coords>
// Then after refinement and homography:
"score from det" <value> <ring> <sector>
```

### Step 4: Verify Score Mapping (CRITICAL)
**Test Procedure**:

1. **Throw at SINGLE 20** (narrow band left of double)
   - ❌ BAD: Shows D1, T6, S5, or other wrong sector
   - ✅ GOOD: Shows S20 with value 20
   
2. **Throw at DOUBLE 20** (narrow outer band)
   - ❌ BAD: Shows S10, D10, or other
   - ✅ GOOD: Shows D20 with value 40
   
3. **Throw at TRIPLE 20** (narrow inner band)
   - ❌ BAD: Shows D7, S15, or other
   - ✅ GOOD: Shows T20 with value 60

4. **Throw at BULL** (outer bull)
   - ❌ BAD: Shows miss or wrong sector
   - ✅ GOOD: Shows BULL 25 with value 25

5. **Throw at INNER_BULL** (dead center)
   - ❌ BAD: Shows BULL or miss
   - ✅ GOOD: Shows INNER_BULL 50 with value 50

### Step 5: Verify Game State Updates
**X01 Mode** (starts at 501):

Throw three darts:
1. D20 (40 points)
   - ✅ Score shows 461 remaining (501-40=461)
   - ❌ Score unchanged or shows wrong deduction

2. T20 (60 points)
   - ✅ Score shows 401 remaining (461-60=401)
   - ❌ Score shows 341 or other wrong math

3. S20 (20 points)
   - ✅ Score shows 381 remaining (401-20=381)
   - ❌ Score doesn't update

**Cricket Mode**:

Throw darts at 20:
1. S20 (single) → Shows "1" mark on 20 in closed sheet
2. D20 (double) → Shows "2" marks on 20
3. T20 (triple) → Shows "3" marks on 20 (closed)
   - ✅ Next turn, points on 20 score for you
   - ❌ Marks don't appear or wrong number marked

**Shanghai Mode**:

Round 1 (target 1):
1. S1 (single 1) → 1 hit in single column
2. D1 (double 1) → 1 hit in double column
3. T1 (triple 1) → 1 hit in triple column, Shanghai achieved
   - ✅ Score shows (1+2+3=) 6 points, next round starts
   - ❌ Score doesn't increment, round doesn't change

## Troubleshooting Issues

### Issue: Darts show wrong score (e.g., S20 shows as D1)

**Root Causes**:
1. **Bad Calibration** (Most Common)
   - Homography error > 6px
   - Clicked wrong points during calibration
   - Camera moved after calibration
   
2. **Theta/Sector Mismatch**
   - Board rotated relative to calibration
   - Sector offset incorrect
   
3. **Video Coordinate Space Mismatch**
   - Canvas display size ≠ actual video dimensions
   - sx/sy scaling factors wrong

**Fixes**:
```tsx
// Line 1493-1500 in CameraView.tsx - Verify scaling
const sx = videoSize ? videoCanvasWidth / videoSize.w : 1;
const sy = videoSize ? videoCanvasHeight / videoSize.h : 1;
const pCal = { x: tipRefined.x / sx, y: tipRefined.y / sy };

// Check in console:
console.log("sx:", sx, "sy:", sy);
console.log("tipRefined:", tipRefined);
console.log("pCal:", pCal);
console.log("H:", H);
```

**Recalibrate if**:
- errorPx > 6
- Board orientation changed
- Camera angle changed
- Lighting significantly different

### Issue: Darts not detected at all

**Causes**:
1. Camera not started (`preferredCameraId` not set)
2. Dart too close/far from camera (adjust distance)
3. Lighting too dark (improve dartboard lighting)
4. Dart color blends with background

**Fixes**:
- Check Settings: "Enable camera" toggle ON
- Verify camera selector in CameraView UI
- Check DevTools: `[CAMERA] Got stream` message
- Adjust confidence threshold: `AUTO_COMMIT_CONFIDENCE = 0.75` (line 54)

### Issue: Score updates but game mode doesn't process correctly

**Example**: Dart shows "D20 40" but score doesn't deduct

**Cause**: `onAutoDart` callback not receiving the score

**Check CameraView.tsx line 1504-1520**:
```typescript
// This should show console logs:
dlog("CameraView: detected raw", det.confidence, det.tip);
let score = scoreFromImagePoint(...);

// Score should be { base: 40, ring: "DOUBLE", sector: 20, mult: 2 }
```

**Verify Game Mode Handler**:

For X01 in OfflinePlay.tsx (line 3353):
```typescript
onAddVisit={makeOfflineAddVisitAdapter(
  addVisit,  // This function updates game state
  endLeg,
  { shouldDeferCommit, awaitingClear },
)}
```

For Cricket (line 3615):
```typescript
onAutoDart={(value, ring, info) => {
  const r = ring === "MISS" ? undefined : ring;
  addCricketAuto(value, r, info?.sector ?? null);
  return true;  // Must return true for camera to know it was processed
}}
```

## Success Criteria ✅

System is working correctly when:

1. **Calibration**
   - ✅ H matrix computed (errorPx ≤ 6px)
   - ✅ Shows "Locked: true" after calibration
   - ✅ Can be saved/loaded from localStorage

2. **Camera Detection**
   - ✅ DartDetector identifies dart tips
   - ✅ Console shows `[CAMERA] detected raw` messages
   - ✅ Confidence score ≥ 0.75 for valid darts

3. **Homography Mapping**
   - ✅ Pixel coords → calibration coords → board coords
   - ✅ S20 detected as S20 (value 20, sector 20, ring SINGLE)
   - ✅ D20 detected as D20 (value 40, sector 20, ring DOUBLE)
   - ✅ T20 detected as T20 (value 60, sector 20, ring TRIPLE)

4. **Game Mode Integration**
   - ✅ X01: Score correctly deducts from remaining
   - ✅ Cricket: Marks appear in closed sheet
   - ✅ Shanghai: Points calculated and round advances
   - ✅ All darts recorded in match history

5. **Board Validation**
   - ✅ `isPointOnBoard(pBoard)` returns true for valid darts
   - ✅ `calibrationValid` flag is true when conditions met
   - ✅ Ghost darts (off-board) are logged but not committed

## Debug Commands

**Show all calibration state**:
```javascript
// In browser console:
const { H, theta, sectorOffset, imageSize, errorPx, locked } = 
  window.__NDN_STORES?.calibration;
console.log({ H, theta, sectorOffset, imageSize, errorPx, locked });
```

**Show last detected dart**:
```javascript
// Enable detailed logging in CameraView
window.__NDN_CAMERA_CONFIG = {
  singleFrameConfidence: 0.75,
  autoCommitMinFrames: 2
};
// Throw dart and check console for "[CAMERA]" prefixed messages
```

**Trace score calculation**:
```typescript
// In CameraView.tsx line 1504, add temporary logging:
console.log("H:", H);
console.log("pCal:", pCal);
const score = scoreFromImagePoint(H, pCal, theta, sectorOffset);
console.log("Score result:", score);
console.log("Expected for S20: { base: 20, ring: 'SINGLE', sector: 20, mult: 1 }");
```

## Files to Review for Implementation

1. **Calibration**:
   - `src/components/Calibrator.tsx` - UI for calibration
   - `src/store/calibration.ts` - H matrix storage
   - `src/utils/vision.ts` - Homography computation & transforms

2. **Detection**:
   - `src/utils/dartDetector.ts` - DartDetector class
   - `src/components/CameraView.tsx` lines 1470-1740 - Detection loop

3. **Scoring**:
   - `src/utils/autoscore.ts` - scoreFromImagePoint function
   - `src/utils/vision.ts` - scoreAtBoardPoint function

4. **Game Integration**:
   - `src/components/OfflinePlay.tsx` - Game mode handlers
   - `src/game/*.ts` - Game rules (X01, Cricket, Shanghai, etc.)

## Next Steps

1. **Verify current system works** (follow Testing Checklist above)
2. **If detection works**: Skip to step 4
3. **If detection doesn't work**: 
   - Check DartDetector is enabled
   - Verify camera stream is running
   - Check calibration errorPx ≤ 6
4. **If scoring is wrong**:
   - Recalibrate (higher errorPx = wrong scores)
   - Verify `theta` is set correctly
   - Check `sectorOffset` if available
5. **If game mode doesn't process**:
   - Verify `onAutoDart` callback is wired
   - Check game mode's `applySomethingDart` function
   - Verify return value `true` signals successful processing
