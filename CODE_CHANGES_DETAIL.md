# Key Code Changes Reference

## Before: Autoscoring Detection Loop (~2000 lines)
```typescript
// REMOVED: Entire effect hook that:
// - Checked video dimensions
// - Initialized DartDetector
// - Ran detection on each frame
// - Calculated confidence scores
// - Tracked tip stability
// - Managed candidate state
// - Applied autohits with multiple gates
// - Handled bounceouts and fallbacks
// - Drew overlays with scoring visuals

// Replaced with:
// ✅ Just video element rendering
// ✅ Manual entry handling
// ✅ No background processing
```

## Before: Calibration System
```typescript
// REMOVED
const { H, imageSize, overlaySize, theta, rotationOffsetRad, sectorOffset, _hydrated, locked, errorPx } = useCalibration();

// Replaced with: (nothing - not needed for manual scoring)
```

## Before: Complex Detection Types
```typescript
// REMOVED: 150+ lines
type AutoCandidate = {
  value: number;
  ring: Ring;
  label: string;
  sector: number | null;
  mult: 0 | 1 | 2 | 3;
  firstTs: number;
  frames: number;
  lastTip?: { x: number; y: number } | null;
};

type DetectionLogEntry = {
  ts: number;
  label: string;
  value: number;
  ring: Ring;
  confidence: number;
  ready: boolean;
  accepted: boolean;
  warmup: boolean;
  fresh?: boolean;
  rejectReason?: string | null;
  pCal?: Point;
  tip?: Point;
  frame?: string | null;
};
```

## After: Simplified Metadata
```typescript
// NEW: Simple metadata for manual-only scoring
type CameraDartMeta = {
  cameraConnectionValid?: boolean;
  source?: "camera" | "manual";
};
```

## Before: Complex Dart Addition
```typescript
// REMOVED: 200+ lines of
// - Confidence gating
// - Tip stability checking
// - Settled state verification
// - Bounce-out tracking
// - Offline fallback commits
// - Snap commits
// - Motion detection
// - Detection candidate tracking

async function applyAutoHit(candidate: AutoCandidate) {
  // ... 100+ lines of complex logic
}
```

## After: Simple Dart Addition
```typescript
// SIMPLIFIED: Direct dart addition
function addDart(value: number, label: string, ring: Ring, meta?: CameraDartMeta) {
  // Simple validation
  // X01 bust/finish checking
  // Visit commitment
  // That's it!
}
```

## Before: Overlay Drawing (400+ lines)
```typescript
// REMOVED: drawOverlay() function that:
// - Scaled homography to canvas size
// - Drew board rings (bull, double, treble)
// - Drew debug bboxes
// - Drew detection overlays
// - Highlighted big trebles
// - Drew commit flash
// - Drew registered tip markers

function drawOverlay() {
  // 400+ lines of complex canvas drawing
}
```

## After: No Overlay Processing
```typescript
// REMOVED: All overlay effects
// KEPT: Simple video element (that's it!)
```

## Before: State Management (30+ refs/states)
```typescript
// Detection refs (ALL REMOVED)
const autoCandidateRef = useRef<AutoCandidate | null>(null);
const detectionLogRef = useRef<DetectionLogEntry[]>([]);
const boardLockedRef = useRef<boolean>(false);
const boardClearStartRef = useRef<number>(0);
const tipStabilityRef = useRef<{ lastTip: Point | null; stableFrames: number }>(...);
const bounceoutRef = useRef<{ pending: boolean; ... }>(...);
const offlineFallbackRef = useRef<{ sig: string | null; ... }>(...);
const detectionStartRef = useRef<number>(0);
const lastMotionLikeEventAtRef = useRef<number>(0);
const lastOfflineThrowAtRef = useRef<number>(...);
// ... many more

// Calibration refs (ALL REMOVED)
const lastCalibrationSigRef = useRef<string>("none");
const detectorRef = useRef<DartDetector | null>(null);
```

## After: Minimal State
```typescript
// KEPT: Only what's needed for manual scoring
const videoRef = useRef<HTMLVideoElement | null>(null);
const canvasRef = useRef<HTMLCanvasElement>(null);
const previewCanvasRef = useRef<HTMLCanvasElement>(null);
const manualPreviewRef = useRef<HTMLCanvasElement | null>(null);
const timerRef = useRef<number | null>(null);
const pendingDartsRef = useRef<number>(0);
const bullUpFirstDartTakenRef = useRef(false);
```

## Before: Autoscore Provider Integration
```typescript
// REMOVED: 300+ lines
if (autoscoreProvider !== "built-in" && autoscoreProvider !== "built-in-v2") {
  // ... external provider logic
}

// REMOVED: WebSocket subscription
useEffect(() => {
  if (autoscoreProvider !== "external-ws" || !autoscoreWsUrl) return;
  const sub = subscribeExternalWS(autoscoreWsUrl, (d) => {
    // ... provider logic
  });
  return () => sub.close();
}, [autoscoreProvider, autoscoreWsUrl, ...]);
```

