# 🎯 Complete Game Mode Mapping Integration Guide

## System Architecture Overview

```
┌─────────────────┐
│  CALIBRATION    │ H matrix computed from 5 points
│  (Calibrator)   │ theta = board orientation
└────────┬────────┘
         │ Stored in useCalibration store + localStorage
         ▼
┌─────────────────┐
│  CAMERA STREAM  │ Live video feed from dartboard
│  (CameraView)   │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────┐
│  DART DETECTION (DartDetector)   │ Finds dart tips in pixels
│  • Frame processing              │ • Contour detection
│  • Tip identification            │ • Confidence scoring
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  HOMOGRAPHY TRANSFORMATION           │ pixel coords → board coords
│  • refinePointSobel() refines tip     │
│  • sx/sy scaling to calibration space│
│  • imageToBoard(H, pCal) maps to mm  │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  SCORE MAPPING                   │ board coords → ring/sector/value
│  scoreFromImagePoint()           │
│  scoreAtBoardPointTheta()        │
│  Returns: {                      │
│    base: 0-50                    │
│    ring: SINGLE|DOUBLE|TRIPLE... │
│    sector: 1-20                  │
│    mult: 0|1|2|3                 │
│  }                               │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  GAME MODE PROCESSORS                    │
│  (Receives: value, ring, info.sector)    │
├──────────────────────────────────────────┤
│ X01: applyX01Dart()                      │
│ Cricket: applyCricketDart()              │
│ Shanghai: applyShanghaiDart()            │
│ Killer: applyKillerDart()                │
│ Around Clock: applyATCDart()             │
│ Count-Up: applyCountUpDart()             │
│ And 10+ others...                        │
└────────┬─────────────────────────────────┘
         │
         ▼
┌───────────────────────────┐
│  GAME STATE UPDATE        │ Score deducted from player
│  (match.players[idx])     │ Legs/rounds/lives updated
└───────────────────────────┘
```

## Game Modes - Implementation Status & Dart Mapping

### ✅ FULLY IMPLEMENTED WITH CAMERA SUPPORT

#### 1. **X01 (501, 301, 101, 181, 701, etc.)**

**Files**:
- `src/components/OfflinePlay.tsx` lines 3353+
- `src/game/x01.ts`

**Integration**:
```tsx
onAddVisit={makeOfflineAddVisitAdapter(
  addVisit,       // Updates player leg with score
  endLeg,         // Handles leg completion
  { shouldDeferCommit, awaitingClear }
)}
```

**Dart Mapping**:
```typescript
Detected Dart: D20 (value: 40, ring: DOUBLE, sector: 20)
                ↓
            addDart(40, "D20 40", "DOUBLE")
                ↓
            Applied to pendingScore (accumulates per visit)
                ↓
            callAddVisit(40, 1) when 3 darts thrown or bust
                ↓
            Game logic checks:
            • Double-in rule (if enabled)
            • Bust detection (after=0, after=1, or after<0 without double)
            • Finish detection (after=0 with double)
                ↓
            leg.totalScoreRemaining -= 40
            Scoreboard updates immediately
```

**Supported Sub-Modes**:
- 501 (standard)
- 301 (short game)
- 101, 181, 701 (variants)

**Scoring Rules Applied**:
- Double-in requirement (if enabled)
- Bust on negative or 1 remaining (double-out)
- Finish only on double (or inner bull)
- Pre-open dart tracking (darts thrown before opening)
- Double window tracking (darts in final 50 points)

---

#### 2. **Cricket**

**Files**:
- `src/components/OfflinePlay.tsx` lines 3615-3670 (camera)
- `src/game/cricket.ts`
- `src/components/OfflinePlay.tsx` lines 1841-2005 (game logic)

**Integration**:
```tsx
onAutoDart={(value, ring, info) => {
  if (value > 0) {
    const r = ring === "MISS" ? undefined : ring;
    addCricketAuto(
      value,              // point value (5, 10, 15, ... 50)
      r as any,           // ring type
      info?.sector ?? null // which number (1-20 or 25)
    );
    return true;          // Signal successful processing
  }
}}
```

**Dart Mapping**:
```typescript
Detected Dart: D20 (value: 40, ring: DOUBLE, sector: 20)
                ↓
            applyCricketDart(state, 40, "DOUBLE", 20)
                ↓
            Game checks: Is sector 20? Is it one of 15-20, 25?
                ↓
            YES: ring=DOUBLE → 2 marks on "20"
                ↓
            Updated marks: { "20": 2, "19": 0, ... }
                ↓
            If all 7 numbers closed (15-20, 25):
            Remaining darts score points
                ↓
            points += (value of darts hit by player that opponent hasn't closed)
                ↓
            Scoreboard updates: marks + points display
```

