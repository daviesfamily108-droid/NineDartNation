import { useMatch } from '../store/match'
import { formatAvg } from '../utils/stats'
// Icons not used directly in Scoreboard; MatchControls has its own icons
import MatchControls from './MatchControls'
import { addMatchToAllTime } from '../store/profileStats'
import { usePendingVisit } from '../store/pendingVisit'
import type { UnifiedMatchActions } from '../logic/matchActions'

export default function Scoreboard({ matchActions }: { matchActions?: UnifiedMatchActions } = {}) {
  const { players, currentPlayerIdx, addVisit, undoVisit, endLeg, nextPlayer, endGame, inProgress, startingScore, bestLegThisMatch } = useMatch()
  const pendingEntries = usePendingVisit(s => s.entries)

  const current = players[currentPlayerIdx]

  function handleEndGame() {
    try {
      const summary = {
        ts: Date.now(),
        players: players.map(p => {
          const totals = p.legs.reduce((acc, L) => {
            acc.points += (L.totalScoreStart - L.totalScoreRemaining)
            const legDarts = (L.visits || []).reduce((a, v) => a + (v.darts || 0) - (v.preOpenDarts || 0), 0)
            acc.darts += legDarts
            return acc
          }, { points: 0, darts: 0 })
          const dartsThrown = totals.darts
          const avg = dartsThrown > 0 ? ((totals.points / dartsThrown) * 3) : 0
          return {
            id: p.id,
            name: p.name,
            legsWon: p.legsWon,
            dartsThrown,
            avg: Math.round(avg * 100) / 100,
          }
        }),
        winner: players.reduce((best, p) => p.legsWon > (best?.legsWon || 0) ? p : best, players[0])?.name,
      }
      try { localStorage.setItem('ndn_last_match', JSON.stringify(summary)) } catch {}
    } catch (err) {}
    addMatchToAllTime(players); (matchActions?.endGame ?? endGame)()
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      <div className="col-span-2 card">
        <h2 className="text-lg font-semibold mb-3">Score Input</h2>
        {inProgress ? (
            <MatchControls
            inProgress={inProgress}
            startingScore={startingScore}
            pendingEntries={pendingEntries}
            onAddVisit={(score, darts) => {
              // Compute remaining before we update store, to decide auto-advance
              const p = players[currentPlayerIdx]
              const leg = p.legs[p.legs.length - 1]
              const prevRemaining = leg ? leg.totalScoreRemaining : startingScore
              const numericScore = (typeof score === 'number' ? score : 0)
              let newRemaining = prevRemaining - numericScore
              if (!Number.isFinite(newRemaining) || newRemaining < 0) newRemaining = 0
              // Call provided matchActions.addVisit if available, otherwise the store's addVisit
              // Call provided matchActions.addVisit if available, otherwise the store's addVisit
              if (matchActions?.addVisit) { matchActions.addVisit(score, darts) }
              else { addVisit(score, darts) }
              if (newRemaining === 0) {
                if (matchActions?.endLeg) { matchActions.endLeg(score) } else { endLeg(score) }
              } else {
                (matchActions?.nextPlayer ?? nextPlayer)()
              }
            }}
            onUndo={() => (matchActions?.undoVisit ?? undoVisit)()}
            onEndLeg={(score) => { (matchActions?.endLeg ?? endLeg)(score ?? 0) }}
            onNextPlayer={() => (matchActions?.nextPlayer ?? nextPlayer)()}
            onEndGame={handleEndGame}
            quickButtons={[180,140,100,60]}
          />
        ) : (
          <p className="text-slate-600">No game in progress.</p>
        )}

  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {players.map((p, idx) => {
            const currentLeg = p.legs[p.legs.length-1]
            const remaining = currentLeg ? currentLeg.totalScoreRemaining : startingScore
            // TV-style 3-dart avg across the entire match (all legs): sum(points)/sum(darts)*3
            const totals = p.legs.reduce((acc, L) => {
              acc.points += (L.totalScoreStart - L.totalScoreRemaining)
              const legDarts = (L.visits || []).reduce((a, v) => a + (v.darts || 0) - (v.preOpenDarts || 0), 0)
              acc.darts += legDarts
              return acc
            }, { points: 0, darts: 0 })
            const dartsThrown = totals.darts
            const avg = dartsThrown > 0 ? ((totals.points / dartsThrown) * 3) : 0

            return (
              <div key={p.id} className={`card glass transition-shadow transition-all duration-150 ease-out ${idx === currentPlayerIdx ? 'ring-2 ring-brand-400' : ''}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{p.name}</h3>
                  <span className="badge w-32 justify-center">Legs Won: {p.legsWon}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-white/10 border border-white/10 metric-tile">
                    <div className="text-xs text-slate-500">Remaining</div>
                    <div className={`flex items-center justify-center gap-2 mt-1 h-3 w-full`} aria-hidden>
                      {[0,1,2].map(i => {
                        // Only active/current player's pendingEntries matter; other players get translucent placeholders
                        const e = idx === currentPlayerIdx ? (pendingEntries[i] as any) : null
                        const isPending = !e
                        const isHit = !!e && (typeof e.value === 'number' ? e.value > 0 : true)
                        const color = isPending ? 'bg-gray-400/60' : (isHit ? 'bg-emerald-400' : 'bg-rose-500')
                        const active = idx === currentPlayerIdx && !isPending && isHit
                        const classes = `visit-dot ${active ? 'active' : 'inactive'} ${color}`
                        return <span key={i} className={classes} />
                      })}
                    </div>
                    <div className="text-2xl font-bold">{remaining}</div>
                    <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-400/70 transition-all duration-200 ease-out" style={{ width: `${Math.max(0, Math.min(100, (1 - (remaining / startingScore)) * 100))}%` }} />
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-white/10 border border-white/10 metric-tile">
                    <div className="text-xs text-slate-500">Darts</div>
                    <div className="text-xl font-bold">{dartsThrown}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white/10 border border-white/10 metric-tile">
                    <div className="text-xs text-slate-500">3-Dart Avg</div>
                    <div className="text-xl font-bold">{formatAvg(avg)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {bestLegThisMatch && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <strong>Best Leg (this match):</strong> Player {players.find(p => p.id === bestLegThisMatch.playerId)?.name} in {bestLegThisMatch.darts} darts
          </div>
        )}
      </div>
    </div>
  )
}
