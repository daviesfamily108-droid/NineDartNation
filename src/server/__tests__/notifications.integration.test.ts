import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { describe, test, expect } from 'vitest'

const SERVER_CMD = 'node'
const SERVER_ARGS = ['server/server.cjs']
const BASE_URL = 'http://127.0.0.1:8787'

async function waitForServer(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/healthz`)
      if (res.ok) return true
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

describe('notifications integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('basic create/get/patch/delete flow', async () => {
    const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0' }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', (d) => { serverStdout += d.toString() })
    server.stderr?.on('data', (d) => { serverStdout += d.toString() })

    const ok = await waitForServer(20000)
    expect(ok).toBeTruthy()

    const email = 'test-notify@example.com'
    const message = 'Your premium subscription expires in 3 days'

  // Create notification - include an auth token for owner/admin
  const jwt = require('jsonwebtoken')
  const token = jwt.sign({ email: 'daviesfamily108@gmail.com' }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '100y' })
  const createRes = await fetch(`${BASE_URL}/api/notifications`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ email, message, type: 'sub_expiring' }) })
    const createJson = await createRes.json()
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

    server.kill()
  }, 20000)
})
