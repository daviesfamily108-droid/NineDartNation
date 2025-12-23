# Calibration Tolerance Fix - Ring Center Targeting

## Problem Summary
Calibration verification was failing 4/5 points numerically despite visual appearance of passing (points within cyan circles). Root cause: **Expected targets were at ring outer edge, but tolerance was too strict for ring width**.

## The Fix Applied

### Change 1: Target Ring Center Instead of Outer Edge
**File**: `src/utils/vision.ts` line ~211

**Before:**
```typescript
export function canonicalRimTargets(): Point[] {
  const doubleR = BoardRadii.doubleOuter;  // 170mm - OUTER EDGE
  // ...targets at 170mm
}
```

**After:**
```typescript
export function canonicalRimTargets(): Point[] {
  // Target the CENTER of the double ring, not the outer edge
  const doubleCenter = (BoardRadii.doubleInner + BoardRadii.doubleOuter) / 2; // 166mm
  // ...targets at 166mm (center)
}
```

**Why**: 
- Double ring spans 162mm (inner) to 170mm (outer), width = 8mm
- Users click anywhere within the ring, not at exact outer edge
- Targeting the center gives equal tolerance on both sides of the ring
- Allows clicks from 162mm to 170mm to pass verification

### Change 2: Adjusted Tolerance Values
**File**: `src/components/Calibrator.tsx` line ~371-374

**Before:**
```typescript
{ idx: 0, label: "D20 (top double)", sector: 20, ring: "DOUBLE", toleranceMm: 5.5 },
{ idx: 1, label: "D6 (right double)", sector: 6, ring: "DOUBLE", toleranceMm: 5.5 },
{ idx: 2, label: "D3 (bottom double)", sector: 3, ring: "DOUBLE", toleranceMm: 5.5 },
{ idx: 3, label: "D11 (left double)", sector: 11, ring: "DOUBLE", toleranceMm: 5.5 },
```

**After:**
```typescript
{ idx: 0, label: "D20 (top double)", sector: 20, ring: "DOUBLE", toleranceMm: 4.5 },
{ idx: 1, label: "D6 (right double)", sector: 6, ring: "DOUBLE", toleranceMm: 4.5 },
{ idx: 2, label: "D3 (bottom double)", sector: 3, ring: "DOUBLE", toleranceMm: 4.5 },
{ idx: 3, label: "D11 (left double)", sector: 11, ring: "DOUBLE", toleranceMm: 4.5 },
```

**Why**:
- Ring width = 8mm (170 - 162)
- Half-width = 4mm
- New tolerance of 4.5mm allows full ring width + small margin
- Bull tolerance stays at 3.5mm (appropriate for bullseye accuracy)

## How It Works Now

### Mathematical Verification
```
Ring dimensions:
  - doubleInner = 162mm
  - doubleOuter = 170mm
  - doubleCenter = (162 + 170) / 2 = 166mm
  - ringWidth = 8mm

When user clicks on ring:
  ✅ Outer edge click (170mm): deltaMm = |170 - 166| = 4mm ≤ 4.5mm → PASS
  ✅ Center click (166mm): deltaMm = |166 - 166| = 0mm ≤ 4.5mm → PASS
  ✅ Inner edge click (162mm): deltaMm = |162 - 166| = 4mm ≤ 4.5mm → PASS
```

### Verification Logic Remains Unchanged
The verification still checks three conditions (all must pass):
1. **ringMatch**: Detected ring matches expected (DOUBLE == DOUBLE)
2. **sectorMatch**: Detected sector matches expected (20 == 20)
3. **withinTolerance**: Distance in board space ≤ toleranceMm (4.5mm)

## Testing
✅ All 95 unit tests passing after changes
✅ No breaking changes to existing logic
✅ Only verification target position and tolerance changed

## What This Means for Users

### Before Fix:
- Visually all points appeared within cyan circles
- Numerically 4/5 failed because they were ~7-8mm from 170mm target
- Calibration couldn't be locked

### After Fix:
- Same visual appearance (cyan circles)
- Numerically points within ring should now pass
- Calibration should lock successfully when all 5 points are clicked within the rings

## Debug Information

If you want to see detailed verification logs:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Run calibration verification
4. Look for `[Verification]` log entries showing:
   - `deltaMm`: actual distance from target (should now be 0-4mm for ring clicks)
   - `withinTolerance`: true for clicks within ring
   - `match`: true when all three conditions pass

## Files Modified
1. `src/utils/vision.ts`: `canonicalRimTargets()` - targets ring center instead of outer edge
2. `src/components/Calibrator.tsx`: `VERIFICATION_ANCHORS` - adjusted toleranceMm values

## Conclusion
The fix addresses the root cause: **targets were too strict for the physical ring width**. By targeting the ring center and adjusting tolerances accordingly, users can now successfully calibrate when all 5 points are clicked within the visible rings, which matches the visual feedback they receive.
