// Online play screen (renders CameraView)
import React, { useEffect, useMemo, useRef, useState } from 'react'
import CameraView from './CameraView.js'
import InGameShell from './InGameShell.js'
import ResizablePanel from './ui/ResizablePanel.js'
import { suggestCheckouts, sayScore } from '../utils/checkout.js'
import { addSample, getAllTimeAvg } from '../store/profileStats.js'
import MatchStartShowcase from './ui/MatchStartShowcase.js'
import { getFreeRemaining, incOnlineUsage } from '../utils/quota.js'
import { useUserSettings } from '../store/userSettings.js'
import { useCalibration } from '../store/calibration.js'
import { useMatch } from '../store/match.js'
import MatchSummaryModal from './MatchSummaryModal.js'
import { freeGames, premiumGames, allGames, type GameKey } from '../utils/games.js'
import { getUserCurrency, formatPriceInCurrency } from '../utils/config.js'
import ResizableModal from './ui/ResizableModal.js'
import GameHeaderBar from './ui/GameHeaderBar.js'
import { useToast } from '../store/toast.js'
// import { TabKey } from './Sidebar.js'
import { useWS } from './WSProvider.js'
import { useMessages } from '../store/messages.js'
import { censorProfanity, containsProfanity } from '../utils/profanity.js'
import { useBlocklist } from '../store/blocklist.js'
import TabPills from './ui/TabPills.js'
import { DOUBLE_PRACTICE_ORDER, isDoubleHit, parseManualDart, ringSectorToDart } from '../game/types.js'
import { ATC_ORDER } from '../game/aroundTheClock.js'
import { createCricketState, applyCricketDart, CRICKET_NUMBERS, hasClosedAll as cricketClosedAll, cricketWinner } from '../game/cricket.js'
import { createShanghaiState, getRoundTarget as shanghaiTarget, applyShanghaiDart, endShanghaiTurn } from '../game/shanghai.js'
import { createDefaultHalveIt, getCurrentHalveTarget, applyHalveItDart, endHalveItTurn } from '../game/halveIt.js'
import { createHighLow, applyHighLowDart, endHighLowTurn } from '../game/highLow.js'
import { assignKillerNumbers, createKillerState, applyKillerDart, killerWinner } from '../game/killer.js'
import { apiFetch } from '../utils/api.js'
// Phase 2 premium games (Online support)
import { createAmCricketState, applyAmCricketDart, AM_CRICKET_NUMBERS } from '../game/americanCricket.js'
import { createBaseball, applyBaseballDart } from '../game/baseball.js'
import { createGolf, applyGolfDart, GOLF_TARGETS } from '../game/golf.js'
import { createTicTacToe, tryClaimCell, TTT_TARGETS } from '../game/ticTacToe.js'
import { useMatchControl } from '../store/matchControl.js'
import GameScoreboard from './scoreboards/GameScoreboard.js'
import { makeOnlineAddVisitAdapter } from './matchControlAdapters.js'
import { applyVisitCommit } from '../logic/applyVisitCommit.js'
import { useOnlineGameStats } from './scoreboards/useGameStats.js'
import { getWsCandidates } from '../utils/ws.js'
import { getPreferredUserName } from '../utils/userName.js'
import PauseOverlay from './ui/PauseOverlay.js'

