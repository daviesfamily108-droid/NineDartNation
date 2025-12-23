# 🎯 QUICK REFERENCE: THE FIX

## What Was Broken
```
Camera Detects Dart → Score Calculated → ??? → Scoreboard NOT Updated ❌
```

## What's Fixed
```
Camera Detects Dart → Score Calculated → onAddVisit Called → Scoreboard Updated ✅
```

## What I Changed

### Before
```tsx
<CameraView
  scoringMode="x01"
  showToolbar={true}
  immediateAutoCommit
  cameraAutoCommit="camera"
  onAutoDart={...}
/>
```

### After
```tsx
<CameraView
  scoringMode="x01"
  showToolbar={true}
  immediateAutoCommit
  cameraAutoCommit="camera"
  onAddVisit={makeOfflineAddVisitAdapter(         ← ADDED THIS
    commitManualVisitTotal,                       ← ADDED THIS
  )}                                              ← ADDED THIS
  onAutoDart={...}
/>
```

## Where This Appears (3 places in OfflinePlay.tsx)
1. **Line 3484** - Mobile standard game
2. **Line 3519** - Mobile fullscreen  
3. **Line 3665** - Desktop main view

## How It Works

```
┌─────────────────────────────────────────────────┐
│ Dart Detected by Camera                         │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ Score Calculated (e.g., D20 = 40 points)       │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ 3 Darts Accumulated                             │
│ Visit Total = 105 points                        │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ callAddVisit(105, 3) Called                     │
│                                                 │
│ if (onAddVisit) {                               │
│   onAddVisit(105, 3)  ← NOW WORKS               │
│ }                                               │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ makeOfflineAddVisitAdapter Invoked              │
│ → commitManualVisitTotal(105)                   │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ Game State Updated                              │
│ Remaining = 501 - 105 = 396                     │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ Scoreboard Updates ✅                            │
│ Player sees "396" as new remaining score        │
└─────────────────────────────────────────────────┘
```

## Test It Now

1. **Hard Refresh**: `Ctrl+Shift+R`
2. **Start X01 501**
3. **Enable Camera**
4. **Throw 3 Darts**
5. **Check**: Does scoreboard show 501 - (your score) ?
   - ✅ YES = SUCCESS
   - ❌ NO = Problem (report with console screenshot)

## The Chain of Responsibility

```
CameraView
    ↓ calls
onAddVisit (now provided)
    ↓ executes
makeOfflineAddVisitAdapter
    ↓ calls
commitManualVisitTotal
    ↓ updates
matchState (player score)
    ↓ triggers
Scoreboard re-render
    ↓ shows
New remaining score ✅
```

## Key Insight

**CameraView doesn't know about games.** It just:
- Detects darts
- Calculates scores
- Calls its callback: "Hey, I have a score!"

**The parent component (OfflinePlay) says:** "OK, here's what to do with that score"

**Before fix**: CameraView called a callback... that didn't exist ❌

**After fix**: CameraView calls a callback... that updates the game ✅

---

**Confidence Level**: 🟢 GREEN
- Simple fix
- Low risk
- High impact
- Should work immediately

🚀 **Ready to test!**
