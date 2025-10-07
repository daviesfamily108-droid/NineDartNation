import { useEffect, useState } from 'react'

const LS_KEY = 'ndn:isAdmin:v1'

type Cache = { [email: string]: { v: boolean; ts: number } }

function getCache(): Cache {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
function setCache(email: string, v: boolean) {
  try {
    const c = getCache()
    c[(email||'').toLowerCase()] = { v, ts: Date.now() }
    localStorage.setItem(LS_KEY, JSON.stringify(c))
  } catch {}
}

export async function fetchIsAdmin(email?: string|null): Promise<boolean> {
  const e = String(email || '').toLowerCase()
  if (!e) return false
  // try cache first (5 minutes)
  const c = getCache()
  const hit = c[e]
  if (hit && (Date.now() - hit.ts) < 5 * 60 * 1000) return !!hit.v
  try {
    const res = await fetch(`/api/admins/check?email=${encodeURIComponent(e)}`)
    const data = await res.json().catch(()=>({}))
    const v = !!data?.isAdmin
    setCache(e, v)
    return v
  } catch {
    return !!(hit?.v)
  }
}

export function useIsAdmin(email?: string|null) {
  const e = String(email || '').toLowerCase()
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let on = true
    if (!e) { setIsAdmin(false); return }
    fetchIsAdmin(e).then(v => { if (on) setIsAdmin(!!v) })
    return () => { on = false }
  }, [e])
  return isAdmin
}
