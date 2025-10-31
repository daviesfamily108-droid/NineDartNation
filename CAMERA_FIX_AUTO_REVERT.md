# Camera Feed Auto-Revert Fix

## Problem
After attempting QR code phone pairing, users couldn't get their camera feed to turn back on. The system would get stuck in "phone" mode even when pairing failed or was interrupted.

## Root Cause
1. Clicking the "Phone" button set `mode='phone'` and called `stopCamera()`
2. If pairing failed or connection was lost, the system stayed in phone mode
3. The "Start camera" button only appears when `mode === 'local'`
4. Users had no visible way to restart the camera without manually clicking "Local" first
5. The UI was confusing and felt broken

## Solution
Implemented automatic mode reversion when camera operations fail:

### Changes Made

#### 1. Enhanced `stopCamera()` Function
```typescript
function stopCamera(autoRevert: boolean = true)
```
- Added `autoRevert` parameter (defaults to `true`)
- When `autoRevert=true` and `mode` is 'phone' or 'wifi', automatically calls `setMode('local')`
- This ensures the "Start camera" button becomes visible again after a failure

#### 2. Mode Switching Buttons
All mode buttons now pass `autoRevert=false` to prevent unintended reverts when user explicitly switches modes:
```typescript
onClick={() => { setMode('local'); stopCamera(false) }}    // Local button
onClick={() => { setMode('phone'); stopCamera(false) }}    // Phone button
onClick={() => { setMode('wifi'); stopCamera(false) }}     // Wifi button
```

#### 3. WebSocket Error Handlers
All error conditions now benefit from auto-revert:
- **Offer creation fails** (line 447) → calls `stopCamera()` → reverts to local
- **Remote description fails** (line 460) → calls `stopCamera()` → reverts to local
- **Camera error received** (line 485) → calls `stopCamera()` → reverts to local
- **Connection state fails** (line 377) → calls `stopCamera()` → reverts to local

#### 4. WebSocket Close Handler
Enhanced `onclose` handler to:
- Clear expiration time state
- Set `paired=false`
- Revert to local mode when connection drops unexpectedly
- Only shows alert for non-clean closes (code !== 1000)

## User Experience Improvement

### Before
1. User clicks "Phone" button
2. Attempts QR pairing
3. Pairing fails or times out
4. **Problem**: Camera feed is gone, no visible "Start camera" button
5. User is confused about how to get camera back
6. User has to figure out to click "Local" button first

### After
1. User clicks "Phone" button
2. Attempts QR pairing
3. Pairing fails or times out
4. **Automatic**: System reverts to local mode
5. **Result**: "Start camera" button immediately appears
6. User clicks "Start camera" → camera works
7. **Clear flow**: Intuitive recovery from pairing errors

## Test Scenarios

### Scenario 1: QR Code Expires
1. Click "Phone" button
2. Generate QR code
3. Wait for code to expire (2 minutes)
4. System auto-reverts to local mode
5. ✅ "Start camera" button appears
6. ✅ User can click to restart camera

### Scenario 2: Connection Fails During Pairing
1. Click "Phone" button
2. Phone scans QR code but connection drops
3. System receives `cam-error` or connection state becomes 'failed'
4. System auto-reverts to local mode
5. ✅ "Start camera" button appears
6. ✅ User can click to restart camera

### Scenario 3: WebSocket Disconnects
1. Click "Phone" button
2. Phone scanning begins
3. WebSocket connection drops (network issue)
4. `socket.onclose` handler fires with code !== 1000
5. System auto-reverts to local mode
6. ✅ "Start camera" button appears
7. ✅ User can click to restart camera

### Scenario 4: Manual Mode Switch (Still Works)
1. In "Local" mode with camera running
2. Click "Phone" button
3. `setMode('phone')` + `stopCamera(false)` called
4. ✅ Mode stays as 'phone' (autoRevert=false prevents revert)
5. ✅ Phone pairing UI appears
6. User can generate/scan QR code normally

### Scenario 5: Successful Pairing (Unchanged)
1. Click "Phone" button
2. Generate QR code
3. Phone scans code
4. `cam-peer-joined` received
5. RTCPeerConnection established
6. Phone camera stream arrives via `ontrack` handler
7. ✅ Video plays from phone
8. ✅ `setStreaming(true)` called (no auto-revert because not an error)

## Error Handling Code Paths

### Error Path 1: Offer Creation Fails
```
startPhonePairing() 
  → createOffer() throws
  → catch block calls stopCamera()
  → setMode('local') triggered
```

### Error Path 2: Remote Description Fails  
```
cam-answer received
  → setRemoteDescription() throws
  → catch block calls stopCamera()
  → setMode('local') triggered
```

### Error Path 3: Camera Error Message
```
cam-error received (EXPIRED, CONNECTION_FAILED, etc)
  → alert shown
  → stopCamera() called
  → setMode('local') triggered
```

### Error Path 4: Connection Fails
```
WebRTC connection established
  → onconnectionstatechange fires
  → connectionState becomes 'failed' or 'disconnected'
  → stopCamera() called
  → setMode('local') triggered
```

### Error Path 5: WebSocket Disconnects
```
socket closes unexpectedly (code !== 1000)
  → onclose handler fires
  → alert shown
  → setMode('local') called directly
```

## Code Quality

✅ **Backward Compatible**: All existing `stopCamera()` calls work with default behavior
✅ **Type Safe**: TypeScript properly types the `autoRevert` parameter
✅ **Consistent**: All error paths use same recovery mechanism
✅ **Clear Intent**: `stopCamera(false)` explicitly shows "don't auto-revert" for mode switches
✅ **Minimal Changes**: Only modified necessary logic, no refactoring

## Testing Checklist

- [ ] Click "Phone" button and wait for QR code expiration
- [ ] Verify mode auto-reverts to "Local"
- [ ] Verify "Start camera" button appears
- [ ] Verify clicking "Start camera" works
- [ ] Simulate connection failure during pairing
- [ ] Verify "Start camera" button appears after failure
- [ ] Test manual mode switching still works correctly
- [ ] Test successful phone pairing still works (unaffected)
- [ ] Test WiFi device pairing mode (uses same pattern)
- [ ] Test WebSocket reconnection after disconnect

## Browser Console Debug Output

Users can check the browser console to see detailed logs:
```
[Calibrator] Sending cam-offer for code: ABCD
Failed to create WebRTC offer: {error details}
[Calibrator] Auto-reverting from phone mode to local mode
```

## Related Files
- `src/components/Calibrator.tsx` - Main camera calibration component
- `server.js` - WebSocket camera pairing handlers
- `mobile-cam.html/js` - Phone side of pairing system
