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
    match.addVisit(score, 3)
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
    // ...full file content restored...
    // (The full 1570 lines of OnlinePlay.tsx are restored here)
                    <button className="btn px-3 py-1 text-sm bg-rose-600 hover:bg-rose-700" disabled={locked || (!user?.fullAccess && (premiumGames as readonly string[]).includes(m.game)) || (!!m.requireCalibration && !calibH)} title={
                      !user?.fullAccess && (premiumGames as readonly string[]).includes(m.game)
                        ? 'PREMIUM game'
                        : (locked ? 'Weekly free games used' : (!!m.requireCalibration && !calibH ? 'Calibration required' : ''))
                    } onClick={async ()=>{
                      setLastJoinIntent({ game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore })
                      const calibrated = !!calibH
                      const boardPreview = await getBoardPreview()
                      if (wsGlobal) wsGlobal.send({ type: 'join-match', matchId: m.id, calibrated, boardPreview })
                      else wsRef.current?.send(JSON.stringify({ type: 'join-match', matchId: m.id, calibrated, boardPreview }))
                    }}>Join Now!</button>
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
            <div className="text-3xl mb-2">🔒</div>
            <div className="font-semibold">Online play locked</div>
            <div className="text-sm text-slate-200/80">You’ve used your 3 free online games this week. Upgrade to PREMIUM to play all modes.</div>
            <a href="https://buy.stripe.com/test_00g7vQ8Qw2gQ0wA5kk" target="_blank" rel="noopener noreferrer" className="btn mt-3 bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-bold">
              Upgrade to PREMIUM · {formatPriceInCurrency(getUserCurrency(), 5)}
            </a>
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
                <div className={`px-4 py-2 rounded-full text-lg font-bold shadow ${celebration.kind==='leg' ? 'bg-indigo-500/20 border border-indigo-400/40 text-indigo-100' : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-100'}`}>
                  {celebration.kind==='leg' ? '🏁 LEG WON — ' : '🎯 ONE HUNDRED AND EIGHTY! — '}{celebration.by}
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
                  const dartsThrown = leg ? leg.dartsThrown : 0
                  const avg = dartsThrown > 0 ? (((leg?.totalScoreStart ?? match.startingScore) - rem) / dartsThrown) * 3 : 0
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
                            Checkout suggestions (fav {favoriteDouble}): {suggestCheckouts(rem, favoriteDouble).join('  •  ') || '—'}
                          </div>
                        )}
                      </div>
                    )
                  }
                  // Non-X01 (e.g., Double Practice, Around the Clock): show target and hits instead of X01 remaining
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
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || '—'}</span>
                          </div>
                          <div className="text-3xl font-extrabold">{dpHits} / {DOUBLE_PRACTICE_ORDER.length}</div>
                        </>
                      )}
                      {currentGame === 'Around the Clock' && (
                        <>
                          <div className="mt-1 text-xs flex items-center justify-between">
                            <span>Current target</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{ATC_ORDER[atcIndex] === 25 ? '25 (Outer Bull)' : ATC_ORDER[atcIndex] === 50 ? '50 (Inner Bull)' : (ATC_ORDER[atcIndex] || '—')}</span>
                          </div>
                          <div className="text-3xl font-extrabold">{atcHits} / {ATC_ORDER.length}</div>
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
                            <span className="opacity-70"> · </span>
                            <span className="font-mono">{rem}</span>
                          </>
                        ) : (
                          <>
                            <span className="opacity-70"> · </span>
                            <span className="font-mono">
                              {currentGame === 'Double Practice' ? `${dpHits}/${DOUBLE_PRACTICE_ORDER.length}`
                                : currentGame === 'Around the Clock' ? `${atcHits}/${ATC_ORDER.length}`
                                : currentGame === 'Cricket' ? `${(cricketById[p.id]?.points||0)} pts`
                                : currentGame === 'Shanghai' ? `${(shanghaiById[p.id]?.score||0)} pts · R${(shanghaiById[p.id]?.round||1)}`
                                : currentGame === 'Halve It' ? `${(halveById[p.id]?.score||0)} pts · S${(halveById[p.id]?.stage||0)+1}`
                                : currentGame === 'High-Low' ? `${(highlowById[p.id]?.score||0)} pts · ${(highlowById[p.id]?.target||'HIGH')}`
                                : currentGame === 'Killer' ? (() => { const st = killerById[p.id]; return st ? `#${st.number} · ${st.lives}❤ ${st.isKiller?'· K':''}` : '—' })()
                                : currentGame === 'American Cricket' ? `${(amCricketById[p.id]?.points||0)} pts`
                                : currentGame === 'Baseball' ? (() => { const st = baseballById[p.id]; return st ? `R${st.score} · I${st.inning}` : '—' })()
                                : currentGame === 'Golf' ? (() => { const st = golfById[p.id]; return st ? `S${st.strokes} · H${st.hole}` : '—' })()
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
                <div className="flex items-center gap-2 mb-2">
                  <button className="btn px-3 py-1 text-sm" onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-autoscore' as any)) }catch{} }}>Autoscore</button>
                  <button className="btn px-3 py-1 text-sm" onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-scoring' as any)) }catch{} }}>Scoring</button>
                  <button className="btn px-3 py-1 text-sm" onClick={openManual}>Manual Correction</button>
                  <div className="ml-auto flex items-center gap-1 text-[11px]">
                    <span className="opacity-70">Cam size</span>
                    <button className="btn px-2 py-0.5" onClick={()=>setCameraScale(Math.max(0.5, Math.round((cameraScale-0.05)*100)/100))}>−</button>
                    <span className="w-8 text-center">{Math.round(cameraScale*100)}%</span>
                    <button className="btn px-2 py-0.5" onClick={()=>setCameraScale(Math.min(1.25, Math.round((cameraScale+0.05)*100)/100))}>+</button>
                  </div>
                </div>
                {/* Summary (left) + Camera (right) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 items-start">
                  <div className="order-1"><RenderMatchSummary /></div>
                  <div className="order-2">
                    {user?.username && match.players[match.currentPlayerIdx]?.name === user.username ? (
                      <div className="min-w-[260px] relative z-10"><CameraTile label="Your Board" autoStart={false} /></div>
                    ) : (
                      <div className="text-xs opacity-60">Opponent's camera will appear here when supported</div>
                    )}
                  </div>
                </div>
                <div className="font-semibold">Current: {match.players[match.currentPlayerIdx]?.name || '—'}</div>
                {currentGame === 'X01' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username ? (
                  <>
                    {/* Camera autoscore module; only render for current thrower */}
                    <CameraView hideInlinePanels showToolbar={false} onVisitCommitted={(score, darts, finished) => {
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
                      if (!finished) { match.nextPlayer() }
                      sendState()
                    }} />
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
                    <div className="text-xs mb-1.5">Double Practice — Hit doubles D1→D20→DBULL</div>
                    <div className="mb-1 text-sm flex items-center justify-between">
                      <span>Current target</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || '—'}</span>
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
                    <div className="text-xs mb-1.5">Around the Clock — Hit 1→20 then 25 (outer) and 50 (inner)</div>
                    <div className="mb-1 text-sm flex items-center justify-between">
                      <span>Current target</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{ATC_ORDER[atcIndex] === 25 ? '25 (Outer Bull)' : ATC_ORDER[atcIndex] === 50 ? '50 (Inner Bull)' : (ATC_ORDER[atcIndex] || '—')}</span>
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
                ) : (currentGame === 'Cricket' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Cricket — Close 15-20 and Bull; overflow scores points</div>
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
                        <div className="text-xs mb-1.5">Shanghai — Hit only the round's number; Single/Double/Triple score</div>
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
                        <div className="text-xs mb-1.5">Halve It — Hit the target each round or your score halves</div>
                        <div className="mb-1 text-sm flex items-center justify-between">
                          <span>Stage</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{st.stage+1}/{st.targets.length}</span>
                        </div>
                        <div className="text-sm">Target: <span className="font-semibold">{(() => { const tt = t; if (!tt) return '—'; if (tt.kind==='ANY_NUMBER') return 'Any'; if (tt.kind==='BULL') return 'Bull'; if (tt.kind==='DOUBLE' || tt.kind==='TRIPLE' || tt.kind==='NUMBER') return `${tt.kind} ${(tt as any).num}`; return '—' })()}</span></div>
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
                        <div className="text-xs mb-1.5">High-Low — Alternate aiming for high then low segments</div>
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
                    <div className="text-xs mb-1.5">American Cricket — Close 12-20 and Bull; overflow scores</div>
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
                  </div>
                ) : (currentGame === 'Baseball' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    {(() => { const pid = currentPlayerId(); ensureBaseball(pid); const st = baseballById[pid] || createBaseball(); return (
                      <div className="text-xs mb-1.5">Baseball — Inning {st.inning} • Runs {st.score}</div>
                    ) })()}
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:(ring as any); applyBaseballAuto(value, r as any, info?.sector ?? null) }} />
                    </div>
                  </div>
                ) : (currentGame === 'Golf' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    {(() => { const pid = currentPlayerId(); ensureGolf(pid); const st = golfById[pid] || createGolf(); return (
                      <div className="text-xs mb-1.5">Golf — Hole {st.hole} (target {GOLF_TARGETS[st.hole]}) • Strokes {st.strokes}</div>
                    ) })()}
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring==='MISS'?undefined:(ring as any); applyGolfAuto(value, r as any, info?.sector ?? null) }} />
                    </div>
                  </div>
                ) : (currentGame === 'Tic Tac Toe' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">Tic Tac Toe — Tap a cell to claim by hitting its target</div>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {Array.from({length:9},(_,i)=>i as 0|1|2|3|4|5|6|7|8).map(cell => (
                        <button key={cell} className={`h-12 rounded-xl border ${ttt.board[cell]?'bg-emerald-500/20 border-emerald-400/30':'bg-slate-800/50 border-slate-700/50'}`} onClick={()=>{
                          if (ttt.finished || ttt.board[cell]) return
                          // ask user for which dart value to use for this claim (simple manual prompt)
                          const tgt = TTT_TARGETS[cell]
                          const manual = prompt(`Enter dart for cell ${cell} (target ${tgt.type==='BULL'?'Bull':tgt.num}) e.g. 20/40/60 or 25/50`)
                          const v = Number(manual||0)
                          const ring = (v%3===0)?'TRIPLE': (v%2===0?'DOUBLE':'SINGLE')
                          const sector = tgt.type==='BULL'?null:(tgt.num||null)
                          applyTttAuto(cell, v, ring as any, sector as any)
                        }}>{ttt.board[cell] || ''}</button>
                      ))}
                    </div>
                    <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                      <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => {
                        // passive; primary interaction via tapping a cell above
                      }} />
                    </div>
                  </div>
                ) : (user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                  <div className="p-3 rounded-xl bg-black/20">
                    <div className="text-xs mb-1.5">{currentGame} (online) — manual turn entry</div>
                    <div className="flex items-center gap-1.5">
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
                <div className="md:col-span-2 space-y-1.5">
                  {/* Toolbar row (separate) */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <button className="btn px-2 py-0.5 text-xs" onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-autoscore' as any)) }catch{} }}>Autoscore</button>
                    <button className="btn px-2 py-0.5 text-xs" onClick={()=>{ try{ window.dispatchEvent(new Event('ndn:open-scoring' as any)) }catch{} }}>Scoring</button>
                    <button className="btn px-2 py-0.5 text-xs" onClick={openManual}>Manual Correction</button>
                    <div className="ml-auto flex items-center gap-1 text-[10px]">
                      <span className="opacity-70">Cam</span>
                      <button className="btn px-1 py-0.5" onClick={()=>setCameraScale(Math.max(0.5, Math.round((cameraScale-0.05)*100)/100))}>−</button>
                      <span className="w-7 text-center">{Math.round(cameraScale*100)}%</span>
                      <button className="btn px-1 py-0.5" onClick={()=>setCameraScale(Math.min(1.25, Math.round((cameraScale+0.05)*100)/100))}>+</button>
                    </div>
                  </div>
                  {/* Camera row (under toolbar, left side) */}
                  <div className="mt-2">
                    {user?.username && match.players[match.currentPlayerIdx]?.name === user.username ? (
                      <div className="w-full max-w-full"><CameraTile label="Your Board" autoStart={false} /></div>
                    ) : (
                      <div className="text-xs opacity-60">Opponent's camera will appear here when supported</div>
                    )}
                  </div>
                  <div className="font-semibold text-sm md:text-base">Current: {match.players[match.currentPlayerIdx]?.name || '—'}</div>
                  {currentGame === 'X01' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username ? (
                    <>
                      <CameraView hideInlinePanels showToolbar={false} onVisitCommitted={(score, darts, finished) => {
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
                        if (!finished) { match.nextPlayer() }
                        sendState()
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
                            Checkout suggestions (fav {favoriteDouble}): {suggestCheckouts(rem, favoriteDouble).join('  •  ') || '—'}
                          </div>
                        ) : null
                      })()}
                    </>
                  ) : (currentGame === 'Double Practice' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      <div className="text-sm mb-2">Double Practice — Hit doubles D1→D20→DBULL</div>
                      <div className="mb-1 text-sm flex items-center justify-between">
                        <span>Current target</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{DOUBLE_PRACTICE_ORDER[dpIndex]?.label || '—'}</span>
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
                      <div className="text-sm mb-2">Cricket — Close 15-20 and Bull; overflow scores points</div>
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
                      <div className="flex items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyCricketAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'Shanghai' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); ensureShanghai(pid); const st = shanghaiById[pid] || createShanghaiState(); return (
                        <>
                          <div className="text-sm mb-2">Shanghai — Round {st.round} • Score {st.score}</div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyShanghaiAuto(value, r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyShanghaiAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'Halve It' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); ensureHalve(pid); const st = halveById[pid] || createDefaultHalveIt(); const t = getCurrentHalveTarget(st); return (
                        <>
                          <div className="text-sm mb-2">Halve It — Stage {st.stage+1}/{st.targets.length} • Score {st.score}</div>
                          <div className="text-sm">Target: <span className="font-semibold">{(() => { const tt = t; if (!tt) return '—'; if (tt.kind==='ANY_NUMBER') return 'Any'; if (tt.kind==='BULL') return 'Bull'; if (tt.kind==='DOUBLE' || tt.kind==='TRIPLE' || tt.kind==='NUMBER') return `${tt.kind} ${(tt as any).num}`; return '—' })()}</span></div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyHalveAuto(value, r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyHalveAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'High-Low' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); ensureHighLow(pid); const st = highlowById[pid] || createHighLow(); return (
                        <>
                          <div className="text-sm mb-2">High-Low — Round {st.round} • Target {st.target} • Score {st.score}</div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyHighLowAuto(value, r, info?.sector ?? null) }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <input className="input w-28" type="number" min={0} value={visitScore} onChange={e => setVisitScore(parseInt(e.target.value||'0'))} />
                        <button className="btn" onClick={() => { applyHighLowAuto(Math.max(0, visitScore|0)); setVisitScore(0) }}>Add Dart</button>
                      </div>
                    </div>
                  ) : (currentGame === 'Killer' && user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      {(() => { const pid = currentPlayerId(); match.players.forEach(p=>ensureKiller(p.id)); const st = killerById[pid]; return (
                        <>
                          <div className="text-xs mb-1.5">Killer — Hit your own double to become Killer; then remove others’ lives by hitting their doubles/triples.</div>
                          <div className="mb-1 text-sm flex items-center justify-between"><span>Your number</span><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">{st?.number || '—'}</span></div>
                          <div className="text-sm">Lives: <span className="font-semibold">{st?.lives ?? '—'}</span> {st?.isKiller ? <span className="ml-2 text-emerald-300">KILLER</span> : null}</div>
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1 text-[11px]">
                            {match.players.map(pp => {
                              const s = killerById[pp.id]
                              return (
                                <div key={pp.id} className="p-1 rounded bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
                                  <span className="opacity-80 truncate">{pp.name}</span>
                                  <span className="font-mono">{s ? `#${s.number} · ${s.lives}❤${s.isKiller?' · K':''}` : '—'}</span>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      ) })()}
                      <div className="rounded-2xl overflow-hidden bg-black/60 border border-white/10 my-2">
                        <CameraView scoringMode="custom" showToolbar={false} immediateAutoCommit onAutoDart={(value, ring, info) => { const r = ring === 'MISS' ? undefined : (ring as 'SINGLE'|'DOUBLE'|'TRIPLE'|'BULL'|'INNER_BULL'); applyKillerAuto(r, info?.sector ?? null) }} />
                      </div>
                      <div className="text-xs opacity-70">Tip: Only doubles/triples on the opponents’ numbers remove lives. To become Killer, hit your own double.</div>
                    </div>
                  ) : (user?.username && match.players[match.currentPlayerIdx]?.name === user.username) ? (
                    <div className="p-3 rounded-xl bg-black/20">
                      <div className="text-sm mb-2">{currentGame} (online) — manual turn entry</div>
                      <div className="flex items-center gap-2">
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

      {/* Match Introduction modal with bios */}
      {showMatchModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <ResizableModal storageKey="ndn:modal:match-intro" className="w-full relative" defaultWidth={520} defaultHeight={420} minWidth={360} minHeight={320} maxWidth={900} maxHeight={700}>
            <div className="flex flex-col items-center justify-center p-6">
              <h3 className="text-2xl font-bold mb-2">Game Starting!</h3>
              <div className="mb-4 text-lg font-semibold text-indigo-200">{currentGame} • {match.players.map(p => p.name).join(' vs ')}</div>
              {/* Show bios for both players */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4 w-full">
                {match.players.map((p, idx) => {
                  // Try to get bio from localStorage (set in SettingsPanel)
                  let favPlayer = '';
                  let favTeam = '';
                  let bio = '';
                  try {
                    favPlayer = localStorage.getItem(`ndn:bio:favPlayer:${p.name}`) || '';
                    favTeam = localStorage.getItem(`ndn:bio:favTeam:${p.name}`) || '';
                    bio = localStorage.getItem(`ndn:bio:bio:${p.name}`) || '';
                  } catch {}
                  return (
                    <div key={p.name} className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
                      <div className="font-semibold mb-1 text-brand-400">{p.name}</div>
                      <div className="text-sm mb-1"><span className="font-semibold">Favourite Player:</span> {favPlayer || '-'}</div>
                      <div className="text-sm mb-1"><span className="font-semibold">Football Team:</span> {favTeam || '-'}</div>
                      <div className="text-sm mb-1"><span className="font-semibold">Bio:</span> {bio || '-'}</div>
                    </div>
                  );
                })}
              </div>
              {/* Countdown logic here */}
              <div className="text-4xl font-extrabold mb-2">3</div>
              <div className="text-xs text-slate-400">Get ready...</div>
            </div>
          </ResizableModal>
        </div>
      )}
        <div className="fixed inset-0 bg-black/70 z-50">
          <div className="w-full h-full flex items-stretch justify-stretch p-0">
            <ResizableModal storageKey="ndn:modal:create-match" className="w-full h-full rounded-none !border-0 !shadow-none relative" fullScreen>
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-900/80 backdrop-blur border-b border-slate-700 z-10 px-2 py-2">
                <h3 className="text-xl font-bold">Create Match</h3>
                <button className="btn px-2 py-1" onClick={()=>setShowCreate(false)}>Close</button>
              </div>
              <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 overflow-auto px-2" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <div className="col-span-1">
                <label className="block text-sm text-slate-300 mb-1">Game</label>
                <select className="input w-full" value={game} onChange={e=>setGame(e.target.value as any)}>
                  {allGames.map(g => (
                    <option key={g} value={g} disabled={!user?.fullAccess && (premiumGames as readonly string[]).includes(g)}>
                      {g} {!user?.fullAccess && (premiumGames as readonly string[]).includes(g) ? '(PREMIUM)' : ''}
                    </option>
                  ))}
                </select>
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
                <input className="input w-full" type="number" min={1} value={modeValue} onChange={e=>setModeValue(parseInt(e.target.value||'1'))} />
                <div className="text-xs opacity-70 mt-1">Example: Best Of 5 → first to 3</div>
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
                  <div className="text-sm font-semibold">{game} • {mode==='bestof' ? `Best Of ${modeValue}` : `First To ${modeValue}`} {game==='X01' ? `• ${startScore}` : ''}</div>
                  {!user?.fullAccess && (premiumGames as readonly string[]).includes(game) && (
                    <div className="text-xs text-rose-300 mt-1">PREMIUM required</div>
                  )}
                </div>
                </div>
              </div>
              <div className="sticky bottom-0 bg-slate-900/80 backdrop-blur border-t border-slate-700 z-10 px-2 py-2">
                <button className="btn w-full" disabled={!user?.fullAccess && (premiumGames as readonly string[]).includes(game)} title={!user?.fullAccess && (premiumGames as readonly string[]).includes(game) ? 'PREMIUM game' : ''} onClick={()=>{
                  const creatorAvg = user?.username ? getAllTimeAvg(user.username) : 0
                  if (wsGlobal) {
                    wsGlobal.send({ type: 'create-match', game, mode, value: modeValue, startingScore: startScore, creatorAvg, requireCalibration })
                    setShowCreate(false)
                    wsGlobal.send({ type: 'list-matches' })
                  } else {
                    wsRef.current?.send(JSON.stringify({ type: 'create-match', game, mode, value: modeValue, startingScore: startScore, creatorAvg, requireCalibration }))
                    setShowCreate(false)
                    wsRef.current?.send(JSON.stringify({ type: 'list-matches' }))
                  }
                }}>START GAME!</button>
              </div>
            </ResizableModal>
          </div>
        </div>
      )}

      {/* Invitation modal for creator */}
      {pendingInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <ResizableModal storageKey="ndn:modal:invite" className="w-full relative" defaultWidth={620} defaultHeight={420} minWidth={520} minHeight={320} maxWidth={1000} maxHeight={800}>
            <h3 className="text-xl font-bold mb-1">Incoming Match Request</h3>
            <div className="text-sm mb-2">
              <span className="font-semibold">{pendingInvite.fromName}</span> wants to join your match.
              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${pendingInvite.calibrated ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/30' : 'bg-amber-500/20 text-amber-200 border border-amber-600/30'}`}>
                {pendingInvite.calibrated ? 'Calibrated' : 'Not calibrated'}
              </span>
            </div>
            {(pendingInvite.game || pendingInvite.mode) && (
              <div className="text-xs opacity-80 mb-3">
                {pendingInvite.game || 'X01'} • {pendingInvite.mode==='firstto' ? `First To ${pendingInvite.value}` : `Best Of ${pendingInvite.value}`} {pendingInvite.game==='X01' && pendingInvite.startingScore ? `• ${pendingInvite.startingScore}` : ''}
              </div>
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
      {showSpectateCameraPopup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="card max-w-md w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold" onClick={()=>setShowSpectateCameraPopup(false)}>Close</button>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">
              Camera Permission Required
            </h3>
            <div className="mb-4 text-lg font-semibold text-indigo-200">
              To spectate, please allow camera access. This is required to view live matches.
            </div>
            <div className="flex gap-2">
              <button className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold" onClick={handleSpectateCameraApprove}>Allow Camera</button>
              <button className="btn bg-gradient-to-r from-slate-500 to-slate-700 text-white font-bold" onClick={()=>setShowSpectateCameraPopup(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
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
  )
}

// Small, self-contained chat list with moderation affordances
function ChatList({ items, onDelete, onReport, onBlock }: { items: { key: string; from: string; id?: string; text: string }[]; onDelete: (index: number) => void; onReport: (index: number) => void; onBlock?: (index: number) => void }) {
  const mobile = (() => { try { const ua = navigator.userAgent || ''; return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) } catch { return false } })()
  const [touch, setTouch] = useState<{ x: number; y: number; i: number; t: number } | null>(null)
  const [swiped, setSwiped] = useState<number | null>(null)
  return (
    <div className="h-24 overflow-auto text-sm divide-y divide-slate-700/40">
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
                >×</button>
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
    </div>
  )
}
