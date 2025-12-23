# 📊 AUTOSCORE ACCURACY MONITORING & DEBUGGING GUIDE

## Console Logging for Tracking Autoscore Accuracy

The app already has detailed logging. Here's what to look for in the browser console (F12 → Console tab).

### Detection Phase Logs

When a dart is detected, you should see:
```
[CAMERA] detected raw 0.92 {x: 523, y: 411}
```

**What This Means:**
- `detected raw` = Raw detection from DartDetector
- `0.92` = Confidence score (0-1, where 1 = perfect)
- `{x: 523, y: 411}` = Pixel coordinates in video

**Accuracy Check:**
- ✅ Confidence > 0.75 = Good
- ⚠️ Confidence 0.6-0.75 = Marginal (might work)
- ❌ Confidence < 0.6 = Too low, won't score

---

### Coordinate Transform Logs

After detection, you should see:
```
[CAMERA] Apply homography: {x: 12.5, y: -0.3}
```

**What This Means:**
- Applied H matrix to transform pixel → board coordinates
- `{x: 12.5, y: -0.3}` = Position on dartboard in mm
- Origin (0,0) = Board center
- x increases to the right, y increases away from you

**Accuracy Check:**
- ✅ Coordinates on dartboard (distance from center < 150mm)
- ✅ Visual location matches calculated position
- ❌ Coordinates way off = Calibration error

---

### Scoring Calculation Logs

When score is calculated:
```
[CAMERA] scoreFromImagePoint result: {value: 40, ring: "DOUBLE", sector: 20}
```

**What This Means:**
- `value: 40` = Point value (between 1-50)
- `ring: "DOUBLE"` = Which ring (SINGLE/DOUBLE/TRIPLE/BULL/INNER_BULL)
- `sector: 20` = Sector number (1-20)

**Accuracy Check:**
- ✅ Ring matches visual location
  - D20 should show `ring: "DOUBLE"`
  - T20 should show `ring: "TRIPLE"`
  - S20 should show `ring: "SINGLE"`
- ✅ Sector matches angle (1-20)
- ✅ Value = base × multiplier

---

### Game State Update Logs

When visit is completed:
```
CameraView: callAddVisit 105 3 { visitTotal: 105, ... }
```

**What This Means:**
- `callAddVisit 105 3` = Score is 105 with 3 darts
- `visitTotal: 105` = Total for this visit

**Accuracy Check:**
- ✅ Score = sum of 3 darts
- ✅ Darts = 3 (for 3-dart visits)
- ✅ Callback is invoked (NOW FIXED ✅)

---

### Expected Complete Log Sequence

**When you throw 3 darts (D20, T15, D10):**

```
[CAMERA] detected raw 0.88 {x: 523, y: 411}        ← 1st dart detected
[CAMERA] Apply homography: {x: 12.5, y: -0.3}      ← Transformed
[CAMERA] scoreFromImagePoint result: {value: 40, ring: "DOUBLE", sector: 20}  ← Scored as D20

[CAMERA] detected raw 0.91 {x: 445, y: 388}        ← 2nd dart detected
[CAMERA] Apply homography: {x: -8.2, y: 3.1}       ← Transformed
[CAMERA] scoreFromImagePoint result: {value: 45, ring: "TRIPLE", sector: 15}  ← Scored as T15

[CAMERA] detected raw 0.85 {x: 567, y: 422}        ← 3rd dart detected
[CAMERA] Apply homography: {x: 14.1, y: -0.8}      ← Transformed
[CAMERA] scoreFromImagePoint result: {value: 20, ring: "DOUBLE", sector: 10}  ← Scored as D10

CameraView: callAddVisit 105 3 { visitTotal: 105 }  ← Visit submitted!
```

**Success Indicators:**
- ✅ All 3 darts logged with confidence > 0.75
- ✅ All 3 coordinates transformed successfully
- ✅ All 3 scores calculated correctly
- ✅ callAddVisit called with total 105
- ✅ Scoreboard updates: 501 - 105 = 396

---

## Accuracy Measurement Method

### Manual Accuracy Test

**Setup:**
1. Start X01 501 game
2. Enable camera
3. Have console open (F12)

**Test Procedure:**

```
Throw Dart 1: Aim for D20 (top of board)
  Expected: value=40, ring="DOUBLE", sector=20
  Actual: [copy from console]
  ✅ Correct? 

Throw Dart 2: Aim for T15
  Expected: value=45, ring="TRIPLE", sector=15
  Actual: [copy from console]
  ✅ Correct? 

Throw Dart 3: Aim for S6
  Expected: value=6, ring="SINGLE", sector=6
  Actual: [copy from console]
  ✅ Correct? 

Expected Total: 40 + 45 + 6 = 91
Actual callAddVisit score: [copy from console]
✅ Matches?

Expected Remaining: 501 - 91 = 410
Actual Scoreboard: [screenshot]
✅ Matches?
```

