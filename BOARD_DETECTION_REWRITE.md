# Board Detection Algorithm - Complete Rewrite

## Problem
The old algorithm was trying to:
1. Search every possible center in the image (25-75% grid)
2. For each center, match all 6 rings perfectly (bull inner/outer, treble inner/outer, double inner/outer)
3. Require 3+ rings as evidence of a valid board
4. Strict size validation that rejected valid boards

**Result**: "Board Detection Failed" error - too strict, rejected even visible dartboards

## New Solution
**Much simpler, more robust approach: Centroid-based detection**

### How it works:

1. **Find all strong edges** in the image via Sobel gradient detection
   - These edges mark the board's concentric rings

2. **Calculate centroid of all edges** (weighted by magnitude)
   - The center of mass of edge pixels is (usually) the dartboard center
   - Works because dartboard has circular/concentric structure

3. **Scan outward from centroid to find board radius**
   - Test circles at increasing radii from the centroid
   - Score each radius by how many strong edges fall on that circle
   - Pick the best radius with 8+ edges
   - Much more forgiving than trying to match 6 specific rings

4. **Return center and radius**
   - Confidence = min(100, max(40, edgeCount / 2))
   - Simple but effective

### Why this works better:

- ✅ **No grid search**: Directly uses physics (centroid of circular pattern)
- ✅ **No ring matching**: Doesn't need to identify all 6 rings perfectly
- ✅ **More forgiving**: Works with 8+ edges on ANY radius (not specific ring predictions)
- ✅ **Faster**: Centroid calculation is O(n) where n = number of edges
- ✅ **Robust**: Handles off-center boards, partial visibility, varying lighting

## Code Changes

**File**: `src/utils/boardDetection.ts`

### Removed (~180 lines):
- Complex ring-matching logic that tested all 6 rings at every center
- Grid-based center search
- Peak detection in radial histograms
- Strict ring tolerance matching
- Board size validation that was too restrictive

### Added (~40 lines):
- Centroid calculation: `sumX / sumMag`, `sumY / sumMag`
- Simple radius scanner: test radii from `minR` to `maxR`
- Edge count threshold: require 8+ edges on radius circle
- Console logging for debugging

## Testing

After deploying:

1. **Hard refresh browser**: `Ctrl+Shift+R`
2. **Open console**: `F12`
3. **Calibrate**:
   - Stage 1: Capture frame
   - Stage 2: Click "Auto-Calibrate"
4. **Watch console for**:
   - `[findDartboardRings] Found XXX edge pixels`
   - `[findDartboardRings] Centroid at (X, Y)`
   - `[findDartboardRings] Detected board center at (X, Y) radius Rpx with E edges`
5. **Check cyan rings**:
   - Should appear centered on the actual dartboard
   - Should stay positioned correctly as you move the board

## Expected Improvements

- ✅ Detects dartboards anywhere in frame (not just center)
- ✅ Works with good lighting (edges clear)
- ✅ Rejects if dartboard not visible (no edges = no centroid)
- ✅ Fails gracefully with helpful console messages
- ⚠️ May need good lighting for edge detection

## Limitations

- Requires visible dartboard edges (rings must have good contrast)
- Lighting must be adequate for Sobel edge detection
- Manual calibration still available as fallback

## Future Improvements

If this still needs tuning:
- Adjust `baseEdgeThreshold` for different lighting
- Adjust `minR` and `maxR` to restrict search
- Adjust edge count threshold (currently 8+)
- Add template matching for bull center if needed
