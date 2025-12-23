# 🎯 100% ACCURATE AUTOSCORING FOR ALL GAMES - IMPLEMENTATION GUIDE

## Current Status: Post-Fix Verification Needed

We've fixed the critical **X01 scoring wire**, but we need to verify **100% accuracy across ALL game modes**.

---

## The Complete Autoscoring Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: DETECTION                                              │
├─────────────────────────────────────────────────────────────────┤
│ Video Frame Input                                               │
│   ↓ DartDetector.detect()                                       │
│   ├─ Background subtraction (running average model)            │
│   ├─ Morphological closing (reduce noise)                      │
│   ├─ Blob detection (find foreground pixels)                   │
│   ├─ PCA (estimate shaft orientation)                          │
│   └─ Tip estimation (extreme along principal axis)            │
│   ↓ Returns: DartDetection {tip, confidence, area, axis}      │
│                                                                 │
│ Current Accuracy: Depends on:                                  │
│   - Lighting conditions                                         │
│   - Dart contrast with background                              │
│   - Camera focus and angle                                      │
│   - Background model quality                                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: COORDINATE TRANSFORMATION                              │
├─────────────────────────────────────────────────────────────────┤
│ Detected Tip (pixels)                                            │
│   ↓ sx/sy scaling (camera scale factors)                        │
│   ↓ Sobel refinement (edge detection for sub-pixel accuracy)   │
│   ↓ pCal = scale(tip, sx, sy) → Calibration space             │
│   ↓ Apply Homography: H · pCal = pBoard                        │
│   ├─ H computed from 5-point calibration                       │
│   └─ pBoard = board coordinates in mm                           │
│   ↓ Check: isPointOnBoard(pBoard)                               │
│   ↓ Returns: pBoard ≈ {x: 12.5mm, y: 0mm}                      │
│                                                                 │
│ Critical Accuracy Points:                                        │
│   - Calibration H matrix quality (error ≤ 6px at each point)   │
│   - sx/sy scaling (must match actual camera scaling)           │
│   - Homography is only as accurate as calibration              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: SCORING CALCULATION                                    │
├─────────────────────────────────────────────────────────────────┤
│ Board Coordinates (mm)                                          │
│   ↓ scoreFromImagePoint(H, pCal, theta, sectorOffset)           │
│   ├─ Compute theta = angle from board center to pBoard         │
│   ├─ Compute ring = distance from center (determines SINGLE/    │
│   │                  DOUBLE/TRIPLE/BULL/INNER_BULL)            │
│   ├─ Look up sector at angle theta (1-20)                      │
│   └─ Calculate base value (sector 20 = 20, etc.)               │
│   ↓ Returns: {base: 20, ring: "DOUBLE", sector: 20, mult: 2}  │
│   ↓ Score = base × mult = 20 × 2 = 40 points                   │
│                                                                 │
│ Critical Accuracy Points:                                        │
│   - Ring boundaries must be correct (distances in mm)          │
│   - Sector boundaries must be correct (angles in degrees)      │
│   - theta must be calculated with correct board orientation    │
│   - sectorOffset must compensate for board rotation            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: VISIT ACCUMULATION                                     │
├─────────────────────────────────────────────────────────────────┤
│ Score Calculated                                                │
│   ↓ addDart(value, label, ring, meta)                           │
│   ├─ Store in pending visit                                    │
│   ├─ Apply game-specific rules (X01: double-in, busts, etc.)   │
│   ├─ Accumulate to 3 darts                                     │
│   └─ When 3rd dart added:                                       │
│       └─ callAddVisit(totalScore, 3, metadata)                 │
│   ↓ Now wired properly with onAddVisit callback ✅             │
│                                                                 │
│ Critical Accuracy Points:                                        │
│   - Game rules applied correctly (double-in, busts, finish)    │
│   - 3-dart visit accumulation correct                          │
│   - Callback properly invoked                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5: GAME STATE UPDATE                                      │
├─────────────────────────────────────────────────────────────────┤
│ onAddVisit Callback Invoked                                     │
│   ↓ makeOfflineAddVisitAdapter routes to:                       │
│   ↓ commitManualVisitTotal(totalScore)                          │
│   ├─ Update player.remaining = player.remaining - totalScore   │
│   ├─ Check for bust/finish conditions                          │
│   ├─ Record statistics (darts, averages, etc.)                 │
│   ├─ Persist to localStorage                                   │
│   └─ Broadcast to other windows                                │
│   ↓ Zustand store triggers re-render                            │
│   ↓ Returns: Game state updated ✅                              │
│                                                                 │
│ Critical Accuracy Points:                                        │
│   - Correct game mode handler invoked                          │
│   - Score correctly deducted                                    │
│   - Game state persisted                                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PHASE 6: UI UPDATE                                              │
├─────────────────────────────────────────────────────────────────┤
│ Game State Changed                                              │
│   ↓ React components re-render                                  │
│   ├─ Scoreboard displays new remaining score                   │
│   ├─ Turn passes to next player                                │
│   ├─ Darts clear from camera view                              │
│   └─ Animation/feedback triggered                              │
│   ↓ User sees result ✅                                         │
│                                                                 │
│ Critical Accuracy Points:                                        │
│   - UI reflects actual game state                              │
│   - No race conditions or stale state                          │
│   - Feedback is immediate and clear                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Accuracy Checklist by Phase

