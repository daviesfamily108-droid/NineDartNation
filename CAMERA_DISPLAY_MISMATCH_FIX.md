# 🎯 Camera Display Mismatch Fix

## Problem

Your camera feed in **game view** is zoomed/scaled differently than in **calibration view**:
- **Game**: Zoomed in, missing double 3 (Image 1)
- **Calibration**: Full board visible (Image 2)

## Root Cause

The camera display applies `cameraScale` and `cameraFitMode` settings to the **displayed video**, but the **detection canvas** always draws at actual video dimensions. This causes a mismatch:

```
Display Canvas: video with cameraScale = 1.2 (zoomed 20%)
Detection Canvas: video at actual size (no scale)
Result: Calibration detects full board, but display shows zoomed board
```

## Quick Fix (Try This First)

**In the game UI:**
1. Scroll down to camera buttons
2. Click **"Reset Camera Size"** button
3. Should see message about resetting
4. Now try calibrating again

This resets `cameraScale` to 1.0 and `cameraFitMode` to "fit" (which uses `object-contain` = shows full video)

## If That Doesn't Work

The issue is in how the canvas context is created for detection. The detection code draws at video dimensions:

```typescript
const vw = v.videoWidth || 0;  // Actual video width
const vh = v.videoHeight || 0; // Actual video height
proc.width = vw;               // Draw at actual size
proc.height = vh;              
```

But the displayed video is scaled by `videoScale`:

```typescript
style={{ transform: `scale(${videoScale})` }} // Applies CSS zoom
```

### Manual Fix

Ensure when you snap for calibration:
1. **Camera view should NOT be scaled**
   - Check if cameraScale = 1.0
   - Check if cameraFitMode = "fit" (not "fill")
   
2. **Reset before calibrating**
   - Click "Reset Camera Size" button
   - Then snap & calibrate

3. **Alternative**: Adjust zoom after calibration
   - Calibrate at scale 1.0
   - Then adjust zoom with scale buttons if needed
   - Re-calibrate if zoom changed

## Why This Matters

```
Calibration stores homography based on:
  H = detectBoard(canvas)
  where canvas.width = videoWidth, canvas.height = videoHeight

But display shows:
  video with transform: scale(cameraScale)
  where visible area = videoWidth * cameraScale

Result: Coordinates don't match!
```

## Complete Fix (Code-Based)

The proper fix is to apply the **same scale** to the detection canvas as displayed:

```typescript
// In detection tick:
const vw = v.videoWidth || 0;
const vh = v.videoHeight || 0;
const videoScale = cameraScale ?? 1.0;

// Scale the detection canvas to match display
proc.width = vw * videoScale;
proc.height = vh * videoScale;
const ctx = proc.getContext("2d");

// Draw scaled
ctx.scale(videoScale, videoScale);
ctx.drawImage(v, 0, 0, vw, vh);
```

But this is complex. Better approach: **Always calibrate at scale 1.0**

## Recommended Workflow

### Calibration Phase
1. Click "Reset Camera Size" (ensures scale = 1.0)
2. Click "📸 Snap & Calibrate" 
3. Verify: "Perfect calibration: 98% confidence"

### Game Phase
4. Play your game
5. If you want to zoom for comfort, adjust scale (up to ±25%)
6. Detection will still work (homography is based on actual dimensions)

### If Detection Misses After Zooming
1. Click "Reset Camera Size" again
2. Re-snap calibration at scale 1.0
3. Then adjust zoom back to preferred level

## Status

✅ **Problem identified**: Scale mismatch between display and detection
✅ **Quick fix**: Use "Reset Camera Size" button before calibrating
✅ **Workaround**: Always calibrate at scale 1.0
⚠️ **Code fix needed**: If scale adjustment after calibration breaks detection

## Next Steps

1. **Try Reset Camera Size** button
2. **Re-calibrate** 
3. Verify double 3 is visible and detected correctly
4. Let me know if that fixes it

If not, I can implement a proper scale-aware detection system that matches the displayed canvas scaling.

