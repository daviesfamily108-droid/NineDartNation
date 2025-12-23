# Scoring Diagnostic Guide

## The Problem
Scoring is "WAAAAAAY off" - darts are either:
1. Not being detected at all
2. Being detected but at wrong values/sectors
3. Being scored as the wrong multiplier (single vs double vs triple)

## Root Causes to Check

### 1. **Calibration H Matrix Is Wrong**
The homography matrix H maps board-space (mm) → image-space (pixels).

**Check this:**
- Open browser DevTools (F12)
- Go to Console tab
- When you do calibration, look for this log:
  ```
  [Calibrator] Homography computed: { H: [...], errorPx: ... }
  ```
- The `errorPx` should be **< 3px** for good calibration
- If errorPx > 5px, your calibration is bad

**Fix if needed:**
- Re-calibrate carefully:
  1. Make sure dartboard is FULLY visible in camera
  2. Click EXACTLY on the visible double ring edge (not inside, not outside)
  3. Start with D20 (top), then D6 (right), D3 (bottom), D11 (left), then Bull
  4. Watch the confidence meter - try to get it > 80%

---

### 2. **Coordinate System Is Inverted**
The transformation from image → board space might be backwards.

**Evidence of this:**
- When you throw at D20 (top), it scores D3 (bottom)
- When you throw at D6 (right), it scores D11 (left)
- Sectors are consistently opposite

**Check the math:**
In `CameraView.tsx` around line 1470:
```tsx
const pBoard = imageToBoard(H, pCal);
```

This should convert image-space pixel to board-space mm using the inverse of H.

The function `imageToBoard` does:
```tsx
const inv = invertHomography(H_boardToImage);
const result = applyHomography(inv, pImg);
```

If this is wrong, H itself is computed backwards during calibration.

---

### 3. **Sector Calculation Is Off**
The angle/sector mapping might not match your physical board orientation.

**Sector order (from vision.ts):**
```
SectorOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
```

This assumes sector 20 is at the TOP (negative Y axis in board space).

**Check if your dartboard is rotated wrong:**
1. Look at the camera feed
2. Is the "20" at the top?
3. If not, your board might be mounted rotated

**To verify sector mapping:**
- Throw a dart at the 20
- Check the value it scores
- If it's wrong, your board might be physically rotated

---

### 4. **Detector Thresholds Still Too Loose**
The dart detection parameters might still be picking up background noise.

**Current thresholds in CameraView.tsx (~1409-1420):**
```tsx
let minArea = 120;    // minimum blob size
let thresh = 24;      // intensity threshold
```

If darts are being scored without being thrown, try **increasing these**:
```tsx
let minArea = 150;    // increase blob size requirement
let thresh = 30;      // increase intensity threshold
```

**To test:** Comment out the proximity check temporarily and see if darts are still detected when you don't throw.

---

## Debugging Steps

### Step 1: Enable Full Logging
In your browser DevTools Console, set:
```javascript
// Allow verbose logging
window.__NDN_DEBUG = true;
```

Then reload the page and watch the console as you throw darts.

### Step 2: Check Calibration Quality
```javascript
// In Console, check stored calibration
const stored = localStorage.getItem("ndn-calibration");
console.log(JSON.parse(stored));
// Look for: errorPx should be < 3px, locked should be true
```

### Step 3: Trace One Dart Detection
1. Throw ONE dart and watch console
2. Look for logs like:
   ```
   CameraView: detected raw 0.95
   CameraView: detection details { value: 20, ring: "DOUBLE", ... pBoard: { x: 165, y: 5 } }
   ```
3. Check if `pBoard` looks reasonable:
   - Should be within ±170mm in both X and Y
   - For D20 (top), should be around `{ x: ~0, y: ~-165 }`
   - For D6 (right), should be around `{ x: ~165, y: ~0 }`

### Step 4: Manual Verification
If you can calculate your dart's position:
1. Throw at D20 - should score 40 (double 20)
2. Throw at 20 single (inner) - should score 20
3. Throw at T20 (triple) - should score 60
4. Throw at Bull - should score 50

If ALL sectors are consistently offset (like always +1 or -1), it's a sector calculation bug.

---

## The Three-Part Solution

We've already applied:

1. **ROI Constraint** (line ~1468)
   - Changed multiplier from 1.08x to 0.98x
   - This keeps detection within dartboard boundaries

2. **Threshold Tuning** (line ~1409-1420)
   - minArea: 80 → 120
   - thresh: 20 → 24
   - Requires larger, darker blobs to detect

3. **Proximity Check** (line ~1545-1551)
   - Validates pBoard is ≤175mm from center
   - Catches homography errors

## If Still Not Working

If scoring is STILL wrong after re-calibrating, the issue is likely:

### Most Likely: Bad Calibration
- **Re-calibrate** with extra care
- Get errorPx < 2px
- Make sure board is 100% in frame

### Next: Sector Orientation
- Check if D20 is actually at top in camera view
- If not, you need to physically rotate the board (or adjust theta in settings)

### Last Resort: Coordinate Inversion
- If sectors are consistently backwards (D20→D3, etc.)
- The homography computation might have src/dst swapped
- This would require code change to `computeHomographyDLT` parameters

---

## Quick Test Without Throwing

To verify the system WORKS without throwing darts:

1. Open browser Console
2. Paste this:
   ```javascript
   // Simulate a dart at D20 double ring
   const H = JSON.parse(localStorage.getItem("ndn-calibration")).H;
   const vision = await import('./src/utils/vision.js');
   
   // Point at ~170mm, 0mm in board space (D20 right edge)
   const boardPoint = { x: 170, y: 0 };
   const score = vision.scoreAtBoardPoint(boardPoint);
   console.log(score);  // Should be { base: 6, ring: "DOUBLE", sector: 6, mult: 2 }
   ```

If the math works but scoring is wrong, it's a calibration or detection issue.

---

## Summary

| Symptom | Most Likely Cause | Fix |
|---------|------------------|-----|
| Never detects any darts | Detector thresholds too high | Lower minArea/thresh |
| Detects but wrong sector | Coordinate transformation inverted | Check H matrix computation |
| Scores when no dart thrown | Thresholds too loose | Increase minArea/thresh |
| Consistent sector offset | Board is rotated | Rotate physical board or adjust settings |
| Wrong multiplier (D→S→T) | Radius calculation wrong | Check BoardRadii constants |

---

**Next action:** 
1. Re-calibrate with errorPx < 2px
2. Throw a dart at D20, check console for pBoard
3. Report back the pBoard coordinates and what score it gives

This will tell us exactly what's wrong!
