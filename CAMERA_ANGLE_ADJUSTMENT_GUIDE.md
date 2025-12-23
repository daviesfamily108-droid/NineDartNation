# Camera Angle Adjustment Guide

## The Problem Solved ✅

Previously, calibration only worked when the camera was aimed **straight at the dartboard**. Now you can calibrate from **ANY angle** - whether the camera is:
- Mounted to the side (45°, 60°, 90°)
- Tilted from above or below
- Any non-front-facing position

## How It Works

1. **Auto-Detection**: When you lock calibration, the system automatically detects how your board is oriented relative to the camera using the 4 double-ring calibration points
2. **Rotation Angle (theta)**: Stored as radians, displayed as degrees for easy understanding
3. **Sector Offset**: Fine-tunes the sector mapping if there's any remaining rotation mismatch

## Step-by-Step: Calibrating from an Angle

### 1. **Position Your Camera at an Angle** 
Example: Mount it 45° to the side, or above the board
- Make sure the **entire dartboard is visible** in the frame
- The board doesn't need to be straight-on

### 2. **Go to Calibrate Tab & Click 5 Points**
Same as before:
- D20 (top)
- D6 (right)  
- D3 (bottom)
- D11 (left)
- Bull (center)

Try to get error < 3px (just like normal calibration)

### 3. **Lock Calibration**
- Click "🔒 Lock Calibration"
- The angle adjustment panel appears automatically

### 4. **Review Auto-Detected Angle**
The panel shows:
- **Board Rotation**: The angle the system detected
  - Shows in degrees (e.g., "-45.2°" = rotated 45° counter-clockwise)
  - ✓ "Camera is front-facing" = already straight (0°)
  - "Camera is rotated X° clockwise/counter-clockwise" = angled camera

### 5. **Optional: Fine-Tune with Sliders**
If darts still score wrong sections after testing:

**Rotation Slider** (-180° to +180°)
- Adjust if sectors are consistently off-by-X
- Example: If D20 always scores D11, rotate the slider

**Sector Fine-Tune** (-5 to +5 sectors)
- Fine-grained adjustment if you're still 1-2 sectors off
- Usually leave at 0 (automatic)

### 6. **Test with One Dart**
- Throw a dart at D20
- Check the console debug output (press F12)
- Look at the pBoard coordinates and scored value
- If correct → you're done! ✅
- If wrong → adjust sliders (step 5) and test again

## What Gets Saved

The calibration now stores:
```javascript
{
  H: Homography,           // Calibration matrix (same as before)
  theta: 0.785398,         // Board rotation in radians (-π to π)
  sectorOffset: 0,         // Sector adjustment (integer 0-19)
  errorPx: 2.1,            // Calibration error (same as before)
  locked: true
}
```

All three values work together:
- **H** = maps board coords to image coords (from calibration)
- **theta** = rotation correction (auto-detected from board angle)
- **sectorOffset** = fine-tuning (usually 0)

## Real-World Examples

### Example 1: Side-Mounted Camera (90° angle)
```
Calibrate: Click 5 points (dartboard is side-view)
Lock calibration
Panel shows: "Camera is rotated 90° clockwise"
Rotation slider: Already at -90° (auto-detected)
Test: Throw at D20 → scores D20 ✓
Done!
```

### Example 2: Camera Above at 45°
```
Calibrate: Click 5 points (dartboard is angled up-left)
Lock calibration
Panel shows: "Camera is rotated 45° counter-clockwise"  
Rotation slider: At 45°
Test: Throw → scores wrong sector (e.g., off by 3)
Fine-tune: Move Sector slider to +3
Test again: Scores correctly ✓
```

### Example 3: Multiple Players, Different Heights
```
Player 1 (tall): Calibrates from above → theta = -20°
Player 2 (short): Calibrates from below → theta = +30°
Each gets their own calibration saved in history
When playing, select the matching calibration
Perfect accuracy for all! ✓
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| After lock, rotation shows 0° but still scores wrong | Your calibration might have high error. Re-calibrate more carefully (get < 2px error) |
| Darts score but wrong sectors consistently | Use Sector Fine-Tune slider to adjust by the offset amount |
| Sectors still wrong after adjusting both sliders | Re-calibrate completely - calibration error might be too high |
| Panel doesn't appear after locking | Check browser console for errors. Make sure H matrix was computed |

## Advanced: Understanding the Math

**theta** (radians) = rotation of board relative to camera
- 0 = camera sees board straight-on
- π/4 (45°) = board is rotated 45° counter-clockwise
- -π/2 (-90°) = board is rotated 90° clockwise (side view)

When scoring:
```
angle_in_board_space = angle_in_camera_space + theta
sector = map(angle_in_board_space)
```

This happens automatically in `scoreFromImagePoint()` which receives theta.

## Benefits

✅ **One calibration per unique angle** - save multiple in history  
✅ **Flexible player positioning** - everyone can see the board clearly  
✅ **Better accuracy** - angle is mathematically corrected  
✅ **Simple UI** - just two sliders for fine-tuning  
✅ **Auto-detection** - system finds angle automatically  

## See Also

- `SCORING_DIAGNOSTIC_GUIDE.md` - Debug scoring issues
- `DARTBOARD_DETECTION_FIX_COMPLETE.md` - Calibration boundary fixes
- `src/utils/vision.ts` - Technical implementation (detectBoardOrientation, scoreAtBoardPointTheta)

---

**Ready to calibrate from any angle? Let's go! 🎯**
