import { useMatch } from '../store/match'
import { formatAvg } from '../utils/stats'
import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { addMatchToAllTime } from '../store/profileStats'
import { usePendingVisit } from '../store/pendingVisit'

export default function Scoreboard() {
  const [score, setScore] = useState<number>(0)
  const [darts, setDarts] = useState<number>(3)
  const { players, currentPlayerIdx, addVisit, undoVisit, endLeg, nextPlayer, endGame, inProgress, startingScore, bestLegThisMatch } = useMatch()
  const pendingEntries = usePendingVisit(s => s.entries)

  const current = players[currentPlayerIdx]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="col-span-2 card">
        <h2 className="text-xl font-semibold mb-4">Score Input</h2>
        {inProgress ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input className="input w-32" type="number" value={score} onChange={e => setScore(parseInt(e.target.value || '0'))} placeholder="Score" />
              <select className="input" value={darts} onChange={e => setDarts(parseInt(e.target.value))}>
                <option value={1}>1 dart</option>
                <option value={2}>2 darts</option>
                <option value={3}>3 darts</option>
              </select>
              <button
                className="btn"
                onClick={() => {
                  // Compute remaining before we update store, to decide auto-advance
                  const p = players[currentPlayerIdx]
                  const leg = p.legs[p.legs.length - 1]
                  const prevRemaining = leg ? leg.totalScoreRemaining : startingScore
                  const newRemaining = Math.max(0, prevRemaining - (Number.isFinite(score) ? score : 0))

                  addVisit(score, darts)
                  setScore(0)

                  if (newRemaining === 0) {
                    // Finish leg automatically with this checkout
                    endLeg(score)
                  } else {
                    // Move to next player automatically after a visit
                    nextPlayer()
                  }
                }}
              >Add Visit</button>
              <button className="px-3 py-2 rounded-xl border border-slate-200" onClick={() => undoVisit()} title="Undo">
                <Undo2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => { endLeg(score); setScore(0); }}>End Leg (Checkout {score || 0})</button>
              <button className="btn bg-slate-700 hover:bg-slate-800" onClick={() => nextPlayer()}>Next Player</button>
              <button className="btn bg-emerald-600 hover:bg-emerald-700" onClick={() => { addMatchToAllTime(players); endGame() }}>End Game</button>
            </div>
          </div>
        ) : (
          <p className="text-slate-600">No game in progress.</p>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div key={p.id} className={`card glass ${idx === currentPlayerIdx ? 'ring-2 ring-brand-400' : ''}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <span className="badge">Legs Won: {p.legsWon}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                    <div className="text-xs text-slate-500">Remaining</div>
                    {idx === currentPlayerIdx && (
                      <div className="flex items-center justify-center gap-2 mt-1" aria-label={`Visit status for current player`}>
                        {[0,1,2].map(i => {
                          const e = pendingEntries[i] as any
                          const isPending = !e
                          const isHit = !!e && (typeof e.value === 'number' ? e.value > 0 : true)
                          const color = isPending ? 'bg-gray-400/70' : (isHit ? 'bg-emerald-400' : 'bg-rose-500')
                          return <span key={i} className={`w-2.5 h-2.5 rounded-full shadow ${color}`} />
                        })}
                      </div>
                    )}
                    <div className="text-2xl font-bold">{remaining}</div>
                    <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-400/70" style={{ width: `${Math.max(0, Math.min(100, (1 - (remaining / startingScore)) * 100))}%` }} />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                    <div className="text-xs text-slate-500">Darts</div>
                    <div className="text-2xl font-bold">{dartsThrown}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                    <div className="text-xs text-slate-500">3-Dart Avg</div>
                    <div className="text-2xl font-bold">{formatAvg(avg)}</div>
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

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Legs Summary</h2>
        <div className="space-y-3">
          {players.map((p) => (
            <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-slate-600">Completed Legs: {p.legs.filter(l => l.finished).length}</div>
              {!inProgress && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded-lg bg-white border">
                    <div className="text-slate-500">Best 3-Dart</div>
                    <div className="font-semibold">{formatAvg(p.bestThreeDartAvg)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border">
                    <div className="text-slate-500">Worst 3-Dart</div>
                    <div className="font-semibold">{formatAvg(p.worstThreeDartAvg)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border">
                    <div className="text-slate-500">Best 9-Dart (fewest darts)</div>
                    <div className="font-semibold">{p.bestNineDart ? `${p.bestNineDart.darts} darts` : '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border">
                    <div className="text-slate-500">Best Checkout</div>
                    <div className="font-semibold">{p.bestCheckout ?? '—'}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
