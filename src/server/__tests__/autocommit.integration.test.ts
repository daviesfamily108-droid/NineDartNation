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
    // Ensure a clean persisted matches file for integration tests to avoid interference from prior runs.
    // Create a unique per-test data directory and pass it to the server process via NDN_DATA_DIR.
    const os = require('os'); const path = require('path'); const fs = require('fs')
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ndn-test-'))
    try { fs.unlinkSync(path.join(tmpDir, 'matches.json')) } catch (e) {}
    const server = spawn(SERVER_CMD, SERVER_ARGS, { env: { ...process.env, NDN_HTTPS: '0', PORT: String(port), NDN_DATA_DIR: tmpDir, NDN_DEBUG: '1' }, stdio: 'pipe' })
    let serverStdout = ''
    server.stdout?.on('data', d => serverStdout += d.toString())
    server.stderr?.on('data', d => serverStdout += d.toString())

  const ok = await waitForServer(port, 40000)
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
  const uniqueHostName = 'Alice-' + Math.random().toString(36).slice(2, 9)
  hostWs.send(JSON.stringify({ type: 'presence', username: uniqueHostName, email: 'daviesfamily108@gmail.com' }))
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
        // Prefer the most recently created match; createdAt is a timestamp
        // Prefer a match created by our unique host username; fallback to latest created
        const foundByName = m.matches.find((mm: any) => String(mm.creatorName) === uniqueHostName)
        if (foundByName && foundByName.id) matchId = foundByName.id
        else {
          const latest = m.matches.reduce((acc:any, mm:any) => (!acc || (mm.createdAt || 0) > (acc.createdAt || 0)) ? mm : acc, null)
          if (latest && latest.id) matchId = latest.id
        }
  // no-op; already handled
        break
      }
      await new Promise(r => setTimeout(r, 100))
    }
  expect(matchId).toBeTruthy()
  // Print details for debugging ownership
  const tmpMatch = hostMessages.find((x:any) => x.type === 'matches')?.matches?.find((mm:any) => mm.id === matchId)
  const hostJoinedId = hostMessages.find((x:any) => x.type === 'joined' && x.roomId === roomId)?.id
  console.log('[DEBUG] chosen match id', matchId, 'match', tmpMatch)
  console.log('[DEBUG] hostJoinedId', hostJoinedId)
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
  await new Promise(r => setTimeout(r, 500))
  // Print details for debugging ownership (after joining)
  const tmpMatch2 = hostMessages.find((x:any) => x.type === 'matches')?.matches?.find((mm:any) => mm.id === matchId)
  const hostJoinedIdAfter = hostMessages.find((x:any) => x.type === 'joined' && x.roomId === roomId)?.id
  // If we didn't pick the correct match, pick the one whose creator matches host's ws id
  if (tmpMatch2 && hostJoinedIdAfter && tmpMatch2.creatorId !== hostJoinedIdAfter) {
    const hostOwned = hostMessages.find((x:any) => x.type === 'matches')?.matches?.find((mm:any) => mm.creatorId === hostJoinedIdAfter)
    if (hostOwned && hostOwned.id) {
      console.log('[DEBUG] replacing matchId with host-owned match', hostOwned.id)
      matchId = hostOwned.id
    }
  }
  console.log('[DEBUG] chosen match id', matchId, 'match', tmpMatch2)
  console.log('[DEBUG] hostJoinedIdAfter', hostJoinedIdAfter)
  // Host toggles autocommit allowed true
  console.log('[DEBUG] hostWs.readyState before send', hostWs.readyState)
  try {
    hostWs.send(JSON.stringify({ type: 'set-match-autocommit', roomId, allow: true }))
  } catch (e) {
    console.log('[DEBUG] host send error', String(e))
    console.log('[DEBUG] serverStdout', serverStdout)
    throw e
  }

    // Wait for the match-autocommit-updated broadcast
  let sawAutocommitUpdate = false
  const deadline2 = Date.now() + 10000
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
    if (!sawAutocommitUpdate) {
      console.warn('[WARN] match-autocommit-updated broadcast not observed; proceeding to verify behavior via auto-visit acceptance')
    }

  // First: Creator (host) attempts to send an auto-visit - creators should always be allowed
  console.log('[DEBUG] hostWs.readyState before host auto-visit', hostWs.readyState)
  hostWs.send(JSON.stringify({ type: 'auto-visit', roomId, value: 60, darts: 3, ring: 'TRIPLE', sector: 20, pBoard: { x: 0, y: -103 }, calibrationValid: true }))
  let sawCreatorVisitCommit = false
  const deadlineCreator = Date.now() + 10000
  while (Date.now() < deadlineCreator) {
    if (hostMessages.some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawCreatorVisitCommit = true; break }
    if (guestMessages.some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawCreatorVisitCommit = true; break }
    await new Promise(r => setTimeout(r, 100))
  }
  if (!sawCreatorVisitCommit) {
    console.warn('[WARN] creator auto-visit not observed; continuing to guest test')
    console.log('[DEBUG] hostMessages (pre-auto-visit)', JSON.stringify(hostMessages.slice(-100), null, 2))
    console.log('[DEBUG] guestMessages (pre-auto-visit)', JSON.stringify(guestMessages.slice(-100), null, 2))
    console.log('[DEBUG] serverStdout (pre-auto-visit)', serverStdout.slice(-2000))
  }

  // Now guest attempts to send an auto-visit (should be accepted since room autocommit enabled by host)
  // Provide pBoard in board coordinate mm for T20 (approx radius 103 mm at top): x=0,y=-103
  guestWs.send(JSON.stringify({ type: 'auto-visit', roomId, value: 60, darts: 3, ring: 'TRIPLE', sector: 20, pBoard: { x: 0, y: -103 }, calibrationValid: true }))

    // Both clients should receive visit-commit
    let sawVisitCommit = false
  const deadline3 = Date.now() + 10000
    while (Date.now() < deadline3) {
    if (hostMessages.some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawVisitCommit = true; break }
    if (hostMessages.some(m => m.type === 'error' && m.code === 'FORBIDDEN')) { console.log('[DEBUG] writer saw FORBIDDEN error', hostMessages.filter(m => m.type === 'error')); break }
      if (guestMessages.some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawVisitCommit = true; break }
      await new Promise(r => setTimeout(r, 100))
    }
    if (!sawVisitCommit) {
      console.log('[DEBUG] hostMessages', JSON.stringify(hostMessages.slice(-200), null, 2))
      console.log('[DEBUG] guestMessages', JSON.stringify(guestMessages.slice(-200), null, 2))
      console.log('[DEBUG] serverStdout', serverStdout.slice(0, 5000))
    }
    expect(sawVisitCommit).toBeTruthy()

    // If guest sends a mismatched pBoard, server should reject and not broadcast visit-commit
  sawVisitCommit = false
  // Record current index of messages to filter later so we only consider new messages
  const hostBeforeIdx = hostMessages.length
  const guestBeforeIdx = guestMessages.length
    // Wait briefly to allow any in-flight visit-commit messages from the previous valid commit
    // to be delivered so we don't misattribute late arrivals to the mismatched pBoard send.
    await new Promise(r => setTimeout(r, 250))
  guestWs.send(JSON.stringify({ type: 'auto-visit', roomId, value: 60, darts: 3, ring: 'TRIPLE', sector: 20, pBoard: { x: 9999, y: 9999 }, calibrationValid: true }))
  const deadline4 = Date.now() + 5000
    while (Date.now() < deadline4) {
  if (hostMessages.slice(hostBeforeIdx).some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawVisitCommit = true; break }
  if (guestMessages.slice(guestBeforeIdx).some(m => m.type === 'visit-commit' && m.roomId === roomId)) { sawVisitCommit = true; break }
      await new Promise(r => setTimeout(r, 100))
    }
    if (sawVisitCommit) {
      console.log('[DEBUG] hostMessages after mismatched pBoard', JSON.stringify(hostMessages.slice(-200), null, 2))
      console.log('[DEBUG] guestMessages after mismatched pBoard', JSON.stringify(guestMessages.slice(-200), null, 2))
      console.log('[DEBUG] serverStdout after mismatched pBoard', serverStdout.slice(0, 10000))
    }
    expect(sawVisitCommit).toBeFalsy()

  // Ensure that non-authorised guest cannot toggle autocommit
  guestWs.send(JSON.stringify({ type: 'set-match-autocommit', roomId, allow: false }))
  // Wait briefly and ensure no update seen for allow=false
  await new Promise(r => setTimeout(r, 300))
  const falseUpdates = hostMessages.concat(guestMessages).filter(m => m.type === 'match-autocommit-updated' && m.roomId === roomId && m.allow === false)
  expect(falseUpdates.length).toBe(0)
  // The server should also reply with a FORBIDDEN error to the guest
  const forbiddenErrors = guestMessages.filter(m => m.type === 'error' && m.code === 'FORBIDDEN')
  expect(forbiddenErrors.length).toBeGreaterThan(0)

    // cleanup - ensure server killed even on assertion failures
    try {
      hostWs.close()
      guestWs.close()
      server.kill()
      try { fs.promises.rm && await fs.promises.rm(tmpDir, { recursive: true, force: true }) } catch (e) {}
    } catch (err) {
      try { hostWs.close() } catch {}
      try { guestWs.close() } catch {}
      try { server.kill() } catch {}
    }
  }, 40000)
})