export default function OnlinePlay({ user, initialCameraTab }: { user?: any; initialCameraTab?: 'connection' | 'preview' }) {
  const toast = useToast();
  const match = useMatch();
  const wsGlobal = useWS();
  const wsRef = useRef<WebSocket | null>(null);
  const [roomAutocommit, setRoomAutocommit] = useState(false);
  // forward-declare so handlers defined earlier can call it
  let startMobileWebRTC: (code: string) => Promise<void> = async () => { return }
  const blocklist = useBlocklist();
  const localPlayerName = useMemo(() => getPreferredUserName(user, 'You'), [user]);
  const callerName = useMemo(() => getPreferredUserName(user, 'Player'), [user]);

  // ...existing code...

  // ...existing code...

  // Place this after all hooks/variables:
  function sendState() {
    try {
      if (wsGlobal && (wsGlobal as any).connected) {
        wsGlobal.send({ type: 'sync', match })
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'sync', match }))
      }
    } catch (err) {
      // Optionally log or toast error
    }
  }

  // Request a mobile pairing code from server
  function requestPairingCode(persistent = false) {
    try {
      const payload: any = { type: 'cam-create' }
      if (persistent) payload.persistent = true
      if (wsGlobal && (wsGlobal as any).connected) {
        wsGlobal.send(payload)
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload))
      } else {
        // No WS available
        toast?.('Not connected to server. Unable to request pairing code.', { type: 'error' })
        return
      }
      toast?.('Requested pairing code — check the Camera panel for the code', { type: 'info' })
    } catch (err) {
      try { toast?.('Failed to request pairing code', { type: 'error' }) } catch {}
    }
  }
  const [roomId, setRoomId] = useState('room-1')
  const [connected, setConnected] = useState(false)
  const [chat, setChat] = useState<{from:string;message:string; fromId?: string}[]>([])
  const [showQuick, setShowQuick] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  // Track last locally-sent chat to avoid duplicating when the server echoes it back
  const lastSentChatRef = useRef<{ text: string; ts: number } | null>(null)
  const [selfId, setSelfId] = useState<string | null>(null)
  const [roomCreatorId, setRoomCreatorId] = useState<string | null>(null)
  // Reconnect handling
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const lastToastRef = useRef(0)
  const firstConnectDoneRef = useRef(false)
  const msgs = useMessages()
  const { favoriteDouble, callerEnabled, callerVoice, callerVolume, speakCheckoutOnly, allowSpectate, cameraScale, setCameraScale, cameraFitMode = 'fill', setCameraFitMode, cameraEnabled, textSize, boxSize, autoscoreProvider, matchType = 'singles', setMatchType, teamAName = 'Team A', setTeamAName, teamBName = 'Team B', setTeamBName, x01DoubleIn: defaultX01DoubleIn, preferredCameraId, setPreferredCamera } = useUserSettings()
  const setCameraEnabled = useUserSettings.getState().setCameraEnabled
  const manualScoring = autoscoreProvider === 'manual'
  useEffect(() => {
    if (cameraFitMode !== 'fit') {
      setCameraFitMode('fit')
    }
  }, [cameraFitMode, setCameraFitMode])

  useEffect(() => {
    try {
      setCameraEnabled(true)
    } catch (err) {
      console.error('[OnlinePlay] Failed to force-enable camera:', err)
    }
  }, [setCameraEnabled])

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
  // Layout controls (mirror OfflinePlay)
  const [maximized, setMaximized] = useState(false)
  const [fitAll, setFitAll] = useState(false)
  const [fitScale, setFitScale] = useState(1)
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
  const [pairingPending, setPairingPending] = useState(false)
  const [pairingExpiryAt, setPairingExpiryAt] = useState<number | null>(null)
  const pairingTimerRef = useRef<number | null>(null)
  const pairingPendingTimeoutRef = useRef<number | null>(null)
  const [cameraTab, setCameraTab] = useState<'connection' | 'preview'>(initialCameraTab ?? 'connection')
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraAccessError, setCameraAccessError] = useState<string | null>(null)
  // Copy pairing code to clipboard
  async function copyPairingCode() {
    if (!pairingCode) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pairingCode)
      } else {
        const ta = document.createElement('textarea')
        ta.value = pairingCode
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      try { toast('Pairing code copied to clipboard', { type: 'success' }) } catch {}
    } catch (err) {
      try { toast('Failed to copy pairing code', { type: 'error' }) } catch {}
    }
  }
  const [pairCountdown, setPairCountdown] = useState<number>(0)
  useEffect(() => {
    return () => {
      try { if (pairingTimerRef.current) window.clearInterval(pairingTimerRef.current) } catch {}
      try { if (pairingPendingTimeoutRef.current) window.clearTimeout(pairingPendingTimeoutRef.current) } catch {}
    }
  }, [])
  useEffect(() => {
    if (cameraTab !== 'connection') return
    refreshCameraDeviceList()
  }, [cameraTab])
  useEffect(() => {
    if (!initialCameraTab) return
    setCameraTab(initialCameraTab)
  }, [initialCameraTab])
  async function refreshCameraDeviceList() {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) {
        setCameraAccessError('not-supported')
        return
      }
      const list = await navigator.mediaDevices.enumerateDevices()
      setAvailableCameras(list.filter((d) => d.kind === 'videoinput'))
      setCameraAccessError(null)
    } catch (err) {
      console.warn('[OnlinePlay] enumerateDevices failed:', err)
      setCameraAccessError('enumerate-failed')
    }
  }
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
  // New: Track if all darts thrown and waiting for removal
  const [awaitingDartRemoval, setAwaitingDartRemoval] = useState(false)
  const dartRemovalTimerRef = useRef<NodeJS.Timeout | null>(null)
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
      match.newMatch([localPlayerName, 'Opponent'], 101, 'local-dev')
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
  const containsIntegrationMarker = (value: unknown) => {
    if (typeof value === "string") {
      return value.toLowerCase().includes("integration");
    }
    if (typeof value === "number") {
      return value.toString().toLowerCase().includes("integration");
    }
    return false;
  };

  const isIntegrationLobbyEntry = (entry: any) => {
    if (!entry) return false;
    const candidates = [
      entry.title,
      entry.name,
      entry.game,
      entry.mode,
      entry.createdBy,
      entry.creator,
      entry.creatorName,
      entry.id,
    ];
    return candidates.some((value) => containsIntegrationMarker(value));
  };

  const filteredLobby = (lobby || []).filter((m:any) => {
    if (filterMode !== 'all' && m.mode !== filterMode) return false
    if (filterStart !== 'all' && Number(m.startingScore) !== Number(filterStart)) return false
    if (filterGame !== 'all' && m.game !== filterGame) return false
    if (nearAvg) {
      if (!myAvg || !m.creatorAvg) return false
      const diff = Math.abs(Number(m.creatorAvg) - Number(myAvg))
      if (diff > avgTolerance) return false
    }
    if (isIntegrationLobbyEntry(m)) return false
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
    (async () => {
      try {
        const res = await apiFetch(`/api/friends/messages?email=${encodeURIComponent(email)}`);
        if (!res || !res.ok) return;
        const d = await res.json();
        if (d?.ok && Array.isArray(d.messages)) msgs.load(d.messages)
      } catch (e) {
        // Swallow errors - apiFetch now short-circuits on repeated failures
      }
    })();
  }, [user?.email])

  // Demo: open a populated Online Match view with fake data (local-only)
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const d = e?.detail || {}
        const start = Number(d.start || 501)
        // Create a quick local match with two players
        match.newMatch([localPlayerName, 'Opponent'], start, roomId)
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
    try {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      )
        return
    } catch {}

    // Centralized endpoint selection: respects VITE_WS_URL and safe remote fallbacks
    const candidates = getWsCandidates()
    const url = candidates[0]
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
        // update local room autocommit flag if server sends it (default false otherwise)
        try { setRoomAutocommit(!!data.match?.allowAutocommit) } catch {}
        // Auto-join the room
        ws.send(JSON.stringify({ type: 'join', roomId: data.roomId }))
        // remember creator id for host-only toggles
        if (data.match?.creatorId) setRoomCreatorId(String(data.match.creatorId))
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
        const ts = data.ts || Date.now()
        const id = data.id || `${ts}-${data.from}`
        const from = String(data.from || '').toLowerCase()
        const to = String(data.to || user?.email || '').toLowerCase()
        const message = String(data.message || '')
        msgs.add({ id, from, message, ts })
        try {
          const other = from === String(user?.email || '').toLowerCase() ? to : from
          if (other) msgs.pushThread(other, { id, from, to, message, ts, readBy: [from] })
        } catch {}
        // Show toast only if not currently in a game
        if (!match.inProgress) toast(`${data.from}: ${data.message}`, { type: 'info' })
      } else if (data.type === 'celebration') {
        const who = data.by || 'Player'
        const kind = data.kind === 'leg' ? 'leg' : '180'
        triggerCelebration(kind, who)
      } else if (data.type === 'cam-code') {
            console.log('Received cam-code:', data.code)
            setPairingCode(data.code)
      setPairingPending(false)
      try { if (pairingPendingTimeoutRef.current) window.clearTimeout(pairingPendingTimeoutRef.current) } catch {}
            // expiry (2 minutes)
            const expiryMs = 120 * 1000
            const at = Date.now() + expiryMs
            setPairingExpiryAt(at)
            toast(`Pairing code: ${data.code}`, { type: 'info' })
            // start countdown interval (clears any existing)
            try { if (pairingTimerRef.current) window.clearInterval(pairingTimerRef.current) } catch {}
            pairingTimerRef.current = window.setInterval(() => {
              const rem = Math.max(0, Math.ceil((at - Date.now()) / 1000))
              setPairCountdown(rem)
              if (rem <= 0) {
                try { if (pairingTimerRef.current) window.clearInterval(pairingTimerRef.current) } catch {}
                pairingTimerRef.current = null
                setPairingCode(null)
                setPairingExpiryAt(null)
              }
            }, 1000) as unknown as number
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
      } else if (data.type === 'match-autocommit-updated') {
        try { setRoomAutocommit(!!data.allow) } catch {}
      } else if (data.type === 'visit-commit') {
        try {
          // received server-validated visit commit; apply locally using
          // authoritative visit payload (preferred) or fall back to legacy fields
          const visit = data.visit || { value: data.value, darts: data.darts };
          try {
            // applyVisitCommit will avoid double-applying a visit if it's already present
            const res = applyVisitCommit(useMatch.getState(), visit);
            // If the server visit indicates a perfect 180 or finishes a leg we might
            // want to trigger local celebrations (best-effort)
            try {
              const vt = Number(visit?.value ?? visit?.score ?? 0) || Number(visit?.visitTotal ?? 0);
              if (vt === 180) {
                const p = useMatch.getState().players[useMatch.getState().currentPlayerIdx];
                try { triggerCelebration && triggerCelebration('180', p?.name || 'Player'); } catch {}
              }
            } catch (e) {}
          } catch (e) {
            // Fallback to legacy behavior
            try { submitVisitManual(Number(data.value || 0)); } catch {}
          }
        } catch (err) {}
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
  }
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
      setAwaitingDartRemoval(true)
      // Start 10s timer for auto-switch
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        match.nextPlayer(); sendState()
      }, 10000)
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
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        setShanghaiById(prev => {
          const copy = { ...prev }
          const st = { ...(copy[pid] || createShanghaiState()) }
          endShanghaiTurn(st)
          copy[pid] = st
          return copy
        })
        match.nextPlayer(); sendState()
      }, 10000)
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
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        setHalveById(prev => {
          const copy = { ...prev }
          const st = { ...(copy[pid] || createDefaultHalveIt()) }
          endHalveItTurn(st)
          copy[pid] = st
          return copy
        })
        match.nextPlayer(); sendState()
      }, 10000)
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
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        setHighlowById(prev => {
          const copy = { ...prev }
          const st = { ...(copy[pid] || createHighLow()) }
          endHighLowTurn(st)
          copy[pid] = st
          return copy
        })
        match.nextPlayer(); sendState()
      }, 10000)
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
    if (nd >= 3) {
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        match.nextPlayer(); sendState()
      }, 10000)
    } else { sendState() }
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
    if (nd >= 3) {
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        match.nextPlayer(); sendState()
      }, 10000)
    } else { sendState() }
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
    if (nd >= 3) {
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        match.nextPlayer(); sendState()
      }, 10000)
    } else { sendState() }
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
    if (nd >= 3) {
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        match.nextPlayer(); sendState()
      }, 10000)
    } else { sendState() }
  }

  function applyTttAuto(cell: number, value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setTTT(prev => {
      const cp = { ...prev, board: [...prev.board] as any }
      tryClaimCell(cp as any, (cell as any), value, ring as any, sector)
      return cp as any
    })
    const nd = turnDarts + 1
    setTurnDarts(nd)
    if (nd >= 3) {
      setAwaitingDartRemoval(true)
      if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      dartRemovalTimerRef.current = setTimeout(() => {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        match.nextPlayer(); sendState()
      }, 10000)
    } else { sendState() }
  }
  // Listen for dart removal event from CameraView
  useEffect(() => {
    function onDartsCleared() {
      if (awaitingDartRemoval) {
        setAwaitingDartRemoval(false)
        setTurnDarts(0)
        // End turn logic (advance player, send state)
        match.nextPlayer(); sendState()
        if (dartRemovalTimerRef.current) clearTimeout(dartRemovalTimerRef.current)
      }
    }
    window.addEventListener('ndn:darts-cleared', onDartsCleared)
    return () => window.removeEventListener('ndn:darts-cleared', onDartsCleared)
  }, [awaitingDartRemoval])

  // (Manual finalize removed — use camera auto-detect / server-driven events)

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
    sayScore(callerName, score, Math.max(0, rem), callerVoice, { volume: callerVolume, checkoutOnly: speakCheckoutOnly })
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
  startMobileWebRTC = async (code: string) => {
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

  // ── When a match is in progress, render the full in-game shell (same as offline) ──
  if (match.inProgress) {
    // Resolve local player index so both sides see the correct perspective
    const localIdx = (match.players || []).findIndex(
      (p: any) => p?.name && p.name === localPlayerName
    );
    return (
      <InGameShell
        user={user}
        showStartShowcase={showStartShowcase}
        onShowStartShowcaseChange={setShowStartShowcase}
        onCommitVisit={(score, _darts, _meta) => {
          submitVisitManual(score);
        }}
        onQuit={() => {
          try { match.endGame(); } catch {}
          sendState();
          try { window.dispatchEvent(new Event("ndn:match-quit")); } catch {}
        }}
        onStateChange={sendState}
        localPlayerIndexOverride={localIdx >= 0 ? localIdx : undefined}
        gameModeOverride={currentGame}
        isOnline={true}
      />
    );
  }

  // ── Lobby view (no match in progress) ──
  return (
    <div className="card ndn-game-shell ndn-page flex flex-col min-h-0 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold ndn-section-title">Online Play 🎮</h2>
      </div>
      <div className="ndn-shell-body overflow-visible flex-1 min-h-0">
        <div className="grid grid-cols-12 gap-4 min-h-[420px]">
          {/* Left column: toolbar + lobby (scrollable) */}
          <div className="col-span-12 md:col-span-4 flex flex-col gap-3">
            <div className="rounded-2xl bg-indigo-500/10 backdrop-blur border border-indigo-500/20 p-2 flex items-center gap-2">
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
            </div>

            <div className={`mt-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/40 ${(!connected || locked) ? 'opacity-60' : ''}`} role="button" title={!connected ? 'Connect to the lobby first' : (locked ? 'Weekly free games used' : 'Create a new match')} onClick={() => { if (!connected || locked) return; setShowCreate(true); if (wsGlobal) wsGlobal.send({ type: 'list-matches' }); else wsRef.current?.send(JSON.stringify({ type: 'list-matches' })) }}>
              <button className="btn" disabled={!connected || locked}>Create Match +</button>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-indigo-500/20 p-3 bg-indigo-500/5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">World Lobby</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs opacity-80">Matches: {filteredLobby.length}</div>
                  <button className="btn px-3 py-1 text-sm" onClick={()=> (wsGlobal ? wsGlobal.send({ type: 'list-matches' }) : wsRef.current?.send(JSON.stringify({ type: 'list-matches' })))}>Refresh</button>
                </div>
              </div>
              <ul className="space-y-2">
                {filteredLobby.map((m:any)=> (
                  <li key={m.id} className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                    <div className="text-sm">{m.game} · {m.mode} · {m.startingScore}</div>
                    <div className="text-xs opacity-70">{m.creator || 'host'}</div>
                  </li>
                ))}
                {filteredLobby.length === 0 && <li className="text-sm opacity-60">No matches found.</li>}
              </ul>
            </div>
          </div>

          {/* Center column: scoreboard / summary (match UI similar to Offline) */}
          <div className="col-span-12 md:col-span-4">
            <div className="flex flex-col gap-3">
              <GameHeaderBar
                left={(
                  <>
                    <span className="hidden xs:inline px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[10px] sm:text-xs">Game Mode</span>
                    <span className="font-medium whitespace-nowrap">{currentGame}{currentGame === 'X01' ? ` / ${match.startingScore}` : ''}</span>
                    <span className="opacity-80 whitespace-nowrap">Players: {match.players?.length || 0}</span>
                  </>
                )}
                right={(
                  <>
                    <button className="btn btn--ghost px-3 py-1 text-sm" title={fitAll ? 'Actual Size' : 'Fit All'} onClick={() => setFitAll(v => !v)}>{fitAll ? 'Actual Size' : 'Fit All'}</button>
                    <button className="btn btn--ghost px-3 py-1 text-sm" title={maximized ? 'Restore' : 'Maximize'} onClick={() => setMaximized(m => !m)}>{maximized ? 'Restore' : 'Maximize'}</button>
                  </>
                )}
              />

              <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/20 p-3 text-slate-100 shadow-lg backdrop-blur-sm">
                {/* Build players list for GameScoreboard */}
                {(() => {
                  const players = (match.players || []).map((p:any, i:number) => {
                    const leg = p.legs?.[p.legs.length-1]
                    const remaining = leg ? leg.totalScoreRemaining : match.startingScore
                    const last = leg?.visits?.[leg.visits.length-1]
                    return {
                      name: p.name || p.id || `Player ${i+1}`,
                      isCurrentTurn: (match.currentPlayerIdx || 0) === i,
                      legsWon: p.legsWon || 0,
                      score: remaining,
                      lastScore: last?.score ?? 0,
                      matchAvg: undefined,
                      allTimeAvg: undefined,
                    }
                  })
                  const matchScore = (match.players && match.players.length === 2) ? `${match.players[0]?.legsWon||0}-${match.players[1]?.legsWon||0}` : undefined
                  return <GameScoreboard gameMode={(currentGame as any)} players={players} matchScore={matchScore} />
                })()}
              </div>
            </div>
          </div>

          {/* Right column: camera / preview */}
          <div className="col-span-12 md:col-span-4">
            <div className="rounded-2xl p-3 border border-indigo-500/20 bg-indigo-500/5 h-full min-h-[200px]">
              <TabPills
                tabs={[
                  { key: 'connection', label: 'Camera Connection' },
                  { key: 'preview', label: 'Camera Preview' },
                ]}
                active={cameraTab}
                onChange={(key) => setCameraTab(key as 'connection' | 'preview')}
                className="mb-3"
              />
              {cameraTab === 'connection' && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Connect your camera</div>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn"
                        disabled={pairingPending || !!pairingCode || !connected}
                        onClick={() => {
                          try { setPairingPending(true) } catch {}
                          try { requestPairingCode(false) } catch {}
                          // clear any existing pending timeout
                          try { if (pairingPendingTimeoutRef.current) window.clearTimeout(pairingPendingTimeoutRef.current) } catch {}
                          pairingPendingTimeoutRef.current = window.setTimeout(() => { try { setPairingPending(false) } catch {} }, 8000) as unknown as number
                        }}
                        title={(!connected ? 'Connect to server' : (pairingCode ? 'Pairing code active' : 'Pair mobile camera'))}
                      >
                        {pairingPending ? 'Requesting…' : (pairingCode ? 'Paired' : 'Pair')}
                      </button>
                      {roomId && roomCreatorId && selfId === roomCreatorId && (
                        <label className="inline-flex items-center gap-2 ml-2">
                          <input
                            type="checkbox"
                            checked={roomAutocommit}
                            onChange={(e) => {
                              const v = e.target.checked
                              try { wsGlobal.send({ type: 'set-match-autocommit', roomId, allow: v }) } catch {}
                              setRoomAutocommit(v)
                            }}
                          />
                          <span className="ml-1 text-sm">Server autocommit</span>
                        </label>
                      )}
                    </div>
                  </div>
                  {pairingCode ? (
                    <div className="mb-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                      <div className="font-mono text-xl tracking-wider">{pairingCode}</div>
                      <div className="flex items-center gap-2">
                        <button className="btn btn--ghost" onClick={copyPairingCode}>Copy</button>
                        <div className="text-sm opacity-70">Expires in {pairCountdown}s</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm opacity-70 mb-2">
                      Pair your phone camera to continue, then switch to the preview tab.
                    </div>
                  )}
                    <div className="mt-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3">
                    <div className="text-sm font-semibold mb-2">Camera device</div>
                    <div className="text-xs opacity-70 mb-2">Choose the camera model you want to use (VERT, OBS, webcams, etc.).</div>
                    <div className="flex items-center gap-2">
                      <select
                        className="input flex-1"
                        value={preferredCameraId || ''}
                        onChange={(e) => {
                          const id = e.target.value || undefined
                          const label = availableCameras.find((d) => d.deviceId === id)?.label
                          try { setPreferredCamera(id, label || '', true) } catch {}
                        }}
                      >
                        <option value="">Auto (browser default)</option>
                        {availableCameras.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || (d.deviceId ? `Camera (${d.deviceId.slice(0, 6)})` : 'Camera')}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn--ghost btn-sm" onClick={refreshCameraDeviceList}>Rescan</button>
                    </div>
                    {availableCameras.length === 0 && (
                      <div className="mt-2 text-xs opacity-70">No cameras found. Grant camera permission and click Rescan.</div>
                    )}
                    {cameraAccessError === 'not-supported' && (
                      <div className="mt-2 text-xs text-rose-300">Camera selection is not supported in this browser.</div>
                    )}
                    {cameraAccessError === 'enumerate-failed' && (
                      <div className="mt-2 text-xs text-rose-300">Unable to list cameras. Allow camera access, then rescan.</div>
                    )}
                  </div>
                </>
              )}
              {cameraTab === 'preview' && (
                <CameraView
                  cameraAutoCommit="parent"
                  forceAutoStart
                  immediateAutoCommit={useUserSettings.getState().autoCommitMode === "immediate" && useUserSettings.getState().allowAutocommitInOnline}
                  onAddVisit={makeOnlineAddVisitAdapter(submitVisitManual)}
                  onAutoDart={(value: number, ring: any, info: any) => {
                    // For online matches, prefer server-side verification: send auto-visit to server
                    if (roomId && wsGlobal && wsGlobal.connected) {
                      try {
                        wsGlobal.send({
                          type: 'auto-visit',
                          roomId,
                          value,
                          darts: 3,
                          ring,
                          sector: info?.sector ?? null,
                          pBoard: info?.pBoard ?? null,
                          calibrationValid: !!info?.calibrationValid,
                          bullDistanceMm: info?.bullDistanceMm ?? null,
                          tipVideoPx: info?.tipVideoPx ?? null,
                        });
                      } catch {}
                    } else {
                      // fallback to local submit
                      try { submitVisitManual(value) } catch {}
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <PauseOverlay localPlayerName={localPlayerName} onResume={() => { setPausedGlobal(false, null); setPausedLocal(false); setPauseRequestedBy(null); setPauseAcceptedBy({}); setPauseEndsAt(null); sendState(); }} />
    </div>
  )
}
