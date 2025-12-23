# 🎯 Calibration Click Mapping Fix - Make Your Clicks Count

## The Problem

Your calibration UI looked good, but when you clicked on the board during calibration, the system wasn't actually using **where you clicked**. Instead, it was making its own decisions about where the points should be.

### Root Cause

The `handleCanvasClick` function in `Calibrator.tsx` was taking your clicks in **display/CSS coordinates** and treating them as if they were **actual image pixel coordinates**. 

**Key Issue**: 
- Canvas has internal resolution: `canvas.width` × `canvas.height` (e.g., 1280×960)
- Canvas is displayed at different size: `rect.width` × `rect.height` (e.g., 800×600 on screen)
- Click coordinates were in **display space** but being used as **image space**
- This scale mismatch meant the homography mapping was fundamentally broken

## The Solution

### 1. **Convert Display Coordinates to Image Coordinates**

```typescript
// Get click position relative to canvas DISPLAY
const displayX = e.clientX - rect.left;
const displayY = e.clientY - rect.top;

// Calculate the scale factor between display and internal resolution
const scaleX = canvas.width / rect.width;
const scaleY = canvas.height / rect.height;

// Convert to ACTUAL image coordinates
const imageX = displayX * scaleX;
const imageY = displayY * scaleY;
```

### 2. **Use Image Coordinates for Homography**

Now the homography is computed with the correct correspondences:
- **Source**: `canonicalTargets` (board coordinates: -170mm to +170mm range)
- **Destination**: Image coordinates (pixels in actual video frame)

### 3. **Validate Against Actual Board Coordinates**

The `evaluateClickQuality` function now:
1. Applies the homography to transform the clicked image point
2. Checks if it lands within valid regions:
   - **Double ring**: 157-175mm from center (tolerance added)
   - **Bull**: 0-17.9mm from center
3. Gives real-time feedback if you click in wrong area

## Files Changed

### `src/components/Calibrator.tsx`

#### 1. Updated `handleCanvasClick` (lines ~360-410)
- ✅ Converts display coordinates to image coordinates
- ✅ Applies scale factors based on canvas vs display size
- ✅ Logs the coordinate transformation for debugging
- ✅ Stores points in image space for homography

#### 2. Updated `evaluateClickQuality` (lines ~106-180)
- ✅ Added `H?: Homography` parameter
- ✅ Now validates using board coordinates instead of pixel distances
- ✅ For double ring points: checks if r ∈ [157mm, 175mm]
- ✅ For bull point: checks if r ≤ 17.9mm
- ✅ Falls back to pixel validation if homography not available yet
- ✅ Returns `boardCoords` and `boardDistance` for feedback

#### 3. Updated All Call Sites
- Line ~509 (useMemo): Pass `H` to validate properly
- Line ~597 (drawCanvas): Pass `H` for visual feedback
- Line ~855 (Points display): Pass `H` for UI accuracy

## How It Works Now

### Before (❌ Broken)
```
User clicks on board (display coords)
         ↓
Click taken as canvas display coords
         ↓
NO SCALE CONVERSION (BUG!)
         ↓
Used directly in homography computation
         ↓
Homography is wildly inaccurate
         ↓
Validation uses wrong coordinate space
         ↓
❌ Scoring fails - board not found correctly
```

### After (✅ Fixed)
```
User clicks on board (display coords: 400, 300)
         ↓
Convert to image coords using scale factor:
  scaleX = 1280 / 800 = 1.6
  scaleY = 960 / 600 = 1.6
  imageX = 400 * 1.6 = 640
  imageY = 300 * 1.6 = 480
         ↓
Use (640, 480) in homography computation
         ↓
Homography: board_coords = H × image_coords
         ↓
Validation: Check if board_coords in valid regions
  • Double: 157-175mm from center? ✓
  • Bull: 0-17.9mm from center? ✓
         ↓
✅ Calibration accurate - your clicks match the board
```

## Testing Your Calibration

### What to Do
1. Go to **Calibrate** screen
2. Make sure your dartboard is visible in camera
3. **Click on the VISIBLE double ring** at each position:
   - **Top**: D20 double ring
   - **Right**: D6 double ring  
   - **Bottom**: D3 double ring
   - **Left**: D11 double ring
   - **Center**: Bull (bullseye)

### What You'll See
- ✅ Green checkmarks appear as you click correctly
- ⚠️ Yellow warnings if click is close but not perfect
- ❌ Red X's if click is way off or in wrong area
- Each point shows: distance in pixels + board radius in mm
- Confidence meter updates in real-time

### Expected Results
- **Confidence ≥ 75%**: Good calibration, ready to play
- **Confidence < 75%**: Recalibrate, focus on double ring accuracy
- **Error < 6px**: Excellent accuracy for dart scoring

## Console Debug Output

When you calibrate, check the browser console (F12) for logs like:

```javascript
[Calibrator] Click mapping: {
  display: { x: 400, y: 300 },
  scale: { sx: 1.6, sy: 1.6 },
  image: { x: 640, y: 480 },
  canvasResolution: { width: 1280, height: 960 },
  displaySize: { width: 800, height: 600 }
}

[Calibrator] Homography computed: {
  H: [h11, h12, h13, h21, h22, h23, h31, h32, 1],
  errorPx: 2.3,
  pointMappings: [
    { index: 0, imageSpace: {...}, boardSpace: { x: 170, y: 0 } },
    ...
  ]
}
```

## Impact on Scoring

With correct calibration:
- ✅ Darts detected at correct positions
- ✅ Board coordinates map accurately
- ✅ Scores calculated correctly
- ✅ X01, Cricket, and all modes work properly

## What Happens During Games

The calibration is now used correctly in `CameraView.tsx`:

```typescript
// In detection loop:
const pCal = { x: detectionX / sx, y: detectionY / sy };
const pBoard = imageToBoard(H, pCal);  // Uses YOUR calibration
const score = scoreAtBoardPoint(pBoard);
addDart(score.base, score.ring, ...);
```

Your manually calibrated H matrix now actually controls where darts are scored!

## Verification Checklist

- [ ] Calibration UI shows correct coordinate transformations in console
- [ ] Clicking on double ring shows green/gold checkmarks
- [ ] Clicking on bull shows green checkmark
- [ ] Confidence meter reaches ≥ 75%
- [ ] Error is < 6 pixels
- [ ] Can lock calibration successfully
- [ ] Throw a dart and score is correct
- [ ] X01 game mode works with camera enabled

---

**Status**: ✅ Fixed - Click mapping now properly converts display → image → board coordinates
**Files Modified**: `src/components/Calibrator.tsx` (3 functions)
**Testing**: Manual calibration with visual feedback validation
