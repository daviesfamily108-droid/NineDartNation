/**
 * Universal Game Scoreboard Component
 * Displays game-specific stats based on the game mode and current game state
 * Works for Online, Offline, and Tournament modes
 */

import React from 'react';

export type GameMode = 'X01' | 'Cricket' | 'Shanghai' | 'Killer' | 'High-Low' | 'Halve It' | 
                       'Around the Clock' | 'Double Practice' | 'Treble Practice' | 
                       'Count-Up' | 'High Score' | 'Low Score' | 'Checkout 170' | 'Checkout 121' |
                       'American Cricket' | 'Baseball' | 'Golf' | 'Tic Tac Toe' | "Bob's 27" |
                       'Scam' | 'Fives' | 'Sevens';

export interface PlayerStats {
  name: string;
  isCurrentTurn: boolean;
  legsWon?: number;
  score?: number;
  lastScore?: number;
  checkoutRate?: number; // 0-100
  bestLeg?: number | string;
  // Cricket-specific
  closed?: Record<number, number>; // { 20: 3, 19: 2, etc }
  points?: number;
  // Shanghai-specific
  round?: number;
  target?: number;
  // Killer-specific
  number?: number;
  lives?: number;
  eliminated?: boolean;
  // Match statistics
  matchAvg?: number; // Current match 3-dart average
  allTimeAvg?: number; // Player's all-time 3-dart average
  // Other generics
  [key: string]: any;
}

interface GameScoreboardProps {
  gameMode: GameMode;
  players: PlayerStats[];
  matchScore?: string; // e.g., "3-1"
  gameRules?: any; // Additional rules/config for the game
}

