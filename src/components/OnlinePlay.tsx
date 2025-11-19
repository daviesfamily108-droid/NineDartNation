import { useEffect, useRef, useState } from 'react'
import { useMatch } from '../store/match'
import CameraView from './CameraView'
import CameraTile from './CameraTile'
import ResizablePanel from './ui/ResizablePanel'
import { suggestCheckouts, sayScore } from '../utils/checkout'
import { addSample, getAllTimeAvg } from '../store/profileStats'
import MatchStartShowcase from './ui/MatchStartShowcase'
import { getFreeRemaining, incOnlineUsage } from '../utils/quota'
import { useUserSettings } from '../store/userSettings'
import { useCalibration } from '../store/calibration'
import GameCalibrationStatus from './GameCalibrationStatus'
import MatchSummaryModal from './MatchSummaryModal'
import { freeGames, premiumGames, allGames, type GameKey } from '../utils/games'
import { getUserCurrency, formatPriceInCurrency } from '../utils/config'
import ResizableModal from './ui/ResizableModal'
import GameHeaderBar from './ui/GameHeaderBar'
import { useToast } from '../store/toast'
// import { TabKey } from './Sidebar'
import { useWS } from './WSProvider'
import { useMessages } from '../store/messages'
import { censorProfanity, containsProfanity } from '../utils/profanity'
import { useBlocklist } from '../store/blocklist'
import TabPills from './ui/TabPills'
import { DOUBLE_PRACTICE_ORDER, isDoubleHit, parseManualDart, ringSectorToDart } from '../game/types'
import { ATC_ORDER } from '../game/aroundTheClock'
import { createCricketState, applyCricketDart, CRICKET_NUMBERS, hasClosedAll as cricketClosedAll, cricketWinner } from '../game/cricket'
import { createShanghaiState, getRoundTarget as shanghaiTarget, applyShanghaiDart, endShanghaiTurn } from '../game/shanghai'
import { createDefaultHalveIt, getCurrentHalveTarget, applyHalveItDart, endHalveItTurn } from '../game/halveIt'
import { createHighLow, applyHighLowDart, endHighLowTurn } from '../game/highLow'
import { assignKillerNumbers, createKillerState, applyKillerDart, killerWinner } from '../game/killer'
import { apiFetch } from '../utils/api'
// Phase 2 premium games (Online support)
import { createAmCricketState, applyAmCricketDart, AM_CRICKET_NUMBERS } from '../game/americanCricket'
import { createBaseball, applyBaseballDart } from '../game/baseball'
import { createGolf, applyGolfDart, GOLF_TARGETS } from '../game/golf'
import { createTicTacToe, tryClaimCell, TTT_TARGETS } from '../game/ticTacToe'
import { useMatchControl } from '../store/matchControl'
import GameScoreboard from './scoreboards/GameScoreboard'
import { useOnlineGameStats } from './scoreboards/useGameStats'

