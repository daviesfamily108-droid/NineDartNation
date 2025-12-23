# Ghost Darts Debug Guide

## What Are Ghost Darts?

A "ghost dart" is a detection that is marked as invalid and won't be scored in the match. This happens when ANY of these conditions fail:

```typescript
const isGhost = !onBoard || !tipInVideo || !pCalInImage || !calibrationGood;
```

## Why Darts Become Ghosts

### 1. **Calibration Not Locked** (`calibrationGood === false`)
This is the **most common reason** for ghost darts.

**What it means:**
- The calibration homography exists but hasn't been locked
- OR the calibration error exceeds 6 pixels (`errorPxVal > ERROR_PX_MAX`)

**How to fix:**
1. Go to Calibrator component
2. Check the "Lock Calibration" button/toggle
3. Ensure calibration error is shown as ≤ 6px
4. If error is high, recalibrate by clicking on the dartboard calibration points more accurately

**Debug:**
- In console, look for `locked: false` or `errorPxVal > 6` in the detection logs

### 2. **Dart Not on Board** (`onBoard === false`)
The dart detection is outside the dartboard's playable area.

**What it means:**
- The detected dart tip was mapped to board coordinates
- But the radius from board center is > 170mm (the outer edge of the double ring)

**Possible causes:**
- Homography is inverted or distorted
- Dart detector is picking up noise outside the board
- Calibration is bad (even if locked)

**How to fix:**
1. Recalibrate the board more carefully
2. Verify calibration by checking the overlay rings match the actual board
3. Check dart detector ROI (region of interest) is set correctly

**Debug:**
- In console, look for `onBoard: false`
- Check `pBoard` values - they should be within ±170mm from center for valid darts

### 3. **Dart Outside Video Frame** (`tipInVideo === false`)
The refined dart tip is outside the video bounds.

**What it means:**
- The dart detector found something but it's at the edge of the video
- Refinement might have pushed it outside

**How to fix:**
1. Ensure full dartboard is visible in video
2. Adjust camera position to center the board
3. Increase TIP_MARGIN_PX if legitimate darts are being rejected

**Debug:**
- In console, look for `tipInVideo: false`
- Check `tipRefined` coordinates vs `vwvh` (video dimensions)

### 4. **Point Outside Calibration Image** (`pCalInImage === false`)
The mapped calibration-space point is outside the image bounds.

**What it means:**
- The coordinate transformation resulted in a point outside the original calibration image
- This usually indicates a homography problem

**How to fix:**
1. Recalibrate using more accurate corner points
2. Ensure all 5 calibration points are within the board area
3. Check that calibration image size matches video dimensions

**Debug:**
- In console, look for `pCalInImage: false`
- Check `pCal` coordinates vs `imageSize`

## How to Debug Ghost Darts

### Step 1: Enable Debug Logging
Open browser console (F12 in most browsers) and look for logs like:

```
CameraView: detection details
{
  value: 20,
  ring: "SINGLE",
  calibrationGood: false,  ← Check this!
  locked: false,            ← Is calibration locked?
  errorPxVal: 8,            ← Is this > 6?
  tipInVideo: true,
  tipRefined: {x: 324, y: 456},
  vwvh: "640x480",
  pCalInImage: true,
  pCal: {x: 200, y: 280},
  imageSize: "640x480",
  isGhost: true,
  onBoard: false,           ← Is dart really off board?
  pBoard: {x: 500, y: 300}  ← Check if reasonable
}
```

### Step 2: Check Calibration Status
1. Lock the calibration
2. Verify error is ≤ 6px
3. Take a screenshot showing the overlay rings match the actual board

### Step 3: Verify Coordinate Spaces
Three coordinate spaces involved:
- **Video space**: Raw video frame pixels (0-640, 0-480 for example)
- **Calibration space**: Image space from calibration (same as video if no scaling)
- **Board space**: Millimeters from dartboard center

The conversion chain:
```
tipRefined (video) → pCal (calibration) → pBoard (board mm)
```

### Step 4: Check Homography Validity
If `pBoard` is null or has NaN/Infinity:
- The homography matrix might be singular
- Recalibrate completely

## Common Solutions

| Issue | Solution |
|-------|----------|
| `locked: false` | Click "Lock Calibration" button |
| `errorPxVal > 6` | Recalibrate more carefully |
| `onBoard: false` with reasonable pBoard values | Check board detection calibration |
| `pBoard: null` | Homography is invalid - recalibrate |
| `tipInVideo: false` | Reposition camera to see full board |
| Multiple "ghostly" darts | Calibration is bad - do full recalibration |

## Recent Improvements (Dec 6, 2025)

1. **Added `isPointOnBoard()` validation** - Strict checking that dart is within dartboard radius
2. **Improved `imageToBoard()` error handling** - Returns null if homography inversion fails
3. **Better debug logging** - Shows all relevant values for troubleshooting
4. **Removed 8mm margin** - Darts must be strictly within board (≤ 170mm radius)

## Testing Calibration Quality

Use the Calibrator component's verification mode:
1. Click on 5 dartboard points (corners and center)
2. System shows expected vs detected positions
3. Green checkmarks = calibration is good
4. Red X's = recalibrate those points

Expected error tolerance:
- Per-point error: ≤ 3mm on board
- Overall RMS error: ≤ 6 pixels in image space
