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
  // Immediate fallbacks: owner env or local override (dev)
  try {
    const owner = String((import.meta as any)?.env?.VITE_OWNER_EMAIL || '').toLowerCase()
    if (owner && e === owner) return true
  } catch {}
  try {
    const force = localStorage.getItem('ndn:forceAdmin')
    if (force === '1' || force === 'true') return true
  } catch {}
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
    // Instant fallbacks before API
    try {
      const owner = String((import.meta as any)?.env?.VITE_OWNER_EMAIL || '').toLowerCase()
      const force = ((): boolean => { try { const v = localStorage.getItem('ndn:forceAdmin'); return v === '1' || v === 'true' } catch { return false } })()
      if (owner && e === owner) { setIsAdmin(true); return }
      if (force) { setIsAdmin(true); return }
    } catch {}
    fetchIsAdmin(e).then(v => { if (on) setIsAdmin(!!v) })
    return () => { on = false }
  }, [e])
  return isAdmin
}
