# Quick Camera Feed Troubleshooting

## Immediate Actions to Try

### 1. **Hard Refresh the Page**
- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`
- This clears cache and forces re-load of latest code

### 2. **Check Browser Console for Errors**
1. Press `F12` to open Developer Tools
2. Click "Console" tab
3. Look for error messages in red
4. Copy any errors and check against the fix guide

### 3. **Verify Camera Permission**
1. In browser address bar, click the camera icon 🎥
2. Make sure camera is set to "Allow" not "Block"
3. If blocked, reset and refresh page

### 4. **Try Manual Start Button**
- If camera still shows "Initializing camera..."
- Click the blue "🎬 Start Camera Feed" button
- This manually triggers video playback

### 5. **Switch Cameras**
- Click "📷 Select Camera" button
- Try a different camera from the list
- Some cameras may work better than others

## What You Should See

### In Console (Press F12)
```
Calibrator component mounted
Starting camera with ID: [device-id]
Got media stream: {tracks: 1}
Set video srcObject, attempting to play
Video metadata loaded - dimensions: {width: 1280, height: 720}
Canvas updated to: {width: 1280, height: 720}
Video play event fired
Video playing event fired (frames available)
Camera ready!
```

### On Screen
1. Gray canvas background fills in with live video
2. Camera status shows "✓ Camera Active"
3. Colored target circles appear on top (D20, D6, D3, D11, Bull)

## Still Not Working?

1. **For OBS Virtual Camera**:
   - Make sure OBS is running
   - Go to OBS Settings → Sources → VirtualCamera
   - Check "Start Virtual Camera" is enabled

2. **For Physical Cameras**:
   - Ensure camera is plugged in and recognized
   - Some cameras need drivers installed

3. **For Phone Cameras**:
   - Install IP Webcam or DroidCam app
   - Keep phone and computer on same WiFi
   - Make sure app is actively broadcasting

4. **Browser-Specific Issues**:
   - **Chrome/Edge**: Usually works best
   - **Firefox**: May require more explicit permissions
   - **Safari**: May have stricter autoplay policies

## Still Stuck?

Take a screenshot of the console output and:
1. Note any error messages
2. Check the mobile version of the app
3. Try a different browser
4. Restart computer and try again
