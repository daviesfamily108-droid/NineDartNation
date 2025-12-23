# AUTO-CALIBRATE USES DETECTED RINGS - No Fixed Measurements! ✅

## The Real Solution

You were absolutely RIGHT! The calibration should detect and use the **ACTUAL black ring outlines from YOUR dartboard image**, not rely on fixed measurements.

## What Changed

### Before ❌
```typescript
// Always scaled based on standard dartboard measurements
const scale = detection.r / BoardRadii.doubleOuter;
const bullInner = BoardRadii.bullInner * scale;
const trebleInner = BoardRadii.trebleInner * scale;
// etc...
```

This forced your dartboard to fit standard measurements, which is WRONG if your board is different!

### Now ✅
```typescript
// Uses DETECTED ring positions from your camera image
const detected = (() => {
  const rings = detection.detectedRings || [];
  if (rings.length >= 6) {
    // USE DETECTED RINGS DIRECTLY - these are the actual measurements!
    return {
      bullInner: rings[0],      // Actual detected position
      bullOuter: rings[1],      // Actual detected position
      trebleInner: rings[2],    // Actual detected position
      trebleOuter: rings[3],    // Actual detected position
      doubleInner: rings[4],    // Actual detected position
      doubleOuter: rings[5],    // Actual detected position
    };
  } else {
    // Fallback only if we couldn't detect all rings
    const scale = detection.r / BoardRadii.doubleOuter;
    return { /* scaled version */ };
  }
})();
```

## How It Works

1. **Camera captures your dartboard image**
2. **Detection algorithm scans radially** looking for black ring boundaries
3. **Finds local gradient maxima** at each angle
4. **Extracts 6 ring positions** (bull inner/outer, treble inner/outer, double inner/outer)
5. **Uses THOSE EXACT POSITIONS** for calibration
6. **Overlay matches the actual visible rings** on your board!

## Why This Is Better

- ✅ Works with ANY dartboard (standard or non-standard)
- ✅ No hardcoded measurements needed
- ✅ Overlay exactly matches what the camera sees
- ✅ More accurate calibration
- ✅ Uses the actual physical ring positions from your board image

## What You Should See Now

When you hit **Auto-Calibrate**:
1. The system detects all 6 ring boundaries from your dartboard image
2. Console shows: `[findDartboardRings] Detected ring tiers:` with actual pixel positions
3. The overlay rings snap to match the BLACK CIRCLES on your dartboard
4. Perfect alignment = ready for accurate dart scoring! 🎯

## Fallback

If the detection can't find all 6 rings clearly, it falls back to the scaling method. But with good lighting and contrast, it should detect all of them!

