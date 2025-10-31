# Calibration Persistence Implementation

## Overview
Calibration now persists throughout the entire site. Once a user locks in a calibration, it remains active and available across all game modes (Online, Offline, Tournaments, etc.) and even survives page refreshes.

## What Was Implemented

### 1. **Persistent Store (Already Existed)**
- Calibration is stored via **Zustand with localStorage persistence**
- Store file: `src/store/calibration.ts`
- Key fields:
  - `H`: Homography matrix (board->image transformation)
  - `locked`: Whether calibration is locked
  - `errorPx`: RMS error in pixels
  - `createdAt`: Timestamp of when calibration was created
  - `imageSize`: Size of calibration image
  - `anchors`: Source and destination points

### 2. **Enhanced Calibrator UI**
**File:** `src/components/Calibrator.tsx`

Added a prominent **"Calibration Active"** section that appears when calibration is locked:
- Shows checkmark and confirmation message
- Displays precision (RMS error)
- Explains that calibration is active across all game modes
- Provides "Unlock" button to recalibrate if needed

**Location:** Top of the calibration card, immediately below the header

### 3. **Global Status Indicator**
**File:** `src/App.tsx`

Added a **calibration status indicator in the app header** that:
- Appears when calibration is locked and available
- Shows "✓ Calibration Active • {error}px"
- Is clickable to navigate directly to Calibrator tab
- Appears across all tabs/screens
- Shows precision information

**Benefits:**
- Users can always see that their calibration is active
- One-click access to calibration settings from anywhere
- Visual reassurance that their setup is persisted

### 4. **Automatic Usage**
All components that use the camera already read from the calibration store:
- **CameraView** (auto-scoring): Uses `useCalibration()` hook
- **OnlinePlay**: Uses `useCalibration()` to check if calibration is available
- **OfflinePlay**: Inherits calibration from context
- **Tournaments**: Uses calibration for accurate scoring

## How It Works

### Flow Diagram
```
User opens Calibrator
    ↓
Locks calibration via "Lock in" button
    ↓
setCalibration({ locked: true, H, errorPx, ... })
    ↓
Zustand persists to localStorage (ndn-calibration-v1)
    ↓
User navigates to Online/Offline/Tournaments
    ↓
CameraView reads H from useCalibration() - still available!
    ↓
User returns to Calibrator
    ↓
"Calibration Active" section appears at top
    ↓
User can view/unlock or navigate to any game mode
    ↓
User refreshes page
    ↓
localStorage is hydrated on app load
    ↓
Calibration is restored and ready to use
```

### Key Files Modified

1. **`src/components/Calibrator.tsx`**
   - Added prominent "Calibration Active" section with unlock button
   - Shows error precision
   - Clarifies persistence across game modes

2. **`src/App.tsx`**
   - Added `import { useCalibration }`
   - Added calibration hook to read lock state and H matrix
   - Added header banner with status and click-to-calibrate functionality

### Key Files NOT Modified (Already Working)

- **`src/store/calibration.ts`** - Already has full persistence
- **`src/components/CameraView.tsx`** - Already reads from store
- **`src/components/OnlinePlay.tsx`** - Already checks for calibration
- All game components - Already inherit calibration via CameraView

## Testing the Implementation

### Test 1: Calibration Persists During Navigation
1. Go to Calibrator tab
2. Lock in a calibration
3. Observe "Calibration Active" banner appears at top
4. Navigate to Online/Offline/Tournaments
5. Return to Calibrator
6. **Expected**: "Calibration Active" section still shows, calibration unchanged

### Test 2: Calibration Persists Across Page Refresh
1. Lock calibration in Calibrator
2. Observe header shows "✓ Calibration Active"
3. Refresh the page (F5)
4. **Expected**: Header still shows "✓ Calibration Active" immediately
5. Navigate to Calibrator
6. **Expected**: "Calibration Active" section displays with same data

### Test 3: Use Calibration in Game
1. Lock calibration in Calibrator
2. Navigate to Online Play
3. Create a match that requires calibration
4. Start autoscoring camera
5. **Expected**: Camera overlay uses the saved calibration for dart detection

### Test 4: Multiple Device Consistency
1. Calibrate on Device A
2. From Device B, open same site/login
3. Do NOT calibrate on Device B
4. **Expected**: Device B does NOT see calibration (localStorage is per-device)
5. Back on Device A, calibration still present

### Test 5: Clear Calibration
1. Have active calibration
2. Go to Calibrator
3. Click "Unlock" button in "Calibration Active" section
4. Confirm calibration is cleared
5. Navigate away and back
6. **Expected**: No calibration present

## Data Storage Details

**localStorage key:** `ndn-calibration-v1`

**Data structure:**
```typescript
{
  H: number[][] | null,                    // 3x3 homography matrix
  createdAt: number | null,                 // Timestamp in ms
  errorPx: number | null,                   // RMS error
  imageSize: { w: number; h: number } | null,
  anchors: { src: Point[], dst: Point[] } | null,
  locked: boolean,
  _hydrated: boolean                        // Internal: hydration flag
}
```

**Size:** ~1-2 KB (very efficient)

**Persistence:** Indefinite (until user clears browser data or clicks "Reset")

## User Experience Improvements

### Before
- User locks calibration in Calibrator
- Navigates to Offline/Online
- Returns to Calibrator
- No visual confirmation that calibration exists
- Unclear if calibration persists across navigation

### After
- User locks calibration in Calibrator
- **Sees prominent "Calibration Active" banner in Calibrator**
- **Sees "✓ Calibration Active" indicator in app header (all screens)**
- Navigates to Offline/Online
- **Header reminder shows calibration still active**
- Returns to Calibrator
- **"Calibration Active" section reassures user**
- Can unlock with one click from anywhere
- **Visual feedback that calibration is working**

## Technical Notes

### Why This Works
1. **Zustand with localStorage**: Industry-standard persistence library
2. **Hydration on app load**: Data is restored before any component renders
3. **React hooks**: `useCalibration()` provides reactive updates
4. **No server required**: All stored locally on device

### Performance
- localStorage access is ~1ms
- No network calls needed
- Data is loaded once per app session (during hydration)
- All updates are instant (in-memory)

### Browser Compatibility
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- localStorage support required (supported since IE8)
- iOS: Per-domain, survives app reload but cleared on app uninstall
- Android: Per-domain, persistent

## Future Enhancements

Potential improvements:
1. **Cloud sync**: Upload calibration to server, download on new device
2. **Multiple calibrations**: Save calibrations for different board angles/distances
3. **Calibration history**: View past calibrations with timestamps
4. **Export/Import**: Share calibration between users
5. **Auto-calibration**: Periodic re-calibration checks

## Summary

✅ **Calibration now persists site-wide**
✅ **Visual indicators show calibration is active**
✅ **Survives navigation and page refreshes**
✅ **Available across all game modes immediately**
✅ **Zero-friction user experience**