export default function OnlinePlay({ user }: { user?: any }) {
  const API_URL = (import.meta as any).env?.VITE_API_URL || ''
  const toast = useToast();
  const wsGlobal = (() => { try { return useWS() } catch { return null } })()
  const blocklist = useBlocklist()
  const [roomId, setRoomId] = useState('room-1')
  const [connected, setConnected] = useState(false)
  const [chat, setChat] = useState<{from:string;message:string; fromId?: string}[]>([])
  const [showQuick, setShowQuick] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  // Track last locally-sent chat to avoid duplicating when the server echoes it back
  const lastSentChatRef = useRef<{ text: string; ts: number } | null>(null)
  const [selfId, setSelfId] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  // Reconnect handling
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const lastToastRef = useRef(0)
  const firstConnectDoneRef = useRef(false)
  const match = useMatch()
  const msgs = useMessages()
  const { favoriteDouble, callerEnabled, callerVoice, callerVolume, speakCheckoutOnly, allowSpectate, cameraScale, setCameraScale, cameraFitMode = 'fill', setCameraFitMode, cameraEnabled, textSize, boxSize, autoscoreProvider, matchType = 'singles', setMatchType, teamAName = 'Team A', setTeamAName, teamBName = 'Team B', setTeamBName, x01DoubleIn: defaultX01DoubleIn } = useUserSettings()
  const manualScoring = autoscoreProvider === 'manual'
  useEffect(() => {
    if (cameraFitMode !== 'fit') {
      setCameraFitMode('fit')
    }
  }, [cameraFitMode, setCameraFitMode])

  // Button size classes for toolbar buttons
  const getButtonSizeClasses = (size: string) => {
    switch (size) {
      case 'small': return 'px-1.5 py-0.5 text-xs'
      case 'large': return 'px-3 py-1 text-sm'
      default: return 'px-2 py-0.5 text-sm'
    }
  }
  const buttonSizeClass = getButtonSizeClasses(textSize)
  // Camera resize state
  const [cameraColSpan, setCameraColSpan] = useState(2)
  // Turn-by-turn modal
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [participants, setParticipants] = useState<string[]>([])
  const [turnIdx, setTurnIdx] = useState(0)
  const [visitScore, setVisitScore] = useState(0)
  // Double Practice (online) minimal state synchronized via WS state payload
  const [dpIndex, setDpIndex] = useState(0)
  const [dpHits, setDpHits] = useState(0)
  const [dpManual, setDpManual] = useState('')
  // Around the Clock (online) minimal state
  const [atcIndex, setAtcIndex] = useState(0)
  const [atcHits, setAtcHits] = useState(0)
  const [atcManual, setAtcManual] = useState('')
  // Treble Practice (online)
  const [trebleTarget, setTrebleTarget] = useState<number>(20)
  const [trebleHits, setTrebleHits] = useState<number>(0)
  const [trebleDarts, setTrebleDarts] = useState<number>(0)
  const [trebleManual, setTrebleManual] = useState<string>('')
  const [trebleMaxDarts, setTrebleMaxDarts] = useState<number>(30)
  // X01 Double-In per-match flag (synced over WS)
  const [x01DoubleInMatch, setX01DoubleInMatch] = useState<boolean>(false)
  // Mobile camera pairing
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  // Highlight auto-download UI
  const [highlightCandidate, setHighlightCandidate] = useState<any | null>(null)
  const [showHighlightModal, setShowHighlightModal] = useState(false)

  // Download highlight to device as a JSON file
  function downloadHighlightToDevice() {
    if (!highlightCandidate) return
    try {
      const blob = new Blob([JSON.stringify(highlightCandidate, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const name = `ndn-highlight-${highlightCandidate.player || 'player'}-${highlightCandidate.ts || Date.now()}.json`
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
  toast?.('Downloaded highlight to device', { type: 'success' })
      setShowHighlightModal(false)
    } catch (err) {
  toast?.('Download failed', { type: 'error' })
    }
  }

  async function saveHighlightToAccount() {
    if (!highlightCandidate) return
    const token = localStorage.getItem('authToken')
  if (!token) { toast?.('You must be signed in to save to account', { type: 'error' }); return }
    try {
      const res = await apiFetch('/api/user/highlights', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(highlightCandidate) })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
  toast?.(`Save failed: ${j.error || res.statusText}`, { type: 'error' })
        return
      }
      const j = await res.json()
  toast?.('Saved highlight to your account', { type: 'success' })
      setShowHighlightModal(false)
    } catch (err) {
  toast?.('Save failed', { type: 'error' })
    }
  }
  // WebRTC for mobile camera
  const [mobileStream, setMobileStream] = useState<MediaStream | null>(null)
  const mobileVideoRef = useRef<HTMLVideoElement>(null)
  // Tic Tac Toe manual input
  const [tttManual, setTttManual] = useState('')
  // Per-player states for premium games
  const [cricketById, setCricketById] = useState<Record<string, ReturnType<typeof createCricketState>>>({})
  const [shanghaiById, setShanghaiById] = useState<Record<string, ReturnType<typeof createShanghaiState>>>({})
  const [halveById, setHalveById] = useState<Record<string, ReturnType<typeof createDefaultHalveIt>>>({})
  const [highlowById, setHighlowById] = useState<Record<string, ReturnType<typeof createHighLow>>>({})
  const [killerById, setKillerById] = useState<Record<string, ReturnType<typeof createKillerState>>>({})
  const [amCricketById, setAmCricketById] = useState<Record<string, ReturnType<typeof createAmCricketState>>>({})
  const [baseballById, setBaseballById] = useState<Record<string, ReturnType<typeof createBaseball>>>({})
  const [golfById, setGolfById] = useState<Record<string, ReturnType<typeof createGolf>>>({})
  const [ttt, setTTT] = useState<ReturnType<typeof createTicTacToe>>(() => createTicTacToe())
  // Track darts this turn for non-X01 games to auto-advance after 3
  const [turnDarts, setTurnDarts] = useState(0)
  // Pause state (synced over WS)
  const [paused, setPausedLocal] = useState<boolean>(false)
  const [pauseRequestedBy, setPauseRequestedBy] = useState<string | null>(null)
  const [pauseAcceptedBy, setPauseAcceptedBy] = useState<Record<string, boolean>>({})
  const [pauseEndsAt, setPauseEndsAt] = useState<number | null>(null)
  const [pauseDurationSec, setPauseDurationSec] = useState<number>(300)
  const setPausedGlobal = useMatchControl(s => s.setPaused)
  // View mode: compact player-by-player (mobile) vs full overview (desktop)
  const [compactView, setCompactView] = useState<boolean>(() => {
    try { const ua = navigator.userAgent || ''; return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) } catch { return false }
  })
  // Online end-of-match summary modal (appears when inProgress flips from true->false)
  const [showX01EndSummary, setShowX01EndSummary] = useState(false)
  const endSummaryPrevRef = useRef<boolean>(!!useMatch.getState().inProgress)
  const [showStartShowcase, setShowStartShowcase] = useState(false)
  const startedShowcasedRef = useRef(false)
  useEffect(() => {
    const prev = endSummaryPrevRef.current
    const now = !!match.inProgress
    if (prev && !now) {
      const hasFinished = (match.players || []).some(p => (p.legs||[]).some(L => L.finished))
      if (hasFinished) setShowX01EndSummary(true)
    }
    endSummaryPrevRef.current = now
    // Reset the showcased flag when match ends
    if (!now) startedShowcasedRef.current = false
    // When match starts, show the start showcase once
    if (now && !startedShowcasedRef.current) {
      startedShowcasedRef.current = true
      setShowStartShowcase(true)
    }
  }, [match.inProgress, match.players])
  // Dev-only: auto-simulate a short X01 leg to validate double-out stats via ?autotest=doubleout
  useEffect(() => {
    try {
      if (!(import.meta as any).env?.DEV) return
      const q = new URLSearchParams(window.location.search)
      if (q.get('autotest') !== 'doubleout') return
      // Prevent re-run on HMR
      if ((window as any).__NDN_AUTO_TESTED__) return
      ;(window as any).__NDN_AUTO_TESTED__ = true
      // Create simple 101 match and simulate visits:
      // You: 41 (attempts=0) -> Opp: 26 -> You: 10 (cross into window; attempts=1) -> Opp: 26 -> You: 40 finish on D20 (attempts=1, finishedByDouble=true)
      match.newMatch([user?.username || 'You', 'Opponent'], 101, 'local-dev')
      // You visit 1: 41 (no attempts yet)
      match.addVisit(41, 3, { preOpenDarts: 0, doubleWindowDarts: 0, finishedByDouble: false, visitTotal: 41 })
      match.nextPlayer()
      // Opponent visit: dummy 26
      match.addVisit(26, 3, { preOpenDarts: 0, doubleWindowDarts: 0, finishedByDouble: false, visitTotal: 26 })
      match.nextPlayer()
      // You visit 2: 10 (enters window, attempts=1)
      match.addVisit(10, 3, { preOpenDarts: 0, doubleWindowDarts: 1, finishedByDouble: false, visitTotal: 10 })
      match.nextPlayer()
      // Opponent visit: dummy 26
      match.addVisit(26, 3, { preOpenDarts: 0, doubleWindowDarts: 0, finishedByDouble: false, visitTotal: 26 })
      match.nextPlayer()
      // You visit 3: 40 (D20) finish inside window, attempts=1, hit=1
      match.addVisit(40, 1, { preOpenDarts: 0, doubleWindowDarts: 1, finishedByDouble: true, visitTotal: 40 })
      match.endLeg(40)
      match.endGame()
      // Modal will auto-open via inProgress flip hook
    } catch {}
  }, [])
  // Build doubles stats (double-out only) for summary modal
  const doublesStats = (() => {
    const out: Record<string, { dartsAtDouble?: number; doublesHit?: number }> = {}
    for (const p of (match.players || [])) {
      let attempts = 0
      let hits = 0
      for (const L of (p.legs || [])) {
        for (const v of (L.visits || [])) {
          attempts += Math.max(0, Number(v.doubleWindowDarts || 0))
          if (v.finishedByDouble) hits += 1
        }
      }
      out[p.id] = { dartsAtDouble: attempts, doublesHit: hits }
    }
    return out
  })()
  // Ephemeral celebration overlay (e.g., 180), tied to the current player's turn
  const [celebration, setCelebration] = useState<null | { kind: '180' | 'leg'; by: string; turnIdx: number; ts: number }>(null)
  const lastCelebrationRef = useRef<{ kind: '180'|'leg'; by: string; ts: number } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  // Auto-unpause when timer elapses
  useEffect(() => {
    if (!paused || !pauseEndsAt) return
    const id = setInterval(() => {
      if (Date.now() >= (pauseEndsAt || 0)) {
        setPausedLocal(false)
        setPauseRequestedBy(null)
        setPauseAcceptedBy({})
        setPauseEndsAt(null)
        setPausedGlobal(false, null)
        sendState()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [paused, pauseEndsAt])
  function ensureAudio() {
    try {
      if (!audioCtxRef.current) {
        const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext
        if (Ctor) audioCtxRef.current = new Ctor()
      }
      audioCtxRef.current?.resume?.().catch(()=>{})
    } catch {}
  }
  function beep(freq: number, durMs: number, whenS = 0, gain = 0.05) {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.value = gain
    o.connect(g)
    g.connect(ctx.destination)
    const now = ctx.currentTime + whenS
    o.start(now)
    o.stop(now + durMs / 1000)
  }
  function playSting(kind: '180'|'leg') {
    ensureAudio()
    const ctx = audioCtxRef.current
    if (!ctx) return
    if (kind === '180') {
      beep(880, 110, 0, 0.06); beep(1175, 110, 0.06, 0.06); beep(1568, 140, 0.12, 0.06)
    } else {
      beep(659, 140, 0, 0.07); beep(784, 140, 0.08, 0.07); beep(987, 200, 0.16, 0.07)
    }
  }
  function triggerCelebration(kind: '180'|'leg', who: string) {
    const now = Date.now()
    const last = lastCelebrationRef.current
    if (last && last.kind === kind && last.by === who && (now - last.ts) < 500) return
    lastCelebrationRef.current = { kind, by: who, ts: now }
    setCelebration({ kind, by: who, turnIdx: match.currentPlayerIdx, ts: now })
    playSting(kind)
  }
  // Lobby & create-match state
  const [showCreate, setShowCreate] = useState(false)
  const [lobby, setLobby] = useState<any[]>([])
  const [mode, setMode] = useState<'bestof'|'firstto'>('bestof')
  const [modeValue, setModeValue] = useState<number>(5)
  const [startScore, setStartScore] = useState<number>(501)
  const [pendingInvite, setPendingInvite] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  // Stripe checkout error handler
  function handleStripeError(msg: string) {
    setErrorMsg(msg || 'Failed to create Stripe checkout session. Please try again later.')
    setTimeout(() => setErrorMsg(''), 4000)
    try { toast(msg || 'Stripe checkout failed', { type: 'error' }) } catch {}
  }
  const [lastJoinIntent, setLastJoinIntent] = useState<any | null>(null)
  const [offerNewRoom, setOfferNewRoom] = useState<null | { game: string; mode: 'bestof'|'firstto'; value: number; startingScore?: number }>(null)
  // Game selection
  const [game, setGame] = useState<GameKey>('X01')
  const [currentGame, setCurrentGame] = useState<GameKey>('X01')
  const [requireCalibration, setRequireCalibration] = useState<boolean>(false)
  // Create-match: Treble Practice specific setting
  const [createTrebleMaxDarts, setCreateTrebleMaxDarts] = useState<number>(30)
  // Create-match: X01 Double-In per-match toggle (prefilled from Settings)
  const [createX01DoubleIn, setCreateX01DoubleIn] = useState<boolean>(!!defaultX01DoubleIn)
  const freeLeft = user?.username && !user?.fullAccess ? getFreeRemaining(user.username) : Infinity
  const locked = !user?.fullAccess && (freeLeft <= 0)
  // World Lobby filters
  const [filterMode, setFilterMode] = useState<'all'|'bestof'|'firstto'>('all')
  const [filterStart, setFilterStart] = useState<'all'|301|501|701>('all')
  const [filterGame, setFilterGame] = useState<'all'|GameKey>('all')
  const [nearAvg, setNearAvg] = useState(false)
  const [avgTolerance, setAvgTolerance] = useState<number>(10)
  const { H: calibH } = useCalibration()
  const myAvg = user?.username ? getAllTimeAvg(user.username) : 0
  const unread = useMessages(s => s.unread)
  const filteredLobby = (lobby || []).filter((m:any) => {
    if (filterMode !== 'all' && m.mode !== filterMode) return false
    if (filterStart !== 'all' && Number(m.startingScore) !== Number(filterStart)) return false
    if (filterGame !== 'all' && m.game !== filterGame) return false
    if (nearAvg) {
      if (!myAvg || !m.creatorAvg) return false
      const diff = Math.abs(Number(m.creatorAvg) - Number(myAvg))
      if (diff > avgTolerance) return false
    }
    return true
  })

  // Removed tournaments banner from Online; tournaments live in Tournaments tab only

  // Demo: prefill Create Match modal from URL (ndn:online-demo)
  useEffect(() => {
    const handler = (e: any) => {
      const d = e?.detail || {}
      if (d.game) setGame(d.game)
      if (d.mode === 'bestof' || d.mode === 'firstto') setMode(d.mode)
      if (typeof d.value === 'number' && isFinite(d.value)) setModeValue(Math.max(1, Math.floor(d.value)))
      if (typeof d.start === 'number' && isFinite(d.start)) setStartScore(Math.max(1, Math.floor(d.start)))
      setShowCreate(true)
    }
    window.addEventListener('ndn:online-demo', handler as any)
    return () => window.removeEventListener('ndn:online-demo', handler as any)
  }, [])

  // Load inbox on mount for the current user
  useEffect(() => {
    const email = String(user?.email || '').toLowerCase()
    if (!email) return
    apiFetch(`/api/friends/messages?email=${encodeURIComponent(email)}`).then(r=>r.json()).then(d=>{
      if (d?.ok && Array.isArray(d.messages)) msgs.load(d.messages)
    }).catch(()=>{})
  }, [user?.email])

  // Demo: open a populated Online Match view with fake data (local-only)
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const d = e?.detail || {}
        const start = Number(d.start || 501)
        // Create a quick local match with two players
        match.newMatch([user?.username || 'You', 'Opponent'], start, roomId)
        // Seed a few visits to populate UI
        match.addVisit(60, 3) // You
        match.nextPlayer()
        match.addVisit(85, 3) // Opponent
        match.nextPlayer()
        match.addVisit(100, 3) // You
        setCurrentGame('X01')
        setShowMatchModal(true)
      } catch (err) {
        console.error('Demo error:', err)
      }
    }
    window.addEventListener('ndn:online-match-demo', handler as any)
    return () => window.removeEventListener('ndn:online-match-demo', handler as any)
  }, [])

  useEffect(() => {
    // Auto-connect on mount and enable auto-reconnect
    shouldReconnectRef.current = true
    connect()
    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current) }
      try { wsRef.current?.close() } catch {}
    }
  }, [])

  // Track in-game flag in messages store
  useEffect(() => {
    msgs.setInGame(match.inProgress)
  }, [match.inProgress])

  // Clear celebration as soon as turn advances to the next player
  useEffect(() => {
    if (celebration && match.currentPlayerIdx !== celebration.turnIdx) {
      setCelebration(null)
    }
  }, [match.currentPlayerIdx, celebration?.turnIdx])

  // If the user changes the spectate preference, push updated presence to the server
  useEffect(() => {
    try {
      if (wsGlobal && wsGlobal.connected) {
        wsGlobal.send({ type: 'presence', username: user?.username || 'guest', email: (user?.email||'').toLowerCase(), allowSpectate })
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'presence', username: user?.username || 'guest', email: (user?.email||'').toLowerCase(), allowSpectate }))
      }
    } catch {}
  }, [allowSpectate, wsGlobal?.connected])

  // Spectator flow: listen to spectate events from Friends and join room as readonly
  useEffect(() => {
    const onSpectate = (e: any) => {
      const rid = e?.detail?.roomId
      if (!rid) return
      setRoomId(rid)
      // send spectate message
      if (wsGlobal) wsGlobal.send({ type: 'spectate', roomId: rid })
      else wsRef.current?.send(JSON.stringify({ type: 'spectate', roomId: rid }))
      setShowMatchModal(true)
      setShowCreate(false)
    }
    window.addEventListener('ndn:spectate-room', onSpectate as any)
    return () => window.removeEventListener('ndn:spectate-room', onSpectate as any)
  }, [wsGlobal])

  function connect() {
    if (wsGlobal) {
      // If global provider exists, rely on it for connection and just send initial commands
      if (wsGlobal.connected) {
        wsGlobal.send({ type: 'join', roomId })
  wsGlobal.send({ type: 'presence', username: user?.username || 'guest', email: (user?.email||'').toLowerCase(), allowSpectate })
        wsGlobal.send({ type: 'list-matches' })
        setConnected(true)
      }
      return
    }
    // Avoid duplicate sockets
    try { if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return } catch {}
  const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
  const proto = (window.location.protocol === 'https:' ? 'wss' : 'ws')
  const host = window.location.hostname
  const fallback = `${proto}://${host}${window.location.port ? '' : ':8787'}`
  const url = envUrl && typeof envUrl === 'string' && envUrl.length > 0 ? envUrl : fallback
  const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onopen = () => {
      setConnected(true)
      // Reset backoff
      reconnectAttemptsRef.current = 0
      if (!firstConnectDoneRef.current) {
        toast('Connected to lobby', { type: 'success' })
        firstConnectDoneRef.current = true
      } else {
        toast('Reconnected to lobby', { type: 'success' })
      }
    ws.send(JSON.stringify({ type: 'join', roomId }))
    // send presence
  ws.send(JSON.stringify({ type: 'presence', username: user?.username || 'guest', email: (user?.email||'').toLowerCase(), allowSpectate }))
      // fetch current lobby
      ws.send(JSON.stringify({ type: 'list-matches' }))
    }
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data)
      if (data.type === 'state') {
        match.importState(data.payload)
        // Pull Double Practice progress if present
        const di = Number((data.payload as any)._dpIndex)
        const dh = Number((data.payload as any)._dpHits)
        if (Number.isFinite(di)) setDpIndex(Math.max(0, di))
        if (Number.isFinite(dh)) setDpHits(Math.max(0, dh))
        // Pull Around the Clock progress if present
        const ai = Number((data.payload as any)._atcIndex)
        const ah = Number((data.payload as any)._atcHits)
        if (Number.isFinite(ai)) setAtcIndex(Math.max(0, ai))
        if (Number.isFinite(ah)) setAtcHits(Math.max(0, ah))
        // Pull Treble Practice progress if present
        try {
          const tt = Number((data.payload as any)._trebleTarget)
          const th = Number((data.payload as any)._trebleHits)
          const td = Number((data.payload as any)._trebleDarts)
          const tmax = Number((data.payload as any)._trebleMaxDarts)
          if (Number.isFinite(tt)) setTrebleTarget(Math.max(1, Math.min(20, tt)))
          if (Number.isFinite(th)) setTrebleHits(Math.max(0, th))
          if (Number.isFinite(td)) setTrebleDarts(Math.max(0, td))
          if (Number.isFinite(tmax)) setTrebleMaxDarts(Math.max(0, tmax))
        } catch {}
        // Premium per-player states
        try {
          const _cr = (data.payload as any)._cricketById
          if (_cr && typeof _cr === 'object') setCricketById(_cr)
        } catch {}
        try {
          const _sh = (data.payload as any)._shanghaiById
          if (_sh && typeof _sh === 'object') setShanghaiById(_sh)
        } catch {}
        try {
          const _hv = (data.payload as any)._halveById
          if (_hv && typeof _hv === 'object') setHalveById(_hv)
        } catch {}
        try {
          const _hl = (data.payload as any)._highlowById
          if (_hl && typeof _hl === 'object') setHighlowById(_hl)
        } catch {}
        try {
          const _kr = (data.payload as any)._killerById
          if (_kr && typeof _kr === 'object') setKillerById(_kr)
        } catch {}
        try { const _am = (data.payload as any)._amCricketById; if (_am && typeof _am === 'object') setAmCricketById(_am) } catch {}
        try { const _bb = (data.payload as any)._baseballById; if (_bb && typeof _bb === 'object') setBaseballById(_bb) } catch {}
        try { const _gf = (data.payload as any)._golfById; if (_gf && typeof _gf === 'object') setGolfById(_gf) } catch {}
        try { const _tt = (data.payload as any)._tttState; if (_tt && typeof _tt === 'object') setTTT(_tt) } catch {}
        try {
          const _td = Number((data.payload as any)._turnDarts)
          if (Number.isFinite(_td)) setTurnDarts(Math.max(0, _td))
        } catch {}
        // Pull X01 Double-In per-match if present
        try {
          const _di = (data.payload as any)._x01DoubleIn
          if (typeof _di === 'boolean') setX01DoubleInMatch(_di)
        } catch {}
      } else if (data.type === 'joined') {
        // joined room; keep our assigned id to label messages
        if (data.id) setSelfId(data.id)
      } else if (data.type === 'presence' || data.type === 'peer-joined') {
        // Maintain a simple list of participant ids. In a real app we would map id->username.
        setParticipants(prev => {
          const set = new Set(prev)
          if (data.id) set.add(data.id)
          return Array.from(set)
        })
      } else if (data.type === 'chat') {
        const isSelf = !!(data.from && selfId && data.from === selfId)
        const label = isSelf ? (user?.username || 'me') : (data.from || 'peer')
        const idKey = String(data.from || '')
        // Skip messages from blocked senders (only applies to non-self)
        if (!isSelf && idKey && blocklist.isBlocked(idKey)) return
        // De-dupe if this is our own recently-sent quick message already appended locally
        if (isSelf && lastSentChatRef.current && String(data.message||'') === lastSentChatRef.current.text) {
          // Clear marker and do not append again
          lastSentChatRef.current = null
          return
        }
        setChat(prev => [...prev, { from: label, message: data.message, fromId: idKey || undefined }])
      } else if (data.type === 'matches') {
        setLobby(Array.isArray(data.matches) ? data.matches : [])
      } else if (data.type === 'invite') {
        setPendingInvite({ matchId: data.matchId, fromId: data.fromId, fromName: data.fromName, calibrated: !!data.calibrated, boardPreview: data.boardPreview || null, game: data.game, mode: data.mode, value: data.value, startingScore: data.startingScore })
      } else if (data.type === 'match-start') {
        // Both parties received a room id to join
        setRoomId(data.roomId)
        // Auto-join the room
        ws.send(JSON.stringify({ type: 'join', roomId: data.roomId }))
        setShowMatchModal(true)
        setShowCreate(false)
        if (data.match?.game) setCurrentGame(data.match.game)
        // Consume a free game for non-premium users
        if (user?.username && !user?.fullAccess) {
          incOnlineUsage(user.username)
        }
      } else if (data.type === 'declined') {
        toast('Invite declined', { type: 'info' })
      } else if (data.type === 'error') {
        const msg = typeof data.message === 'string' ? data.message : 'Action not allowed'
        setErrorMsg(msg)
        if (data.code === 'SPECTATE_NOT_ALLOWED') {
          try { toast('This player has spectating turned off.', { type: 'error' }) } catch {}
        }
        if (data.code === 'NOT_FOUND' && lastJoinIntent) {
          setOfferNewRoom({
            game: lastJoinIntent.game,
            mode: lastJoinIntent.mode,
            value: lastJoinIntent.value,
            startingScore: lastJoinIntent.startingScore,
          })
        }
        // auto-clear after a bit
        setTimeout(()=>setErrorMsg(''), 3500)
      } else if (data.type === 'friend-invite') {
        const accept = confirm(`${data.fromName || data.fromEmail} invited you to play ${data.game || 'X01'} (${data.mode==='firstto'?'First To':'Best Of'} ${data.value||1}). Accept?`)
        if (accept) {
          ws.send(JSON.stringify({ type: 'start-friend-match', toEmail: data.fromEmail, game: data.game, mode: data.mode, value: data.value, startingScore: data.startingScore }))
        } else {
          toast('Invite declined', { type: 'info' })
        }
      } else if (data.type === 'friend-message') {
        msgs.add({ id: data.id || `${data.ts}-${data.from}`, from: data.from, message: data.message, ts: data.ts || Date.now() })
        // Show toast only if not currently in a game
        if (!match.inProgress) toast(`${data.from}: ${data.message}`, { type: 'info' })
      } else if (data.type === 'celebration') {
        const who = data.by || 'Player'
        const kind = data.kind === 'leg' ? 'leg' : '180'
        triggerCelebration(kind, who)
      } else if (data.type === 'cam-code') {
        console.log('Received cam-code:', data.code)
        setPairingCode(data.code)
        toast(`Pairing code: ${data.code}`, { type: 'info' })
      } else if (data.type === 'cam-peer-joined') {
        console.log('Mobile peer joined for code:', data.code)
        // Mobile camera connected, start WebRTC
        startMobileWebRTC(data.code)
      } else if (data.type === 'cam-answer') {
        console.log('Received cam-answer')
        const pc = (window as any).mobilePC
        if (pc) pc.setRemoteDescription(new RTCSessionDescription(data.payload))
      } else if (data.type === 'cam-ice') {
        console.log('Received cam-ice')
        const pc = (window as any).mobilePC
        if (pc) pc.addIceCandidate(data.payload)
      }
    }
    ws.onclose = () => {
      setConnected(false)
      // Auto-reconnect with exponential backoff
      if (!shouldReconnectRef.current) return
      const attempt = (reconnectAttemptsRef.current || 0) + 1
      reconnectAttemptsRef.current = attempt
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1))
      const now = Date.now()
      if (now - lastToastRef.current > 4000) {
        toast(`Disconnected. Reconnecting in ${Math.round(delay/1000)}s...`, { type: 'error' })
        lastToastRef.current = now
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(() => {
        connect()
      }, delay)
    }
  }
  // Small helper to render the match summary card
  function RenderMatchSummary() {
    const players = match.players || []
    const curIdx = match.currentPlayerIdx || 0
    const cur = players[curIdx]
    const leg = cur?.legs?.[cur?.legs?.length - 1]
    const remaining = leg ? leg.totalScoreRemaining : match.startingScore
    // TV-style 3-dart average: sum points across all legs / total darts * 3
    const totals = (() => {
      let pts = 0, darts = 0
      if (cur?.legs) {
        for (const L of cur.legs) {
          // Points: sum of scored points this leg
          pts += (L.totalScoreStart - L.totalScoreRemaining)
          // Darts: sum visits darts, subtract pre-open darts (Double-In) if any
          const legDarts = (L.visits || []).reduce((a, v) => a + (v.darts || 0) - (v.preOpenDarts || 0), 0)
          darts += legDarts
        }
      }
      return { pts, darts }
    })()
    const avg3 = totals.darts > 0 ? ((totals.pts / totals.darts) * 3) : 0
    const lastScore = leg?.visits?.[leg.visits.length-1]?.score ?? 0
    let matchScore = 'ÔÇö'
    if (players.length === 2) {
      matchScore = `${players[0]?.legsWon || 0}-${players[1]?.legsWon || 0}`
    } else if (players.length > 2) {
      matchScore = players.map(p => `${p.name}:${p.legsWon||0}`).join(' = ')
    }
    const best = match.bestLegThisMatch
    const bestText = best ? `${best.darts} darts${(() => { const p = players.find(x=>x.id===best.playerId); return p?` (${p.name})`:'' })()}` : '-'
    
    // Text size classes
    const getTextSizeClasses = (size: string) => {
      switch (size) {
        case 'small': return 'text-xs'
        case 'large': return 'text-base'
        default: return 'text-sm'
      }
    }
    const textSizeClass = getTextSizeClasses(textSize)
    
    // Box size classes
    const getBoxSizeClasses = (size: string) => {
      switch (size) {
        case 'small': return 'p-2'
        case 'large': return 'p-4'
        default: return 'p-3'
      }
    }
    const boxSizeClass = getBoxSizeClasses(boxSize)
    
    return (
      <div className={`${boxSizeClass} rounded-2xl bg-slate-900/40 border border-white/10 text-white ${textSizeClass}`}>
        <div className="font-semibold mb-2">Match Summary</div>
        <div className="grid grid-cols-2 gap-y-1">
          <div className="opacity-80">Current score</div>
          <div className="font-mono text-right">{matchScore}</div>
          <div className="opacity-80">Current thrower</div>
          <div className="text-right font-semibold">{cur?.name || 'ÔÇö'}</div>
          <div className="opacity-80">Score remaining</div>
          <div className="text-right font-mono font-bold text-lg">{remaining}</div>
          <div className="opacity-80">3-dart avg</div>
          <div className="text-right font-mono">{avg3.toFixed(1)}</div>
          <div className="opacity-80">Last score</div>
          <div className="text-right font-mono">{lastScore}</div>
          <div className="opacity-80">Best leg</div>
          <div className="text-right">{bestText}</div>
        </div>
      </div>
    )
  }

  

  // Subscribe to global WS messages if available
  useEffect(() => {
    if (!wsGlobal) return
    setConnected(wsGlobal.connected)
    const unsub = wsGlobal.addListener((data) => {
      try {
        if (data.type === 'state') {
          match.importState(data.payload)
          // Pull synchronized premium states (when using WS provider)
          try {
            const di = Number((data.payload as any)._dpIndex); const dh = Number((data.payload as any)._dpHits)
            if (Number.isFinite(di)) setDpIndex(Math.max(0, di))
            if (Number.isFinite(dh)) setDpHits(Math.max(0, dh))
          } catch {}
          try {
            const ai = Number((data.payload as any)._atcIndex); const ah = Number((data.payload as any)._atcHits)
            if (Number.isFinite(ai)) setAtcIndex(Math.max(0, ai))
            if (Number.isFinite(ah)) setAtcHits(Math.max(0, ah))
          } catch {}
          try { const _cr = (data.payload as any)._cricketById; if (_cr && typeof _cr === 'object') setCricketById(_cr) } catch {}
          try { const _sh = (data.payload as any)._shanghaiById; if (_sh && typeof _sh === 'object') setShanghaiById(_sh) } catch {}
          try { const _hv = (data.payload as any)._halveById; if (_hv && typeof _hv === 'object') setHalveById(_hv) } catch {}
          try { const _hl = (data.payload as any)._highlowById; if (_hl && typeof _hl === 'object') setHighlowById(_hl) } catch {}
          try { const _kr = (data.payload as any)._killerById; if (_kr && typeof _kr === 'object') setKillerById(_kr) } catch {}
          // Phase 2
          try { const _am = (data.payload as any)._amCricketById; if (_am && typeof _am === 'object') setAmCricketById(_am) } catch {}
          try { const _bb = (data.payload as any)._baseballById; if (_bb && typeof _bb === 'object') setBaseballById(_bb) } catch {}
          try { const _gf = (data.payload as any)._golfById; if (_gf && typeof _gf === 'object') setGolfById(_gf) } catch {}
          try { const _tt = (data.payload as any)._tttState; if (_tt && typeof _tt === 'object') setTTT(_tt) } catch {}
          try { const _td = Number((data.payload as any)._turnDarts); if (Number.isFinite(_td)) setTurnDarts(Math.max(0, _td)) } catch {}
          // Pause sync
          try { const _paused = !!(data.payload as any)._paused; setPausedLocal(_paused); } catch {}
          try { const _pEnds = Number((data.payload as any)._pauseEndsAt); setPauseEndsAt(Number.isFinite(_pEnds) ? _pEnds : null) } catch {}
          try { const _pBy = (data.payload as any)._pauseRequestedBy; setPauseRequestedBy(typeof _pBy === 'string' ? _pBy : null) } catch {}
          try { const _acc = (data.payload as any)._pauseAcceptedBy; if (_acc && typeof _acc === 'object') setPauseAcceptedBy(_acc) } catch {}
          try { const _dur = Number((data.payload as any)._pauseDurationSec); if (Number.isFinite(_dur)) setPauseDurationSec(Math.max(60, Math.min(600, _dur))) } catch {}
      // X01 Double-In per-match
      try { const _di = (data.payload as any)._x01DoubleIn; if (typeof _di === 'boolean') setX01DoubleInMatch(_di) } catch {}
          // Update global pause store
          setPausedGlobal(!!(data.payload as any)._paused, Number((data.payload as any)._pauseEndsAt) || null)
        } else if (data.type === 'joined') {
          if (data.id) setSelfId(data.id)
        } else if (data.type === 'presence' || data.type === 'peer-joined') {
          setParticipants(prev => Array.from(new Set([...(prev||[]), data.id].filter(Boolean))))
        } else if (data.type === 'chat') {
          const isSelf = !!(data.from && selfId && data.from === selfId)
          const label = isSelf ? (user?.username || 'me') : (data.from || 'peer')
          const idKey = String(data.from || '')
          if (!isSelf && idKey && blocklist.isBlocked(idKey)) return
          setChat(prev => [...prev, { from: label, message: data.message, fromId: idKey || undefined }])
        } else if (data.type === 'matches') {
          setLobby(Array.isArray(data.matches) ? data.matches : [])
        } else if (data.type === 'invite') {
          setPendingInvite({ matchId: data.matchId, fromId: data.fromId, fromName: data.fromName, calibrated: !!data.calibrated, boardPreview: data.boardPreview || null, game: data.game, mode: data.mode, value: data.value, startingScore: data.startingScore })
        } else if (data.type === 'match-start') {
          setRoomId(data.roomId)
          wsGlobal.send({ type: 'join', roomId: data.roomId })
          setShowMatchModal(true)
          setShowCreate(false)
          if (data.match?.game) setCurrentGame(data.match.game)
          if (user?.username && !user?.fullAccess) {
            incOnlineUsage(user.username)
          }
        } else if (data.type === 'declined') {
          toast('Invite declined', { type: 'info' })
        } else if (data.type === 'error') {
          const msg = typeof data.message === 'string' ? data.message : 'Action not allowed'
          setErrorMsg(msg)
          if (data.code === 'SPECTATE_NOT_ALLOWED') {
            try { toast('This player has spectating turned off.', { type: 'error' }) } catch {}
          }
          if (data.code === 'NOT_FOUND' && lastJoinIntent) {
            setOfferNewRoom({
              game: lastJoinIntent.game,
              mode: lastJoinIntent.mode,
              value: lastJoinIntent.value,
              startingScore: lastJoinIntent.startingScore,
            })
          }
          setTimeout(()=>setErrorMsg(''), 3500)
        } else if (data.type === 'friend-invite') {
          const accept = confirm(`${data.fromName || data.fromEmail} invited you to play ${data.game || 'X01'} (${data.mode==='firstto'?'First To':'Best Of'} ${data.value||1}). Accept?`)
          if (accept) {
            wsGlobal.send({ type: 'start-friend-match', toEmail: data.fromEmail, game: data.game, mode: data.mode, value: data.value, startingScore: data.startingScore })
          } else {
            toast('Invite declined', { type: 'info' })
          }
        } else if (data.type === 'friend-message') {
          msgs.add({ id: data.id || `${data.ts}-${data.from}`, from: data.from, message: data.message, ts: data.ts || Date.now() })
          if (!match.inProgress) toast(`${data.from}: ${data.message}`, { type: 'info' })
        } else if (data.type === 'celebration') {
          const who = data.by || 'Player'
          const kind = data.kind === 'leg' ? 'leg' : '180'
          triggerCelebration(kind, who)
        }
      } catch {}
    })
    // On connect, join and load lobby
    if (wsGlobal.connected) {
      wsGlobal.send({ type: 'join', roomId })
  wsGlobal.send({ type: 'presence', username: user?.username || 'guest', email: (user?.email||'').toLowerCase(), allowSpectate })
      wsGlobal.send({ type: 'list-matches' })
    }
    return () => { unsub() }
  }, [wsGlobal?.connected])

  function sendState() {
    if (wsGlobal) {
  wsGlobal.send({ type: 'state', payload: { ...match, _turnIdx: turnIdx, _participants: participants, _dpIndex: dpIndex, _dpHits: dpHits, _atcIndex: atcIndex, _atcHits: atcHits, _trebleTarget: trebleTarget, _trebleHits: trebleHits, _trebleDarts: trebleDarts, _trebleMaxDarts: trebleMaxDarts, _x01DoubleIn: x01DoubleInMatch, _cricketById: cricketById, _shanghaiById: shanghaiById, _halveById: halveById, _highlowById: highlowById, _killerById: killerById, _amCricketById: amCricketById, _baseballById: baseballById, _golfById: golfById, _tttState: ttt, _turnDarts: turnDarts, _paused: paused, _pauseEndsAt: pauseEndsAt, _pauseRequestedBy: pauseRequestedBy, _pauseAcceptedBy: pauseAcceptedBy, _pauseDurationSec: pauseDurationSec } })
      return
    }
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'state', payload: { ...match, _turnIdx: turnIdx, _participants: participants, _dpIndex: dpIndex, _dpHits: dpHits, _atcIndex: atcIndex, _atcHits: atcHits, _trebleTarget: trebleTarget, _trebleHits: trebleHits, _trebleDarts: trebleDarts, _trebleMaxDarts: trebleMaxDarts, _x01DoubleIn: x01DoubleInMatch, _cricketById: cricketById, _shanghaiById: shanghaiById, _halveById: halveById, _highlowById: highlowById, _killerById: killerById, _amCricketById: amCricketById, _baseballById: baseballById, _golfById: golfById, _tttState: ttt, _turnDarts: turnDarts, _paused: paused, _pauseEndsAt: pauseEndsAt, _pauseRequestedBy: pauseRequestedBy, _pauseAcceptedBy: pauseAcceptedBy, _pauseDurationSec: pauseDurationSec } }))
  }

  function sendQuick(msg: string) {
    const label = user?.username || 'me'
    // Optimistically append locally for snappy UX
    setChat(prev => [...prev, { from: label, message: msg, fromId: selfId || 'self' }])
    lastSentChatRef.current = { text: msg, ts: Date.now() }
    if (wsGlobal) {
      wsGlobal.send({ type: 'chat', message: msg })
      return
    }
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'chat', message: msg }))
  }

  // Double Practice handlers
  function addDpValue(dart: number) {
    const hit = isDoubleHit(dart, dpIndex)
    if (hit) {
      const newHits = dpHits + 1
      const nextIdx = dpIndex + 1
      setDpHits(newHits)
      setDpIndex(nextIdx)
      // Celebrate completion locally
      try {
        if (newHits >= DOUBLE_PRACTICE_ORDER.length) {
          const who = match.players[match.currentPlayerIdx]?.name || 'Player'
          triggerCelebration('leg', who)
          // Reset for another round
          setDpHits(0)
          setDpIndex(0)
        }
      } catch {}
    }
    // Sync to peers
    sendState()
  }
  function addDpNumeric() {
    const v = Math.max(0, Math.floor(visitScore|0))
    addDpValue(v)
    setVisitScore(0)
  }
  function addDpManual() {
    const val = parseManualDart(dpManual)
    if (val == null) return
    addDpValue(val)
    setDpManual('')
  }

  // Around the Clock handlers
  function isAtcHit(val: number, ring?: 'MISS'|'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const target = ATC_ORDER[atcIndex]
    if (target == null) return false
    if (typeof sector === 'number' && sector >= 1 && sector <= 20) {
      if (sector === target && (ring === 'SINGLE' || ring === 'DOUBLE' || ring === 'TRIPLE')) return true
    }
    if (target === 25) {
      return ring === 'BULL' || val === 25
    }
    if (target === 50) {
      return ring === 'INNER_BULL' || val === 50
    }
    return val === target || val === target * 2 || val === target * 3
  }
  function addAtcValue(val: number, ring?: 'MISS'|'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    if (isAtcHit(val, ring, sector)) {
      const newHits = atcHits + 1
      const nextIdx = atcIndex + 1
      setAtcHits(newHits)
      setAtcIndex(nextIdx)
      try {
        if (newHits >= ATC_ORDER.length) {
          const who = match.players[match.currentPlayerIdx]?.name || 'Player'
          triggerCelebration('leg', who)
          setAtcHits(0)
          setAtcIndex(0)
        }
      } catch {}
    }
    sendState()
  }
  function addAtcNumeric() {
    const v = Math.max(0, Math.floor(visitScore|0))
    addAtcValue(v)
    setVisitScore(0)
  }
  function addAtcManual() {
    const val = parseManualDart(atcManual)
    if (val == null) return
    addAtcValue(val)
    setAtcManual('')
  }

  // Treble Practice handlers
  function addTrebleValue(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    // Stop counting beyond configured throws
    if (trebleMaxDarts > 0 && trebleDarts >= trebleMaxDarts) return
    const hit = (ring === 'TRIPLE' && sector === trebleTarget) || (!ring && value === trebleTarget * 3)
    if (hit) setTrebleHits(h => h + 1)
    setTrebleDarts(d => {
      const nd = d + 1
      // Auto-rotate T20→T19→T18 every 3 darts
      if (nd % 3 === 0 && [20,19,18].includes(trebleTarget)) {
        const cycle = [20,19,18]
        const idx = cycle.indexOf(trebleTarget)
        const next = cycle[(idx + 1) % cycle.length]
        setTrebleTarget(next)
      }
      return nd
    })
    sendState()
  }
  function addTrebleNumeric() {
    const v = Math.max(0, Math.floor(visitScore|0))
    // No ring info, rely on numeric value only
    addTrebleValue(v)
    setVisitScore(0)
  }
  function addTrebleManual() {
    const val = parseManualDart(trebleManual)
    if (val == null) return
    addTrebleValue(val)
    setTrebleManual('')
  }
  function resetTreble() { setTrebleHits(0); setTrebleDarts(0) }

  // Helpers for premium modes
  function currentPlayerId(): string {
    const p = match.players[match.currentPlayerIdx]
    return p?.id ?? String(match.currentPlayerIdx)
  }
  // Ensure state exists for a given player id
  function ensureCricket(pid: string) {
    if (!cricketById[pid]) setCricketById(s => ({ ...s, [pid]: createCricketState() }))
  }
  function ensureShanghai(pid: string) {
    if (!shanghaiById[pid]) setShanghaiById(s => ({ ...s, [pid]: createShanghaiState() }))
  }
  function ensureHalve(pid: string) {
    if (!halveById[pid]) setHalveById(s => ({ ...s, [pid]: createDefaultHalveIt() }))
  }
  function ensureHighLow(pid: string) {
    if (!highlowById[pid]) setHighlowById(s => ({ ...s, [pid]: createHighLow() }))
  }
  function ensureKiller(pid: string) {
    if (!killerById[pid]) {
      // If any existing assignments, pick the highest density or default to pid index
      const used = new Set<number>(Object.values(killerById || {}).map(s => s.number))
      const pool: number[] = []
      for (let i=1;i<=20;i++){ if (!used.has(i)) pool.push(i) }
      const num = pool.length>0 ? pool[Math.floor(Math.random()*pool.length)] : 20
      setKillerById(s => ({ ...s, [pid]: createKillerState(num, 3) }))
    }
  }
  function ensureAmCricket(pid: string) {
    if (!amCricketById[pid]) setAmCricketById(s => ({ ...s, [pid]: createAmCricketState() }))
  }
  function ensureBaseball(pid: string) {
    if (!baseballById[pid]) setBaseballById(s => ({ ...s, [pid]: createBaseball() }))
  }
  function ensureGolf(pid: string) {
    if (!golfById[pid]) setGolfById(s => ({ ...s, [pid]: createGolf() }))
  }
  // Resets darts count on player change for non-X01 games
  useEffect(() => { setTurnDarts(0) }, [match.currentPlayerIdx, currentGame])

  // Compute whether all opponents have closed a cricket number
  function allOpponentsClosed(num: 15|16|17|18|19|20|25, selfId: string): boolean {
    const opps = match.players.filter(p => p.id !== selfId)
    if (opps.length === 0) return false
    return opps.every(p => (cricketById[p.id]?.marks?.[num] || 0) >= 3)
  }

  function applyCricketAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const pid = currentPlayerId()
    ensureCricket(pid)
    setCricketById(prev => {
      const copy = { ...prev }
      const st = { ...(copy[pid] || createCricketState()) }
      const pts = applyCricketDart(st, value, ring, sector, (n)=>allOpponentsClosed(n, pid))
      copy[pid] = st
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) {
      // end turn
      setTurnDarts(0)
      match.nextPlayer(); sendState()
    } else { sendState() }
  }

  function applyShanghaiAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const pid = currentPlayerId()
    ensureShanghai(pid)
    setShanghaiById(prev => {
      const copy = { ...prev }
      const st = { ...(copy[pid] || createShanghaiState()) }
      applyShanghaiDart(st, value, ring, sector)
      copy[pid] = st
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) {
      setShanghaiById(prev => {
        const copy = { ...prev }
        const st = { ...(copy[pid] || createShanghaiState()) }
        endShanghaiTurn(st)
        copy[pid] = st
        return copy
      })
      setTurnDarts(0)
      match.nextPlayer(); sendState()
    } else { sendState() }
  }

  function applyHalveAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const pid = currentPlayerId()
    ensureHalve(pid)
    setHalveById(prev => {
      const copy = { ...prev }
      const st = { ...(copy[pid] || createDefaultHalveIt()) }
      applyHalveItDart(st, value, ring, sector)
      copy[pid] = st
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) {
      setHalveById(prev => {
        const copy = { ...prev }
        const st = { ...(copy[pid] || createDefaultHalveIt()) }
        endHalveItTurn(st)
        copy[pid] = st
        return copy
      })
      setTurnDarts(0)
      match.nextPlayer(); sendState()
    } else { sendState() }
  }

  function applyHighLowAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const pid = currentPlayerId()
    ensureHighLow(pid)
    setHighlowById(prev => {
      const copy = { ...prev }
      const st = { ...(copy[pid] || createHighLow()) }
      applyHighLowDart(st, value, ring, sector)
      copy[pid] = st
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) {
      setHighlowById(prev => {
        const copy = { ...prev }
        const st = { ...(copy[pid] || createHighLow()) }
        endHighLowTurn(st)
        copy[pid] = st
        return copy
      })
      setTurnDarts(0)
      match.nextPlayer(); sendState()
    } else { sendState() }
  }

  function applyKillerAuto(ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const pid = currentPlayerId()
    // Ensure every player has an assignment before applying
    match.players.forEach(p => ensureKiller(p.id))
    setKillerById(prev => {
      const copy: Record<string, ReturnType<typeof createKillerState>> = {}
      for (const [id, st] of Object.entries(prev)) copy[id] = { ...st }
      const res = applyKillerDart(pid, copy, ring, sector)
      // Trigger simple winner check
      const win = killerWinner(copy)
      if (win) {
        try { triggerCelebration('leg', match.players.find(p=>p.id===win)?.name || 'Player') } catch {}
      }
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) { setTurnDarts(0); match.nextPlayer(); sendState() } else { sendState() }
  }

  function applyAmCricketAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const pid = currentPlayerId()
    ensureAmCricket(pid)
    setAmCricketById(prev => {
      const copy = { ...prev }
      const base = (copy[pid] || createAmCricketState())
      const st: ReturnType<typeof createAmCricketState> = { ...(base as any) }
      const oppClosed = (n: 12|13|14|15|16|17|18|19|20|25) => match.players.filter(p=>p.id!==pid).every(p => (((amCricketById[p.id]?.marks as any)?.[n]||0) >= 3))
      applyAmCricketDart(st, value, ring, sector, oppClosed)
      copy[pid] = st
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) { setTurnDarts(0); match.nextPlayer(); sendState() } else { sendState() }
  }

  function applyBaseballAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE', sector?: number | null) {
    const pid = currentPlayerId()
    ensureBaseball(pid)
    setBaseballById(prev => {
      const copy = { ...prev }
      const st = { ...(copy[pid] || createBaseball()) }
      applyBaseballDart(st, value, ring as any, sector)
      copy[pid] = st
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) { setTurnDarts(0); match.nextPlayer(); sendState() } else { sendState() }
  }

  function applyGolfAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE', sector?: number | null) {
    const pid = currentPlayerId()
    ensureGolf(pid)
    setGolfById(prev => {
      const copy = { ...prev }
      const st = { ...(copy[pid] || createGolf()) }
      applyGolfDart(st, value, ring as any, sector)
      copy[pid] = st
      return copy
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) { setTurnDarts(0); match.nextPlayer(); sendState() } else { sendState() }
  }

  function applyTttAuto(cell: number, value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setTTT(prev => {
      const cp = { ...prev, board: [...prev.board] as any }
      tryClaimCell(cp as any, (cell as any), value, ring as any, sector)
      return cp as any
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) { setTurnDarts(0); match.nextPlayer(); sendState() } else { sendState() }
  }

  // Open/close Manual Correction dialog in CameraView
  function openManual() { try { window.dispatchEvent(new Event('ndn:open-manual' as any)) } catch {} }
  function closeManual() { try { window.dispatchEvent(new Event('ndn:close-manual' as any)) } catch {} }

  // Helper to submit a manual visit with shared logic
  function submitVisitManual(v: number) {
    const score = Math.max(0, v | 0)
    // Estimate double-out attempts and finish for manual numeric entry
    try {
      const p = match.players[match.currentPlayerIdx]
      const leg = p?.legs?.[p.legs.length - 1]
      const preRem = leg ? leg.totalScoreRemaining : match.startingScore
      const postRem = Math.max(0, preRem - score)
      const attempts = preRem <= 50 ? 3 : (postRem <= 50 ? 1 : 0)
      const finished = postRem === 0
      match.addVisit(score, 3, { preOpenDarts: 0, doubleWindowDarts: attempts, finishedByDouble: finished, visitTotal: score })
    } catch {
      match.addVisit(score, 3)
    }
    setVisitScore(0)
    const p = match.players[match.currentPlayerIdx]
    const leg = p.legs[p.legs.length - 1]
    // Instant celebration locally
    try {
      if (score === 180) triggerCelebration('180', p?.name || 'Player')
      if (leg && leg.totalScoreRemaining === 0) triggerCelebration('leg', p?.name || 'Player')
    } catch {}
    if (leg && leg.totalScoreRemaining === 0) { match.endLeg(score) } else { match.nextPlayer() }
    if (callerEnabled) {
      const rem = leg ? leg.totalScoreRemaining : match.startingScore
      sayScore(user?.username || 'Player', score, Math.max(0, rem), callerVoice, { volume: callerVolume, checkoutOnly: speakCheckoutOnly })
    }
    if (user?.username && p?.name === user.username) { addSample(user.username, 3, score) }
    sendState()
  }

  function reportMessage(offenderId: string | null, text: string) {
    const payload: any = { type: 'report', offenderId, reason: 'Inappropriate language', message: text }
    try { if (wsGlobal) wsGlobal.send(payload); else wsRef.current?.send(JSON.stringify(payload)) } catch {}
    try { toast('Report submitted', { type: 'info' }) } catch {}
  }

  function isMobileLike() {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  }

  // Try to take a quick camera snapshot to show to the match creator (non-blocking)
  async function getBoardPreview(): Promise<string | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      const track = stream.getVideoTracks?.()[0]
      // Create a hidden video element to draw a frame
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play().catch(()=>{})
      // Wait a moment for first frame
      await new Promise(r => setTimeout(r, 120))
      const w = Math.min(320, video.videoWidth || 320)
      const h = Math.max(1, Math.floor((video.videoHeight || 180) * (w / Math.max(1, video.videoWidth || 320))))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0, w, h)
      const url = canvas.toDataURL('image/jpeg', 0.7)
      // Cleanup
      try { if (track) track.stop() } catch {}
      try { (stream as any).getTracks?.().forEach((t:any)=>t.stop()) } catch {}
      return url
    } catch {
      return null
    }
  }

  // WebRTC for mobile camera
  const startMobileWebRTC = async (code: string) => {
    console.log('Starting WebRTC for code:', code)
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pc.ontrack = (event) => {
        console.log('Received track:', event.streams[0])
        setMobileStream(event.streams[0])
        if (mobileVideoRef.current) {
          mobileVideoRef.current.srcObject = event.streams[0]
          console.log('Set video srcObject')
        }
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate')
          if (wsGlobal) {
            wsGlobal.send({ type: 'cam-ice', code, payload: event.candidate })
          } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'cam-ice', code, payload: event.candidate }))
          }
        }
      }
      pc.onconnectionstatechange = () => console.log('Connection state:', pc.connectionState)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      console.log('Sending offer')
      // Try WebSocket first, otherwise fall back to REST POST
      if (wsGlobal) {
        console.log('Sending offer via wsGlobal')
        wsGlobal.send({ type: 'cam-offer', code, payload: offer })
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('Sending offer via wsRef')
        wsRef.current.send(JSON.stringify({ type: 'cam-offer', code, payload: offer }))
      } else {
        console.log('WS not available, POSTing offer to /cam/signal')
        try {
          await apiFetch(`/cam/signal/${code}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'cam-offer', payload: offer, source: 'desktop' }) })
        } catch (e) { console.warn('REST offer failed', e) }
      }
      // Store pc for later use
      (window as any).mobilePC = pc
    } catch (err) {
      console.error('WebRTC error:', err)
      toast('Failed to start mobile camera', { type: 'error' })
    }
  }

  return (
    <div className="card ndn-game-shell relative overflow-hidden">
      {showStartShowcase && <MatchStartShowcase players={match.players || []} onDone={() => setShowStartShowcase(false)} />}
      <h2 className="text-xl font-semibold mb-1">Online Play</h2>
      <div className="ndn-shell-body">
      {/* Pause overlay/banner */}
      {paused && (
        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4">
          <div className="text-2xl font-bold mb-2">Game Paused</div>
          <div className="text-sm opacity-80 mb-4">Resumes {pauseEndsAt ? `in ${Math.max(0, Math.ceil((pauseEndsAt - Date.now())/1000))}s` : 'soon'}</div>
          <div className="text-xs opacity-60">Both players can see this pause screen.</div>
        </div>
      )}
      {unread > 0 && !match.inProgress && (
        <div className="mb-3 text-sm px-3 py-2 rounded bg-amber-600/30 border border-amber-500/40">
          You have {unread} unread message{unread>1?'s':''}. Check the Friends tab.
        </div>
      )}
      <div className="relative">
        <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2">
            <label className="text-xs opacity-70 shrink-0">Room</label>
            <input className="input w-28" value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="room-1" />
          </div>
          {connected ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-600/20 text-emerald-200 border border-emerald-400/40 shrink-0">Connected</span>
          ) : (
            <button className="btn bg-rose-600 hover:bg-rose-700 shrink-0" onClick={connect}>Connect</button>
          )}
          <button className="btn shrink-0" onClick={sendState} disabled={!connected}>Sync</button>
          {/* Demo button for previewing the Match Start Showcase (DEV only) */}
          {(import.meta as any).env?.DEV ? (
            <button className="btn btn-ghost text-xs py-1" onClick={() => setShowStartShowcase(true)}>Demo Start Showcase</button>
          ) : null}
          {/* Pause controls */}
          {!paused && !pauseRequestedBy && (
            <div className="flex items-center gap-2">
              <label className="text-xs opacity-70">Pause (max 10m)</label>
              <select className="input w-28" value={pauseDurationSec}
                onChange={e => setPauseDurationSec(Math.max(60, Math.min(600, parseInt(e.target.value)||300)))}>
                <option value={120}>2 min</option>
                <option value={300}>5 min</option>
                <option value={600}>10 min</option>
              </select>
              <button className="btn" disabled={!connected}
                onClick={() => {
                  const me = (user?.username || 'player')
                  setPauseRequestedBy(me)
                  setPauseAcceptedBy({ [me]: true })
                  setPausedLocal(false); setPauseEndsAt(null)
                  sendState()
                }}
              >Request Pause</button>
            </div>
          )}
          {!paused && pauseRequestedBy && !pauseAcceptedBy[(user?.username||'')] && (
            <div className="flex items-center gap-2 text-xs">
              <span className="opacity-80">{pauseRequestedBy} requested a {Math.round((pauseDurationSec||300)/60)}m pause</span>
              <button className="btn bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  const me = (user?.username || '')
                  const next: Record<string, boolean> = { ...pauseAcceptedBy, [me]: true }
                  setPauseAcceptedBy(next)
                  // If at least 2 unique acceptances (both players), start pause
                  const acceptedCount = Object.keys(next).filter((k: string) => !!next[k]).length
                  const required = Math.max(2, (participants?.length || 2))
                  if (acceptedCount >= 2 || acceptedCount >= required) {
                    const ends = Date.now() + Math.min(600, Math.max(60, pauseDurationSec||300)) * 1000
                    setPausedLocal(true); setPauseEndsAt(ends)
                    setPausedGlobal(true, ends)
                  }
                  sendState()
                }}
              >Accept</button>
              <button className="btn bg-rose-600 hover:bg-rose-700"
                onClick={() => { setPauseRequestedBy(null); setPauseAcceptedBy({}); setPausedLocal(false); setPauseEndsAt(null); setPausedGlobal(false, null); sendState() }}
              >Decline</button>
            </div>
          )}
          {paused && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-yellow-500/25 text-yellow-100 border border-yellow-400/40 shrink-0">
              Paused · {Math.max(0, Math.ceil(((pauseEndsAt||Date.now()) - Date.now())/1000))}s
            </span>
          )}
          <button
            className="text-[11px] px-3 py-1 rounded-full bg-indigo-500/25 text-indigo-100 border border-indigo-400/40 hover:bg-indigo-500/40 shrink-0"
            title="Open a simulated online match demo"
            onClick={() => { 
              try { 
                window.dispatchEvent(new CustomEvent('ndn:online-match-demo', { detail: { game: 'X01', start: 501 } })) 
              } catch (err) {
                console.error('Demo click error:', err)
              }
            }}
          >DEMO</button>
          {connected && (
            <button className="btn shrink-0" onClick={() => setShowMatchModal(true)} disabled={locked} title={locked ? 'Weekly free games used' : ''}>Open Match</button>
          )}
        </div>
      </div>
      {/* Create Match+ box (top-right area) */}
      <div
        className={`mt-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40 flex items-center justify-end ${(!connected || locked) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        role="button"
        title={!connected ? 'Connect to the lobby first' : (locked ? 'Weekly free games used' : 'Create a new match')}
        onClick={() => {
          if (!connected || locked) return
          setShowCreate(true)
          if (wsGlobal) wsGlobal.send({ type: 'list-matches' })
          else wsRef.current?.send(JSON.stringify({ type: 'list-matches' }))
        }}
      >
        <button className="btn" disabled={!connected || locked}>Create Match +</button>
      </div>
      <p className="text-sm text-slate-600 mt-3">Open this app on another device and join the same Room ID to sync scores.</p>
      {!user?.fullAccess && (
        <div className="text-xs text-slate-400 mt-1">Weekly free online games remaining: {freeLeft === Infinity ? 'ÔÇö' : freeLeft}</div>
      )}
      {(!user?.fullAccess && freeLeft !== Infinity && freeLeft <= 0) && (
        <div className="mt-2 p-2 rounded-lg bg-rose-700/30 border border-rose-600/40 text-rose-200 text-sm">You've used your 3 free online games this week. PREMIUM required to continue.</div>
      )}
      {errorMsg && (
        <div className="mt-2 p-2 rounded-lg bg-rose-700/30 border border-rose-600/40 text-rose-200 text-sm font-semibold flex items-center gap-2">
          <span className="material-icons text-rose-300">error_outline</span>
          {errorMsg}
        </div>
      )}
      {offerNewRoom && (
        <div className="mt-2 p-2 rounded-lg bg-indigo-700/30 border border-indigo-600/40 text-indigo-100 text-sm flex items-center justify-between gap-2">
          <div>That room is full or no longer available. Create a new clean room with the same settings?</div>
          <div className="flex items-center gap-2">
            <button className="btn px-3 py-1 text-sm" onClick={()=>{
              const { game, mode, value, startingScore } = offerNewRoom
              const creatorAvg = user?.username ? getAllTimeAvg(user.username) : 0
              if (wsGlobal) {
                wsGlobal.send({ type: 'create-match', game, mode, value, startingScore: startingScore || 501, creatorAvg })
                wsGlobal.send({ type: 'list-matches' })
              } else {
                wsRef.current?.send(JSON.stringify({ type: 'create-match', game, mode, value, startingScore: startingScore || 501, creatorAvg }))
                wsRef.current?.send(JSON.stringify({ type: 'list-matches' }))
              }
              setOfferNewRoom(null)
            }}>Create New Match</button>
            <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>setOfferNewRoom(null)}>Dismiss</button>
          </div>
        </div>
      )}
      {/* Global toaster is mounted in App */}

  {/* World Lobby with filters */}
      {connected && (
        <div className="mt-4 p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">World Lobby</div>
            <div className="flex items-center gap-2">
              <div className="text-xs opacity-80">Matches: {filteredLobby.length}</div>
              <button className="btn px-3 py-1 text-sm" onClick={()=> (wsGlobal ? wsGlobal.send({ type: 'list-matches' }) : wsRef.current?.send(JSON.stringify({ type: 'list-matches' })))}>Refresh</button>
              <button
                className="btn px-3 py-1 text-sm"
                title={!connected ? 'Connect to the lobby first' : (locked ? 'Weekly free games used' : 'Create a new match')}
                disabled={!connected || locked}
                onClick={() => { if (!connected || locked) return; setShowCreate(true); (wsGlobal ? wsGlobal.send({ type: 'list-matches' }) : wsRef.current?.send(JSON.stringify({ type: 'list-matches' }))) }}
              >Create Match +</button>
            </div>
          </div>
          {/* Filters */}
          <div className="space-y-3 mb-3">
            <div>
              <label className="block text-xs opacity-70 mb-1">Mode</label>
              <TabPills
                tabs={[{ key: 'all', label: 'All' }, { key: 'bestof', label: 'Best of' }, { key: 'firstto', label: 'First to' }]}
                active={filterMode}
                onChange={(k)=> setFilterMode(k as any)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs opacity-70 mb-2 font-semibold">Game</label>
                <select className="input w-full text-sm" value={filterGame as any} onChange={e=>setFilterGame(e.target.value as any)}>
                  <option value="all">All</option>
                  {allGames.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs opacity-70 mb-2 font-semibold">Starting Score</label>
                <select className="input w-full text-sm" value={filterStart as any} onChange={e=>{
                  const v = e.target.value
                  if (v==='all') setFilterStart('all'); else setFilterStart(Number(v) as any)
                }} disabled={filterGame !== 'all' && filterGame !== 'X01'}>
                  <option value="all">All</option>
                  <option value="301">301</option>
                  <option value="501">501</option>
                  <option value="701">701</option>
                </select>
              </div>
              <div>
                <label className="block text-xs opacity-70 mb-2 font-semibold">Opponent Average</label>
                <div className="flex items-center gap-2 h-10 px-3 rounded bg-slate-900/30 border border-slate-500/30">
                  <input 
                    id="nearavg" 
                    type="checkbox" 
                    className="w-4 h-4 cursor-pointer accent-purple-500" 
                    checked={nearAvg} 
                    onChange={e=>setNearAvg(e.target.checked)} 
                    title={!myAvg || myAvg === 0 ? 'Play a game first to use this filter' : 'Filter matches near your average'}
                  />
                  <label htmlFor="nearavg" className="cursor-pointer text-sm flex-1">Near my avg</label>
                  <input 
                    type="number" 
                    className="input w-20 text-sm px-2 py-1" 
                    min={5} 
                    max={40} 
                    step={1} 
                    value={avgTolerance} 
                    onChange={e=>{
                      const val = parseInt(e.target.value || '10');
                      if (!isNaN(val)) setAvgTolerance(Math.max(5, Math.min(40, val)));
                    }}
                    disabled={!nearAvg}
                    title="Tolerance range (±)"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="flex-1 max-w-xs">
                <label className={`block text-xs opacity-70 mb-2 font-semibold ${!nearAvg ? 'opacity-40' : ''}`}>Avg Tolerance (±)</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={avgTolerance} 
                    onChange={e=>{
                      const newVal = parseInt(e.target.value, 10);
                      if (!isNaN(newVal)) {
                        setAvgTolerance(Math.max(1, Math.min(50, newVal)));
                      }
                    }}
                    disabled={!nearAvg}
                    title="Drag to set tolerance"
                    className="w-32 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: nearAvg 
                        ? 'linear-gradient(to right, rgb(55, 65, 81) 0%, rgb(55, 65, 81) ' + ((avgTolerance - 1) / 49 * 100) + '%, rgb(88, 28, 135) ' + ((avgTolerance - 1) / 49 * 100) + '%, rgb(88, 28, 135) 100%)'
                        : 'linear-gradient(to right, rgb(71, 85, 105) 0%, rgb(71, 85, 105) 100%)'
                    }}
                  />
                  <div className="text-xs font-mono font-semibold w-8 text-right text-purple-400">±{avgTolerance}</div>
                </div>
              </div>
              <button 
                className="btn px-3 py-2 text-sm mt-6" 
                onClick={()=>{ 
                  setFilterMode('all'); 
                  setFilterGame('all'); 
                  setFilterStart('all'); 
                  setNearAvg(false); 
                  setAvgTolerance(10) 
                }}
              >Reset</button>
            </div>
          </div>
          {filteredLobby.length === 0 ? (
            <div className="text-sm text-slate-300">No games waiting. Create one!</div>
          ) : (
            <div className="space-y-2">
              {filteredLobby.map((m:any)=> (
                <div key={m.id} className="p-3 rounded-lg bg-black/20 flex items-center justify-between relative">
                  <div className="text-sm">
                    <div>{m.game || 'X01'} {m.game==='X01' ? ` ${m.startingScore}` : ''} - {m.mode==='bestof' ? `Best Of ${m.value}` : `First To ${m.value}`} - Created by {m.creatorName}</div>
                    {m.requireCalibration && (
                      <div className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-600/30 mt-1">Calibration required</div>
                    )}
                    {m.creatorAvg ? (
                      <div className="text-xs opacity-70">Creator avg: {Number(m.creatorAvg).toFixed(1)}</div>
                    ) : null}
                    <div className="text-xs opacity-70">ID: {m.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn px-3 py-1 text-sm bg-green-600 hover:bg-green-700" disabled={locked || (!user?.fullAccess && (premiumGames as readonly string[]).includes(m.game)) || (!!m.requireCalibration && !calibH)} title={
                      !user?.fullAccess && (premiumGames as readonly string[]).includes(m.game)
                        ? 'PREMIUM game'
                        : (locked ? 'Weekly free games used' : (!!m.requireCalibration && !calibH ? 'Calibration required' : ''))
                    } onClick={async ()=>{
                      setLastJoinIntent({ game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore })
                      const calibrated = !!calibH
                      const boardPreview = await getBoardPreview()
                      try {
                        // Simulate Stripe checkout error for demo
                        // throw new Error('Failed to create checkout session')
                        if (wsGlobal) wsGlobal.send({ type: 'join-match', matchId: m.id, calibrated, boardPreview })
                        else wsRef.current?.send(JSON.stringify({ type: 'join-match', matchId: m.id, calibrated, boardPreview }))
                      } catch (err: any) {
                        handleStripeError(err?.message || 'Failed to create Stripe checkout session. Please try again later.')
                      }
                    }}>Join Now!</button>
                    {selfId && m.creatorId === selfId && (
                      <button
                        className="w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs flex items-center justify-center shadow"
                        title="Close this match"
                        onClick={()=>{
                          if (wsGlobal) wsGlobal.send({ type: 'cancel-match', matchId: m.id })
                          else wsRef.current?.send(JSON.stringify({ type: 'cancel-match', matchId: m.id }))
                        }}
                        aria-label="Close match"
                      >×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Frosted lock overlay when non-premium user is locked */}
      {(!user?.fullAccess && freeLeft !== Infinity && freeLeft <= 0) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 backdrop-blur-sm bg-slate-900/40" />
          <div className="relative z-10 p-4 rounded-xl bg-black/60 border border-slate-700 text-center">
            <div className="text-3xl mb-2">­ƒöÆ</div>
            <div className="font-semibold">Online play locked</div>
            <div className="text-sm text-slate-200/80">YouÔÇÖve used your 3 free online games this week. Upgrade to PREMIUM to play all modes.</div>
            <button 
              onClick={async () => {
                try {
                  const res = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: user?.email })
                  })
                  const data = await res.json()
                  if (data.ok && data.url) {
                    window.location.href = data.url
                  } else {
                    alert('Failed to create payment session: ' + (data.error || 'Unknown error'))
                  }
                } catch (e) {
                  alert('Network error')
                }
              }}
              className="btn mt-3 bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-bold"
            >
              Upgrade to PREMIUM = {formatPriceInCurrency(getUserCurrency(), 5)}
            </button>
          </div>
        </div>
      )}

      {showMatchModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="absolute inset-0 flex flex-col">
            <div className="p-2 md:p-3 flex items-center justify-between">
              <div>
                <h3 className="text-xl md:text-2xl font-bold">Online Match</h3>
                {/* Room id hidden in-game to reduce clutter */}
              </div>
              <button className="btn px-3 py-1" onClick={() => setShowMatchModal(false)}>Close</button>
            </div>
            <div className="relative flex-1 overflow-hidden p-2 md:p-3">
              <div className="card w-full h-full overflow-hidden relative p-2.5 md:p-3">
            {/* Ephemeral celebration overlay */}
            {celebration && (
              <div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-8 z-20">
                <div className={`px-4 py-2 rounded-full text-lg font-bold shadow whitespace-nowrap ${celebration.kind==='leg' ? 'bg-indigo-500/20 border border-indigo-400/40 text-indigo-100' : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-100'}`}>
                  {celebration.kind==='leg' ? '­ƒÅü LEG WON ÔÇö ' : '­ƒÄ» 180! ÔÇö '}{celebration.by}
                </div>
                {/* Lightweight confetti for leg wins */}
                {celebration.kind === 'leg' && (
                  <>
                    <style>{`@keyframes ndn-confetti-fall{0%{transform:translateY(-10%) rotate(0deg);opacity:1}100%{transform:translateY(120%) rotate(360deg);opacity:0}}`}</style>
                    <div className="absolute inset-0 pointer-events-none">
                      {[...Array(24)].map((_,i)=>{
                        const left = Math.random()*100
                        const delay = Math.random()*0.2
                        const dur = 1.2 + Math.random()*0.8
                        const size = 6 + Math.random()*6
                        const hue = Math.floor(Math.random()*360)
                        return (
                          <span key={i} style={{ position:'absolute', top:0, left: left+'%', width: size, height: size, background:`hsl(${hue} 90% 60%)`, borderRadius: 2, animation: `ndn-confetti-fall ${dur}s ease-out ${delay}s forwards` }} />
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="mb-1.5 text-xs md:text-sm flex items-center justify-between gap-2">
              <span>Participants: {participants.length || 1}</span>
              <button
                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/50 hover:bg-slate-700 border border-slate-600"
                onClick={() => setCompactView(v => !v)}
                title={compactView ? 'Switch to full multi-player view' : 'Switch to compact player-by-player view'}
              >{compactView ? 'Full view' : 'Compact view'}</button>
            </div>
            {/* Header row styled to match Offline X01 screen (sticky, glassy bar) */}
            {(() => {
              const a = match.players?.[0]?.legsWon || 0
              const b = match.players?.[1]?.legsWon || 0
              return (
                <GameHeaderBar
                  left={(
                    <>
                      <span className="hidden xs:inline px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[10px] sm:text-xs">Game Mode</span>
                      <span className="font-medium whitespace-nowrap">{currentGame}{currentGame==='X01' ? ` / ${match.startingScore}` : ''}</span>
                      <span className="opacity-80 whitespace-nowrap">Legs {a}–{b}</span>
                    </>
                  )}
                  right={(
                    <>
                      <span className="opacity-70 text-[10px]">Match</span>
                      <select className={`btn ${buttonSizeClass}`} value={matchType} onChange={e=>setMatchType((e.target.value as 'singles'|'doubles'))}>
                        <option value="singles">Singles</option>
                        <option value="doubles">Doubles</option>
                      </select>
                      <input className={`input ${buttonSizeClass} w-[7.5rem]`} value={teamAName} onChange={e=>setTeamAName(e.target.value)} placeholder="Team A" />
                      <span className="opacity-50">vs</span>
                      <input className={`input ${buttonSizeClass} w-[7.5rem]`} value={teamBName} onChange={e=>setTeamBName(e.target.value)} placeholder="Team B" />
                    </>
                  )}
                />
              )
            })()}
            {/* Summary area */}
            {compactView ? (
              <div className="mb-3">
                {(() => {
                  const idx = match.currentPlayerIdx
                  const p = match.players[idx]
                  if (!p) return null
                  const leg = p.legs[p.legs.length-1]
                  const rem = leg ? leg.totalScoreRemaining : match.startingScore
                  const isMe = (user?.username && p.name === user.username)
                  const lastVisitScore = leg && leg.visits.length ? leg.visits[leg.visits.length-1].score : 0
                  // TV-style match average for this player across all legs
                  const totals = (() => { let pts=0, d=0; for (const L of (p?.legs||[])) { pts += (L.totalScoreStart - L.totalScoreRemaining); d += (L.visits||[]).reduce((a,v)=>a + (v.darts||0) - (v.preOpenDarts||0), 0) } return { pts, d } })()
                  const avg = totals.d > 0 ? ((totals.pts / totals.d) * 3) : 0
                  if (currentGame === 'X01') {
                    return (
                      <div className={`p-4 rounded-xl bg-brand-50 text-black ${idx===match.currentPlayerIdx?'ring-2 ring-brand-400':''}`}>
                        <div className="text-xs text-slate-600 flex items-center justify-between">
                          <span className="font-semibold">{p.name}</span>
                          <span className={`px-2 py-0.5 rounded-full ${idx===match.currentPlayerIdx?'bg-emerald-500/20 text-emerald-300':'bg-slate-500/20 text-slate-300'} text-xs font-bold`}>
                            {idx===match.currentPlayerIdx ? 'THROWING' : 'WAITING TO THROW'}
                          </span>
                        </div>
                        <div className="text-4xl font-extrabold">{rem}</div>
                        <div className="text-sm mt-1">Last score: <span className="font-semibold">{lastVisitScore}</span></div>
                        <div className="text-sm">3-Dart Avg: <span className="font-semibold">{avg.toFixed(1)}</span></div>
                        {isMe && idx===match.currentPlayerIdx && rem <= 170 && rem > 0 && (
                          <div className="mt-2 p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm">
                            Checkout suggestions (fav {favoriteDouble}): {suggestCheckouts(rem, favoriteDouble).join('  ÔÇó  ') || 'ÔÇö'}
                          </div>
                        )}
                      </div>
                    )
                  }
                  // Non-X01 (e.g., Double Practice, Around the Clock, Treble Practice): show target and progress instead of X01 remaining
                  return (
                    <div className={`p-4 rounded-xl bg-brand-50 text-black ${idx===match.currentPlayerIdx?'ring-2 ring-brand-400':''}`}>
                      <div className="text-xs text-slate-600 flex items-center justify-between">
                        <span className="font-semibold">{p.name}</span>
                        <span className={`px-2 py-0.5 rounded-full ${idx===match.currentPlayerIdx?'bg-emerald-500/20 text-emerald-300':'bg-slate-500/20 text-slate-300'} text-xs font-bold`}>
                          {idx===match.currentPlayerIdx ? 'THROWING' : 'WAITING TO THROW'}
                        </span>
                      </div>
                      <div className="text-sm opacity-80">{currentGame}</div>
                      {currentGame === 'Double Practice' && (
                        <>
                          <div className="mt-1 text-xs flex items-center justify-between">
                            <span>Current target</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || 'ÔÇö'}</span>
                          </div>
                          <div className="text-3xl font-extrabold">{dpHits} / {DOUBLE_PRACTICE_ORDER.length}</div>
                        </>
                      )}
                      {currentGame === 'Around the Clock' && (
                        <>
                          <div className="mt-1 text-xs flex items-center justify-between">
                            <span>Current target</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{ATC_ORDER[atcIndex] === 25 ? '25 (Outer Bull)' : ATC_ORDER[atcIndex] === 50 ? '50 (Inner Bull)' : (ATC_ORDER[atcIndex] || 'ÔÇö')}</span>
                          </div>
                          <div className="text-3xl font-extrabold">{atcHits} / {ATC_ORDER.length}</div>
                        </>
                      )}
                      {currentGame === 'Treble Practice' && (
                        <>
                          <div className="mt-1 text-xs flex items-center justify-between">
                            <span>Treble Target</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">T{trebleTarget}</span>
                          </div>
                          <div className="text-3xl font-extrabold">{trebleHits} / {trebleDarts}</div>
                        </>
                      )}
                    </div>
                  )
                })()}
                {match.players.length > 1 && (
                  <div className="mt-2 text-xs text-slate-400">Next up: {match.players[(match.currentPlayerIdx+1) % match.players.length]?.name}</div>
                )}
              </div>
            ) : (
              <>
                {/* Full overview: slim strip with each player's remaining */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {match.players.map((p, idx) => {
                    const leg = p.legs[p.legs.length-1]
                    const rem = leg ? leg.totalScoreRemaining : match.startingScore
                    return (
                      <div key={`strip-${p.id}`} className={`px-2 py-1 rounded bg-black/20 border border-slate-700/40 text-xs ${idx===match.currentPlayerIdx ? 'ring-1 ring-brand-400' : ''}`}>
                        <span className="font-semibold">{p.name}</span>
                        {currentGame === 'X01' ? (
                          <>
                            <span className="opacity-70"> = </span>
                            <span className="font-mono">{rem}</span>
                          </>
                        ) : (
                          <>
                            <span className="opacity-70"> = </span>
                            <span className="font-mono">
                              {currentGame === 'Double Practice' ? `${dpHits}/${DOUBLE_PRACTICE_ORDER.length}`
                                : currentGame === 'Around the Clock' ? `${atcHits}/${ATC_ORDER.length}`
                                : currentGame === 'Treble Practice' ? `${trebleHits}/${trebleDarts}`
                                : currentGame === 'Cricket' ? `${(cricketById[p.id]?.points||0)} pts`
                                : currentGame === 'Shanghai' ? `${(shanghaiById[p.id]?.score||0)} pts = R${(shanghaiById[p.id]?.round||1)}`
                                : currentGame === 'Halve It' ? `${(halveById[p.id]?.score||0)} pts = S${(halveById[p.id]?.stage||0)+1}`
                                : currentGame === 'High-Low' ? `${(highlowById[p.id]?.score||0)} pts = ${(highlowById[p.id]?.target||'HIGH')}`
                                : currentGame === 'Killer' ? (() => { const st = killerById[p.id]; return st ? `#${st.number} = ${st.lives}ÔØñ ${st.isKiller?'= K':''}` : 'ÔÇö' })()
                                : currentGame === 'American Cricket' ? `${(amCricketById[p.id]?.points||0)} pts`
                                : currentGame === 'Baseball' ? (() => { const st = baseballById[p.id]; return st ? `R${st.score} = I${st.inning}` : 'ÔÇö' })()
                                : currentGame === 'Golf' ? (() => { const st = golfById[p.id]; return st ? `S${st.strokes} = H${st.hole}` : 'ÔÇö' })()
                                : currentGame === 'Tic Tac Toe' ? (() => { const x = (ttt.board||[]).filter((c:any)=>c==='X').length; const o = (ttt.board||[]).filter((c:any)=>c==='O').length; return `X${x}-O${o}` })()
                                : currentGame}
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            {compactView ? (
              <div className="space-y-2">
                {/* Top toolbar */}
                <div className="flex flex-col gap-2 mb-2">
                  <div className="flex items-center gap-2">
                  <button className={`btn ${buttonSizeClass}`} onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-autoscore' as any)) }catch{} }}>Autoscore</button>
                  <button className={`btn ${buttonSizeClass}`} onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-scoring' as any)) }catch{} }}>Scoring</button>
                  <button className={`btn ${buttonSizeClass}`} onClick={openManual}>Manual Correction</button>
                  {!manualScoring && (
                    <button className={`btn ${buttonSizeClass}`} onClick={() => {
                      // Toggle local camera enable — prefer local camera start, fallback to cam-create pairing
                      try { window.dispatchEvent(new CustomEvent('ndn:start-camera', { detail: { mode: 'local' } })) } catch (err) {
                        console.warn('Enable camera event failed', err)
                        if (wsGlobal) wsGlobal.send({ type: 'cam-create' })
                        else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'cam-create' }))
                        else toast('Not connected to server', { type: 'error' })
                      }
                    }}>Enable camera</button>
                  )}
                  {!manualScoring && pairingCode && (
                    <div className="ml-2 text-sm bg-blue-900/50 p-2 rounded">
                      <div><span className="opacity-70">Mobile pairing code: </span><span className="font-mono font-bold text-lg">{pairingCode}</span></div>
                      <div className="text-xs opacity-70 mt-1">On your phone, go to: <a href={`/mobile-cam.html?code=${pairingCode}`} target="_blank" className="underline">{window.location.origin}/mobile-cam.html?code={pairingCode}</a></div>
                    </div>
                  )}
                  {!manualScoring && (
                    <div className="ml-auto flex items-center gap-1 text-[11px]">
                      <span className="opacity-70">Cam size</span>
                      <button className={`btn ${buttonSizeClass}`} onClick={()=>setCameraScale(Math.max(0.5, Math.round((cameraScale-0.05)*100)/100))}>−</button>
                      <span className={`btn ${buttonSizeClass} min-w-[2.5rem] text-center`}>{Math.round(cameraScale*100)}%</span>
                      <button className={`btn ${buttonSizeClass}`} onClick={()=>setCameraScale(Math.min(1.25, Math.round((cameraScale+0.05)*100)/100))}>+</button>
                      <span className="opacity-50">|</span>
                      <button className={`btn ${buttonSizeClass}`} title="Toggle fit/fill" onClick={()=>setCameraFitMode(cameraFitMode==='fill'?'fit':'fill')}>{cameraFitMode==='fill'?'Fill':'Fit'}</button>
                    </div>
                  )}
                  </div>
                </div>
                {/* Summary (left) + Camera (right) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 items-start h-full">
                  <div className="order-1">
                    {currentGame === 'X01' ? (
                      <RenderMatchSummary />
                    ) : (
                      <GameScoreboard
                        gameMode={currentGame as any}
                        players={useOnlineGameStats(currentGame as any, match, participants)}
                        matchScore={match.players?.length === 2 ? `${match.players[0]?.legsWon || 0}-${match.players[1]?.legsWon || 0}` : undefined}
                      />
                    )}
                  </div>
                  <div className="order-2 flex-1 min-h-0">
                    {cameraEnabled ? (
                      <div className="min-w-0 relative z-10 flex-1 min-h-0 ndn-camera-tall">
                        <ResizablePanel
                          storageKey="ndn:camera:tile:online:top"
                          className="relative rounded-2xl overflow-hidden bg-black"
                          defaultWidth={520}
                          defaultHeight={320}
                          minWidth={280}
                          minHeight={200}
                          maxWidth={1600}
                          maxHeight={900}
                          autoFill
                        >
                          <CameraTile 
                            label="Your Board" 
                            autoStart={user?.username && match.players[match.currentPlayerIdx]?.name === user.username} 
                            aspect="classic"
                            fill
                          />
                        </ResizablePanel>
                        {/** Duplicate compact toolbar removed; header now contains match controls */}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="font-semibold">Current: {match.players[match.currentPlayerIdx]?.name || 'ÔÇö'}</div>
                {currentGame === 'X01' && cameraEnabled && user?.username && match.players[match.currentPlayerIdx]?.name === user.username ? (
                  <>
                    {/* Camera autoscore module; only render for current thrower */}
                    <CameraView x01DoubleInOverride={x01DoubleInMatch} hideInlinePanels showToolbar={false} immediateAutoCommit onVisitCommitted={(score, darts, finished) => {
                      if (callerEnabled) {
                        const p = match.players[match.currentPlayerIdx]
                        const leg = p?.legs[p.legs.length-1]
                        const remaining = leg ? leg.totalScoreRemaining : match.startingScore
                        sayScore(user?.username || 'Player', score, Math.max(0, remaining), callerVoice, { volume: callerVolume, checkoutOnly: speakCheckoutOnly })
                      }
                      const current = match.players[match.currentPlayerIdx]
                      if (user?.username && current?.name === user.username) {
                        addSample(user.username, darts, score)
                      }
                      // Instant local celebration
                      try { if (score === 180) triggerCelebration('180', current?.name || 'Player'); if (finished) triggerCelebration('leg', current?.name || 'Player') } catch {}
                      // If an opponent is present, rotate turns; otherwise stay on the same player for solo practice
                      if (!finished) {
                        const hasOpponent = (participants?.length || 0) >= 2
                        if (hasOpponent) { match.nextPlayer() }
                      }
                      sendState()

                      try {
                        // Auto-show highlight modal for notable events:
                        // - a checkout (finished) where the visit score was > 50
                        // - a big visit where score > 100
                        if ((finished && score > 50) || score > 100) {
                          const current = match.players[match.currentPlayerIdx]
                          const remaining = (current?.legs?.[current.legs.length-1]?.totalScoreRemaining) ?? match.startingScore
                          const highlight = {
                            player: current?.name || user?.username || 'Player',
                            score,
                            darts,
                            finished,
                            remainingBefore: Math.max(0, (remaining + score)),
                            ts: Date.now(),
                          }
                          setHighlightCandidate(highlight)
                          setShowHighlightModal(true)
                        }
                      } catch {}
                    }} />
                    {/* Highlight modal: offers download or save to account when a notable visit occurs */}
                    {showHighlightModal && highlightCandidate ? (
                      <ResizableModal storageKey="ndn:modal:highlight" className="w-[420px]" defaultWidth={420} defaultHeight={220} minWidth={320} minHeight={160} initialFitHeight>
                        <div className="p-4">
                          <div className="text-lg font-semibold mb-2">Save highlight</div>
                          <div className="text-sm mb-3">Player: <strong>{highlightCandidate.player}</strong> — Score: <strong>{highlightCandidate.score}</strong> — Darts: <strong>{highlightCandidate.darts}</strong></div>
                          <div className="flex items-center gap-2">
                            <button className="btn" onClick={() => downloadHighlightToDevice()}>Download to device</button>
                            <button className="btn" onClick={() => saveHighlightToAccount()}>Save to account</button>
                            <button className="btn btn-ghost ml-auto" onClick={() => { setShowHighlightModal(false); setHighlightCandidate(null); }}>Close</button>
                          </div>
                          <div className="text-xs opacity-70 mt-3">You can download this JSON to keep a copy, or save it to your account for later access.</div>
                        </div>
                      </ResizableModal>
                    ) : null}
                    <div className="flex items-center gap-1.5 mb-2">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn px-2 py-0.5 text-xs" onClick={() => submitVisitManual(visitScore)}>Submit Visit</button>
                      <button className="btn px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-800" onClick={() => { match.undoVisit(); sendState(); }}>Undo</button>
                    </div>
                      {/* Quick entry buttons */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
                        <span className="opacity-70">Quick:</span>
                        {[180,140,100,60].map(v => (
                          <button key={v} className="btn px-2 py-0.5 text-xs" onClick={()=>submitVisitManual(v)}>{v}</button>
                        ))}
                      </div>
                    <div className="mt-2 flex items-center gap-1.5 mb-2">
                      <button className="btn px-2 py-0.5 text-xs" onClick={()=>setShowQuick(true)}>Quick Chat</button>
                      <button className="btn px-2 py-0.5 text-xs" onClick={()=>setShowMessages(true)}>Messages</button>
                    </div>
                  </>
                ) : (currentGame === 'Double Practice' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Double Practice ÔÇö Hit doubles D1ÔåÆD20ÔåÆDBULL</div>
                    <div className="mb-1 text-sm flex items-center justify-between">
                      <span>Current target</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || 'ÔÇö'}</span>
                    </div>
                    <div className="text-2xl font-extrabold mb-2">{dpHits} / {DOUBLE_PRACTICE_ORDER.length}</div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView
                        showToolbar={false}
                        immediateAutoCommit
                        onAutoDart={(value, ring) => {
                          if (ring === 'DOUBLE' || ring === 'INNER_BULL') {
                            addDpValue(value)
                          }
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter') addDpNumeric() }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={addDpNumeric}>Add Dart</button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <input className="input w-40 text-sm" placeholder="Manual (D16, 50, 25, T20)" value={dpManual} onChange={e=>setDpManual(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addDpManual() }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={addDpManual}>Add</button>
                    </div>
                  </div>
                ) : (currentGame === 'Around the Clock' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Around the Clock ÔÇö Hit 1ÔåÆ20 then 25 (outer) and 50 (inner)</div>
                    <div className="mb-1 text-sm flex items-center justify-between">
                      <span>Current target</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{ATC_ORDER[atcIndex] === 25 ? '25 (Outer Bull)' : ATC_ORDER[atcIndex] === 50 ? '50 (Inner Bull)' : (ATC_ORDER[atcIndex] || 'ÔÇö')}</span>
                    </div>
                    <div className="text-2xl font-extrabold mb-2">{atcHits} / {ATC_ORDER.length}</div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView
                        scoringMode="custom"
                        showToolbar={false}
                        immediateAutoCommit
                        onAutoDart={(value, ring, info) => {
                          addAtcValue(value, ring, info?.sector ?? null)
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter') addAtcNumeric() }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={addAtcNumeric}>Add Dart</button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <input className="input w-40 text-sm" placeholder="Manual (T20, D5, 25, 50)" value={atcManual} onChange={e=>setAtcManual(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addAtcManual() }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={addAtcManual}>Add</button>
                    </div>
                  </div>
                ) : (currentGame === 'Treble Practice' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Treble Practice — Aim for triples only; count hits vs total darts</div>
                    <div className="mb-1 text-sm flex items-center justify-between">
                      <span>Treble target</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">T{trebleTarget}</span>
                    </div>
                    <div className="text-2xl font-extrabold mb-2">{trebleHits} / {trebleMaxDarts>0?trebleMaxDarts:trebleDarts}</div>
                    {(trebleMaxDarts>0 && trebleDarts >= trebleMaxDarts) && (
                      <div className="mt-1 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={resetTreble}>Reset</button></div>
                    )}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="opacity-70 text-xs">Quick:</span>
                      {[20,19,18].map(n => (
                        <button key={`tquick-${n}`} className={`btn px-2 py-0.5 text-xs ${trebleTarget===n?'bg-emerald-600/30 border border-emerald-400/30':''}`} onClick={()=>setTrebleTarget(n)}>T{n}</button>
                      ))}
                      <span className="opacity-50">|</span>
                      <select className="input w-24 text-sm" value={trebleTarget} onChange={e=> setTrebleTarget(parseInt(e.target.value,10))}>
                        {Array.from({length:20},(_,i)=>i+1).map(n=> <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button className="btn px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-800" onClick={resetTreble}>Reset</button>
                    </div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView
                        scoringMode="custom"
                        showToolbar={false}
                        immediateAutoCommit
                        onAutoDart={(value, ring, info) => {
                          const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL')
                          addTrebleValue(value, r, info?.sector ?? null)
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter') addTrebleNumeric() }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={addTrebleNumeric}>Add Dart</button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <input className="input w-40 text-sm" placeholder="Manual (T20)" value={trebleManual} onChange={e=>setTrebleManual(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addTrebleManual() }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={addTrebleManual}>Add</button>
                    </div>
                  </div>
                ) : (currentGame === 'Cricket' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Cricket ÔÇö Close 15-20 and Bull; overflow scores points</div>
                    {(() => {
                      const pid = currentPlayerId(); ensureCricket(pid); const st = cricketById[pid] || createCricketState()
                      return (
                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px]">
                          {CRICKET_NUMBERS.map(n => (
                            <div key={n} className="p-1 rounded bg-slate-800/50 border border-slate-700/50">
                              <div className="opacity-70">{n===25?'Bull':n}</div>
                              <div className="font-semibold">{Math.min(3, st.marks?.[n]||0)} / 3</div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                    <div className="text-sm mb-2">Points: <span className="font-semibold">{(cricketById[currentPlayerId()]?.points||0)}</span></div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => {
                        {
                          const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL')
                          applyCricketAuto(value, r, info?.sector ?? null)
                        }
                      }} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter'){ applyCricketAuto(Math.max(0, visitScore|0)); setVisitScore(0) } }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={()=>{ applyCricketAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (currentGame === 'Shanghai' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    {(() => { const pid = currentPlayerId(); ensureShanghai(pid); const st = shanghaiById[pid] || createShanghaiState(); return (
                      <>
                        <div className="text-xs mb-1.5">Shanghai ÔÇö Hit only the round's number; Single/Double/Triple score</div>
                        <div className="mb-1 text-sm flex items-center justify-between"><span>Round</span><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{st.round}</span></div>
                        <div className="text-2xl font-extrabold mb-2">Score: {st.score}</div>
                      </>
                    ) })()}
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyShanghaiAuto(value, r, info?.sector ?? null) }} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter'){ applyShanghaiAuto(Math.max(0, visitScore|0)); setVisitScore(0) } }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={()=>{ applyShanghaiAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (currentGame === 'Halve It' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    {(() => { const pid = currentPlayerId(); ensureHalve(pid); const st = halveById[pid] || createDefaultHalveIt(); const t = getCurrentHalveTarget(st); return (
                      <>
                        <div className="text-xs mb-1.5">Halve It ÔÇö Hit the target each round or your score halves</div>
                        <div className="mb-1 text-sm flex items-center justify-between">
                          <span>Stage</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{st.stage+1}/{st.targets.length}</span>
                        </div>
                        <div className="text-sm">Target: <span className="font-semibold">{(() => { const tt = t; if (!tt) return 'ÔÇö'; if (tt.kind==='ANY_NUMBER') return 'Any'; if (tt.kind==='BULL') return 'Bull'; if (tt.kind==='DOUBLE' || tt.kind==='TRIPLE' || tt.kind==='NUMBER') return `${tt.kind} ${(tt as any).num}`; return 'ÔÇö' })()}</span></div>
                        <div className="text-2xl font-extrabold mb-2">Score: {st.score}</div>
                      </>
                    ) })()}
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyHalveAuto(value, r, info?.sector ?? null) }} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter'){ applyHalveAuto(Math.max(0, visitScore|0)); setVisitScore(0) } }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={()=>{ applyHalveAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (currentGame === 'High-Low' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    {(() => { const pid = currentPlayerId(); ensureHighLow(pid); const st = highlowById[pid] || createHighLow(); return (
                      <>
                        <div className="text-xs mb-1.5">High-Low ÔÇö Alternate aiming for high then low segments</div>
                        <div className="mb-1 text-sm flex items-center justify-between"><span>Round</span><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{st.round}</span></div>
                        <div className="text-sm">Target: <span className="font-semibold">{st.target}</span></div>
                        <div className="text-2xl font-extrabold mb-2">Score: {st.score}</div>
                      </>
                    ) })()}
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyHighLowAuto(value, r, info?.sector ?? null) }} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter'){ applyHighLowAuto(Math.max(0, visitScore|0)); setVisitScore(0) } }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={()=>{ applyHighLowAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (currentGame === 'American Cricket' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">American Cricket ÔÇö Close 12-20 and Bull; overflow scores</div>
                    {(() => { const pid = currentPlayerId(); ensureAmCricket(pid); const st = amCricketById[pid] || createAmCricketState(); return (
                      <div className="mb-2 grid grid-cols-5 gap-1 text-center text-[11px]">
                        {AM_CRICKET_NUMBERS.map(n => (
                          <div key={n} className="p-1 rounded bg-slate-800/50 border border-slate-700/50">
                            <div className="opacity-70">{n===25?'Bull':n}</div>
                            <div className="font-semibold">{Math.min(3, st.marks?.[n]||0)} / 3</div>
                          </div>
                        ))}
                      </div>
                    ) })()}
                    <div className="text-sm mb-2">Points: <span className="font-semibold">{(amCricketById[currentPlayerId()]?.points||0)}</span></div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:(ring as any); applyAmCricketAuto(value, r, info?.sector ?? null) }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                      <button className="btn" onClick={() => { applyAmCricketAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (currentGame === 'Baseball' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    {(() => { const pid = currentPlayerId(); ensureBaseball(pid); const st = baseballById[pid] || createBaseball(); return (
                      <div className="text-xs mb-1.5">Baseball ÔÇö Inning {st.inning} ÔÇó Runs {st.score}</div>
                    ) })()}
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:(ring as any); applyBaseballAuto(value, r as any, info?.sector ?? null) }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                      <button className="btn" onClick={() => { applyBaseballAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (currentGame === 'Golf' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    {(() => { const pid = currentPlayerId(); ensureGolf(pid); const st = golfById[pid] || createGolf(); return (
                      <div className="text-xs mb-1.5">Golf ÔÇö Hole {st.hole} (target {GOLF_TARGETS[st.hole]}) ÔÇó Strokes {st.strokes}</div>
                    ) })()}
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:(ring as any); applyGolfAuto(value, r as any, info?.sector ?? null) }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                      <button className="btn" onClick={() => { applyGolfAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (currentGame === 'Tic Tac Toe' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Tic Tac Toe ÔÇö Tap a cell to claim by hitting its target</div>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {Array.from({length:9},(_,i)=>i as 0|1|2|3|4|5|6|7|8).map(cell => (
                        <button key={cell} className={`h-12 rounded-xl border ${ttt.board[cell]?'bg-emerald-500/20 border-emerald-400/30':'bg-slate-800/50 border-slate-700/50'}`} onClick={()=>{
                          if (ttt.finished || ttt.board[cell]) return
                          // Use the manual input value instead of prompt
                          const tgt = TTT_TARGETS[cell]
                          const v = Number(tttManual||0)
                          const ring = (v%3===0)?'TRIPLE': (v%2===0?'DOUBLE':'SINGLE')
                          const sector = tgt.type==='BULL'?null:(tgt.num||null)
                          applyTttAuto(cell, v, ring as any, sector as any)
                          setTttManual('') // Clear input after use
                        }}>{ttt.board[cell] || ''}</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="input w-40 text-sm" placeholder="Enter dart score (e.g. 20, 40, 60, 25, 50)" value={tttManual} onChange={e=>setTttManual(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') {
                        // Apply to first available cell
                        const availableCell = Array.from({length:9},(_,i)=>i as 0|1|2|3|4|5|6|7|8).find(cell => !ttt.board[cell] && !ttt.finished)
                        if (availableCell !== undefined) {
                          const tgt = TTT_TARGETS[availableCell]
                          const v = Number(tttManual||0)
                          const ring = (v%3===0)?'TRIPLE': (v%2===0?'DOUBLE':'SINGLE')
                          const sector = tgt.type==='BULL'?null:(tgt.num||null)
                          applyTttAuto(availableCell, v, ring as any, sector as any)
                          setTttManual('')
                        }
                      }}} />
                      <button className="btn" onClick={() => {
                        // Apply to first available cell
                        const availableCell = Array.from({length:9},(_,i)=>i as 0|1|2|3|4|5|6|7|8).find(cell => !ttt.board[cell] && !ttt.finished)
                        if (availableCell !== undefined) {
                          const tgt = TTT_TARGETS[availableCell]
                          const v = Number(tttManual||0)
                          const ring = (v%3===0)?'TRIPLE': (v%2===0?'DOUBLE':'SINGLE')
                          const sector = tgt.type==='BULL'?null:(tgt.num||null)
                          applyTttAuto(availableCell, v, ring as any, sector as any)
                          setTttManual('')
                        }
                      }}>Claim Cell</button>
                    </div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => {
                        // passive; primary interaction via tapping a cell above
                      }} />
                    </div>
                  </div>
                ) : (currentGame === 'Killer' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Killer ÔÇö Hit your own double to become Killer; then remove othersÔÇÖ lives by hitting their doubles/triples.</div>
                    <div className="mb-1 text-sm flex items-center justify-between">
                      <span>Your number</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{(() => { const pid = currentPlayerId(); match.players.forEach(p=>ensureKiller(p.id)); return killerById[pid]?.number || 'ÔÇö' })()}</span>
                    </div>
                    <div className="text-sm">Lives: <span className="font-semibold">{(() => { const pid = currentPlayerId(); return killerById[pid]?.lives ?? 'ÔÇö' })()}</span> {(() => { const pid = currentPlayerId(); return killerById[pid]?.isKiller ? <span className="ml-2 text-emerald-300">KILLER</span> : null })()}</div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyKillerAuto(r, info?.sector ?? null) }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter'){ applyKillerAuto('SINGLE', Math.max(0, visitScore|0)); setVisitScore(0) } }} />
                      <button className="btn px-2 py-0.5 text-xs" onClick={()=>{ applyKillerAuto('SINGLE', Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                    </div>
                  </div>
                ) : (user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">{currentGame} (online) ÔÇö manual turn entry</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input className="input w-24 text-sm" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                      <button className="btn" onClick={() => {
                        const v = Math.max(0, visitScore|0)
                        match.addVisit(v, 3)
                        setVisitScore(0)
                        match.nextPlayer()
                        sendState()
                      }}>Submit</button>
                      <button className="btn px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-800" onClick={() => { match.undoVisit(); sendState(); }}>Undo</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/40 text-center text-slate-300 font-semibold">WAITING TO THROW</div>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <button className="btn px-2 py-0.5 text-xs" onClick={()=>setShowQuick(true)}>Quick Chat</button>
                  <button className="btn px-2 py-0.5 text-xs" onClick={()=>setShowMessages(true)}>Messages</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {/* Left column: summary */}
                <div className="space-y-1.5">
                  <RenderMatchSummary />
                </div>
                {/* Main area: toolbar + camera + controls */}
                <div className={`md:col-span-${cameraColSpan} space-y-1.5 relative`}>
                  {/* Toolbar row (separate) */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <button className={`btn ${buttonSizeClass}`} onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-autoscore' as any)) }catch{} }}>Autoscore</button>
                    <button className={`btn ${buttonSizeClass}`} onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-scoring' as any)) }catch{} }}>Scoring</button>
                    <button className={`btn ${buttonSizeClass}`} onClick={openManual}>Manual Correction</button>
                    <div className="ml-auto flex items-center gap-1">
                      <span className="text-xs opacity-70">Cam</span>
                      <button className={`btn ${buttonSizeClass}`} onClick={()=>setCameraScale(Math.max(0.5, Math.round((cameraScale-0.05)*100)/100))}>−</button>
                      <span className={`btn ${buttonSizeClass} bg-transparent border-slate-600 text-center min-w-[3rem]`}>{Math.round(cameraScale*100)}%</span>
                      <button className={`btn ${buttonSizeClass}`} onClick={()=>setCameraScale(Math.min(1.25, Math.round((cameraScale+0.05)*100)/100))}>+</button>
                      <button 
                        className={`btn ${buttonSizeClass}`} 
                        onClick={() => setCameraColSpan(cameraColSpan === 2 ? 3 : 2)}
                        title={cameraColSpan === 2 ? "Expand camera" : "Shrink camera"}
                      >
                        {cameraColSpan === 2 ? '↔' : '↙'}
                      </button>
                      <span className="opacity-50">|</span>
                      <button className={`btn ${buttonSizeClass}`} title="Toggle fit/fill" onClick={()=>setCameraFitMode(cameraFitMode==='fill'?'fit':'fill')}>{cameraFitMode==='fill'?'Fill':'Fit'}</button>
                    </div>
                  </div>
                  {/* Camera row (under toolbar, left side) */}
                  <div className="mt-2 relative flex-1 min-h-0 ndn-camera-tall">
                    <ResizablePanel
                      storageKey="ndn:camera:tile:online:row"
                      className="relative rounded-2xl overflow-hidden bg-black w-full"
                      defaultWidth={720}
                      defaultHeight={400}
                      minWidth={320}
                      minHeight={220}
                      maxWidth={1600}
                      maxHeight={900}
                      autoFill
                    >
                      <CameraTile 
                        label="Your Board" 
                        autoStart={user?.username && match.players[match.currentPlayerIdx]?.name === user.username} 
                        aspect="classic"
                        fill
                      />
                    </ResizablePanel>
                    {/* Resize handle */}
                    {cameraColSpan < 3 && (
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-slate-600/20 hover:bg-slate-600/40 transition-colors flex items-center justify-center group"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          const startX = e.clientX
                          const startSpan = cameraColSpan
                          
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const deltaX = moveEvent.clientX - startX
                            // If dragged more than 50px to the right, expand to 3 columns
                            if (deltaX > 50 && startSpan === 2) {
                              setCameraColSpan(3)
                            }
                          }
                          
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove)
                            document.removeEventListener('mouseup', handleMouseUp)
                          }
                          
                          document.addEventListener('mousemove', handleMouseMove)
                          document.addEventListener('mouseup', handleMouseUp)
                        }}
                      >
                        <div className="w-0.5 h-8 bg-slate-400 group-hover:bg-slate-300 transition-colors"></div>
                      </div>
                    )}
                  </div>
                  <div className="font-semibold text-sm md:text-base">Current: {match.players[match.currentPlayerIdx]?.name || 'ÔÇö'}</div>
                  {currentGame === 'X01' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username ? (
                    <>
                      <CameraView x01DoubleInOverride={x01DoubleInMatch} hideInlinePanels showToolbar={false} immediateAutoCommit onVisitCommitted={(score, darts, finished) => {
                        if (callerEnabled) {
                          const p = match.players[match.currentPlayerIdx]
                          const leg = p?.legs[p.legs.length-1]
                          const remaining = leg ? leg.totalScoreRemaining : match.startingScore
                          sayScore(user?.username || 'Player', score, Math.max(0, remaining), callerVoice, { volume: callerVolume, checkoutOnly: speakCheckoutOnly })
                        }
                        const current = match.players[match.currentPlayerIdx]
                        if (user?.username && current?.name === user.username) {
                          addSample(user.username, darts, score)
                        }
                        // Instant local celebration
                        try { if (score === 180) triggerCelebration('180', current?.name || 'Player'); if (finished) triggerCelebration('leg', current?.name || 'Player') } catch {}
                        // Small delay before rotating to next player to avoid dropping late autoscore events
                        if (!finished) {
                          const hasOpponent = (participants?.length || 0) >= 2
                          if (hasOpponent) {
                            setTimeout(() => { try { match.nextPlayer(); sendState() } catch {} }, 750)
                          } else {
                            // Solo: keep turn with current player
                            sendState()
                          }
                        } else {
                          sendState()
                        }
                      }} />
                      <div className="flex items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => submitVisitManual(visitScore)}>Submit Visit (Manual)</button>
                        <button className="btn bg-slate-700 hover:bg-slate-800" onClick={() => { match.undoVisit(); sendState(); }}>Undo</button>
                      </div>
                      {/* Quick entry buttons */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                        <span className="opacity-70">Quick:</span>
                        {[180,140,100,60].map(v => (
                          <button key={v} className="btn px-3 py-1 text-sm" onClick={()=>submitVisitManual(v)}>{v}</button>
                        ))}
                      </div>
                      {/* Checkout suggestions (full view) */}
                      {(() => {
                        const p = match.players[match.currentPlayerIdx]
                        const leg = p?.legs?.[p.legs?.length-1]
                        const rem = leg ? leg.totalScoreRemaining : match.startingScore
                        return (rem > 0 && rem <= 170) ? (
                          <div className="mt-2 p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm">
                            Checkout suggestions (fav {favoriteDouble}): {suggestCheckouts(rem, favoriteDouble).join('  ÔÇó  ') || 'ÔÇö'}
                          </div>
                        ) : null
                      })()}
                    </>
                  ) : (currentGame === 'Double Practice' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      <div className="text-sm mb-2">Double Practice ÔÇö Hit doubles D1ÔåÆD20ÔåÆDBULL</div>
                      <div className="mb-1 text-sm flex items-center justify-between">
                        <span>Current target</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || 'ÔÇö'}</span>
                      </div>
                      <div className="text-2xl font-extrabold mb-2">{dpHits} / {DOUBLE_PRACTICE_ORDER.length}</div>
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView
                          scoringMode="custom"
                          showToolbar={false}
                          immediateAutoCommit
                          onAutoDart={(value, ring) => {
                            if (ring === 'DOUBLE' || ring === 'INNER_BULL') {
                              addDpValue(value)
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} onKeyDown={e=>{ if(e.key==='Enter') addDpNumeric() }} />
                        <button className="btn" onClick={addDpNumeric}>Add Dart</button>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <input className="input w-44" placeholder="Manual (D16, 50, 25, T20)" value={dpManual} onChange={e=>setDpManual(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addDpManual() }} />
                        <button className="btn" onClick={addDpManual}>Add</button>
                      </div>
                    </div>
                  ) : (currentGame === 'Cricket' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      <div className="text-sm mb-2">Cricket ÔÇö Close 15-20 and Bull; overflow scores points</div>
                      {(() => { const pid = currentPlayerId(); ensureCricket(pid); const st = cricketById[pid] || createCricketState(); return (
                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px]">
                          {CRICKET_NUMBERS.map(n => (
                            <div key={n} className="p-1 rounded bg-slate-800/50 border border-slate-700/50">
                              <div className="opacity-70">{n===25?'Bull':n}</div>
                              <div className="font-semibold">{Math.min(3, st.marks?.[n]||0)} / 3</div>
                            </div>
                          ))}
                        </div>
                      ) })()}
                      <div className="text-sm mb-2">Points: <span className="font-semibold">{(cricketById[currentPlayerId()]?.points||0)}</span></div>
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyCricketAuto(value, r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyCricketAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'Shanghai' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); ensureShanghai(pid); const st = shanghaiById[pid] || createShanghaiState(); return (
                        <>
                          <div className="text-sm mb-2">Shanghai ÔÇö Round {st.round} ÔÇó Score {st.score}</div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyShanghaiAuto(value, r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyShanghaiAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'Halve It' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); ensureHalve(pid); const st = halveById[pid] || createDefaultHalveIt(); const t = getCurrentHalveTarget(st); return (
                        <>
                          <div className="text-sm mb-2">Halve It ÔÇö Stage {st.stage+1}/{st.targets.length} ÔÇó Score {st.score}</div>
                          <div className="text-sm">Target: <span className="font-semibold">{(() => { const tt = t; if (!tt) return 'ÔÇö'; if (tt.kind==='ANY_NUMBER') return 'Any'; if (tt.kind==='BULL') return 'Bull'; if (tt.kind==='DOUBLE' || tt.kind==='TRIPLE' || tt.kind==='NUMBER') return `${tt.kind} ${(tt as any).num}`; return 'ÔÇö' })()}</span></div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyHalveAuto(value, r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyHalveAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'High-Low' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); ensureHighLow(pid); const st = highlowById[pid] || createHighLow(); return (
                        <>
                          <div className="text-sm mb-2">High-Low ÔÇö Round {st.round} ÔÇó Target {st.target} ÔÇó Score {st.score}</div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyHighLowAuto(value, r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyHighLowAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'Killer' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); match.players.forEach(p=>ensureKiller(p.id)); const st = killerById[pid]; return (
                        <>
                          <div className="text-xs mb-1.5">Killer ÔÇö Hit your own double to become Killer; then remove othersÔÇÖ lives by hitting their doubles/triples.</div>
                          <div className="mb-1 text-sm flex items-center justify-between"><span>Your number</span><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{st?.number || 'ÔÇö'}</span></div>
                          <div className="text-sm">Lives: <span className="font-semibold">{st?.lives ?? 'ÔÇö'}</span> {st?.isKiller ? <span className="ml-2 text-emerald-300">KILLER</span> : null}</div>
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1 text-[11px]">
                            {match.players.map(pp => {
                              const s = killerById[pp.id]
                              return (
                                <div key={pp.id} className="p-1 rounded bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
                                  <span className="opacity-80 truncate">{pp.name}</span>
                                  <span className="font-mono">{s ? `#${s.number} = ${s.lives}ÔØñ${s.isKiller?' = K':''}` : 'ÔÇö'}</span>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 my-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyKillerAuto(r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyKillerAuto('SINGLE', Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                      <div className="text-xs opacity-70">Tip: Only doubles/triples on the opponentsÔÇÖ numbers remove lives. To become Killer, hit your own double.</div>
                    </div>
                  ) : (user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      <div className="text-sm mb-2">{currentGame} (online) ÔÇö manual turn entry</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => {
                          const v = Math.max(0, visitScore|0)
                          match.addVisit(v, 3)
                          setVisitScore(0)
                          match.nextPlayer()
                          sendState()
                        }}>Submit</button>
                        <button className="btn bg-slate-700 hover:bg-slate-800" onClick={() => { match.undoVisit(); sendState(); }}>Undo</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/40 text-center text-slate-300 font-semibold">WAITING TO THROW</div>
                  )}
                </div>
                <div className="md:col-span-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button className="btn px-2 py-0.5 text-xs" onClick={()=>setShowQuick(true)}>Quick Chat</button>
                    <button className="btn px-2 py-0.5 text-xs" onClick={()=>setShowMessages(true)}>Messages</button>
                  </div>
                </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Match modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 z-50">
          <div className="w-full h-full flex items-stretch justify-stretch p-0">
            <ResizableModal storageKey="ndn:modal:create-match" className="w-full h-full rounded-none !border-0 !shadow-none relative" fullScreen>
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-900/80 backdrop-blur border-b border-slate-700 z-10 px-2 py-2">
                <h3 className="text-xl font-bold">Create Match</h3>
              </div>
              <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 overflow-auto px-2 flex-1 min-h-0">
              <div className="col-span-1">
                <label className="block text-sm text-slate-300 mb-1">Game</label>
                <select className="input w-full" value={game} onChange={e=>setGame(e.target.value as any)}>
                  {allGames.map(g => (
                    <option key={g} value={g} disabled={!user?.fullAccess && (premiumGames as readonly string[]).includes(g)}>
                      {g} {!user?.fullAccess && (premiumGames as readonly string[]).includes(g) ? '(PREMIUM)' : ''}
                    </option>
                  ))}
                </select>
                {/* Calibration Status - displayed below game selector */}
                <div className="mt-2">
                  <GameCalibrationStatus 
                    gameMode={game} 
                    compact={true}
                  />
                </div>
              </div>
              <div className="col-span-1">
                <label className="block text-sm text-slate-300 mb-1">Mode</label>
                <select className="input w-full" value={mode} onChange={e=>setMode(e.target.value as any)}>
                  <option value="bestof">Best Of</option>
                  <option value="firstto">First To</option>
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-sm text-slate-300 mb-1">Value</label>
                {game === 'X01' ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {[101, 201, 301, 401, 501].map(val => (
                        <button
                          key={val}
                          className={`btn px-2 py-1 text-xs ${modeValue === val ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                          onClick={() => setModeValue(val)}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                    <input className="input w-full" type="number" min={1} value={modeValue} onChange={e=>setModeValue(parseInt(e.target.value||'1'))} placeholder="Or enter custom value" />
                  </div>
                ) : (
                  <input className="input w-full" type="number" min={1} value={modeValue} onChange={e=>setModeValue(parseInt(e.target.value||'1'))} />
                )}
                <div className="text-xs opacity-70 mt-1">Example: Best Of 5 — first to 3</div>
              </div>
              <div className="col-span-1">
                <label className="block text-sm text-slate-300 mb-1">Starting Score</label>
                {game === 'X01' ? (
                  <select className="input w-full" value={startScore} onChange={e=>setStartScore(parseInt(e.target.value||'501'))}>
                    {[301, 501, 701].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <div className="text-xs opacity-70 mt-1">Starting score applies to X01 only</div>
                )}
              </div>
              {game === 'X01' && (
                <div className="col-span-1">
                  <label className="block text-sm text-slate-300 mb-1">X01 Rules</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="create-x01di"
                      type="checkbox"
                      className="accent-purple-500"
                      checked={!!createX01DoubleIn}
                      onChange={e=> setCreateX01DoubleIn(e.target.checked)}
                    />
                    <label htmlFor="create-x01di" className="text-sm opacity-80">Require Double-In</label>
                  </div>
                </div>
              )}
              {game === 'Treble Practice' && (
                <div className="col-span-1">
                  <label className="block text-sm text-slate-300 mb-1">Throws per game</label>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                      {[9, 12, 18, 30, 60].map(val => (
                        <button
                          key={val}
                          className={`btn px-2 py-1 text-xs ${createTrebleMaxDarts === val ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                          onClick={() => setCreateTrebleMaxDarts(val)}
                        >
                          {val}
                        </button>
                      ))}
                      <button
                        className={`btn px-2 py-1 text-xs ${createTrebleMaxDarts === 0 ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                        onClick={() => setCreateTrebleMaxDarts(0)}
                        title="Unlimited"
                      >
                        ∞
                      </button>
                    </div>
                    <input
                      className="input w-full"
                      type="number"
                      min={0}
                      placeholder="0 = unlimited"
                      value={createTrebleMaxDarts}
                      onChange={e=> setCreateTrebleMaxDarts(Math.max(0, parseInt(e.target.value||'0')))}
                    />
                  </div>
                </div>
              )}
              <div className="col-span-1">
                <label className="block text-sm text-slate-300 mb-1">Require Calibration</label>
                <div className="flex items-center gap-2">
                  <input id="calibreq" type="checkbox" className="accent-purple-500" checked={requireCalibration} onChange={e=>setRequireCalibration(e.target.checked)} />
                  <label htmlFor="calibreq" className="text-sm opacity-80">Players must be calibrated</label>
                </div>
              </div>
              <div className="col-span-1">
                <div className="p-3 rounded-lg bg-black/20 border border-slate-700/40">
                  <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">Summary</div>
                  <div className="text-sm font-semibold">{game} — {mode==='bestof' ? `Best Of ${modeValue}` : `First To ${modeValue}`} {game==='X01' ? `— ${startScore}` : ''}</div>
                  {game==='X01' && (
                    <div className="text-xs opacity-80 mt-1">Double-In: {createX01DoubleIn ? 'On' : 'Off'}</div>
                  )}
                  {game==='Treble Practice' && (
                    <div className="text-xs opacity-80 mt-1">Throws per game: {createTrebleMaxDarts || 'Unlimited'}</div>
                  )}
                  {!user?.fullAccess && (premiumGames as readonly string[]).includes(game) && (
                    <div className="text-xs text-rose-300 mt-1">PREMIUM required</div>
                  )}
                </div>
                </div>
              </div>
              <div className="sticky bottom-0 bg-slate-900/80 backdrop-blur border-t border-slate-700 z-10 px-2 py-2">
                <button className="btn w-full" disabled={!user?.fullAccess && (premiumGames as readonly string[]).includes(game)} title={!user?.fullAccess && (premiumGames as readonly string[]).includes(game) ? 'PREMIUM game' : ''} onClick={()=>{
                  const creatorAvg = user?.username ? getAllTimeAvg(user.username) : 0
                  // If Treble Practice, apply the configured max darts locally and include in payload
                  if (game === 'Treble Practice') {
                    setTrebleMaxDarts(Math.max(0, createTrebleMaxDarts|0))
                  }
                  // If X01, apply the Double-In per-match rule locally and include in payload
                  if (game === 'X01') {
                    setX01DoubleInMatch(!!createX01DoubleIn)
                  }
                  const payload: any = { type: 'create-match', game, mode, value: modeValue, startingScore: startScore, creatorAvg, requireCalibration }
                  if (game === 'Treble Practice') {
                    payload.trebleMaxDarts = Math.max(0, createTrebleMaxDarts|0)
                  }
                  if (game === 'X01') {
                    payload.x01DoubleIn = !!createX01DoubleIn
                  }
                  if (wsGlobal) {
                    wsGlobal.send(payload)
                    setShowCreate(false)
                    wsGlobal.send({ type: 'list-matches' })
                  } else {
                    wsRef.current?.send(JSON.stringify(payload))
                    setShowCreate(false)
                    wsRef.current?.send(JSON.stringify({ type: 'list-matches' }))
                  }
                }}>START GAME!</button>
                <div className="flex justify-center mt-2">
                  <button className="btn px-2 py-1" onClick={()=>setShowCreate(false)}>Close</button>
                </div>
              </div>
            </ResizableModal>
          </div>
        </div>
      )}

      {/* Invitation modal for creator */}
      {pendingInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <ResizableModal storageKey="ndn:modal:invite" className="w-full relative" defaultWidth={620} defaultHeight={420} minWidth={520} minHeight={320} maxWidth={1000} maxHeight={800} initialFitHeight>
            <h3 className="text-xl font-bold mb-1">Incoming Match Request</h3>
            <div className="text-sm mb-2">
              <span className="font-semibold">{pendingInvite.fromName}</span> wants to join your match.
              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${pendingInvite.calibrated ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/30' : 'bg-amber-500/20 text-amber-200 border border-amber-600/30'}`}>
                {pendingInvite.calibrated ? 'Calibrated' : 'Not calibrated'}
              </span>
            </div>
            {(pendingInvite.game || pendingInvite.mode) && (
              <div className="text-xs opacity-80 mb-3">
                {pendingInvite.game || 'X01'} ÔÇó {pendingInvite.mode==='firstto' ? `First To ${pendingInvite.value}` : `Best Of ${pendingInvite.value}`} {pendingInvite.game==='X01' && pendingInvite.startingScore ? `ÔÇó ${pendingInvite.startingScore}` : ''}
              </div>
            )}
            {/* End-of-match modal for Online/Tournament */}
            {showX01EndSummary && (
              <MatchSummaryModal
                open={showX01EndSummary}
                onClose={() => setShowX01EndSummary(false)}
                title="Match Summary"
                players={match.players || []}
                doublesStats={doublesStats}
                centerScore={(() => {
                  const ps = match.players || []
                  return ps.length===2 ? `${ps[0]?.legsWon||0} – ${ps[1]?.legsWon||0}` : ''
                })()}
              />
            )}
            {pendingInvite.boardPreview ? (
              <div className="mb-3">
                <img src={pendingInvite.boardPreview} alt="Board preview" className="rounded-lg w-full max-h-64 object-contain bg-black/40 border border-slate-700" />
              </div>
            ) : (
              <div className="mb-3 text-xs opacity-60">No camera preview provided.</div>
            )}
            <div className="flex gap-2">
              <button className="btn bg-emerald-600 hover:bg-emerald-700" onClick={()=>{
                if (wsGlobal) wsGlobal.send({ type: 'invite-response', matchId: pendingInvite.matchId, accept: true, toId: pendingInvite.fromId })
                else wsRef.current?.send(JSON.stringify({ type: 'invite-response', matchId: pendingInvite.matchId, accept: true, toId: pendingInvite.fromId }))
                setPendingInvite(null)
              }}>Accept</button>
              <button className="btn bg-rose-600 hover:bg-rose-700" onClick={()=>{
                if (wsGlobal) wsGlobal.send({ type: 'invite-response', matchId: pendingInvite.matchId, accept: false, toId: pendingInvite.fromId })
                else wsRef.current?.send(JSON.stringify({ type: 'invite-response', matchId: pendingInvite.matchId, accept: false, toId: pendingInvite.fromId }))
                setPendingInvite(null)
              }}>Decline</button>
            </div>
          </ResizableModal>
        </div>
      )}

      {/* Quick Chat popup */}
      {showQuick && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <ResizableModal
            storageKey="ndn:modal:quick-chat"
            className="w-full relative"
            defaultWidth={520}
            defaultHeight={280}
            minWidth={360}
            minHeight={220}
            maxWidth={900}
            maxHeight={700}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Quick Chat</h3>
              <button className="btn px-2 py-1 text-sm" onClick={()=>setShowQuick(false)}>Close</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Good luck!','Good game!','Nice darts!','Well played!','Ready?'].map((m) => (
                <button key={m} className="btn px-2 py-0.5 text-xs" onClick={()=>{ sendQuick(m); setShowQuick(false) }} disabled={!connected}>{m}</button>
              ))}
            </div>
          </ResizableModal>
        </div>
      )}

      {/* Messages popup */}
      {showMessages && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <ResizableModal
            storageKey="ndn:modal:messages"
            className="w-full relative"
            defaultWidth={560}
            defaultHeight={360}
            minWidth={380}
            minHeight={260}
            maxWidth={1000}
            maxHeight={800}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Messages</h3>
              <button className="btn px-2 py-1 text-sm" onClick={()=>setShowMessages(false)}>Close</button>
            </div>
            <ChatList
              className="flex-1 min-h-0"
              items={chat
                .slice(-30)
                .filter((m) => !blocklist.isBlocked(String(m.fromId || '')))
                .map((m, i) => ({ key: String(i), from: m.from, id: String(m.fromId || m.from), text: m.message }))}
              onDelete={(idx) => setChat(prev => prev.filter((_, i) => i !== idx))}
              onReport={(idx) => {
                const pool = chat.slice(-30).filter((m) => !blocklist.isBlocked(String(m.fromId || '')))
                const item = pool[idx]
                if (!item) return
                reportMessage(null, item.message)
              }}
              onBlock={(idx) => {
                const pool = chat.slice(-30).filter((m) => !blocklist.isBlocked(String(m.fromId || '')))
                const item = pool[idx]
                if (!item) return
                try { blocklist.block(String(item.fromId || item.from)) } catch {}
                setChat(prev => prev.filter(m => String(m.fromId || m.from) !== String(item.fromId || item.from)))
                try { toast(`${item.from} blocked`, { type: 'info' }) } catch {}
              }}
            />
          </ResizableModal>
        </div>
      )}
      </div>
    </div>
  )
}

// Small, self-contained chat list with moderation affordances
function ChatList({ items, onDelete, onReport, onBlock, className }: { items: { key: string; from: string; id?: string; text: string }[]; onDelete: (index: number) => void; onReport: (index: number) => void; onBlock?: (index: number) => void; className?: string }) {
  const mobile = (() => { try { const ua = navigator.userAgent || ''; return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) } catch { return false } })()
  const [touch, setTouch] = useState<{ x: number; y: number; i: number; t: number } | null>(null)
  const [swiped, setSwiped] = useState<number | null>(null)
  return (
    <div className={`overflow-auto text-sm divide-y divide-slate-700/40 ${className || 'h-24'}`}>
      {items.length === 0 ? (
        <div className="opacity-60 py-1">No messages yet.</div>
      ) : items.map((m, i) => {
        const text = censorProfanity(m.text)
        const flagged = containsProfanity(m.text)
        return (
          <div
            key={m.key}
            className="relative group px-1 py-1 flex items-start gap-2"
            onTouchStart={mobile ? (e) => { const t = e.touches[0]; setTouch({ x: t.clientX, y: t.clientY, i, t: Date.now() }) } : undefined}
            onTouchMove={mobile ? (e) => { if (!touch || touch.i !== i) return; const t = e.touches[0]; const dx = t.clientX - touch.x; if (dx < -40) setSwiped(i) } : undefined}
            onTouchEnd={mobile ? () => { const held = touch ? (Date.now() - touch.t) : 0; if (swiped === i || held > 600) { onDelete(i); setSwiped(null) } setTouch(null) } : undefined}
          >
            <span className="text-slate-400 shrink-0">[{m.from}]</span>
            <span className="text-white break-words whitespace-pre-wrap flex-1">{text}</span>
            {/* Desktop delete (red X) and Report/Block */}
            {!mobile && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-2">
                <button
                  className="w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs flex items-center justify-center"
                  title="Delete message"
                  aria-label="Delete message"
                  onClick={() => onDelete(i)}
                >├ù</button>
                {onBlock && (
                  <button
                    className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-800 text-slate-100 text-[11px]"
                    onClick={() => onBlock(i)}
                    title="Block sender"
                  >Block</button>
                )}
                <button
                  className="px-1.5 py-0.5 rounded bg-amber-600/40 hover:bg-amber-600/60 text-amber-100 text-[11px]"
                  onClick={() => onReport(i)}
                  title="Report message"
                >Report</button>
              </div>
            )}
            {/* Flag badge if profanity detected */}
            {flagged && <span className="ml-2 text-[10px] px-1 rounded bg-rose-600/30 text-rose-200 border border-rose-600/40">Filtered</span>}
          </div>
        )
      })}
      
      {/* Phone camera overlay moved to global App header for consistency */}
    </div>
  )
}
