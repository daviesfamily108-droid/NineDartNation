import { useTheme } from './ThemeContext';
import { useEffect, useState } from 'react';
// Simulated user and username store (replace with real backend/API in production)
const existingUsernames = ['DartsWithG', 'BullseyeChamp', 'SharpShooter'];
import { STRIPE_CHECKOUT_URL } from '../utils/stripe'
import { User, Globe, Bell, HelpCircle, Image, Lightbulb, Volume2, Shield, Wallet as WalletIcon, DollarSign } from 'lucide-react';
import AdminDashboard from './AdminDashboard'
import { useIsAdmin } from '../utils/admin'
import { useUserSettings } from '../store/userSettings';
import StatPills from './StatPills'
import { getAllTime, getAllTimeAvg, getAllTimeFirstNineAvg, getMonthlyAvg3, getMonthlyFirstNineAvg, clearAllStats } from '../store/profileStats'
import { formatAvg } from '../utils/stats'
import { useUserSettings as useSettingsStore } from '../store/userSettings'

const tips = [
  "Focus on your stance and grip for consistency.",
  "Practice doubles and finishing combinations regularly.",
  "Keep your eyes on the target, not the dart.",
  "Track your stats to identify areas for improvement.",
  "Warm up before matches to get your rhythm.",
  "Stay calm and confident, even under pressure."
];

