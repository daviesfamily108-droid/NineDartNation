# Calibration Tolerance Fix - Quick Reference

## Issue
4/5 calibration verification points failing numerically despite appearing visually correct within cyan circles.

## Root Cause
Targets placed at ring edge (170mm) with tight tolerance (5.5mm), but ring width is 8mm (162-170mm). Users clicking within the ring but not at exact edge would fail.

## Solution
- **Target changed**: From `doubleOuter (170mm)` → `doubleCenter (166mm)` 
- **Tolerance adjusted**: From `5.5mm` → `4.5mm` for doubles

## Impact
✅ Any click within the visible double ring now passes verification
✅ Visual feedback matches numerical validation
✅ Calibration can now be locked successfully

## Files Changed
1. `src/utils/vision.ts` - Line 211-230: `canonicalRimTargets()` function
2. `src/components/Calibrator.tsx` - Line 371-374: `VERIFICATION_ANCHORS` array

## Verification
- ✅ All 95 unit tests pass
- ✅ No breaking changes to dart scoring
- ✅ Calibration verification improved

## Math
```
Ring dimensions: 162mm (inner) to 170mm (outer)
Center target: (162 + 170) / 2 = 166mm
Tolerance: 4.5mm

Results in:
- Inner edge: |162-166| = 4mm ≤ 4.5mm ✅
- Center: |166-166| = 0mm ≤ 4.5mm ✅  
- Outer edge: |170-166| = 4mm ≤ 4.5mm ✅
```

## User Impact
Before: Calibration fails 4/5 points numerically despite visual approval
After: Calibration locks successfully when all points clicked within rings
