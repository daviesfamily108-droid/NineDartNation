# Dartboard Boundary Detection - Visual Guide

## The Problem (Before Fix)

```
┌─────────────────────────────────────────────────┐
│                  Camera Feed                    │
│                                                 │
│    ┌──────────────────────────────┐            │
│    │   Physical Dartboard         │            │
│    │   (170mm = double outer)     │            │
│    │                              │            │
│    │    ROI 1.08x (184mm)         │◄── TOO BIG!
│    │ ┌──────────────────────────┐ │            │
│    │ │                          │ │            │
│    │ │   Real Darts Here ✓      │ │            │
│    │ │                          │ │            │
│    │ └──────────────────────────┘ │            │
│    │    Background also detected  │◄── FALSE   │
│    │    (shadows, reflections)    │    POSITIVE│
│    │                              │            │
│    └──────────────────────────────┘            │
│                                                 │
│         Detection Sensitivity: LOW              │
│         (picks up background noise)             │
│                                                 │
└─────────────────────────────────────────────────┘

Result: Scoring triggers without throws, wrong locations detected
```

## The Solution (After Fix)

```
┌─────────────────────────────────────────────────┐
│                  Camera Feed                    │
│                                                 │
│    ┌──────────────────────────────┐            │
│    │   Physical Dartboard         │            │
│    │   (170mm = double outer)     │            │
│    │                              │            │
│    │    ROI 0.98x (167mm) ✓       │◄── RIGHT!  │
│    │ ┌────────────────────────┐   │            │
│    │ │                        │   │            │
│    │ │  Real Darts Here ✓     │   │            │
│    │ │                        │   │            │
│    │ │  Detected ONLY here    │   │            │
│    │ └────────────────────────┘   │            │
│    │                              │            │
│    │   Background IGNORED ✓       │◄── NO      │
│    │                              │    FALSE   │
│    └──────────────────────────────┘            │
│                                                 │
│         Detection Sensitivity: HIGH             │
│         (requires large blobs & contrast)       │
│         (proximity check ensures board center)  │
│                                                 │
└─────────────────────────────────────────────────┘

Result: Only real darts detected, accurate scoring
```

## Parameter Changes

### ROI Boundary
```
BEFORE:  roiR = radius × 1.08 → extends beyond board
AFTER:   roiR = radius × 0.98 → stays within board
         
         170mm × 1.08 = 184mm (includes background) ❌
         170mm × 0.98 = 167mm (excludes background) ✓
```

### Detection Sensitivity (Default Cameras)

```
BEFORE:
┌──────────────────────────────┐
│ Min Area: 80 pixels          │  ← Too sensitive
│ Threshold: 20                │    (picks up noise)
│ Confidence: 0.75             │
└──────────────────────────────┘

AFTER:
┌──────────────────────────────┐
│ Min Area: 120 pixels (+50%)  │  ← Stricter
│ Threshold: 24 (+20%)         │    (only real darts)
│ Confidence: 0.75             │
└──────────────────────────────┘
```

### Low-Resolution Cameras (e.g., phones)

```
BEFORE:
├─ Min Area: 50 pixels
└─ Threshold: 18

AFTER:
├─ Min Area: 70 pixels (+40%)
└─ Threshold: 20 (+11%)
```

### Proximity Check (NEW)

```
BEFORE:
- Detect dart
- Score it (wherever it maps)
❌ Fails if homography is slightly off

AFTER:
- Detect dart
- Check: Is it within 175mm of board center?
- Check: Does it map to valid board location?
- Score it ONLY if both checks pass
✓ Extra safety layer
```

## Detection Flow

### Before (False Positives)
```
Background area with texture
        ↓
Large enough blob? → Check if 80+ pixels
        ↓
Yes → Intensity change > 20? 
        ↓
Yes → Map to board coordinates
        ↓
Score it! ✗ Wrong location or no dart thrown
```

### After (Only Real Darts)
```
Background area with texture
        ↓
Large enough blob? → Check if 120+ pixels (filtered!)
        ↓
No → Reject (background noise)
        ↓
Yes → Intensity change > 24? (higher threshold!)
        ↓
No → Reject (not enough contrast)
        ↓
Yes → Map to board coordinates
        ↓
Within board center ±175mm? (proximity check!)
        ↓
No → Reject (likely homography error)
        ↓
Yes → Score it! ✓ Accurate detection
```

## Real-World Impact

### Scenario 1: Throwing a Dart
```
BEFORE:                          AFTER:
Dart thrown                      Dart thrown
    ↓                                ↓
Detected (maybe) ⚠️              Detected ✓
    ↓                                ↓
Correct location (sometimes)     Correct location ✓
    ↓                                ↓
Score updated ⚠️                 Score updated ✓
```

### Scenario 2: Hand Reaching for Dartboard
```
BEFORE:                          AFTER:
Hand moves near board            Hand moves near board
    ↓                                ↓
Motion detected in background    Motion outside ROI
    ↓                                ↓
Large area? Check 80px           Ignored ✓
    ↓                                ↓
Sometimes yes → False positive ❌  
    ↓
Unexpected score update          (No false score)
```

### Scenario 3: Lighting Changes
```
BEFORE:                          AFTER:
Light reflection on board        Light reflection on board
    ↓                                ↓
Detected as blob                 Detected as blob
    ↓                                ↓
Intensity > 20? Yes ❌           Intensity > 24? No ✓
    ↓                                ↓
Score updated (wrong)            Ignored
```

## Configuration Reference

```typescript
// All detection parameters in CameraView.tsx

// Default cameras (e.g., USB webcams, computer camera)
minArea = 120     // pixels
thresh = 24       // intensity threshold
requireStableN = 3 // frames to confirm

// Low-res cameras (e.g., smartphones)
minArea = 70      // pixels
thresh = 20       // intensity threshold
requireStableN = 2 // frames to confirm

// Module-level constant
MIN_DETECTION_AREA = 1500  // pixels (prevents tiny false positives)

// ROI boundary
roiR = radius * 0.98  // 98% of board outer radius

// Validation checks
- isPointOnBoard(pBoard)  // Must map within board
- boardCenterProximityOk   // Must be ≤175mm from center
- calibrationGood          // Calibration error acceptable
- tipInVideo              // Dart visible in video frame
- pCalInImage             // Coordinates within image
```

## Testing the Fix

✓ **Throw darts** - Should detect and score correctly
✓ **Move hands** - Should NOT trigger scoring
✓ **Change lighting** - Should NOT cause false scores
✓ **Multiple throws** - Consistent accuracy across throws
✓ **Different board locations** - Accurate regardless of position

## Expected Improvements

| Metric | Before | After |
|--------|--------|-------|
| False positives | Frequent | Rare |
| Missed real darts | Occasional | Rare |
| Wrong location scoring | Sometimes | Almost never |
| Background interference | High | Eliminated |
| Lighting sensitivity | High | Low |
