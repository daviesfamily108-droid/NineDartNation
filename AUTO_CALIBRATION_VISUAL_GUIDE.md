# Auto-Calibration Visual Walkthrough

## User Journey

### Step 1: Open Calibration Page
```
┌─────────────────────────────────────┐
│ Nine Dart Nation                    │
│ CALIBRATE YOUR CAMERA               │
├─────────────────────────────────────┤
│ Camera: [Select Camera ▼]           │
│ Status: Camera Not Selected         │
│                                     │
│ 🎥 Camera Feed Loading...           │
│                                     │
└─────────────────────────────────────┘
```

### Step 2: Select Camera & See Live Feed
```
┌─────────────────────────────────────┐
│ Camera: [Front Camera ▼]            │
│ Status: ✓ Camera Ready              │
├─────────────────────────────────────┤
│        [Live Camera Feed]           │
│   [Dartboard visible in frame]      │
│                                     │
│        Position dartboard           │
│     at 45° angle like this:         │
│                                     │
│            ╱╱╱╱                     │
│           ╱board╱                   │
│          ╱╱╱╱                       │
│        📷 camera                    │
│                                     │
└─────────────────────────────────────┘
```

### Step 3: Choose Your Method

#### Option A: Auto-Calibrate (NEW! ⭐)
```
┌─────────────────────────────────────┐
│ ACTION BUTTONS:                     │
│                                     │
│  ↶ Undo    🔄 Reset                │
│                                     │
│  📸 Snap & Auto-Calibrate ← CLICK   │
│    (New automatic feature!)         │
│                                     │
│  Or use manual calibration below    │
└─────────────────────────────────────┘

       User clicks button...
              ↓
      ⏳ Processing...
              ↓
```

#### Option B: Manual Calibrate (Traditional)
```
┌─────────────────────────────────────┐
│ MANUAL CALIBRATION:                 │
│ (Click these 5 points on board)     │
│                                     │
│ 1. D20 sector rim      [  ]         │
│ 2. D6 sector rim       [  ]         │
│ 3. D3 sector rim       [  ]         │
│ 4. D11 sector rim      [  ]         │
│ 5. Bull's eye (center) [  ]         │
│                                     │
│ (Then lock calibration manually)    │
└─────────────────────────────────────┘
```

### Step 4: Auto-Detection Results Modal

#### Success Path 🎉
```
┌──────────────────────────────────────────────┐
│ 🎯 Auto-Detection Results                  ✕ │
├──────────────────────────────────────────────┤
│ ✓ Board detected successfully!               │
│                                              │
│ ┌──────────────┬──────────────┐              │
│ │ Confidence   │ Error        │              │
│ │              │              │              │
│ │    87%       │   2.3 px     │              │
│ └──────────────┴──────────────┘              │
│                                              │
│ Detected Features:                           │
│ ✓ Board center located                       │
│ ✓ Ring boundaries identified                 │
│ ✓ Board orientation detected                 │
│ ✓ Camera angle: 45.2°                        │
│                                              │
│  [✓ Accept & Lock]  [Retry]                  │
└──────────────────────────────────────────────┘

     User clicks "Accept & Lock"
              ↓
```

#### Failure Path 🔄
```
┌──────────────────────────────────────────────┐
│ 🎯 Auto-Detection Results                  ✕ │
├──────────────────────────────────────────────┤
│ ✗ Board detection failed                     │
│ Error: Insufficient ring detection           │
│                                              │
│ Detection Tips:                              │
│ • Ensure dartboard is fully visible          │
│ • Make sure board is well-lit                │
│ • Try different camera angles                │
│ • Clean camera lens if blurry                │
│                                              │
│      [Retry]      [Manual Mode]              │
└──────────────────────────────────────────────┘

  User can: Retry or Fall back to 5-click
```

### Step 5: Angle Adjustment Panel (Auto-Appears if Angled)