export default function GameScoreboard({ gameMode, players, matchScore, gameRules }: GameScoreboardProps) {
  if (!players || players.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      {players.map((player, idx) => (
        <div
          key={idx}
          className={`rounded-lg border p-3 ${
            player.isCurrentTurn
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-slate-500/40 bg-slate-500/10'
          }`}
        >
          <div className={`text-xs font-semibold mb-2 uppercase tracking-wide ${
            player.isCurrentTurn ? 'text-emerald-300' : 'text-slate-300'
          }`}>
            {player.name}
          </div>

          <div className="space-y-1 text-xs">
            {/* X01 specific */}
            {gameMode === 'X01' && (
              <>
                <ScoreRow label="Legs Won" value={`● ${player.legsWon || 0}`} highlight />
                <ScoreRow label="Score" value={player.score || 0} mono bold />
                <ScoreRow label="Last Score" value={player.lastScore || '0'} mono />
                <ScoreRow label="C/Out Rate" value={`${player.checkoutRate || 0}%`} mono />
                <ScoreRow label="Best Leg" value={player.bestLeg || '—'} mono />
                {/* AVG +/- feature */}
                {player.matchAvg !== undefined && player.allTimeAvg !== undefined && (
                  <>
                    <div className="border-t border-white/20 pt-1 mt-1">
                      <ScoreRow label="Match Avg" value={player.matchAvg.toFixed(2)} mono bold highlight={player.matchAvg > 0} />
                      <AvgDifferenceRow matchAvg={player.matchAvg} allTimeAvg={player.allTimeAvg} />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Cricket & American Cricket specific */}
            {(gameMode === 'Cricket' || gameMode === 'American Cricket') && (
              <>
                <ScoreRow label="Closed" value={formatCricketClosed(player.closed)} mono />
                <ScoreRow label="Points" value={player.points || 0} mono bold />
                <ScoreRow label="Status" value={getCricketStatus(player)} highlight={player.isCurrentTurn} />
              </>
            )}

            {/* Shanghai & Halve It - Round-based */}
            {(gameMode === 'Shanghai' || gameMode === 'Halve It') && (
              <>
                <ScoreRow label={gameMode === 'Shanghai' ? 'Round' : 'Stage'} value={player.round || 1} mono />
                <ScoreRow label="Target" value={player.target || '—'} mono />
                <ScoreRow label="Score" value={player.score || 0} mono bold />
              </>
            )}

            {/* Killer specific */}
            {gameMode === 'Killer' && (
              <>
                <ScoreRow label="Target #" value={player.number || '—'} mono bold />
                <ScoreRow label="Lives" value={player.lives || 0} mono bold />
                {player.eliminated && (
                  <ScoreRow label="Status" value="ELIMINATED" highlight={false} />
                )}
              </>
            )}

            {/* High-Low specific */}
            {gameMode === 'High-Low' && (
              <>
                <ScoreRow label="Round" value={player.round || 1} mono />
                <ScoreRow label="Target" value={player.target || 'High'} mono />
                <ScoreRow label="Score" value={player.score || 0} mono bold />
              </>
            )}

            {/* Practice games */}
            {(gameMode === 'Double Practice' || gameMode === 'Treble Practice' || gameMode === 'Around the Clock') && (
              <>
                <ScoreRow label="Target" value={player.target || '—'} mono bold />
                <ScoreRow label="Hits" value={player.hits || 0} mono bold />
                {player.totalNeeded && (
                  <ScoreRow label="Progress" value={`${player.hits || 0} / ${player.totalNeeded}`} mono />
                )}
              </>
            )}

            {/* Count-Up, High Score, Low Score */}
            {(gameMode === 'Count-Up' || gameMode === 'High Score' || gameMode === 'Low Score') && (
              <>
                <ScoreRow label="Round" value={player.round || 1} mono />
                <ScoreRow label="Score" value={player.score || 0} mono bold />
                {gameMode === 'High Score' && (
                  <ScoreRow label="Best" value={player.bestScore || 0} mono />
                )}
              </>
            )}

            {/* Checkout challenges */}
            {(gameMode === 'Checkout 170' || gameMode === 'Checkout 121') && (
              <>
                <ScoreRow label="Remaining" value={player.remaining || 0} mono bold />
                <ScoreRow label="Attempts" value={player.attempts || 0} mono />
                <ScoreRow label="Successes" value={player.successes || 0} mono />
              </>
            )}

            {/* Bob's 27 */}
            {gameMode === "Bob's 27" && (
              <>
                <ScoreRow label="Target" value={`D${player.target || 1}`} mono bold />
                <ScoreRow label="Score" value={player.score || 0} mono bold />
              </>
            )}

            {/* Baseball & Golf */}
            {gameMode === 'Baseball' && (
              <>
                <ScoreRow label="Inning" value={player.inning || 1} mono />
                <ScoreRow label="Score" value={player.score || 0} mono bold />
              </>
            )}

            {gameMode === 'Golf' && (
              <>
                <ScoreRow label="Hole" value={player.hole || 1} mono />
                <ScoreRow label="Strokes" value={player.strokes || 0} mono bold />
              </>
            )}

            {/* Tic Tac Toe */}
            {gameMode === 'Tic Tac Toe' && (
              <>
                <ScoreRow label="Turn" value={player.turn || 1} mono />
                {player.winner && (
                  <ScoreRow label="Result" value="WINNER!" highlight />
                )}
              </>
            )}

            {/* Match score display for competitive games */}
            {matchScore && (gameMode === 'X01' || gameMode === 'Cricket' || gameMode === 'American Cricket') && idx === 1 && (
              <div className="border-t border-white/10 pt-1 mt-1">
                <ScoreRow label="Match" value={matchScore} mono bold highlight />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper component for consistent score row display
function ScoreRow({ 
  label, 
  value, 
  mono = false, 
  bold = false, 
  highlight = false 
}: { 
  label: string; 
  value: string | number; 
  mono?: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="opacity-70">{label}:</span>
      <span className={`${mono ? 'font-mono' : ''} ${bold ? 'font-semibold' : ''} ${
        highlight ? 'text-emerald-300' : ''
      }`}>
        {value}
      </span>
    </div>
  );
}

// AVG +/- component showing difference from all-time average
function AvgDifferenceRow({ matchAvg, allTimeAvg }: { matchAvg: number; allTimeAvg: number }) {
  const diff = matchAvg - allTimeAvg;
  const isPositive = diff > 0;
  const isNeutral = Math.abs(diff) < 0.01;
  
  let diffText = '';
  let diffColor = 'text-slate-300';
  
  if (isNeutral) {
    diffText = '= All-time';
    diffColor = 'text-slate-300';
  } else if (isPositive) {
    diffText = `+${diff.toFixed(2)} vs avg`;
    diffColor = 'text-emerald-400';
  } else {
    diffText = `${diff.toFixed(2)} vs avg`;
    diffColor = 'text-orange-400';
  }
  
  return (
    <div className="flex justify-between">
      <span className="opacity-70">AVG vs Avg:</span>
      <span className={`font-mono font-semibold ${diffColor}`}>
        {diffText}
      </span>
    </div>
  );
}

// Cricket helpers
function formatCricketClosed(closed?: Record<number, number>): string {
  if (!closed || Object.keys(closed).length === 0) return '—';
  const closedNumbers = Object.entries(closed)
    .filter(([_, count]) => count === 3)
    .map(([num]) => num === '25' ? 'B' : num)
    .join(',');
  return closedNumbers || '—';
}

function getCricketStatus(player: PlayerStats): string {
  if (!player.closed) return 'Starting';
  const closedCount = Object.values(player.closed).filter(c => c === 3).length;
  if (closedCount === 0) return 'No marks';
  if (closedCount < 7) return `${closedCount}/7`;
  return 'Closing in';
}
