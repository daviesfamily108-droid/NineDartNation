import { spawn } from 'child_process'
import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import { describe, test, expect } from 'vitest'

const SERVER_CMD = 'node'
const SERVER_ARGS = ['server/server.cjs']
const BASE_URL = 'http://127.0.0.1:8787'
const WS_URL = 'ws://127.0.0.1:8787/ws'

async function waitForServer(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) return true
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

describe('tournaments integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('owner create -> ADMIN override + WS broadcast', async () => {
    const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0' }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', (d) => { serverStdout += d.toString() })
    server.stderr?.on('data', (d) => { serverStdout += d.toString() })
    // ensure server up
  const ok = await waitForServer(20000)
    expect(ok).toBeTruthy()

    // Connect WebSocket and listen for tournaments broadcast
    const ws = new WebSocket(WS_URL)
  let msgTournaments: any[] | null = null
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
      if (msgTournaments && msgTournaments.find(t => t.id === tid)) break
      await new Promise(r => setTimeout(r, 100))
    }
    expect(msgTournaments && Array.isArray(msgTournaments)).toBeTruthy()
    expect(msgTournaments.find(t => t.id === tid)).toBeTruthy()

    // Confirm persisted file contains the tournament
    const dataFile = path.join(process.cwd(), 'server', 'data', 'tournaments.json')
  let persisted: any[] = []
    try { persisted = JSON.parse(fs.readFileSync(dataFile, 'utf8') || '[]') } catch (e) {}
    expect(Array.isArray(persisted)).toBeTruthy()
    expect(persisted.find(t => t.id === tid)).toBeTruthy()

    // Test joining a tournament
    const joinResp = await fetch(`${BASE_URL}/api/tournaments/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: tid, email: 'player1@example.com', username: 'Player1' }) })
    const jJoin = await joinResp.json()
    expect(jJoin.ok).toBeTruthy()
    expect(jJoin.joined).toBeTruthy()

    // Wait briefly for WS broadcast about join
    const deadline2 = Date.now() + 3000
    let sawJoin = false
    while (Date.now() < deadline2) {
      if (msgTournaments && msgTournaments.find(t => t.id === tid && t.participants && t.participants.find(p => p.email === 'player1@example.com'))) { sawJoin = true; break }
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
