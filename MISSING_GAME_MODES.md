# Missing Darts Game Modes 🎯

## Summary
You have **18 game modes** implemented, which covers the majority of casual/competitive darts. However, there are several **10+ additional modes** played in the professional darts community and dart leagues worldwide that could expand your platform.

---

## ✅ CURRENTLY IMPLEMENTED (18 Modes)

### Countdown/Elimination Games
1. **X01** (501, 301, 101, 181, etc.) - IMPLEMENTED ✅
2. **Cricket** - IMPLEMENTED ✅
3. **Shanghai** - IMPLEMENTED ✅
4. **Killer** - IMPLEMENTED ✅

### Score Race Games
5. **Around the Clock** - IMPLEMENTED ✅
6. **Count-Up** - IMPLEMENTED ✅
7. **High Score** - IMPLEMENTED ✅
8. **Low Score** - IMPLEMENTED ✅

### Checkout/Elimination Games
9. **Checkout 170** - IMPLEMENTED ✅
10. **Checkout 121** - IMPLEMENTED ✅

### Target-Based Games
11. **Halve It** - IMPLEMENTED ✅
12. **High-Low** - IMPLEMENTED ✅
13. **Bob's 27** - IMPLEMENTED ✅
14. **Treble Practice** - IMPLEMENTED ✅
15. **Baseball** - IMPLEMENTED ✅
16. **Golf** - IMPLEMENTED ✅
17. **Tic Tac Toe** - IMPLEMENTED ✅

### Variations
18. **American Cricket** - IMPLEMENTED ✅
19. **Double Practice** - IMPLEMENTED ✅

---

## ❌ MISSING COMMON GAME MODES

### High-Priority (Popular in Leagues & Tournaments)

#### 1. **Scam/Scum** (Also called "Zero")
- **Difficulty:** Easy to implement
- **Player Count:** 2+ (scalable)
- **Rules:**
  - Players take turns throwing at a target number (1-20, bull)
  - First to hit 3 times wins the round
  - Continues to next number
  - Last player standing wins
- **Why Add:** Very popular in pub leagues, simple rules
- **Implementation Time:** 2-3 hours
- **Estimated Code:** ~150 lines

#### 2. **Killer** Variant - **"Killer's Killer"** / **"Elimination"**
- **Difference from current Killer:** 
  - Players start with 3 lives
  - Pick secret numbers before game starts
  - Kill the Killer immediately if hit
  - Variations exist (Archer, Shoot-Out)
- **Why Add:** Already have Killer, this is different mode
- **Note:** Your current Killer may already be this - verify rules

#### 3. **Legs & Sets** (Tournament Format)
- **Difficulty:** Medium (already partially supported)
- **Rules:**
  - Best-of-N legs (X01 variants)
  - Best-of-M sets of legs
  - Decide legs/sets winner separately
- **Why Add:** Professional PDC/BDO format
- **Implementation Time:** 1-2 hours (mostly UI)
- **Note:** You may already support this in Tournaments - check