**Game Numbers**: 15, 16, 17, 18, 19, 20, 25 (bullseye)

**Scoring**: 0 marks (missed), 1 mark (single), 2 marks (double), 3 marks (triple, closed)

---

#### 3. **Shanghai**

**Files**:
- `src/components/OfflinePlay.tsx` lines 5638-5680 (camera)
- `src/game/shanghai.ts`
- `src/components/OfflinePlay.tsx` lines 2068-2135 (game logic)

**Integration**:
```tsx
onAutoDart={(value, ring, info) => {
  if (value > 0) {
    const r = ring === "MISS" ? undefined : ring;
    addShanghaiAuto(
      value,              // point value
      r as any,           // ring type
      info?.sector ?? null // target sector
    );
    return true;
  }
}}
```

**Dart Mapping**:
```typescript
Detected Dart: S1 (value: 1, ring: SINGLE, sector: 1)
                ↓
            Round 1 - Target: 1
                ↓
            applyShanghaiDart(state, 1, "SINGLE", 1)
                ↓
            Game checks: Does sector match target?
                ↓
            YES: ring=SINGLE → 1 point, state.turnHits.singles++
                ↓
            Points accumulated: 1

            Detected Dart: D1 (value: 2, ring: DOUBLE, sector: 1)
                ↓
            Game checks: sector 1 = target 1? YES
                ↓
            ring=DOUBLE → 2 points, state.turnHits.doubles++
                ↓
            Points accumulated: 3

            Detected Dart: T1 (value: 3, ring: TRIPLE, sector: 1)
                ↓
            Game checks: sector 1 = target 1? YES
                ↓
            ring=TRIPLE → 3 points, state.turnHits.triples++
                ↓
            SHANGHAI achieved! (single+double+triple in same turn)
                ↓
            Score += 6 (1+2+3), Round advances to 2
```

**Rounds**: 1-20 (each number) + special round 21 (any)

**Shanghai Bonus**: Triple points if S+D+T all hit in same 3-dart turn

---

#### 4. **Killer**

**Files**:
- `src/components/OfflinePlay.tsx` lines 5725+ (camera UI)
- `src/game/killer.ts`
- `src/components/OfflinePlay.tsx` lines 2195-2310 (game logic)

**Integration**:
```tsx
onAutoDart={(value, ring, info) => {
  addKillerAuto(value, ring, info?.sector);
  return true;
}}
```

**Dart Mapping**:
```typescript
Detected Dart: D20 (value: 40, ring: DOUBLE, sector: 20)
                ↓
            applyKillerDart(state, playerNumber, sector)
                ↓
            Game checks: Is this player's target number?
                ↓
            Player A has target 20:
            YES → Player A removes a life from each other player (multi-kill)
                ↓
            Player B has target 20:
            YES → Player B removes a life from each other player
                ↓
            lives: { playerA: 3, playerB: 2, playerC: 3 }
                ↓
            Any player reaches 0 lives: Eliminated
                ↓
            Last player standing wins
```

**Mechanics**:
- Each player assigned random number 1-20
- Hit opponent's number = remove their life
- 3 lives per player (configurable)
- Self-hit = remove own life
- Can switch targets during game

---

#### 5. **Around the Clock**

**Files**:
- `src/components/OfflinePlay.tsx` lines 5791+
- `src/game/aroundTheClock.ts`
- `src/components/OfflinePlay.tsx` lines 2358-2410 (game logic)

**Integration**:
```tsx
onAutoDart={(value, ring, info) => {
  addATCAuto(value, ring, info?.sector);
  return true;
}}
```

**Dart Mapping**:
```typescript
Current target: 1

Detected Dart: S1 (value: 1, ring: SINGLE, sector: 1)
                ↓
            Game checks: Does sector match current target?
                ↓
            YES → progress.target_1 incremented (hit count)
                ↓
            If 1 hit required: target advances to 2
                ↓
            New target: 2

Detected Dart: D2 (value: 4, ring: DOUBLE, sector: 2)
                ↓
            Game checks: Is sector 2 = target 2?
                ↓
            YES and DOUBLE:
            • Single counts as 1 hit
            • Double counts as 2 hits
            • Triple counts as 3 hits
                ↓
            If 2 hits required: target advances to 3
            If only 1 hit found: needs one more hit on 2
```

**Target Sequence**: 1→2→3→...→20→Bullseye (25)

**Hit Requirements**: Single=1, Double=2, Triple=3 (cumulative per turn)

---

#### 6. **Count-Up**

**Files**:
- `src/game/countUp.ts`
- `src/components/OfflinePlay.tsx` lines 2476-2530

**Integration**:
```tsx
// Manual only (no camera integration yet, but architecture supports it)
addCountUpAuto(value, ring);
```

