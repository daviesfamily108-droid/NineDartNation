import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { describe, test, expect } from 'vitest'

const SERVER_CMD = 'node'
const SERVER_ARGS = ['server/server.cjs']

async function waitForServer(port: number, timeoutMs = 8000) {
  const BASE_URL = `http://127.0.0.1:${port}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // Use the explicit /health endpoint for a reliable readiness check.
      // Some server builds require auth for API endpoints (eg. /api/notifications/...),
      // so hitting /health is a safer way to determine the server is ready.
      const res = await fetch(`${BASE_URL}/health`)
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) return true
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

describe('notifications integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('basic create/get/patch/delete flow', async () => {
  const port = 8800 + Math.floor(Math.random() * 1000)
  const BASE_URL = `http://127.0.0.1:${port}`
  const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0', PORT: String(port), NDN_DATA_DIR: require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'ndn-test-')), NDN_DEBUG: '1' }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', (d) => { serverStdout += d.toString() })
    server.stderr?.on('data', (d) => { serverStdout += d.toString() })

  const ok = await waitForServer(port, 30000)
    if (!ok) {
      // Dump server stdout for debugging when the server doesn't respond in time
      throw new Error('Server health check failed; server logs:\n' + serverStdout)
    }
    // Wrap test in try/finally so we always print server logs and kill server for debugging
  try {
    // proceed with test
    expect(ok).toBeTruthy()

    const email = 'test-notify@example.com'
    const message = 'Your premium subscription expires in 3 days'

  // Helper: safely parse JSON or include text for debugging non-JSON responses
  async function getJsonOrText(res: Response) {
    const ct = res.headers.get('content-type') || ''
    const status = res.status
    const text = await res.text()
    if (!ct.includes('application/json')) throw new Error(`Non-JSON response (status=${status}): ${text}`)
    try { return JSON.parse(text) } catch (e) { throw new Error(`Invalid JSON (status=${status}): ${text}`) }
  }

  // Create notification - include an auth token for owner/admin
  const jwt = require('jsonwebtoken')
  const token = jwt.sign({ email: 'daviesfamily108@gmail.com' }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '100y' })
  const createRes = await fetch(`${BASE_URL}/api/notifications`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ email, message, type: 'sub_expiring' }) })
    const createJson = await getJsonOrText(createRes)
    expect(createJson.ok).toBeTruthy()

    // Fetch and expect to see a notification
  const listRes = await fetch(`${BASE_URL}/api/notifications?email=${encodeURIComponent(email)}`, { headers: { 'Authorization': `Bearer ${token}` } })
    const listJson = await listRes.json()
    expect(Array.isArray(listJson)).toBeTruthy()
    expect(listJson.length).toBeGreaterThan(0)
    const nid = listJson[0].id

  // Update (mark read)
  const patchRes = await fetch(`${BASE_URL}/api/notifications/${encodeURIComponent(nid)}?email=${encodeURIComponent(email)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ read: true }) })
    const patchJson = await patchRes.json()
    expect(patchJson.ok).toBeTruthy()

  const refetch = await fetch(`${BASE_URL}/api/notifications?email=${encodeURIComponent(email)}`, { headers: { 'Authorization': `Bearer ${token}` } })
    const refetchJson = await refetch.json()
    expect(refetchJson[0].read).toBeTruthy()

  // Delete notification
  const delRes = await fetch(`${BASE_URL}/api/notifications/${encodeURIComponent(nid)}?email=${encodeURIComponent(email)}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
    const delJson = await delRes.json()
    expect(delJson.ok).toBeTruthy()

  const afterDel = await fetch(`${BASE_URL}/api/notifications?email=${encodeURIComponent(email)}`, { headers: { 'Authorization': `Bearer ${token}` } })
    const afterDelJson = await afterDel.json()
    expect(Array.isArray(afterDelJson)).toBeTruthy()
    expect(afterDelJson.find((x: any) => x.id === nid)).toBeUndefined()

  } catch (err) {
    // rethrow after printing server logs for visibility
    console.error('Test error; server logs:\n', serverStdout)
    server.kill()
    throw err
  } finally {
    // Always show server logs and ensure process cleanup
    console.log('Server logs (end):\n', serverStdout)
    try { server.kill() } catch (e) {}
  }
  }, 60000)
})