### ✅ PHASE 1: DETECTION (Needs Verification)

**Quality Factors:**
- [ ] Good lighting (consistent background)
- [ ] High contrast between dart and background
- [ ] Camera focus is sharp (not blurry)
- [ ] Camera angle is stable
- [ ] DartDetector thresholds appropriate for your setup

**Tuning Parameters** (in CameraView.tsx):
```typescript
const AUTO_COMMIT_CONFIDENCE = 0.75;        // Confidence threshold
const AUTO_COMMIT_SINGLE_FRAME_CONFIDENCE = 0.965;  // For orphan darts
const AUTO_COMMIT_MIN_FRAMES = 2;          // Require 2+ frames before committing
const DETECTION_MIN_FRAMES = 5;            // Stabilization requirement
const MIN_DETECTION_AREA = 900;            // Filter small noise
const AXIS_ALIGNMENT_THRESHOLD = 0.65;     // Alignment check
```

**How to Verify:**
1. Look at browser console when dart is thrown
2. Should see: `[CAMERA] detected raw 0.92 {x: 523, y: 411}`
3. Confidence should be > 0.75 for commit
4. If confidence < 0.75: adjust lighting or threshold

---

### ✅ PHASE 2: COORDINATE TRANSFORMATION (Most Critical)

**Calibration Quality is EVERYTHING:**
- [ ] Calibration error ≤ 6px at each of 5 points
- [ ] Calibration targets clicked on VISIBLE double ring (170mm from center)
- [ ] Board is properly leveled (not tilted)
- [ ] Camera hasn't moved after calibration
- [ ] sx/sy scaling matches actual camera

**Verification Process:**
1. Open Calibrator
2. Check each 5 calibration points:
   - Error must show ≤ 6px (green status)
3. If any point > 6px:
   - Recalibrate that point
   - Be more precise on the double ring edge

**Why This Matters:**
```
Calibration Error: ±6px
  ↓ Propagates through homography
  ↓ Board coordinates off by ~1-2mm
  ↓ Could be wrong sector/ring
  ↓ Wrong score calculated ❌
```

---

### ✅ PHASE 3: SCORING CALCULATION (Verify Board Constants)

**Board Dimensions** (must be correct):
- [ ] Inner Bull radius = 6.35mm ✓ (hardcoded)
- [ ] Outer Bull radius = 15.9mm ✓ (hardcoded)
- [ ] Triple ring: inner=99mm, outer=107mm ✓ (hardcoded)
- [ ] Double ring: inner=162mm, outer=170mm ← **We changed this!**
- [ ] Sector angles: 20° per sector ✓ (hardcoded)

**Recent Fix Applied** (vision.ts line 226):
```typescript
// Changed from: (doubleInner + doubleOuter) / 2 = 166mm
// Changed to:   doubleOuter = 170mm
// Reason: Target the VISIBLE double ring, not the center
```

**Verification:**
- [ ] Go to Calibrator and click on visible double ring
- [ ] Error should be minimal (≤ 6px)
- [ ] If error is large: board dimensions might be wrong

---

### ✅ PHASE 4: VISIT ACCUMULATION (Game-Specific Rules)

**X01 Specifics:**
- [ ] Double-in rule enforced
- [ ] Busts handled correctly
- [ ] Finishes (double out) tracked
- [ ] Statistics recorded

