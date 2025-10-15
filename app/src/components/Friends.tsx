import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../store/toast'
import { useMessages } from '../store/messages'
import { censorProfanity } from '../utils/profanity'
import TabPills from './ui/TabPills'

type Friend = { email: string, username?: string, status?: 'online'|'offline'|'ingame', lastSeen?: number, roomId?: string|null, match?: { game: string, mode: string, value: number, startingScore?: number } | null }

function timeAgo(ts?: number) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s/60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m/60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h/24)
  return `${d}d ago`
}

export default function Friends({ user }: { user?: any }) {
  const toast = useToast()
  const email = String(user?.email || '').toLowerCase()
  const [friends, setFriends] = useState<Friend[]>([])
  const [suggested, setSuggested] = useState<Friend[]>([])
  const [results, setResults] = useState<Friend[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all'|'online'|'offline'|'ingame'|'requests'>('all')
  const [loading, setLoading] = useState(false)
  const msgs = useMessages()
  const [requests, setRequests] = useState<Array<{ email: string; username?: string }>>([])

  async function refresh() {
    if (!email) return
    try {
      const [fl, sg, rq] = await Promise.all([
        fetch(`/api/friends/list?email=${encodeURIComponent(email)}`).then(r=>r.json()),
        fetch(`/api/friends/suggested?email=${encodeURIComponent(email)}`).then(r=>r.json()),
        fetch(`/api/friends/requests?email=${encodeURIComponent(email)}`).then(r=>r.json()),
      ])
      setFriends(fl.friends || [])
      setSuggested(sg.suggestions || [])
      setRequests(rq.requests || [])
    } catch {}
  }

  useEffect(() => { refresh() }, [email])

  async function search(term: string) {
    setQ(term)
    if (!term) { setResults([]); return }
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(term)}`)
      const data = await res.json()
      setResults(data.results || [])
    } catch {}
  }

  async function addFriend(target: string) {
    if (!email || !target) return
    setLoading(true)
    try {
      await fetch('/api/friends/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, friend: target }) })
      await refresh()
      setQ(''); setResults([])
      toast('Friend added', { type: 'success' })
    } finally { setLoading(false) }
  }

  async function removeFriend(target: string) {
    if (!email || !target) return
    setLoading(true)
    try {
      await fetch('/api/friends/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, friend: target }) })
      await refresh()
      toast('Friend removed', { type: 'info' })
    } finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return friends
    return friends.filter(f => (f.status || 'offline') === filter)
  }, [friends, filter])

  async function spectate(roomId?: string|null) {
    if (!roomId) { toast('Room unavailable', { type: 'error' }); return }
    try {
      const ev = new CustomEvent('ndn:spectate-request', { detail: { roomId } })
      window.dispatchEvent(ev)
      toast('Opening spectator view…', { type: 'info' })
    } catch {}
  }

  // Friend Requests pill: use real requests data
  const requestsCount = requests.length;
  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-brand-700 mb-2">Friends</h2>
      <p className="mb-2 text-brand-600">Manage your friends. See who’s online, in-game, or offline; find new teammates; and invite people to play.</p>
      <div className="text-xs opacity-70 mb-3">Online: {friends.filter(f=>f.status==='online').length} · In-game: {friends.filter(f=>f.status==='ingame').length} · Offline: {friends.filter(f=>!f.status || f.status==='offline').length}</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-2 p-3 rounded-2xl bg-black/30 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-white/90">Your Friends</div>
          </div>
          <TabPills
            tabs={[
              { key: 'all', label: 'All' },
              { key: 'online', label: 'Online' },
              { key: 'ingame', label: 'In-Game' },
              { key: 'offline', label: 'Offline' },
              { key: 'requests', label: `Requests ${requestsCount > 0 ? '(' + requestsCount + ')' : ''}` },
            ]}
            active={filter}
            onChange={(k)=>setFilter(k as any)}
            className="mb-3"
          />
          {filter === 'requests' ? (
            <ul className="space-y-2">
              {requestsCount > 0 ? requests.map(r => (
                <li key={r.email} className="p-2 rounded bg-black/20 flex items-center justify-between">
                  <span className="font-semibold">{r.username || r.email}</span>
                  <button className="btn bg-emerald-600 hover:bg-emerald-700" onClick={async()=>{
                    setLoading(true)
                    try {
                      await fetch('/api/friends/accept', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, requester: r.email }) })
                      await refresh()
                      toast('Friend request accepted', { type: 'success' })
                    } finally { setLoading(false) }
                  }}>Accept</button>
                  <button className="btn bg-rose-600 hover:bg-rose-700" onClick={async()=>{
                    setLoading(true)
                    try {
                      await fetch('/api/friends/decline', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, requester: r.email }) })
                      await refresh()
                      toast('Friend request declined', { type: 'info' })
                    } finally { setLoading(false) }
                  }}>Decline</button>
                </li>
              )) : (
                <li className="text-sm opacity-70">No friend requests yet.</li>
              )}
            </ul>
          ) : (
            <ul className="space-y-2">
              {filtered.map(f => (
                <li key={f.email} className="p-2 rounded bg-black/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${f.status==='online'?'bg-emerald-400':f.status==='ingame'?'bg-amber-400':'bg-slate-400'}`}></span>
                    <span className="font-semibold">{f.username || f.email}</span>
                    <span className="text-xs opacity-70">{f.status || 'offline'}{(f.status!=='online' && f.lastSeen) ? ` · ${timeAgo(f.lastSeen)}` : ''}</span>
                    {f.status==='ingame' && f.match && (
                      <span className="text-[10px] opacity-70 px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-600/30">{f.match.game} {f.match.mode==='firstto'?'FT':'BO'} {f.match.value}{f.match.game==='X01' && f.match.startingScore ? ` · ${f.match.startingScore}`:''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {f.status==='ingame' && f.roomId && (
                      <button className="btn" onClick={()=>spectate(f.roomId!)}>Spectate</button>
                    )}
                    <button className="btn" disabled={loading || (f.status!=='online' && f.status!=='ingame')} onClick={async()=>{
                      setLoading(true)
                      try {
                        const res = await fetch('/api/friends/invite', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fromEmail: email, toEmail: f.email, game: 'X01', mode: 'bestof', value: 3, startingScore: 501 }) })
                        const data = await res.json().catch(()=>({}))
                        if (data?.delivered) toast('Invite sent', { type: 'success' })
                        else toast('Friend is offline; invite queued', { type: 'info' })
                      } finally { setLoading(false) }
                    }}>Invite</button>
                    <button className="btn" disabled={loading} onClick={async()=>{
                      const m = prompt('Message:')
                      if (!m) return
                      setLoading(true)
                      try {
                        await fetch('/api/friends/message', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fromEmail: email, toEmail: f.email, message: m }) })
                        toast('Message sent', { type: 'success' })
                      } finally { setLoading(false) }
                    }}>Message</button>
                    <button className="btn bg-rose-600 hover:bg-rose-700" disabled={loading} onClick={()=>removeFriend(f.email)}>Remove</button>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="text-sm opacity-70">No friends {filter !== 'all' ? `in ${filter}` : ''} yet.</li>
              )}
            </ul>
          )}
        </div>

        <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
          <div className="font-semibold mb-2 text-white/90">Find Friends</div>
          <input className="input w-full mb-2" placeholder="Search by name or email" value={q} onChange={e=>search(e.target.value)} />
          <ul className="space-y-1 mb-3 max-h-48 overflow-auto">
            {results.map(r => (
              <li key={r.email} className="flex items-center justify-between p-2 rounded bg-black/10">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${r.status==='online'?'bg-emerald-400':r.status==='ingame'?'bg-amber-400':'bg-slate-400'}`}></span>
                  <span>{r.username || r.email}</span>
                </div>
                <button className="btn" disabled={loading} onClick={()=>addFriend(r.email)}>Add</button>
              </li>
            ))}
            {results.length === 0 && <li className="text-xs opacity-60">Type to search…</li>}
          </ul>
          <div className="font-semibold mb-1 text-white/90">Suggested</div>
          <ul className="space-y-1 max-h-48 overflow-auto">
            {suggested.map(s => (
              <li key={s.email} className="flex items-center justify-between p-2 rounded bg-black/10">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${s.status==='online'?'bg-emerald-400':s.status==='ingame'?'bg-amber-400':'bg-slate-400'}`}></span>
                  <span>{s.username || s.email}</span>
                </div>
                <button className="btn" disabled={loading} onClick={()=>addFriend(s.email)}>Add</button>
              </li>
            ))}
            {suggested.length === 0 && <li className="text-xs opacity-60">No suggestions right now.</li>}
          </ul>
        </div>
      </div>

      {/* Direct Messages */}
      <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Messages</div>
          <button className="btn px-3 py-1 text-sm" onClick={()=>msgs.markAllRead()}>Mark all read</button>
        </div>
        {msgs.inbox.length === 0 ? (
          <div className="text-sm opacity-70">No messages yet.</div>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {msgs.inbox.map(m => (
              <li key={m.id} className="p-2 rounded bg-black/20 text-sm">
                <div className="flex items-center justify-between">
                  <div><span className="font-semibold">{m.from}</span> <span className="opacity-70 text-xs">· {new Date(m.ts).toLocaleString()}</span></div>
                  <div className="flex gap-2">
                    <button className="btn px-2 py-1 text-xs" onClick={async()=>{
                      const reply = prompt(`Reply to ${m.from}:`)
                      if (!reply) return
                      try {
                        await fetch('/api/friends/message', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fromEmail: email, toEmail: m.from, message: reply }) })
                        toast('Message sent', { type: 'success' })
                      } catch {}
                    }}>Reply</button>
                    <button className="btn bg-slate-700 hover:bg-slate-800 px-2 py-1 text-xs" title="Delete this message" onClick={()=>msgs.remove(m.id)}>Delete</button>
                    <button className="btn bg-rose-600 hover:bg-rose-700 px-2 py-1 text-xs" onClick={async()=>{
                      const reason = prompt('Report reason (what happened)?')
                      if (!reason) return
                      try {
                        await fetch('/api/friends/report', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reporterEmail: email, offenderEmail: m.from, reason, messageId: m.id }) })
                        toast('Report sent to admin', { type: 'info' })
                      } catch {}
                    }}>Report</button>
                  </div>
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words">{censorProfanity(m.message)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}