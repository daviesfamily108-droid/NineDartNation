# 🎯 VERIFICATION FEATURE - Quick Guide

## The Problem You Described

"auto calibrate... I need it to verify the treble and doubles exactly where the dart board is in the camera"

## The Solution We Added

A **verification step** that:
1. Shows detected rings overlaid on your camera feed
2. Checks that treble and double rings are in the RIGHT PLACES
3. Lets YOU confirm before locking

## New Calibration Workflow

```
BEFORE:
  Auto-detect → Auto-lock → Hope it's correct ❓

AFTER:
  Auto-detect → VERIFY → You confirm → Lock with confidence ✅
```

## What You'll See

### Step 1: After Auto-Detect
```
Yellow message appears:
"✅ Detected rings — Please verify alignment by looking at the overlay"

Colored rings appear on your camera:
- Cyan rings = Double ring boundaries
- Yellow rings = Treble ring boundaries  
- Green rings = Bull boundaries
```

### Step 2: Verification Panel
```
⚠️ VERIFY RING ALIGNMENT

Look at the overlay on your dartboard. Do the colored 
rings match exactly with the treble and double rings?

┌──────────────────────────────┐
│ D20 (top double)    ✅ OK    │
│ D6 (right double)   ✅ OK    │
│ D3 (bottom double)  ✅ OK    │
│ D11 (left double)   ✅ OK    │
│ Bull center         ✅ OK    │
└──────────────────────────────┘

[✅ Accept & Lock]  [🔄 Retry]
```

## What Each Check Means

| Check | What It Tests |
|-------|---------------|
| **D20 (top)** | Is the double ring at the top exactly where it should be? |
| **D6 (right)** | Is the double ring on the right exactly where it should be? |
| **D3 (bottom)** | Is the double ring at the bottom exactly where it should be? |
| **D11 (left)** | Is the double ring on the left exactly where it should be? |
| **Bull** | Is the center bullseye in the right spot? |

## How to Use It

### If All Checks Are ✅
```
Everything is correct!
→ Click "✅ Accept & Lock"
→ Calibration locked, ready to throw darts
```

### If Any Check Shows ❌
```
Something is wrong with ring positioning
❌ Off by 2.3mm ← Means the ring is off by 2.3 millimeters

Options:
1. Click "🔄 Retry" to try a different angle/lighting
2. Capture a new photo from better position
3. Try manual calibration instead (click on 4 doubles)
```

## The Ring Overlay Colors

As you look at your dartboard during verification:

```
Cyan (light blue) rings  = Double ring boundaries
                            (20-area, 6-area, 3-area, 11-area)

Yellow rings            = Treble ring boundaries

Green rings             = Bull rings (25 and 50)
```

If these colored rings **exactly match** your actual dartboard rings, you're good!

## Step-by-Step: What to Do

### 1. Capture
```
📸 Click "Capture frame" (or upload a photo)
🎯 Make sure full board is visible
💡 Good lighting helps
```

### 2. Auto-Calibrate
```
🎯 Click "Auto-Calibrate (Advanced)"
⏳ Wait 2-3 seconds while it detects rings
```

### 3. Verify
```
👁️ Look at the colored rings overlaid on your board
   ↓ Do they match the actual rings?
   
📋 Check verification table (D20, D6, D3, D11, Bull)
   ↓ All ✅? Great!
   ↓ Any ❌? Need to retry
```

### 4. Confirm
```
✅ All checks pass?
   → Click "Accept & Lock"
   → Done! Ready to play
   
❌ Some checks fail?
   → Click "Retry"
   → Capture from different angle
   → Try auto-calibrate again
```

## Common Scenarios

### Scenario 1: Perfect Detection
```
Verification shows:
✅ D20 (top)    - OK
✅ D6 (right)   - OK
✅ D3 (bottom)  - OK
✅ D11 (left)   - OK
✅ Bull center  - OK

Action: Click "✅ Accept & Lock" 🎯
```

### Scenario 2: Slight Misalignment
```
Verification shows:
✅ D20 (top)      - OK
⚠️ D6 (right)     - Off by 1.2mm
✅ D3 (bottom)    - OK
✅ D11 (left)     - OK
✅ Bull center    - OK

Action: Probably OK to accept (1.2mm is small)
        Click "✅ Accept & Lock"
```

### Scenario 3: Bad Detection
```
Verification shows:
❌ D20 (top)      - Off by 8mm
❌ D6 (right)     - Off by 7mm
❌ D3 (bottom)    - Off by 9mm
❌ D11 (left)     - Off by 6mm
❌ Bull center    - Off by 10mm

Action: Not good, rings are way off
        Click "🔄 Retry"
        Try different angle/lighting
        Or use manual calibration
```

## Tolerance Levels

```
✅ PASS (accepted):
   - Double ring points:   ±4.5mm tolerance
   - Bull center point:    ±3.5mm tolerance

❌ FAIL (rejected):
   - Double ring points:   >4.5mm error
   - Bull center point:    >3.5mm error
```

## Tips for Best Verification

1. **Good Lighting** - Helps rings be visible and detected correctly
2. **Camera Angle** - More perpendicular (less angled) = better
3. **Full Board** - Ensure entire dartboard is in frame
4. **Steady Image** - Avoid motion blur
5. **Trust Your Eyes** - If overlay rings don't match visually, retry

## What's Different From Before?

| Aspect | Before | After |
|--------|--------|-------|
| Ring detection | Auto-lock immediately | Shows verification panel |
| User confirmation | None | Required before lock |
| Visibility | No way to verify | Clear visual + table |
| Control | System decides | You decide |
| Mistakes | Auto-locked wrong rings | Can reject and retry |

## Summary

The **verification feature** ensures:
- ✅ You SEE what was detected
- ✅ You VERIFY it matches your board
- ✅ You CONFIRM before locking
- ✅ No more "why are darts detecting wrong?"

**Try it now!** Auto-calibrate will show you the verification panel. 🎯
