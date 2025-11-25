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

describe('wallet integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('admin credit, user withdraw flow', async () => {
    const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0' }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', (d) => { serverStdout += d.toString() })
    server.stderr?.on('data', (d) => { serverStdout += d.toString() })

    const ok = await waitForServer(20000)
    expect(ok).toBeTruthy()

    const userEmail = 'wallet-test-user@example.com'
    const jwt = require('jsonwebtoken')
    const adminToken = jwt.sign({ email: 'daviesfamily108@gmail.com' }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '100y' })

    // Admin credit user
    const creditRes = await fetch(`${BASE_URL}/api/admin/wallet/credit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ email: userEmail, currency: 'USD', amount: '10.00' }) })
    const creditJson = await creditRes.json()
    expect(creditJson.ok).toBeTruthy()

    // Admin check balance
    const balRes = await fetch(`${BASE_URL}/api/wallet/balance?email=${encodeURIComponent(userEmail)}`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
    const balJson = await balRes.json()
    expect(balJson.ok).toBeTruthy()
    expect(balJson.wallet.balances.USD).toBeGreaterThanOrEqual(1000)

    // Link payout method for user (admin action allowed)
    const linkRes = await fetch(`${BASE_URL}/api/wallet/link-card`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ email: userEmail, brand: 'Visa', last4: '1111' }) })
    const linkJson = await linkRes.json()
    expect(linkJson.ok).toBeTruthy()

    // User requests withdrawal - simulate user token
    const userToken = jwt.sign({ email: userEmail }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '100y' })
    const withdrawRes = await fetch(`${BASE_URL}/api/wallet/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` }, body: JSON.stringify({ email: userEmail, currency: 'USD', amount: '5.00' }) })
    const withdrawJson = await withdrawRes.json()
    expect(withdrawJson.ok).toBeTruthy()
    expect(withdrawJson.request.status).toBe('paid')

    // Admin list withdrawals
    const listRes = await fetch(`${BASE_URL}/api/admin/wallet/withdrawals?requesterEmail=${encodeURIComponent('daviesfamily108@gmail.com')}`, { headers: { 'Authorization': `Bearer ${adminToken}` } })
    const listJson = await listRes.json()
    expect(listJson.ok).toBeTruthy()
    expect(Array.isArray(listJson.withdrawals)).toBeTruthy()

    server.kill()
  }, 20000)
})
