# 🎯 Calibration Design Options
## Professional Designs Inspired by Scolia & Omni

I've created 4 professional calibration designs you can choose from. Each has a different user experience philosophy:

---

## **Option 1: "Scolia-Style" - Minimalist with Visual Guides**
*Focus: Clean, simple, professional. Shows exactly where to click.*

### Features:
- ✅ Large dartboard image/video feed
- ✅ 5 colored dots showing exactly where to click (D20, D6, D3, D11, Bull)
- ✅ Progress indicator (1/5, 2/5, etc)
- ✅ Green highlight when click is near target
- ✅ "Bull Up" button to start
- ✅ Shows calibration error (px) after complete

### Design:
```
┌─────────────────────────────────────┐
│  CALIBRATION                        │
├─────────────────────────────────────┤
│                                     │
│        [DARTBOARD IMAGE/FEED]       │
│        🔴 D20 (TOP)                 │
│        🔵 D6 (RIGHT)                │
│        🟠 D3 (BOTTOM)               │
│        🟡 D11 (LEFT)                │
│        ⚪ BULL (CENTER)             │
│                                     │
│  Progress: ████░░░░░░░ 40% (2/5)   │
│                                     │
│  📍 Click D6 (RIGHT)                │
│                                     │
│  [Bull Up]  [Skip]                  │
└─────────────────────────────────────┘
```

### Use When:
- Want simplicity and clarity
- Users are less tech-savvy
- Want to look professional

---

## **Option 2: "Omni-Style" - Interactive with Real-Time Feedback**
*Focus: Confidence/accuracy. Shows if clicks are good quality.*

### Features:
- ✅ Large dartboard image with overlay rings
- ✅ Dynamic point zones (circles) showing target areas
- ✅ Real-time distance display ("8px away ✓" or "15px too low ✗")
- ✅ Confidence meter (Low/Fair/Good/Excellent)
- ✅ Allows adjusting clicks before finalizing
- ✅ Final error score and recommendation

### Design:
```
┌────────────────────────────────────┐
│  CALIBRATION SETUP                 │
├────────────────────────────────────┤
│  Confidence: ░░░░░░░░░░ 40%        │
│                                    │
│        [DARTBOARD + RINGS]         │
│        Circle targets shown        │
│        Click inside circles        │
│                                    │
│  Point 2/5: D6 (RIGHT)             │
│  Distance: 6px away ✓              │
│  Quality: Good                     │
│                                    │
│  ╔═══════════════╗                │
│  ║ [Continue]   ║                │
│  ║ [Adjust]     ║                │
│  ║ [Skip]       ║                │
│  ╚═══════════════╝                │
└────────────────────────────────────┘
```

### Use When:
- Want user confidence in the result
- Quality matters more than speed
- Want to show technical accuracy

---

## **Option 3: "Tournament-Style" - Photo Upload**
*Focus: Flexibility. Let user bring their own dartboard photo.*

### Features:
- ✅ 3 calibration methods:
  - **Live**: Use camera feed
  - **Upload**: User uploads dartboard photo
  - **Previous**: Reuse last calibration
- ✅ Same 5-point clicking process
- ✅ Shows dartboard size comparison
- ✅ Lets user crop/zoom their photo
- ✅ Saves last 5 calibrations for comparison

### Design:
```
┌──────────────────────────────────┐
│  CALIBRATION MODE                │
├──────────────────────────────────┤
│                                  │
│  [📹 Live] [📸 Upload] [⏱ History]
│                                  │
│  Live: Camera Feed               │
│  ├─ [Zoom In -] [Zoom Out +]    │
│  ├─ [Flip] [Rotate 90°]         │
│  │                              │
│  └─ [START CALIBRATION]         │
│                                  │
│  Click 5 points on dartboard     │
│  Progress: 2/5                   │
│                                  │
│  [Back to Modes]                 │
└──────────────────────────────────┘
```

