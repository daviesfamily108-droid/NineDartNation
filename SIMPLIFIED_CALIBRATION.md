# Simplified Calibration System for Manual-Only Mode

## Overview

The calibration system has been completely simplified to focus **only on camera view locking** for alignment with the dartboard. No complex homography mapping, board-space calculations, or scoring validation is needed since we're in strict **manual-only mode**.

## What Changed

### Before (Complex)
- Homography matrix (H) mapping image → board space
- Error pixel calculations (errorPx)
- Calibration confidence scoring
- Complex board-space validations
- Multiple calibration parameters (theta, sectorOffset, rotationOffsetRad)
- Board clear detection and canvas overlay rendering

### After (Simplified)
- **Only** camera view settings: scale, aspect ratio, fit mode
- **Single lock/unlock mechanism** to persist view for entire session
- No mapping calculations needed
- No board validation logic
- Works identically across offline/online/tournament play

## New Calibration Store (`src/store/calibration.ts`)

```typescript
type CameraViewLock = {
  // Camera alignment/lock state
  locked: boolean;
  lockedAt: number | null;
  // Locked camera view settings
  lockedScale: number | null;
  lockedAspect: "wide" | "square" | null;
  lockedFitMode: "fit" | "fill" | null;
  // Camera ID when locked (for camera switching awareness)
  cameraId: string | null;
};

// Actions
lockCameraView(scale, aspect, fitMode, cameraId) → void
unlockCameraView() → void
reset() → void
```

### Usage Example

```typescript
const { locked, lockedScale, lockedAspect, lockedFitMode, lockCameraView, unlockCameraView } = useCalibration();

// Lock current camera alignment for session
lockCameraView(1.0, "wide", "fit", preferredCameraId);

// Restore locked settings
if (locked && lockedScale) {
  setCameraScale(lockedScale);
  setCameraAspect(lockedAspect);
  setCameraFitMode(lockedFitMode);
}

// Unlock if needed
unlockCameraView();
```

## New Manual-Locked Component

### File: `src/components/CameraView.manual-locked.tsx`

A simplified CameraView designed specifically for manual-only mode:

**Features:**
- ✅ Simple camera alignment controls (zoom, aspect, fit mode)
- ✅ **Lock View** button to persist alignment across entire session
- ✅ Works offline/online/tournament without changes
- ✅ Manual dart entry (no detection)
- ✅ Simple 3-dart visit tracking
- ✅ Bust detection and automatic commit
- ✅ Dart timer support
- ✅ Voice callouts for visit totals

**No longer includes:**
- ❌ Homography calculations
- ❌ Board overlay rendering
- ❌ Calibration confidence checks
- ❌ Complex board mapping
- ❌ Detector gates and vision processing

## Removing Calibration Dependencies

If you want to remove old calibration code from the main `CameraView.tsx`:

### Files to Clean Up
1. **Remove imports:**
   ```typescript
   // Remove these:
   import { getGlobalCalibrationConfidence } from "../utils/gameCalibrationRequirements";
   import type { Homography, Point } from "../utils/vision";
   ```

2. **Remove unused state from `useCalibration` destructure:**
   ```typescript
   // Remove: H, imageSize, overlaySize, theta, rotationOffsetRad, sectorOffset, errorPx
   // Keep: locked, lockedScale, lockedAspect, lockedFitMode
   ```

3. **Remove validation logic:**
   - `calibrationValid` checks
   - `hasCalibration` gates
   - `calibrationValidEffective` logic
   - All `H` and `imageSize` references

4. **Remove overlay drawing:**
   - `drawOverlay()` function
   - Ring drawing code
   - Homography transformations
   - Board detection rendering

## Migration Path

### For Existing Users
1. **Existing calibrations are ignored** - the new system starts fresh
2. **Camera positioning is preserved** - users manually align camera again once
3. **Clicking "Lock View"** - saves that alignment for the entire session across all play modes

### For New Installations
1. Start application
2. Align camera with dartboard (using zoom/aspect/fit controls)
3. Click **"Lock View"**
4. Camera alignment is now locked for offline/online/tournament play
5. Switch between play modes → camera stays locked

## Testing the New System

```typescript
// Test locking/unlocking
const { locked, lockCameraView, unlockCameraView } = useCalibration();

// Lock at 1.1x zoom, wide aspect, fit mode
lockCameraView(1.1, "wide", "fit", "camera-id-123");
expect(locked).toBe(true);

// Verify locked settings are restored
expect(lockedScale).toBe(1.1);
expect(lockedAspect).toBe("wide");
expect(lockedFitMode).toBe("fit");

// Unlock
unlockCameraView();
expect(locked).toBe(false);
```

## Configuration

### Camera View Settings (User Settings)
```typescript
cameraScale: number;           // 0.5 - 1.25x
cameraAspect: "wide" | "square";
cameraFitMode: "fit" | "fill";
```

### Calibration Lock State
When `locked === true`, the `locked*` values override user settings for consistency.

## Key Advantages

✅ **Simpler** - No complex math or calibration procedures  
✅ **Persistent** - Lock once, use everywhere (offline/online/tournament)  
✅ **Reliable** - No calibration validation failures  
✅ **Manual-friendly** - Users align manually, camera remembers choice  
✅ **Consistent** - Same view throughout entire session  

## Components That Use This

- `CameraView.manual-locked.tsx` - Simplified manual-only mode
- Any custom camera alignment UI can use `useCalibration()` hook
- Camera selector/device manager
- Settings UI for camera controls

## Deprecation

The following are no longer used in manual-only mode:
- Complex homography mapping
- Board-space coordinate calculations
- Calibration confidence scoring
- Ring/segment detection
- Board clear logic
- Overlay canvas rendering

These remain available in the codebase for potential future use with auto-scoring, but are not active in manual-only mode.
