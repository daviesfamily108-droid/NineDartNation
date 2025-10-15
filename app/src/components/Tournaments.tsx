import { useEffect, useMemo, useState } from 'react'
import ResizableModal from './ui/ResizableModal'
import { useToast } from '../store/toast'
import { useWS } from './WSProvider'

type Tournament = {
  id: string
  title: string
  game: string
  mode: 'bestof'|'firstto'
  value: number
  description: string
  startAt: number
  checkinMinutes: number
  capacity: number
  participants: { email: string, username: string }[]
  official?: boolean
  prize?: boolean
  prizeType?: 'premium'|'cash'|'none'
  prizeAmount?: number
  currency?: string
  payoutStatus?: 'none'|'pending'|'paid'
  status: 'scheduled'|'running'|'completed'
  winnerEmail?: string|null
  startingScore?: number
  creatorEmail?: string
  creatorName?: string
}

export default function Tournaments({ user }: { user: any }) {
  const toast = useToast()
  const wsGlobal = (() => { try { return useWS() } catch { return null } })()
  const [list, setList] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [leaveAsk, setLeaveAsk] = useState<{ open: boolean; t: Tournament | null }>({ open: false, t: null })
  const [form, setForm] = useState({
    title: 'Community X01 Tournament',
    game: 'X01',
    mode: 'bestof' as 'bestof'|'firstto',
    value: 3,
    description: '',
    startAt: new Date(Date.now() + 2*60*60*1000).toISOString().slice(0,16), // local yyyy-mm-ddThh:mm
    checkinMinutes: 15,
    capacity: 8,
    startingScore: 501,
  })
  const isTouch = (() => {
    try { return ('ontouchstart' in window) || (navigator.maxTouchPoints||0) > 0 } catch { return false }
  })()

  async function refresh() {
    try {
      const res = await fetch('/api/tournaments')
      const data = await res.json()
      setList(Array.isArray(data.tournaments) ? data.tournaments : [])
    } catch {}
  }
  useEffect(() => { refresh() }, [])

  // Listen for WS push updates from global provider if available
  useEffect(() => {
    if (!wsGlobal) return
    const unsub = wsGlobal.addListener((msg) => {
      try {
        if (msg.type === 'tournaments') setList(msg.tournaments || [])
        // tournament-reminder handled optionally here if desired
      } catch {}
    })
    return () => { unsub() }
  }, [wsGlobal?.connected])

  const email = String(user?.email || '').toLowerCase()
  // Fetch subscription to detect if user is a recent tournament winner (cooldown)
  useEffect(() => {
    let abort = false
    async function check() {
      if (!email) { setCooldownUntil(null); return }
      try {
        const res = await fetch(`/api/subscription?email=${encodeURIComponent(email)}`)
        const data = await res.json()
        if (!abort) {
          if (data?.source === 'tournament' && typeof data.expiresAt === 'number' && data.expiresAt > Date.now()) {
            setCooldownUntil(data.expiresAt)
          } else {
            setCooldownUntil(null)
          }
        }
      } catch {
        if (!abort) setCooldownUntil(null)
      }
    }
    check()
    return () => { abort = true }
  }, [email])
  function hasJoined(t: Tournament) {
    return !!t.participants?.some(p => p.email === email)
  }

  // Helper to delete a tournament with proper error handling and owner fallback
  async function deleteTournament(t: Tournament) {
    if (!email) return
    if (!confirm('Delete this tournament?')) return
    setLoading(true)
    try {
      // First try creator/owner shared endpoint
      let res = await fetch('/api/tournaments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: t.id, requesterEmail: email })
      })

      // If forbidden but user is the owner, try the admin endpoint as a fallback
      if (!res.ok && res.status === 403 && String(email) === 'daviesfamily108@gmail.com') {
        res = await fetch('/api/admin/tournaments/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournamentId: t.id, requesterEmail: email })
        })
      }

      if (!res.ok) {
        let msg = 'Delete failed'
        try {
          const data = await res.json()
          if (data?.error) msg = `Delete failed: ${String(data.error)}`
        } catch {}
        toast(msg, { type: 'error' })
        return
      }

      toast('Tournament deleted', { type: 'success' })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  async function join(t: Tournament) {
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/tournaments/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: t.id, email, username: user?.username }) })
      if (!res.ok) {
        let data: any = {}
        try { data = await res.json() } catch {}
        if (data?.error === 'WINNER_COOLDOWN' && typeof data.until === 'number') {
          setErrorMsg(`You're a recent NDN tournament winner. You can re-enter after ${fmt(data.until)}.`)
          setTimeout(()=>setErrorMsg(''), 6000)
          toast('Join blocked: winner cooldown active', { type: 'error' })
        } else if (data?.error) {
          setErrorMsg(String(data.error))
          setTimeout(()=>setErrorMsg(''), 3500)
          toast(`Join failed: ${String(data.error)}`, { type: 'error' })
        }
        return
      }
      toast('Joined tournament', { type: 'success' })
      await refresh()
    } finally { setLoading(false) }
  }

  async function leave(t: Tournament) {
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/tournaments/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: t.id, email }) })
      if (!res.ok) {
        let data: any = {}
        try { data = await res.json() } catch {}
        if (data?.error) {
          toast(`Leave failed: ${String(data.error)}`, { type: 'error' })
        } else if (res.status === 404) {
          toast('Leave failed (endpoint not found). Restart the server to enable /api/tournaments/leave.', { type: 'error' })
        } else {
          toast('Leave failed. Please try again.', { type: 'error' })
        }
        return
      }
      toast('Left tournament', { type: 'success' })
      // Optimistic local update
      setList(prev => prev.map(it => it.id === t.id ? { ...it, participants: (it.participants||[]).filter(p => p.email !== email) } : it))
      await refresh()
    } finally { setLoading(false) }
  }

  async function createTournament() {
    setLoading(true)
    try {
      const start = new Date(form.startAt).getTime()
      await fetch('/api/tournaments/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        title: form.title,
        game: form.game,
        mode: form.mode,
        value: Number(form.value),
        description: form.description,
        startAt: start,
        checkinMinutes: Number(form.checkinMinutes),
        capacity: Number(form.capacity),
        startingScore: form.game==='X01' ? Number(form.startingScore||501) : undefined,
        creatorEmail: user?.email,
        creatorName: user?.username,
      }) })
      setShowCreate(false)
      toast('Tournament created', { type: 'success' })
      await refresh()
    } finally { setLoading(false) }
  }

  // Close the create modal on Escape
  useEffect(() => {
    if (!showCreate) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCreate(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showCreate])

  const official = useMemo(() => list.filter(t => t.official), [list])
  const community = useMemo(() => list.filter(t => !t.official), [list])
  const nextOfficial = useMemo(() => {
    const upcoming = official
      .filter(t => t.status === 'scheduled')
      .sort((a,b) => a.startAt - b.startAt)
    return upcoming[0] || null
  }, [official])

  function fmt(ts: number) {
    const d = new Date(ts)
    return d.toLocaleString()
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold">Tournaments</h2>
      </div>
      {/* Create Tournament+ box (top-right area) */}
      <div className="mb-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40 flex items-center justify-end">
        <button className="btn" onClick={()=>setShowCreate(true)}>Create Tournament +</button>
      </div>
      <div className="mb-2 text-sm font-semibold text-slate-300">World Lobby</div>
      {/* Persistent banner for next official weekly tournament */}
      {nextOfficial && (
        <div className="mb-4 p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <div className="text-sm uppercase tracking-wide text-indigo-300 font-semibold">Weekly Official Tournament</div>
              <div className="font-bold">{nextOfficial.title}</div>
                  <div className="text-sm opacity-80">{nextOfficial.game}{nextOfficial.game==='X01' && nextOfficial.startingScore?`/${nextOfficial.startingScore}`:''} · {nextOfficial.mode==='firstto'?'First to':'Best of'} {nextOfficial.value} · Starts {fmt(nextOfficial.startAt)} · Cap {nextOfficial.capacity} · Joined {nextOfficial.participants.length}</div>
              {nextOfficial.prize && (
                <div className="text-xs mt-1">
                  Prize: {nextOfficial.prizeType === 'cash' && nextOfficial.prizeAmount ? `${nextOfficial.currency||'USD'} ${nextOfficial.prizeAmount}` : '1 month PREMIUM'}
                </div>
              )}
              {nextOfficial.status !== 'scheduled' && <div className="text-xs">Status: {nextOfficial.status}</div>}
              {cooldownUntil && cooldownUntil > Date.now() && (
                <div className="text-xs text-rose-300">Recent winners can re-enter after {fmt(cooldownUntil)}.</div>
              )}
            </div>
            <div className="shrink-0">
              <button
                className={`btn ${hasJoined(nextOfficial) ? 'bg-emerald-600 hover:bg-emerald-600' : ''}`}
                title={hasJoined(nextOfficial)
                  ? 'Double-click to leave this tournament'
                  : (nextOfficial.official && cooldownUntil && cooldownUntil > Date.now() ? `Recent winners can re-enter after ${fmt(cooldownUntil)}` : '')}
                disabled={loading || nextOfficial.status!=='scheduled' || (!hasJoined(nextOfficial) && (nextOfficial.participants.length>=nextOfficial.capacity || (!!cooldownUntil && cooldownUntil > Date.now())))}
                onClick={()=> {
                  if (!hasJoined(nextOfficial)) { join(nextOfficial) }
                  else if (isTouch) { setLeaveAsk({ open: true, t: nextOfficial }) }
                }}
                onDoubleClick={()=> { if (!isTouch && hasJoined(nextOfficial)) setLeaveAsk({ open: true, t: nextOfficial }) }}
                aria-label={hasJoined(nextOfficial) ? 'Already Joined' : 'Join Now'}
              >{hasJoined(nextOfficial) ? 'Already Joined!' : 'Join Now'}</button>
            </div>
          </div>
        </div>
      )}
      {errorMsg && (
        <div className="mb-3 p-2 rounded-lg bg-amber-700/30 border border-amber-600/40 text-amber-200 text-sm">{errorMsg}</div>
      )}
      <div className="space-y-4">
        <section>
          <div className="font-semibold mb-1">Official</div>
          <div className="text-xs opacity-70 mb-2">
            {cooldownUntil && cooldownUntil > Date.now() ? (
              <>You’re a recent NDN tournament winner — to keep it fair, you can re-enter after {fmt(cooldownUntil)}.</>
            ) : (
              <>Note: Weekly winners can re-enter once their prize month of PREMIUM ends.</>
            )}
          </div>
          <ul className="space-y-2">
            {official.map(t => (
              <li key={t.id} className="p-3 rounded bg-black/10 flex items-center justify-between relative">
                {/* Close button when you are the creator (owner-created official) and it hasn't started */}
                {(t.status==='scheduled' && email && t.creatorEmail && String(t.creatorEmail).toLowerCase()===email) && (
                  <button
                    className="absolute top-2 left-2 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs flex items-center justify-center shadow"
                    title="Delete this tournament"
                    onClick={()=>deleteTournament(t)}
                    aria-label="Delete tournament"
                  >×</button>
                )}
                <div className="space-y-0.5">
                  <div className="font-semibold">{t.title} {t.prize && (
                    <span className="inline-flex items-center gap-1 ml-2 align-middle">
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500 text-black">Prize</span>
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[10px] leading-none cursor-help"
                        title={t.prizeType==='cash' ? 'Official cash prize tournament — payout handled by admin.' : 'Weekly winners get 1 month of PREMIUM and can re-enter once their prize month ends.'}
                        aria-label="Prize info"
                      >i</span>
                    </span>
                  )}</div>
                  <div className="text-sm opacity-80">{t.game}{t.game==='X01' && t.startingScore?`/${t.startingScore}`:''} · {t.mode==='firstto'?'First to':'Best of'} {t.value} · {fmt(t.startAt)} · Cap {t.capacity} · Joined {t.participants.length}</div>
                  {t.prize && (
                    <div className="text-xs">
                      Prize: {t.prizeType === 'cash' && t.prizeAmount ? `${t.currency||'USD'} ${t.prizeAmount}` : '1 month PREMIUM'}
                      {t.status==='completed' && t.prizeType==='cash' && t.payoutStatus && (
                        <span className={`ml-2 px-2 py-0.5 rounded ${t.payoutStatus==='paid'?'bg-emerald-600':'bg-amber-600'}`}>{t.payoutStatus==='paid'?'Paid':'Pending'}</span>
                      )}
                    </div>
                  )}
                  {t.status !== 'scheduled' && <div className="text-xs">Status: {t.status}</div>}
                  {hasJoined(t) && <div className="text-xs text-emerald-400 font-semibold">Already Joined</div>}
                  {t.official && cooldownUntil && cooldownUntil > Date.now() && (
                    <div className="text-xs text-rose-300">Cooldown active until {fmt(cooldownUntil)}.</div>
                  )}
                </div>
                <div>
                  <button
                    className={`btn ${hasJoined(t) ? 'bg-emerald-600 hover:bg-emerald-600' : ''}`}
                    title={hasJoined(t)
                      ? 'Double-click to leave this tournament'
                      : (t.official && cooldownUntil && cooldownUntil > Date.now() ? `Recent winners can re-enter after ${fmt(cooldownUntil)}` : '')}
                    disabled={loading || t.status!=='scheduled' || (!hasJoined(t) && (t.participants.length>=t.capacity || (t.official && !!cooldownUntil && cooldownUntil > Date.now())))}
                    onClick={()=> { if (!hasJoined(t)) { join(t) } else if (isTouch) { setLeaveAsk({ open: true, t }) } }}
                    onDoubleClick={()=> { if (!isTouch && hasJoined(t)) setLeaveAsk({ open: true, t }) }}
                    aria-label={hasJoined(t) ? 'Already Joined' : 'Join Now'}
                  >{hasJoined(t) ? 'Already Joined!' : 'Join Now'}</button>
                </div>
              </li>
            ))}
            {official.length === 0 && <li className="text-sm opacity-60">No official tournaments yet.</li>}
          </ul>
        </section>

        <section>
          <div className="font-semibold mb-1">Community</div>
          <ul className="space-y-2">
            {community.map(t => (
              <li key={t.id} className="p-3 rounded bg-black/10 flex items-center justify-between relative">
                {/* Close button for creator to delete their own scheduled tournament */}
                {(t.status==='scheduled' && email && t.creatorEmail && String(t.creatorEmail).toLowerCase()===email) && (
                  <button
                    className="absolute top-2 left-2 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs flex items-center justify-center shadow"
                    title="Delete this tournament"
                    onClick={()=>deleteTournament(t)}
                    aria-label="Delete tournament"
                  >×</button>
                )}
                <div className="space-y-0.5">
                  <div className="font-semibold">{t.title}</div>
                  <div className="text-sm opacity-80">{t.game}{t.game==='X01' && t.startingScore?`/${t.startingScore}`:''} · {t.mode==='firstto'?'First to':'Best of'} {t.value} · {fmt(t.startAt)} · Cap {t.capacity} · Joined {t.participants.length}</div>
                  {t.description && <div className="text-xs opacity-80">{t.description}</div>}
                  {hasJoined(t) && <div className="text-xs text-emerald-400 font-semibold">Already Joined</div>}
                </div>
                <div>
                  <button
                    className="btn"
                    title={hasJoined(t) ? 'Double-click to leave this tournament' : ''}
                    disabled={loading || t.status!=='scheduled' || (!hasJoined(t) && t.participants.length>=t.capacity)}
                    onClick={()=> { if (!hasJoined(t)) { join(t) } else if (isTouch) { setLeaveAsk({ open: true, t }) } }}
                    onDoubleClick={()=> { if (!isTouch && hasJoined(t)) setLeaveAsk({ open: true, t }) }}
                  >{hasJoined(t) ? 'Already Joined' : 'Join Now'}</button>
                </div>
              </li>
            ))}
            {community.length === 0 && <li className="text-sm opacity-60">No community tournaments yet.</li>}
          </ul>
        </section>
      </div>

      {showCreate && (
        <div className="mb-4">
          <div className="card relative">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-semibold">Create Tournament</h3>
              <button className="btn" onClick={()=>setShowCreate(false)}>Close</button>
            </div>
            <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 pr-1">
              <div>
                <label className="block text-sm font-semibold mb-1">Title</label>
                <input className="input w-full" value={form.title} onChange={e=>setForm(f=>({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-semibold mb-1">Game</label>
                  <select className="input w-full" value={form.game} onChange={e=>setForm(f=>({ ...f, game: e.target.value }))}>
                    {['X01','Around the Clock','Cricket','Halve It','Shanghai','High-Low','Killer'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Mode</label>
                  <select className="input w-full" value={form.mode} onChange={e=>setForm(f=>({ ...f, mode: e.target.value as any }))}>
                    <option value="bestof">Best of</option>
                    <option value="firstto">First to</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Number</label>
                  <input className="input w-full" type="number" min={1} value={form.value} onChange={e=>setForm(f=>({ ...f, value: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Description</label>
                <textarea className="input w-full" rows={5} value={form.description} onChange={e=>setForm(f=>({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-semibold mb-1">Start time</label>
                  <input className="input w-full" type="datetime-local" value={form.startAt} onChange={e=>setForm(f=>({ ...f, startAt: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Check-in reminder (min)</label>
                  <input className="input w-full" type="number" min={0} value={form.checkinMinutes} onChange={e=>setForm(f=>({ ...f, checkinMinutes: Number(e.target.value) }))} />
                </div>
              </div>
              {form.game==='X01' && (
                <div>
                  <label className="block text-sm font-semibold mb-1">X01 Starting Score</label>
                  <select className="input w-full" value={String(form.startingScore)} onChange={e=>setForm(f=>({ ...f, startingScore: Number(e.target.value) }))}>
                    {[301, 501, 701].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold mb-1">Capacity</label>
                <input className="input w-full" type="number" min={6} max={64} value={form.capacity} onChange={e=>setForm(f=>({ ...f, capacity: Number(e.target.value) }))} />
              </div>
              <div className="text-xs opacity-70">Note: community tournaments do not award prizes.</div>
              <div className="flex justify-end">
                <button className="btn" disabled={loading} onClick={createTournament}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {leaveAsk.open && leaveAsk.t && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setLeaveAsk({ open: false, t: null })} />
          <div className="relative card p-4 w-[360px] max-w-[90vw]">
            <div className="text-lg font-semibold mb-2">Leave tournament?</div>
            <div className="text-sm opacity-80 mb-4">Are you sure you want to remove yourself from “{leaveAsk.t.title}”?</div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="btn bg-rose-600 hover:bg-rose-700"
                onClick={()=>setLeaveAsk({ open: false, t: null })}
              >Decline</button>
              <button
                className="btn bg-emerald-600 hover:bg-emerald-700"
                onClick={async ()=>{ const t = leaveAsk.t!; setLeaveAsk({ open: false, t: null }); await leave(t) }}
              >Accept</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
