# CameraView.tsx Refactoring Summary

## Overview
Successfully removed all autoscoring and calibration features from `src/components/CameraView.tsx` and replaced calibration terminology with "Camera Connection".

## Major Changes

### 1. **Removed Imports**
- ❌ `vision` utilities (BoardRadii, drawPolyline, sampleRing, scaleHomography, applyHomography, refinePointSobel, imageToBoard)
- ❌ `useCalibration` hook
- ❌ `scoreFromImagePoint` autoscoring utility
- ❌ `getGlobalCalibrationConfidence`
- ❌ `DartDetector` class
- ❌ `subscribeExternalWS` external scoring
- ❌ `startForwarding`, `stopForwarding` camera handoff
- ❌ Bull distance utilities

### 2. **Removed Features**
- ❌ **Autoscoring/Detection System**: Entire dart detection loop with confidence thresholds, tip stability tracking, bounce-out detection
- ❌ **Calibration System**: All homography-based board mapping and scoring
- ❌ **Overlay Drawing**: Board rings, debug visualizations, big treble highlights
- ❌ **Glare Clamping**: Ring-light and highlight compression filters
- ❌ **External Autoscore Providers**: WebSocket subscriptions and external provider support
- ❌ **Detection Logging**: Detailed detection diagnostic logs
- ❌ **Dart Position Tracking**: Tip refinement, stability checking, motion detection
- ❌ **Warm-up Gates**: Camera warm-up detection and anti-ghost logic

### 3. **Terminology Changes**
- ✅ "Calibration" → "Camera Connection"
- ✅ "calibration-invalid" → "cameraConnectionValid" in metadata
- ✅ "Calibration Overlay" → "Board guides" (optional overlay text only)
- ✅ UI labels updated throughout

### 4. **Simplified Type Definitions**
- **Before**: 300+ lines of detection and logging types
- **After**: 
  - Removed: `AutoCandidate`, `DetectionLogEntry`, `_BounceoutEvent`, `FitTransform`
  - Kept: `VideoDiagnostics`, `Ring`, `CameraDartMeta`

### 5. **Removed Large Code Sections**

#### Detection Effect (~2000 lines)
- Entire detection loop that processed video frames
- Confidence gating logic
- Tip stability and motion tracking
- Offline fallback commits
- Snap commits and bounce-out handling

#### Calibration-Related State
- Removed: `useCalibration()` state subscriptions
- Removed: Homography (H) and image size state
- Removed: Error pixel tracking

#### Overlay Drawing (~400 lines)
- Board ring visualization
- Debug overlays (bboxes, axis lines)
- Treble highlighting
- Commit flash notifications
- Registered tip markers (optional display only)

### 6. **Retained Core Features**
✅ Camera device selection and management
✅ Video stream connection/disconnection
✅ Manual dart entry UI
✅ X01 scoring logic (double-in, bust detection)
✅ Visit management and commitment
✅ Dart timer functionality
✅ Pause/quit controls
✅ Voice callouts for visit totals
✅ Manual preview canvas
✅ Video diagnostics (simplified)

### 7. **Simplified Ref Management**
- Removed: Detection refs, calibration refs, bounce-out refs, tip stability refs
- Kept: Video ref, canvas ref, manual preview ref, timer ref

### 8. **New Simplified State**
- Removed: Detection state, calibration state, overlay state
- Kept: Camera state, scoring state, manual entry state, timer state

## File Size Reduction
- **Before**: ~7,000+ lines
- **After**: ~1,400 lines (~80% reduction)

## API Compatibility
- `CameraViewHandle` interface simplified but maintains test helpers
- `onAutoDart` callback still supported but disabled (autoscoring removed)
- All X01 scoring logic preserved
- Manual entry and visit management fully functional

## Benefits
1. **Simplified Codebase**: Easier to maintain and debug
2. **Reduced Complexity**: No detection/calibration logic to manage
3. **Clearer Intent**: Camera view is purely for manual scoring with camera feed display
4. **Better Performance**: No background CV processing or frame analysis
5. **Lower Cognitive Load**: Fewer side effects and async operations

## Migration Path
If autoscoring needs to be re-added:
1. The old detection logic could be extracted to a separate hook
2. Camera connection status can be monitored via `VideoDiagnostics`
3. Manual scoring provides a fallback path
4. Video stream management is completely independent

## Testing
- ✅ No TypeScript errors
- ✅ All removed references cleaned up
- ✅ Manual scoring path fully functional
- ✅ Camera management functional
- ✅ X01 scoring logic intact