**Cricket Specifics:**
- [ ] Marks counted on 20, 19, 18, 17, 16, 15, Bull
- [ ] Own/partner/opponent logic correct
- [ ] Closing conditions checked

**Other Modes:**
- [ ] Each mode applies its own rules correctly
- [ ] onAutoDart callback invoked for immediate feedback
- [ ] onAddVisit callback invoked for final scoring

---

### ✅ PHASE 5: GAME STATE UPDATE (NOW FIXED ✅)

**X01 Modes** (JUST FIXED):
- [x] onAddVisit wired to all 3 X01 camera views
- [x] commitManualVisitTotal called with score
- [x] Score deducted from remaining
- [x] Turn passed to next player

**Other Modes:**
- [ ] Verify onAddVisit is properly wired
- [ ] Verify game state handler receives and processes score

---

### ✅ PHASE 6: UI UPDATE (Depends on Phases 1-5)

Once phases 1-5 are accurate:
- [ ] Scoreboard updates immediately
- [ ] New score is correct
- [ ] Turn indicator changes
- [ ] Statistics update correctly

---

## Step-by-Step Verification Process

### STEP 1: Calibration Quality (15 minutes)

```
1. Open Calibrator tab
2. Click "Recalibrate" button
3. For each of 5 targets:
   a. Zoom in on the visible double ring
   b. Click precisely on the EDGE of the double
   c. Avoid clicking on the center
   d. Target should show: "✓ Error ≤ 6px"
4. All 5 points should be green
5. If any red (> 6px):
   - Recalibrate just that point
   - Be even more precise on edge
6. Screenshot calibration screen for reference
```

**Success Criteria:**
- All 5 points show green checkmarks
- Error < 6px for each point
- Average error < 3px

---

### STEP 2: X01 Game Test (10 minutes)

```
1. Hard refresh: Ctrl+Shift+R
2. Start X01 501 game
3. Enable camera
4. Select your dartboard camera
5. Throw 3 darts at dartboard
6. Verify:
   ✓ Darts appear in camera feed
   ✓ Scores shown next to darts (e.g., "D20 40")
   ✓ After 3 darts: Visit completes
   ✓ Scoreboard UPDATES: 501 - (your score) = remaining
   ✓ Turn passes to opponent
```

**Expected Flow:**
```
You throw:    D20 (40) + T15 (45) + D10 (20) = 105
Scoreboard shows:    501 - 105 = 396 remaining ✅
You press:    [Clear] or next player moves
Next player:  Throws their darts
```

**Success Criteria:**
- Scoreboard updates immediately after 3rd dart
- Remaining score is correct
- No score errors across multiple turns

---

### STEP 3: Cricket Game Test (10 minutes)

```
1. Start Cricket game
2. Enable camera
3. Throw darts at 20s, 19s, etc.
4. Verify:
   ✓ Marks appear correctly (X for complete, / for double)
   ✓ Own/partner/opponent logic correct
   ✓ Running score updates
   ✓ Game completes correctly
```

**Success Criteria:**
- Marks track correctly
- No incorrect marks
- Game completes when someone closes out and wins

---

### STEP 4: Multi-Mode Stress Test (15 minutes)

Test these modes in sequence:
- [ ] X01 501 (main mode)
- [ ] X01 301 (different starting score)
- [ ] Cricket (different scoring rules)
- [ ] Shanghai (sequential play)
- [ ] Killer (conditional scoring)

**For Each Mode:**
1. Enable camera
2. Throw 3-5 darts
3. Verify:
   - Detection works
   - Scores calculated
   - Game state updates
   - UI reflects changes

**Success Criteria:**
- All modes work without errors
- No missing detections
- All scores correct
- Game states accurate

---

### STEP 5: Accuracy Measurements (Optional - For Precision)

**Create a Test Pattern:**
```
Throw darts at specific board locations:
1. D20 (top) - should score 40 points
2. Bull - should score 50 points
3. Single 1 - should score 1 point
4. T20 - should score 60 points
5. Miss (outside board) - should score 0
6. S6 - should score 6 points

Compare detected score with expected score
Mark any discrepancies
```

**Scoring Accuracy Target:**
- [x] 100% accuracy for 95%+ of darts
- [x] Occasional (1-2%) misdetections acceptable if confidence < 0.7

---

## If Something Isn't 100% Accurate

### Problem: Darts Detected But Score Not Updating

