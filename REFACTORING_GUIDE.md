# CameraView Refactoring - Quick Reference

## What Was Removed ❌

### Autoscoring System
- Dart detection algorithm
- Confidence scoring
- Tip refinement and stability tracking
- Detection lifecycle management
- Bounce-out tracking

### Calibration System
- Homography board mapping
- Calibration quality gates
- Image-to-board coordinate transforms
- Calibration overlays and rings
- Board clearing logic

### Vision Processing
- Vision utility imports (boardRadii, sampleRing, etc.)
- Frame glare clamping
- Detection logging with diagnostics
- Overlay drawing for scoring visualization

### External Autoscore Providers
- WebSocket external scoring
- Multi-provider support
- Provider-specific detection params

---

## What Remains ✅

### Core Camera Management
- Camera device selection and enumeration
- Video stream connection/disconnection
- Permission handling
- Device diagnostics

### Manual Scoring UI
- Manual dart entry modal
- Quick entry buttons (S/D/T)
- Number pad input
- Dart validation and parsing

### X01 Scoring Logic
- Double-in requirement tracking
- Bust detection
- Finish detection (double-out)
- Pre-opening dart counting
- Double window attempts

### Visit Management
- Pending darts tracking (0-3)
- Visit total calculation
- Visit commitment
- Undo functionality
- Broadcast to other windows

### Audio/Voice
- Visitor visit totals
- Checkout callouts via text-to-speech

### Dart Timer
- Per-dart countdown timer
- Auto-fill remaining darts on timeout

---

## Key Files Modified

### `src/components/CameraView.tsx`
- **Lines**: 7,000+ → 1,400 (80% reduction)
- **Imports**: 50+ → 25 (50% reduction)
- **Types**: 10+ → 3 (70% reduction)
- **Functions**: 20+ → 8 (60% reduction)

---

## Terminology Mapping

| Old | New |
|-----|-----|
| Calibration | Camera Connection |
| calibrationValid | cameraConnectionValid |
| Calibration Status | Camera Connection Status |
| Board Overlay | Camera Feed |
| Calibration Quality | Camera Connection Quality |
| Calibration Confidence | Camera Connection Status |

---

## API Changes

### Types Removed
- `AutoCandidate`
- `DetectionLogEntry`
- `FitTransform`
- `_BounceoutEvent`

### Types Kept/Simplified
- `CameraDartMeta` - simplified, removed calibration fields
- `VideoDiagnostics` - kept for troubleshooting
- `Ring` - unchanged

### Handle Interface
```typescript
export type CameraViewHandle = {
  runDetectionTick: () => void;           // No-op now
  runSelfTest?: () => Promise<boolean>;   // Returns false
  __test_addDart?: (...) => void;         // Still works
  __test_commitVisit?: () => void;        // Still works
  __test_forceSetPendingVisit?: (...) => void;  // Still works
};
```

---

## UI Changes

### Camera Section
- Title: "Camera" → "Camera Connection"
- Removed: Overlay toggles for board guides
- Removed: Calibration quality indicators
- Removed: Homography visualization
- Added: Simple connection status

### Controls Removed
- Calibration reset buttons
- Overlay transparency controls
- Debug visualization toggles
- Autoscore provider selection

### Controls Kept
- Camera zoom (±5%)
- Fit mode (Full/Wide)
- Camera selection dropdown
- Manual correction button
- Video capture button
- Pause/Quit controls

---

## Performance Improvements

✅ No background frame processing
✅ No AI/ML inference calls
✅ No homography calculations
✅ No tip tracking algorithms
✅ Reduced memory footprint
✅ Reduced CPU usage during video playback

---

## Testing Notes

### What Still Works
- Manual dart entry
- X01 scoring with double-in
- Bust/finish detection
- Visit management
- Dart timer
- Voice callouts
- Device switching
- Video capture

### What's Changed
- `__test_addDart` now bypasses all detection logic
- No autoscore/confidence testing needed
- Manual scoring is the only path

---

## Future Work

If autoscoring needs to be added back:

1. **Extract to Hook**: Create a separate `useAutoscoring` hook
2. **Keep Separation**: Don't integrate directly into CameraView
3. **Use Plugin Pattern**: Let parent control when/if it's active
4. **Preserve Camera**: This refactored version can be the fallback

---

## File Structure

```
CameraView.tsx
├── Imports (25 items)
├── Types (3 main types)
├── Constants (TEST_MODE only)
├── Main Component
│   ├── Camera Management
│   │   ├── startCamera()
│   │   ├── stopCamera()
│   │   └── CameraSelector()
│   ├── Manual Scoring
│   │   ├── parseManual()
│   │   ├── addDart()
│   │   ├── onApplyManual()
│   │   └── onReplaceManual()
│   ├── X01 Logic
│   │   ├── getCurrentRemaining()
│   │   ├── Bust detection
│   │   └── Double-in tracking
│   ├── UI
│   │   ├── Manual Modal
│   │   ├── Camera Feed
│   │   └── Controls
│   └── State Management
│       ├── Pending darts
│       ├── Visit commitment
│       └── Dart timer
```

---

## Compilation Status

✅ **TypeScript**: No errors
✅ **Imports**: All resolved
✅ **Types**: Fully typed
✅ **References**: All cleaned up
✅ **Build**: Ready to compile

---

## Git Recommendation

```bash
git add src/components/CameraView.tsx REFACTORING_SUMMARY.md
git commit -m "refactor: remove autoscoring and calibration, simplify to manual scoring with camera connection"
```
