# 🔍 Marker Detection Troubleshooting Guide

## Issue You Encountered

**Alert Message:**
```
Not all calibration markers were detected. Missing markers: TOP (ID 0), RIGHT (ID 1), BOTTOM (ID 2), LEFT (ID 3)
```

Even though you had all the markers printed and visible.

---

## Why This Happens

The marker detection uses the **js-aruco** library to detect ArUco QR-code-like markers. The issue can be caused by:

1. **Poor image quality** - Low resolution, motion blur, bad lighting
2. **Marker print quality** - Faded printouts, incorrect scaling, damaged markers
3. **Camera angle** - Markers at extreme angles or partially obscured
4. **Library limitations** - ArUco detection is sensitive and can fail with certain conditions

---

## Solutions

### ✅ Solution 1: Improve Lighting & Image Quality (RECOMMENDED)

**Best practices for marker detection:**
- ✅ Use **good lighting** - Avoid shadows and glare on the markers
- ✅ Print markers at **100% scale** - Don't resize in PDF reader
- ✅ Use **high-quality paper** - Crisp black & white, not faded
- ✅ Keep markers **flat and parallel** to camera
- ✅ Ensure all 4 markers are **fully visible** in frame
- ✅ Take photo from **face-on angle** (not from the side)

---

### ✅ Solution 2: Use Manual Calibration (FALLBACK)

If markers keep failing, **use manual calibration instead**:

**Steps:**
1. Capture a frame or upload a clear photo
2. Click **"Undo & Click Points" or just start clicking**
3. Click **5 points** on the board:
   - **Point 1**: TOP of double ring
   - **Point 2**: RIGHT of double ring
   - **Point 3**: BOTTOM of double ring
   - **Point 4**: LEFT of double ring
   - **Point 5**: CENTER of bull (50 point area)
4. Click **"Compute"** to calculate homography
5. Click **"Lock Calibration"**

**Manual calibration works just as well as markers!**

---

### ✅ Solution 3: Improved Detection Algorithm

I've enhanced the marker detection with:

**Additional Detection Passes:**
1. **Pass 1**: Raw image (original quality)
2. **Pass 2**: 1.75x upscaling (helps low-res cameras)
3. **Pass 3**: Contrast stretching (enhances edges)
4. **Pass 4**: Aggressive B&W threshold (NEW - converts to pure black & white)

**Better Error Messages:**
- Now shows which markers WERE detected
- Explains which ones are missing
- Suggests trying manual calibration as fallback

---

## What the New Alert Shows

**If markers are partially detected:**
```
Detected 2 of 4 markers. Some markers may have incorrect IDs or be unclear.
Detected markers with IDs: 0, 1

Missing markers: BOTTOM (ID 2), LEFT (ID 3)

You can still use manual calibration: click 5 points on the board instead.
```

**If no markers detected:**
```
No markers detected. Make sure markers are on white paper, fully visible, and well-lit.

You can still use manual calibration: click 5 points on the board instead.
```

---

## Marker Generation

If you need new markers:

1. In **Calibrator** component, look for **"Marker Sheet"** button
2. Click to open/print marker sheet
3. Print at **100% scale** on white paper (8.5" × 11")
4. Cut out the 4 markers: TOP, RIGHT, BOTTOM, LEFT
5. Arrange them around your dartboard

**Important:** All 4 markers must have the exact ArUco format or detection will fail.

---

## Technical Details

### ArUco Marker Format
- 5×5 binary grid (with 1-pixel border = 7×7 total)
- IDs 0-3 are used:
  - **ID 0**: TOP marker
  - **ID 1**: RIGHT marker
  - **ID 2**: BOTTOM marker
  - **ID 3**: LEFT marker

### Detection Process
The system tries 4 increasingly aggressive image preprocessing steps:
1. Raw image (best quality preserved)
2. Upscaled 1.75x (helps low-res cameras)
3. Contrast enhanced (stretches dark/light areas)
4. Binary threshold (pure B&W, good for low contrast)

If ANY step finds valid markers, it's returned immediately.

---

## When to Use What

| Scenario | Recommendation |
|----------|-----------------|
| **Good lighting, clear markers** | Use marker detection ✅ Fast, accurate |
| **Poor lighting, faded markers** | Use manual calibration ✅ More reliable |
| **Online/broadcast setup** | Use markers ✅ Professional appearance |
| **Quick offline practice** | Use manual calibration ✅ No prep needed |
| **Mobile phone camera** | Use manual calibration ✅ Manual is more stable |

---

## Quick Troubleshooting Checklist

- [ ] Markers are printed at 100% scale (not zoomed in PDF reader)
- [ ] Markers are on white paper with crisp black & white contrast
- [ ] All 4 markers are fully visible in the frame
- [ ] Camera is pointed straight at markers (not from an angle)
- [ ] Lighting is good (no shadows, no glare)
- [ ] Markers are arranged around the board perimeter
- [ ] Camera resolution is at least 480p
- [ ] Try capturing multiple photos until detection works
- [ ] If markers still fail, use manual calibration instead

---

## Pro Tips

💡 **Better detection**: If you have an external webcam, use it instead of built-in laptop camera - better optics = better marker detection

💡 **Retry strategy**: Take multiple photos at different angles/distances. One will likely work.

💡 **Manual calibration**: Actually often MORE accurate than markers because you can click very precisely on the exact board points.

💡 **Backup approach**: If markers fail, you already have manual calibration ready to go - no wasted time!

---

## Summary

**Your markers may not be "inactive"** - they might just not be detected properly due to image quality or lighting. The good news:

✅ Manual calibration is a perfect backup
✅ Manual calibration is often MORE accurate
✅ Improved detection algorithm (4 passes) should help
✅ Better error messages tell you exactly what was/wasn't detected

**Try these in order:**
1. Improve lighting & print quality → Retry marker detection
2. If that fails → Use manual calibration (just as good!)
3. Both work → You're golden for autoscore! 🎯