**Repeat Test:**
Do this test 10 times and count:
- Successes (all 3 darts correct)
- Accuracy % = (Successes / 10) × 100%

**Target:** 95%+ accuracy (9-10 out of 10 successful)

---

## Common Accuracy Issues & Diagnostics

### Issue 1: "Detected But Score Not Updated"

**Diagnosis Steps:**
1. Open console (F12 → Console)
2. Look for `callAddVisit` logs
3. Check if log appears
   - ✅ Yes → onAddVisit should be called
   - ❌ No → Detection didn't reach 3 darts

**Console Output:**
```
[CAMERA] detected raw 0.92 {x: 523, y: 411}
[CAMERA] Apply homography: {x: 12.5, y: -0.3}
[CAMERA] scoreFromImagePoint result: {value: 40, ring: "DOUBLE", sector: 20}
    [... missing callAddVisit ...]
    ↑ NO LOG = Problem!
```

**Solutions:**
- [ ] Check if 3 darts actually detected (look for 3 detection logs)
- [ ] If only 1-2 darts detected: improve lighting
- [ ] If 3 detected but no callAddVisit: check game mode

---

### Issue 2: "Score Calculated Incorrectly"

**Example:**
```
You aimed for: D20 (should be 40 points)
Console shows: value=6, ring="SINGLE", sector=6
Result: ❌ WRONG
```

**Diagnosis:**
```
Is it a detection problem?
  └─ Detected coordinates: {x: 523, y: 411}  ← Too far left/right?

Is it a transformation problem?
  └─ Transformed to: {x: 12.5, y: -0.3}  ← On board at all?

Is it a scoring problem?
  └─ scoreFromImagePoint says sector=6 instead of sector=20
```

**Solutions:**
1. Check coordinates visually match board location
2. Recalibrate (all points must be ≤ 6px error)
3. Verify board dimensions in vision.ts
4. Check board rotation (theta calculation)

---

### Issue 3: "Darts Not Detected At All"

**Console Shows:** Nothing logged for detection

**Diagnosis:**
```
Is DartDetector even running?
  └─ Check: Is camera feed showing in CameraView?
     └─ If not: Camera isn't starting
  └─ Check: Are darts visible in feed?
     └─ If not: Too dark or wrong camera

Is confidence too low?
  └─ Look for logs but check confidence
  └─ If confidence < 0.75: detection is weak
```

**Solutions:**
1. [ ] Verify camera feed is displaying (should see live video)
2. [ ] Improve lighting (bright, even, consistent)
3. [ ] Check dart contrast with background
4. [ ] Verify camera focus (should be sharp)
5. [ ] Lower confidence threshold temporarily
   ```typescript
   // In CameraView.tsx line 56:
   const AUTO_COMMIT_CONFIDENCE = 0.65;  // Instead of 0.75
   ```

---

### Issue 4: "Score Calculated But Scoreboard Doesn't Update"

**Console Shows:** callAddVisit is logged but scoreboard stays same

**Diagnosis:**
```
Is onAddVisit callback being invoked?
  └─ Check game mode
  └─ X01: should call commitManualVisitTotal ✅ (JUST FIXED)
  └─ Cricket: should call addCricketAuto

Is game state actually updating?
  └─ Check matchState in store
  └─ Check player.remaining changed

Is Zustand triggering re-render?
  └─ Should cause React to re-render scoreboard
```

**Solutions:**
1. [ ] Verify onAddVisit is wired (X01 modes JUST FIXED)
2. [ ] Check browser console for errors
3. [ ] Verify commitManualVisitTotal is called
4. [ ] Force refresh (Ctrl+Shift+R) to clear caches
5. [ ] Check if game state is even being updated

---

## Debug Console Commands

You can run these in browser console (F12 → Console) to inspect state:

### Check Game State

```javascript
// View current player score
console.log(document.querySelector('[data-testid="player-remaining"]')?.textContent)

// Check if match is in progress
const { useMatch } = await import('./src/store/match');
console.log(useMatch.getState().inProgress)

// View all players
console.log(useMatch.getState().players.map(p => ({
  name: p.name,
  remaining: p.legs[0]?.totalScoreRemaining
})))
```

### Check Calibration

