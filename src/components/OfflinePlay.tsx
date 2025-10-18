
import { useEffect, useMemo, useRef, useState } from 'react';
import { suggestCheckouts, sayScore } from '../utils/checkout';
import { useUserSettings } from '../store/userSettings';
import { useToast } from '../store/toast';
import CameraTile from './CameraTile'
import CameraView from './CameraView'
import { getUserCurrency, formatPriceInCurrency } from '../utils/config';
import { bumpGameMode } from '../store/profileStats'
import { DOUBLE_PRACTICE_ORDER, isDoubleHit, parseManualDart } from '../game/types'
import { ATC_ORDER } from '../game/aroundTheClock'
import { createCricketState, applyCricketDart, CRICKET_NUMBERS, hasClosedAll as cricketClosedAll } from '../game/cricket'
import { createShanghaiState, applyShanghaiDart, endShanghaiTurn } from '../game/shanghai'
import { createDefaultHalveIt, getCurrentHalveTarget, applyHalveItDart, endHalveItTurn } from '../game/halveIt'
import { createHighLow, applyHighLowDart, endHighLowTurn } from '../game/highLow'
import { createKillerState, assignKillerNumbers, applyKillerDart, killerWinner, KillerState } from '../game/killer'
import { createBaseball, applyBaseballDart } from '../game/baseball'
import { createGolf, applyGolfDart } from '../game/golf'
import { createTicTacToe, tryClaimCell, TTT_TARGETS } from '../game/ticTacToe'
import { createAmCricketState, applyAmCricketDart, AM_CRICKET_NUMBERS, hasClosedAllAm } from '../game/americanCricket'
import ResizableModal from './ui/ResizableModal'

const freeGames = ['X01', 'Double Practice'];
const premiumGames = [
  'Around the Clock',
  'Cricket',
  'Halve It',
  'Shanghai',
  'High-Low',
  'Killer',
  "Bob's 27",
  'Count-Up',
  'High Score',
  'Low Score',
  'Checkout 170',
  'Checkout 121',
  'Treble Practice',
];
const aiLevels = ['Easy', 'Medium', 'Hardened'];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function aiVisitScore(remaining: number, level: string): number {
  // Very simple AI: target a plausible 3-dart total based on difficulty
  // Then adjust down if it would overshoot remaining.
  let target = 0
  if (level === 'Easy') {
    const candidates = [22, 26, 41, 45, 60]
    target = candidates[Math.floor(Math.random() * candidates.length)]
  } else if (level === 'Medium') {
    // around 60 with some variance
    target = Math.round(clamp(60 + (Math.random() * 30 - 15), 30, 100))
  } else {
    // Hardened: around 80 with tighter variance
    target = Math.round(clamp(80 + (Math.random() * 20 - 10), 50, 120))
  }
  if (remaining <= 0) return 0
  if (target > remaining) {
    // Try to pick something that doesn't bust
    const safe = [100, 85, 81, 60, 57, 45, 41, 26, 22, 20, 1].find(v => v <= remaining)
    return safe ?? 0
  }
  return target
}

function X01RulesPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="card max-w-lg w-full relative">
        <button className="absolute top-2 right-2 btn px-2 py-1" onClick={onClose}>Close</button>
        <h3 className="text-xl font-bold mb-2">X01 Rules & Regulations</h3>
        <ul className="list-disc pl-5 text-left mb-2">
          <li>Double In: Start scoring only after hitting a double.</li>
          <li>Double Out: Finish the game by hitting a double to reach exactly zero.</li>
          <li>Best Of: Play a set number of legs, winner is first to reach majority.</li>
          <li>First To: Play until a player reaches a set number of legs.</li>
          <li>No Cheating: All scores must be valid, no manual score changes mid-leg.</li>
          <li>Competitive Standard: Follow latest WDF/PDC rules for match play.</li>
        </ul>
        <p className="text-sm text-slate-600">For full details, see official darts governing body rules.</p>
      </div>
    </div>
  );
}

const API_URL = (import.meta as any).env?.VITE_API_URL || '';