export default function SettingsPanel({ user }: { user?: any }) {
  // Logout pill for mock login
  function handleLogout() {
    setTimeout(() => {
      window.dispatchEvent(new Event('ndn:logout'));
    }, 100);
  }
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ndn:avatar')
      if (saved) setAvatar(saved)
    } catch {}
  }, [])
  const [language, setLanguage] = useState('English');
  const [notifications, setNotifications] = useState(true);
  const [showTips, setShowTips] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  const [nameChangeCount, setNameChangeCount] = useState(0);
  const [error, setError] = useState('');
  const [showStripe, setShowStripe] = useState(false);
  // Wallet state
  const [wallet, setWallet] = useState<{ email: string, balances: Record<string, number> }|null>(null)
  const [wCurrency, setWCurrency] = useState('GBP')
  const [wAmount, setWAmount] = useState('')
  const [wMsg, setWMsg] = useState('')
  const [payout, setPayout] = useState<{ brand: string, last4: string }|null>(null)
  const [pBrand, setPBrand] = useState('Visa')
  const [pLast4, setPLast4] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  function handleAvatarChange(e: any) {
    const input = e.target as HTMLInputElement
    const file = input?.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setAvatar(dataUrl)
        try { localStorage.setItem('ndn:avatar', dataUrl) } catch {}
        // Notify the rest of the app to refresh header avatar immediately, with payload
        try { window.dispatchEvent(new CustomEvent('ndn:avatar-updated' as any, { detail: dataUrl } as any)) } catch {}
        // Allow selecting the same file again to re-trigger change
        try { if (input) input.value = '' } catch {}
      }
      reader.readAsDataURL(file)
    }
  }
  const {
    favoriteDouble, setFavoriteDouble,
    callerEnabled, setCallerEnabled,
    callerVoice, setCallerVoice,
    callerVolume, setCallerVolume,
    speakCheckoutOnly, setSpeakCheckoutOnly,
    avgMode, setAvgMode,
    autoStartOffline, setAutoStartOffline,
    rememberLastOffline, setRememberLastOffline,
    lastOffline, setLastOffline,
    reducedMotion, setReducedMotion,
    compactHeader, setCompactHeader,
    allowSpectate, setAllowSpectate,
    cameraScale, setCameraScale,
    cameraAspect, setCameraAspect,
    calibrationGuide, setCalibrationGuide,
    autoscoreProvider, setAutoscoreProvider,
    autoscoreWsUrl, setAutoscoreWsUrl,
    offlineLayout, setOfflineLayout,
  } = useUserSettings();
  const voices = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis.getVoices() : [];

  useEffect(() => {
    // Initialize from current user on mount
    if (user?.username) setDisplayName(user.username)
  }, [user?.username])

  function handleDisplayNameChange(e: any) {
    setError('');
    const newName = e.target.value;
    setDisplayName(newName);
    // Check uniqueness
    if (existingUsernames.includes(newName)) {
      setError('This username is already taken. Please choose another.');
    }
  }

  function handleSaveDisplayName() {
    setError('');
    if (existingUsernames.includes(displayName)) {
      setError('This username is already taken. Please choose another.');
      return;
    }
    if (nameChangeCount < 2) {
      setNameChangeCount(nameChangeCount + 1);
      // Persist locally and broadcast change event
      try {
        // Maintain a small local change log for auditing
        const key = 'ndn:username-log'
        const prev = JSON.parse(localStorage.getItem(key) || '[]')
        const from = user?.username || ''
        const to = displayName.trim()
        const rec = { from, to, ts: Date.now() }
        localStorage.setItem(key, JSON.stringify([rec, ...prev].slice(0, 20)))
        // Also store the current username for next session convenience
        localStorage.setItem('ndn:username', to)
      } catch {}
      try {
        // Notify app to update in-memory user + propagate to WS presence
        window.dispatchEvent(new CustomEvent('ndn:username-changed' as any, { detail: { username: displayName.trim() } } as any))
      } catch {}
      setError('Display name changed successfully!');
    } else {
      setShowStripe(true);
    }
  }

  const isAdmin = useIsAdmin(user?.email)
  const [subTab, setSubTab] = useState<'settings'>('settings')
  function resetLayout() {
    // Broadcast a layout reset event; ResizableModal listens for this and clears local storage
    try { window.dispatchEvent(new Event('ndn:layout-reset' as any)) } catch {}
  }

  async function loadWallet() {
    if (!user?.email) { setWallet(null); return }
    try {
      const res = await fetch(`/api/wallet/balance?email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      if (data?.ok) setWallet(data.wallet)
    } catch {}
  }

  async function loadPayout() {
    if (!user?.email) { setPayout(null); return }
    try {
      const res = await fetch(`/api/wallet/payout-method?email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      if (data?.ok) setPayout(data.method || null)
    } catch {}
  }

  useEffect(() => { loadWallet(); loadPayout() }, [user?.email])

  async function savePayout() {
    setWMsg('')
    if (!user?.email) { setWMsg('Please sign in.'); return }
    if (!/^\d{4}$/.test(pLast4)) { setWMsg('Enter last 4 digits.'); return }
    try {
      const res = await fetch('/api/wallet/link-card', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: user.email, brand: pBrand, last4: pLast4 }) })
      const d = await res.json()
      if (!res.ok || !d?.ok) { setWMsg(d?.error || 'Failed to link'); return }
      setPayout(d.method)
      setPLast4('')
      setWMsg('Payout method saved.')
    } catch { setWMsg('Network error') }
  }

  async function requestWithdraw() {
    setWMsg('')
    if (!user?.email) { setWMsg('Please sign in.'); return }
    const amt = Number(wAmount)
    if (!Number.isFinite(amt) || amt <= 0) { setWMsg('Enter a valid amount.'); return }
    try {
      const res = await fetch('/api/wallet/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, currency: wCurrency, amount: amt }) })
      if (!res.ok) {
        const d = await res.json().catch(()=>null)
        setWMsg(d?.error || 'Request failed')
        return
      }
      const d = await res.json().catch(()=>null)
      if (d?.paid) {
        setWMsg(`Paid instantly to ${d?.method?.brand || 'card'} •••• ${d?.method?.last4 || '----'}.`)
      } else {
        setWMsg('Withdrawal requested. Admin will review shortly.')
      }
      setWAmount('')
      await loadWallet()
    } catch {
      setWMsg('Network error')
    }
  }

  // Component render starts here
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-brand-700 flex items-center gap-2"><User className="w-6 h-6 text-brand-400" /> Settings</h2>
        <div className="flex items-center gap-2">
          <button className={`btn ${subTab==='settings' ? 'bg-brand-600' : ''}`} onClick={()=>setSubTab('settings')}>Settings</button>
          <button
            className="btn bg-rose-600 hover:bg-rose-700"
            onClick={() => {
              try {
                localStorage.removeItem('ndn:avatar')
                localStorage.removeItem('ndn:settings')
              } catch {}
              try { window.dispatchEvent(new Event('ndn:logout' as any)) } catch {}
            }}
          >Log out</button>
        </div>
      </div>
      {
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block font-semibold mb-1 flex items-center gap-2"><Image className="w-5 h-5 text-brand-400" /> Profile avatar:</label>
          <input className="input w-full mb-2" type="file" accept="image/*" onChange={handleAvatarChange} />
          {avatar && (
            <div className="flex items-center gap-3 mb-2">
              <img src={avatar} alt="Avatar" className="rounded-full w-16 h-16" />
              <button
                type="button"
                className="btn bg-rose-600 hover:bg-rose-700"
                onClick={() => {
                  setAvatar('')
                  try { localStorage.removeItem('ndn:avatar') } catch {}
                  try { window.dispatchEvent(new CustomEvent('ndn:avatar-updated' as any, { detail: '' } as any)) } catch {}
                }}
                title="Remove custom avatar"
              >Remove</button>
            </div>
          )}

          <label className="block font-semibold mb-1 flex items-center gap-2"><User className="w-5 h-5 text-brand-400" /> Change display name:</label>
          <input className="input w-full mb-2" type="text" value={displayName} onChange={handleDisplayNameChange} placeholder="New display name" />
          <button className="btn bg-brand-600 text-white mb-2" onClick={handleSaveDisplayName}>
            {nameChangeCount < 2 ? `Change Name (${2 - nameChangeCount} free left)` : 'Pay to Change Name'}
          </button>
          {error && <div className="text-red-500 font-bold mb-2">{error}</div>}
          {showStripe && (
            <div className="mb-2">
              <a href={STRIPE_CHECKOUT_URL} target="_blank" rel="noopener noreferrer" className="btn bg-pink-600 text-white w-full font-bold">Pay via Stripe</a>
              <div className="text-xs text-gray-300 mt-1">After payment, you can change your name again.</div>
            </div>
          )}

          <label className="block font-semibold mb-1 flex items-center gap-2"><Globe className="w-5 h-5 text-brand-400" /> Language:</label>
          <select className="input w-full mb-2" value={language} onChange={e => setLanguage(e.target.value)}>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
            <option>German</option>
            <option>Chinese</option>
          </select>
          <label className="block font-semibold mb-1">Theme:</label>
          <select className="input w-full mb-4" value={theme} onChange={e => setTheme(e.target.value)}>
            <option value="default">Default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
            <div className="font-semibold mb-2 flex items-center gap-2"><Volume2 className="w-4 h-4"/> Caller & Checkout</div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-indigo-600" checked={callerEnabled} onChange={e => setCallerEnabled(e.target.checked)} />
                Enable score caller
              </label>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="text-slate-600 col-span-1">Caller volume</div>
                <input className="col-span-2" type="range" min={0} max={1} step={0.05} value={callerVolume} onChange={e=>setCallerVolume(parseFloat(e.target.value))} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-indigo-600" checked={speakCheckoutOnly} onChange={e => setSpeakCheckoutOnly(e.target.checked)} />
                Speak checkout reminders only
              </label>
              <div>
                <div className="text-slate-600 mb-1">Average mode (header)</div>
                <select className="input w-full" value={avgMode} onChange={e => setAvgMode(e.target.value as any)}>
                  <option value="all-time">All-time (cumulative)</option>
                  <option value="24h">Last 24 hours (rolling)</option>
                </select>
              </div>
              <div>
                <div className="text-slate-600 mb-1">Favorite double for checkouts</div>
                <select className="input w-full" value={favoriteDouble} onChange={e => setFavoriteDouble(e.target.value)}>
                  {['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12','D13','D14','D15','D16','D17','D18','D19','D20','DB'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-slate-600 mb-1">Caller voice (optional)</div>
                <select className="input w-full" value={callerVoice} onChange={e => setCallerVoice(e.target.value)}>
                  <option value="">System Default</option>
                  {voices.map(v => (
                    <option key={`${v.name}-${v.lang}`} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </select>
                <div className="text-xs text-slate-400 mt-1">Uses your browser's built-in speech synthesis voices.</div>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 mt-4">
            <div className="font-semibold mb-2">Camera</div>
            <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 text-sm">
              Use any camera or autoscore system you already own. Choose our built-in autoscore, or connect an external provider over WebSocket. To calibrate the board, open the Calibrate tab.
            </div>
            <div className="grid grid-cols-2 gap-2 items-end text-sm mb-3">
              <div>
                <div className="text-slate-600 mb-1">Autoscore provider</div>
                <select className="input w-full" value={autoscoreProvider || 'built-in'} onChange={e=>setAutoscoreProvider((e.target.value as any)||'built-in')}>
                  <option value="built-in">Built-in (click overlay)</option>
                  <option value="external-ws">External (WebSocket)</option>
                </select>
              </div>
              {autoscoreProvider === 'external-ws' && (
                <div>
                  <div className="text-slate-600 mb-1">WS URL (wss://...)</div>
                  <input className="input w-full" placeholder="wss://example.com/autoscore" value={autoscoreWsUrl||''} onChange={e=>setAutoscoreWsUrl(e.target.value)} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 items-center text-sm mb-2">
              <div className="text-slate-600 col-span-1">Default camera size</div>
              <div className="col-span-2 flex items-center gap-2">
                <button className="btn px-2 py-0.5" onClick={()=>setCameraScale(Math.max(0.5, Math.round((cameraScale-0.05)*100)/100))}>−</button>
                <input className="flex-1" type="range" min={0.5} max={1.25} step={0.05} value={cameraScale} onChange={e=>setCameraScale(parseFloat(e.target.value))} />
                <button className="btn px-2 py-0.5" onClick={()=>setCameraScale(Math.min(1.25, Math.round((cameraScale+0.05)*100)/100))}>+</button>
                <div className="w-10 text-right">{Math.round(cameraScale*100)}%</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 items-center text-sm mb-2">
              <div className="text-slate-600 col-span-1">Camera aspect</div>
              <div className="col-span-2">
                <select className="input w-full" value={cameraAspect || 'wide'} onChange={e=>setCameraAspect((e.target.value as any) || 'wide')}>
                  <option value="wide">Wide (16:9)</option>
                  <option value="square">Square (1:1)</option>
                </select>
              </div>
            </div>
            {/* Device picker */}
            <DevicePicker />
          </div>
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 mt-4">
            <div className="font-semibold mb-2">Online & Privacy</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-indigo-600" checked={allowSpectate} onChange={e=>setAllowSpectate(e.target.checked)} />
              Allow friends to spectate my online matches
            </label>
            <div className="text-xs opacity-70 mt-1">When off, friends won’t be able to spectate your live games from the Friends tab.</div>
          </div>
        </div>
        <div>
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 mb-4">
            <div className="font-semibold mb-2">Offline match defaults</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="checkbox" className="accent-indigo-600" checked={autoStartOffline} onChange={e=>setAutoStartOffline(e.target.checked)} />
              Auto-start last offline match when I pick Offline
            </label>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" className="accent-indigo-600" checked={rememberLastOffline} onChange={e=>setRememberLastOffline(e.target.checked)} />
              Remember last offline setup
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-slate-600 mb-1">Mode</div>
                <select className="input w-full" value={lastOffline.mode} onChange={e=>setLastOffline({ mode: e.target.value })}>
                  {['X01','Double Practice','Around the Clock','Cricket','Halve It','Shanghai','High-Low','Killer'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div className="text-slate-600 mb-1">X01 start</div>
                <input className="input w-full" type="number" value={lastOffline.x01Start} onChange={e=>setLastOffline({ x01Start: parseInt(e.target.value||'501') })} />
              </div>
              <div>
                <div className="text-slate-600 mb-1">First to</div>
                <input className="input w-full" type="number" value={lastOffline.firstTo} onChange={e=>setLastOffline({ firstTo: parseInt(e.target.value||'1') })} />
              </div>
              <div>
                <div className="text-slate-600 mb-1">AI Level</div>
                <select className="input w-full" value={lastOffline.aiLevel} onChange={e=>setLastOffline({ aiLevel: e.target.value })}>
                  {['None','Easy','Medium','Hardened'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mt-2">
              <div>
                <div className="text-slate-600 mb-1">Offline layout</div>
                <select className="input w-full" value={offlineLayout || 'modern'} onChange={e=>setOfflineLayout((e.target.value as any) || 'modern')}>
                  <option value="classic">Classic</option>
                  <option value="modern">Modern</option>
                </select>
              </div>
            </div>
          </div>

          {/* All-time stats quick view (4x2 pills) */}
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 mb-4">
            <div className="font-semibold mb-2">All-time stats</div>
            {(() => {
              const name = user?.username || 'Player 1'
              const all = getAllTime(name)
              const items = [
                { key: 'best3', label: 'Best 3-dart', value: formatAvg(all.best3||0) },
                { key: 'worst3', label: 'Worst 3-dart', value: formatAvg(all.worst3||0) },
                { key: 'avg3', label: '3-dart average', value: formatAvg(getAllTimeAvg(name)) },
                { key: 'avg9', label: '9-dart average', value: formatAvg(getAllTimeFirstNineAvg(name)) },
                { key: 'bestleg', label: 'Best leg (darts)', value: String(all.bestLegDarts || 0) },
                { key: 'checkout', label: 'Best checkout', value: String(all.bestCheckout || 0) },
                { key: 'mon3', label: 'Monthly 3-dart', value: formatAvg(getMonthlyAvg3(name)) },
                { key: 'mon9', label: 'Monthly 9-dart', value: formatAvg(getMonthlyFirstNineAvg(name)) },
              ] as any
              return <StatPills items={items} />
            })()}
            <div className="mt-3">
              <button className="btn bg-rose-600 hover:bg-rose-700" onClick={() => setShowResetConfirm(true)}>Reset stats to 0</button>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 mb-4">
            <div className="font-semibold mb-2 flex items-center gap-2"><WalletIcon className="w-4 h-4"/> Wallet</div>
            <div className="text-sm mb-2">Tournament cash prizes accrue here. You can request a withdrawal when you have sufficient balance.</div>
            <div className="text-sm mb-2">
              <div className="font-semibold">Payout method</div>
              {payout ? (
                <div className="flex items-center justify-between">
                  <div>{payout.brand} •••• {payout.last4}</div>
                  <button className="btn px-2 py-1 text-sm" onClick={()=>setPayout(null)}>Change</button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 items-end">
                  <select className="input" value={pBrand} onChange={e=>setPBrand(e.target.value)}>
                    {['Visa','Mastercard','Amex','Maestro','Discover'].map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input className="input" placeholder="Last 4" value={pLast4} onChange={e=>setPLast4(e.target.value)} />
                  <button className="btn" onClick={savePayout}>Save</button>
                </div>
              )}
            </div>
            <div className="text-sm mb-2">
              <div className="font-semibold">Balances</div>
              {wallet && Object.keys(wallet.balances||{}).length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(wallet.balances).map(([cur, cents]) => (
                    <li key={cur}>{cur} {(cents/100).toFixed(2)}</li>
                  ))}
                </ul>
              ) : (
                <div className="opacity-70">No funds yet.</div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 items-center">
              <select className="input" value={wCurrency} onChange={e=>setWCurrency(e.target.value)}>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
              <input className="input" placeholder="Amount" value={wAmount} onChange={e=>setWAmount(e.target.value)} />
              <button className="btn flex items-center gap-1" onClick={requestWithdraw} title={!payout ? 'Link a payout method for instant payment' : ''}><DollarSign className="w-4 h-4"/> Withdraw</button>
            </div>
            {wMsg && <div className="text-xs mt-2">{wMsg}</div>}
          </div>
          <label className="block font-semibold mb-1 flex items-center gap-2"><Bell className="w-5 h-5 text-brand-400" /> Notification preferences:</label>
          <div className="flex gap-2 mb-2">
            <button className={`btn ${notifications ? 'bg-brand-600' : 'bg-slate-400'}`} onClick={() => setNotifications(true)}>On</button>
            <button className={`btn ${!notifications ? 'bg-brand-600' : 'bg-slate-400'}`} onClick={() => setNotifications(false)}>Off</button>
          </div>

          <label className="block font-semibold mb-1 flex items-center gap-2"><HelpCircle className="w-5 h-5 text-brand-400" /> Help & Support:</label>
          <div className="flex gap-2 mb-2">
            <a href="#" className="btn">FAQ</a>
            <a href="#" className="btn">Contact Us</a>
          </div>

          <label className="block font-semibold mb-1 flex items-center gap-2"><User className="w-5 h-5 text-brand-400" /> Account management:</label>
          <div className="flex gap-2 mb-2">
            <button className="btn">Change Password</button>
            <button className="btn bg-red-500">Delete Account</button>
          </div>
          <label className="block font-semibold mb-1 flex items-center gap-2"><Shield className="w-5 h-5 text-brand-400" /> Layout:</label>
          <div className="flex gap-2 mb-2">
            <button className="btn" onClick={resetLayout}>Revert modal sizes to default</button>
          </div>
          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
            <div className="font-semibold mb-2">Accessibility & Layout</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-indigo-600" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)} />
              Reduce motion & animations
            </label>
            <label className="flex items-center gap-2 text-sm mt-1">
              <input type="checkbox" className="accent-indigo-600" checked={compactHeader} onChange={e=>setCompactHeader(e.target.checked)} />
              Compact header height
            </label>
          </div>
        </div>
  </div>
  }
  <label className="block font-semibold mb-1 flex items-center gap-2"><Lightbulb className="w-5 h-5 text-cyan-300" /> Darts Tips:</label>
      <button className="btn mb-4" onClick={() => setShowTips(true)}>Show Tips to Improve Your Game</button>
      <button className="btn w-full">Save Settings</button>
      {/* Logout pill styled like StatPills */}
      {user && (
        <div className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              className="relative p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 text-lg font-semibold text-indigo-700 hover:bg-indigo-500/20 transition"
              style={{ width: '100%' }}
              onClick={handleLogout}
            >
              Log Out
            </button>
          </div>
        </div>
      )}
      {showTips && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="card max-w-md w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold" onClick={() => setShowTips(false)}>Close</button>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-white"><Lightbulb className="w-6 h-6 text-cyan-300" /> Darts Tips</h3>
            <div className="mb-4 text-lg font-semibold text-indigo-200">{tips[tipIdx]}</div>
            <div className="flex gap-2">
              <button className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold" onClick={() => setTipIdx((tipIdx - 1 + tips.length) % tips.length)}>Previous</button>
              <button className="btn bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold" onClick={() => setTipIdx((tipIdx + 1) % tips.length)}>Next</button>
            </div>
          </div>
        </div>
      )}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="card max-w-md w-full relative text-left">
            <button className="absolute top-2 right-2 btn px-2 py-1" onClick={() => setShowResetConfirm(false)}>Close</button>
            <h3 className="text-xl font-bold mb-2">Confirm Reset</h3>
            <p className="mb-3">Are you sure you want to clear all stats?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  const name = user?.username || 'Player 1'
                  clearAllStats(name)
                  setShowResetConfirm(false)
                }}
              >ACCEPT</button>
              <button
                className="btn bg-rose-600 hover:bg-rose-700"
                onClick={() => setShowResetConfirm(false)}
              >DECLINE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DevicePicker() {
  const { preferredCameraId, preferredCameraLabel, setPreferredCamera } = useSettingsStore()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [err, setErr] = useState('')
  async function enumerate() {
    setErr('')
    try {
      // Ensure we have permission; otherwise labels may be empty.
      try { await navigator.mediaDevices.getUserMedia({ video: true }); } catch {}
      const list = await navigator.mediaDevices.enumerateDevices()
      const cams = list.filter(d => d.kind === 'videoinput')
      setDevices(cams)
    } catch (e: any) {
      setErr('Unable to list cameras. Grant camera permission in your browser.')
    }
  }
  useEffect(() => { enumerate() }, [])
  const sel = preferredCameraId || ''
  return (
    <div className="mt-3 p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5">
      <div className="font-semibold mb-2">Select camera device</div>
      {err && <div className="text-rose-400 text-sm mb-2">{err}</div>}
      <div className="grid grid-cols-3 gap-2 items-center text-sm">
        <div className="col-span-2">
          <select className="input w-full" value={sel} onChange={(e)=>{
            const id = e.target.value || undefined
            const label = devices.find(d=>d.deviceId===id)?.label || ''
            setPreferredCamera(id, label)
          }}>
            <option value="">Auto (browser default)</option>
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Camera'} {d.label?.toLowerCase().includes('omni') ? '(OMNI)' : ''} {d.label?.toLowerCase().includes('vert') ? '(VERT)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <button className="btn px-2 py-1" onClick={enumerate}>Refresh</button>
        </div>
      </div>
      {preferredCameraLabel && (
        <div className="text-xs opacity-70 mt-1">Selected: {preferredCameraLabel}</div>
      )}
      <div className="text-xs opacity-70 mt-1">Tip: OMNI and VERT cameras are supported—select them here and then open Calibrator to align.</div>
    </div>
  )
}