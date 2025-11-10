/**
 * Hook to convert OfflinePlay game state to GameScoreboard format
 */

import { useMemo } from 'react';
import type { PlayerStats } from './GameScoreboard';
import type { GameMode } from './GameScoreboard';
import { getAllTimeAvg } from '../../store/profileStats';

export function useOfflineGameStats(
  gameMode: GameMode,
  // X01 state
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
  // Cricket state
  cricket?: any,
  // Shanghai state
  shanghai?: any,
  // Killer state
  killerPlayers?: Array<any>,
  killerStates?: Record<string, any>,
  killerAssigned?: Record<string, number>,
  killerTurnIdx?: number
): PlayerStats[] {
  return useMemo(() => {
    const players: PlayerStats[] = [];

    if (gameMode === 'X01') {
      // Calculate player match average
      let playerMatchAvg = 0;
      let playerDarts = 0;
      let playerScored = 0;
      if (legStats && legStats.length > 0) {
        for (const leg of legStats) {
          if (leg.dartsThrown && leg.totalScored) {
            playerDarts += leg.dartsThrown;
            playerScored += leg.totalScored;
          }
        }
        if (playerDarts > 0) {
          playerMatchAvg = (playerScored / playerDarts) * 3;
        }
      }

      // Player card
      players.push({
        name: 'You',
        isCurrentTurn: !!isPlayerTurn,
        legsWon: playerLegs || 0,
        score: playerScore || 0,
        lastScore: playerVisitSum || playerLastDart || 0,
        checkoutRate: playerDoublesAtt && playerDoublesAtt > 0 
          ? Math.round((playerDoublesHit || 0) / playerDoublesAtt * 100)
          : 0,
        bestLeg: legStats && legStats.length > 0 
          ? `${Math.min(...legStats.map(l => l.doubleDarts + (l.checkoutDarts || 0))) || 0} darts`
          : '—',
        matchAvg: playerMatchAvg,
        allTimeAvg: getAllTimeAvg('You') || 0
      });

      // AI card (if playing against AI)
      if (ai && ai !== 'None') {
        players.push({
          name: `${ai} AI`,
          isCurrentTurn: !isPlayerTurn,
          legsWon: aiLegs || 0,
          score: aiScore || 0,
          lastScore: aiVisitSum || aiLastDart || 0,
          checkoutRate: aiDoublesAtt && aiDoublesAtt > 0 
            ? Math.round((aiDoublesHit || 0) / aiDoublesAtt * 100)
            : 0,
          bestLeg: '—'
        });
      }
    }

    if (gameMode === 'Cricket') {
      players.push({
        name: 'You',
        isCurrentTurn: !!isPlayerTurn,
        closed: cricket?.marks || {},
        points: cricket?.points || 0
      });

      if (ai && ai !== 'None') {
        players.push({
          name: `${ai} AI`,
          isCurrentTurn: !isPlayerTurn,
          closed: {},
          points: 0
        });
      }
    }

    if (gameMode === 'Shanghai') {
      players.push({
        name: 'You',
        isCurrentTurn: !!isPlayerTurn,
        round: shanghai?.round || 1,
        target: shanghai?.target || 1,
        score: shanghai?.score || 0
      });

      if (ai && ai !== 'None') {
        players.push({
          name: `${ai} AI`,
          isCurrentTurn: !isPlayerTurn,
          round: shanghai?.round || 1,
          target: shanghai?.target || 1,
          score: 0
        });
      }
    }

    if (gameMode === 'Killer' && killerPlayers && killerPlayers.length > 0) {
      killerPlayers.forEach((p, idx) => {
        const state = killerStates?.[p.id];
        players.push({
          name: p.name,
          isCurrentTurn: idx === killerTurnIdx,
          number: killerAssigned?.[p.id],
          lives: state?.lives || 0,
          eliminated: state?.eliminated || false
        });
      });
    }

    return players;
  }, [
    gameMode,
    playerScore, aiScore,
    playerLegs, aiLegs,
    playerLastDart, aiLastDart,
    playerVisitSum, aiVisitSum,
    playerDoublesHit, playerDoublesAtt,
    aiDoublesHit, aiDoublesAtt,
    legStats,
    isPlayerTurn, ai,
    cricket,
    shanghai,
    killerPlayers, killerStates, killerAssigned, killerTurnIdx
  ]);
}

export function useOnlineGameStats(
  gameMode: GameMode,
  matchState?: any, // From useMatch() store
  participants?: string[]
): PlayerStats[] {
  return useMemo(() => {
    const players: PlayerStats[] = [];

    if (!matchState || !matchState.players || matchState.players.length === 0) {
      return players;
    }

    matchState.players.forEach((player: any, idx: number) => {
      const isCurrentTurn = idx === matchState.currentPlayerIdx;
      
      if (gameMode === 'X01') {
        // Calculate match average for this player
        let matchAvg = 0;
        let totalDarts = 0;
        let totalScored = 0;

        if (player.legs && player.legs.length > 0) {
          for (const leg of player.legs) {
            if (leg.finished) {
              const legDarts = leg.dartsThrown || 0;
              const legScored = Math.max(0, leg.totalScoreStart - leg.totalScoreRemaining) || 0;
              totalDarts += legDarts;
              totalScored += legScored;
            }
          }
        }

        if (totalDarts > 0) {
          matchAvg = (totalScored / totalDarts) * 3;
        }

        players.push({
          name: player.name || `Player ${idx + 1}`,
          isCurrentTurn,
          legsWon: player.legsWon || 0,
          score: player.score || 0,
          lastScore: player.lastVisitScore || 0,
          checkoutRate: player.doublesAttempted > 0 
            ? Math.round((player.doublesHit / player.doublesAttempted) * 100)
            : 0,
          bestLeg: player.bestLegDarts ? `${player.bestLegDarts} darts` : '—',
          matchAvg: matchAvg,
          allTimeAvg: player.name ? getAllTimeAvg(player.name) : 0
        });
      }

      if (gameMode === 'Cricket') {
        players.push({
          name: player.name || `Player ${idx + 1}`,
          isCurrentTurn,
          closed: player.cricket?.marks || {},
          points: player.cricket?.points || 0
        });
      }

      if (gameMode === 'Killer') {
        players.push({
          name: player.name || `Player ${idx + 1}`,
          isCurrentTurn,
          number: player.killerNumber || null,
          lives: player.killerLives || 3,
          eliminated: player.killerEliminated || false
        });
      }
    });

    return players;
  }, [gameMode, matchState, participants]);
}
