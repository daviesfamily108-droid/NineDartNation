# 🚀 Calibration Click Mapping Fix - DEPLOYED

## What Was Wrong

Your calibration clicks weren't being properly mapped from the display screen to the actual video image coordinates. This meant:

1. **Canvas Display Size ≠ Image Resolution**
   - Your canvas might display at 800×600 pixels on screen
   - But the video frame is actually 1280×960 pixels
   - Clicks were being taken at display coordinates, NOT image coordinates

2. **Homography Was Wrong**
   - The homography matrix maps board coordinates → image coordinates
   - But if image coordinates are wrong (not scaled), the whole mapping fails
   - This broke all downstream dart detection and scoring

3. **Scoring Position Wrong**
   - Even with camera-detected darts, the homography couldn't map them correctly
   - The board position was found, but clicks weren't validated properly

## What's Fixed Now

### ✅ Coordinate Transformation Pipeline

```
User clicks at (400, 300) on display canvas
         ↓
Calculate scale factors:
  scaleX = canvas.width / displayRect.width
  scaleY = canvas.height / displayRect.height
         ↓
Transform to image coordinates:
  imageX = displayX * scaleX
  imageY = displayY * scaleY
         ↓
Use image coordinates in homography:
  boardCoords = applyHomography(H, imageCoords)
         ↓
Validate board coordinates:
  • For double points: radius 157-175mm? ✅
  • For bull: radius 0-17.9mm? ✅
         ↓
Real-time visual feedback + console logs
```

### ✅ Code Changes

**File**: `src/components/Calibrator.tsx`

#### 1. **`handleCanvasClick` function** (lines ~360-410)
- Calculates scale factors between canvas display size and actual image resolution
- Converts click from display coordinates to image coordinates  
- Uses image coordinates for homography computation
- Logs all transformations to console for debugging

```typescript
// Calculate scale factors
const scaleX = canvas.width / rect.width;
const scaleY = canvas.height / rect.height;

// Convert to image space
const imageX = displayX * scaleX;
const imageY = displayY * scaleY;

// Store for homography
const clickPointInImageSpace = { x: imageX, y: imageY };
```

#### 2. **`evaluateClickQuality` function** (lines ~106-180)
- Now accepts optional `Homography` parameter
- Applies homography to check actual board coordinates
- Validates double ring (157-175mm) and bull (0-17.9mm) positions
- Returns `boardCoords` and `boardDistance` for detailed feedback
- Falls back to pixel-based validation if homography not yet computed

```typescript
if (H) {
  const boardPoint = applyHomography(H, clickPoint);
  const r = Math.hypot(boardPoint.x, boardPoint.y);
  
  // Double ring: 157-175mm
  isValid = r >= 157 && r <= 175;
}
```

#### 3. **All Call Sites Updated**
- Line ~509: Pass `H || undefined` to `evaluateClickQuality`
- Line ~597: Pass `H || undefined` in canvas drawing
- Line ~855: Pass `H || undefined` in UI feedback

## How to Test

### Step 1: Open Calibration Screen
1. Go to http://localhost:5173
2. Click "Calibrate" button
3. Grant camera permission
4. You should see camera feed + target zones

### Step 2: Calibrate with 5 Points
Tap/click on the **visible double ring** at:
- **Top**: D20 (should show 20 at top)
- **Right**: D6 
- **Bottom**: D3
- **Left**: D11
- **Center**: Bullseye

### Step 3: Watch for Feedback
For each click, you should see:
- ✅ **Green checkmark** = Correct location (on double ring or bull)
- ⚠️ **Yellow warning** = Close but not perfect
- ❌ **Red X** = Wrong location or off board

### Step 4: Check Console
Open Developer Tools (F12) → Console tab:

You should see logs like:
```
[Calibrator] Click mapping: {
  display: { x: 425, y: 312 },
  scale: { sx: 1.6, sy: 1.6 },
  image: { x: 680, y: 499 },
  canvasResolution: { width: 1280, height: 960 },
  displaySize: { width: 800, height: 600 }
}

[Calibrator] Homography computed: {
  H: [array of 9 numbers],
  errorPx: 2.3,
  pointMappings: [
    { index: 0, imageSpace: {...}, boardSpace: { x: 170, y: 0 } },
    { index: 1, imageSpace: {...}, boardSpace: { x: 0, y: 120 } },
    ...
  ]
}
```

### Step 5: Verify Results
- ✅ Confidence meter shows ≥ 75%
- ✅ Error is < 6 pixels
- ✅ All 5 points show green checkmarks
- ✅ "Lock Calibration" button appears
- ✅ Click "Lock Calibration"

### Step 6: Test in Game Mode
1. Go to "Offline Play"
2. Start "X01 501" game
3. Enable camera in settings
4. **Throw a dart**
5. **Watch the camera view** - dart should be detected and scored correctly
6. **Check the scoreboard** - score should update (501 → remaining)

## Expected Behavior

### ✅ What Should Happen Now

| Step | Before (❌ Broken) | After (✅ Fixed) |
|------|------------------|-----------------|
| Click on double ring | Shown as valid even if off | Only valid if truly on double |
| Homography computed | Using wrong coordinates | Using correct image coordinates |
| Confidence score | Random/inconsistent | Accurate reflection of click quality |
| Dart detection in game | Wrong positions detected | Correct positions detected |
| Scoring | Darts score wrong sectors | Darts score correct sectors |

### 🧪 Test Case: D20 Double Ring

**What to do**:
1. Click on the **visible RED double ring** at the top (where D20 is)

**Before fix**:
- ❌ Might show as valid even if you clicked near but not on double
- ❌ Homography doesn't use real image coordinates
- ❌ Later, darts in game score wrong

**After fix**:
- ✅ Only shows valid if you click within 157-175mm of center
- ✅ Homography uses correct image coordinates
- ✅ Darts in game score D20 correctly

## Debugging if Issues Occur

### Console Check
If calibration isn't working:
1. Open F12 → Console
2. Look for "[Calibrator]" logs
3. Check the `scale` values:
   - Should be between 0.5 and 2.0
   - Should be same for both axes (or very close)
4. Check `boardCoords` in pointMappings:
   - Should be around ±170mm for double ring
   - Should be around 0mm for bull

### If Clicks Aren't Registering
1. Make sure canvas element receives clicks (not blocked by overlay)
2. Check that canvasRef.current exists (should say "Canvas updated to: {width, height}")
3. Verify video stream is actually playing

### If Homography Error is High (> 6px)
1. Try clicking more precisely on the actual rings
2. Make sure your board is square to camera (not tilted)
3. Make sure board is fully visible in frame
4. Try with better lighting

## Files Modified
- `src/components/Calibrator.tsx` - Fixed click mapping logic

## Status
✅ **DEPLOYED** - Ready for testing

## Next Steps
1. **Test calibration** with the steps above
2. **Verify dart scoring** works correctly in game mode
3. **Report any issues** with calibration accuracy

---

**Summary**: Your clicks now properly map from display → image → board coordinates. Calibration should be accurate and scoring should work correctly!
