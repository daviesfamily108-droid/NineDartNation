# Auto-Detection Testing Checklist

## Pre-Test Setup

- [ ] App is running: `npm run dev`
- [ ] Navigate to: `http://localhost:5173/calibrate`
- [ ] Dartboard visible in camera
- [ ] Good lighting conditions
- [ ] Browser developer console open (F12)

## Phase 1: Basic Functionality

### Test 1.1: Snap in Center
- [ ] Click purple "Snap & Detect" button
- [ ] Board should be detected
- [ ] Check console for: "Board detected"
- [ ] Verify: Confidence shows 75%+ ✅
- [ ] Verify: Error shows 2-3px ✅
- [ ] Message should be positive ✅

### Test 1.2: Snap in Top-Left Corner
- [ ] Move dartboard to top-left corner of frame
- [ ] Click "Snap & Detect"
- [ ] Should detect (was failing before)
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: 2-3px error ✅

### Test 1.3: Snap in Top-Right Corner
- [ ] Move dartboard to top-right corner
- [ ] Click "Snap & Detect"
- [ ] Should detect
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: 2-3px error ✅

### Test 1.4: Snap in Bottom-Left Corner
- [ ] Move dartboard to bottom-left corner
- [ ] Click "Snap & Detect"
- [ ] Should detect
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: 2-3px error ✅

### Test 1.5: Snap in Bottom-Right Corner
- [ ] Move dartboard to bottom-right corner
- [ ] Click "Snap & Detect"
- [ ] Should detect
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: 2-3px error ✅

## Phase 2: Distance Tests

### Test 2.1: Board Very Close
- [ ] Move camera very close to board
- [ ] Click "Snap & Detect"
- [ ] Should detect (was failing before)
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: Reasonable error ✅

### Test 2.2: Board Normal Distance
- [ ] Move to normal throwing distance
- [ ] Click "Snap & Detect"
- [ ] Should detect
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: 2-3px error ✅

### Test 2.3: Board Far Away
- [ ] Move camera far from board
- [ ] Click "Snap & Detect"
- [ ] Should detect (was failing before)
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: Reasonable error ✅

## Phase 3: Lighting Tests

### Test 3.1: Bright Lighting
- [ ] Move to bright area (window/lamp light)
- [ ] Click "Snap & Detect"
- [ ] Should detect
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: Error acceptable ✅

### Test 3.2: Normal Lighting
- [ ] Move to typical room lighting
- [ ] Click "Snap & Detect"
- [ ] Should detect
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: 2-3px error ✅

### Test 3.3: Dim Lighting
- [ ] Move to dim area
- [ ] Click "Snap & Detect"
- [ ] Should detect (was failing before)
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: Reasonable error ✅

## Phase 4: Confidence Verification

### Test 4.1: Confidence Scale
- [ ] All tests should show 75%+ confidence
- [ ] No test should show below 60% ✅
- [ ] Confidence should be realistic ✅

### Test 4.2: Error Measurement
- [ ] Most tests: 2-3px error ✅
- [ ] All tests: Error < 5px ✅
- [ ] Reasonable given camera quality ✅

### Test 4.3: Success Rate
- [ ] Count successful detections (out of 12 tests above)
- [ ] Should be: 10+ out of 12 (83%+) ✅
- [ ] Improvement from before: Yes ✅

## Phase 5: Scoring Accuracy

