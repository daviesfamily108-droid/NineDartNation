# Autoscoring Removal Plan

## Status
User wants to remove ALL autoscoring functionality and revert to manual scoring only.

## Changes Made So Far
1. ✅ Set `autoscoreProvider = "manual"` (hardcoded)
2. ✅ Set `autoscoreWsUrl = undefined`

## Key Changes Still Needed

### In `src/components/CameraView.tsx`:

1. **Disable autoscoreEnabled** - Force to false
2. **Set manualOnly = true** - This disables the entire detection loop
3. **Remove/comment out** the massive detection effect that starts around line 6480+
4. **Remove refs** - All the detector/detection related refs can be cleaned up
5. **Remove state** - detectionLog, lastDetection, etc.
6. **Remove effects** - The detection effect, external WS subscription effect

###Files that reference autoscoring to check:
- `src/store/userSettings.ts` - Autoscore provider selection
- `src/utils/dartDetector.ts` - The detector itself
- `src/utils/autoscore.ts` - Autoscore utilities
- Tests files

## Simple Fix

The simplest approach is to make manualOnly ALWAYS true by setting:
```typescript
const manualOnly = true; // FORCED: Manual-only mode, autoscoring disabled
```

This will automatically disable:
- All detection loops
- All auto-scoring logic
- Confidence thresholds
- Detection armed state
- Camera diagnostics for detection

And will keep working:
- Manual dart entry
- Camera preview
- Visit management
- Manual scoring UI

## Testing
After changes:
1. Manual dart entry should work
2. Pending darts visualization should work
3. Visit commits should work
4. Camera should still stream (for preview only)
