# 🎯 Calibration Persistence - Visual Guide

## What Users See

### 1️⃣ Calibrate and Lock

![Calibrator Screen](Description below)

**Calibrator Tab → Step 3 · Align & Lock**
```
┌─────────────────────────────────────────────────┐
│ Click 6 points: ① TOP ② RIGHT ③ BOTTOM       │
│ ④ LEFT of double rim, ⑤ BULLSEYE ⑥ OUTER BULL │
│                                                  │
│ [Compute] [Lock in] [Undo] [Refine] [Reset]   │
│                                                  │
│ Locked: ✗ (Not locked)                          │
└─────────────────────────────────────────────────┘
```

**After clicking "Lock in":**
```
┌─────────────────────────────────────────────────┐
│ ✓ Calibration active                    [Unlock]│
│ Your calibration is saved and active           │
│ across all game modes. It will be used in       │
│ Online, Offline, and Tournaments.              │
│                                                  │
│ Precision: 2.45 px RMS error                   │
└─────────────────────────────────────────────────┘

        ↑
   NEW SECTION! ✨
   Shows calibration is locked and active
```

---

### 2️⃣ App Header Shows Status (All Screens)

**Before Navigation - Calibrator Tab:**
```
┌───────────────────────────────────────────────────────────────┐
│ NINE-DART-NATION 🎯  Welcome @John  ✓ Calibration Active   │
│                                         (2.45px)              │
└───────────────────────────────────────────────────────────────┘
              ↑ Shows calibration is ready
```

**After Navigating to Online Play:**
```
┌───────────────────────────────────────────────────────────────┐
│ NINE-DART-NATION 🎯  Welcome @John  ✓ Calibration Active   │
│                                         (2.45px)              │
└───────────────────────────────────────────────────────────────┘
   Still shows! ✨ User knows calibration is still there
```

**After Navigating to Offline Play:**
```
┌───────────────────────────────────────────────────────────────┐
│ NINE-DART-NATION 🎯  Welcome @John  ✓ Calibration Active   │
│                                         (2.45px)              │
└───────────────────────────────────────────────────────────────┘
   Still shows! ✨ Available for scoring
```

**After Page Refresh:**
```
┌───────────────────────────────────────────────────────────────┐
│ NINE-DART-NATION 🎯  Welcome @John  ✓ Calibration Active   │
│                                         (2.45px)              │
└───────────────────────────────────────────────────────────────┘
   Immediately restored! ✨ No recalibration needed
```

---

### 3️⃣ Click Header Badge to Return to Calibrator

**User clicks "✓ Calibration Active" badge:**
```
┌───────────────────────────────────────────────────────────────┐
│ NINE-DART-NATION 🎯  Welcome @John  ✓ Calibration Active   │
│                           ↓                                   │
│                      [Click here]                             │
└───────────────────────────────────────────────────────────────┘
                            ↓
        Navigates to Calibrator tab
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ ✓ Calibration active                            [Unlock]   │
│ Your calibration is saved and active                        │
│ across all game modes.                                      │
│                                                              │
│ Precision: 2.45 px RMS error                               │
└─────────────────────────────────────────────────────────────┘
```

---

### 4️⃣ Unlock to Recalibrate

**User clicks "Unlock" button:**
```
✓ Calibration active                            [Unlock]
Your calibration is saved and active                    
across all game modes.

Precision: 2.45 px RMS error
         ↓ (User clicks Unlock)
         ↓
SECTION DISAPPEARS!

Now user can:
- [Compute] - Calculate new calibration
- [Lock in] - Lock the new one
- [Reset] - Start over
```

---

## User Journey Examples

### Example 1: New User Workflow

```
1. Opens site
   └─ No "✓ Calibration Active" badge (not calibrated yet)

2. Goes to Calibrator tab
   └─ No "Calibration active" section (not locked)

3. Captures frame and clicks 6 points
   └─ Error shows: "4.32 px"

4. Clicks "Lock in"
   └─ ✨ "✓ Calibration Active" appears at TOP of Calibrator
   └─ ✨ "✓ Calibration Active • 4.32px" appears in HEADER

5. Goes to Online Play
   └─ Header still shows: "✓ Calibration Active • 4.32px"
   └─ User creates match
   └─ Autoscoring camera works with saved calibration

6. Refreshes page (F5)
   └─ ✨ "✓ Calibration Active • 4.32px" appears IMMEDIATELY in header
   └─ No loading delay
   └─ Calibration ready to use
```

### Example 2: Multi-Tab Navigation

