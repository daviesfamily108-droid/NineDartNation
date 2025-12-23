# 📹 Why Camera Feed Not Available in Games - Solution

## The Issue
Camera feed appears to be unavailable/disabled in game modes (OfflinePlay, OnlinePlay, etc) even though the camera is working in the Calibrator.

## Root Cause
The camera display is **controlled by a user setting** called "Enable camera" in Settings. By default, this setting is **OFF**. Even if you calibrate successfully, the camera won't show in games unless you explicitly enable it.

## How to Enable Camera Feed in Games

### Step 1: Open Settings
- Click the **⚙️ Settings** button in the bottom left of the main screen

### Step 2: Find Camera Settings
- Scroll down to find the **"Enable camera"** checkbox
- It's in the "Camera & Scoring" section

### Step 3: Check the Box
- Click the checkbox next to **"Enable camera"** to enable it
- ✅ The checkbox should now be checked

### Step 4: Additional Camera Settings (Optional)
Once enabled, you'll see more options:
- **Scale**: Adjust camera size on screen (0.25 - 1.25)
- **Aspect Ratio**: Choose between "Wide" or "Square" layout
- **Fit Mode**: Choose how camera fits in the game UI (Fill or Contain)

### Step 5: Return to Game
- Close Settings
- Start a new game
- Camera feed should now appear! 🎥

## Where Camera Appears in Games

### Desktop/Tablet
- **X01 Mode**: Camera appears on the right side of the screen
- **Cricket/Other Modes**: Camera tile appears alongside scoreboard
- **Fullscreen Option**: Click camera to toggle fullscreen view

### Mobile
- **Inline Display**: Small camera appears below scoreboard on narrow screens
- **Tap to Expand**: Tap camera controls to open fullscreen mobile camera
- **Close Button**: Tap ✕ to collapse camera back to small view

## Troubleshooting

### Camera Still Not Showing?
1. **Did you enable the toggle?** - Double-check Settings that "Enable camera" is checked
2. **Different game mode** - Try a different game mode (X01, Cricket, etc)
3. **Refresh page** - Sometimes a refresh helps
4. **Check console** - Open DevTools (F12) and look for errors

### Camera Shows But No Image?
1. **Camera not started** - Check if camera has started in Calibrator first
2. **Different camera** - Try selecting a different camera from the dropdown in CameraView
3. **Permissions** - Make sure browser has camera permission granted
4. **Browser issue** - Try a different browser

### Camera Working in Calibrator But Not Games?
1. **Recalibrate** - Go back to Calibrator and make sure you have at least 5 calibration points
2. **Lock calibration** - Make sure you clicked "Lock Calibration" button
3. **Check H matrix** - The calibration is stored, but camera feed requires camera to be enabled

## How It Works

```
Calibration Flow:
  Calibrator.tsx
    ↓
    (Camera works here automatically)
    ↓
    Saves H matrix to store
    ↓

Game Flow:
  OfflinePlay.tsx / OnlinePlay.tsx
    ↓
    Checks: cameraEnabled setting?
    ↓
    YES → Renders <CameraView>
    NO  → Camera section hidden
    ↓
  CameraView.tsx
    ↓
    Uses H matrix for dart detection
    ↓
    Shows live feed + overlay
```

## Settings Location Quick Reference

| Setting | Location | Default | Purpose |
|---------|----------|---------|---------|
| Enable camera | Settings → Camera & Scoring | OFF | Turn camera on/off in games |
| Scale | Settings → Camera & Scoring | 0.75 | Adjust camera size |
| Aspect | Settings → Camera & Scoring | Wide | Change layout ratio |
| Fit Mode | Settings → Camera & Scoring | Fill | Adjust how it fits space |

## Still Need Help?

1. **Calibrator camera missing?** → See CAMERA_FEED_NOW_WORKING.md
2. **Camera permission issues?** → See QUICK_CAMERA_TROUBLESHOOT.md
3. **Dart detection not working?** → Contact support with debug logs

---

**TL;DR**: Open Settings → Check "Enable camera" → Restart game → Camera shows up! 🎥✅
