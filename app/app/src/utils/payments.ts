export async function createUsernameChangeSession(email?: string) {
  const res = await fetch('/api/stripe/create-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const err = await res.json().catch(()=>null)
    throw new Error(err?.error || 'SESSION_FAILED')
  }
  const d = await res.json().catch(()=>null)
  if (!d?.ok || !d?.url) throw new Error('NO_URL')
  return d.url as string
}