export default function OfflinePlay({ user }: { user: any }) {
  const { offlineLayout } = useUserSettings()
  const [selectedMode, setSelectedMode] = useState('X01');
  const [x01Score, setX01Score] = useState(501);
  const [ai, setAI] = useState('None');
  const [showRules, setShowRules] = useState(false);
  const [inMatch, setInMatch] = useState(false);
  const [playerScore, setPlayerScore] = useState(x01Score);
  const [aiScore, setAiScore] = useState(x01Score);
  const [onDouble, setOnDouble] = useState(false);
  const [showWinPopup, setShowWinPopup] = useState(false);
  // Match format: First-to selector and leg counters
  const [firstTo, setFirstTo] = useState<number>(1)
  const [playerLegs, setPlayerLegs] = useState<number>(0)
  const [aiLegs, setAiLegs] = useState<number>(0)
  const [pendingLegWinner, setPendingLegWinner] = useState<'player'|'ai'|null>(null)
  const [doubleDarts, setDoubleDarts] = useState(1);
  const [checkoutDarts, setCheckoutDarts] = useState(1);
  const [legStats, setLegStats] = useState<{ winner: 'player'|'ai'; doubleDarts: number; checkoutDarts: number; doublesAtt?: number; doublesHit?: number }[]>([]);
  // New: pre-game adjustable AI delay (ms)
  const [aiDelayMs, setAiDelayMs] = useState<number>(2000)
  const toast = useToast();
  // New: match popup state
  const [showMatchModal, setShowMatchModal] = useState(false)
  // Mirror Online layout defaults when in modern layout, otherwise keep classic feel
  const [maximized, setMaximized] = useState(offlineLayout === 'modern')
  const [fitAll, setFitAll] = useState(offlineLayout === 'modern')
  // React to layout changes at runtime
  useEffect(() => {
    setMaximized(offlineLayout === 'modern')
    setFitAll(offlineLayout === 'modern')
  }, [offlineLayout])
  const [fitScale, setFitScale] = useState(1)
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  // Per-dart input and stats
  const [playerDartPoints, setPlayerDartPoints] = useState<number>(0)
  const [dpIndex, setDpIndex] = useState<number>(0) // 0..20 (DBULL at 20)
  const [dpHits, setDpHits] = useState<number>(0)
  // Around the Clock (offline practice)
  const [atcIndex, setAtcIndex] = useState<number>(0)
  const [atcHits, setAtcHits] = useState<number>(0)
  // Practice mode states
  const [cricket, setCricket] = useState(createCricketState())
  const [shanghai, setShanghai] = useState(createShanghaiState())
  const [halve, setHalve] = useState(createDefaultHalveIt())
  const [highlow, setHighlow] = useState(createHighLow())
  const [practiceTurnDarts, setPracticeTurnDarts] = useState<number>(0)
  // Phase 1 practice modes
  const [b27Stage, setB27Stage] = useState<number>(1)
  const [b27Score, setB27Score] = useState<number>(27)
  const [b27Darts, setB27Darts] = useState<number>(0)
  const [b27Hits, setB27Hits] = useState<number>(0)
  const [b27Finished, setB27Finished] = useState<boolean>(false)
  const [cuRound, setCuRound] = useState<number>(1)
  const [cuScore, setCuScore] = useState<number>(0)
  const [cuDarts, setCuDarts] = useState<number>(0)
  const cuMaxRounds = 8
  const [hsRound, setHsRound] = useState<number>(1)
  const [hsScore, setHsScore] = useState<number>(0)
  const [hsDarts, setHsDarts] = useState<number>(0)
  const hsMaxRounds = 10
  const [lsRound, setLsRound] = useState<number>(1)
  const [lsScore, setLsScore] = useState<number>(0)
  const [lsDarts, setLsDarts] = useState<number>(0)
  const lsMaxRounds = 10
  const [co170Rem, setCo170Rem] = useState<number>(170)
  const [co170Darts, setCo170Darts] = useState<number>(0)
  const [co170Attempts, setCo170Attempts] = useState<number>(0)
  const [co170Successes, setCo170Successes] = useState<number>(0)
  const [co121Rem, setCo121Rem] = useState<number>(121)
  const [co121Darts, setCo121Darts] = useState<number>(0)
  const [co121Attempts, setCo121Attempts] = useState<number>(0)
  const [co121Successes, setCo121Successes] = useState<number>(0)
  const [trebleTarget, setTrebleTarget] = useState<number>(20)
  const [trebleHits, setTrebleHits] = useState<number>(0)
  const [trebleDarts, setTrebleDarts] = useState<number>(0)
  // Phase 2 states
  const [baseball, setBaseball] = useState(createBaseball())
  const [golf, setGolf] = useState(createGolf())
  const [ttt, setTTT] = useState(createTicTacToe())
  const [amCricket, setAmCricket] = useState(createAmCricketState())
  // Killer (hotseat) state
  const [killerPlayers, setKillerPlayers] = useState<Array<{ id: string; name: string }>>([
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ])
  const [killerStates, setKillerStates] = useState<Record<string, KillerState>>({})
  const [killerAssigned, setKillerAssigned] = useState<Record<string, number>>({})
  const [killerSetupDone, setKillerSetupDone] = useState<boolean>(false)
  const [killerTurnIdx, setKillerTurnIdx] = useState<number>(0)
  const [killerDarts, setKillerDarts] = useState<number>(0)
  const [killerWinnerId, setKillerWinnerId] = useState<string | null>(null)
  const [killerLastEvent, setKillerLastEvent] = useState<string>('')
  const [playerDartsThrown, setPlayerDartsThrown] = useState<number>(0)
  const [playerLastDart, setPlayerLastDart] = useState<number>(0)
  const [playerVisitDarts, setPlayerVisitDarts] = useState<number>(0)
  const [playerVisitStart, setPlayerVisitStart] = useState<number>(x01Score)
  const [playerVisitSum, setPlayerVisitSum] = useState<number>(0)
  const [playerVisitDartsAtDouble, setPlayerVisitDartsAtDouble] = useState<number>(0)
  const [aiCountdownMs, setAiCountdownMs] = useState<number>(0)
  const aiTimerRef = useRef<number | null>(null)
  const [aiDartsThrown, setAiDartsThrown] = useState<number>(0)
  const [aiLastDart, setAiLastDart] = useState<number>(0)
  const [aiVisitSum, setAiVisitSum] = useState<number>(0)
  const [aiVisitDartsAtDouble, setAiVisitDartsAtDouble] = useState<number>(0)
  // Doubles attempts/hits
  const [playerDoublesAtt, setPlayerDoublesAtt] = useState<number>(0)
  const [playerDoublesHit, setPlayerDoublesHit] = useState<number>(0)
  const [aiDoublesAtt, setAiDoublesAtt] = useState<number>(0)
  const [aiDoublesHit, setAiDoublesHit] = useState<number>(0)
  // Match-long totals for averages
  const [totalPlayerDarts, setTotalPlayerDarts] = useState<number>(0)
  const [totalAiDarts, setTotalAiDarts] = useState<number>(0)
  const [totalPlayerPoints, setTotalPlayerPoints] = useState<number>(0)
  const [totalAiPoints, setTotalAiPoints] = useState<number>(0)
  // Power scoring and checkout highs
  const [player180s, setPlayer180s] = useState<number>(0)
  const [player140s, setPlayer140s] = useState<number>(0)
  const [player100s, setPlayer100s] = useState<number>(0)
  const [ai180s, setAi180s] = useState<number>(0)
  const [ai140s, setAi140s] = useState<number>(0)
  const [ai100s, setAi100s] = useState<number>(0)
  const [playerHighestCheckout, setPlayerHighestCheckout] = useState<number>(0)
  const [aiHighestCheckout, setAiHighestCheckout] = useState<number>(0)
  // End-of-match summary modal
  const [showMatchSummary, setShowMatchSummary] = useState<boolean>(false)
  // Manual correction input for offline (matches CameraView UX)
  const [manualBox, setManualBox] = useState<string>('')
  // Settings: favourite double and caller
  const { favoriteDouble, callerEnabled, callerVoice, callerVolume, speakCheckoutOnly, rememberLastOffline, setLastOffline, autoStartOffline, cameraScale, setCameraScale, cameraAspect = 'wide', setCameraAspect, cameraEnabled, textSize, boxSize } = useUserSettings()
  // Fit-all scaling measurement
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const headerBarRef = useRef<HTMLDivElement | null>(null)
  // Match format controls (offline only): First to N or Best of N with editable count
  const [formatType, setFormatType] = useState<'first'|'best'>('first')
  const [formatCount, setFormatCount] = useState<number>(1)
  const formatRef = useRef<HTMLDivElement | null>(null)
  // Keep internal required wins (firstTo) in sync with format selection
  useEffect(() => {
    const n = Math.max(1, Math.floor(Number(formatCount) || 1))
    const wins = formatType === 'first' ? n : Math.max(1, Math.ceil(n / 2))
    setFirstTo(wins)
  }, [formatType, formatCount])
  useEffect(() => {
    if (!fitAll) { setFitScale(1); return }
    const measure = () => {
      const scroller = scrollerRef.current
      const content = contentRef.current
      if (!scroller || !content) return
      // Available size excludes the sticky header inside the scroller
      const headerH = headerBarRef.current ? headerBarRef.current.getBoundingClientRect().height : 0
      const availH = Math.max(0, scroller.clientHeight - headerH - 6) // small breathing room
      const availW = Math.max(0, scroller.clientWidth - 8)
      // Measure the content size without scale
      const rect = content.getBoundingClientRect()
      const currentScale = fitScale || 1
      const naturalHeight = rect.height / currentScale
      const naturalWidth = rect.width / currentScale
      // Compute scale to fit both height and width
      const scaleH = availH > 0 ? (availH / naturalHeight) : 1
      const scaleW = availW > 0 ? (availW / naturalWidth) : 1
      const next = Math.min(1, Math.max(0.5, Math.min(scaleH, scaleW)))
      setFitScale(next)
    }
    measure()
  const RO: any = (window as any).ResizeObserver
  const ro = RO ? new RO(() => measure()) : null
  ro && scrollerRef.current && ro.observe(scrollerRef.current as any)
  ro && contentRef.current && ro.observe(contentRef.current as any)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      try { ro && scrollerRef.current && ro.unobserve(scrollerRef.current as any) } catch {}
      try { ro && contentRef.current && ro.unobserve(contentRef.current as any) } catch {}
    }
  }, [fitAll, fitScale])


  // Auto-start handler (from Home or other tabs)
  useEffect(() => {
    const onAuto = (e: any) => {
      const m = e?.detail?.mode as string | undefined
      if (!m) return
      setSelectedMode(m)
      // For Double Practice we could load a specific flow. For now, we just open the X01-like modal with immediate start.
      startMatch()
    }
    window.addEventListener('ndn:auto-start', onAuto as any)
    return () => window.removeEventListener('ndn:auto-start', onAuto as any)
  }, [])

  // Accept demo parameters to preconfigure format and starting score before auto-start
  useEffect(() => {
    const onFmt = (e: any) => {
      const t = e?.detail?.formatType
      const c = e?.detail?.formatCount
      const s = e?.detail?.startScore
      if (t === 'first' || t === 'best') setFormatType(t)
      if (typeof c === 'number' && isFinite(c)) setFormatCount(Math.max(1, Math.floor(c)))
      if (typeof s === 'number' && isFinite(s)) setX01Score(Math.max(1, Math.floor(s)))
    }
    window.addEventListener('ndn:offline-format', onFmt as any)
    return () => window.removeEventListener('ndn:offline-format', onFmt as any)
  }, [])

  // Auto-start last offline match when opening this tab, if enabled
  useEffect(() => {
    if (!autoStartOffline) return
    // Kick off a match after initial render for a smooth modal open
    const id = setTimeout(() => startMatch(), 50)
    return () => clearTimeout(id)
  }, [autoStartOffline])

  // Drive AI countdown and perform AI visit when countdown elapses
  useEffect(() => {
    if (!showMatchModal || isPlayerTurn || ai === 'None' || aiCountdownMs <= 0) return
    let raf: number
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setAiCountdownMs(prev => {
        const next = prev - dt
        if (next <= 0) {
          // Execute AI visit per dart (up to 3 darts or until finish/bust)
          let visitDarts = 0
          let remaining = aiScore
          while (visitDarts < 3 && remaining > 0) {
            const targetVisit = aiVisitScore(remaining, ai)
            // break target into up to 3 darts (roughly 20 per dart for easy split)
            const dart = clamp(targetVisit - visitDarts*20, 0, Math.min(60, remaining))
            const after = remaining - dart
            setAiLastDart(dart)
            setAiDartsThrown(d => d + 1)
            setTotalAiDarts(d => d + 1)
            if (after < 0) {
              // bust: revert to remaining before visit
              remaining = aiScore
              setAiVisitSum(0)
              setAiVisitDartsAtDouble(0)
              break
            }
            // Only add points after confirming not a bust
            setAiVisitSum(s => s + dart)
            setTotalAiPoints(p => p + dart)
            // Track darts at double window
            const preRem = remaining
            const postRem = after
            if (preRem > 50 && postRem <= 50) setAiVisitDartsAtDouble(1)
            else if (preRem <= 50) setAiVisitDartsAtDouble(c => c + 1)
            remaining = after
            visitDarts += 1
            if (remaining === 0) break
          }
          setAiScore(remaining)
          if (remaining === 0) {
            // Power score classification
            if (aiVisitSum === 180) setAi180s(n => n + 1)
            else if (aiVisitSum >= 140) setAi140s(n => n + 1)
            else if (aiVisitSum >= 100) setAi100s(n => n + 1)
            // Highest checkout
            const checkout = aiScore
            if (checkout <= 170) setAiHighestCheckout(h => Math.max(h, checkout))
            // Doubles attempts/hit if finished from <= 50
            if (aiScore <= 50) {
              setAiDoublesAtt(a => a + (aiVisitDartsAtDouble > 0 ? aiVisitDartsAtDouble : 1))
              setAiDoublesHit(h => h + 1)
            }
            setAiVisitSum(0)
            setAiVisitDartsAtDouble(0)
            // AI won the leg
            setPendingLegWinner('ai')
            setShowWinPopup(true)
          }
          // If AI did not finish, but threw 3 darts this visit, classify power score and reset visit sum
          if (remaining > 0 && visitDarts >= 3) {
            if (aiVisitSum === 180) setAi180s(n => n + 1)
            else if (aiVisitSum >= 140) setAi140s(n => n + 1)
            else if (aiVisitSum >= 100) setAi100s(n => n + 1)
            setAiVisitSum(0)
            setAiVisitDartsAtDouble(0)
          }
          // Hand turn back to player
          setIsPlayerTurn(true)
          return 0
        }
        return next
      })
      if (aiCountdownMs > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [showMatchModal, isPlayerTurn, ai, aiCountdownMs, aiScore])

  function startMatch() {
    setInMatch(true);
    setPlayerScore(x01Score);
    setAiScore(x01Score);
    setOnDouble(false);
    setShowMatchModal(true);
    setIsPlayerTurn(true);
    setPlayerDartPoints(0);
    setPlayerDartsThrown(0);
    setPlayerLastDart(0);
    setPlayerVisitDarts(0);
    setPlayerVisitStart(x01Score);
    setPlayerVisitSum(0)
  setPlayerVisitDartsAtDouble(0)
    setAiCountdownMs(0);
    setAiDartsThrown(0);
    setAiLastDart(0);
    setAiVisitSum(0)
    setPendingLegWinner(null)
    // When starting a brand-new match from menu, reset legs
  setPlayerLegs(0)
  setAiLegs(0)
    setLegStats([])
    // Reset match-long totals
    setTotalPlayerDarts(0); setTotalAiDarts(0)
    setTotalPlayerPoints(0); setTotalAiPoints(0)
    setPlayer180s(0); setPlayer140s(0); setPlayer100s(0)
    setAi180s(0); setAi140s(0); setAi100s(0)
    setPlayerHighestCheckout(0); setAiHighestCheckout(0)
    setPlayerDoublesAtt(0); setPlayerDoublesHit(0)
    setAiDoublesAtt(0); setAiDoublesHit(0)
    // Sync required wins from current format selection
    const n = Math.max(1, Math.floor(Number(formatCount) || 1))
    setFirstTo(formatType === 'first' ? n : Math.max(1, Math.ceil(n/2)))
    if (rememberLastOffline) {
      try { setLastOffline({ mode: selectedMode, x01Start: x01Score, firstTo, aiLevel: ai }) } catch {}
    }
  }

  function startNextLeg() {
    setPlayerScore(x01Score)
    setAiScore(x01Score)
    setOnDouble(false)
    setShowMatchModal(true)
    setIsPlayerTurn(true)
    setPlayerDartPoints(0)
    setPlayerDartsThrown(0)
    setPlayerLastDart(0)
    setPlayerVisitDarts(0)
    setPlayerVisitStart(x01Score)
    setPlayerVisitSum(0)
  setPlayerVisitDartsAtDouble(0)
    setAiCountdownMs(0)
    setAiDartsThrown(0)
    setAiLastDart(0)
    setAiVisitSum(0)
    setPendingLegWinner(null)
  }

  // --- Offline per-dart helpers ---
  function endTurn(nextRemaining: number) {
    setPlayerVisitDarts(0)
    setPlayerVisitStart(nextRemaining === 0 ? x01Score : playerScore)
    setPlayerVisitDartsAtDouble(0)
    if (ai !== 'None') { setIsPlayerTurn(false); setAiCountdownMs(aiDelayMs) } else setIsPlayerTurn(false)
  }

  function applyDartValue(dart: number) {
    const remaining = playerScore - dart
    const newVisitDarts = playerVisitDarts + 1
    setPlayerLastDart(dart)
    setPlayerDartsThrown(d => d + 1)
    setTotalPlayerDarts(d => d + 1)
    if (remaining < 0) {
      // bust: revert to visit start, end turn
      setPlayerScore(playerVisitStart)
      endTurn(playerVisitStart)
      setPlayerDartPoints(0)
      setPlayerVisitSum(0)
      setPlayerVisitDartsAtDouble(0)
      return
    }
    setPlayerScore(remaining)
  if (callerEnabled) sayScore(user?.username || 'Player', dart, Math.max(remaining, 0), callerVoice, { volume: callerVolume, checkoutOnly: speakCheckoutOnly })
    setPlayerVisitDarts(newVisitDarts)
    setPlayerVisitSum(s => s + dart)
    setTotalPlayerPoints(p => p + dart)
    setPlayerDartPoints(0)
    // Start/continue counting darts at a double when remaining <= 50 and on a valid finish path
    const preRemaining = playerScore
    const postRemaining = remaining
    const startedDoubleWindow = preRemaining > 50 && postRemaining <= 50
    const stillInDoubleWindow = preRemaining <= 50
    if (startedDoubleWindow) {
      setPlayerVisitDartsAtDouble(1)
    } else if (stillInDoubleWindow) {
      setPlayerVisitDartsAtDouble(c => c + 1)
    }
    if (remaining === 0) {
      // Player wins the leg
      // Power score classification on final visit
      if (playerVisitSum + dart === 180) setPlayer180s(n => n + 1)
      else if (playerVisitSum + dart >= 140) setPlayer140s(n => n + 1)
      else if (playerVisitSum + dart >= 100) setPlayer100s(n => n + 1)
      // Highest checkout if <= 170
      const checkout = playerVisitStart
      if (checkout <= 170) setPlayerHighestCheckout(h => Math.max(h, checkout))
      // Count a double hit only if last dart is a double that takes out from <= 50
      if (preRemaining <= 50) {
        setPlayerDoublesAtt(a => a + (playerVisitDartsAtDouble > 0 ? playerVisitDartsAtDouble : 1))
        setPlayerDoublesHit(h => h + 1)
      }
      setPendingLegWinner('player')
      setShowWinPopup(true)
      return
    }
    if (newVisitDarts >= 3) {
      // Classify power score for completed visit
      if (playerVisitSum + dart === 180) setPlayer180s(n => n + 1)
      else if (playerVisitSum + dart >= 140) setPlayer140s(n => n + 1)
      else if (playerVisitSum + dart >= 100) setPlayer100s(n => n + 1)
      endTurn(remaining)
      setPlayerVisitSum(0)
      setPlayerVisitDartsAtDouble(0)
    }
  }

  function addDartNumeric() {
    const dart = clamp(Math.round(Number(playerDartPoints) || 0), 0, 60)
    applyDartValue(dart)
  }

  // --- Double Practice helpers ---
  function addDpValue(val: number) {
    const dart = clamp(Math.round(val || 0), 0, 60)
    setPlayerLastDart(dart)
    setPlayerDartsThrown(d => d + 1)
    setTotalPlayerDarts(d => d + 1)
    if (isDoubleHit(dart, dpIndex)) {
      const nextHits = dpHits + 1
      setDpHits(nextHits)
      setDpIndex(i => Math.min(20, i + 1))
      // End when DBULL (index 20) is hit
      if (nextHits >= 21) {
        setPendingLegWinner('player')
        setShowWinPopup(true)
      }
    }
    setPlayerDartPoints(0)
  }
  function addDpNumeric() { addDpValue(Number(playerDartPoints)) }
  function addDpManual() {
    const v = parseManualDart(manualBox)
    if (v == null) { alert('Enter like D16, 50, 25, T20'); return }
    addDpValue(v)
    setManualBox('')
  }

  // Bob's 27
  function addB27Auto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    if (b27Finished) return
    const target = b27Stage
    const hit = (ring === 'DOUBLE' && sector === target) || (!ring && value === target*2)
    if (hit) setB27Hits(h => h + 1)
    setB27Darts(d => {
      const nd = d + 1
      if (nd >= 3) {
        const totalHits = b27Hits + (hit?1:0)
        if (totalHits > 0) setB27Score(s => s + totalHits * target * 2)
        else setB27Score(s => s - target * 2)
        const next = target + 1
        setB27Stage(next)
        setB27Hits(0)
        if (next > 20) setB27Finished(true)
        return 0
      }
      return nd
    })
  }
  function addB27Numeric() { addB27Auto(Math.max(0, playerDartPoints|0)); setPlayerDartPoints(0) }
  function resetB27() { setB27Stage(1); setB27Score(27); setB27Darts(0); setB27Hits(0); setB27Finished(false) }

  // Count-Up / High Score / Low Score
  function addCountUpAuto(value: number) { setCuScore(s => s + Math.max(0, value|0)); setCuDarts(d => { const nd=d+1; if(nd>=3){ setCuRound(r=>r+1); return 0 } return nd }) }
  function addHighScoreAuto(value: number) { setHsScore(s => s + Math.max(0, value|0)); setHsDarts(d => { const nd=d+1; if(nd>=3){ setHsRound(r=>r+1); return 0 } return nd }) }
  function addLowScoreAuto(value: number) { setLsScore(s => s + Math.max(0, value|0)); setLsDarts(d => { const nd=d+1; if(nd>=3){ setLsRound(r=>r+1); return 0 } return nd }) }

  // Checkout routines (double out)
  function applyCheckout(rem: number, setRem: (n:number)=>void, darts: number, setDarts: (f:(n:number)=>number)=>void, setAttempts: (f:(n:number)=>number)=>void, setSuccesses: (f:(n:number)=>number)=>void, value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL') {
    const next = rem - value
    if (next < 0) {
      // bust: ignore progress during attempt
    } else if (next === 0) {
      if (ring === 'DOUBLE' || ring === 'INNER_BULL') {
        setSuccesses(s => s + 1)
        setAttempts(a => a + 1)
        setDarts(()=>0)
        setRem(rem) // caller will reset to initial value right after
        return
      }
    } else {
      setRem(next)
    }
    setDarts(d => { const nd = d + 1; if (nd>=3) { setAttempts(a=>a+1); return 0 } return nd })
  }
  function addCo170Auto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL') { applyCheckout(co170Rem, setCo170Rem, co170Darts, setCo170Darts, setCo170Attempts, setCo170Successes, value, ring); if (co170Darts+1>=3) setCo170Rem(170) }
  function addCo121Auto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL') { applyCheckout(co121Rem, setCo121Rem, co121Darts, setCo121Darts, setCo121Attempts, setCo121Successes, value, ring); if (co121Darts+1>=3) setCo121Rem(121) }
  function addCoManual(is170: boolean) {
    const v = parseManualDart(manualBox)
    if (v == null) { alert('Enter like T20, D16, 25, 50'); return }
    const t = manualBox.trim().toUpperCase()
    const isDouble = t.startsWith('D') || t === '50' || t === 'BULL' || t === 'DBULL' || t === 'IBULL' || t.includes('INNER')
    if (is170) addCo170Auto(v, isDouble?'DOUBLE':undefined); else addCo121Auto(v, isDouble?'DOUBLE':undefined)
    setManualBox('')
  }
  function resetCo170() { setCo170Rem(170); setCo170Darts(0); setCo170Attempts(0); setCo170Successes(0) }
  function resetCo121() { setCo121Rem(121); setCo121Darts(0); setCo121Attempts(0); setCo121Successes(0) }

  // Treble practice
  function addTrebleAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) { if (ring==='TRIPLE' && sector===trebleTarget) setTrebleHits(h=>h+1); else if(!ring && value===trebleTarget*3) setTrebleHits(h=>h+1); setTrebleDarts(d=>d+1) }
  function resetTreble() { setTrebleHits(0); setTrebleDarts(0) }

  // Baseball
  function addBaseballAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE', sector?: number | null) {
    setBaseball(prev => { const cp = { ...prev }; applyBaseballDart(cp as any, value, ring as any, sector); return cp })
  }
  function resetBaseball() { setBaseball(createBaseball()) }

  // Golf
  function addGolfAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE', sector?: number | null) {
    setGolf(prev => { const cp = { ...prev }; applyGolfDart(cp as any, value, ring as any, sector); return cp })
  }
  function resetGolf() { setGolf(createGolf()) }

  // Tic Tac Toe
  function addTttAuto(cell: number, value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setTTT(prev => { const cp = { ...prev, board: [...prev.board] as any }; tryClaimCell(cp as any, cell as any, value, ring as any, sector); return cp })
  }
  function resetTtt() { setTTT(createTicTacToe()) }

  // American Cricket
  function addAmCricketAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setAmCricket(prev => { const cp = { ...prev, marks: { ...prev.marks } }; applyAmCricketDart(cp as any, value, ring as any, sector, () => false); return cp })
  }
  function resetAmCricket() { setAmCricket(createAmCricketState()) }

  // --- Around the Clock helpers ---
  function addAtcValue(val: number, ring?: 'MISS'|'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    const target = ATC_ORDER[atcIndex]
    let hit = false
    if (typeof sector === 'number' && sector === target && (ring === 'SINGLE' || ring === 'DOUBLE' || ring === 'TRIPLE')) hit = true
    if (target === 25 && (ring === 'BULL' || val === 25)) hit = true
    if (target === 50 && (ring === 'INNER_BULL' || val === 50)) hit = true
    if (!hit) {
      // Fallback by value only
      if (val === target || val === target * 2 || val === target * 3) hit = true
    }
    if (hit) {
      const newHits = atcHits + 1
      setAtcHits(newHits)
      setAtcIndex(i => i + 1)
    }
  }
  function addAtcNumeric() { addAtcValue(Math.max(0, playerDartPoints|0)); setPlayerDartPoints(0) }
  function addAtcManual() {
    const v = parseManualDart(manualBox)
    if (v == null) { alert('Enter like T20, D5, 25, 50'); return }
    addAtcValue(v)
    setManualBox('')
  }

  // --- Cricket helpers (solo practice) ---
  function addCricketAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setCricket(prev => {
      const copy = { ...prev, marks: { ...prev.marks } }
      applyCricketDart(copy as any, value, ring, sector, () => false)
      return copy
    })
    setPracticeTurnDarts(d => {
      const nd = d + 1; if (nd >= 3) return 0; return nd
    })
  }
  function addCricketNumeric() { addCricketAuto(Math.max(0, playerDartPoints|0)); setPlayerDartPoints(0) }

  // --- Shanghai helpers ---
  function addShanghaiAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setShanghai(prev => {
      const copy = { ...prev, turnHits: { ...prev.turnHits } }
      applyShanghaiDart(copy as any, value, ring, sector)
      return copy
    })
    setPracticeTurnDarts(d => {
      const nd = d + 1
      if (nd >= 3) {
        setShanghai(prev => { const cp = { ...prev, turnHits: { ...prev.turnHits } }; endShanghaiTurn(cp as any); return cp })
        return 0
      }
      return nd
    })
  }
  function addShanghaiNumeric() { addShanghaiAuto(Math.max(0, playerDartPoints|0)); setPlayerDartPoints(0) }

  // --- Halve It helpers ---
  function addHalveAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setHalve(prev => {
      const copy = { ...prev, targets: [...prev.targets] }
      applyHalveItDart(copy as any, value, ring, sector)
      return copy
    })
    setPracticeTurnDarts(d => {
      const nd = d + 1
      if (nd >= 3) {
        setHalve(prev => { const cp = { ...prev, targets: [...prev.targets] }; endHalveItTurn(cp as any); return cp })
        return 0
      }
      return nd
    })
  }
  function addHalveNumeric() { addHalveAuto(Math.max(0, playerDartPoints|0)); setPlayerDartPoints(0) }

  // --- High-Low helpers ---
  function addHighLowAuto(value: number, ring?: 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL', sector?: number | null) {
    setHighlow(prev => {
      const copy = { ...prev }
      applyHighLowDart(copy as any, value, ring, sector)
      return copy
    })
    setPracticeTurnDarts(d => {
      const nd = d + 1
      if (nd >= 3) {
        setHighlow(prev => { const cp = { ...prev }; endHighLowTurn(cp as any); return cp })
        return 0
      }
      return nd
    })
  }
  function addHighLowNumeric() { addHighLowAuto(Math.max(0, playerDartPoints|0)); setPlayerDartPoints(0) }

  function parseManualBox(): number | null {
    const t = manualBox.trim().toUpperCase()
    if (!t) return null
    if (t === '50' || t === 'BULL' || t === 'DBULL' || t === 'IBULL') return 50
    if (t === '25' || t === 'OBULL') return 25
    const m = t.match(/^(S|D|T)?\s*(\d{1,2})$/)
    if (!m) return null
    const mult = (m[1] || 'S') as 'S'|'D'|'T'
    const num = parseInt(m[2],10)
    if (num < 1 || num > 20) return null
    const multVal = mult==='S'?1:mult==='D'?2:3
    return num * multVal
  }

  function addManual() {
    const val = parseManualBox()
    if (val == null) { alert('Enter like T20, D16, 5, 25, 50'); return }
    applyDartValue(val)
    setManualBox('')
  }

  function replaceLast() {
    if (playerVisitDarts === 0) return
    // Rewind one dart: approximate by adding back last dart into score
    setPlayerScore(s => s + playerLastDart)
    setPlayerVisitDarts(d => Math.max(0, d - 1))
  }

  function replaceLastManual() {
    const val = parseManualBox()
    if (val == null) { alert('Enter like T20, D16, 5, 25, 50'); return }
    if (playerVisitDarts === 0) { addManual(); return }
    // Rewind last then apply
    const rewind = playerLastDart
    setPlayerScore(s => s + rewind)
    setPlayerVisitDarts(d => Math.max(0, d - 1))
    // Apply new value in next microtask to ensure state has updated
    setTimeout(() => applyDartValue(val), 0)
    setManualBox('')
  }

  function playerThrow(points: number) {
    let newScore = playerScore - points;
    if (newScore < 0) {
      setPlayerScore(playerScore); // bust
      return;
    }
    setPlayerScore(newScore);
    if (newScore === 0) {
      setPendingLegWinner('player')
      setShowWinPopup(true)
    }
    setOnDouble(newScore <= 40 && newScore % 2 === 0)
  }

  function aiTurn() {
    // This is now automated inside the modal turn loop
  }

  function handleBust() {
    setPlayerScore(playerScore); // bust, score unchanged
    setOnDouble(false);
  }

  function handleWinPopupSubmit() {
    const winner = pendingLegWinner ?? 'player'
    // Approximate per-leg doubles attempts: if winner is player and they finished from <=50, attempts were counted in playerVisitDartsAtDouble; otherwise leave undefined
    const legDoublesAtt = winner==='player' ? (playerVisitDartsAtDouble || undefined) : (aiVisitDartsAtDouble || undefined)
    const legDoublesHit = 1
    setLegStats([...legStats, { winner, doubleDarts, checkoutDarts, doublesAtt: legDoublesAtt, doublesHit: legDoublesHit }]);
    setShowWinPopup(false);
    // Increment legs for the winner
    let p = playerLegs
    let a = aiLegs
    if (pendingLegWinner === 'player') p += 1
    else if (pendingLegWinner === 'ai') a += 1
    setPlayerLegs(p)
    setAiLegs(a)
    setPendingLegWinner(null)
    // Check if match is over
    if (p >= firstTo || a >= firstTo) {
      // End of match: close modal back to menu state
      // Record per-game-mode result (local-only demo)
      try { bumpGameMode(selectedMode, winner === 'player') } catch {}
      setShowMatchModal(false)
      setInMatch(false)
      // Reset leg-specific stats for next match but keep the summary list visible
      setPlayerScore(x01Score)
      setAiScore(x01Score)
      setShowMatchSummary(true)
      return
    }
    // Otherwise, start the next leg immediately
    startNextLeg()
  }

  const isFreeSelected = freeGames.includes(selectedMode)
  const lockedPremium = !isFreeSelected && !(user?.fullAccess || user?.admin)

  // no external overlay: we render the match modal as absolute inset-0 inside this card

  return (
  <div className="card relative overflow-hidden">
  <h2 className="text-2xl font-bold text-brand-700 mb-4">Offline Game Modes {offlineLayout==='classic' ? <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/10 align-middle">Classic layout</span> : <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 align-middle">Modern layout</span>}</h2>
      <div className="mb-4 flex flex-col gap-3">
        <label className="font-semibold">Select game mode:</label>
        <select className="input w-full" value={selectedMode} onChange={e => setSelectedMode(e.target.value)}>
          {freeGames.map(mode => <option key={mode} value={mode}>{mode}</option>)}
          {premiumGames.map(mode => (
            <option key={mode} value={mode} disabled={!(user?.fullAccess || user?.admin)}>{mode} {(user?.fullAccess || user?.admin) ? '' : '(Premium)'}</option>
          ))}
        </select>
        {!user?.fullAccess && (
          <div className="mt-2 p-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 text-sm flex items-center gap-2">
            <span>🔒</span>
            <span>Only X01 and Double Practice are free. Advanced modes (Killer, Cricket, Shanghai, etc.) require PREMIUM.</span>
          </div>
        )}
        {selectedMode === 'X01' && (
          <>
            <label className="font-semibold mt-2">Enter starting score (1-1001):</label>
            <input
              className="input w-full"
              type="number"
              min={1}
              max={1001}
              value={x01Score}
              onChange={e => setX01Score(Number(e.target.value))}
            />
            <label className="font-semibold mt-2">Play against AI bot?</label>
            <select className="input w-full" value={ai} onChange={e => setAI(e.target.value)}>
              <option value="None">None</option>
              {aiLevels.map(level => <option key={level} value={level}>{level}</option>)}
            </select>
            {ai !== 'None' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end mt-2">
                <div className="sm:col-span-2">
                  <label className="font-semibold">AI throw delay (seconds)</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={aiDelayMs / 1000}
                    onChange={e => setAiDelayMs(Math.round(Number(e.target.value) * 1000))}
                  />
                </div>
                <div className="text-sm text-slate-300">Controls how long the AI waits before its visit.</div>
              </div>
            )}
            <button className="btn mt-2" onClick={() => setShowRules(true)}>X01 Rules & Regulations!</button>
          </>
        )}
        {selectedMode === 'Double Practice' && (
          <div className="mt-2 text-brand-600">Hit doubles D1 → D20 → DBULL in as few darts as possible. AI and X01 settings don’t apply.</div>
        )}
      </div>
  {!inMatch && <button className="btn" disabled={lockedPremium} title={lockedPremium ? 'PREMIUM required for this mode' : ''} onClick={startMatch}>Start Match</button>}
      {/* Match Modal with turn-by-turn flow */}
      {showMatchModal && (
  <div className={`absolute inset-0 z-[1000] ${maximized ? '' : 'flex items-center justify-center p-3 sm:p-4'}` }>
          <ResizableModal
            storageKey="ndn:modal:offline-match"
            className={`${maximized ? 'w-full h-full ndn-modal-tight' : ''} relative flex flex-col overflow-hidden`}
            fullScreen={maximized}
            defaultWidth={1100}
            defaultHeight={720}
            minWidth={720}
            minHeight={480}
            maxWidth={1600}
            maxHeight={1200}
            initialFitHeight
          >
            {/* Header bar with visible mode and actions; sheen is clipped to this area */}
            <div
              className="flex-1 min-h-0 overflow-x-hidden pr-1 pt-2 pb-2"
              style={{ overflowY: fitAll ? 'hidden' as any : 'auto' }}
              ref={(el) => { (scrollerRef as any).current = el }}
            >
              <div ref={(el)=>{ (headerBarRef as any).current = el }} className="sticky top-0 relative overflow-hidden flex items-center justify-between gap-2 mb-2 px-2 sm:px-3 py-2 rounded-xl bg-white/10 border border-white/10 z-10 backdrop-blur-sm">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/30 via-slate-900/10 to-transparent" />
                <div className="flex items-center gap-2 text-xs sm:text-sm leading-none flex-wrap">
                  <span className="hidden xs:inline px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[10px] sm:text-xs">Game Mode</span>
                  <span className="font-medium whitespace-nowrap">{selectedMode}{selectedMode==='X01' ? ` / ${x01Score}` : ''}</span>
                  <span className="opacity-80 whitespace-nowrap">First to {firstTo} · Legs {playerLegs}-{aiLegs}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] sm:text-xs ${offlineLayout==='modern' ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30' : 'bg-white/10 text-white/70 border-white/20'}`}>{offlineLayout==='modern' ? 'Modern layout' : 'Classic layout'}</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {/* Camera scale controls (match Online UI) */}
                  <div className="hidden items-center gap-2 mr-2 text-xs">
                    <span className="opacity-80">Cam</span>
                    <button
                      className="btn btn--ghost px-2 py-1"
                      onClick={() => setCameraScale(Math.max(0.5, Math.round((cameraScale - 0.05) * 100) / 100))}
                      title="Decrease camera size"
                    >−</button>
                    <span className="w-9 text-center">{Math.round(cameraScale * 100)}%</span>
                    <button
                      className="btn btn--ghost px-2 py-1"
                      onClick={() => setCameraScale(Math.min(1.25, Math.round((cameraScale + 0.05) * 100) / 100))}
                      title="Increase camera size"
                    >+</button>
                  </div>
                  <button
                    className="btn btn--ghost px-3 py-1 text-sm"
                    title={fitAll ? 'Actual Size' : 'Fit All'}
                    onClick={() => setFitAll(v => !v)}
                  >{fitAll ? 'Actual Size' : 'Fit All'}</button>
                  <button
                    className="btn btn--ghost px-3 py-1 text-sm"
                    title={maximized ? 'Restore' : 'Maximize'}
                    onClick={() => setMaximized(m => !m)}
                  >{maximized ? 'Restore' : 'Maximize'}</button>
                  <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={() => { startMatch() }}>Restart</button>
                  <button className="btn bg-rose-600 hover:bg-rose-700 px-3 py-1 text-sm" onClick={() => { setShowMatchModal(false); setInMatch(false); }}>Quit</button>
                </div>
              </div>
              <div
                ref={(el) => { (contentRef as any).current = el }}
                className="will-change-transform"
                style={fitAll ? { transform: `scale(${fitScale})`, transformOrigin: 'top left', width: '100%', fontSize: `${Math.max(0.8, Math.min(1, fitScale))}em` } : undefined}
              >
            <h3 className="text-xl font-bold mb-2 mt-1 leading-tight">{selectedMode === 'X01' ? 'X01 Match' : selectedMode}</h3>
            <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">Mode: {selectedMode}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">Start: {x01Score}</span>
              <div ref={formatRef} className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                <span>Format:</span>
                {(() => {
                  const disabled = (playerScore !== x01Score || aiScore !== x01Score || playerVisitDarts > 0)
                  const pillCls = `px-2 py-0.5 rounded border text-xs ${disabled? 'opacity-50 cursor-not-allowed': 'cursor-pointer'} `
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className={`${pillCls} ${formatType==='first' ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30' : 'bg-white/10 text-white/80 border-white/20'}`}
                          onClick={() => { if (!disabled) setFormatType('first') }}
                          title="First to N"
                        >First to</button>
                        <button
                          type="button"
                          className={`${pillCls} ${formatType==='best' ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30' : 'bg-white/10 text-white/80 border-white/20'}`}
                          onClick={() => { if (!disabled) setFormatType('best') }}
                          title="Best of N (wins = ceil(N/2)"
                        >Best of</button>
                      </div>
                      <input
                        className={`input w-16 text-center ${disabled ? 'opacity-50' : ''}`}
                        type="number"
                        min={1}
                        step={1}
                        value={formatCount}
                        onChange={e => setFormatCount(Math.max(1, Math.floor(Number(e.target.value)||1)))}
                        disabled={disabled}
                        title={formatType==='first' ? 'First to N' : 'Best of N (wins = ceil(N/2))'}
                      />
                    </div>
                  )
                })()}
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">Legs: {playerLegs}–{aiLegs}</span>
            </div>
            {selectedMode !== 'X01' ? (
              <div className="p-3 rounded-2xl glass text-white border border-white/10 min-w-0 flex flex-col h-full mb-2">
                {selectedMode === 'Double Practice' && (
                  <>
                    <div className="text-xs text-slate-600 flex items-center justify-between">
                      <span className="opacity-80">Current Target</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || '—'}</span>
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">{dpHits} / 21</div>
                  </>
                )}
                {selectedMode === 'Around the Clock' && (
                  <>
                    <div className="text-xs text-slate-600 flex items-center justify-between">
                      <span className="opacity-80">Current Target</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold">{ATC_ORDER[atcIndex] === 25 ? '25 (Outer Bull)' : ATC_ORDER[atcIndex] === 50 ? '50 (Inner Bull)' : (ATC_ORDER[atcIndex] || '—')}</span>
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">{atcHits} / {ATC_ORDER.length}</div>
                  </>
                )}
                {selectedMode === 'Cricket' && (
                  <>
                    <div className="text-xs text-slate-600 mb-1">Cricket — Close 20–15 and Bull; overflow scores points</div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] mb-2">
                      {CRICKET_NUMBERS.map(n => (
                        <div key={n} className="p-1 rounded bg-slate-800/50 border border-slate-700/50">
                          <div className="opacity-70">{n===25?'Bull':n}</div>
                          <div className="font-semibold">{Math.min(3, cricket.marks?.[n]||0)} / 3</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm">Points: <span className="font-semibold">{cricket.points}</span></div>
                    {cricketClosedAll(cricket) && (
                      <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={()=>{ setCricket(createCricketState()); setPracticeTurnDarts(0) }}>Reset</button></div>
                    )}
                  </>
                )}
                {selectedMode === 'Shanghai' && (
                  <>
                    <div className="text-xs text-slate-600 flex items-center justify-between"><span>Round</span><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{shanghai.round}</span></div>
                    <div className="text-3xl font-extrabold tracking-tight">Score: {shanghai.score}</div>
                    {shanghai.finished && (
                      <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={()=>{ setShanghai(createShanghaiState()); setPracticeTurnDarts(0) }}>Reset</button></div>
                    )}
                  </>
                )}
                {selectedMode === 'Halve It' && (
                  <>
                    <div className="text-xs text-slate-600 flex items-center justify-between"><span>Stage</span><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{halve.stage+1}/{halve.targets.length}</span></div>
                    <div className="text-sm">Target: <span className="font-semibold">{(() => { const t = getCurrentHalveTarget(halve); if (!t) return '—'; if (t.kind==='ANY_NUMBER') return 'Any'; if (t.kind==='BULL') return 'Bull'; if (t.kind==='DOUBLE' || t.kind==='TRIPLE' || t.kind==='NUMBER') return `${t.kind} ${(t as any).num}`; return '—' })()}</span></div>
                    <div className="text-3xl font-extrabold tracking-tight">Score: {halve.score}</div>
                    {halve.finished && (
                      <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={()=>{ setHalve(createDefaultHalveIt()); setPracticeTurnDarts(0) }}>Reset</button></div>
                    )}
                  </>
                )}
                {selectedMode === 'High-Low' && (
                  <>
                    <div className="text-xs text-slate-600">Round {highlow.round} · Target {highlow.target}</div>
                    <div className="text-3xl font-extrabold tracking-tight">Score: {highlow.score}</div>
                    {highlow.finished && (
                      <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={()=>{ setHighlow(createHighLow()); setPracticeTurnDarts(0) }}>Reset</button></div>
                    )}
                  </>
                )}
                {selectedMode === "Bob's 27" && (
                  <>
                    <div className="text-xs text-slate-600 flex items-center justify-between"><span>Target</span><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-semibold">D{b27Stage}</span></div>
                    <div className="text-3xl font-extrabold tracking-tight">Score: {b27Score}</div>
                    {b27Finished && (
                      <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={resetB27}>Reset</button></div>
                    )}
                  </>
                )}
                {selectedMode === 'Count-Up' && (
                  <>
                    <div className="text-xs text-slate-600">Round {cuRound}/8</div>
                    <div className="text-3xl font-extrabold tracking-tight">Score: {cuScore}</div>
                  </>
                )}
                {selectedMode === 'High Score' && (
                  <>
                    <div className="text-xs text-slate-600">Round {hsRound}/10</div>
                    <div className="text-3xl font-extrabold tracking-tight">Score: {hsScore}</div>
                  </>
                )}
                {selectedMode === 'Low Score' && (
                  <>
                    <div className="text-xs text-slate-600">Round {lsRound}/10</div>
                    <div className="text-3xl font-extrabold tracking-tight">Score: {lsScore}</div>
                  </>
                )}
                {selectedMode === 'Checkout 170' && (
                  <>
                    <div className="text-xs text-slate-600">Remaining</div>
                    <div className="text-3xl font-extrabold tracking-tight">{co170Rem}</div>
                    <div className="text-xs text-slate-400 mt-1">Attempts: {co170Attempts} · Successes: {co170Successes}</div>
                  </>
                )}
                {selectedMode === 'Checkout 121' && (
                  <>
                    <div className="text-xs text-slate-600">Remaining</div>
                    <div className="text-3xl font-extrabold tracking-tight">{co121Rem}</div>
                    <div className="text-xs text-slate-400 mt-1">Attempts: {co121Attempts} · Successes: {co121Successes}</div>
                  </>
                )}
                {selectedMode === 'Treble Practice' && (
                  <>
                    <div className="text-xs text-slate-600">Treble Target: T{trebleTarget}</div>
                    <div className="text-3xl font-extrabold tracking-tight">Hits: {trebleHits}</div>
                  </>
                )}
                {selectedMode === 'Baseball' && (
                  <>
                    <div className="text-xs text-slate-600">Inning</div>
                    <div className="text-3xl font-extrabold tracking-tight">{baseball.inning}</div>
                    <div className="text-sm">Score: <span className="font-semibold">{baseball.score}</span></div>
                  </>
                )}
                {selectedMode === 'Golf' && (
                  <>
                    <div className="text-xs text-slate-600">Hole</div>
                    <div className="text-3xl font-extrabold tracking-tight">{golf.hole}</div>
                    <div className="text-sm">Strokes: <span className="font-semibold">{golf.strokes}</span></div>
                  </>
                )}
                {selectedMode === 'Tic Tac Toe' && (
                  <>
                    <div className="text-xs text-slate-600">Turn</div>
                    <div className="text-3xl font-extrabold tracking-tight">{ttt.turn}</div>
                    {ttt.finished && <div className="mt-1 text-xs">Winner: {ttt.winner || '—'}</div>}
                  </>
                )}
                {selectedMode === 'American Cricket' && (
                  <>
                    <div className="text-xs text-slate-600 mb-1">Close 20–12 and Bull; overflow scores points</div>
                    <div className="grid grid-cols-10 gap-1 text-center text-[11px] mb-2">
                      {AM_CRICKET_NUMBERS.map(n => (
                        <div key={n} className="p-1 rounded bg-slate-800/50 border border-slate-700/50">
                          <div className="opacity-70">{n===25?'Bull':n}</div>
                          <div className="font-semibold">{Math.min(3, amCricket.marks?.[n]||0)} / 3</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm">Points: <span className="font-semibold">{amCricket.points}</span></div>
                    {hasClosedAllAm(amCricket) && (
                      <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={resetAmCricket}>Reset</button></div>
                    )}
                  </>
                )}
                {selectedMode === 'Killer' && (
                  <>
                    {!killerSetupDone ? (
                      <div className="text-xs text-slate-600">Setup players and assign numbers</div>
                    ) : (
                      <>
                        <div className="text-xs text-slate-600 flex items-center justify-between">
                          <span>Turn</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold">{killerPlayers[killerTurnIdx]?.name || '—'}</span>
                        </div>
                        <div className="text-3xl font-extrabold tracking-tight">{killerWinnerId ? `${killerPlayers.find(p=>p.id===killerWinnerId)?.name || 'Winner'} Wins` : (killerLastEvent || 'Ready')}</div>
                      </>
                    )}
                  </>
                )}
              </div>
            ) : offlineLayout === 'modern' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2 items-stretch min-w-0">
                {/* Left column: Player panel, Match Summary, Opponent panel stacked */}
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="p-3 rounded-2xl glass text-white border border-white/10 min-w-0 flex flex-col">
                    <div className="text-xs text-slate-600 flex items-center justify-between">
                      <span className="opacity-80">You Remain</span>
                      {isPlayerTurn ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold">THROWING</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-200 text-xs font-bold">WAITING TO THROW</span>
                      )}
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">{playerScore}</div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-400/70" style={{ width: `${Math.max(0, Math.min(100, (1 - (playerScore / x01Score)) * 100))}%` }} />
                    </div>
                    <div className="text-sm mt-1 opacity-90">Last dart: <span className="font-semibold">{playerLastDart}</span></div>
                    <div className="text-sm opacity-90">3-Dart Avg: <span className="font-semibold">{playerDartsThrown>0 ? (((x01Score - playerScore)/playerDartsThrown)*3).toFixed(1) : '0.0'}</span></div>
                    <div className="text-xs opacity-70 flex items-center gap-2">
                      <span>Darts thrown: {playerDartsThrown}</span>
                      <span className="inline-flex items-center gap-1" aria-label="Visit darts">
                        {[0,1,2].map(i => (
                          <span key={i} className={`w-2 h-2 rounded-full ${i < playerVisitDarts ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
                        ))}
                      </span>
                    </div>
                    <div className="text-xs opacity-80 mt-1">Doubles: <span className="font-semibold">Att {playerDoublesAtt} · Hit {playerDoublesHit}</span></div>
                    {playerScore <= 170 && playerScore > 0 && (
                      (() => {
                        const sugs = suggestCheckouts(playerScore, favoriteDouble)
                        const first = sugs[0] || '—'
                        return (
                          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white text-sm">
                            <span className="opacity-70">Checkout</span>
                            <span className="font-semibold">{first}</span>
                          </div>
                        )
                      })()
                    )}
                  </div>
                  {/* Match Summary */}
                  <div className={`${boxSize === 'small' ? 'p-2' : boxSize === 'large' ? 'p-4' : 'p-3'} rounded-2xl bg-slate-900/40 border border-white/10 text-white ${textSize === 'small' ? 'text-xs' : textSize === 'large' ? 'text-base' : 'text-sm'}`}>
                    <div className="font-semibold mb-2">Match Summary</div>
                    {(() => {
                      const currentThrower = isPlayerTurn ? (user?.username || 'You') : (ai === 'None' ? '—' : `${ai} AI`)
                      const currentRemaining = isPlayerTurn ? playerScore : (ai === 'None' ? 0 : aiScore)
                      const last = isPlayerTurn ? playerLastDart : aiLastDart
                      const lastScoreVisit = isPlayerTurn ? playerVisitSum : aiVisitSum
                      const dartsThrown = isPlayerTurn ? playerDartsThrown : aiDartsThrown
                      const scored = (x01Score - (isPlayerTurn ? playerScore : (ai === 'None' ? x01Score : aiScore)))
                      const avg3 = dartsThrown > 0 ? ((scored / dartsThrown) * 3) : 0
                      const matchScore = `${playerLegs}-${aiLegs}`
                      const bestLegText = legStats.length > 0 ? `${Math.min(...legStats.map(l=>l.doubleDarts + (l.checkoutDarts||0))) || 0} darts` : '—'
                      return (
                        <div className="grid grid-cols-2 gap-y-1">
                          <div className="opacity-80">Current score</div>
                          <div className="font-mono text-right">{matchScore}</div>
                          <div className="opacity-80">Current thrower</div>
                          <div className="text-right font-semibold text-lg">{currentThrower}</div>
                          <div className="opacity-80">Score remaining</div>
                          <div className="text-right font-mono font-bold text-xl">{currentRemaining}</div>
                          <div className="opacity-80">3-dart avg</div>
                          <div className="text-right font-mono">{avg3.toFixed(1)}</div>
                          <div className="opacity-80">Last score</div>
                          <div className="text-right font-mono">{lastScoreVisit || last}</div>
                          <div className="opacity-80">Best leg</div>
                          <div className="text-right">{bestLegText}</div>
                        </div>
                      )
                    })()}
                  </div>
                  {/* Opponent panel */}
                  <div className="p-3 rounded-2xl glass text-white border border-white/10 min-w-0 flex flex-col">
                    <div className="text-xs flex items-center justify-between opacity-80">
                      <span>{ai === 'None' ? 'Opponent' : `${ai} AI`} Remain</span>
                      {!isPlayerTurn ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold">THROWING</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-200 text-xs font-bold">WAITING TO THROW</span>
                      )}
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">{ai !== 'None' ? aiScore : 'N/A'}</div>
                    {ai !== 'None' && (
                      <div className="h-1.5 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-fuchsia-400/70" style={{ width: `${Math.max(0, Math.min(100, (1 - (aiScore / x01Score)) * 100))}%` }} />
                      </div>
                    )}
                    <div className="text-sm mt-1 opacity-90">Last dart: <span className="font-semibold">{ai === 'None' ? 0 : aiLastDart}</span></div>
                    <div className="text-sm opacity-90">3-Dart Avg: <span className="font-semibold">{ai !== 'None' ? (aiDartsThrown>0 ? (((x01Score - aiScore)/aiDartsThrown)*3).toFixed(1) : '0.0') : '—'}</span></div>
                    {ai !== 'None' && (
                      <div className="text-xs opacity-70">Darts thrown: {aiDartsThrown}</div>
                    )}
                    {ai !== 'None' && (
                      <div className="text-xs opacity-80 mt-1">Doubles: <span className="font-semibold">Att {aiDoublesAtt} · Hit {aiDoublesHit}</span></div>
                    )}
                  </div>
                </div>
                {/* Right area: toolbar + camera (span 2) */}
                <div className="md:col-span-2 min-w-0 space-y-2">
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="ml-auto flex items-center gap-1 text-[10px]">
                      <span className="opacity-70">Cam</span>
                      <button className="btn px-2 py-0.5" onClick={()=>setCameraScale(Math.max(0.5, Math.round((cameraScale-0.05)*100)/100))}>−</button>
                      <span className="btn px-2 py-0.5 min-w-[2.5rem] text-center">{Math.round(cameraScale*100)}%</span>
                      <button className="btn px-2 py-0.5" onClick={()=>setCameraScale(Math.min(1.25, Math.round((cameraScale+0.05)*100)/100))}>+</button>
                      <span className="opacity-50">|</span>
                      <button className="btn px-2 py-0.5" title="Toggle camera aspect" onClick={()=>setCameraAspect(cameraAspect==='square'?'wide':'square')}>{cameraAspect==='square'?'Square':'Wide'}</button>
                    </div>
                  </div>
                  <div className="flex items-stretch justify-end min-w-0">
                    <div className={`w-full min-w-0 ${cameraAspect==='square'?'aspect-square':'aspect-video'} rounded-2xl overflow-hidden bg-black`}>
                      <CameraTile label="Your Board" autoStart={true} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:[grid-template-columns:1fr_1.2fr_1fr] gap-2 mb-2 items-stretch min-w-0">
                <div className="flex items-stretch justify-center md:px-3 min-w-0">
              <div className="p-3 rounded-2xl glass text-white border border-white/10 min-w-0 flex flex-col h-full">
                <div className="text-xs text-slate-600 flex items-center justify-between">
                  <span className="opacity-80">You Remain</span>
                  {isPlayerTurn ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold">THROWING</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-200 text-xs font-bold">WAITING TO THROW</span>
                  )}
                </div>
                <div className="text-3xl font-extrabold tracking-tight">{playerScore}</div>
                <div className="h-1.5 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-emerald-400/70" style={{ width: `${Math.max(0, Math.min(100, (1 - (playerScore / x01Score)) * 100))}%` }} />
                </div>
                <div className="text-sm mt-1 opacity-90">Last dart: <span className="font-semibold">{playerLastDart}</span></div>
                <div className="text-sm opacity-90">3-Dart Avg: <span className="font-semibold">{playerDartsThrown>0 ? (((x01Score - playerScore)/playerDartsThrown)*3).toFixed(1) : '0.0'}</span></div>
                <div className="text-xs opacity-70 flex items-center gap-2">
                  <span>Darts thrown: {playerDartsThrown}</span>
                  <span className="inline-flex items-center gap-1" aria-label="Visit darts">
                    {[0,1,2].map(i => (
                      <span key={i} className={`w-2 h-2 rounded-full ${i < playerVisitDarts ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
                    ))}
                  </span>
                </div>
                <div className="text-xs opacity-80 mt-1">Doubles: <span className="font-semibold">Att {playerDoublesAtt} · Hit {playerDoublesHit}</span></div>
                {playerScore <= 170 && playerScore > 0 && (
                  (() => {
                    const sugs = suggestCheckouts(playerScore, favoriteDouble)
                    const first = sugs[0] || '—'
                    return (
                      <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white text-sm">
                        <span className="opacity-70">Checkout</span>
                        <span className="font-semibold">{first}</span>
                      </div>
                    )
                  })()
                )}
              </div>
              {/* Center camera preview: right-aligned and square when selected */}
              <div className="flex items-stretch justify-end md:px-3 min-w-0">
                <div className={`w-full max-w-xl min-w-0 rounded-2xl overflow-hidden bg-black ${ cameraAspect === 'square' ? 'aspect-square' : 'aspect-video' }`}>
                  <CameraTile label="Your Board" autoStart={true} />
                </div>
              </div>
              {/* Match summary (offline) */}
              <div className={`mt-2 ${boxSize === 'small' ? 'p-2' : boxSize === 'large' ? 'p-4' : 'p-3'} rounded-2xl bg-slate-900/40 border border-white/10 text-white ${textSize === 'small' ? 'text-xs' : textSize === 'large' ? 'text-base' : 'text-sm'}`}>
                <div className="font-semibold mb-2">Match Summary</div>
                {(() => {
                  // In offline X01, player is vs AI or practice
                  const currentThrower = isPlayerTurn ? (user?.username || 'You') : (ai === 'None' ? '—' : `${ai} AI`)
                  const currentRemaining = isPlayerTurn ? playerScore : (ai === 'None' ? 0 : aiScore)
                  const last = isPlayerTurn ? playerLastDart : aiLastDart
                  const lastScoreVisit = isPlayerTurn ? playerVisitSum : aiVisitSum
                  const dartsThrown = isPlayerTurn ? playerDartsThrown : aiDartsThrown
                  const scored = (x01Score - (isPlayerTurn ? playerScore : (ai === 'None' ? x01Score : aiScore)))
                  const avg3 = dartsThrown > 0 ? ((scored / dartsThrown) * 3) : 0
                  const matchScore = `${playerLegs}-${aiLegs}`
                  const bestLegText = legStats.length > 0 ? `${Math.min(...legStats.map(l=>l.doubleDarts + (l.checkoutDarts||0))) || 0} darts` : '—'
                  return (
                    <div className="grid grid-cols-2 gap-y-1">
                      <div className="opacity-80">Current score</div>
                      <div className="font-mono text-right">{matchScore}</div>
                      <div className="opacity-80">Current thrower</div>
                      <div className="text-right font-semibold text-lg">{currentThrower}</div>
                      <div className="opacity-80">Score remaining</div>
                      <div className="text-right font-mono font-bold text-xl">{currentRemaining}</div>
                      <div className="opacity-80">3-dart avg</div>
                      <div className="text-right font-mono">{avg3.toFixed(1)}</div>
                      <div className="opacity-80">Last score</div>
                      <div className="text-right font-mono">{lastScoreVisit || last}</div>
                      <div className="opacity-80">Best leg</div>
                      <div className="text-right">{bestLegText}</div>
                    </div>
                  )
                })()}
              </div>
              <div className="p-3 rounded-2xl glass text-white border border-white/10 min-w-0 flex flex-col h-full">
                <div className="text-xs flex items-center justify-between opacity-80">
                  <span>{ai === 'None' ? 'Opponent' : `${ai} AI`} Remain</span>
                  {!isPlayerTurn ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold">THROWING</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-200 text-xs font-bold">WAITING TO THROW</span>
                  )}
                </div>
                <div className="text-3xl font-extrabold tracking-tight">{ai !== 'None' ? aiScore : 'N/A'}</div>
                {ai !== 'None' && (
                  <div className="h-1.5 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-fuchsia-400/70" style={{ width: `${Math.max(0, Math.min(100, (1 - (aiScore / x01Score)) * 100))}%` }} />
                  </div>
                )}
                <div className="text-sm mt-1 opacity-90">Last dart: <span className="font-semibold">{ai === 'None' ? 0 : aiLastDart}</span></div>
                <div className="text-sm opacity-90">3-Dart Avg: <span className="font-semibold">{ai !== 'None' ? (aiDartsThrown>0 ? (((x01Score - aiScore)/aiDartsThrown)*3).toFixed(1) : '0.0') : '—'}</span></div>
                {ai !== 'None' && (
                  <div className="text-xs opacity-70">Darts thrown: {aiDartsThrown}</div>
                )}
                {ai !== 'None' && (
                  <div className="text-xs opacity-80 mt-1">Doubles: <span className="font-semibold">Att {aiDoublesAtt} · Hit {aiDoublesHit}</span></div>
                )}
              </div>
                </div>
            </div>
            )}
            {/* Turn area */}
            {selectedMode !== 'X01' ? (
              <div className="space-y-2">
                {selectedMode === 'Double Practice' && (
                  <>
                    <div className="font-semibold">Target: <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || '—'}</span></div>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} onAutoDart={(value, ring) => {
                        if (ring === 'DOUBLE' || ring === 'INNER_BULL') {
                          const hit = isDoubleHit(value, dpIndex)
                          if (hit) { const nh = dpHits + 1; const ni = dpIndex + 1; setDpHits(nh); setDpIndex(ni); if (nh >= DOUBLE_PRACTICE_ORDER.length) setTimeout(()=>{ setDpHits(0); setDpIndex(0) }, 250) }
                        }
                      }} immediateAutoCommit />
                    </div>}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input className="input w-24" type="number" min={0} max={60} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e => { if (e.key==='Enter') addDpNumeric() }} />
                        <button className="btn px-3 py-1 text-sm" onClick={addDpNumeric}>Add Dart</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input className="input w-44" placeholder="Manual (D16, 50, 25, T20)" value={manualBox} onChange={e=>setManualBox(e.target.value)} onKeyDown={e => { if (e.key==='Enter') addDpManual() }} />
                        <button className="btn px-3 py-1 text-sm" onClick={addDpManual}>Add</button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-300">Progress: {dpHits} of 21</div>
                  </>
                )}
                {selectedMode === 'Around the Clock' && (
                  <>
                    <div className="font-semibold">Target: <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">{ATC_ORDER[atcIndex] === 25 ? '25 (Outer Bull)' : ATC_ORDER[atcIndex] === 50 ? '50 (Inner Bull)' : (ATC_ORDER[atcIndex] || '—')}</span></div>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : ring; addAtcValue(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') addAtcNumeric() }} />
                      <button className="btn px-3 py-1 text-sm" onClick={addAtcNumeric}>Add Dart</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="input w-44" placeholder="Manual (T20, D5, 25, 50)" value={manualBox} onChange={e=>setManualBox(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addAtcManual() }} />
                      <button className="btn px-3 py-1 text-sm" onClick={addAtcManual}>Add</button>
                    </div>
                    {atcHits >= ATC_ORDER.length && (
                      <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Completed! <button className="ml-2 underline" onClick={()=>{ setAtcHits(0); setAtcIndex(0) }}>Reset</button></div>
                    )}
                  </>
                )}
                {selectedMode === 'Cricket' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : ring; addCricketAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') addCricketNumeric() }} />
                      <button className="btn px-3 py-1 text-sm" onClick={addCricketNumeric}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{ setCricket(createCricketState()); setPracticeTurnDarts(0) }}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'Shanghai' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : ring; addShanghaiAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') addShanghaiNumeric() }} />
                      <button className="btn px-3 py-1 text-sm" onClick={addShanghaiNumeric}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{ setShanghai(createShanghaiState()); setPracticeTurnDarts(0) }}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'Halve It' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : ring; addHalveAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') addHalveNumeric() }} />
                      <button className="btn px-3 py-1 text-sm" onClick={addHalveNumeric}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{ setHalve(createDefaultHalveIt()); setPracticeTurnDarts(0) }}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'High-Low' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : ring; addHighLowAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') addHighLowNumeric() }} />
                      <button className="btn px-3 py-1 text-sm" onClick={addHighLowNumeric}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{ setHighlow(createHighLow()); setPracticeTurnDarts(0) }}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === "Bob's 27" && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : ring; addB27Auto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') addB27Numeric() }} />
                      <button className="btn px-3 py-1 text-sm" onClick={addB27Numeric}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={resetB27}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'Count-Up' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value) => addCountUpAuto(value)} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') { addCountUpAuto(playerDartPoints); setPlayerDartPoints(0) } }} />
                      <button className="btn px-3 py-1 text-sm" onClick={()=>{ addCountUpAuto(playerDartPoints); setPlayerDartPoints(0) }}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{ setCuRound(1); setCuScore(0); setCuDarts(0) }}>Reset</button>
                    </div>
                    <div className="text-xs text-slate-400">Round {cuRound}/{cuMaxRounds}</div>
                  </>
                )}
                {selectedMode === 'High Score' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value) => addHighScoreAuto(value)} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') { addHighScoreAuto(playerDartPoints); setPlayerDartPoints(0) } }} />
                      <button className="btn px-3 py-1 text-sm" onClick={()=>{ addHighScoreAuto(playerDartPoints); setPlayerDartPoints(0) }}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{ setHsRound(1); setHsScore(0); setHsDarts(0) }}>Reset</button>
                    </div>
                    <div className="text-xs text-slate-400">Round {hsRound}/{hsMaxRounds}</div>
                  </>
                )}
                {selectedMode === 'Low Score' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value) => addLowScoreAuto(value)} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="number" min={0} value={playerDartPoints} onChange={e => setPlayerDartPoints(Number(e.target.value||0))} onKeyDown={e=>{ if(e.key==='Enter') { addLowScoreAuto(playerDartPoints); setPlayerDartPoints(0) } }} />
                      <button className="btn px-3 py-1 text-sm" onClick={()=>{ addLowScoreAuto(playerDartPoints); setPlayerDartPoints(0) }}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{ setLsRound(1); setLsScore(0); setLsDarts(0) }}>Reset</button>
                    </div>
                    <div className="text-xs text-slate-400">Round {lsRound}/{lsMaxRounds}</div>
                  </>
                )}
                {selectedMode === 'Checkout 170' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring) => addCo170Auto(value, ring === 'MISS' ? undefined : ring)} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="text" placeholder="Manual (D16, T20)" value={manualBox} onChange={e=>setManualBox(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addCoManual(true) }} />
                      <button className="btn px-3 py-1 text-sm" onClick={()=>addCoManual(true)}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={resetCo170}>Reset</button>
                    </div>
                    <div className="text-xs text-slate-400">Remaining: {co170Rem} · Attempts: {co170Attempts} · Successes: {co170Successes}</div>
                  </>
                )}
                {selectedMode === 'Checkout 121' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring) => addCo121Auto(value, ring === 'MISS' ? undefined : ring)} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="text" placeholder="Manual (D16, T20)" value={manualBox} onChange={e=>setManualBox(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addCoManual(false) }} />
                      <button className="btn px-3 py-1 text-sm" onClick={()=>addCoManual(false)}>Add Dart</button>
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={resetCo121}>Reset</button>
                    </div>
                    <div className="text-xs text-slate-400">Remaining: {co121Rem} · Attempts: {co121Attempts} · Successes: {co121Successes}</div>
                  </>
                )}
                {selectedMode === 'Treble Practice' && (
                  <>
                    <div className="flex items-center gap-2">
                      <label className="text-sm">Target</label>
                      <select className="input w-24" value={trebleTarget} onChange={e=> setTrebleTarget(parseInt(e.target.value,10))}>
                        {Array.from({length:20},(_,i)=>i+1).map(n=> <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button className="btn px-3 py-1 text-sm" onClick={resetTreble}>Reset</button>
                    </div>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : ring; addTrebleAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <input className="input w-24" type="text" placeholder="Manual (T20)" value={manualBox} onChange={e=>setManualBox(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') { const v = parseManualDart(manualBox); if (v!=null) addTrebleAuto(v, undefined, undefined); setManualBox('') } }} />
                      <button className="btn px-3 py-1 text-sm" onClick={()=>{ const v = parseManualDart(manualBox); if (v!=null) addTrebleAuto(v, undefined, undefined); setManualBox('') }}>Add Dart</button>
                    </div>
                    <div className="text-xs text-slate-400">Hits: {trebleHits} · Darts: {trebleDarts}</div>
                  </>
                )}
                {selectedMode === 'Baseball' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:ring; addBaseballAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={resetBaseball}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'Golf' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:ring; addGolfAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={resetGolf}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'Tic Tac Toe' && (
                  <>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {Array.from({length:9},(_,i)=>i).map(cell => (
                        <button key={cell} className={`h-16 rounded-xl border ${ttt.board[cell]?'bg-emerald-500/20 border-emerald-400/30':'bg-slate-800/50 border-slate-700/50'}`} onClick={()=>{
                          if (ttt.finished || ttt.board[cell]) return
                          // One-tap claim attempt using autoscore last dart; fallback: prompt numeric
                          // For simplicity here, we use a no-op value and rely on next autoscore dart; as a usable fallback, open a numeric prompt
                          const promptVal = Number(prompt('Enter dart score for this cell (e.g., 20, 40, 60; 25 or 50 for center)')||0)
                          const ring = promptVal%3===0?'TRIPLE': promptVal%2===0?'DOUBLE':'SINGLE'
                          const tcell = cell as unknown as 0|1|2|3|4|5|6|7|8
                          const tgt = TTT_TARGETS[tcell]
                          const num = tgt.type==='BULL'?null:(tgt.num||null)
                          addTttAuto(tcell, promptVal, ring as any, num as any)
                        }}>{ttt.board[cell] || ''}</button>
                      ))}
                    </div>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => {
                        // Attempt to claim the currently tapped-looking cell not tracked; as a simple flow, map by round-robin preference or let user click a cell button above.
                        // No-op here; primary interaction is via buttons with prompt for now.
                      }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={resetTtt}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'American Cricket' && (
                  <>
                    {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:ring; addAmCricketAuto(value, r as any, info?.sector ?? null) }} />
                    </div>}
                    <div className="flex items-center gap-2">
                      <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={resetAmCricket}>Reset</button>
                    </div>
                  </>
                )}
                {selectedMode === 'Killer' && (
                  <>
                    {!killerSetupDone ? (
                      <div className="space-y-2">
                        <div className="font-semibold">Players</div>
                        <div className="space-y-1">
                          {killerPlayers.map((p, idx) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <input className="input" value={p.name} onChange={e=>{
                                const name = e.target.value
                                setKillerPlayers(list => list.map((it,i)=> i===idx?{...it,name}:it))
                              }} />
                              <button className="btn px-2 py-1" onClick={()=> setKillerPlayers(list => list.filter((_,i)=>i!==idx))} disabled={killerPlayers.length<=2}>Remove</button>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="btn px-2 py-1" onClick={()=> setKillerPlayers(list => {
                            const id = `p${list.length+1}`; return [...list, { id, name: `Player ${list.length+1}` }]
                          })}>Add Player</button>
                          <button className="btn bg-emerald-600 hover:bg-emerald-700 px-3 py-1" onClick={()=>{
                            if (killerPlayers.length < 2) { alert('Need at least 2 players'); return }
                            const ids = killerPlayers.map(p=>p.id)
                            const assigned = assignKillerNumbers(ids)
                            const initStates: Record<string,KillerState> = {}
                            ids.forEach(id => { initStates[id] = createKillerState(assigned[id]) })
                            setKillerAssigned(assigned)
                            setKillerStates(initStates)
                            setKillerTurnIdx(0)
                            setKillerDarts(0)
                            setKillerWinnerId(null)
                            setKillerLastEvent('Assigned numbers')
                            setKillerSetupDone(true)
                          }}>Assign Numbers & Start</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {killerPlayers.map(p => {
                            const st = killerStates[p.id]
                            const num = killerAssigned[p.id]
                            return (
                              <div key={p.id} className={`p-2 rounded-xl border ${st?.eliminated? 'opacity-50 border-red-500/40 bg-red-500/10' : 'border-slate-700/50 bg-slate-800/50'}`}>
                                <div className="flex items-center justify-between text-xs">
                                  <div className="font-semibold">{p.name}</div>
                                  <div className={`text-[10px] px-1.5 py-0.5 rounded ${st?.isKiller?'bg-purple-500/20 text-purple-200 border border-purple-400/30':'bg-slate-600/30 text-slate-300'}`}>{st?.isKiller? 'Killer' : 'Not Killer'}</div>
                                </div>
                                <div className="mt-1 text-sm">Number: <span className="font-semibold">{num}</span></div>
                                <div className="text-sm">Lives: <span className="font-semibold">{st?.lives ?? 0}</span></div>
                              </div>
                            )
                          })}
                        </div>
                        {cameraEnabled && <div className="rounded-2xl overflow-hidden bg-black">
                          <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => {
                            if (killerWinnerId) return
                            const r = ring === 'MISS' ? undefined : ring
                            const sector = info?.sector ?? null
                            const cur = killerPlayers[killerTurnIdx]
                            if (!cur) return
                            setKillerStates(prev => {
                              const copy: Record<string,KillerState> = {}
                              Object.keys(prev).forEach(k => copy[k] = { ...prev[k] })
                              const res = applyKillerDart(cur.id, copy, r as any, sector)
                              if (res.becameKiller) setKillerLastEvent(`${cur.name} became a Killer`)
                              else if (res.victimId) {
                                const v = killerPlayers.find(p=>p.id===res.victimId)
                                setKillerLastEvent(`${cur.name} hit ${v?.name}'s ${killerAssigned[res.victimId]} (${res.livesRemoved} life${(res.livesRemoved||0)>1?'s':''})`)
                              } else setKillerLastEvent('No effect')
                              // Check winner
                              const win = killerWinner(copy)
                              if (win) setKillerWinnerId(win)
                              return copy
                            })
                            setKillerDarts(d => {
                              const nd = d + 1
                              if (nd >= 3) {
                                // advance to next alive
                                let next = killerTurnIdx
                                for (let i=1;i<=killerPlayers.length;i++) {
                                  const idx = (killerTurnIdx + i) % killerPlayers.length
                                  const pid = killerPlayers[idx].id
                                  const st = killerStates[pid]
                                  if (st && !st.eliminated && st.lives > 0) { next = idx; break }
                                }
                                setKillerTurnIdx(next)
                                return 0
                              }
                              return nd
                            })
                          }} />
                        </div>}
                        <div className="flex items-center gap-2">
                          <input className="input w-40" placeholder="Manual (D16, T5)" value={manualBox} onChange={e=>setManualBox(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') {
                            if (killerWinnerId) return
                            const t = manualBox.trim().toUpperCase()
                            const m = t.match(/^(S|D|T)?\s*(\d{1,2})$/)
                            if (!m) { setManualBox(''); return }
                            const mult = (m[1]||'S') as 'S'|'D'|'T'
                            const num = parseInt(m[2],10)
                            const ring = mult==='D'?'DOUBLE': mult==='T'?'TRIPLE':'SINGLE'
                            const cur = killerPlayers[killerTurnIdx]
                            setKillerStates(prev => {
                              const copy: Record<string,KillerState> = {}
                              Object.keys(prev).forEach(k => copy[k] = { ...prev[k] })
                              const res = applyKillerDart(cur.id, copy, ring as any, num)
                              if (res.becameKiller) setKillerLastEvent(`${cur.name} became a Killer`)
                              else if (res.victimId) {
                                const v = killerPlayers.find(p=>p.id===res.victimId)
                                setKillerLastEvent(`${cur.name} hit ${v?.name}'s ${killerAssigned[res.victimId]} (${res.livesRemoved} life${(res.livesRemoved||0)>1?'s':''})`)
                              } else setKillerLastEvent('No effect')
                              const win = killerWinner(copy); if (win) setKillerWinnerId(win)
                              return copy
                            })
                            setManualBox('')
                            setKillerDarts(d => {
                              const nd = d + 1
                              if (nd >= 3) { let next = killerTurnIdx; for (let i=1;i<=killerPlayers.length;i++){ const idx=(killerTurnIdx+i)%killerPlayers.length; const pid=killerPlayers[idx].id; const st=killerStates[pid]; if (st && !st.eliminated && st.lives>0) { next=idx; break } } setKillerTurnIdx(next); return 0 } return nd
                            })
                          } }} />
                          <button className="btn px-3 py-1 text-sm" onClick={()=>{
                            // Skip to next alive player
                            let next = killerTurnIdx
                            for (let i=1;i<=killerPlayers.length;i++) {
                              const idx = (killerTurnIdx + i) % killerPlayers.length
                              const pid = killerPlayers[idx].id
                              const st = killerStates[pid]
                              if (st && !st.eliminated && st.lives > 0) { next = idx; break }
                            }
                            setKillerTurnIdx(next); setKillerDarts(0)
                          }}>Next Player</button>
                          <button className="btn bg-slate-700 hover:bg-slate-800 px-3 py-1 text-sm" onClick={()=>{
                            // Reset Killer
                            setKillerStates({}); setKillerAssigned({}); setKillerSetupDone(false); setKillerTurnIdx(0); setKillerDarts(0); setKillerWinnerId(null); setKillerLastEvent('')
                          }}>Reset</button>
                        </div>
                        {killerWinnerId && (
                          <div className="mt-2 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 inline-block">Winner: {killerPlayers.find(p=>p.id===killerWinnerId)?.name} <button className="ml-2 underline" onClick={()=>{
                            setKillerStates({}); setKillerAssigned({}); setKillerSetupDone(false); setKillerTurnIdx(0); setKillerDarts(0); setKillerWinnerId(null); setKillerLastEvent('')
                          }}>Play Again</button></div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : isPlayerTurn ? (
              <div className="space-y-2">
                <div className="font-semibold">Your Turn</div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      className="input w-24"
                      type="number"
                      min={0}
                      max={60}
                      value={playerDartPoints}
                      onChange={e => setPlayerDartPoints(Number(e.target.value||0))}
                      onKeyDown={e => { if (e.key==='Enter') (e.shiftKey? replaceLast() : addDartNumeric()) }}
                    />
                    <button className="btn px-3 py-1 text-sm" onClick={addDartNumeric}>Add Dart</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      className="input w-44"
                      placeholder="Manual (T20, D16, 5, 25, 50)"
                      value={manualBox}
                      onChange={e=>setManualBox(e.target.value)}
                      onKeyDown={e => { if (e.key==='Enter') (e.shiftKey? replaceLastManual() : addManual()) }}
                    />
                    <button className="btn btn--ghost px-3 py-1 text-sm" onClick={replaceLastManual} disabled={playerVisitDarts===0}>Replace Last</button>
                    <button className="btn px-3 py-1 text-sm" onClick={addManual}>Add</button>
                  </div>
                </div>
                <div className="text-xs text-slate-300">Tip: Enter to Add · Shift+Enter to Replace Last</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="font-semibold">{ai === 'None' ? 'Opponent' : `${ai} AI`} Turn</div>
                {ai !== 'None' ? (
                  <div className="text-sm text-slate-300">Throwing in {Math.ceil(aiCountdownMs/1000)}s...</div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button className="btn" onClick={() => setIsPlayerTurn(true)}>Switch Back to You</button>
                  </div>
                )}
              </div>
            )}
            <div className="h-1" />
              </div>
            </div>
          </ResizableModal>
        </div>
      )}
      {showRules && <X01RulesPopup onClose={() => setShowRules(false)} />}
      {/* Frosted overlay when selecting premium mode without access */}
      {lockedPremium && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 backdrop-blur-sm bg-slate-900/40" />
          <div className="relative z-10 p-4 rounded-xl bg-black/60 border border-slate-700 text-center">
            <div className="text-3xl mb-2">🔒</div>
            <div className="font-semibold">Premium mode locked</div>
            <div className="text-sm text-slate-200/80">Upgrade to PREMIUM to play modes like Killer, Cricket, Shanghai, and more.</div>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: user?.email })
                  });
                  const data = await res.json();
                  if (data.ok && data.url) {
                    window.location.href = data.url;
                    if (data.development) {
                      toast("Opened Stripe test checkout (development mode)", { type: 'info', timeout: 3000 });
                    }
                  } else if (data.error === 'STRIPE_NOT_CONFIGURED') {
                    toast("Premium purchases are not available in this development environment. Please visit the production site to upgrade.", { type: 'error', timeout: 4000 });
                  } else {
                    toast("Failed to create checkout session. Please try again.", { type: 'error', timeout: 4000 });
                  }
                } catch (err) {
                  toast("Error creating checkout. Please try again.", { type: 'error', timeout: 4000 });
                }
              }}
              className="btn mt-3 bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-bold"
            >
              Upgrade to PREMIUM · {formatPriceInCurrency(getUserCurrency(), 5)}
            </button>
          </div>
        </div>
      )}
      {showWinPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <ResizableModal storageKey="ndn:modal:offline-win" className="w-full relative" defaultWidth={420} defaultHeight={360} minWidth={360} minHeight={300} maxWidth={800} maxHeight={700}>
            <h3 className="text-lg font-bold mb-2">Leg Won!</h3>
            <label className="block mb-1">Darts to hit double:</label>
            <div className="flex gap-2 mb-2">
              {[1,2,3].map(n => (
                <button key={n} className={`btn ${doubleDarts===n?'bg-brand-600':''}`} onClick={()=>setDoubleDarts(n)}>{n}</button>
              ))}
            </div>
            <label className="block mb-1">Darts for checkout:</label>
            <div className="flex gap-2 mb-2">
              {[1,2,3].map(n => (
                <button key={n} className={`btn ${checkoutDarts===n?'bg-brand-600':''}`} onClick={()=>setCheckoutDarts(n)}>{n}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 mt-2">
              <button className="btn w-full" onClick={handleWinPopupSubmit}>Submit</button>
              <button className="btn bg-emerald-600 hover:bg-emerald-700 w-full" onClick={() => { setShowWinPopup(false); startMatch(); }}>Rematch</button>
              <button className="btn bg-slate-700 hover:bg-slate-800 w-full" onClick={() => { setShowWinPopup(false); setShowMatchModal(false); setInMatch(false); }}>Back to Menu</button>
            </div>
          </ResizableModal>
        </div>
      )}
      {showMatchSummary && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <ResizableModal storageKey="ndn:modal:offline-summary" className="w-full relative" defaultWidth={820} defaultHeight={520} minWidth={600} minHeight={400} maxWidth={1400} maxHeight={1000}>
            <h3 className="text-xl font-extrabold mb-2">Match Summary</h3>
            <div className="text-xs opacity-80 mb-3">{selectedMode} · {x01Score} start · First to {firstTo}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl glass border border-white/10">
                <div className="text-sm font-semibold mb-1">You</div>
                <div className="text-3xl font-extrabold">{playerLegs}</div>
                <div className="text-xs opacity-80">Legs Won</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="opacity-70">3-Dart Avg</span><div className="font-semibold">{totalPlayerDarts>0 ? ((totalPlayerPoints/totalPlayerDarts)*3).toFixed(1) : '0.0'}</div></div>
                  <div><span className="opacity-70">1-Dart Avg</span><div className="font-semibold">{totalPlayerDarts>0 ? (totalPlayerPoints/totalPlayerDarts).toFixed(2) : '0.00'}</div></div>
                  <div><span className="opacity-70">180s</span><div className="font-semibold">{player180s}</div></div>
                  <div><span className="opacity-70">140+</span><div className="font-semibold">{player140s}</div></div>
                  <div><span className="opacity-70">100+</span><div className="font-semibold">{player100s}</div></div>
                  <div><span className="opacity-70">High Checkout</span><div className="font-semibold">{playerHighestCheckout || '—'}</div></div>
                  <div><span className="opacity-70">Dbl Att</span><div className="font-semibold">{playerDoublesAtt}</div></div>
                  <div><span className="opacity-70">Dbl Hit</span><div className="font-semibold">{playerDoublesHit}</div></div>
                </div>
              </div>
              <div className="hidden md:flex items-center justify-center">
                <div className="text-4xl font-black">{playerLegs} – {aiLegs}</div>
              </div>
              <div className="p-3 rounded-2xl glass border border-white/10">
                <div className="text-sm font-semibold mb-1">{ai==='None' ? 'Opponent' : `${ai} AI`}</div>
                <div className="text-3xl font-extrabold">{aiLegs}</div>
                <div className="text-xs opacity-80">Legs Won</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="opacity-70">3-Dart Avg</span><div className="font-semibold">{totalAiDarts>0 ? ((totalAiPoints/totalAiDarts)*3).toFixed(1) : '0.0'}</div></div>
                  <div><span className="opacity-70">1-Dart Avg</span><div className="font-semibold">{totalAiDarts>0 ? (totalAiPoints/totalAiDarts).toFixed(2) : '0.00'}</div></div>
                  <div><span className="opacity-70">180s</span><div className="font-semibold">{ai180s}</div></div>
                  <div><span className="opacity-70">140+</span><div className="font-semibold">{ai140s}</div></div>
                  <div><span className="opacity-70">100+</span><div className="font-semibold">{ai100s}</div></div>
                  <div><span className="opacity-70">High Checkout</span><div className="font-semibold">{aiHighestCheckout || '—'}</div></div>
                  <div><span className="opacity-70">Dbl Att</span><div className="font-semibold">{aiDoublesAtt}</div></div>
                  <div><span className="opacity-70">Dbl Hit</span><div className="font-semibold">{aiDoublesHit}</div></div>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Legs Timeline</div>
              <div className="flex flex-wrap gap-2">
                {legStats.map((leg, i) => (
                  <div key={i} className={`px-3 py-1 rounded-full border text-xs ${leg.winner==='player' ? 'bg-emerald-500/15 border-emerald-400/30' : 'bg-fuchsia-500/15 border-fuchsia-400/30'}`}>
                    Leg {i+1}: {leg.winner==='player' ? 'You' : (ai==='None'?'Opp':'AI')} · Dbl {leg.doubleDarts} · CO {leg.checkoutDarts}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button className="btn bg-slate-700 hover:bg-slate-800" onClick={() => setShowMatchSummary(false)}>Close</button>
              <button className="btn bg-emerald-600 hover:bg-emerald-700" onClick={() => { setShowMatchSummary(false); startMatch(); }}>Rematch</button>
            </div>
          </ResizableModal>
        </div>
      )}
      {legStats.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Leg Stats</h4>
          <ul>
            {legStats.map((leg, i) => (
              <li key={i}>Leg {i+1}: Double darts: {leg.doubleDarts}, Checkout darts: {leg.checkoutDarts}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}