```
┌──────────────────────────────────────────────┐
│ 🎯 Camera Angle Adjustment                   │
├──────────────────────────────────────────────┤
│ Your camera is at an angle.                  │
│ Fine-tune these settings for perfect         │
│ accuracy from any position.                  │
│                                              │
│ Board Rotation                      45.2°    │
│ ├─────●────────────────────┤                │
│ -180°                    +180°               │
│ ✓ Camera is rotated 45.2° clockwise          │
│                                              │
│ Sector Fine-Tune                        0    │
│ ├────────────●──────────────┤                │
│  -5                      +5                  │
│ Adjust by sector if darts still score        │
│ wrong sectors (0 = automatic detection)      │
│                                              │
│ Next step: Throw one dart to test            │
│ • Check if it scores at correct location     │
│ • If still wrong, adjust the sliders above   │
│ • Repeat until perfect accuracy              │
│                                              │
│ [✓ Save & Test]  [Skip]                      │
└──────────────────────────────────────────────┘

    User tests with one dart...
```

### Step 6: Game Ready 🎯

```
┌──────────────────────────────────────────────┐
│ CALIBRATION COMPLETE! ✅                     │
│                                              │
│ ✓ Board calibrated                           │
│ ✓ Homography computed                        │
│ ✓ Camera angle detected                      │
│ ✓ Ready to play                              │
│                                              │
│ Your calibration:                            │
│ • Confidence: 87%                            │
│ • Error: 2.3 pixels                          │
│ • Camera angle: 45.2° CW                     │
│ • Sector offset: 0                           │
│                                              │
│     [Start Playing] [Go Back]                │
└──────────────────────────────────────────────┘
```

## Visual Comparison: Before vs After

### BEFORE (Manual 5-Click Method)
```
┌─────────────┐
│ Camera Feed │
│             │
│  [board]    │
└─────────────┘
       ↓
    Click D20 ✓
       ↓
    Click D6  ✓
       ↓
    Click D3  ✓
       ↓
    Click D11 ✓
       ↓
    Click Bull ✓
       ↓
   5 clicks done!
       ↓
  [Wait for homography]
       ↓
  Calibration locked
       ↓
  (Tedious & time-consuming)
       ↓
  Ready to play
       ↓
    ~30-60 seconds
```

### AFTER (Auto-Snap Method)
```
┌─────────────┐
│ Camera Feed │
│             │
│  [board]    │
└─────────────┘
       ↓
  Click Snap Button
       ↓
  [Auto-detection runs]
       ↓
  Modal shows results
       ↓
  Click "Accept & Lock"
       ↓
  [Angle adjustment auto-appears]
       ↓
  Click "Save & Test"
       ↓
  Ready to play
       ↓
   ~1-2 seconds
```

## UI Button Reference

### Primary Actions
```
┌──────────────────────────────────────────────┐
│ 🔒 Lock Calibration                          │
│    (Use when 5-click manual method complete) │
│    Color: Green gradient with shadow         │
│    Enabled when: 5 points clicked            │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 📸 Snap & Auto-Calibrate                     │
│    (NEW! Auto-detect from board photo)       │
│    Color: Purple gradient with shadow        │
│    Enabled when: Camera ready, not locked    │
│    Loading: 🔍 Detecting...                  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 🔓 Recalibrate                               │
│    (Unlock to try a different calibration)   │
│    Color: Blue gradient with shadow          │
│    Visible when: Calibration is locked       │
└──────────────────────────────────────────────┘
```

### Secondary Actions
```
┌──────────────────────────────────────────────┐
│ ↶ Undo                                       │
│    Remove last clicked point (manual mode)   │
│    Color: Dark slate                         │
│    Enabled when: Points clicked              │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 🔄 Reset                                     │
│    Clear all points and restart              │
│    Color: Dark slate                         │
│    Enabled when: Any points clicked          │
└──────────────────────────────────────────────┘
```

## Modal States