```
User is in Calibrator
├─ Sees: "✓ Calibration Active • 2.45px" (header + section)

Clicks Online tab
├─ Sees: "✓ Calibration Active • 2.45px" (header)
├─ Action: Creates online match
└─ Uses calibration for dart detection

Clicks Offline tab
├─ Sees: "✓ Calibration Active • 2.45px" (header)
├─ Action: Plays offline game
└─ Uses calibration for dart detection

Clicks Tournaments tab
├─ Sees: "✓ Calibration Active • 2.45px" (header)
├─ Action: Enters tournament
└─ Uses calibration for dart detection

Clicks Calibrator tab
├─ Sees: "✓ Calibration Active • 2.45px" (header + section)
└─ Option: Click "Unlock" to recalibrate if needed
```

### Example 3: Recovery After Mistake

```
Calibration is locked but error is high (8.75 px)

1. User navigates and sees "✓ Calibration Active • 8.75px"
   └─ Thinks: "Hmm, that error is high..."

2. Clicks header badge to go to Calibrator
   └─ ✓ One click!

3. Sees "Calibration Active" section with error displayed
   └─ Confirms: "Yes, 8.75px is high"

4. Clicks "Unlock"
   └─ Section disappears
   └─ Ready to recalibrate

5. Recalibrates with better placement
   └─ Gets error: 1.23 px ✨

6. Clicks "Lock in"
   └─ "✓ Calibration Active • 1.23px" appears
   └─ Much better! 😊
```

---

## Visual States

### State 1: No Calibration
```
Header:
[NINE-DART-NATION 🎯] [Welcome @John]
(No "✓ Calibration Active" badge)

Calibrator Section:
(No "Calibration active" section)

Status: ❌ Calibration not available
```

### State 2: Calibration Locked (Current)
```
Header:
[NINE-DART-NATION 🎯] [Welcome @John] [✓ Calibration Active • 2.45px] ← NEW!
                                        └─ Clickable!
                                        └─ Shows precision

Calibrator Section:
┌─────────────────────────────────────┐
│ ✓ Calibration active       [Unlock]  │ ← NEW SECTION!
│ Precision: 2.45 px RMS error        │
└─────────────────────────────────────┘

Status: ✅ Calibration available everywhere
```

### State 3: Calibration Locked, Different Tab
```
Header (Online Play):
[NINE-DART-NATION 🎯] [Welcome @John] [✓ Calibration Active • 2.45px]
                                        └─ Still there! ✨

Calibrator Section: (N/A - not in Calibrator tab)

Status: ✅ Calibration ready for autoscoring
```

### State 4: Page Refresh
```
Before refresh:
[✓ Calibration Active • 2.45px]

During refresh: (page loading...)

After refresh:
[✓ Calibration Active • 2.45px]
└─ Appears IMMEDIATELY ✨
└─ No delay
└─ No recalibration needed

Status: ✅ Persisted!
```

---

## Color Legend

- 🟢 **Green:** Calibration active and locked
- 🔵 **Blue:** Interactive (clickable badge)
- ⚠️  **Yellow:** Warning (if calibration needed but not present)
- 🟠 **Orange:** High error (4+ pixels)

---

## Responsiveness

### Desktop (Full Width)
```
┌──────────────────────────────────────────────────────────────┐
│ NINE-DART 🎯  Welcome @John  ✓ Calibration • 2.45px [Full]  │
└──────────────────────────────────────────────────────────────┘
Layout: Horizontal, all items in one line
```

### Tablet (Medium Width)
```
┌────────────────────────────────────────────────┐
│ NINE-DART 🎯  Welcome @John                    │
│ ✓ Calibration • 2.45px        [Full] [Demo]   │
└────────────────────────────────────────────────┘
Layout: May wrap to two lines
```

### Mobile (Narrow)
```
┌──────────────────────────────┐
│ NINE-DART 🎯  ☰ Menu         │
│ Welcome @John  [2.45px calib] │
│ ✓ Active [Full]              │
└──────────────────────────────┘
Layout: Stacked, prioritizes important info
```

---

## Summary

✨ **What's New for Users:**

1. **"Calibration Active" section in Calibrator** - Shows calibration is locked with precision info
2. **"✓ Calibration Active" badge in header** - Always visible across all tabs
3. **One-click navigation** - Click badge to go back to Calibrator
4. **Easy unlock** - One click to recalibrate
5. **Persistent indication** - Survives navigation and refresh
6. **Peace of mind** - Users know their calibration is always there

✨ **Key User Benefits:**

- Never wonder if calibration is lost when navigating
- Visual confirmation calibration is active everywhere
- Quick access to calibrator from any screen
- Clear error/precision information
- Confidence in autoscoring accuracy
