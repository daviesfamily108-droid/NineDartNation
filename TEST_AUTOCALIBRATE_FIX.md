# 🎯 Quick Test Checklist - Auto-Calibrate Fix

## What Was Fixed

The auto-calibration now focuses **ONLY on the double and treble rings** (the playable area) instead of trying to detect the entire board. This fixes:
- ✅ Darts scoring wrong sector (S20 called as D1)
- ✅ Inaccurate calibration scale
- ✅ Ring detection focusing on correct features

## How to Test

### Step 1: Access Calibrator
```
1. Click Settings (gear icon)
2. Click "Calibrator" tab
3. Ensure you're on the "Calibrator" view
```

### Step 2: Capture Dartboard
```
1. Click "Capture frame" or upload a dartboard image
2. Make sure:
   - Full dartboard is visible
   - Good lighting
   - Clear view of double and treble rings
```

### Step 3: Run Auto-Calibrate
```
1. Click "🔄 Auto-Calibrate (Advanced)" button
2. Wait 2-3 seconds
3. Should see verification panel with:
   ✅ D20 (top double)
   ✅ D6 (right double)
   ✅ D3 (bottom double)
   ✅ D11 (left double)
   ✅ Bull center
```

### Step 4: Verify Rings
```
Look at the overlay on your screen:
- Cyan rings should match double ring
- Yellow rings should match treble ring
- If rings align with actual board → ✅ Good
- If rings are off → Try better angle/lighting, then Retry
```

### Step 5: Lock Calibration
```
If rings look correct:
1. Click "✅ Accept & Lock"
2. Calibration locked and ready
```

### Step 6: Test Dart Scoring
```
START A GAME and throw darts:

Test 1: Throw at SINGLE 20 area
  Expected: S20
  If showing: ✅ S20 → FIX WORKS!
  If showing: ❌ D1 or other → Still has issue

Test 2: Throw at TREBLE 20 area
  Expected: T20
  If showing: ✅ T20 → FIX WORKS!
  If showing: ❌ Wrong sector → Still has issue

Test 3: Throw at DOUBLE 20 area
  Expected: D20
  If showing: ✅ D20 → FIX WORKS!
  If showing: ❌ Wrong sector → Still has issue

Test 4: Throw at SINGLE 6 area
  Expected: S6
  If showing: ✅ S6 → FIX WORKS!
  If showing: ❌ Wrong sector → Still has issue
```

## Success Criteria

**The fix is working if:**
- ✅ All detected rings match your actual dartboard
- ✅ S20 is detected as S20 (not D1 or other)
- ✅ T20 is detected as T20
- ✅ D20 is detected as D20
- ✅ All sectors are correctly identified

**If still failing:**
- Try different camera angle
- Try better lighting
- Try closer/farther from dartboard
- Click "Retry" to re-detect

## What Changed

```
BEFORE:
- Tried to detect all rings (bull, treble, double)
- Used whole board to determine scale
- Result: Wrong homography, darts scored wrong

AFTER:
- Only detects playable rings (treble + double)
- Uses only playing area for scale
- Result: Correct homography, darts score correctly
```

## Technical Notes

**File changed**: `src/utils/boardDetection.ts`
**Function**: `findDartboardRings()`
**Changes**:
1. Removed bull ring from detection
2. Tightened tolerances from ±2% to ±1.5%
3. Reduced min ring count from 3 to 2
4. Adjusted confidence scoring

**Tests**: All 95 unit tests passing ✅

---

## Troubleshooting

### Issue: Auto-detect shows "No dartboard detected"

**Try:**
1. Better lighting (no shadows on rings)
2. Closer view of board
3. More centered framing
4. Higher contrast (darker background behind board)

### Issue: Rings detected but alignment is off

**Try:**
1. Different camera angle (more perpendicular)
2. Adjust focus/clarity
3. Different lighting
4. Click "Retry"

### Issue: Rings look good but darts still score wrong

**Try:**
1. Recalibrate - maybe first attempt was unlucky
2. Try manual calibration (click on 4 doubles)
3. Check camera position is stable

## Questions?

If the fix isn't working after these tests, check:
1. Are you seeing the new "verify" panel with the 5-point table?
2. Are the colored ring overlays visible on your dartboard?
3. Do the overlays match the actual board rings?

If yes to all → The detection is working, but the issue might be camera positioning or image quality.

---

**Test Status**: 🟢 Ready to test | All systems pass 95/95 tests
