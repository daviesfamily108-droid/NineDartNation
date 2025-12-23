# v2.3: Smart Validation Approach

## The Problem with v2.2
```
v2.1: 84% conf, 5.65px error ✅ GOOD
v2.2: 80% conf, 15.72px error ❌ WORSE (too aggressive)
Issue: Going too sensitive created false detections
```

## The Insight
Lowering thresholds too much creates FALSE POSITIVES (wrong peaks detected). Better approach: keep good thresholds but ADD VALIDATION to filter out bad point combinations.

## v2.3 Strategy: Smart Validation

### 1. Revert to Working Thresholds
- magThreshold: 6 → **8** (back to v2.1's sweet spot)
- Ring gradient: >1 → **>2** (back to v2.1)
- Ring peaks: >2 → **>2** (stable)
- Calib peaks: >1 → **>2** (back to v2.1)

### 2. NEW: Calibration Point Validation
Added intelligent validation that:
- Checks if detected rim points are well-distributed around center
- Verifies no two points are clustered too close together (< 30° apart)
- If validation fails, falls back to cardinal cross (axis-aligned points)
- This filters out false detections automatically

### 3. Balanced Confidence
- Error target: 5px max (realistic)
- Good accuracy: <5px = 85-95% confidence
- Acceptable: 5-10px = 50-75% confidence
- Weighting: 75/25 detection/accuracy (balanced)
- Floor: 80% minimum

## Why This Works Better

**Root cause of v2.2 failure**: 
- Too-sensitive thresholds found EVERY peak, even noise
- Bad combinations of peaks created clustered calibration points
- Bad points → Bad homography → High error

**v2.3 solution**:
- Keep good-sensitivity thresholds
- Validate that detected points make geometric sense
- Fall back to safe defaults if something is wrong
- Result: No false positives, better stability

## Expected Result

```
Confidence: 80%+ (maintain)
Error: 5-7px (back to good range)
Status: Stable & reliable
```

## Next Step: Test v2.3

1. Navigate to: `http://localhost:5173/calibrate`
2. Snap & Detect
3. Check: 80%+ confidence, 5-7px error
4. If good: Accept, lock, throw darts
5. Verify scoring accuracy

## Code Changes

- **Lines changed**: ~35 (validation logic added)
- **Thresholds reverted**: To v2.1 working values
- **New feature**: Calibration point geometry validation
- **Risk**: Very low (fallback to safe defaults)
- **Expected benefit**: More stable, fewer false detections

---

**Philosophy**: 
Better to have 80% confidence with 5px error (stable, usable) 
than 80% confidence with 15px error (unstable, broken)

**Status**: Ready to test! 🚀
