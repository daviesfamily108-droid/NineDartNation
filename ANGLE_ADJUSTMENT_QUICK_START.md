# Quick Start: Angle-Flexible Calibration

## 🎯 The Feature
Your app now supports calibration from **ANY camera angle** - not just straight-on!

## 🚀 How to Try It

### Step 1: Position Camera at an Angle
- Mount or hold camera 45°-60° from straight-on
- Make sure dartboard is fully visible
- Don't need to be perfectly aligned

### Step 2: Calibrate Normally
1. Go to **Calibrate** tab
2. Click 5 points: D20 (top) → D6 (right) → D3 (bottom) → D11 (left) → Bull
3. Try to get error < 3px
4. Watch confidence meter

### Step 3: Lock Calibration
- Click **"🔒 Lock Calibration"** button
- A **new angle adjustment panel appears!**

### Step 4: Review Auto-Detection
The panel shows your detected angle:
```
Board Rotation: -45.3°
✓ Camera is rotated 45° counter-clockwise
```

The system **automatically found your camera angle!**

### Step 5: Test with One Dart
1. Throw a dart at **D20** (top)
2. Check the displayed score
3. Should show "Double 20" (40 points)

### Step 6A: Perfect Score ✅
If it scores correctly:
- Click **"✓ Save & Test"**
- Done! Your calibration works from this angle

### Step 6B: Wrong Sector?
If it scores wrong sector (e.g., D6 instead of D20):
1. Look at angle adjustment panel
2. Try adjusting **"Sector Fine-Tune"** slider by +1 or -1
3. Throw another dart
4. Adjust until perfect
5. Click **"✓ Save & Test"**

## 💡 Why This Matters

**Before**: Camera had to be straight-on for accurate scoring
- Only one position worked
- Bar/game setup flexibility limited
- Different height players → different angles

**Now**: Camera works at ANY angle
- Mount anywhere in the room
- Works for all player heights
- Save multiple calibrations per angle
- Perfect accuracy regardless of position

## 📊 Real-World Examples

### Bar Setup
```
Mount camera 60° from side to avoid obstructions
Calibrate once
Works perfectly for all players ✅
```

### Home Game Room
```
Camera above dartboard at 45° angle
Calibrate from above
Sector fine-tune to +1
Perfect accuracy from playing position ✅
```

### Multiple Environments
```
Location A: Camera at 30° → Save as "Bar Setup"
Location B: Camera at 90° (side) → Save as "Side View"
Location C: Straight-on → Save as "Front"
Switch calibrations between locations ✅
```

## 🔧 Adjustment Tips

| Issue | Solution |
|-------|----------|
| Score shows correct sector/multiplier | ✅ Perfect! Done |
| Score shows right sector, wrong number (e.g., 2 instead of 40) | This is a multiplier/ring issue, not angle. Recalibrate carefully |
| Scores sectors off-by-1 consistently | Use Sector Fine-Tune slider: +1 or -1 |
| Scores way off (multiple sectors wrong) | Recalibrate: get error < 2px. Auto-detection might need better calibration |
| Can't see the angle panel | Make sure you clicked "🔒 Lock Calibration" button first |

## 🎮 Using Multiple Calibrations

**Save different angles:**
1. Calibrate from angle 1
2. Lock & adjust
3. Go to History → save
4. Recalibrate from different angle
5. Lock & adjust
6. Save again

**Switch between calibrations:**
- Use Calibration History dropdown
- Pick the one matching your current camera position
- Done! ✅

## 📱 Testing Script

```
1. Position camera at 45° angle
2. Run calibration (get < 3px error)
3. Lock calibration
4. See angle panel → note detected angle
5. Throw dart at D20
6. Console output should show correct pBoard and sector
7. If wrong, adjust Sector slider and test again
8. When perfect, click Save
9. Play 3 darts at different sectors to verify
10. All correct? → Angle adjustment works! ✅
```

## 🐛 Debug Mode

If something looks wrong, open browser Console (F12):

```javascript
// Check stored calibration
const cal = JSON.parse(localStorage.getItem("ndn-calibration"));
console.log({
  H: cal.H,
  theta: cal.theta,      // Should be non-zero if angled
  sectorOffset: cal.sectorOffset,
  errorPx: cal.errorPx
});
```

Expected values:
- `theta`: radians (e.g., -0.785 = -45°)
- `errorPx`: < 3px
- `sectorOffset`: usually 0

## ✨ Feature Highlights

✅ **Auto-detection** - System finds angle automatically  
✅ **Fine-tuning** - Two sliders for perfect accuracy  
✅ **Multiple calibrations** - Save different angles in history  
✅ **Backward compatible** - Old calibrations still work  
✅ **No new hardware** - Works with existing camera setup  
✅ **Universal** - Works for all game modes (501, Cricket, X01, etc.)  

## 🎯 Next Steps

1. Try calibrating from a 45° angle
2. Test with some darts
3. Fine-tune if needed
4. Save the calibration
5. Share feedback!

---

**Questions?** See `CAMERA_ANGLE_ADJUSTMENT_GUIDE.md` for detailed usage.
