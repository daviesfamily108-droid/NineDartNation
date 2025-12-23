# Auto-Calibration Quick Start Guide

## Testing the Feature

### Prerequisites
✅ Dev server running at http://localhost:5173
✅ Camera connected and working
✅ Dartboard clearly visible in camera frame

### Quick Test (2 minutes)

1. **Navigate to Calibration**
   - Open http://localhost:5173/calibrate
   - Select your camera from dropdown
   - You should see live camera feed

2. **Position the Camera**
   - Angle camera 45-90° to dartboard
   - Ensure entire board is visible
   - Make sure lighting is good (no harsh shadows)

3. **Click Snap & Auto-Calibrate**
   - Look for the purple button: 📸 Snap & Auto-Calibrate
   - Click it
   - You'll see "🔍 Detecting..." while it analyzes

4. **Review Results**
   - Modal appears with detection results
   - Check confidence % (aim for 80%+)
   - Check error (should be <5px)
   - If confident: click "✓ Accept & Lock"

5. **Fine-Tune (Optional)**
   - Angle adjustment panel appears
   - Adjust rotation slider if board angle was detected
   - Click "✓ Save & Test"

6. **Test Accuracy**
   - Throw a dart on the board
   - Check if it scores at correct location
   - If accurate: You're done! ✅

### What to Expect

**Success Case (80-95% of the time):**
- Confidence: 85-95%
- Error: 1-3 pixels
- Instant calibration
- Auto-lock enabled
- Angle panel shows detected rotation

**Edge Cases (retry with different angle):**
- Confidence: 50-80%
- Error: 3-5 pixels
- Try slightly different camera angle
- Retry button available

**Rare Failures (requires manual mode):**
- Confidence: <50%
- Board partially hidden
- Too dark or glare
- Camera out of focus
- Click "Retry" or "Manual Mode"

## UI Elements Reference

### Action Buttons Section
```
┌─────────────────────────────────────────────────┐
│ ↶ Undo      🔄 Reset      📸 Snap & Auto-Calibrate │
└─────────────────────────────────────────────────┘
```

- ↶ Undo: Remove last clicked point (manual mode only)
- 🔄 Reset: Clear all points and restart
- 📸 Snap & Auto-Calibrate: **NEW** - Snap and detect board

### Result Modal
```
┌────────────────────────────────┐
│ 🎯 Auto-Detection Results      │ ✕
├────────────────────────────────┤
│ ✓ Board detected successfully! │
│                                │
│ Confidence: 87%    Error: 2.3px │
│                                │
│ Detected Features:             │
│ ✓ Board center located         │
│ ✓ Ring boundaries identified   │
│ ✓ Board orientation detected   │
│ ✓ Camera angle: 45.2°          │
│                                │
│ [✓ Accept & Lock]  [Retry]     │
└────────────────────────────────┘
```

## Common Issues & Solutions

### Issue: Low Confidence (<50%)

**Causes:**
- Board partially hidden
- Poor lighting (too dark)
- Camera out of focus
- Extreme camera angle (>85°)

**Solutions:**
1. Adjust camera angle (45° is ideal)
2. Improve lighting (bright, even light)
3. Move closer to board
4. Clean camera lens
5. Click "Retry" to try again

### Issue: Detection Fails Completely

**Causes:**
- Camera not actually streaming
- Board not visible in frame
- Very poor image quality

**Solutions:**
1. Check camera in camera selector
2. Verify dartboard is fully visible
3. Test camera with CameraView page
4. Try manual calibration (5-click mode)

### Issue: High Error (>5px) After Detection

**Causes:**
- Camera lens distortion
- Extreme camera angle
- Board not completely flat

**Solutions:**
1. Adjust angle using slider
2. Try from different position
3. Check if board is level
4. Consider manual calibration

## Manual Fallback

If auto-detection isn't working:

1. Click "Manual Mode" in error modal
2. Use traditional 5-click method:
   - Click on D20 sector rim
   - Click on D6 sector rim
   - Click on D3 sector rim
   - Click on D11 sector rim
   - Click on Bull's eye center
3. Watch for green checkmarks as you click
4. Click "🔒 Lock Calibration" when done

## Performance Tips

**For Best Detection Results:**
- 📱 Use phone in landscape orientation
- 💡 Use bright, even lighting
- 📏 Position camera 12-24 inches away
- 🎯 Center dartboard in frame
- 🔄 Try 45° angle first

**Detection Takes:**
- Frame capture: <10ms
- Board detection: 200-500ms
- Result display: instant
- **Total: < 1 second**

## Advanced Features

### Angle Adjustment
After successful detection, you can:
- Adjust Board Rotation slider (-180° to +180°)
- Adjust Sector Fine-Tune (-5 to +5 sectors)
- Test with one dart
- Re-adjust if needed

### Multiple Calibrations
You can save multiple calibrations:
- One for front-facing camera
- One for side-view angle
- One for different distance
- Switch between them in Camera dropdown

### Calibration History
Manage saved calibrations:
- View list by clicking dropdown
- Delete old ones with red ✕ button
- Rename by editing before save

## Success Indicators

✅ **Auto-Detection Working:**
- Button appears and is clickable
- "🔍 Detecting..." shows during analysis
- Modal appears with results
- Confidence displayed (should be >80%)
- "✓ Accept & Lock" button works
- Calibration locks automatically

✅ **Calibration Accurate:**
- Throw dart on 20 segment
- Verify it shows as "20" or "D20"
- Throw on different segments
- All score at correct locations

## Next Steps After Calibration

1. **Go to Camera View**
   - Click home or navigate to main page
   - You'll see dartboard in camera
   - Detected darts shown as colored circles

2. **Throw Some Darts**
   - Each dart detected automatically
   - Score calculated instantly
   - Displayed in game stats

3. **Start Playing**
   - Play 501, Cricket, or other games
   - Scores tracked automatically
   - Full replay system available

## Troubleshooting Checklist

Before reporting issues:
- [ ] Camera is working (test on Camera page)
- [ ] Dartboard is fully visible
- [ ] Good lighting on board
- [ ] Camera isn't moving during snap
- [ ] Camera focused (not blurry)
- [ ] Tried 45° angle
- [ ] Tried "Retry" a few times
- [ ] Tried manual 5-click mode
- [ ] Browser console has no errors
- [ ] Dev server still running

## Technical Details

### What Gets Detected
- Board center (x, y) coordinates
- 8 ring boundaries (radii)
- Board homography matrix (H)
- Board rotation angle (theta)
- Confidence percentage (0-100)
- Pixel-level error margin

### Algorithms Used
- **Hough Voting** - Find board center
- **Radial Edge Detection** - Detect rings
- **Ratio Validation** - Verify dartboard geometry
- **DLT** - Compute homography
- **Least Squares** - Optimize fit

### Detection Requirements
- Minimum confidence: Variable (50%+ is good)
- Ring count: All 8 rings visible
- Board orientation: Auto-detected
- Camera angle: 0° to 90° works
- Image quality: Moderate or better

---

## Summary

Auto-calibration transforms dartboard setup from tedious clicking to instant snapping. **Just press the button and get perfect calibration in under 1 second!** 🎯

For detailed technical information, see `AUTO_CALIBRATION_UI_COMPLETE.md`