**Dart Mapping**:
```typescript
Detected Dart: T20 (value: 60, ring: TRIPLE, sector: 20)
                ↓
            Game simply adds value to running total
                ↓
            totalScore += 60
                ↓
            Highest score after 1000 points wins
                ↓
            Scoreboard shows: Current Total, Last Dart, Best Dart
```

**Win Condition**: First to 1000 points

---

#### 7. **High Score / Low Score**

**Files**:
- `src/game/highScore.ts`
- `src/components/OfflinePlay.tsx` lines 2582-2630

**Dart Mapping**:
```typescript
High Score Mode:
  Total score → score += dartValue
  First to 2000 points wins

Low Score Mode:
  Track rounds (each round = 3 darts)
  Lower total score after N rounds wins
  Can't score above 100/round (goes negative)
```

---

### 📋 GAME MODE SUPPORT MATRIX

| Game Mode | Status | Camera Auto | Game File | Handler | Notes |
|-----------|--------|:-----------:|-----------|---------|-------|
| **X01** | ✅ FULL | ✅ | `x01.ts` | `addVisit` | Bust/finish rules |
| **Cricket** | ✅ FULL | ✅ | `cricket.ts` | `addCricketAuto` | Marks & points |
| **Shanghai** | ✅ FULL | ✅ | `shanghai.ts` | `addShanghaiAuto` | Shanghai bonus |
| **Killer** | ✅ FULL | ✅ | `killer.ts` | `addKillerAuto` | Multi-kill mechanic |
| **Around Clock** | ✅ FULL | ✅ | `aroundTheClock.ts` | `addATCAuto` | Hit counting |
| **Count-Up** | ✅ FULL | 🔄 | `countUp.ts` | `addCountUpAuto` | Simple accumulation |
| **High Score** | ✅ FULL | 🔄 | `highScore.ts` | `addHighScoreAuto` | 2000 point target |
| **Low Score** | ✅ FULL | 🔄 | `lowScore.ts` | `addLowScoreAuto` | Minimize points |
| **Double Practice** | ✅ FULL | ✅ | `doublePractice.ts` | `addDoublePracAuto` | D20 focus |
| **Treble Practice** | ✅ FULL | ✅ | `treblePractice.ts` | `addTreblePracAuto` | T20 focus |
| **Checkout 170** | ✅ FULL | ✅ | `checkout.ts` | `addCheckoutAuto` | Limited finish |
| **Checkout 121** | ✅ FULL | ✅ | `checkout.ts` | `addCheckoutAuto` | Limited finish |
| **Baseball** | ✅ FULL | 🔄 | `baseball.ts` | `addBaseballAuto` | 9 innings |
| **Golf** | ✅ FULL | 🔄 | `golf.ts` | `addGolfAuto` | 18 holes |
| **Halve It** | ✅ FULL | 🔄 | `halveIt.ts` | `addHalveItAuto` | Stage doubling |
| **High-Low** | ✅ FULL | 🔄 | `highLow.ts` | `addHighLowAuto` | High/Low target |
| **Tic Tac Toe** | ✅ FULL | 🔄 | `ticTacToe.ts` | `addTicTacAuto` | 3×3 grid |
| **American Cricket** | ✅ FULL | 🔄 | `amCricket.ts` | `addAmCricketAuto` | 3-mark req. |
| **Scam** | ✅ FULL | 🔄 | `scam.ts` | `addScamAuto` | Risk mechanic |
| **Fives** | ✅ FULL | 🔄 | `fives.ts` | `addFivesAuto` | 5-point multiples |
| **Sevens** | ✅ FULL | 🔄 | `sevens.ts` | `addSevensAuto` | 7-point multiples |
| **Bob's 27** | ✅ FULL | 🔄 | `bobs27.ts` | `addBobs27Auto` | 27 darts |

**Legend**:
- ✅ FULL = Fully implemented
- ✅ = Camera auto-scoring works
- 🔄 = Can process detected darts but may need UI enhancement
- ❌ = Not yet implemented

---

## Data Flow Example: X01 with Camera

### Scenario: Player throws D20 in X01 501

