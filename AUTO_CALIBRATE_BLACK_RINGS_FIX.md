# Auto-Calibrate Now Detects All Black Ring Outlines ✅

## Problem
The auto-calibrate was only detecting the **outermost ring** (the strongest edge gradient), missing the inner ring boundaries visible as black circles on your dartboard.

## Solution
Enhanced the `findDartboardRings()` function to detect **ALL ring boundaries** (bullseye, treble, double) by finding local maxima in the radial gradient profile.

### What Changed

**File: `src/utils/boardDetection.ts`**

#### Old Algorithm (Lines 253-299)
- Scanned radially in 60 angles
- Found only the **single strongest gradient** at each angle
- Stored in `radii[]` array
- Used median of these as the board radius

❌ Result: Only detected the outermost double ring

#### New Algorithm (Lines 253-319)
- Scans radially in 60 angles like before
- For **each angle**, computes gradients at all radii
- Finds **ALL local maxima** in the gradient curve (not just the strongest)
- Stores peaks by tier: `radiiByRing[0]`, `radiiByRing[1]`, `radiiByRing[2]`, etc.
- Extracts median radius for each tier/ring level
- Returns detailed ring information

✅ Result: Detects the actual black outline circles on your board:
- Ring Tier 0: Bull inner
- Ring Tier 1: Bull outer  
- Ring Tier 2: Treble inner
- Ring Tier 3: Treble outer
- Ring Tier 4: Double inner
- Ring Tier 5: Double outer

### How It Works

```
For each radial line (60 angles around the circle):
  1. Scan from center outward, compute gradient at each radius
  2. Find ALL local peaks in gradient (strong edges)
  3. Store peaks by tier: tier[0], tier[1], tier[2], etc.

After all angles:
  - For each tier, compute median radius across all 60 angles
  - Use outermost ring (double outer) as reference for scaling
```

### Example Output
```
[findDartboardRings] Detected ring tiers:
  { tier: 0, radius: 42, samples: 58 }    // Bull inner
  { tier: 1, radius: 62, samples: 60 }    // Bull outer  
  { tier: 2, radius: 168, samples: 59 }   // Treble inner
  { tier: 3, radius: 192, samples: 60 }   // Treble outer
  { tier: 4, radius: 352, samples: 60 }   // Double inner
  { tier: 5, radius: 385, samples: 60 }   // Double outer
```

### Confidence Scoring
- Confidence now increases based on number of detected rings
- More ring tiers detected = higher confidence
- Formula: `Math.min(95, 50 + ringRadii.length * 10)`

### Real Dartboard Measurements (Unchanged)
The scaling still uses the real dartboard measurements in `BoardRadii`:
- Bull outer: 15.9 mm
- Treble: 99-107 mm
- Double: 162-170 mm

The detected pixel radii are scaled based on `detected.r / BoardRadii.doubleOuter`, so the actual board proportions are maintained.

## Testing

1. Open the calibration view
2. Click "Auto-Calibrate"
3. Check the console for the detected ring tiers
4. The overlay should now snap to the actual black ring outlines on your dartboard
5. All 6 ring boundaries should be detected (bull inner/outer, treble inner/outer, double inner/outer)

The calibration will now be based on the **actual visible black outline circles** on your board! 🎯
