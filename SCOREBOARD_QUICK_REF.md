# Scoreboard System - Quick Reference

## Quick Start

### Use in OfflinePlay
```tsx
import GameScoreboard from './scoreboards/GameScoreboard'
import { useOfflineGameStats } from './scoreboards/useGameStats'

// In your render:
<GameScoreboard
  gameMode={selectedMode as any}
  players={useOfflineGameStats(
    selectedMode as any,
    playerScore, aiScore,
    playerLegs, aiLegs,
    playerLastDart, aiLastDart,
    playerVisitSum, aiVisitSum,
    playerDoublesHit, playerDoublesAtt,
    aiDoublesHit, aiDoublesAtt,
    legStats,
    isPlayerTurn,
    ai,
    x01Score,
    cricket,
    shanghai
  )}
  matchScore={`${playerLegs}-${aiLegs}`}
/>
```

### Use in OnlinePlay
```tsx
import GameScoreboard from './scoreboards/GameScoreboard'
import { useOnlineGameStats } from './scoreboards/useGameStats'

// In your render:
<GameScoreboard
  gameMode={currentGame as any}
  players={useOnlineGameStats(currentGame as any, match, participants)}
  matchScore={matchScore}
/>
```

## Supported Game Modes

| Mode | Status | Displays |
|------|--------|----------|
| X01 | ✅ | Legs, Score, Last, C/Out %, Best Leg |
| Cricket | ✅ | Closed #s, Points, Status |
| Shanghai | ✅ | Round, Target, Score |
| Killer | ✅ | Target #, Lives, Status |
| High-Low | ✅ | Round, Target, Score |
| Halve It | ✅ | Stage, Target, Score |
| Double Practice | ✅ | Target, Hits, Progress |
| Around the Clock | ✅ | Target, Hits, Progress |
| Treble Practice | ✅ | Target, Hits, Progress |
| Baseball | ✅ | Inning, Score |
| Golf | ✅ | Hole, Strokes |
| Tic Tac Toe | ✅ | Turn, Winner |
| American Cricket | ✅ | Closed #s, Points, Status |
| Checkout 170/121 | ✅ | Remaining, Attempts, Successes |
| Bob's 27 | ✅ | Target Double, Score |
| Count-Up | ✅ | Round, Score |
| High Score | ✅ | Round, Score, Best |
| Low Score | ✅ | Round, Score |

## Component Props

```tsx
interface GameScoreboardProps {
  gameMode: GameMode;        // Required: 'X01' | 'Cricket' | 'Shanghai' | etc.
  players: PlayerStats[];    // Required: Array of player stat objects
  matchScore?: string;       // Optional: e.g., "3-1"
  gameRules?: any;          // Optional: Additional game configuration
}

interface PlayerStats {
  name: string;
  isCurrentTurn: boolean;
  legsWon?: number;
  score?: number;
  lastScore?: number;
  checkoutRate?: number;    // 0-100
  bestLeg?: number | string;
  // ... game-specific fields
}
```

## Styling Classes

All scoreboards use:
- **Current Turn**: `border-emerald-500/40 bg-emerald-500/10` + `text-emerald-300`
- **Waiting**: `border-slate-500/40 bg-slate-500/10` + `text-slate-300`
- **Numbers**: Monospace font, bold weight
- **Layout**: `grid-cols-1 sm:grid-cols-2` (responsive)

## Hook Parameters (OfflinePlay)

```tsx
useOfflineGameStats(
  gameMode: GameMode,
  playerScore?: number,
  aiScore?: number,
  playerLegs?: number,
  aiLegs?: number,
  playerLastDart?: number,
  aiLastDart?: number,
  playerVisitSum?: number,
  aiVisitSum?: number,
  playerDoublesHit?: number,
  playerDoublesAtt?: number,
  aiDoublesHit?: number,
  aiDoublesAtt?: number,
  legStats?: Array<any>,
  isPlayerTurn?: boolean,
  ai?: string,
  x01Score?: number,
  cricket?: any,
  shanghai?: any,
  killerPlayers?: Array<any>,
  killerStates?: Record<string, any>,
  killerAssigned?: Record<string, number>,
  killerTurnIdx?: number
): PlayerStats[]
```

## Hook Parameters (OnlinePlay)

```tsx
useOnlineGameStats(
  gameMode: GameMode,
  matchState?: any,        // From useMatch() store
  participants?: string[]
): PlayerStats[]
```

## Common Patterns

### Check Current Turn Indicator
```tsx
player.isCurrentTurn  // boolean - true if this player's turn
```

### Format Checkout Rate
```tsx
`${player.checkoutRate || 0}%`  // Already percentage number
```

### Display Best Leg
```tsx
player.bestLeg || '—'  // Either "X darts" or "—"
```

### Match Score Display
```tsx
matchScore={`${players[0]?.legsWon || 0}-${players[1]?.legsWon || 0}`}
```

## Memoization & Performance

Both hooks are memoized with comprehensive dependency arrays. This ensures:
- ✅ No unnecessary re-renders
- ✅ Stable references across renders
- ✅ Efficient stat calculations

Use the hooks in components that render frequently without performance issues.

## Responsive Behavior

```
Mobile (<768px):   1 column  (stack vertically)
Desktop (≥768px):  2 columns (side by side)
```

## Color System

- 🟢 **Emerald** (Current Turn): Active player highlighting
- 🔵 **Slate** (Waiting): Inactive player styling
- ⚪ **White** (Text): Primary information
- ⚫ **Transparent Dark** (Background): Card backgrounds with opacity

## Adding New Game Mode Support

1. **Add to GameScoreboard.tsx:**
   ```tsx
   {gameMode === 'NewGame' && (
     <>
       <ScoreRow label="Stat 1" value={player.stat1} />
       <ScoreRow label="Stat 2" value={player.stat2} mono bold />
     </>
   )}
   ```

2. **Add to useOfflineGameStats.ts:**
   ```tsx
   if (gameMode === 'NewGame') {
     players.push({
       name: 'Player Name',
       isCurrentTurn: boolean,
       stat1: value1,
       stat2: value2
     })
   }
   ```

3. **Add to useOnlineGameStats.ts:**
   ```tsx
   if (gameMode === 'NewGame') {
     players.push({
       name: player.name,
       isCurrentTurn: idx === currentIdx,
       stat1: player.newGameState?.stat1
     })
   }
   ```

## Debugging Tips

1. **Check player array population:**
   ```tsx
   console.log('Players:', players)  // Should have 2+ items
   ```

2. **Verify game mode:**
   ```tsx
   console.log('Game mode:', gameMode)  // Should match supported mode
   ```

3. **Inspect memoization:**
   ```tsx
   React DevTools → Profiler → Check highlight percentage
   ```

4. **Monitor re-renders:**
   ```tsx
   Add console.log in component render to check frequency
   ```

## Files

- **Main:** `src/components/scoreboards/GameScoreboard.tsx`
- **Hooks:** `src/components/scoreboards/useGameStats.ts`
- **System Docs:** `SCOREBOARD_SYSTEM.md`
- **Integration Docs:** `SCOREBOARD_INTEGRATION.md`
- **This File:** Quick reference guide

---

**Current Status:** OnlinePlay & OfflinePlay ✅ Complete
**Tournament Mode:** Not yet implemented
