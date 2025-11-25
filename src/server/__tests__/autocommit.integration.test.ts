import { spawn } from 'child_process'
import WebSocket from 'ws'
import { describe, test, expect } from 'vitest'

const SERVER_CMD = 'node'
const SERVER_ARGS = ['server/server.cjs']
const BASE_URL = 'http://127.0.0.1:8787'
// We'll spawn server on a dynamic port per test to avoid conflicts
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

describe('server autocommit integration', () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === '1' || process.env.CI
  const maybeTest = shouldRun ? test : test.skip
  maybeTest('host enables autocommit and client auto-visit is broadcast', async () => {
  const port = 8800 + Math.floor(Math.random() * 1000)
  const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0', PORT: String(port) }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', d => serverStdout += d.toString())
    server.stderr?.on('data', d => serverStdout += d.toString())

  const ok = await waitForServer(port, 20000)
    expect(ok).toBeTruthy()

  const wsUrl = makeWsUrl(port)
  const hostWs = new WebSocket(wsUrl)
  const guestWs = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('WS connect timeout')), 5000)
      let hostOpen = false
      let guestOpen = false
      hostWs.on('open', () => { hostOpen = true; if (hostOpen && guestOpen) { clearTimeout(t); res(null) } })
      guestWs.on('open', () => { guestOpen = true; if (hostOpen && guestOpen) { clearTimeout(t); res(null) } })
      hostWs.on('error', rej)
      guestWs.on('error', rej)
    })

    // Setup message capture
    let hostMessages: any[] = []
    let guestMessages: any[] = []
    hostWs.on('message', m => { try { hostMessages.push(JSON.parse(m.toString())) } catch {} })
    guestWs.on('message', m => { try { guestMessages.push(JSON.parse(m.toString())) } catch {} })

    // Set presence (host email will be considered admin in demo server)
    hostWs.send(JSON.stringify({ type: 'presence', username: 'Alice', email: 'daviesfamily108@gmail.com' }))
    guestWs.send(JSON.stringify({ type: 'presence', username: 'Bob', email: 'bob@example.com' }))

    // Host creates match
    const createPayload = { type: 'create-match', game: 'X01', mode: 'firstto', value: 1, startingScore: 501 }
    hostWs.send(JSON.stringify(createPayload))

    // Wait for matches broadcast; find a match id created by host
  let matchId: string | null = null
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      const m = hostMessages.find((x:any) => x.type === 'matches')
      if (m && Array.isArray(m.matches) && m.matches.length > 0) {
        // Prefer match created by the host (creatorId equals host's ws id) else fallback to last
  const found = m.matches.find((mm: any) => String(mm.creatorName).toLowerCase() === 'alice')
        if (found && found.id) matchId = found.id
        else matchId = m.matches[m.matches.length - 1].id
        break
      }
      await new Promise(r => setTimeout(r, 100))
    }
    expect(matchId).toBeTruthy()
    const roomId = matchId as string

    // Both join the room
    hostWs.send(JSON.stringify({ type: 'join', roomId }))
    guestWs.send(JSON.stringify({ type: 'join', roomId }))

    // Wait for joined ack from server
    await new Promise((res) => {
      const deadline = Date.now() + 2000
      const check = () => {
        const hostJoined = hostMessages.some(m => m.type === 'joined' && m.roomId === roomId)
        const guestJoined = guestMessages.some(m => m.type === 'joined' && m.roomId === roomId)
        if (hostJoined && guestJoined) return res(null)
        if (Date.now() > deadline) return res(null)
        setTimeout(check, 50)
      }
      check()
    })

  // Wait briefly to ensure joins are processed
  await new Promise(r => setTimeout(r, 200))
  // Host toggles autocommit allowed true
  hostWs.send(JSON.stringify({ type: 'set-match-autocommit', roomId, allow: true }))

    // Wait for the match-autocommit-updated broadcast
  let sawAutocommitUpdate = false
  const deadline2 = Date.now() + 5000
    while (Date.now() < deadline2) {
      if (hostMessages.some(m => m.type === 'match-autocommit-updated' && m.roomId === roomId && m.allow === true)) { sawAutocommitUpdate = true; break }
      if (guestMessages.some(m => m.type === 'match-autocommit-updated' && m.roomId === roomId && m.allow === true)) { sawAutocommitUpdate = true; break }
      await new Promise(r => setTimeout(r, 100))
    }
    // If no update seen, print messages for debugging
    if (!sawAutocommitUpdate) {
      console.log('[DEBUG] hostMessages', JSON.stringify(hostMessages.slice(-50), null, 2))
      console.log('[DEBUG] guestMessages', JSON.stringify(guestMessages.slice(-50), null, 2))
      console.log('[DEBUG] serverStdout', serverStdout.slice(-1000))
    }
    expect(sawAutocommitUpdate).toBeTruthy()

    // Now guest attempts to send an auto-visit (should be accepted since room autocommit enabled)
    guestWs.send(JSON.stringify({ type: 'auto-visit', roomId, value: 60, darts: 3 }))

    // Both clients should receive visit-commit
    let sawVisitCommit = false
  const deadline3 = Date.now() + 5000
    while (Date.now() < deadline3) {
      if (hostMessages.some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawVisitCommit = true; break }
      if (guestMessages.some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawVisitCommit = true; break }
      await new Promise(r => setTimeout(r, 100))
    }
    expect(sawVisitCommit).toBeTruthy()

    // Ensure that non-authorised guest cannot toggle autocommit
    guestWs.send(JSON.stringify({ type: 'set-match-autocommit', roomId, allow: false }))
    // Wait briefly and ensure no update seen for allow=false
    await new Promise(r => setTimeout(r, 300))
    const falseUpdates = hostMessages.concat(guestMessages).filter(m => m.type === 'match-autocommit-updated' && m.roomId === roomId && m.allow === false)
    expect(falseUpdates.length).toBe(0)

    // cleanup - ensure server killed even on assertion failures
    try {
      hostWs.close()
      guestWs.close()
      server.kill()
    } catch (err) {
      try { hostWs.close() } catch {}
      try { guestWs.close() } catch {}
      try { server.kill() } catch {}
    }
  }, 20000)
})
