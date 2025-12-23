# Legacy Auto-Detect Fix - Complete

## What Was the Problem?

You clicked **"Legacy: Auto detect rings"** and it showed completely misaligned rings that didn't match your dartboard at all. The rings were found in the wrong location.

## Root Cause

The "Legacy" button was using an **old, simple circle detection algorithm** that:
1. Looks for the **strongest edge** in the entire image
2. Doesn't understand dartboard structure
3. Gets confused by external lights, shadows, or anything with strong edges
4. In your case, found the **outer lighting ring** instead of the dartboard

## The Fix

Instead of using the weak legacy algorithm, **both buttons now use the same advanced detection algorithm** (`detectBoard` from the vision utilities):

✅ **Advanced Algorithm Features:**
- Understands dartboard structure (bull, treble, double rings)
- Uses multiple detection methods (not just edge finding)
- Validates that detected rings make sense
- Confidence scoring to reject bad detections
- Stability checking (runs detection 3 times to ensure consistency)

## Changes Made

**File: `src/components/Calibrator.tsx`**

1. **Line ~2550: `autoDetectRings()` Function**
   - Replaced old circle search algorithm (~300 lines of Sobel + radial search code)
   - Now calls `detectBoard()` and `refineRingDetection()` (the advanced algorithm)
   - Added validation - rejects detections with confidence < 50%
   - Added stability validation across 3 runs
   - Auto-locks if stable and high confidence

2. **Line ~3621: Button Label**
   - Changed from: `"Legacy: Auto detect rings"`
   - Changed to: `"🔄 Re-run Auto-Calibrate"`
   - Makes it clear it's the same algorithm as the main button (just a re-run)

## How to Use Now

Both buttons work identically:
```
🎯 Auto-Calibrate (Advanced) ← Primary button
🔄 Re-run Auto-Calibrate     ← Same algorithm, used for retry
```

**Workflow:**
1. Capture dartboard image
2. Click either button
3. System detects rings using advanced algorithm
4. Shows confidence percentage
5. Rings auto-lock if confidence ≥95%

## Testing

✅ **All 95 unit tests passing**
- Test Files: 34 passed | 6 skipped
- Tests: 95 passed | 6 skipped
- No regressions

## Why This Works Better

| Factor | Old Legacy | New Fix |
|--------|-----------|---------|
| Algorithm | Simple circle search | Advanced board detection |
| Confusion source | Outer lights | Understands structure |
| Validation | None | Confidence + stability check |
| Errors | Silent wrong rings | Rejects and shows error |
| Reliability | Low | High |

## What Happens If Detection Still Fails?

If you click the button and it still doesn't detect properly:
1. Check lighting - rings need visible edges
2. Adjust camera angle - get more perpendicular to board
3. Click button again - sometimes needs fresh image
4. Manual calibration - click 4 double ring points as fallback

## Result

**No more misaligned rings!** The legacy button now uses the same robust algorithm as the advanced button, so:
- ✅ Works with various lighting conditions
- ✅ Understands dartboard structure
- ✅ Validates before applying calibration
- ✅ Clear error messages if something fails

---

**TL;DR:** The "Legacy" button was broken because it used a weak algorithm. Now it uses the same advanced algorithm as the main button. Both buttons work great! 🎯