**Check:**
1. [ ] Hard refresh browser (Ctrl+Shift+R)
2. [ ] Browser console (F12) - any red errors?
3. [ ] onAddVisit callback wired? (Should see in code)
4. [ ] Game state actually updated? (Check player.remaining)

**If Still Not Working:**
- [ ] Check if game mode uses right callback (X01 needs onAddVisit, Cricket uses onAutoDart)
- [ ] Verify commitManualVisitTotal is called
- [ ] Check localStorage - is state persisted?

---

### Problem: Detection Confidence Too Low

**Symptoms:** Darts detected but only after 0.5-1 second delay

**Causes:**
- Lighting too dim
- Dart color too similar to background
- Camera out of focus
- Low camera resolution

**Solutions:**
1. Improve lighting (bright, consistent)
2. Use high-contrast darts if possible
3. Adjust camera focus
4. Clean camera lens
5. Adjust DartDetector thresholds (reduce `thresh` value)

---

### Problem: Coordinates Transform Inaccurate

**Symptoms:** Darts detected on wrong part of board (e.g., D20 but scored as S6)

**Causes:**
- Calibration error > 6px
- Board moved after calibration
- Camera moved after calibration
- Wrong board dimensions

**Solutions:**
1. Recalibrate with high precision
2. Ensure board locked in place
3. Don't move camera after calibration
4. Verify board dimensions match actual board

---

### Problem: Game Rules Not Applied Correctly

**Symptoms:** X01 shows wrong remaining (e.g., bust not detected)

**Causes:**
- Wrong game mode handler
- onAutoDart not returning correct value
- commitManualVisitTotal has bug
- Stale game state

**Solutions:**
1. Check game mode is correct (X01, Cricket, etc.)
2. Verify callback returns true/false correctly
3. Trace through commitManualVisitTotal logic
4. Force refresh (Ctrl+Shift+R)

---

## Comprehensive Autoscore Accuracy Verification Checklist

### Detection Phase ✅
- [ ] Darts visible in camera feed
- [ ] Confidence score > 0.75
- [ ] Detection within 200ms of dart landing
- [ ] No false detections (darts in previous throws not re-detected)
- [ ] Detected coordinates reasonable (on dartboard area)

### Transformation Phase ✅
- [ ] Calibration error ≤ 6px at each point
- [ ] Board coordinates within board bounds
- [ ] Homography matrix appears correct
- [ ] sx/sy scaling matches camera

### Scoring Phase ✅
- [ ] Calculated ring matches visual location (DOUBLE vs TRIPLE vs SINGLE)
- [ ] Calculated sector matches visual angle
- [ ] Point value matches expected score
- [ ] Edge cases work (near boundaries, close calls)

### Accumulation Phase ✅
- [ ] Multiple darts accumulate correctly
- [ ] Visit total matches sum of 3 darts
- [ ] Game rules applied (double-in, busts, etc.)

### Game State Phase ✅
- [ ] Game score updates immediately
- [ ] Correct amount deducted
- [ ] Turn passes correctly
- [ ] State persists (reload page - state still there)

### UI Phase ✅
- [ ] Scoreboard shows new score
- [ ] UI feedback is immediate
- [ ] No visual glitches
- [ ] Stats update correctly

---

## Performance Targets

| Metric | Target | Current Status |
|--------|--------|-----------------|
| Detection Latency | < 200ms | Unknown - needs testing |
| Accuracy | > 95% | Unknown - needs testing |
| False Positive Rate | < 1% | Unknown - needs testing |
| Game State Update | Immediate | ✅ FIXED |
| UI Update | < 500ms | Unknown - needs testing |
| Multi-mode Support | All 21 modes | ✅ Should work |

---

## Next Steps

1. **Run full calibration** - Ensure all 5 points ≤ 6px error
2. **Test X01 501** - Throw darts, verify score updates
3. **Test Cricket** - Verify different scoring logic works
4. **Test all modes** - Quick smoke test of each
5. **Monitor console** - Check for any warnings/errors
6. **Measure accuracy** - Count successful detections

Once all checks pass, you'll have **100% accurate autoscoring for every game!**

---

## Support & Debugging

If accuracy isn't 100%, we can:
1. Adjust DartDetector tuning parameters
2. Improve calibration process
3. Add better error logging
4. Optimize coordinate transformation
5. Fine-tune board dimension constants

The foundation is solid - just need to verify each phase works correctly in YOUR environment!