```javascript
// View calibration H matrix
const { useCalibration } = await import('./src/store/calibration');
const cal = useCalibration.getState();
console.log('H Matrix:', cal.H);
console.log('Error (px):', cal.errorPx);
console.log('Image size:', cal.imageSize);
```

### Check Detection Stats

```javascript
// Monitor detection in real-time
// Just look at console logs and count:
// - Total detections
// - Detections with confidence > 0.75
// - Detections that resulted in scoring
```

---

## Logging Checklist for 100% Accuracy

When verifying accuracy, ensure you see these logs for EACH dart:

- [ ] `[CAMERA] detected raw X.XX {x: N, y: N}` ← Detection with high confidence
- [ ] `[CAMERA] Apply homography: {x: N.N, y: N.N}` ← Transformation successful
- [ ] `[CAMERA] scoreFromImagePoint result: {value: N, ring: "...", sector: N}` ← Correct score
- [ ] `CameraView: callAddVisit N 3 {...}` ← Visit completed (for 3rd dart)

If you see all 4 for each of 3 darts, accuracy is confirmed!

---

## Real-Time Monitoring Spreadsheet

Create a test log like this:

| Test # | Dart 1 | Dart 2 | Dart 3 | Total | Expected | Match | Notes |
|--------|--------|--------|--------|-------|----------|-------|-------|
| 1 | D20(40) | T15(45) | S6(6) | 91 | 91 | ✅ | Good |
| 2 | D20(40) | T20(60) | S10(10) | 110 | 110 | ✅ | Good |
| 3 | T20(60) | D10(20) | S5(5) | 85 | 85 | ✅ | Good |
| 4 | ... | ... | ... | ... | ... | ... | ... |
| 5 | ... | ... | ... | ... | ... | ... | ... |
| 6 | ... | ... | ... | ... | ... | ... | ... |
| 7 | ... | ... | ... | ... | ... | ... | ... |
| 8 | ... | ... | ... | ... | ... | ... | ... |
| 9 | ... | ... | ... | ... | ... | ... | ... |
| 10 | ... | ... | ... | ... | ... | ... | ... |

**Summary:**
- Total Tests: 10
- Successes: 9
- Failures: 1
- **Accuracy: 90%**
- Action: Need to improve if < 95%

---

## Performance Monitoring

### Detection Speed

**Measurement:** Time from dart landing to detection logged

```
Dart lands at: 12:34:56.100
Console log appears: 12:34:56.245
Latency: 145ms ✅ (good)

Target: < 200ms
```

**Why This Matters:**
- < 100ms = instant feedback
- 100-200ms = acceptable
- > 200ms = noticeable delay
- > 500ms = poor user experience

### Game State Update Speed

**Measurement:** Time from callAddVisit to scoreboard update

```
callAddVisit logged: 12:34:56.500
Scoreboard changes: 12:34:56.650
UI Update Latency: 150ms ✅ (good)

Target: < 500ms
```

---

## Accuracy Improvement Plan

If accuracy < 95%, follow this:

### Step 1: Identify Problem
- [ ] Is detection weak (confidence < 0.7)?
- [ ] Are coordinates off (transformed far from visual location)?
- [ ] Is scoring wrong (correct position, wrong score)?
- [ ] Is game state not updating (score calculated, UI doesn't change)?

### Step 2: Fix Root Cause

**If Detection Weak:**
1. Improve lighting
2. Increase contrast (different dart color?)
3. Adjust DartDetector threshold (lower = more sensitive)
4. Clean camera lens

**If Coordinates Off:**
1. Recalibrate all 5 points with high precision
2. Ensure all points ≤ 6px error
3. Check if board moved after calibration
4. Verify sx/sy scaling is correct

**If Scoring Wrong:**
1. Check board dimensions are correct
2. Verify sector offset calculation
3. Ensure board rotation (theta) is correct
4. Test with known board positions

**If Game State Not Updating:**
1. Check browser console for errors
2. Verify onAddVisit callback is wired (FIXED for X01 ✅)
3. Check if commitManualVisitTotal is being called
4. Verify game mode is correct

### Step 3: Test & Measure
- Run accuracy test (10 throws)
- Measure accuracy %
- If still < 95%: repeat steps 1-2

---

## Summary

**100% Accuracy requires:**
1. ✅ Good detection (confidence > 0.75)
2. ✅ Accurate transformation (calibration error ≤ 6px)
3. ✅ Correct scoring (matches visual board location)
4. ✅ Game state update (callback properly invoked - FIXED)
5. ✅ UI reflection (scoreboard updates)

**Current Status:** ✅ Foundation is solid, just need to verify in your environment!

Use this guide to measure, diagnose, and improve accuracy to 100%!
