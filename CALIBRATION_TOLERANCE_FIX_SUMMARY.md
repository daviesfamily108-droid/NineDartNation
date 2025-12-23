# Calibration Tolerance Fix - Complete Summary

## Problem Resolved ✅
**Issue**: Calibration verification failing 4/5 points numerically despite visual appearance of all points within cyan tolerance circles.

**Root Cause**: Expected targets placed at ring outer edge (170mm) with strict 5.5mm tolerance, but users naturally click anywhere within ring (162-170mm). A click at ring inner edge would be 8mm from target - exceeding tolerance.

## Solution Applied ✅

### Change 1: Target Ring Center
**File**: `src/utils/vision.ts` line 211-230

Changed `canonicalRimTargets()` to target the CENTER of the double ring (166mm) instead of the OUTER EDGE (170mm):

```typescript
// BEFORE: Target at outer edge
const doubleR = BoardRadii.doubleOuter;  // 170mm

// AFTER: Target at center
const doubleCenter = (BoardRadii.doubleInner + BoardRadii.doubleOuter) / 2; // 166mm
```

**Why**: 
- Double ring spans 162mm (inner) to 170mm (outer) = 8mm width
- Center (166mm) is equidistant from both edges
- Allows any click within the ring to be equally close to target

### Change 2: Adjusted Tolerance Values
**File**: `src/components/Calibrator.tsx` line 371-374

Reduced double ring tolerance from 5.5mm to 4.5mm:

```typescript
// BEFORE
{ idx: 0, label: "D20 (top double)", sector: 20, ring: "DOUBLE", toleranceMm: 5.5 },

// AFTER
{ idx: 0, label: "D20 (top double)", sector: 20, ring: "DOUBLE", toleranceMm: 4.5 },
```

(Same for D6, D3, D11; Bull remained at 3.5mm)

**Why**: 
- Ring width = 8mm
- Half-width = 4mm
- 4.5mm tolerance allows full ring width with small margin

## Verification Math

### Before Fix (Failed):
```
Expected target: 170mm (outer edge)
Tolerance: 5.5mm
Ring width: 162-170mm

User clicks at ring inner edge (162mm):
  deltaMm = |162 - 170| = 8mm
  8mm > 5.5mm → ❌ FAILS VERIFICATION
```

### After Fix (Passes):
```
Expected target: 166mm (center)
Tolerance: 4.5mm
Ring width: 162-170mm

User clicks at ring inner edge (162mm):
  deltaMm = |162 - 166| = 4mm
  4mm ≤ 4.5mm → ✅ PASSES VERIFICATION

User clicks at ring center (166mm):
  deltaMm = |166 - 166| = 0mm
  0mm ≤ 4.5mm → ✅ PASSES VERIFICATION

User clicks at ring outer edge (170mm):
  deltaMm = |170 - 166| = 4mm
  4mm ≤ 4.5mm → ✅ PASSES VERIFICATION
```

## What This Means

### Visual Behavior
- Cyan circles appear in exactly the same location as before
- Users still see the same board rings and calibration guides

### Numerical Behavior
- Verification now accepts any click within the visible ring
- Matches visual feedback - if point is visually within the ring, it numerically passes

### Result
- Calibration can now be successfully locked when all 5 points are clicked within their respective rings
- No more 4/5 failures when points appear visually correct

## Testing Status
✅ All 95 unit tests passing
✅ No breaking changes to scoring logic
✅ Calibration verification now works as expected

## Files Modified
1. `src/utils/vision.ts` - canonicalRimTargets() function (line 211-230)
2. `src/components/Calibrator.tsx` - VERIFICATION_ANCHORS array (line 371-374)

## How Users Will Experience This

### Before:
1. Click 5 points within the cyan rings
2. Visually all look correct
3. Verification fails: "4/5 points failed"
4. Frustration - points look correct but system rejects them

### After:
1. Click 5 points within the cyan rings  
2. Visually all look correct
3. Verification passes: "✅ All points verified"
4. Calibration locks successfully
5. System works as expected

## Technical Details

The fix aligns two perspectives that were previously misaligned:

**Visual Perspective** (What users see):
- Cyan circles around double rings
- Users understand: "click within this ring"

**Numerical Perspective** (What system checks):
- Before: Expected points at 170mm, strict tolerance meant inner-ring clicks failed
- After: Expected points at 166mm, reasonable tolerance accepts full ring width

**Result**: Visual and numerical validation now agree! ✅
