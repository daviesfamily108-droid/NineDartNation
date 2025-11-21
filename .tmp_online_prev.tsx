// Modal state for in-game view (to match OfflinePlay)
const [fitAll, setFitAll] = useState(false);
const [fitScale, setFitScale] = useState(1);
const [maximized, setMaximized] = useState(false);
const [inMatch, setInMatch] = useState(false);
const headerBarRef = useRef<HTMLDivElement>(null);
const contentRef = useRef<HTMLDivElement>(null);

// Sync fitScale with fitAll (simple example, can be improved)
useEffect(() => {
  if (fitAll) setFitScale(0.85);
  else setFitScale(1);
}, [fitAll]);

// Dummy startMatch for Restart button (should reset match state as needed)
function startMatch() {
  // TODO: Implement actual match restart logic
  window.location.reload();
}
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
        </div>
      </div>
    );
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
    {showStartShowcase && <MatchStartShowcase players={match.players || []} user={user} onDone={() => setShowStartShowcase(false)} />}
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
          {/* Filters and rest of the lobby code remain as before */}
        </div>
      )}
    </div>
  
  );
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 backdrop-blur-sm bg-slate-900/40" />
          <div className="relative z-10 p-4 rounded-xl bg-black/60 border border-slate-700 text-center">
            <div className="text-3xl mb-2">🔒</div>
            <div className="font-semibold">Online play locked</div>
            <div className="text-sm text-slate-200/80">You’ve used your 3 free online games this week. Upgrade to PREMIUM to play all modes.</div>
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
        <ResizableModal
          className="relative flex flex-col overflow-hidden"
          defaultWidth={1100}
          defaultHeight={720}
          minWidth={720}
          minHeight={480}
          maxWidth={1600}
          maxHeight={1200}
          initialFitHeight
          fullScreen={maximized}
        >
          <div className="flex-1 min-h-0 overflow-x-hidden pr-1 pt-2 pb-2" style={{ overflowY: 'scroll' }}>
            <div ref={(el)=>{ (headerBarRef as any).current = el }}>
              <GameHeaderBar
                left={(
                  <>
                    <span className="hidden xs:inline px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[10px] sm:text-xs">Game Mode</span>
                    <span className="font-medium whitespace-nowrap">{currentGame}{currentGame==='X01' ? ` / ${match.startingScore}` : ''}</span>
                    <span className="opacity-80 whitespace-nowrap">Legs {match.players?.[0]?.legsWon || 0}–{match.players?.[1]?.legsWon || 0}</span>
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
                    <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={() => setShowMatchModal(false)}>Close</button>
                  </>
                )}
              />
            </div>
            <div
              ref={(el) => { (contentRef as any).current = el }}
              className="will-change-transform"
              style={fitAll ? { transform: `scale(${fitScale})`, transformOrigin: 'top left', width: '100%', fontSize: `${Math.max(0.8, Math.min(1, fitScale))}em` } : undefined}
            >
              {/* Modern unified header bar, matching OfflinePlay */}
              <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                <h3 className="text-xl font-bold leading-tight mr-2">{currentGame === 'X01' ? 'Online Match' : currentGame}</h3>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">Mode: {currentGame}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">Start: {match.startingScore}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">Legs: {match.players?.[0]?.legsWon || 0}–{match.players?.[1]?.legsWon || 0}</span>
                <span className="ml-auto flex items-center gap-1 text-[10px] flex-wrap">
                  <span className="opacity-70">Match</span>
                  <select className={`btn ${buttonSizeClass}`} value={matchType} onChange={e=>setMatchType((e.target.value as 'singles'|'doubles'))}>
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                  <input className={`input ${buttonSizeClass} w-[7.5rem]`} value={teamAName} onChange={e=>setTeamAName(e.target.value)} placeholder="Team A" />
                  <span className="opacity-50">vs</span>
                  <input className={`input ${buttonSizeClass} w-[7.5rem]`} value={teamBName} onChange={e=>setTeamBName(e.target.value)} placeholder="Team B" />
                </span>
              </div>
              {/* Toolbar buttons, matching OfflinePlay */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button className="btn btn--ghost px-3 py-1 text-sm" title={fitAll ? 'Actual Size' : 'Fit All'} onClick={() => setFitAll(v => !v)}>{fitAll ? 'Actual Size' : 'Fit All'}</button>
                <button className="btn btn--ghost px-3 py-1 text-sm" title={maximized ? 'Restore' : 'Maximize'} onClick={() => setMaximized(m => !m)}>{maximized ? 'Restore' : 'Maximize'}</button>
                <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={() => { startMatch() }}>Restart</button>
                <button className="btn bg-rose-600 hover:bg-rose-700 px-3 py-1 text-sm" onClick={() => { setShowMatchModal(false); setInMatch(false); }}>Quit</button>
              </div>
              {/* Summary area and all modal content */}
              {/* ...existing summary and controls content... */}
              {/* Place all the modal content here, up to the end of the modal */}
              {/* The rest of the modal content is already present and will be closed below */}
            </div>
          </div>
        </ResizableModal>
      )}
  </div>
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


}
