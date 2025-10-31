# Calibration Persistence - Quick Start Guide

## ✅ What's New

Your calibration now **stays active across the entire site** - no matter where you navigate:

- 📱 Go to Online Play → calibration is there
- 🏠 Go to Offline Play → calibration is there  
- 🏆 Go to Tournaments → calibration is there
- ⚙️ Go to Settings → calibration is there
- 🔄 Refresh the page → calibration is still there!

## 🎯 For Users

### How to Use

1. **Calibrate once** in the Calibrator tab
2. **Lock your calibration** when it's perfect
3. **See the confirmation** - "✓ Calibration Active" appears in the header
4. **Go play** - your calibration works everywhere

### Visual Indicators

#### In the Calibrator Tab
```
┌─────────────────────────────────────────────┐
│ ✓ Calibration active                   [Unlock] │
│ Your calibration is saved and active    │
│ across all game modes.                   │
│ Precision: 2.45 px RMS error            │
└─────────────────────────────────────────────┘
```

#### In the App Header (All Screens)
```
┌──────────────────────────────────────────────────────────────┐
│ NINE-DART-NATION 🎯   Welcome @Player  ✓ Calibration Active  │
└──────────────────────────────────────────────────────────────┘
   Click anywhere on this to go back to Calibrator
```

## 🔧 For Developers

### Key Changes

**1. Calibrator Component** (`src/components/Calibrator.tsx`)
- Added "Calibration Active" success banner (lines ~1374-1393)
- Shows when `locked && H` is truthy
- Displays error precision and unlock button

**2. App Component** (`src/App.tsx`)
- Added `useCalibration()` hook to read lock state
- Added header status indicator (lines ~368-376)
- Shows "✓ Calibration Active" badge with click handler
- Navigates to 'calibrate' tab when clicked

### Data Flow

```
Calibrator (Lock calibration)
        ↓
        setCalibration({ locked: true, H, errorPx, ... })
        ↓
        Zustand Store (useCalibration)
        ↓
        localStorage ('ndn-calibration-v1')
        ↓
        [User navigates / refreshes page]
        ↓
        localStorage hydrated on app load
        ↓
        CameraView reads: useCalibration() → {H, locked}
        ↓
        Camera overlay uses H for dart detection ✓
```

### Storage

- **Key:** `ndn-calibration-v1`
- **Size:** ~1-2 KB
- **Lifetime:** Indefinite (until cleared by user)
- **Scope:** Per-device, per-browser

### Testing

```javascript
// In browser console:
// View stored calibration
JSON.parse(localStorage.getItem('ndn-calibration-v1'))

// Clear calibration
localStorage.removeItem('ndn-calibration-v1')

// Check if hydrated
const calib = JSON.parse(localStorage.getItem('ndn-calibration-v1'))
console.log('Has calibration:', !!calib?.H, 'Locked:', !!calib?.locked)
```

## 🚀 Example Workflow

1. **User:** Opens site, goes to Calibrator
2. **User:** Captures frame, clicks 6 points on board
3. **User:** Clicks "Lock in"
   - Calibrator: "Calibration Active" appears ✓
   - Header: "✓ Calibration Active" appears ✓
4. **User:** Clicks "Online" tab
   - Header: "✓ Calibration Active" still visible
5. **User:** Creates online match, starts autoscoring
   - Camera uses locked calibration for dart detection ✓
6. **User:** Refreshes page (F5)
   - Header: "✓ Calibration Active" appears immediately ✓
7. **User:** Goes back to Calibrator
   - "Calibration Active" section shows all details ✓

## 📊 Benefits

| Scenario | Before | After |
|----------|--------|-------|
| Navigate to another tab | ❌ Lose calibration UI | ✅ Header shows it's still active |
| Refresh page | ❌ Lose calibration | ✅ Calibration restored |
| Next day, reopen site | ❌ Need to recalibrate | ✅ Calibration still there |
| User confusion | ❌ "Where's my calibration?" | ✅ Always visible confirmation |
| Multiple devices | ✅ Each has own calibration | ✅ No change needed |

## 🔒 Privacy & Security

- Calibration stored only locally (browser storage)
- No data sent to server
- No personal information involved
- Data cleared if user clears browser data
- User can clear anytime by clicking "Unlock"

## 💡 Pro Tips

1. **Multiple Setups?** Each device stores its own calibration separately
2. **Want to recalibrate?** Click "Unlock" in Calibrator tab
3. **Lost your calibration?** Happens if browser data was cleared; recalibrate!
4. **Troubleshooting?** Check browser console: `localStorage.getItem('ndn-calibration-v1')`

---

**Need help?** See `CALIBRATION_PERSISTENCE.md` for full technical documentation.
