## Critical Bug Fix: imageSize Mismatch Causing Wrong Dart Identification

### The Problem

Darts were being **incorrectly identified** and scoring in the wrong sectors or rings. This was caused by a fundamental mismatch between:
1. **The coordinate system used when computing the homography (H) during calibration**
2. **The coordinate system being fed to H when identifying darts in CameraView**

### Root Cause

During calibration in `Calibrator.tsx`, the `imageSize` was being set to **the canvas display dimensions**:
```typescript
imageSize: { w: canvasRef.current.width, h: canvasRef.current.height }
```

However, this canvas might be **stretched or scaled** compared to the actual video frame dimensions. For example:
- Actual video stream: 1920x1080 pixels
- Calibrator canvas display: 400x300 pixels (fitted to screen)

When the homography H was computed, it was implicitly using the calibrator canvas coordinate system [0, 400] x [0, 300].

Later, in `CameraView.tsx`, when darts were detected:
```typescript
const sx = vw / imageSize.w;  // vw = 1920, imageSize.w = 400 → sx = 4.8
const pCal = { x: detectedPixelX / sx, y: detectedPixelY / sy };
```

This would **apply the wrong scaling** because:
- A detected dart at video pixel (300, 250) would be mapped to (62.5, 69.4) in calibration space
- But H expects coordinates in the range [0, 400] x [0, 300], treating (62.5, 69.4) as being near the CENTER of the board
- The actual dart at video (300, 250) is much farther out, so it gets identified as a completely different sector!

### The Fix

Changed all `imageSize` assignments in `Calibrator.tsx` to use **actual video frame dimensions**:

```typescript
// Before (WRONG - canvas display size):
imageSize: { w: canvasRef.current.width, h: canvasRef.current.height }

// After (CORRECT - actual video frame size):
const actualImageSize = videoRef.current
  ? { w: videoRef.current.videoWidth, h: videoRef.current.videoHeight }
  : { w: canvasRef.current.width, h: canvasRef.current.height };
imageSize: actualImageSize
```

Now the homography H is created with the understanding that:
- `imageSize = { w: 1920, h: 1080 }` (the actual video frame dimensions)
- When CameraView receives detections, they're already in video frame coordinates [0, 1920] x [0, 1080]
- The scaling math works correctly:
  ```typescript
  const sx = vw / imageSize.w;  // vw = 1920, imageSize.w = 1920 → sx = 1.0
  const pCal = { x: 300 / 1.0, y: 250 / 1.0 };  // → (300, 250) in board space
  ```

### Files Modified

1. **`src/components/Calibrator.tsx`** - Lines 2224, 2546, 2998
   - All calls to `setCalibration()` now use `videoRef.current.videoWidth/videoHeight` instead of canvas dimensions
   - Added fallback to canvas dimensions only when video reference unavailable

2. **`src/components/CameraView.tsx`** - Lines 1491-1503
   - Added comprehensive comment explaining the coordinate system and why correct imageSize is critical

### Testing

All 13 autoscore tests pass with this fix, confirming backward compatibility.

### Impact

This fix should resolve the majority of "wrong ring/sector identification" issues, especially:
- Darts consistently identified as wrong sectors
- Darts off by consistent offsets (e.g., always shifted toward one side)
- Different behavior between different devices with different video dimensions

The bug was particularly severe when:
- Using phones with high-resolution cameras (e.g., 4K video displayed in smaller preview)
- Desktop cameras at various resolutions
- Devices where the video stream size != display size significantly