### Loading State
```
┌──────────────────────────────────────────┐
│ 📸 Snap & Auto-Calibrate                │
│                                          │
│     🔍 Detecting...                      │
│                                          │
│    (Button disabled, shows spinner)      │
│    (Usually takes < 500ms)               │
└──────────────────────────────────────────┘
```

### Success Modal
```
┌──────────────────────────────────────────┐
│ 🎯 Auto-Detection Results             ✕  │
├──────────────────────────────────────────┤
│ ✓ Board detected successfully!           │
│                                          │
│ ┌─────────────────────────────────────┐  │
│ │ Confidence: 87%  │  Error: 2.3 px  │  │
│ └─────────────────────────────────────┘  │
│                                          │
│ ✓ Board center located                   │
│ ✓ Ring boundaries identified             │
│ ✓ Board orientation detected             │
│ ✓ Camera angle: 45.2°                    │
│                                          │
│ [✓ Accept & Lock]    [Retry]             │
└──────────────────────────────────────────┘
```

### Error Modal
```
┌──────────────────────────────────────────┐
│ 🎯 Auto-Detection Results             ✕  │
├──────────────────────────────────────────┤
│ ✗ Board detection failed                 │
│                                          │
│ Detection Tips:                          │
│ • Ensure dartboard is fully visible      │
│ • Make sure board is well-lit            │
│ • Try different camera angles (45°-90°) │
│ • Clean camera lens if blurry            │
│                                          │
│     [Retry]      [Manual Mode]           │
└──────────────────────────────────────────┘
```

## Success Indicators

✅ **Visual Feedback When Clicking Snap:**
```
Initial State:
  Button: "📸 Snap & Auto-Calibrate" (purple, clickable)

During Detection:
  Button: "🔍 Detecting..." (purple, disabled, grayed out)

After Success:
  Modal: Green checkmark + "✓ Board detected successfully!"
  Confidence: "87%" in cyan text
  Error: "2.3 px" in green text

After Failure:
  Modal: Red X + "✗ Board detection failed"
  Tips: Helpful suggestions in gray text
```

## Timing Breakdown

```
Total Time from Click to Calibration:

[📸 Snap & Auto-Calibrate] ← User clicks (t=0)
        ↓
   ~10ms: Frame capture from video
        ↓
  ~300ms: Board detection analysis
        ↓
  ~50ms: Ring refinement
        ↓
  ~20ms: Homography computation
        ↓
   ~20ms: State update & modal render
        ↓
  Modal appears (t=~400ms) ← User sees result
        ↓
  User clicks [✓ Accept & Lock] (t=0.5-1.0s)
        ↓
  ~10ms: Calibration locked
        ↓
  ~50ms: Angle panel renders
        ↓
  Ready for angle adjustment (t=~1.0s)

TOTAL: 400ms-1000ms (mostly waiting for user interaction)
```

## Accessibility Features

✅ **Visual Feedback:**
- Color-coded buttons (purple = snap, green = accept, blue = retry)
- Clear status messages ("✓ detected" vs "✗ failed")
- Confidence % and error displayed prominently
- Icons for quick recognition (📸, 🎯, ✓, ✗)

✅ **Error Handling:**
- Clear failure messages explaining what went wrong
- Helpful tips for fixing detection issues
- Fallback option to manual mode
- Retry button always available

✅ **Progress Indication:**
- "🔍 Detecting..." shows something is happening
- Modal appears to show results
- Angle panel auto-appears after success
- Clear next steps (accept, retry, or manual)

---

## Summary

The auto-calibration feature provides a **superior user experience** compared to manual clicking:

- **Speed:** 1 button click vs 5+ manual clicks
- **Accuracy:** Computer vision finds exact board boundaries
- **Feedback:** Detailed confidence metrics and error reporting
- **Flexibility:** Works from any camera angle
- **Fallback:** Manual mode always available

The entire flow from button click to "ready to play" takes **less than 1 second**! 🚀
