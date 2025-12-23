# Calibration Guide Distances Fixed ✅

## Problem
The calibration guide overlay was showing rings at incorrect distances from the bullseye, making it difficult for users to properly position their dartboard during calibration setup.

**You needed:**
- Treble ring: **1 cm from bullseye**
- Single/Double ring: **3 cm from bullseye**

## Solution

### Two Sets of Radii Now Used

1. **`BoardRadii`** (Real Dartboard Measurements)
   - These are the ACTUAL physical dartboard dimensions in millimeters
   - Used for dart scoring and actual board mapping
   - Bull outer: 15.9 mm
   - Treble inner: 99 mm, outer: 107 mm
   - Double inner: 162 mm, outer: 170 mm

2. **`CalibrationGuideRadii`** (User Setup Guide)
   - These are the VISUAL GUIDE distances shown during calibration setup
   - Positioned at correct distances from bullseye for proper dartboard framing
   - Bull outer: 15.9 mm (same as board)
   - **Treble inner: 25.9 mm** (= 15.9 + 10 = 1cm from bullseye) ✅
   - **Treble outer: 33.9 mm** (= 15.9 + 18 = 1.8cm from bullseye)
   - **Double inner: 45.9 mm** (= 15.9 + 30 = 3cm from bullseye) ✅
   - **Double outer: 53.9 mm** (= 15.9 + 38 = 3.8cm from bullseye)

### Files Updated

1. **`src/utils/vision.ts`**
   - Added `CalibrationGuideRadii` export with proper measurements
   - Kept `BoardRadii` unchanged for accurate dart scoring

2. **`src/components/Calibrator.tsx`**
   - Imported `CalibrationGuideRadii`
   - Updated ring drawing to use `CalibrationGuideRadii` for visual guides
   - Bull ring still uses real `BoardRadii` for reference

### How It Works Now

**During Calibration:**
- User sees a visual guide with:
  - Treble ring circle at 1cm from center
  - Double ring circle at 3cm from center
- User positions their physical dartboard to align with these guides
- The actual board detection code still uses real dartboard measurements for accurate dart scoring

**Key Insight:**
The board detection algorithm finds the actual dartboard rings in the camera image and scales everything based on the detected double outer radius. The `CalibrationGuideRadii` is purely for the visual overlay to help users frame their board correctly.

## Testing

Load the calibration view and enable the "Calibration Guide" checkbox to see the rings at the correct positions on your dartboard. The treble should appear ~1cm from bullseye, and the single/double should appear ~3cm from bullseye.