### Test 5.1: Auto-Detect + Throw Darts
1. Click "Snap & Detect" with board in position
2. Let it auto-calibrate (don't manually adjust)
3. If auto-detect fails, manually click 5 points
4. Throw 3 darts at board
5. Record actual positions (mentally note where they landed)
6. Verify scores match actual dart positions
   - [ ] Dart 1: Score correct ✅
   - [ ] Dart 2: Score correct ✅
   - [ ] Dart 3: Score correct ✅

### Test 5.2: Repeat with Different Position
1. Move board to different position
2. Click "Snap & Detect"
3. Throw 3 darts
4. Verify scores are accurate
   - [ ] All scores correct ✅

### Test 5.3: Repeat in Different Lighting
1. Change lighting condition
2. Click "Snap & Detect"
3. Throw 3 darts
4. Verify scores are accurate
   - [ ] All scores correct ✅

## Phase 6: Edge Cases

### Test 6.1: Board Partially Out of Frame
- [ ] Position board so only 80% is visible
- [ ] Click "Snap & Detect"
- [ ] Should still detect (was marginal before)
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: Reasonable error ✅

### Test 6.2: Board at Angle
- [ ] Tilt board at 45° angle
- [ ] Click "Snap & Detect"
- [ ] Should detect (homography handles this)
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: Reasonable error ✅

### Test 6.3: Board with Shadows
- [ ] Create shadows across board
- [ ] Click "Snap & Detect"
- [ ] Should detect (more tolerant now)
- [ ] Verify: 75%+ confidence ✅
- [ ] Verify: Reasonable error ✅

## Phase 7: Regression Tests

### Test 7.1: Manual 5-Click Mode Still Works
- [ ] Click first point (rim)
- [ ] Click second point (rim)
- [ ] Click third point (rim)
- [ ] Click fourth point (rim)
- [ ] Click fifth point (bull)
- [ ] Should calibrate successfully ✅
- [ ] Throw darts, verify scores ✅

### Test 7.2: Previous Calibrations Still Work
- [ ] Test with board that was calibrated before
- [ ] Load previous calibration (if stored)
- [ ] Throw darts, verify scores ✅
- [ ] No regression ✅

## Summary Report

```
Phase 1 (Basic):        ___ / 5 tests passed
Phase 2 (Distance):     ___ / 3 tests passed
Phase 3 (Lighting):     ___ / 3 tests passed
Phase 4 (Confidence):   ___ / 3 tests passed
Phase 5 (Accuracy):     ___ / 3 tests passed
Phase 6 (Edge Cases):   ___ / 3 tests passed
Phase 7 (Regression):   ___ / 2 tests passed

TOTAL:                  ___ / 22 tests passed
SUCCESS RATE:           ___% (should be 90%+)
```

## Key Metrics to Track

1. **Confidence Range**
   - Expected: All 75%+
   - Actual: _____
   - ✅ / ❌

2. **Error Range**
   - Expected: 2-5px
   - Actual: _____
   - ✅ / ❌

3. **Success Rate**
   - Expected: 85%+
   - Actual: ___% 
   - ✅ / ❌

4. **Position Independence**
   - Expected: Works anywhere
   - Actual: ✅ / ❌

5. **Lighting Robustness**
   - Expected: All conditions
   - Actual: ✅ / ❌

## Issues Found

If any issues, record them here:

```
Issue 1: _______________
Severity: High / Medium / Low
Details: _______________
Reproducible: Yes / No

Issue 2: _______________
Severity: High / Medium / Low
Details: _______________
Reproducible: Yes / No
```

## Sign-Off

- [ ] All 22 tests completed
- [ ] 90%+ success rate achieved
- [ ] No high-severity issues
- [ ] Ready for production deployment
- [ ] Tested by: _______________ Date: ______

---

## Notes

**Confidence Interpretation:**
- 75-85%: Good detection, standard accuracy
- 85-95%: Excellent detection, very accurate
- 95%+: Perfect detection, maximum accuracy

**Error Interpretation:**
- 2-3px: Ideal (normal precision limit)
- 3-4px: Good (acceptable)
- 4-5px: Acceptable (still usable)
- 5px+: Marginal (may need adjustment)

**Success Criteria:**
- Confidence: 75%+ ✅
- Error: < 5px ✅
- Score Accuracy: 100% ✅
- Works at all positions ✅
- Works in all normal lighting ✅

If all above achieved: **READY FOR PRODUCTION** 🚀
