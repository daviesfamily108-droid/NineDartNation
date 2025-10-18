import { useEffect, useState } from 'react'
import { useIsAdmin } from '../utils/admin'

type Ready = { ok: boolean; ws?: boolean; rooms?: number; clients?: number; mem?: { rss: number; heapUsed: number } }

export default function OpsDashboard({ user }: { user: any }) {
  const isAdmin = useIsAdmin(user?.email)
  const [ready, setReady] = useState<Ready|null>(null)
  const [ann, setAnn] = useState<string>('')
  const [msg, setMsg] = useState<string>('')

  async function refresh() {
    try {
      const res = await fetch('/readyz')
      setReady(await res.json())
    } catch {}
  }
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [])

  if (!isAdmin) return (
    <div className="card">
      <h2 className="text-2xl font-bold text-brand-700 mb-2">Ops</h2>
      <div>Restricted</div>
    </div>
  )

  async function toggleMaintenance(enabled: boolean) {
    setMsg('')
    try {
      const res = await fetch('/api/admin/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, requesterEmail: user?.email }) })
      const j = await res.json()
      if (!res.ok || !j?.ok) setMsg(j?.error || 'Failed')
      else setMsg(`Maintenance ${enabled ? 'enabled' : 'disabled'}`)
    } catch { setMsg('Network error') }
  }

  async function announce() {
    setMsg('')
    const text = ann.trim()
    if (!text) return
    try {
      const res = await fetch('/api/admin/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, requesterEmail: user?.email }) })
      const j = await res.json()
      if (!res.ok || !j?.ok) setMsg(j?.error || 'Failed')
      else setMsg('Announcement broadcasted')
      setAnn('')
    } catch { setMsg('Network error') }
  }

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-brand-700 mb-2">Ops</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
          <div className="font-semibold mb-1">Readiness</div>
          <div className="text-sm">HTTP: <span className={`font-semibold ${ready?.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{String(!!ready?.ok)}</span></div>
          <div className="text-sm">WS: <span className={`font-semibold ${ready?.ws ? 'text-emerald-300' : 'text-rose-300'}`}>{String(!!ready?.ws)}</span></div>
          <div className="text-sm">Clients: <span className="font-semibold">{ready?.clients ?? 0}</span></div>
          <div className="text-sm">Rooms: <span className="font-semibold">{ready?.rooms ?? 0}</span></div>
          <div className="text-sm">Heap Used: <span className="font-semibold">{ready?.mem ? Math.round(ready.mem.heapUsed/1024/1024) : 0} MB</span></div>
        </div>
        <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
          <div className="font-semibold mb-1">Maintenance</div>
          <div className="flex gap-2">
            <button className="btn" onClick={()=>toggleMaintenance(true)}>Enable</button>
            <button className="btn bg-slate-700 hover:bg-slate-800" onClick={()=>toggleMaintenance(false)}>Disable</button>
          </div>
        </div>
        <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
          <div className="font-semibold mb-1">Announcement</div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Message to broadcast" value={ann} onChange={e=>setAnn(e.target.value)} />
            <button className="btn" onClick={announce}>Send</button>
          </div>
        </div>
      </div>
      {msg && <div className="text-xs mt-2">{msg}</div>}
      <div className="text-xs opacity-70 mt-2">✅ Clustering enabled! For 1.5k+ concurrent users, deploy behind a reverse proxy (NGINX/Cloudflare) with sticky sessions for WebSockets. Set NODE_WORKERS environment variable to control worker count.</div>
    </div>
  )
}