## After: Provider Support Removed
```typescript
// REMOVED: No longer needed
// Manual scoring is the only option
```

## Before: Complex Gate Logic
```typescript
// REMOVED: ~500 lines of various gates
const warmupActive = streamingStartMsRef.current > 0 && 
  nowPerf - streamingStartMsRef.current < AUTO_STREAM_IGNORE_MS;
const inOfflineThrowWindow = isOnlineMatch ? true : 
  nowPerf - lastOfflineThrowAtRef.current <= OFFLINE_THROW_WINDOW_MS;
const detectionFresh = Math.min(detectionAgeMs, motionAgeMs) <= MAX_DETECTION_STILL_MS || inOfflineThrowWindow;
const settled = nowPerf - lastMotionLikeEventAtRef.current >= DETECTION_SETTLE_MS;
const tipStable = tipStabilityRef.current.stableFrames >= TIP_STABLE_MIN_FRAMES;
const isGhost = strictScoring ? rawGhost : ring === "MISS";
// ... many more gates
```

## After: No Detection Gates
```typescript
// REMOVED: All detection gating
// Manual entry is direct - user decides correctness
```

## Before: Calibration Validation
```typescript
// REMOVED: ~100 lines
const calibrationValid = !!H && !!imageSize && (
  locked || (errorPxVal != null && errorPxVal <= ERROR_PX_MAX && ...)
);
const calibrationValidEffective = isOnlineMatch ? calibrationValid : hasCalibration;
```

## After: Simplified
```typescript
// REMOVED: Complex validation
// Camera connection status is just for display in diagnostics
```

## UI: Before vs After

### Before: Rich Overlay UI
```
[Board Ring Visualization]
[Treble Highlight]
[Registered Tip Marker]
[Commit Flash]
[Debug Boxes & Axis]
```

### After: Simple Feed
```
[Camera Video Feed]
[Dart Status Dots]
[Timer (optional)]
```

## Manual Entry: Unchanged ✅
```typescript
// This stayed exactly the same:
function parseManual(input: string): { label: string; value: number; ring: Ring } | null {
  // Manual entry parsing logic
}

function onApplyManual() {
  const parsed = parseManual(manualScore);
  if (!parsed) {
    alert("Enter like T20, D16, 5, 25, 50");
    return;
  }
  addDart(parsed.value, parsed.label, parsed.ring);
  setManualScore("");
}
```

## X01 Scoring: Unchanged ✅
```typescript
// This stayed exactly the same:
- Double-in tracking with setOpened()
- Bust detection (after < 0 || after === 1)
- Finish detection (after === 0 && double/bull)
- Pre-opening dart counting
- Double window attempts tracking

// All X01 logic is preserved in addDart()
```

## Visit Management: Simplified ✅
```typescript
// Before: Complex candidate tracking → After: Direct adds
// Before: Confidence gates → After: User validation
// Before: Confidence/ready states → After: Simple pending/committed

// Result: Much cleaner flow
pendingDarts → addDart() → addVisit() → onVisitCommitted()
```

---

## Constants Removed

```typescript
// REMOVED: Autoscoring constants (90+ lines)
const DETECTION_ARM_DELAY_MS = 400;
const DETECTION_MIN_FRAMES = 8;
const AUTO_STREAM_IGNORE_MS = 5000;
const AUTO_COMMIT_MIN_FRAMES = 12;
const AUTO_COMMIT_HOLD_MS = 350;
const AUTO_COMMIT_CONFIDENCE = 0.82;
const AUTO_COMMIT_COOLDOWN_MS = 120;
const TIP_STABLE_MIN_FRAMES = 4;
const TIP_STABLE_MAX_JITTER_PX = 3.2;
const TIP_MOTION_RESET_PX = 10;
const DETECTION_SETTLE_MS = 1800;
const MAX_DETECTION_STILL_MS = 2500;
const OFFLINE_THROW_WINDOW_MS = 3000;
const POST_CALIBRATION_GRACE_MS = 2000;
const SNAP_COMMIT_MIN_MS = 900;
const SNAP_COMMIT_MIN_TIP_STABLE_FRAMES = 5;
// ... many more

// KEPT: Minimal
const TEST_MODE = false;
```

---

## Summary of Removals

| Category | Count | Lines |
|----------|-------|-------|
| Functions | 15+ | 2000+ |
| Types | 7+ | 300+ |
| Effects | 5+ | 1500+ |
| Constants | 20+ | 90+ |
| Imports | 25+ | 50+ |
| State/Refs | 30+ | 200+ |
| **TOTAL** | **~100+** | **~5,800+** |

**Result**: Cleaner, simpler, maintainable codebase focused purely on manual scoring with optional camera connection diagnostics.
