# Camera Feed Debug Guide

## Issue: No feed appearing despite camera being allowed

### Possible Causes:

1. **Video not playing** - autoPlay might be blocked by browser
   - Solution: Manual `.play()` call added
   
2. **Video readyState not reaching sufficient state** - canvas drawing happens too early
   - Solution: Changed condition from `HAVE_ENOUGH_DATA` to `HAVE_CURRENT_DATA`
   - Added buffering delay before `.play()`

3. **Canvas dimensions mismatch** - video streams at different resolution
   - Canvas: 640x480 (hardcoded)
   - Video: Requested 1280x720 (ideal)
   - Solution: Need to match canvas to actual video dimensions

4. **Cross-origin/CORS issues** - hidden video element may have restrictions
   - Solution: Ensure `muted` attribute present

### Debug Info to Check:

1. Open Browser DevTools (F12)
2. Go to Console tab
3. Look for messages like:
   - "Calibrator component mounted"
   - "Starting camera with ID: ..."
   - "Got media stream: {tracks: 1}"
   - "Set video srcObject, attempting to play"
   - "Video metadata loaded - dimensions: {width: ..., height: ...}"
   - "Video playing event fired (frames available)"
   - "Camera ready!"

4. If stuck on gray canvas:
   - Check: "Video has no stream attached"
   - Check: "Video readyState not ready" with actual values

### Next Steps:

If still no feed:
1. Check Network tab - video stream requests
2. Check if permission dialog appeared
3. Try manual "Start Camera Feed" button
4. Check different camera in dropdown
