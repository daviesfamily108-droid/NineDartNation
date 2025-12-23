# Quick Start - Automatic Calibration 🎯

## Your Problem Solved!

**You asked**: "Is there a way where when the image is being captured the rings are automatically found once we click auto detect?"

**Answer**: YES! ✅ This feature already exists and works great!

## The Two-Button Solution

### Step 1: Capture or Load an Image
```
1. Open Calibrator
2. Click "Capture" to record a frame from video
   OR
   Click "Load Photo" to select an image from your phone
3. Your dartboard image should now display on screen
```

### Step 2: Click Auto-Calibrate
```
4. You'll see two buttons:
   
   🎯 "Auto-Calibrate (Advanced)" ← USE THIS ONE (faster, preferred)
   OR
   "Legacy: Auto detect rings" ← Use if Advanced fails
   
5. Click either button
```

### Step 3: System Automatically Finds Rings
```
✅ System analyzes the image
✅ Detects board center
✅ Finds all 6 rings automatically
✅ Shows colored overlays:
   - Cyan circles = Double ring
   - Yellow circles = Treble ring  
   - Green circles = Bull
✅ Generates calibration points automatically
✅ Locks calibration if confidence ≥ 95%
```

### Step 4: You're Done! 🎉
```
✅ Calibration locked
✅ Ready to throw darts
✅ System scores darts automatically as they're detected
```

## No Manual Clicking Required!

You **do NOT need to manually click 5 points**. The auto-calibrate button does everything for you:

- ✅ Finds rings automatically
- ✅ Generates calibration points automatically  
- ✅ Computes homography automatically
- ✅ Locks calibration automatically (if confident)

## Visual Indicators

### Success Indicators:
- ✅ Colored rings appear on overlay aligned with board
- ✅ Confidence shows 95% or higher
- ✅ Status shows "Cal OK"
- ✅ Green circle around calibration status

### If Something's Wrong:
- ❌ Rings don't appear or misaligned
  → Try "Re-run Auto-Calibrate" button
  → Adjust camera angle for better board visibility
  
- ❌ Low confidence (< 95%)
  → Try different lighting or camera angle
  → Ensure full board is visible

- ❌ Rings way off
  → Try the "Legacy: Auto detect rings" button instead
  → Or reload image and try again

## The Magic Behind Auto-Calibrate

The system uses **computer vision** to:

1. **Edge Detection**: Uses Sobel algorithm to find ring boundaries
2. **Circle Search**: Searches image for strongest circular patterns
3. **Ring Detection**: Finds all 6 board rings mathematically
4. **Stability Validation**: Runs detection 3 times to ensure accuracy
5. **Confidence Scoring**: Reports how confident it is (0-100%)
6. **Automatic Locking**: Locks calibration if ≥ 95% confident

All this happens in **seconds** without any clicking!

## Why This is Better Than Manual Clicking

```
❌ MANUAL CLICKING (old way):
   - Requires clicking 5 specific points
   - Hard to be precise
   - Easy to make mistakes
   - Error-prone on mobile
   - 4 out of 5 points might fail

✅ AUTO-CALIBRATE (new way):
   - No clicking required
   - Uses math/computer vision
   - Finds exact ring locations
   - Works in seconds
   - Highly reliable
```

## What to Do If Auto-Calibrate Fails

**Scenario 1: Rings don't appear**
- Make sure board is fully visible
- Try better lighting
- Capture a different angle
- Tap "Re-run Auto-Calibrate"

**Scenario 2: Rings appear but misaligned**
- Small misalignment is okay
- Won't affect scoring
- Try clicking "Lock" to proceed

**Scenario 3: Confidence too low**
- Try different lighting
- Position board more squarely
- Use "Legacy: Auto detect rings" option
- Or capture a new frame

**Scenario 4: Still not working**
- Last resort: manual clicking
  1. Switch to "Manual" calibration mode
  2. Click 5 points on the board rings
  3. Tap "Lock"

## Summary

**The Answer to Your Question:**

YES, rings are automatically found when you:
1. Capture/load image
2. Click "🎯 Auto-Calibrate (Advanced)" button
3. Wait 2-3 seconds
4. System automatically:
   - Detects rings
   - Shows them on overlay
   - Locks calibration
   - Notifies you it's done

**You do NOT need to manually click anything!** 🎯

Try it right now:
1. Capture your dartboard
2. Click the big "🎯 Auto-Calibrate (Advanced)" button  
3. Watch the rings appear automatically
4. Done!

Enjoy automatic dart detection! 🎯