### Use When:
- Want maximum flexibility
- Users want to compare setups
- Want to support phone camera variations

---

## **Option 4: "Quick-Start" - Guided Step-by-Step**
*Focus: Ease of use. Walks you through it like a wizard.*

### Features:
- ✅ Step-by-step guide (1/5, 2/5, etc)
- ✅ Instructions for each step:
  - "Click the TOP of the double ring (D20 area)"
  - "Click the RIGHT side of double ring (D6 area)"
  - etc
- ✅ Large target zone highlighted on image
- ✅ "Undo" button to go back one step
- ✅ Summary with calibration quality rating

### Design:
```
┌─────────────────────────────────────┐
│  STEP 1/5: Top of Double Ring       │
├─────────────────────────────────────┤
│                                     │
│  Find D20 on your dartboard.        │
│  Click the very top edge of         │
│  the double ring around it.         │
│                                     │
│  [DARTBOARD WITH HIGHLIGHTED AREA]  │
│        ↑                            │
│        CLICK HERE                   │
│                                     │
│  [← Back]  [Skip]  [Help?]          │
│                                     │
│  Progress: ██░░░░░░░░ 20%          │
└─────────────────────────────────────┘
```

### Use When:
- First-time users need guidance
- Want to minimize mistakes
- Want to teach people properly

---

## **Option 5: "Hybrid Pro" - Combines Best of All**
*Focus: Versatility. Choose what you need.*

### Features:
- ✅ Auto-detect mode: Try to auto-detect, user confirms
- ✅ Manual mode: Click 5 points (current)
- ✅ Verification mode: Shows if calibration is good for game
- ✅ Grid overlay option: Shows reference grid
- ✅ Adjustments: Fine-tune any point
- ✅ History: View previous calibrations

### Design:
```
┌──────────────────────────────────────┐
│  CALIBRATION                         │
├──────────────────────────────────────┤
│  [🤖 Auto] [👆 Manual] [✓ Verify]   │
│                                      │
│  MANUAL MODE                         │
│  [Grid On/Off] [Undo] [Reset]       │
│                                      │
│  [DARTBOARD]                         │
│  Point 2/5: D6 (RIGHT)               │
│  Error: 5px ✓                        │
│                                      │
│  Calibration Score: 88/100 Good      │
│  Suitable for: 501, Cricket, Darts  │
│  Not suitable for: X01 (needs 92+)  │
│                                      │
│  [Lock]  [Save As Preset]  [Info]   │
└──────────────────────────────────────┘
```

### Use When:
- Want a complete, professional solution
- Want advanced users to have power features
- Want beginners to have guidance

---

## **Comparison Table**

| Feature | Scolia | Omni | Photo | Wizard | Hybrid |
|---------|--------|------|-------|--------|--------|
| **Simplicity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Speed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Quality Assurance** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Beginner Friendly** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Power User Features** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Code Complexity** | Low | Medium | Medium | Medium | High |
| **Lines of Code** | ~100 | ~300 | ~250 | ~200 | ~600 |

---

## **Recommendations by Use Case**

### 🏠 Casual Home Players
→ **Option 1 (Scolia)** - Simple, fast, gets job done

### 🎯 Competitive Tournament Players
→ **Option 2 (Omni)** - Quality matters, confidence in result

### 📱 Mobile/Phone Users
→ **Option 3 (Photo)** - Upload photo for flexibility

### 🤷 First-Time Users
→ **Option 4 (Wizard)** - Step-by-step guidance

### ⭐ Professional/All-In-One
→ **Option 5 (Hybrid)** - Every feature available

---

## **Next Steps**

Which design appeals to you most?

1. **Pick one** (or hybrid of ideas)
2. **I'll build it** fully with:
   - Proper state management
   - Visual feedback
   - Error handling
   - Save/load functionality
3. **Test it** end-to-end
4. **Iterate** based on feedback

**Let me know which you prefer!** 🎯

