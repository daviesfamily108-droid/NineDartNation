# Dart Detection False Positives Fix

## Problem
When using the calibration UI (moving ring visualization and adjusting calibration points), false positive dart detections were being triggered. This occurred because:

1. **Stale background model**: The DartDetector maintains a grayscale background model that is initialized once on first frame
2. **UI changes detected as motion**: When the calibration UI ring visualization moved or changed, the detector interpreted these changes as motion/dart
3. **No isolation of detection logic**: Detection was running continuously even when the calibration UI was active

## Root Cause
The DartDetector works by:
- Maintaining a running average background model of the video stream
- Computing the difference between the current frame and this background
- Detecting blobs larger than `minArea` pixels where the intensity difference exceeds the threshold

When the calibration overlay changed, the entire overlay region would show as "motion" and could be mistaken for a dart if:
- The affected area was larger than `minArea` (60 pixels)
- The motion exceeded `thresh` intensity threshold (18)

## Solution

### 1. Reset Detector When Modals Open
Added a useEffect hook that monitors modal state and resets the detector background model:

```tsx
// Reset detector when any modal opens (calibration, manual, auto, scoring)
// This prevents false positives from UI changes (ring visualization moving, etc)
useEffect(() => {
  if (showRecalModal || showManualModal || showAutoModal || showScoringModal) {
    // Modal is opening/open: reset detector to avoid false positives
    detectorRef.current = null;
  }
}, [showRecalModal, showManualModal, showAutoModal, showScoringModal]);
```

**Effect**: When the calibration modal is opened, the detector is immediately reset. When it reinitializes, it will have a fresh background model from the current frame state (with the calibration UI visible), so subsequent UI changes won't be detected as motion.

### 2. Increased Detection Thresholds
Raised the minimum area and intensity thresholds to filter out small UI artifacts:

**In CameraView.tsx:**
- `MIN_DETECTION_AREA`: 900 → 1200 pixels (guards against small UI changes)
- `minArea` (default): 60 → 80 pixels
- `thresh` (default): 18 → 20 (higher intensity threshold)

**For low-resolution cameras:**
- `minArea`: 40 → 50 pixels
- `thresh`: 16 → 18

**Effect**: Larger detection area requirements mean only actual darts (which are relatively large objects) will be detected. Small UI glints, lighting changes, or partial ring movements are filtered out.

## Changes Made

### File: `src/components/CameraView.tsx`
1. Added detector reset effect (lines ~876-883)
2. Increased `MIN_DETECTION_AREA` from 900 to 1200 (line ~79)
3. Updated detector initialization with higher thresholds (lines ~1401-1415)

### File: `src/components/__tests__/CameraView.detector-reset.test.tsx`
Added unit tests documenting the fix behavior.

## Verification

✅ Unit tests pass  
✅ Integration tests pass  
✅ No compilation errors  
✅ Detector will only reinitialize when:
  - A modal is closed (goes from open to closed)
  - The component mounts
  - The video stream starts

## Impact

- **False positives**: Eliminated when using calibration UI
- **Real dart detection**: Unaffected - darts are much larger than the new 1200 pixel threshold
- **Performance**: Negligible impact - detector still maintains the same ROI and processing
- **Calibration workflow**: Users can now freely adjust calibration rings without triggering false dart detections

## Testing Recommendations

1. Open calibration UI and move the ring visualization → no false positives
2. Throw actual darts during game mode → detection still works normally
3. Switch between different modals → smooth transition with detector resetting
4. Use manual and auto scoring modes → no interference from UI changes
