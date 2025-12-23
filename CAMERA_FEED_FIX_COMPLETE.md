# 🎥 Camera Feed Fix - Complete Summary

## Problem
No camera feed was appearing on the canvas despite permission being granted and the app saying "Camera Ready".

## Root Causes Identified & Fixed

### 1. **Video Playback Not Triggered**
   - **Issue**: The `autoPlay` attribute alone doesn't always work in modern browsers
   - **Fix**: Added explicit `.play()` call with proper error handling
   - **Code**: Added setTimeout delay to ensure stream is properly attached before play
   ```tsx
   setTimeout(() => {
     if (videoRef.current) {
       videoRef.current.play().catch((err) => {
         console.error("Video playback failed:", err);
       });
     }
   }, 100);
   ```

### 2. **Video ReadyState Not Checked Properly**
   - **Issue**: Checking for `HAVE_ENOUGH_DATA` might be too strict; video not buffered yet
   - **Fix**: Changed to check for `HAVE_CURRENT_DATA` (readyState >= 2) which means at least one frame is available
   ```tsx
   if (hasStream && readyState >= 2) {  // readyState >= 2 = HAVE_CURRENT_DATA
     ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
   }
   ```

### 3. **Canvas Dimensions Mismatch**
   - **Issue**: Canvas hardcoded to 640x480, but video might be requesting different resolution
   - **Fix**: Dynamically update canvas dimensions when video metadata loads
   ```tsx
   const handleLoadedMetadata = () => {
     if (canvasRef.current) {
       canvasRef.current.width = video.videoWidth || 640;
       canvasRef.current.height = video.videoHeight || 480;
     }
   };
   ```

### 4. **Browser Autoplay Restrictions**
   - **Issue**: Some browsers block autoPlay even with muted attribute
   - **Fix**: Added manual "🎬 Start Camera Feed" button as fallback
   - **Shows only when**: Camera not yet ready AND camera selected
   ```tsx
   {!cameraReady && selectedCameraId && (
     <button onClick={() => videoRef.current?.play()}>
       🎬 Start Camera Feed
     </button>
   )}
   ```

## Added Debugging

Comprehensive console logging added:

```
✓ Calibrator component mounted
✓ Starting camera with ID: ...
✓ Got media stream: {tracks: 1}
✓ Set video srcObject, attempting to play
✓ Video metadata loaded - dimensions: {width: 1280, height: 720}
✓ Canvas updated to: {width: 1280, height: 720}
✓ Video play event fired
✓ Video playing event fired (frames available)
✓ Camera ready!
```

If something goes wrong, you'll see:
- "Video playback failed: [error details]"
- "Failed to draw video frame: [error details]"
- "Video error event: [error details]"

## Testing Checklist

- [ ] Open browser DevTools (F12)
- [ ] Go to Console tab
- [ ] Refresh Calibrator page
- [ ] Check for all the "✓" messages above
- [ ] Verify dartboard appears in canvas
- [ ] Try switching cameras from dropdown
- [ ] Try manual "Start Camera Feed" button if feed doesn't appear

## Video Element Attributes

```tsx
<video
  ref={videoRef}
  autoPlay              // Browser-level autoplay attempt
  playsInline          // Mobile optimization
  muted                // Required for autoplay without user interaction
  style={{ display: "none" }}
  width={640}          // Initial size (updated dynamically)
  height={480}
/>
```

## Next Steps If Still Not Working

1. **Check browser console** for error messages
2. **Check browser's camera permissions** - may need to explicitly grant
3. **Try different camera** from dropdown selector
4. **Click manual "Start Camera Feed" button** to trigger play on user action
5. **Check device/browser compatibility**:
   - Desktop browsers: Usually fine
   - Mobile Safari: May have additional restrictions
   - Firefox: May require user interaction

## Performance Improvements

- Video dimensions now match canvas exactly (no rescaling overhead)
- Only drawing canvas when video has frames (wastes less CPU on fallback)
- Proper cleanup of event listeners on unmount
- Logging can be removed in production for better performance

---

**Status**: ✅ Ready for Testing
**What to Tell Users**: "If camera feed doesn't appear, try clicking the 'Start Camera Feed' button or refreshing the page"
