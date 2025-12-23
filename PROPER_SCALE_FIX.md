# 🔧 PROPER FIX: Scale-Aware Calibration & Detection

## The Real Problem

Your detection canvas draws at **actual video dimensions** (e.g., 1280x720), but your **displayed video** is scaled by `cameraScale` (e.g., × 1.2).

When you calibrate at scale 1.2:
- **Display**: Shows zoomed board (board appears large)
- **Detection canvas**: Draws unzoomed at 1280x720
- **Homography**: Computed for unzoomed coordinates

When detecting in game:
- **Display**: Shows at current scale (might be different from calibration)
- **Detection canvas**: Still unzoomed
- **Result**: Coordinates don't match!

## Solution: Detect What You See

Make the **detection canvas match the display**, so calibration and detection use the **same coordinate space**.

### Implementation

**File**: `src/components/CameraView.tsx`

In the tick function, right after getting `vw` and `vh`, apply the scale:

```typescript
// Line ~1430, find this section:
const vw = v.videoWidth || 0;
const vh = v.videoHeight || 0;

// Add this right after:
const videoScale = cameraScale ?? 1.0;
const scaledW = Math.round(vw * videoScale);
const scaledH = Math.round(vh * videoScale);
```

Then update the canvas:

```typescript
// Line ~1440, change:
if (proc.width !== vw) proc.width = vw;
if (proc.height !== vh) proc.height = vh;

// To:
if (proc.width !== scaledW) proc.width = scaledW;
if (proc.height !== scaledH) proc.height = scaledH;
```

And when drawing:

```typescript
// Line ~1449, change:
ctx.drawImage(v, 0, 0, vw, vh);

// To:
ctx.scale(videoScale, videoScale);
ctx.drawImage(v, 0, 0, vw, vh);
```

**That's it!** Now detection uses the same scale as display.

---

## Quick Manual Solution (No Code Change)

Until I apply the fix, use this workflow:

### Step 1: Reset to Default
- Click "Reset Camera Size" button in UI
- (sets scale = 1.0, fit = "fit")

### Step 2: Calibrate
- Click "Snap & Calibrate"
- Verify it shows full board and says "Perfect calibration"
- **Don't adjust zoom after this**

### Step 3: Play
- Your detection should work correctly now

### If You Want to Zoom
- After everything is working, try adjusting scale with zoom buttons
- If detection breaks, click "Reset Camera Size" again and re-calibrate

---

## Why This Happens

The detection code correctly handles **video resolution changes** (different cameras, different aspect ratios), but it doesn't handle **CSS zoom** (cameraScale).

```
Video Dimensions (from video properties):
  videoWidth = 1280
  videoHeight = 720

Canvas Detection:
  canvas.width = 1280
  canvas.height = 720
  Draws full video at 1:1 scale

Display CSS:
  transform: scale(1.2)
  Shows canvas zoomed 20%

Result:
  What user sees: Zoomed board
  What detection uses: Unzoomed coordinates
  Mismatch! ❌
```

---

## Exact Code Changes Needed

### Change 1: Add scale variables

**File**: `src/components/CameraView.tsx` at line ~1430

**Find:**
```typescript
      const v = sourceVideo;
      const initVw = v.videoWidth || 0;
      const initVh = v.videoHeight || 0;
    const proc = canvasRef.current;
    if (!proc) return;
```

**Replace with:**
```typescript
      const v = sourceVideo;
      const initVw = v.videoWidth || 0;
      const initVh = v.videoHeight || 0;
      const videoScale = cameraScale ?? 1.0;  // ADD THIS LINE
      const initWScaled = Math.round(initVw * videoScale);  // ADD THIS LINE
      const initHScaled = Math.round(initVh * videoScale);  // ADD THIS LINE
    const proc = canvasRef.current;
    if (!proc) return;
```

### Change 2: Update canvas size to scaled dimensions

**Find:**
```typescript
        if (proc.width !== vw) proc.width = vw;
        if (proc.height !== vh) proc.height = vh;
```

**Replace with:**
```typescript
        if (proc.width !== vw * videoScale) proc.width = Math.round(vw * videoScale);
        if (proc.height !== vh * videoScale) proc.height = Math.round(vh * videoScale);
```

### Change 3: Scale the drawing

**Find:**
```typescript
        ctx.drawImage(v, 0, 0, vw, vh);
        const frame = ctx.getImageData(0, 0, vw, vh);
```

**Replace with:**
```typescript
        if (videoScale !== 1.0) {
          ctx.scale(videoScale, videoScale);
        }
        ctx.drawImage(v, 0, 0, vw, vh);
        const frame = ctx.getImageData(0, 0, Math.round(vw * videoScale), Math.round(vh * videoScale));
```

### Change 4: Update ROI calculation

**Find:**
```typescript
        const cImg = applyHomography(H, { x: 0, y: 0 });
        const rImg = applyHomography(H, { x: BoardRadii.doubleOuter, y: 0 });
        // Scale calibration image coordinates to current video size
        const sx = vw / imageSize.w;
        const sy = vh / imageSize.h;
```

**Replace with:**
```typescript
        const cImg = applyHomography(H, { x: 0, y: 0 });
        const rImg = applyHomography(H, { x: BoardRadii.doubleOuter, y: 0 });
        // Scale calibration image coordinates to current video size (with camera scale)
        const scaledW = vw * videoScale;
        const scaledH = vh * videoScale;
        const sx = scaledW / imageSize.w;
        const sy = scaledH / imageSize.h;
```

---

## Testing After Fix

1. **Set scale to 1.0** (default)
2. **Snap & Calibrate** → Should show 98% confidence
3. **Play game** → Detection should work
4. **Adjust scale** (try scale 1.1, 1.2, etc.)
5. **Snap & Calibrate again** → Should still show 98% confidence
6. **Play game** → Detection should still work at new scale

✅ If it works at any scale, fix is successful!

---

## Status

🔴 **Problem**: Display zoom doesn't match detection canvas
🟡 **Workaround**: Always calibrate at scale 1.0
🟢 **Fix**: Code changes above (4 changes needed)

Let me know if you want me to apply these changes automatically!

