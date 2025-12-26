import { spawn } from 'child_process'
import WebSocket from 'ws'
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
      // Use the public tournaments list endpoint (no auth required) so we get JSON rather than SPA HTML
      const res = await fetch(`${BASE_URL}/api/tournaments`)
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) return true
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

describe('tournaments integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('owner create -> ADMIN override + WS broadcast', async () => {
  const port = 8800 + Math.floor(Math.random() * 1000)
  const BASE_URL = `http://127.0.0.1:${port}`
  const WS_URL = `ws://127.0.0.1:${port}/ws`
  const tmpDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'ndn-test-'))
  const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0', PORT: String(port), NDN_DATA_DIR: tmpDir, NDN_DEBUG: '1' }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', (d) => { serverStdout += d.toString() })
    server.stderr?.on('data', (d) => { serverStdout += d.toString() })
    // ensure server up
  const ok = await waitForServer(port, 20000)
    expect(ok).toBeTruthy()

    // Connect WebSocket and listen for tournaments broadcast
    const ws = new WebSocket(WS_URL)
  let msgTournaments: any = null
    await new Promise((res, rej) => {
      const timeout = setTimeout(() => rej(new Error('WS connect timeout')), 5000)
      ws.on('open', () => { clearTimeout(timeout); res(null) })
      ws.on('error', (err) => rej(err))
    })

    ws.on('message', (m) => {
      try {
        const data = JSON.parse(m.toString())
        if (data.type === 'tournaments') msgTournaments = data.tournaments || []
      } catch (e) {}
    })

    // Create a tournament as owner
    const body = {
      title: `Integration-${Date.now()}`,
      game: 'X01',
      mode: 'bestof',
      value: 1,
      startAt: Date.now() + 60 * 60 * 1000,
      checkinMinutes: 10,
      capacity: 8,
      creatorEmail: 'daviesfamily108@gmail.com',
      creatorName: 'ShouldBeAdmin',
      requesterEmail: 'daviesfamily108@gmail.com'
    }
    const resp = await fetch(`${BASE_URL}/api/tournaments/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await resp.json()
    expect(j.ok).toBeTruthy()
    expect(j.tournament).toBeTruthy()
    expect(String(j.tournament.creatorName).toUpperCase()).toBe('ADMIN')

  // Wait up to 3s for WS broadcast to include our id
    const tid = j.tournament.id
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      if (Array.isArray(msgTournaments) && msgTournaments.some((t: any) => t.id === tid)) break
      await new Promise(r => setTimeout(r, 100))
    }
    expect(msgTournaments && Array.isArray(msgTournaments)).toBeTruthy()
  expect(Array.isArray(msgTournaments) && msgTournaments.some((t: any) => t.id === tid)).toBeTruthy()

  // Confirm the tournament is visible via the HTTP API (source of truth for clients)
    const listResp = await fetch(`${BASE_URL}/api/tournaments`)
    const listJson = await listResp.json().catch(() => ({}))
    expect(listResp.ok).toBeTruthy()
    expect(Array.isArray(listJson.tournaments)).toBeTruthy()
    expect(listJson.tournaments.find((t: any) => t.id === tid)).toBeTruthy()

    // Test joining a tournament
    const joinResp = await fetch(`${BASE_URL}/api/tournaments/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: tid, email: 'player1@example.com', username: 'Player1' }) })
    const jJoin = await joinResp.json()
    expect(jJoin.ok).toBeTruthy()
    expect(jJoin.joined).toBeTruthy()

    // Wait briefly for WS broadcast about join
    const deadline2 = Date.now() + 3000
    let sawJoin = false
    while (Date.now() < deadline2) {
      if (Array.isArray(msgTournaments) && msgTournaments.some((t: any) => t.id === tid && Array.isArray(t.participants) && (t.participants as any[]).some((p: any) => p.email === 'player1@example.com'))) { sawJoin = true; break }
      await new Promise(r => setTimeout(r, 100))
    }
    expect(sawJoin).toBeTruthy()

    // Test admin broadcast endpoint triggers a broadcast
    const jwt = require('jsonwebtoken')
    const token = jwt.sign({ email: 'daviesfamily108@gmail.com' }, 'fallback-secret-change-in-production', { expiresIn: '100y' })
    // Clear msg and call broadcast
    msgTournaments = null
    const broRes = await fetch(`${BASE_URL}/api/admin/tournaments/broadcast`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const broJson = await broRes.json().catch(() => ({}))
    expect(broRes.ok).toBeTruthy()

    // Wait for broadcast to be received
    const deadline3 = Date.now() + 3000
    let sawBroadcast = false
    while (Date.now() < deadline3) {
      if (msgTournaments && Array.isArray(msgTournaments)) { sawBroadcast = true; break }
      await new Promise(r => setTimeout(r, 100))
    }
    expect(sawBroadcast).toBeTruthy()

    // Test leaving tournament
    const leaveResp = await fetch(`${BASE_URL}/api/tournaments/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: tid, email: 'player1@example.com' }) })
    const jLeave = await leaveResp.json()
    expect(jLeave.ok).toBeTruthy()
    expect(jLeave.left).toBeTruthy()

    // Cleanup
    ws.close()
    server.kill()
  }, 20000)
})
