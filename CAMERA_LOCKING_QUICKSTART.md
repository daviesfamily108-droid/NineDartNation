# Quick Start: Camera View Locking

## For End Users

### Setup (First Time)
1. **Start the game** → Camera preview appears
2. **Adjust zoom** using −/+ buttons until dartboard fills the view nicely
3. **Choose aspect** (Wide or Square) - typically Wide works better
4. **Choose fit mode** (Full or Wide) 
   - **Full** = shows only dartboard, hides surroundings
   - **Wide** = letterbox with surroundings visible
5. **Click "Lock View"** ← This saves your alignment for the entire session

### Using Locked Camera
- Switch between **Offline** → **Online** → **Tournament** modes
- Camera stays in the exact same position you locked it
- Camera stays locked even if you switch cameras (if available)

### Unlock (If Needed)
- Click **"Unlock"** to allow camera repositioning
- Re-align and lock again if needed

---

## For Developers

### Import & Use

```typescript
import { useCalibration } from "../store/calibration";

function MyCameraComponent() {
  const { locked, lockCameraView, unlockCameraView } = useCalibration();

  return (
    <>
      {locked ? (
        <button onClick={unlockCameraView}>Unlock Camera</button>
      ) : (
        <button onClick={() => lockCameraView(1.0, "wide", "fit", null)}>
          Lock Camera
        </button>
      )}
    </>
  );
}
```

### Get Locked Settings

```typescript
const { lockedScale, lockedAspect, lockedFitMode } = useCalibration();

// Apply them
if (lockedScale) setCameraScale(lockedScale);
if (lockedAspect) setCameraAspect(lockedAspect);
if (lockedFitMode) setCameraFitMode(lockedFitMode);
```

### API Reference

```typescript
type CameraViewLock = {
  locked: boolean;              // Is camera locked?
  lockedScale: number | null;   // Saved zoom (0.5-1.25)
  lockedAspect: "wide" | "square" | null;
  lockedFitMode: "fit" | "fill" | null;
  cameraId: string | null;      // Camera ID when locked
  lockedAt: number | null;      // Timestamp when locked
  createdAt: number | null;     // Creation time
};

// Actions
lockCameraView(scale: number, aspect: string, fitMode: string, cameraId: string | null) → void
unlockCameraView() → void
reset() → void
```

---

## Comparison: Old vs New

| Feature | Old (Complex) | New (Simple) |
|---------|---------------|-------------|
| **Calibration Process** | 5+ steps, complex UI | 1-click lock |
| **Board Mapping** | Yes (homography) | No |
| **Confidence Scoring** | Yes (errorPx %) | No |
| **Validation Gates** | Yes (10+ checks) | No |
| **Persistence** | Per-camera only | Entire session |
| **Setup Time** | 2-5 minutes | 30 seconds |
| **Lines of Code** | 400+ | 50+ |
| **Dependencies** | Vision utils | None |

---

## Troubleshooting

### Camera is blurry or misaligned
→ Adjust zoom (−/+) and aspect (Wide/Square) buttons  
→ Try different fit modes (Full vs Wide)

### Lock button is disabled
→ Make sure camera is started first ("Start Camera" button)

### Camera resets after switching modes
→ Click "Lock View" again to save alignment

### Camera shows but no preview
→ Try "Start Camera" again
→ Check browser camera permissions

### Settings not persisting across sessions
→ **Note:** Current implementation locks for the session only  
→ Consider adding localStorage if persistent storage is needed

---

## Integration with Your Game

### Offline Play
```typescript
// Camera stays locked throughout offline game
const { locked, lockedScale } = useCalibration();
if (locked) {
  applyCameraSettings(lockedScale, ...);
}
```

### Online Play
```typescript
// Camera lock transfers seamlessly to online matches
// No re-calibration needed, players just play
```

### Tournament Mode
```typescript
// Same camera lock works for tournament
// Eliminates setup time between matches
```

---

## Philosophy

**Old approach:** "Perfect the calibration, then score"  
**New approach:** "Align the camera, then score manually"

This shift prioritizes **simplicity** and **reliability** over automatic detection, making it perfect for manual-only mode where the user is the source of truth.

---

## Key Points

✅ **Simple:** 1-click to lock camera alignment  
✅ **Persistent:** Locked for entire session  
✅ **Universal:** Works offline/online/tournament  
✅ **No Magic:** No complex calculations or confidence scores  
✅ **User-Friendly:** Just align and lock  

---

**For questions, see:** `SIMPLIFIED_CALIBRATION.md`
