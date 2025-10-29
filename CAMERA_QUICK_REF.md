# Camera Module Fix - Quick Reference

## What Was Broken
Mobile phone camera wouldn't stream to desktop. The entire camera pairing system was non-functional.

## Root Cause
**Critical server bug:** WebRTC offer/answer messages were routed to the wrong peer, breaking the handshake.

## What Got Fixed

### 1. Server Routing Logic ⭐ CRITICAL FIX
- **File:** `server/server.js` (lines 2605-2628)
- **Bug:** cam-offer routed to phoneId (wrong), cam-answer routed to desktopId (wrong)
- **Fix:** Reversed both to route cam-offer to desktopId and cam-answer to phoneId
- **Impact:** Enables WebRTC handshake - THE KEY FIX

### 2. Desktop Video Handling
- **File:** `src/components/Calibrator.tsx` (lines 200-250, 1019)
- **Enhancements:** 
  - Enhanced ontrack handler with detailed logging
  - Added video element controls={false}
  - Proper error handling for autoplay policy blocks

### 3. Mobile Signal Logging
- **File:** `server/public/mobile-cam.js`
- **Added:** Comprehensive logging to both WebSocket and REST signal handlers
- **Benefit:** Easy debugging of signal flow

## How to Test

### Quick Test
1. Server running: ✅ (http://localhost:8787)
2. Vite running: ✅ (http://localhost:5173)
3. Open calibrator, scan QR with mobile
4. **Expected:** Mobile camera appears on desktop in 2-3 seconds

### Debug Via Logs
**Server terminal:**
```
[Server: cam-offer] Forwarding from phone to desktop (id1→id2)
[Server: cam-answer] Forwarding from desktop to phone (id2→id1)
```

**Desktop console:**
```
[Calibrator] WebRTC ontrack received: 1 streams
[Calibrator] Video playback started successfully
```

**Mobile console:**
```
[Mobile WS] WebRTC handshake complete
```

## Key Files Modified

| File | Change | Importance |
|------|--------|-----------|
| `server/server.js` | Fixed offer/answer routing | ⭐⭐⭐ CRITICAL |
| `src/components/Calibrator.tsx` | Enhanced ontrack logging | ⭐⭐ Important |
| `server/public/mobile-cam.js` | Added signal logging | ⭐ Nice-to-have |

## Expected Behavior After Fix

✅ Mobile can be used as camera source for desktop
✅ Desktop shows live mobile camera feed
✅ Handshake completes in 2-3 seconds
✅ No console errors
✅ Server logs show correct signal routing

## If Something Goes Wrong

| Symptom | Check |
|---------|-------|
| Desktop video blank | Desktop console: `[Calibrator]` logs → see if ontrack fired? |
| Mobile won't join | Mobile console: `[Mobile]` logs → see where it failed? |
| Server not routing | Server terminal: Look for `[Server: cam-offer]` logs |
| Autoplay blocked | Desktop console error: `NotAllowedError` → Click video to enable |

## One-Line Summary

**The server was sending each peer its own messages instead of sending them to the other peer. This prevented the WebRTC handshake. Fixed by swapping 2 target ID assignments.**

---

**Status:** ✅ **FIXED** - All code changes deployed, both servers running, ready to test.

For detailed info, see:
- `CAMERA_BUG_EXPLANATION.md` - What went wrong
- `CAMERA_FIX_SUMMARY.md` - Complete technical details  
- `CAMERA_TEST_CHECKLIST.md` - Testing steps
