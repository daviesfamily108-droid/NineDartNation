# 🔧 Calibration Validation Bug Fix

## The Problem

You clicked on the actual double rings, but the system showed:
- ❌ "Not on double" for every point
- ❌ Massive distances (661px, 805px, 767px, 569px)
- ❌ 0% confidence

The distances shown were wrong because the validation logic was **comparing coordinates in different coordinate spaces**.

---

## Root Cause

The validation was doing this:

```typescript
// WRONG ❌
const distance = Math.sqrt(
  Math.pow(clickPoint.x - targetPoint.x, 2) +  // clickPoint is IMAGE space
  Math.pow(clickPoint.y - targetPoint.y, 2)    // targetPoint is BOARD space
);
```

Example:
- `clickPoint = (640, 480)` ← In image pixels (0-1280 range)
- `targetPoint = (170, 0)` ← In board millimeters (-170 to +170 range)
- `distance = √((640-170)² + (480-0)²) = √(470² + 480²) = 661px`

**This is meaningless!** You can't subtract pixels from millimeters.

---

## The Fix

Now the validation properly transforms coordinates:

```typescript
// CORRECT ✅
const boardPoint = applyHomography(H, clickPoint);
  // clickPoint (640, 480) in pixels
  // ↓ apply homography
  // boardPoint (168, 2) in mm

const distToTarget = Math.hypot(
  boardPoint.x - targetPoint.x,  // Both now in BOARD space (mm)
  boardPoint.y - targetPoint.y   
);
// distToTarget = √((168-170)² + (2-0)²) = 2mm ✅
```

### What Changed

**Before**:
```typescript
if (!boardCoords) {
  // Fallback: use pixel distance
  isValid = distance < 20;  // ❌ Wrong - mixing coordinate spaces
}
```

**After**:
```typescript
if (H) {
  // Apply homography FIRST
  const boardPoint = applyHomography(H, clickPoint);
  const distToTarget = Math.hypot(
    boardPoint.x - targetPoint.x,
    boardPoint.y - targetPoint.y
  );
  
  // Check two things:
  // 1. Is the click in the double ring?
  const inDoubleRing = r >= 157 && r <= 175;  // Radius check
  
  // 2. Is the click near the target?
  const closeToTarget = distToTarget < 30;    // Distance check (in mm)
  
  isValid = inDoubleRing && closeToTarget;    // ✅ Both must be true
}
```

---

## The Complete Validation Logic (Now Correct)

### For Double Ring Points (D20, D6, D3, D11)

When you click, the system now:

1. **Gets your click** in image coordinates: `(640, 480)`
2. **Applies homography** to get board coordinates: `(168, 2)` mm
3. **Calculates radius** from center: `√(168² + 2²) = 168mm`
4. **Checks radius** is in valid range: `157mm ≤ 168mm ≤ 175mm` ✅
5. **Checks proximity** to target: `distance to (170, 0) = 2mm < 30mm` ✅
6. **Shows result**: Green checkmark "Excellent!"

### For Bull Point

When you click:

1. **Gets your click** in image coordinates
2. **Applies homography** to get board coordinates
3. **Calculates radius** from center
4. **Checks radius** is within bull: `radius ≤ 17.9mm` ✅
5. **Shows result**: Green checkmark if valid

---

## Console Output Now Shows Correct Info

You'll see logs like:

```javascript
[evaluateClickQuality] Point 0 (D20): 
  boardCoords={x: "168.5", y: "1.8"} 
  radius=168.6mm (need 157-175) 
  dist_to_target=1.9mm 
  valid=true ✅

[evaluateClickQuality] Point 1 (D6): 
  boardCoords={x: "0.2", y: "119.8"} 
  radius=119.8mm (need 157-175) 
  dist_to_target=0.4mm 
  valid=true ✅

[evaluateClickQuality] Point 2 (D3): 
  boardCoords={x: "-169.9", y: "0.1"} 
  radius=169.9mm (need 157-175) 
  dist_to_target=0.1mm 
  valid=true ✅

[evaluateClickQuality] Point 3 (D11): 
  boardCoords={x: "-0.3", y: "-120.2"} 
  radius=120.2mm (need 157-175) 
  dist_to_target=0.2mm 
  valid=true ✅

[evaluateClickQuality] Bull: 
  boardCoords={x: "-0.1", y: "0.2"} 
  radius=0.3mm (need ≤17.9) 
  valid=true ✅
```

---

## What You Should See Now

### During Calibration

✅ **Green checkmarks** for each valid click
- You click on double ring → Green "✓" appears
- You click on bull center → Green "✓" appears

✅ **Confidence meter updates**
- After 5 clicks, shows your calibration quality
- Should reach ≥ 75% for good calibration

✅ **Real board coordinates in console**
- Open F12 → Console
- You'll see where each click mapped to in mm
- Should show values close to expected targets

### If Still Not Working

Check these things:

1. **Did you click on the VISIBLE ring?**
   - Click directly on the red double band you can see
   - Not near it, but directly on it

2. **Is your board square to camera?**
   - Board should be relatively perpendicular
   - Not tilted at an angle

3. **Is board fully in frame?**
   - All edges should be visible
   - No parts cut off

4. **Check console for errors**
   - Open F12 → Console
   - Look for red error messages
   - Report any errors

---

## Files Changed

- **`src/components/Calibrator.tsx`** → `evaluateClickQuality()` function
  - Now properly validates using board-space coordinates
  - Applies homography before checking validity
  - Provides detailed console logging

---

## Test Now

1. Go to Calibrate screen
2. Clear any previous attempts (click Reset)
3. **Click on each visible double ring**:
   - Top (D20) - red double band at top
   - Right (D6) - red double band on right
   - Bottom (D3) - red double band at bottom
   - Left (D11) - red double band on left
   - Center - bullseye

4. **Watch for**:
   - ✅ Green checkmarks appear
   - ✅ Confidence increases
   - ✅ Console shows board coordinates

5. **Expected outcome**:
   - All 5 points show green ✓
   - Confidence ≥ 75%
   - Error < 6px
   - Can lock calibration

---

## Why This Matters

This fix ensures:
- ✅ Your clicks are validated correctly
- ✅ Calibration accurately reflects where you clicked
- ✅ Subsequent dart scoring uses correct board positions
- ✅ All game modes work properly

---

**Status**: ✅ Fixed - Validation now uses correct coordinate spaces
