# 🎯 Calibration Alignment Fix - Double Ring Mapping

## The Issue
When calibrating, you were clicking on where the **visible double ring** appears on your dartboard, but the calibration system was targeting the **center of the double ring** (165mm) instead of the visible edge (170mm).

This caused a mismatch:
- You click on what you see (outer double ring at 170mm)
- System records as center of double (165mm)
- Homography becomes slightly misaligned
- Dart detection uses wrong reference points

## The Fix

### What Changed

**1. Calibration Target Radius** (`src/utils/vision.ts`)
- **Before**: Used center of double ring (165mm) as default
  ```typescript
  const radius = (BoardRadii.doubleInner + BoardRadii.doubleOuter) / 2; // 165mm center
  ```
- **After**: Uses outer edge of double ring (170mm)
  ```typescript
  const radius = BoardRadii.doubleOuter; // 170mm - where doubles are VISIBLE
  ```

**2. UI Instructions** (`src/components/Calibrator.tsx`)
- **Before**: Vague "Click the exact location"
- **After**: Clear "Click on the VISIBLE double ring area (outer red band)"

**3. Target Labels** (`src/components/Calibrator.tsx`)
- **Before**: "D20 (Top)" 
- **After**: "🎯 D20 (Click top double ring)" - More explicit

## Why This Matters

When you see the dartboard in your camera:
- The **red double ring area** you can see on screen is at 170mm radius
- Previously the system asked you to click there (170mm visually) but recorded it as 165mm
- Now it correctly records: **what you click = what the system uses**

This means:
✅ Calibration targets align with visual doubles
✅ Your clicks match the homography matrix
✅ Dart detection references are more accurate
✅ No more mismatch between vision and coordinates

## How to Test

1. **Refresh browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Go to Calibrate**
3. You'll see updated instructions: "Click on the VISIBLE double ring area"
4. Click on the **visible red double band** at:
   - Top (D20)
   - Right (D6)
   - Bottom (D3)
   - Left (D11)
   - Center (Bull)
5. Complete calibration

**Result**: Points should now align perfectly with where you can see the doubles on the dartboard!

## Technical Details

### Board Measurements
- `BoardRadii.doubleInner = 162mm` (inner edge of double ring)
- `BoardRadii.doubleOuter = 170mm` (outer edge of double ring - what you SEE)
- Center of ring = 166mm
- **We now use 170mm (outer edge)** ← This is what's visible!

### Homography Impact
The 5mm difference (165mm → 170mm) was causing:
- Slight rotation errors
- Minor scaling discrepancies
- Dart detection using wrong reference circles

Now the calibration points are on the **actual visible boundaries** of the double ring, making everything more accurate.

## What Stays the Same

✅ 5-point calibration system (still need 5 clicks)
✅ Error calculation (still shows errorPx)
✅ Homography computation (still uses DLT)
✅ All 21 game modes (still work the same)
✅ Camera detection (same accuracy, better baseline)

## Summary

**Before**: Calibration targets at ring center (165mm) ❌ Mismatch with visible ring (170mm)
**After**: Calibration targets at ring edge (170mm) ✅ Match what you see and click

This ensures your clicks on the **visible double ring** correctly map to the homography matrix, resulting in better dart detection alignment overall.

---

## Implementation Complete ✅

- ✅ Changed target radius from 165mm to 170mm
- ✅ Updated UI instructions
- ✅ Updated target labels
- ✅ No breaking changes
- ✅ Backward compatible (existing calibrations still work)
- ✅ All tests pass

**Ready to test!** Reload the page and try calibrating with the new alignment.
