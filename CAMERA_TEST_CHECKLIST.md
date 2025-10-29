# Camera Module Sync - Testing Checklist

## Quick Start
- ✅ Vite dev server running: http://localhost:5173
- ✅ Node server running: http://localhost:8787
- ✅ All code fixes applied and deployed

## Pre-Test Verification
- [ ] Open http://localhost:5173 in desktop browser
- [ ] Open DevTools → Console (to view logging)
- [ ] Search filter for `[Calibrator]` to see desktop logs

## Desktop Test Steps

### Step 1: Initiate Pairing
- [ ] Navigate to Calibrator component
- [ ] Click "Sync Camera" button (or camera pairing option)
- [ ] QR code appears on screen
- [ ] Check console: should see initialization logs with `[Calibrator]` prefix

### Step 2: Mobile Join
- [ ] On mobile device or second browser tab:
  - URL: http://localhost:8787/mobile-cam.html?code=XXXXX (where XXXXX is the code shown)
  - OR scan the QR code if available
- [ ] Grant camera permission when prompted
- [ ] Mobile video preview shows your camera
- [ ] Check console: should see `[Mobile WS] cam-join sent` or similar

### Step 3: Verify Signal Exchange
Watch for these logs in **server terminal**:
```
[Server: cam-offer] Forwarding from phone to desktop (phoneId→desktopId)
[Server: cam-answer] Forwarding from desktop to phone (desktopId→phoneId)
[Server: cam-ice] Routing ICE candidate from phone to desktop
```

### Step 4: Monitor Desktop Reception
Watch for these logs in **desktop console**:
```
[Calibrator] WebRTC ontrack received: 1 streams, track kind: video
[Calibrator] Assigning video stream (tracks: 1) to video element
[Calibrator] Setting srcObject and attempting play
[Calibrator] Video playback started successfully
```

### Step 5: Confirm Visual Result
- [ ] Desktop video element shows live camera feed from mobile
- [ ] Image is clear and updates in real-time
- [ ] No errors in any console

## Expected Timings
- Desktop QR code generation: <1 second
- Mobile join to first frame: 2-3 seconds
- Subsequent frames: ~33ms (30fps)

## Troubleshooting

### If video doesn't appear on desktop:

**Check Desktop Console:**
```javascript
// Look for errors like:
// [Calibrator] Video play failed: NotAllowedError
// → This means autoplay policy blocked playback
// → Solution: Click on video element or wait for user interaction
```

**Check Mobile Console:**
```javascript
// Look for:
// [Mobile WS] WebRTC handshake complete → Good
// [Mobile WS] cam-offer handler failed → Bad, check error message
```

**Check Server Terminal:**
```
// Look for:
[Server: cam-offer] Forwarding...
[Server: cam-answer] Forwarding...
// If missing → signaling never reached server
```

### If WebSocket fails, REST fallback should kick in:
- Mobile console: `[Mobile] Signal received: cam-offer` (REST endpoint)
- Polling every 1500ms
- Slightly higher latency but should still work

### If nothing happens after 10 seconds:
1. Check network tab: see WebSocket connection?
2. Check server: is it receiving messages?
3. Check firewall: port 8787 open?
4. Try restarting server with fresh state

## Success Indicators
- ✅ Desktop shows live mobile camera feed
- ✅ No errors in any console
- ✅ Server logs show offer/answer/ice routing
- ✅ Mobile logs show "handshake complete"
- ✅ Stream is continuous (not freezing)
- ✅ Can see movement/interact with mobile camera

## Performance Notes
- Expected CPU: Low (H.264/VP8 hardware decoded on most devices)
- Expected bandwidth: ~2-5 Mbps for 720p30
- Expected latency: 50-200ms (should feel responsive)
- Memory: Should stabilize after connect (no memory leaks)

## Files to Monitor
- Server terminal output: `node server.js` in /server directory
- Browser console (desktop): DevTools → Console
- Browser console (mobile): DevTools → Console (or mobile DevTools if available)

## One More Thing
If you see these logs, the fix is working:
```
[Calibrator] ontrack received → Desktop successfully received media ✅
[Mobile WS] WebRTC handshake complete → Mobile successfully sent media ✅
[Server: cam-offer] Forwarding from phone to desktop → Server routing correct ✅
```

**The camera module sync fix is now complete and ready to test!**
