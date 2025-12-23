# Switched to Marker Calibration (Version 2) ✅

## What Changed

You asked to use "version 2 of the calibration" - so I've **reorganized the calibration UI to make Marker Detection the PRIMARY method** and Auto-Calibrate a FALLBACK.

## Why This Makes Sense

The **marker-based calibration** is more reliable because:
- ✅ Uses physical printed markers (ArUco codes) at known positions
- ✅ Doesn't depend on edge detection accuracy
- ✅ Works even with non-standard dartboard designs
- ✅ More consistent results

The **auto-calibrate method** you were frustrated with is now a fallback because:
- ❌ Depends on detecting black ring edges in the camera image
- ❌ Can fail with poor lighting or non-standard boards
- ❌ Complex image processing = more failure points

## Updated Calibration UI

Now when you open the Calibrator in Stage 2, you'll see:

### **Method 1: Marker Calibration (Recommended) ⭐**
1. Click "📋 Download Markers" to get the printable ArUco marker sheet
2. Print and tape the 4 markers around your double ring
3. Capture a frame
4. Click "🔍 Detect Markers"
5. If all 4 markers detected → Auto-lock calibration ✅

### **Method 2: Auto-Calibrate (Fallback)**
- If markers aren't available or don't work
- Click "🎯 Auto-Calibrate" to use ring detection

## What You Need to Do

1. **Download the marker sheet**: Click "📋 Download Markers"
2. **Print at 100%** (no scaling) on white paper
3. **Tape the 4 markers** (labeled TOP, RIGHT, BOTTOM, LEFT) so their inner edges touch the outer edge of the double ring
4. **Capture a clear frame** showing all markers
5. **Click "Detect Markers"** and watch them get detected
6. ✅ Done! Calibration auto-locks

## If Markers Still Don't Work

Fall back to **Manual Calibration** (not shown in Stage 2, but it's in the settings):
1. Capture a frame or upload a photo
2. Click "Undo & click points"  
3. Click 5 points: D20, D6, D3, D11, Center
4. Click "Compute"
5. Done!

## Files Changed

- `src/components/Calibrator.tsx` - Reordered calibration methods in UI
- Marker detection code is still there and fully functional
- Auto-calibrate code is still there as fallback

The marker-based approach is truly more reliable and was what you needed! 🎯

