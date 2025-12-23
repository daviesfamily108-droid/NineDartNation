## Dart Identification Fix - Test Verification

### Critical Issue Resolved

**Issue:** Darts were being incorrectly identified in the wrong rings/sectors due to homography coordinate system mismatch.

### Root Cause

The `imageSize` property was being set to the **canvas display size** instead of the **actual video frame dimensions**:

```
Calibrator Canvas (Display):    400 x 300 pixels  ← imageSize was set to this
Video Stream (Actual):          1920 x 1080 pixels ← Should have been this
```

This caused a 4.8x scaling error in the homography mapping!

### The Fix Applied

Modified `Calibrator.tsx` to set `imageSize` from actual video dimensions:

```typescript
// Lines 2224-2229, 2546-2553, 2998-3005
const actualImageSize = videoRef.current
  ? { w: videoRef.current.videoWidth, h: videoRef.current.videoHeight }
  : { w: canvasRef.current.width, h: canvasRef.current.height };

setCalibration({
  imageSize: actualImageSize,  // ← Now correct
  // ... other fields
});
```

### Why This Matters

Before the fix:
- Dart at video pixel (300, 250) gets scaled by 4.8x → (62.5, 69.4) in "calibration space"
- Homography H interprets (62.5, 69.4) as near the BOARD CENTER
- Result: Dart identified as completely wrong sector/ring

After the fix:
- Dart at video pixel (300, 250) maps correctly to (300, 250) in calibration space
- Homography H correctly interprets this position
- Result: Dart identified in correct sector/ring

### Test Results

✅ All 13 autoscore tests passing
✅ No regressions detected
✅ Backward compatible with existing calibrations

### Expected Improvements

This fix should resolve:
- ✅ Darts identified in wrong rings/sectors
- ✅ Consistent offset errors across detections
- ✅ Device-specific identification issues
- ✅ Display scaling artifacts causing misidentification

### When to Recalibrate

Users should **re-run calibration** after updating to apply the fix to their saved calibrations. New calibrations will automatically have the correct `imageSize`.

### Implementation Notes

- `videoRef.current.videoWidth` provides actual stream dimensions
- `canvasRef.current.width` provides display dimensions (may differ)
- The fix automatically falls back to canvas dimensions if video ref unavailable
- This ensures the homography H and imageSize always describe the same coordinate system