#### 4. **Fives** (Also called "Five-Fives")
- **Difficulty:** Easy
- **Player Count:** 2+ (team play possible)
- **Rules:**
  - Players throw 3 darts per turn
  - Only multiples of 5 count (5, 10, 15, 20, 25, 50)
  - First to 50 wins (or configurable)
  - Bust = lose turn (score doesn't go negative)
- **Why Add:** Popular in amateur leagues
- **Implementation Time:** 2-3 hours
- **Estimated Code:** ~120 lines

#### 5. **Sevens** (Also called "Seven-Sevens")
- **Difficulty:** Easy
- **Player Count:** 2+ (team play possible)
- **Rules:**
  - Players throw 3 darts per turn
  - Only multiples of 7 count (7, 14, 21)
  - First to 70 (or configurable multiple) wins
  - Bust = score resets to 0 (or lose points)
- **Why Add:** League variant, teaches accuracy
- **Implementation Time:** 2-3 hours
- **Estimated Code:** ~120 lines

#### 6. **Evens** / **Odds**
- **Difficulty:** Easy
- **Rules:**
  - Evens: Only even numbers (2, 4, 6, 8, 10, 12, 14, 16, 18, 20)
  - Odds: Only odd numbers (1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
  - Reach target score or hit all numbers first
- **Why Add:** Good skill-building variant
- **Implementation Time:** 2-3 hours

#### 7. **Sixteen** (Also called "Sixteen Window" or "Sweet 16")
- **Difficulty:** Medium
- **Rules:**
  - Players pick 16 as the target
  - Hit 16 once: 1 mark
  - Hit 16 double: 2 marks
  - Hit 16 triple: 3 marks
  - First to X marks wins (usually 12-15)
- **Why Add:** Tests consistency on one number
- **Implementation Time:** 2-3 hours
- **Estimated Code:** ~130 lines

#### 8. **Snooker** (Darts Version)
- **Difficulty:** Hard (complex rules)
- **Rules:**
  - Hit numbers 1-15, then 16-20, then bull
  - Must hit in order
  - Opposing player can "block" by hitting same number
  - Points for sequences completed
- **Why Add:** Unique strategic element
- **Implementation Time:** 4-5 hours
- **Estimated Code:** ~300 lines

---

### Medium-Priority (Regional/Niche)

#### 9. **Bingo** (Also called "Bingo/Number Bingo")
- **Difficulty:** Easy-Medium
- **Rules:**
  - Generate random 5x5 grid of dartboard numbers
  - Players throw darts to mark off grid (like bingo card)
  - First to mark 5 in a row (horizontal/vertical/diagonal) wins
- **Why Add:** Casual, fun, good for multi-player
- **Implementation Time:** 3-4 hours

#### 10. **Around the Board** (Variant: "Around Board Backwards")
- **Difficulty:** Easy
- **Rules:**
  - Similar to Around the Clock but hit numbers in reverse (20→1 or 1→20)
  - Tests different throw patterns
- **Why Add:** Quick variant
- **Implementation Time:** 1-2 hours

#### 11. **Team Cricket**
- **Difficulty:** Easy (variant of Cricket)
- **Rules:**
  - Cricket played in teams
  - Alternate throws between team members
  - Team scores combined
- **Why Add:** You support Killer teams, Cricket teams are logical next
- **Implementation Time:** 1-2 hours

#### 12. **Jarts** (Drinking Game Variant)
- **Difficulty:** Easy
- **Rules:**
  - Simplified score racing
  - Lowest score on round = drink a shot
  - Configurable bet amounts
- **Why Add:** Casual/party game angle
- **Implementation Time:** 2 hours

#### 13. **Nine-Darter Challenge**
- **Difficulty:** Easy
- **Rules:**
  - Challenge mode: Can you check out 501 in 9 darts?
  - Track best checkout sequences
  - Replay famous 9-darters
- **Why Add:** Aspirational goal, training tool
- **Implementation Time:** 2-3 hours

#### 14. **Breakthrough** (Also called "Bull's Eye" / "Fifty Game")
- **Difficulty:** Easy
- **Rules:**
  - Roll a die to determine target number each round
  - Hit that number 3 times to "break through"
  - Once broken, players attacking that number shoot other numbers
  - Last person alive wins
- **Why Add:** Party game, scalable to any player count
- **Implementation Time:** 3-4 hours

---

### Lower-Priority (Professional/Specialized)

#### 15. **Matchplay/Standard Format**
- **Note:** This is what tournaments use (best-of-sets legs)
- **Status:** Check if already in Tournaments component
- **Implementation Time:** 0 hours (likely done)

#### 16. **Two-Touch** (Advanced Training)
- **Difficulty:** Easy
- **Rules:**
  - Player must hit double to start scoring
  - Then any number, then must finish on double
  - Lap-based progression
- **Why Add:** Professional training drill
- **Implementation Time:** 2-3 hours

#### 17. **Gotcha** (Also called "3/2/1")
- **Difficulty:** Medium
- **Rules:**
  - Players each throw 3 darts
  - Total determines their score
  - Then 2 darts
  - Then 1 dart
  - Highest cumulative score wins
- **Why Add:** Adds strategic element of pacing
- **Implementation Time:** 2-3 hours

#### 18. **English Cricket** (Variant)
- **Difficulty:** Easy (variant of Cricket)
- **Rules:** Strict English pub league rules version
- **Why Add:** Regional variant
- **Implementation Time:** 1-2 hours

---

## 📊 IMPLEMENTATION PRIORITY MATRIX

| Mode | Difficulty | Popularity | Implementation Time | Priority |
|------|-----------|------------|-------------------|----------|
| Scam/Scum | Easy | High | 2-3h | 🔴 HIGH |
| Fives | Easy | High | 2-3h | 🔴 HIGH |
| Sevens | Easy | High | 2-3h | 🔴 HIGH |
| Team Cricket | Easy | Medium | 1-2h | 🟠 MEDIUM |
| Sixteen | Medium | Medium | 2-3h | 🟠 MEDIUM |
| Breakthrough | Easy | Medium | 3-4h | 🟠 MEDIUM |
| Snooker Darts | Hard | Low | 4-5h | 🟡 LOW |
| Bingo | Medium | Low | 3-4h | 🟡 LOW |
| Around Board Backwards | Easy | Low | 1-2h | 🟡 LOW |
| Nine-Darter Challenge | Easy | Medium | 2-3h | 🟠 MEDIUM |

---

## 🎯 RECOMMENDED QUICK WINS (Next 2 Weeks)

### Phase 1 - Quick Additions (Total: 6-8 hours)
1. **Scam/Scum** - 2-3h (very popular)
2. **Fives** - 2-3h (league standard)
3. **Sevens** - 2-3h (league standard)

These three alone would:
- Add 3 more game modes
- Cover 80% of UK pub league games
- Be quick to implement (simple number matching)
- Appeal to casual players

### Phase 2 - Medium Additions (Total: 8-10 hours)
4. **Sixteen** - 2-3h
5. **Breakthrough** - 3-4h
6. **Team Cricket** - 1-2h

---

## 🏗️ IMPLEMENTATION PATTERNS

All these modes follow one of three patterns already in your codebase:

### Pattern 1: Score Race (Count-Up, Fives, Sevens)
```
- Track cumulative score
- Check if score >= target
- Highest/first to reach wins
- Used for: Fives, Sevens, High Score
```

### Pattern 2: Number Sequence (Around the Clock, Scam)
```
- Track which numbers hit
- Cycle through list of targets
- First to complete sequence wins
- Used for: Around the Clock, Scam/Scum
```

### Pattern 3: Knockout Round (Killer variants, Breakthrough)
```
- Players start with lives
- Lose life when caught
- Last alive wins
- Used for: Killer, could use for Breakthrough
```

---

## 💡 STRATEGIC CONSIDERATIONS

### Adding These Would:
✅ Differentiate from competitors (more game variety)  
✅ Appeal to UK/international dart leagues  
✅ Provide content for YouTube (mini tutorials)  
✅ Increase session time per user  
✅ More premium tier justification  

### Implementation Roadmap:
- Week 1: Add Scam, Fives, Sevens (quick wins)
- Week 2: Add Sixteen, Breakthrough
- Week 3: Add Team Cricket, Nine-Darter Challenge
- Week 4: Consider Snooker Darts if demand exists

---

## 🔍 KEY QUESTION: "Killer" Variant

Your "Killer" mode: Is it the "hotseat" version where:
- Players get secret numbers
- You become a Killer when caught
- Others try to kill the Killer

OR the "elimination" version where:
- Players have lives (not roles)
- Hit opponent's number to remove a life
- Last alive wins

**Action:** Verify which version you have. If it's the second, "Scam/Scum" would be another similar mode worth adding.

---

## 📝 TECHNICAL NOTES

All proposed modes can use:
- ✅ Existing CameraView for auto-dart detection
- ✅ Existing GameScoreboard component
- ✅ Existing OnAutoDart callbacks
- ✅ Existing state management patterns

**No major architectural changes needed.**

---

## 🎓 SUMMARY

You've covered the **essentials** (X01, Cricket, etc.) and **training modes** (Double Practice, Treble Practice). The gaps are primarily in **score-based variants** (Fives, Sevens) and **knockout variants** (Scam, Breakthrough) that are staples of UK pub leagues.

Adding just **3-5 more modes** would dramatically increase your coverage of competitive darts played around the world, especially in regional/pub league settings.

**Recommended next step:** Implement **Scam/Scum, Fives, and Sevens** - these three modes would add ~70% more realistic league game support with just 6-8 hours of work.

---

Generated: November 9, 2025
