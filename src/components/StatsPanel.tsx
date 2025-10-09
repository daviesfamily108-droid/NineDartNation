import { useMatch } from '../store/match'
import { formatAvg } from '../utils/stats'
import { useEffect, useMemo, useState } from 'react'
import BarChart from './BarChart'
import { getGameModeStats, getMonthlyAvg3, getMonthlyFirstNineAvg, getAllTimeAvg, getAllTimeFirstNineAvg, getAllTime } from '../store/profileStats'
import { allGames } from '../utils/games'
import TabPills from './ui/TabPills'

export default function StatsPanel({ user }: { user?: any }) {
  const { players, inProgress, startingScore, newMatch } = useMatch()
  const [family, setFamily] = useState<'x01' | 'other'>('x01')
  const [playersText, setPlayersText] = useState('Player 1, Player 2')
  const [start, setStart] = useState(501)
  // Opponent compare: select a friend to render on the second card
  const [friends, setFriends] = useState<Array<{ email: string; username?: string }>>([])
  const [opponent, setOpponent] = useState<string>('')
  const [showPicker, setShowPicker] = useState<boolean>(false)
  const [q, setQ] = useState<string>('')
  const [results, setResults] = useState<Array<{ email: string; username?: string }>>([])
  const [searching, setSearching] = useState<boolean>(false)
  const me = String(user?.email || '').toLowerCase()
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!me) return
        const res = await fetch(`/api/friends/list?email=${encodeURIComponent(me)}`)
        const j = await res.json().catch(()=>({friends:[]}))
        if (!cancelled) setFriends((j.friends||[]) as Array<{email:string;username?:string}>)
      } catch {}
    }
    load()
    // Refresh occasionally in case friends change while open
    const id = setInterval(load, 20000)
    return () => { cancelled = true; clearInterval(id) }
  }, [me])

  // Rehydrate previously selected opponent from localStorage (per-user key)
  useEffect(() => {
    try {
      const key = me ? `ndn:stats:opponent:${me}` : 'ndn:stats:opponent'
      const saved = localStorage.getItem(key)
      if (saved) setOpponent(saved)
    } catch {}
  }, [me])

  // Persist opponent selection
  useEffect(() => {
    try {
      const key = me ? `ndn:stats:opponent:${me}` : 'ndn:stats:opponent'
      if (opponent) localStorage.setItem(key, opponent); else localStorage.removeItem(key)
    } catch {}
  }, [opponent, me])

  async function runSearch(term: string) {
    setQ(term)
    if (!term.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(term)}`)
      const j = await res.json().catch(()=>({results:[]}))
      setResults((j.results||[]) as Array<{email:string;username?:string}>)
    } finally { setSearching(false) }
  }

  // Build a score-frequency distribution for the selected family.
  // For now, we only have X01 in the match store; "other" is a placeholder that would read other game stats when added.
  const dist = useMemo(() => {
    const freq = new Map<number, number>()
    if (family === 'x01') {
      for (const p of players) {
        for (const leg of p.legs) {
          for (const v of leg.visits) {
            const s = Math.max(0, Math.min(180, v.score))
            freq.set(s, (freq.get(s) ?? 0) + 1)
          }
        }
      }
    }
    // Convert to sorted array (by score asc) and limit to reasonable width
    const arr = Array.from(freq.entries()).sort((a, b) => a[0] - b[0])
    // If very sparse, still show common x01 bands
    if (arr.length === 0 && family === 'x01') {
      [0, 26, 41, 60, 81, 100, 120, 140, 160, 180].forEach(k => freq.set(k, 0))
      return Array.from(freq.entries()).sort((a, b) => a[0] - b[0]).map(([label, value]) => ({ label, value }))
    }
    return arr.map(([label, value]) => ({ label, value }))
  }, [players, family])

  // Build Other Modes dataset: one bar per mode with value = played, label = mode name, and show played/won in label
  const otherData = useMemo(() => {
    const gm = getGameModeStats(allGames as unknown as string[])
    return (allGames as unknown as string[]).map(mode => {
      const e = gm[mode] || { played: 0, won: 0 }
      // Bar label stays short; detailed caption rendered below values via custom footer
      return { label: mode, value: e.played, extra: e.won }
    })
  }, [family])

  // Trigger re-render when any game-mode stat updates elsewhere
  useEffect(() => {
    const onUpdate = () => setFamily(f => f) // noop to refresh memo
    window.addEventListener('ndn:stats-updated', onUpdate as any)
    return () => window.removeEventListener('ndn:stats-updated', onUpdate as any)
  }, [])

  return (
    <div className="card">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Match Stats</h2>
          <span className="text-xs opacity-70">View</span>
        </div>
        <TabPills
          tabs={[{ key: 'x01', label: 'X01' }, { key: 'other', label: 'Other Modes' }]}
          active={family}
          onChange={(k)=> setFamily((k as 'x01'|'other'))}
        />
      </div>
      {players.length === 0 && (
        <div className="mb-4 p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
          <div className="font-semibold mb-2">No match data yet</div>
          <div className="text-sm opacity-80 mb-2">Start a quick X01 match to generate stats. Stats like Best/Worst 3-dart are finalized when you end the game.</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Players (comma separated)</label>
              <input className="input w-full" value={playersText} onChange={e => setPlayersText(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Starting Score</label>
              <input className="input w-full" type="number" value={start} onChange={e => setStart(parseInt(e.target.value||'501'))} />
            </div>
            <div>
              <button className="btn w-full" onClick={()=>{
                const names = playersText.split(',').map(s=>s.trim()).filter(Boolean)
                if (!names.length) return alert('Enter at least one player')
                newMatch(names, start)
              }}>Start Match</button>
            </div>
          </div>
        </div>
      )}
      {inProgress && (
        <div className="mb-3 p-2 rounded-lg text-sm border border-amber-500/40 bg-amber-500/10 text-amber-200">Note: Detailed leg stats are finalized at the end of the game.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {players.map((p, idx) => (
          <div key={p.id} className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{idx===1 && !opponent ? (p.name || 'Opponent') : (idx===1 && opponent ? opponent : p.name)}</div>
              {idx === 1 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10"
                    onClick={()=> setShowPicker(s => !s)}
                    title="Search user to compare"
                  >Select Friend</button>
                  {friends.slice(0, 6).map(f => {
                    const lbl = f.username || f.email
                    const active = opponent === lbl
                    return (
                      <button
                        key={f.email}
                        className={`text-[11px] px-3 py-1 rounded-full border ${active ? 'bg-indigo-500/30 border-indigo-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        onClick={()=> setOpponent(lbl)}
                        title={`Compare vs ${lbl}`}
                      >{lbl}</button>
                    )
                  })}
                  {friends.length === 0 && (
                    <button className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/10" disabled>Find friends to compare</button>
                  )}
                </div>
              )}
            </div>
            {idx === 1 && showPicker && (
              <div className="mb-2 p-2 rounded-lg bg-black/20 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    className="input flex-1 py-1"
                    placeholder="Search by name or email"
                    value={q}
                    onChange={e=> runSearch(e.target.value)}
                  />
                  <button className="btn px-3 py-1 text-sm" onClick={()=> runSearch(q)} disabled={searching}>Search</button>
                </div>
                <ul className="max-h-40 overflow-auto space-y-1">
                  {results.map(r => {
                    const lbl = r.username || r.email
                    return (
                      <li key={r.email}>
                        <button
                          className="w-full text-left px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                          onClick={()=> { setOpponent(lbl); setShowPicker(false) }}
                        >{lbl}</button>
                      </li>
                    )
                  })}
                  {!results.length && (
                    <li className="text-xs opacity-70">{q.trim() ? 'No results' : 'Type to search…'}</li>
                  )}
                </ul>
              </div>
            )}
            {/* If second card and an opponent is selected, show their all-time stats; otherwise show the match/player stats */}
            {idx === 1 && opponent ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best 3-Dart</div>
                  <div className="font-semibold">{formatAvg(getAllTime(opponent).best3 || 0)}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Worst 3-Dart</div>
                  <div className="font-semibold">{formatAvg(getAllTime(opponent).worst3 || 0)}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best 9-Dart (fewest darts)</div>
                  <div className="font-semibold">{(() => { const a = getAllTime(opponent); return a.bestLegDarts ? `${a.bestLegDarts} darts` : '—' })()}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best Checkout</div>
                  <div className="font-semibold">{getAllTime(opponent).bestCheckout || '—'}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">Averages (All-time vs Monthly)</div>
                  <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                    <span>3-dart: {formatAvg(getAllTimeAvg(opponent))} · {formatAvg(getMonthlyAvg3(opponent))}</span>
                    <span>First 9: {formatAvg(getAllTimeFirstNineAvg(opponent))} · {formatAvg(getMonthlyFirstNineAvg(opponent))}</span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">All-time snapshot</div>
                  {(() => { const all = getAllTime(opponent); return (
                    <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                      <span>Best 3-dart: {formatAvg(all.best3||0)}</span>
                      <span>Worst 3-dart: {formatAvg(all.worst3||0)}</span>
                      <span>Best leg: {all.bestLegDarts || 0} darts</span>
                      <span>Best checkout: {all.bestCheckout || 0}</span>
                    </div>
                  )})()}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best 3-Dart</div>
                  <div className="font-semibold">{formatAvg(p.bestThreeDartAvg)}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Worst 3-Dart</div>
                  <div className="font-semibold">{formatAvg(p.worstThreeDartAvg)}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best 9-Dart (fewest darts)</div>
                  <div className="font-semibold">{p.bestNineDart ? `${p.bestNineDart.darts} darts` : '—'}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best Checkout</div>
                  <div className="font-semibold">{p.bestCheckout ?? '—'}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">Averages (All-time vs Monthly)</div>
                  <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                    <span>3-dart: {formatAvg(getAllTimeAvg(p.name))} · {formatAvg(getMonthlyAvg3(p.name))}</span>
                    <span>First 9: {formatAvg(getAllTimeFirstNineAvg(p.name))} · {formatAvg(getMonthlyFirstNineAvg(p.name))}</span>
                  </div>
                </div>
                {/* All-time snapshot */}
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">All-time snapshot</div>
                  {(() => { const all = getAllTime(p.name); return (
                    <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                      <span>Best 3-dart: {formatAvg(all.best3||0)}</span>
                      <span>Worst 3-dart: {formatAvg(all.worst3||0)}</span>
                      <span>Best leg: {all.bestLegDarts || 0} darts</span>
                      <span>Best checkout: {all.bestCheckout || 0}</span>
                    </div>
                  )})()}
                </div>
              </div>
            )}
          </div>
        ))}
        {/* Opponent compare card: if there are fewer than 2 players, show a selector to compare with a friend */}
        {players.length <= 1 && (
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Opponent</div>
              <div className="flex flex-wrap gap-2">
                {friends.slice(0, 6).map(f => {
                  const lbl = f.username || f.email
                  const active = opponent === (f.username || f.email)
                  return (
                    <button
                      key={f.email}
                      className={`text-[11px] px-3 py-1 rounded-full border ${active ? 'bg-indigo-500/30 border-indigo-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                      onClick={()=> setOpponent(lbl)}
                      title={`Compare vs ${lbl}`}
                    >{lbl}</button>
                  )
                })}
                {friends.length === 0 && (
                  <span className="text-xs opacity-70">Add friends to compare stats.</span>
                )}
              </div>
            </div>
            {opponent ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">Comparing to</div>
                  <div className="font-semibold">{opponent}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best 3-Dart</div>
                  <div className="font-semibold">{formatAvg(getAllTimeAvg(opponent))}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Worst 3-Dart</div>
                  <div className="font-semibold">{formatAvg(getAllTime(opponent).worst3 || 0)}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best 9-Dart (fewest darts)</div>
                  <div className="font-semibold">{(() => { const a = getAllTime(opponent); return a.bestLegDarts ? `${a.bestLegDarts} darts` : '—' })()}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-slate-300">Best Checkout</div>
                  <div className="font-semibold">{getAllTime(opponent).bestCheckout || '—'}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">Averages (All-time vs Monthly)</div>
                  <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                    <span>3-dart: {formatAvg(getAllTimeAvg(opponent))} · {formatAvg(getMonthlyAvg3(opponent))}</span>
                    <span>First 9: {formatAvg(getAllTimeFirstNineAvg(opponent))} · {formatAvg(getMonthlyFirstNineAvg(opponent))}</span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/10 col-span-2">
                  <div className="text-slate-300">All-time snapshot</div>
                  {(() => { const all = getAllTime(opponent); return (
                    <div className="font-semibold flex flex-wrap gap-3 text-[13px]">
                      <span>Best 3-dart: {formatAvg(all.best3||0)}</span>
                      <span>Worst 3-dart: {formatAvg(all.worst3||0)}</span>
                      <span>Best leg: {all.bestLegDarts || 0} darts</span>
                      <span>Best checkout: {all.bestCheckout || 0}</span>
                    </div>
                  )})()}
                </div>
              </div>
            ) : (
              <div className="text-sm opacity-70">Select a friend above to compare.</div>
            )}
          </div>
        )}
      </div>

      {/* Score distribution for selection */}
      <div className="mt-6">
        <div className="mb-2 text-sm opacity-80">Score Distribution ({family.toUpperCase()}): Visits by scored points</div>
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3">
          <BarChart data={dist} showValues={false} />
        </div>
      </div>

      {/* Other Modes: Played/Won per game as a bar chart */}
      <div className="mt-6">
        <div className="mb-2 text-sm opacity-80">Other Modes: games played (bar height) with wins shown beneath each label</div>
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3">
          {/* Reuse BarChart for bar height = played; render captions underneath */}
          <BarChart data={otherData.map(d => ({ label: d.label, value: d.value }))} showValues={false} />
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px] opacity-80">
            {otherData.map((d, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 rounded-md bg-white/5 border border-white/10">
                <span className="truncate mr-2">{d.label}</span>
                <span className="whitespace-nowrap">Played {d.value} · Won {d.extra}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
