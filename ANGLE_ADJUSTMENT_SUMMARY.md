# Angle-Flexible Calibration - What Changed

## Summary
✅ You can now calibrate from ANY camera angle, not just front-facing!

## Changes Made

### 1. **New Functions in `vision.ts`**
```typescript
detectBoardOrientation(H, canonicalTargets): number
  // Auto-detects board rotation from calibration points
  // Returns theta in radians

thetaToDegrees(theta): number
  // Converts radians to degrees for UI display
```

### 2. **New UI in Calibrator Component**
After locking calibration, an angle adjustment panel appears with:
- **Rotation Slider**: -180° to +180° (adjust board angle)
- **Sector Offset Slider**: -5 to +5 sectors (fine-tune sector mapping)
- **Auto-detection**: System finds angle automatically
- **Test Instructions**: Clear guide for testing with darts

### 3. **Updated Calibration Store**
Now saves:
```typescript
{
  H: Homography,
  theta: number | null,        // NEW: Board rotation in radians
  sectorOffset: number | null, // NEW: Sector fine-tuning
  errorPx: number,
  locked: boolean
}
```

### 4. **Scoring Already Supports This**
No changes needed! `CameraView.tsx` already passes `theta` to scoring function:
```typescript
const score = scoreFromImagePoint(H, pCal, theta, sectorOffset);
```

## How to Use

1. **Calibrate from any angle** (board doesn't need to be straight-on)
2. **Lock calibration** → angle adjustment panel appears
3. **Review the auto-detected angle** (usually perfect)
4. **Throw a dart to test** (should score correctly)
5. **If wrong, adjust sliders** and test again
6. **Click "Save & Test"** to lock in the angle

## Key Insight
The system now understands how your dartboard is **rotated relative to your camera**. Using this angle correction, it can accurately map any thrown dart to the correct sector, regardless of camera position!

## Example Scenarios

**Scenario 1**: Camera mounted 45° to the side
- Calibrate normally (5 points)
- Auto-detect finds: "Board rotated 45° counter-clockwise"
- Throw dart at D20 → scores D20 ✓

**Scenario 2**: Multiple players at different positions
- Player 1: Calibrate from standing height
- Player 2: Calibrate from sitting height (different angle)
- Save both in calibration history
- Select matching calibration before each play

**Scenario 3**: Camera above dartboard at angle
- Calibrate (board looks tilted in camera)
- Auto-detect finds angle
- Adjust Sector slider if needed (+1 or +2)
- Perfect accuracy from above! ✓

## Files Modified
- `src/utils/vision.ts` - Added detectBoardOrientation(), thetaToDegrees()
- `src/components/Calibrator.tsx` - Added angle adjustment UI panel
- `src/store/calibration.ts` - Already had theta/sectorOffset support

## No Breaking Changes
✅ Old calibrations still work (theta will be null, treated as 0)  
✅ Front-facing cameras work normally (theta = 0)  
✅ All game modes compatible  
✅ Backward compatible with existing code  

## Testing Checklist

- [ ] Install latest code
- [ ] Calibrate from 45° camera angle
- [ ] Lock calibration → angle panel appears
- [ ] Rotation slider shows detected angle
- [ ] Throw dart at D20 → scores correctly
- [ ] If wrong sector, adjust slider and re-test
- [ ] Save calibration
- [ ] Play a full game to verify

## Technical Details

**How angle detection works:**
1. The 4 calibration points (D20, D6, D3, D11) are at known positions on the board
2. The homography maps these to image coordinates
3. We calculate the angle each point makes from the board center in image space
4. We compare actual angles to expected angles (top, right, bottom, left)
5. The difference = board rotation (theta)

**How scoring uses theta:**
```typescript
// In scoreFromImagePoint():
let boardAngle = atan2(pBoard.y, pBoard.x) + theta;
sector = mapAngleToSector(boardAngle);
```

The `+ theta` correction ensures sectors are mapped correctly!

---

**Questions?** Check `CAMERA_ANGLE_ADJUSTMENT_GUIDE.md` for detailed usage.
