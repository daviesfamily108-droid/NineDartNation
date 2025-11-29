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
      // Some server builds require auth for API endpoints (eg. /api/wallet/...),
      // so hitting /health is a safer way to determine the server is ready.
      const res = await fetch(`${BASE_URL}/health`)
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) return true
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

describe('wallet integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('admin credit, user withdraw flow', async () => {
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
    expect(ok).toBeTruthy()
  try {
    // proceed with test

    const userEmail = 'wallet-test-user@example.com'
  const jwt = require('jsonwebtoken')
  const adminToken = jwt.sign({ email: 'daviesfamily108@gmail.com' }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '100y' })

    // helper to fetch and surface non-JSON responses for debugging
    async function fetchJson(url: string, opts?: any) {
      const res = await fetch(url, opts)
      const text = await res.text()
      try { return JSON.parse(text) } catch (e) {
        console.error('Non-JSON response for', url, 'status', res.status, 'body:', text)
        const err: any = new SyntaxError('Non-JSON response')
        err.status = res.status
        err.body = text
        throw err
      }
    }

    // Admin credit user
    const creditJson = await fetchJson(`${BASE_URL}/api/admin/wallet/credit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ email: userEmail, currency: 'USD', amount: '10.00' }) })
    expect(creditJson.ok).toBeTruthy()

    // Admin check balance
    const balRes = await fetch(`${BASE_URL}/api/wallet/balance?email=${encodeURIComponent(userEmail)}`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
  const balJson = await fetchJson(`${BASE_URL}/api/wallet/balance?email=${encodeURIComponent(userEmail)}`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
    expect(balJson.ok).toBeTruthy()
    expect(balJson.wallet.balances.USD).toBeGreaterThanOrEqual(1000)

    // Link payout method for user (admin action allowed)
    const linkRes = await fetch(`${BASE_URL}/api/wallet/link-card`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ email: userEmail, brand: 'Visa', last4: '1111' }) })
  const linkJson = await fetchJson(`${BASE_URL}/api/wallet/link-card`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ email: userEmail, brand: 'Visa', last4: '1111' }) })
    expect(linkJson.ok).toBeTruthy()

    // User requests withdrawal - simulate user token
    const userToken = jwt.sign({ email: userEmail }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '100y' })
    const withdrawRes = await fetch(`${BASE_URL}/api/wallet/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` }, body: JSON.stringify({ email: userEmail, currency: 'USD', amount: '5.00' }) })
  const withdrawJson = await fetchJson(`${BASE_URL}/api/wallet/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` }, body: JSON.stringify({ email: userEmail, currency: 'USD', amount: '5.00' }) })
    expect(withdrawJson.ok).toBeTruthy()
    expect(withdrawJson.request.status).toBe('paid')

    // Admin list withdrawals
    const listRes = await fetch(`${BASE_URL}/api/admin/wallet/withdrawals?requesterEmail=${encodeURIComponent('daviesfamily108@gmail.com')}`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
  const listJson = await fetchJson(`${BASE_URL}/api/admin/wallet/withdrawals?requesterEmail=${encodeURIComponent('daviesfamily108@gmail.com')}`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
    expect(listJson.ok).toBeTruthy()
    expect(Array.isArray(listJson.withdrawals)).toBeTruthy()

  } catch (err) {
    console.error('Test error; server logs:\n', serverStdout)
    server.kill()
    throw err
  } finally {
    console.log('Server logs (end):\n', serverStdout)
    try { server.kill() } catch (e) {}
  }
  }, 60000)
})
