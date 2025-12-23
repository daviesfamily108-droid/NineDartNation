# v2.3: What Happened & The Fix

## Why v2.2 Failed

**v2.1**: 84% / 5.65px ✅
**v2.2**: 80% / 15.72px ❌ (worse!)

Problem: Thresholds too sensitive → False detections → Bad calibration points

## v2.3 Solution

**Revert thresholds** to v2.1 sweet spot
**ADD validation** to filter bad point combinations
**Keep balance** between sensitivity and stability

## Key Change

```typescript
// NEW: Validate rim points are well-distributed
// Check angles between points (should be 90° apart roughly)
// If clustered: Fall back to safe cardinal cross
```

## Expected

- Confidence: 80%+
- Error: Back to 5-7px range (good)
- Status: Stable & reliable

## Test

Snap & detect, should see:
- 80%+ confidence ✅
- 5-7px error ✅ (way better than 15.72px)
- Stable results

---

**Philosophy**: Smart validation beats aggressive thresholds
