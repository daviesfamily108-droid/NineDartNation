# 🎯 AUTO-CALIBRATE FIX - QUICK REFERENCE

## What Was Wrong
```
Click Auto-Calibrate → Site crashes → No cyan lines
```

## What Was Fixed
```
Removed call to non-existent refineRingDetection() function
Now uses detectBoard() directly ✅
```

## What Changed
- **File**: `src/components/Calibrator.tsx`
- **Line**: 2573
- **Change**: One line fix
  ```diff
  - const refined = refineRingDetection(boardDetection);
  + const refined = detectBoard(canvasRef.current);
  ```

## Test Results
✅ All 95 unit tests passing  
✅ Build successful  
✅ No breaking changes

## How to Test Now

1. **Settings → Calibrator**
2. **Capture dartboard**
3. **Click "🔄 Auto-Calibrate (Advanced)"**
4. **You should see cyan ring lines appear** ✅

## Status
🟢 **FIXED - READY TO USE**

---

*This fixes the site crash when clicking Auto-Calibrate.*
