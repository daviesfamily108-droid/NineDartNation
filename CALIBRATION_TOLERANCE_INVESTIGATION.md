# Calibration Tolerance Mismatch Investigation - FIX APPLIED ✅

## Problem Statement
User reports: "Even though the full double ring and treble ring is verified and all within the cyan blue lines...yet 4/5 fails on calibration"

This indicated a mismatch between:
- **Visual tolerance**: Cyan circles showing points visually passing
- **Numerical tolerance**: 4/5 validation fails numerically

## Root Cause Identified & Fixed ✅

### The Core Issue
**Expected targets were at the OUTER EDGE (170mm) of the double ring, but users naturally click anywhere WITHIN the ring (162-170mm). With a 5.5mm tolerance, clicking at the inner edge (162mm) would be off by 8mm - failing verification!**

### The Math:
```
Double ring:
  - Inner edge: 162mm
  - Outer edge: 170mm
  - Ring width: 8mm

With outer edge target (170mm) + 5.5mm tolerance:
  ❌ Inner edge click (162mm): deltaMm = |162 - 170| = 8mm > 5.5mm → FAIL
  ❌ Center click (166mm): deltaMm = |166 - 170| = 4mm ≤ 5.5mm → PASS
  ✅ Outer edge click (170mm): deltaMm = |170 - 170| = 0mm ≤ 5.5mm → PASS
Result: Some clicks fail depending on where in the ring user clicked
```

### Solution Applied ✅

#### Fix 1: Target Ring Center Instead of Outer Edge
- **File**: `src/utils/vision.ts` line 211-230
- **Change**: `canonicalRimTargets()` now targets `doubleCenter = 166mm` instead of `doubleOuter = 170mm`
- **Effect**: All clicks within the ring (162-170mm) are equally close to the target

#### Fix 2: Adjusted Tolerance Values
- **File**: `src/components/Calibrator.tsx` line 371-374
- **Change**: Reduced double ring tolerance from 5.5mm → 4.5mm
- **Effect**: Allows full ring width (8mm) with margin of safety

### New Verification Math:
```
With center target (166mm) + 4.5mm tolerance:
  ✅ Inner edge click (162mm): deltaMm = |162 - 166| = 4mm ≤ 4.5mm → PASS
  ✅ Center click (166mm): deltaMm = |166 - 166| = 0mm ≤ 4.5mm → PASS
  ✅ Outer edge click (170mm): deltaMm = |170 - 166| = 4mm ≤ 4.5mm → PASS
Result: Any click within the ring PASSES verification ✅
```
