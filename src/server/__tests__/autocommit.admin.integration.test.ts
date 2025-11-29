import { spawn } from 'child_process'
import WebSocket from 'ws'
import { describe, test, expect } from 'vitest'

const SERVER_CMD = 'node'
const SERVER_ARGS = ['server/server.cjs']

function makeWsUrl(port: number) { return `ws://127.0.0.1:${port}/ws` }

async function waitForServer(port: number, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return true
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

describe('admin autocommit integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('admin may toggle autocommit even when not match creator', async () => {
    const port = 8800 + Math.floor(Math.random() * 1000)
    const os = require('os'); const path = require('path'); const fs = require('fs')
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ndn-test-'))
    try { fs.unlinkSync(path.join(tmpDir, 'matches.json')) } catch (e) {}
    const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0', PORT: String(port), NDN_DATA_DIR: tmpDir, NDN_DEBUG: '1' }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', d => serverStdout += d.toString())
    server.stderr?.on('data', d => serverStdout += d.toString())

    const ok = await waitForServer(port, 20000)
    expect(ok).toBeTruthy()

    const wsUrl = makeWsUrl(port)
    const hostWs = new WebSocket(wsUrl)
    const adminWs = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('WS connect timeout')), 5000)
      let hostOpen = false
      let adminOpen = false
      hostWs.on('open', () => { hostOpen = true; if (hostOpen && adminOpen) { clearTimeout(t); res(null) } })
      adminWs.on('open', () => { adminOpen = true; if (hostOpen && adminOpen) { clearTimeout(t); res(null) } })
      hostWs.on('error', rej)
      adminWs.on('error', rej)
    })

    // Capture messages
    let hostMessages: any[] = []
    let adminMessages: any[] = []
    hostWs.on('message', m => { try { hostMessages.push(JSON.parse(m.toString())) } catch {} })
    adminWs.on('message', m => { try { adminMessages.push(JSON.parse(m.toString())) } catch {} })

    // Host presence (not admin) — create a match
    const uniqueHostName = 'Host-' + Math.random().toString(36).slice(2, 9)
    hostWs.send(JSON.stringify({ type: 'presence', username: uniqueHostName, email: 'host@example.com' }))
    adminWs.send(JSON.stringify({ type: 'presence', username: 'Owner', email: process.env.OWNER_EMAIL || 'daviesfamily108@gmail.com' }))

    hostWs.send(JSON.stringify({ type: 'create-match', game: 'X01', mode: 'firstto', value: 1, startingScore: 501 }))

    // Wait for match id
    let matchId: string | null = null
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      const m = hostMessages.find((x:any) => x.type === 'matches')
      if (m && Array.isArray(m.matches) && m.matches.length > 0) {
        const latest = m.matches.reduce((acc:any, mm:any) => (!acc || (mm.createdAt || 0) > (acc.createdAt || 0)) ? mm : acc, null)
        if (latest && latest.id) { matchId = latest.id; break }
      }
      await new Promise(r => setTimeout(r, 100))
    }
    expect(matchId).toBeTruthy()
    const roomId = matchId as string

    // Admin attempts to toggle autocommit
    adminWs.send(JSON.stringify({ type: 'set-match-autocommit', roomId, allow: true }))
    let sawAdminToggle = false
    const deadline2 = Date.now() + 3000
    while (Date.now() < deadline2) {
      if (adminMessages.some(m => m.type === 'match-autocommit-updated' && m.roomId === roomId && m.allow === true)) { sawAdminToggle = true; break }
      if (hostMessages.some(m => m.type === 'match-autocommit-updated' && m.roomId === roomId && m.allow === true)) { sawAdminToggle = true; break }
      await new Promise(r => setTimeout(r, 100))
    }
    if (!sawAdminToggle) {
      console.log('serverStdout', serverStdout.slice(-1000))
      console.log('hostMessages', JSON.stringify(hostMessages.slice(-100), null, 2))
      console.log('adminMessages', JSON.stringify(adminMessages.slice(-100), null, 2))
    }
    expect(sawAdminToggle).toBeTruthy()

    // Cleanup
    try {
      hostWs.close()
      adminWs.close()
      server.kill()
      try { fs.promises.rm && await fs.promises.rm(tmpDir, { recursive: true, force: true }) } catch (e) {}
    } catch (err) {
      try { hostWs.close() } catch {}
      try { adminWs.close() } catch {}
      try { server.kill() } catch {}
    }
  }, 20000)
})
