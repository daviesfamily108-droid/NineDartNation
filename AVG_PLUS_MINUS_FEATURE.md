# AVG +/- Feature Implementation

## Overview
The AVG +/- feature displays live match statistics during gameplay, showing players how their current match average compares to their all-time average.

## What It Shows

### Match Average
- **Label**: "Match Avg"
- **Value**: Current 3-dart average calculated from finished legs in the current match
- **Calculation**: `(Total Points Scored / Total Darts Thrown) × 3`
- **Display**: Shows when at least one leg has been completed

### AVG vs All-Time
- **Label**: "AVG vs Avg"
- **Format**: Shows the difference between match average and all-time average
- **Color Coding**:
  - 🟢 **Green** (+): Player is performing ABOVE their average
  - 🟠 **Orange** (−): Player is performing BELOW their average
  - ⚪ **Gray** (=): Virtually same as all-time average

### Examples
- Player's All-Time Avg: 25.50
- Current Match Avg: 27.25
- Display: `+1.75 vs avg` (in green) - Playing well above average!

## Where It Appears

### X01 Games (Online & Offline)
- Shown in the Game Scoreboard during matches
- Appears as separate section below standard X01 stats
- Visible on both player cards during play

### Game Flow
1. First leg starts - AVG stats not shown yet
2. First leg completes - AVG stats appear
3. As more legs complete - Average updates in real-time
4. Match continues - Shows current running average vs all-time

## Technical Implementation

### Files Modified
1. **GameScoreboard.tsx**
   - Added `matchAvg` and `allTimeAvg` properties to PlayerStats interface
   - Added `AvgDifferenceRow` component for displaying the difference
   - Integrated AVG +/- display in X01 game section

2. **useGameStats.ts**
   - Imported `getAllTimeAvg` from profileStats store
   - Added match average calculation for offline games (useOfflineGameStats)
   - Added match average calculation for online games (useOnlineGameStats)
   - Calculates running 3-dart average from completed legs only

### Key Features
- ✅ Real-time calculation from finished legs only
- ✅ Accurate 3-dart average formula
- ✅ Color-coded performance feedback
- ✅ Works for both online and offline play
- ✅ Shows all-time average for comparison
- ✅ Motivational feature - shows improvement opportunities

## Player Benefits

1. **Live Feedback**: See how you're performing in real-time vs your historical average
2. **Performance Motivation**: Watch +/- change as legs complete
3. **Target Setting**: Know if you're on pace with your typical performance
4. **Improvement Tracking**: Monitor if current match is better/worse than usual
5. **Competitive Advantage**: Understand performance context during matches

## Future Enhancements
- [ ] Add AVG +/- for other game modes (Cricket, Shanghai, etc.)
- [ ] Historical match comparison (vs yesterday's avg, vs last week)
- [ ] Streak tracking (consecutive legs above/below average)
- [ ] Team average comparison in team matches
- [ ] Visual graph showing average progression through match
