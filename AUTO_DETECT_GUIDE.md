# Calibration - Use Auto-Detect Instead of Manual Clicking ✅

## The Issue
Manual clicking 5 points is error-prone because:
1. It's hard to click exactly on the ring edges
2. Small clicking errors compound into calibration errors
3. Tolerance calculations assume ring-center or consistent positioning
4. The system requires very precise point placement (4.5mm tolerance)

## The Solution: AUTO-DETECT 🎯

The calibrator has a fully automatic ring detection system that works MUCH better than manual clicking!

### How Auto-Detect Works

**Auto-Detect automatically:**
1. ✅ Detects the board center
2. ✅ Finds all 6 ring radii (bull inner/outer, treble inner/outer, double inner/outer)
3. ✅ Generates perfect calibration points (centered on rings)
4. ✅ Computes the homography automatically
5. ✅ Validates stability (runs detection multiple times)
6. ✅ Auto-locks calibration if confidence ≥ 95%

**Advantages over manual clicking:**
- No clicking required - completely automatic
- Uses edge detection (Sobel) for precise ring location
- Runs stability checks to ensure accuracy
- Generates perfectly centered calibration points
- Works with any board angle or perspective

### How to Use Auto-Detect

#### Step 1: Capture a Frame
```
1. Open Calibrator
2. Position camera to see full board clearly
3. Tap "Capture" to capture a video frame
   (Or load a photo of your dartboard)
```

#### Step 2: Click "Auto Detect"
```
4. Tap the "Auto Detect" button
   - System analyzes the image
   - Finds the board and all rings
   - Shows detected rings on overlay
   - Computes homography automatically
```

#### Step 3: Verify Rings
```
5. Check that the cyan/colored rings match your physical board:
   - Cyan circles should align with double ring
   - Yellow circles should align with treble ring
   - Green circles should align with bull
```

#### Step 4: Auto-Lock or Manual Lock
```
6. If confidence ≥ 95%: 
   → Calibration auto-locks automatically ✅
   
   If confidence < 95%:
   → Click "Verify" to see detection details
   → Or capture a different frame and try again
   → Or click "Lock" button to manually lock
```

### Expected Output

After successful auto-detect:
- ✅ Status shows "Cal OK" 
- ✅ Confidence ≥ 95% (or whatever threshold)
- ✅ Calibration locked
- ✅ Ready for dart detection!

### Troubleshooting Auto-Detect

#### If rings don't show or are misaligned:

**Problem**: "No dartboard detected" or rings in wrong place
**Solution**:
1. Ensure board is fully visible in camera
2. Check board has good contrast (light background)
3. Capture a different angle or lighting
4. Try a photo of the board instead of video capture

**Problem**: Confidence too low (< 95%)
**Solution**:
1. Use better lighting (avoid shadows)
2. Position board square to camera (minimize perspective)
3. Capture multiple frames and try each one
4. If consistent, may need different board angle

**Problem**: Rings detected but slightly off
**Solution**:
1. Small misalignment (1-2px) is normal
2. Won't affect scoring if within tolerance
3. Proceed with locking
4. Test with a dart throw to verify

### When to Use Manual Clicking

Only use manual 5-point clicking if:
- Auto-detect fails completely
- You have unusual lighting/board setup
- You need precise control over calibration points

**If you resort to manual clicking:**
1. Click as close to ring CENTER as possible
2. Click D20 (top), D6 (right), D3 (bottom), D11 (left), Bull (center)
3. Points should be on or very close to the ring edges
4. All 5 points must verify before locking

### Default Workflow (Recommended)

```
┌─────────────────────┐
│   Capture Frame     │ ← Position camera on board
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Auto Detect       │ ← System finds rings automatically
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Verify Rings       │ ← Check cyan/yellow/green lines align
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Auto-Lock          │ ← Locks automatically if confidence ≥ 95%
│  (or click Lock)    │ ← Or manually lock if needed
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Ready for Darts!   │ ← Throw darts, system scores automatically
└─────────────────────┘
```

### Advanced: Understanding the Detection

Auto-detect uses:
1. **Edge Detection (Sobel)**: Finds strong gradients at ring boundaries
2. **Circle Search**: Finds center and doubleOuter radius via scoring
3. **Radial Search**: Locates other rings by scanning inward/outward
4. **Stability Check**: Reruns detection 3x to ensure consistency
5. **Confidence Scoring**: Rates detection quality as percentage

All this happens in seconds automatically!

### Why Manual Clicking Fails

The manual clicking approach requires:
1. User to identify exact ring edges (hard!)
2. Precise clicking to within 1-2 pixels (difficult on mobile)
3. All 5 points must be within 4.5mm tolerance in board space
4. Small clicking errors → calibration error → scoring error

Auto-detect eliminates all these issues by using computational geometry!

## Summary

**👉 Use Auto-Detect for reliable, automatic calibration!**

- ✅ Fully automatic (no clicking required)
- ✅ Uses computer vision for precision
- ✅ Verifies stability automatically
- ✅ Works in seconds
- ✅ Much more reliable than manual clicking

**Try it now:**
1. Capture a frame of your dartboard
2. Click "Auto Detect"
3. Watch the rings appear on the overlay
4. Calibration auto-locks if good

That's it! Your calibration is done. 🎯
