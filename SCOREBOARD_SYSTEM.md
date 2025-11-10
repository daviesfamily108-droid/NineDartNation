# Game Scoreboard System

A comprehensive, rule-aware scoreboard system for Nine Dart Nation that displays game-specific statistics for all game modes (X01, Cricket, Shanghai, Killer, etc.) across Online, Offline, and Tournament contexts.

## Architecture

### Components

1. **GameScoreboard.tsx** - Main scoreboard component
   - Accepts `gameMode`, `players`, and optional `matchScore`
   - Automatically renders game-specific stats based on the game mode
   - Supports all 18+ game modes with their specific rules and metrics
   - Responsive grid layout (1 column mobile, 2 columns desktop)

2. **useGameStats.ts** - State conversion hooks
   - `useOfflineGameStats()` - Converts OfflinePlay component state to scoreboard format
   - `useOnlineGameStats()` - Converts OnlinePlay component state to scoreboard format
   - Memoized for performance optimization

### Supported Game Modes

#### X01 Variants
- **Metrics**: Legs Won, Score, Last Score, C/Out Rate (Checkout %), Best Leg
- **Rules**: Shows double-out rate, progress toward finishing

#### Cricket & American Cricket
- **Metrics**: Closed numbers, Points, Status (e.g., "4/7 closed")
- **Rules**: Tracks marks (0-3) per number, shows scoring progress

#### Round-based Games
- **Shanghai, Halve It**: Round/Stage, Target, Current Score
- **High-Low**: Round, Target (High/Low), Score

#### Skill Challenges
- **Double/Treble Practice, Around the Clock**: Target, Hits, Progress
- **Checkout 170/121**: Remaining, Attempts, Successes

#### Competitive Games
- **Killer**: Target #, Lives Remaining, Elimination status
- **Baseball, Golf, Tic Tac Toe**: Mode-specific metrics

#### Other Modes
- **Count-Up, High Score, Low Score**: Round-based progression
- **Bob's 27**: Target Double, Score

## Integration Guide

### For OfflinePlay

```tsx
import GameScoreboard from './scoreboards/GameScoreboard'
import { useOfflineGameStats } from './scoreboards/useGameStats'

// In your component render:
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
    shanghai,
    killerPlayers, killerStates, killerAssigned, killerTurnIdx
  )}
  matchScore={`${playerLegs}-${aiLegs}`}
/>
```

### For OnlinePlay

```tsx
import GameScoreboard from './scoreboards/GameScoreboard'
import { useOnlineGameStats } from './scoreboards/useGameStats'

// In your component render:
<GameScoreboard
  gameMode={selectedMode as GameMode}
  players={useOnlineGameStats(selectedMode as GameMode, matchState, participants)}
  matchScore={`${matchState?.players[0]?.legsWon || 0}-${matchState?.players[1]?.legsWon || 0}`}
/>
```

### For Tournaments

Tournament components should follow the same pattern as OnlinePlay, using `useOnlineGameStats` to convert their state.

## Game Mode Implementation Details

### X01 (501, 301, 121, etc.)
```tsx
{
  name: 'Player Name',
  isCurrentTurn: boolean,
  legsWon: number,
  score: number,
  lastScore: number,
  checkoutRate: 0-100, // (doublesHit / doublesAttempted) * 100
  bestLeg: string, // "X darts" or "—"
}
```

### Cricket
```tsx
{
  name: 'Player Name',
  isCurrentTurn: boolean,
  closed: { 20: 3, 19: 2, 18: 0, ... }, // 0-3 marks per number
  points: number,
}
```

### Killer
```tsx
{
  name: 'Player Name',
  isCurrentTurn: boolean,
  number: number | undefined, // Assigned target number
  lives: number, // Remaining lives
  eliminated: boolean,
}
```

### Shanghai
```tsx
{
  name: 'Player Name',
  isCurrentTurn: boolean,
  round: number, // 1-7
  target: number, // The current round target (1-20, then bull)
  score: number,
}
```

## Styling

All scoreboards use consistent styling:
- **Current Turn**: Emerald border/background (`border-emerald-500/40 bg-emerald-500/10`)
- **Waiting**: Slate border/background (`border-slate-500/40 bg-slate-500/10`)
- **Key Numbers**: Monospace font, bold weight for emphasis
- **Status Indicators**: Text color changes for active/inactive states

## Performance Considerations

- `useOfflineGameStats()` and `useOnlineGameStats()` are memoized with dependency arrays
- GameScoreboard component uses React.memo for efficient re-rendering
- Each game mode only renders relevant stats (no unnecessary DOM nodes)

## Future Enhancements

- [ ] Real-time animation for score changes
- [ ] Streak indicators (hot/cold hands)
- [ ] Historical stats comparison
- [ ] Custom theme support per game mode
- [ ] Export stats to CSV/PDF
- [ ] Live statistics overlay for streaming

## Troubleshooting

### Scoreboard not displaying
1. Verify `players` array is not empty
2. Check that `gameMode` matches one of the supported modes
3. Ensure state conversion hook is passing all required props

### Incorrect stats displayed
1. Verify state variables are being updated correctly
2. Check that the right game state is passed to the conversion hook
3. Look for naming mismatches between your state and hook parameters

### Performance issues
1. Check if dependency array in hooks includes too many items
2. Consider memoizing parent component with React.memo
3. Profile using React DevTools Profiler
