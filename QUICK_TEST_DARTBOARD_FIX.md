# Quick Start: Test the Dartboard Detection Fix

## Before You Start
- Ensure your dartboard is fully visible in the camera
- Calibrate the dartboard (if not already done)
- Check that calibration error is < 3px for best results

## 🧪 Quick Test Procedure

### Test 1: No Dart Throws (Should see NO scoring)
1. Open the game in 501 mode
2. Stand in front of the dartboard
3. **DO NOT throw** - just let the camera run for 5 seconds
4. **Expected:** No darts score
5. **If fails:** Adjust camera angle or lighting

### Test 2: Throw at D20 (Should score 20)
1. Pick up a dart
2. Throw it at the D20 (top of board)
3. **Expected:** Score shows "Double 20" or "Double 20"
4. **If fails:** Check if dart is visible in camera and board is fully in frame

### Test 3: Throw at Bull (Should score 50)
1. Throw at the bullseye
2. **Expected:** Score shows "Bull" or "50"
3. **If fails:** May need to re-calibrate the center point

### Test 4: Throw at Single Area (Should score single value)
1. Throw at a single-score area (e.g., outer ring at 20)
2. **Expected:** Score shows single number (e.g., "20")
3. **If fails:** Calibration may need adjustment

### Test 5: Background Movement (Should see NO scoring)
1. Keep camera running on dartboard
2. **Move your hand** in front of camera (not throwing)
3. **Expected:** No score update
4. **If fails:** Lighting might be causing reflections - adjust lights

### Test 6: Multiple Throws (Should accumulate correctly)
1. Throw first dart → should score
2. Throw second dart → score should add to first
3. Throw third dart → visit should complete
4. **Expected:** All three darts scored correctly
5. **If fails:** Some throws might not be detecting properly

## ✅ Success Criteria

All of these should happen:
- ✅ Real darts always detected and scored correctly
- ✅ No scoring when camera is idle
- ✅ No false scoring from background movement
- ✅ Accurate dart location (right sector, right ring)
- ✅ Consistent across multiple throws

## ❌ If Tests Fail

| Symptom | Solution |
|---------|----------|
| False scores when no dart thrown | Adjust camera lighting, reduce bright reflections |
| Darts not detected at all | Re-calibrate, check dartboard visibility in frame |
| Wrong location/value scored | Re-calibrate with better precision |
| Inconsistent (some detect, some don't) | Check dart contrast (dark darts on light board), re-calibrate |
| Background movement causes scoring | Reduce bright lights, check for reflections |

## 📍 Calibration Check

If tests are failing, **recalibrate** using this method:

1. Go to "Calibrate" tab
2. Click on 5 points in order:
   - **D20** (top) - Click outer edge of double ring
   - **D6** (right) - Click outer edge of double ring
   - **D3** (bottom) - Click outer edge of double ring
   - **D11** (left) - Click outer edge of double ring
   - **Bull** (center) - Click center of bull
3. Check error % in the UI:
   - **< 95%:** Excellent - ready to play
   - **80-95%:** Good - usable
   - **< 80%:** Needs adjustment - recalibrate
4. Click "Lock Calibration"

## 🎮 Ready to Play?

Once all tests pass:
1. Start a new game (501, Cricket, X01, etc.)
2. Throw darts and enjoy!
3. Scoring should be accurate and consistent

## 📞 Troubleshooting Help

**Problem:** Darts still not scoring correctly after fix
- **Check 1:** Is dartboard fully visible in camera frame?
- **Check 2:** Is calibration locked? (Check status button)
- **Check 3:** What's the calibration error? (Should be < 3px)
- **Check 4:** Are darts dark/high-contrast against the board?

**Problem:** Still getting false positives
- **Check 1:** Reduce room brightness or turn off bright lights
- **Check 2:** Check for reflections on dartboard or background
- **Check 3:** Move camera farther from any light sources

**Problem:** Some darts detect, some don't
- **Check 1:** Use darts with consistent color/contrast
- **Check 2:** Throw from consistent distance
- **Check 3:** Re-calibrate with better precision

## 📊 What Changed?

The detection system now:
- ✅ Only looks within the actual dartboard boundaries
- ✅ Requires larger/darker blobs to detect (filters noise)
- ✅ Validates detected darts are actually on the board
- ✅ Rejects background interference and reflections

**Result:** Much more accurate, no false positives!

## 🚀 Next Steps

1. Test with the procedure above
2. Play a full game (501 to 0)
3. Report back with results
4. If issues persist, we can adjust parameters further

---

**Happy darts! 🎯**
