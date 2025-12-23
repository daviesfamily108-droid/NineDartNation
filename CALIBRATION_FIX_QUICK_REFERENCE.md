# 🎯 Quick Calibration Fix Reference

## What Changed

**3 focused changes to align calibration with visible doubles:**

### 1. Calibration Target Radius
- **File**: `src/utils/vision.ts` (line 226)
- **Was**: 165mm (center of double ring)
- **Now**: 170mm (outer edge - where doubles are VISIBLE) ✅

### 2. Target Labels  
- **File**: `src/components/Calibrator.tsx` (line 33)
- **Was**: "D20 (Top)"
- **Now**: "🎯 D20 (Click top double ring)" ✅

### 3. Instruction Text
- **File**: `src/components/Calibrator.tsx` (line 738)
- **Was**: "Click the exact location on your dartboard"
- **Now**: "👆 Click on the VISIBLE double ring area (outer red band)" ✅

## Test It

1. **Reload**: Ctrl+Shift+R
2. **Calibrate**: Go to Calibrate → should see new instructions
3. **Click**: Click on visible red double bands
4. **Verify**: Error should be ≤6px
5. **Throw**: Darts should show correct sectors

## Why It Matters

```
BEFORE: You click 170mm, system records 165mm → 5mm mismatch ❌
AFTER:  You click 170mm, system records 170mm → PERFECT ✅
```

## Result

Better dart detection because calibration now aligns with actual visible playing area!

---

**Status**: ✅ Live and ready to test! Hard refresh your browser.