```
1. DETECTION LAYER
   ├─ Camera captures frame
   ├─ DartDetector finds dart tip at pixel (523, 411) with 0.92 confidence
   └─ Console: "[CAMERA] detected raw 0.92 {x: 523, y: 411}"

2. TRANSFORMATION LAYER
   ├─ Tip refined to (524, 410) using Sobel edge detection
   ├─ Scale to calibration space: pCal = { x: 524/1.2, y: 410/1.2 }
   ├─ Apply homography: pBoard = imageToBoard(H, pCal)
   ├─ Result: pBoard ≈ { x: 12.5mm, y: 0mm } (D20 location)
   └─ Check: isPointOnBoard(pBoard) = TRUE

3. SCORING LAYER
   ├─ scoreFromImagePoint(H, pCal, theta, sectorOffset)
   ├─ scoreAtBoardPointTheta(pBoard, theta, 0)
   └─ Result: { base: 40, ring: "DOUBLE", sector: 20, mult: 2 }

4. GAME LOGIC LAYER
   ├─ addDart(40, "40 (D20)", "DOUBLE", { calibrationValid: true, pBoard })
   ├─ Checks X01 rules:
   │  ├─ Is double-in enabled? YES
   │  ├─ Is player opened? NO
   │  ├─ Is this a double? YES
   │  └─ Action: Set isOpened = TRUE, pendingScore = 40
   ├─ After 3 darts (40 + 25 + 16):
   │  └─ callAddVisit(81, 3, { ... })
   └─ Result: player.legs[-1].totalScoreRemaining = 501 - 81 = 420

5. UI UPDATE LAYER
   ├─ Scoreboard updates showing:
   │  ├─ Current score: 420
   │  ├─ Last 3: 40, 25, 16
   │  └─ 3-dart avg: 27
   └─ Camera shows overlay with "D20" label

6. PERSISTENCE LAYER
   ├─ Match state saved to localStorage
   ├─ Broadcast message sent to other windows
   └─ Match snapshot written (if online)
```

---

## Integration Checklist for New Game Modes

To add camera support to a game mode:

1. **Create Game File** (`src/game/yourGame.ts`)
   ```typescript
   export type YourGameState = { /* ... */ };
   export function createYourGameState(): YourGameState { }
   export function applyYourGameDart(
     state: YourGameState,
     value: number,
     ring?: "SINGLE"|"DOUBLE"|"TRIPLE"|"BULL"|"INNER_BULL",
     sector?: number | null
   ): number { /* returns points scored */ }
   ```

2. **Add to OfflinePlay.tsx** (Camera Handler)
   ```tsx
   onAutoDart={(value, ring, info) => {
     if (value > 0) {
       const r = ring === "MISS" ? undefined : ring;
       addYourGameAuto(value, r, info?.sector ?? null);
       return true;  // CRITICAL: Must return true
     }
   }}
   ```

3. **Implement Handler Function** (OfflinePlay.tsx)
   ```tsx
   function addYourGameAuto(
     value: number,
     ring?: Ring,
     sector?: number | null
   ): boolean {
     recordDart("YourGame");
     setYourGame((prev) => {
       const copy = { ...prev };
       applyYourGameDart(copy as any, value, ring, sector);
       return copy;
     });
     return true;
   }
   ```

4. **Test Flow**
   - Throw dart at dartboard
   - Verify detection shows correct ring/sector/value
   - Verify game state updates with correct rules
   - Verify scoreboard displays correct game metrics

---

## Troubleshooting Game Mode Issues

### Problem: Dart detected but score not applied

**Check**:
1. Game handler returns `true`
2. State setter is called synchronously
3. Console shows no errors in game logic

**Fix**:
```tsx
// WRONG
onAutoDart={(value, ring, info) => {
  // Missing return true!
  addYourGameAuto(value, ring, info?.sector);
}}

// CORRECT
onAutoDart={(value, ring, info) => {
  addYourGameAuto(value, ring, info?.sector);
  return true;  // ← REQUIRED
}}
```

### Problem: Wrong game rules applied

**Check**:
1. `applyYourGameDart` has correct rules
2. Sector/ring parameters passed correctly
3. State type matches expected structure

**Debug**:
```typescript
export function applyYourGameDart(
  state: YourGameState,
  value: number,
  ring?: Ring,
  sector?: number | null
): number {
  console.log('[YOURGAME] Applying dart:', { value, ring, sector });
  
  // Apply logic...
  
  return pointsScored;
}
```

### Problem: Scoreboard doesn't update

**Check**:
1. State is updated (not mutated)
2. Component re-renders
3. Display props derive from updated state

**Example** (Cricket):
```tsx
<div>Closed: {Object.values(cricket.marks).filter(m => m === 3).length}</div>
<div>Points: {cricket.points}</div>
```

---

## Summary

The Nine Dart Nation calibration-to-scoring system provides:

✅ **Automatic dart detection** via DartDetector (pixel coordinates)
✅ **Precise homography mapping** (pixel → board coordinates)  
✅ **Accurate score calculation** (board coords → sector/ring/value)
✅ **21 complete game modes** with rule-aware scoring
✅ **Real-time score updates** with game-specific rules applied
✅ **Multi-player support** with per-player state management
✅ **Persistence** across browser sessions and online sync

The system is **production-ready** for:
- Casual play with automatic scoring
- Competitive matches with statistics tracking
- Tournament play with synchronized scoring
- Training/practice modes with performance metrics
