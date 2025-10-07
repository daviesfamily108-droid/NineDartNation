import { useEffect, useRef, useState } from 'react'
import { Sidebar, TabKey } from './components/Sidebar'
import Home from './components/Home'
import ScrollFade from './components/ScrollFade'
import Calibrator from './components/Calibrator'
import OfflinePlay from './components/OfflinePlay'
import Friends from './components/Friends'
import Toaster from './components/Toaster'
import AdminDashboard from './components/AdminDashboard'
import SettingsPanel from './components/SettingsPanel'
import Auth from './components/Auth'
import { ThemeProvider } from './components/ThemeContext'
import { useWS, WSProvider } from './components/WSProvider'
import StatusDot from './components/ui/StatusDot'
import { getRollingAvg, getAllTimeAvg } from './store/profileStats'
import { useUserSettings } from './store/userSettings'
import './styles/premium.css'
import Scoreboard from './components/Scoreboard'
import CameraView from './components/CameraView'
import OnlinePlay from './components/OnlinePlay'
import MatchSettings from './components/MatchSettings'
import StatsPanel from './components/StatsPanel'
import Tournaments from './components/Tournaments'
import AdminAccess from './components/AdminAccess'
// AdminAccess already imported above
import Drawer from './components/ui/Drawer'
import { getDominantColorFromImage, stringToColor } from './utils/color'

export default function App() {
  const ws = (() => { try { return useWS() } catch { return null } })()
  const [tab, setTab] = useState<TabKey>('score')
  const [isMobile, setIsMobile] = useState<boolean>(false)
  const [navOpen, setNavOpen] = useState<boolean>(false)
  const [user, setUser] = useState<any>(null)
  const [allTimeAvg, setAllTimeAvg] = useState<number>(0)
  const { avgMode } = useUserSettings()
  // Avatar state/effect must be declared before any conditional return to keep hooks order stable
  const [avatar, setAvatar] = useState<string>('')
  const [httpsInfo, setHttpsInfo] = useState<{ https: boolean; port: number } | null>(null)
  const appRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [nameColor, setNameColor] = useState<string | null>(null)
  useEffect(() => {
    // Detect mobile layout via viewport width and user agent; update on resize
    const mq = window.matchMedia('(max-width: 768px)')
    const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
    const update = () => setIsMobile(mq.matches || uaMobile)
    update()
    try { mq.addEventListener('change', update) } catch { window.addEventListener('resize', update) }
    return () => {
      try { mq.removeEventListener('change', update) } catch { window.removeEventListener('resize', update) }
    }
  }, [])
  // Demo deep-links: ?demo=offline-format&format=best|first&value=5&start=501
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get('demo') === 'offline-format') {
        const f = (sp.get('format') || 'first').toLowerCase() === 'best' ? 'best' : 'first'
        const v = Number(sp.get('value') || '1')
        const s = Number(sp.get('start') || '501')
        window.dispatchEvent(new CustomEvent('ndn:offline-format', { detail: { formatType: f, formatCount: isFinite(v)? v : 1, startScore: isFinite(s)? s : 501 } }))
        // Switch to Offline and auto-start X01
        setTab('offline')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ndn:auto-start', { detail: { mode: 'X01' } }))
        }, 50)
      }
      // Demo for Online create-match: ?demo=online-create&game=X01&mode=firstto|bestof&value=3&start=501
      if (sp.get('demo') === 'online-create') {
        const game = sp.get('game') || 'X01'
        const mode = (sp.get('mode') || 'firstto').toLowerCase() === 'bestof' ? 'bestof' : 'firstto'
        const value = Number(sp.get('value') || '3')
        const start = Number(sp.get('start') || '501')
        setTab('online')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ndn:online-demo', { detail: { game, mode, value: isFinite(value)? value : 3, start: isFinite(start)? start : 501 } }))
        }, 80)
      }
      // Demo: open a live-looking online match view with fake data
      if (sp.get('demo') === 'online-match') {
        setTab('online')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ndn:online-match-demo', { detail: { game: 'X01', start: 501 } }))
        }, 120)
      }
    } catch {}
  }, [])
  // Fullscreen change tracking
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  useEffect(() => {
    if (!isMobile) setNavOpen(false)
  }, [isMobile])
  // Avatar state/effect must be declared before any conditional return to keep hooks order stable
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { setAvatar(localStorage.getItem('ndn:avatar') || '') } catch {}
    const onUpdate = (e: Event) => {
      try {
        // Prefer payload for immediate update; fallback to localStorage
        const detail = (e as CustomEvent<string>).detail
        if (typeof detail === 'string') setAvatar(detail)
        else setAvatar(localStorage.getItem('ndn:avatar') || '')
      } catch {
        try { setAvatar(localStorage.getItem('ndn:avatar') || '') } catch {}
      }
    }
    window.addEventListener('ndn:avatar-updated' as any, onUpdate as any)
    return () => window.removeEventListener('ndn:avatar-updated' as any, onUpdate as any)
  }, [])
  // Derive a name color from avatar image or username fallback
  useEffect(() => {
    let cancelled = false
    async function run() {
      const src = avatar || ''
      const fallback = user?.username ? stringToColor(user.username) : null
      if (src) {
        const col = await getDominantColorFromImage(src)
        if (!cancelled) setNameColor(col || fallback)
      } else {
        setNameColor(fallback)
      }
    }
    run()
    // re-run when username or avatar changes
  }, [avatar, user?.username])
  // Detect HTTPS server availability for phone pairing
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(`/api/https-info`)
        const j = await res.json()
        if (!cancelled && j && typeof j.https === 'boolean') setHttpsInfo({ https: !!j.https, port: Number(j.port)||8788 })
      } catch {}
    }
    check()
    const id = setInterval(check, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])
  // Listen for recalibration requests from other components (must be declared before any conditional return)
  useEffect(() => {
    const handler = () => setTab('calibrate')
    const listener = () => handler()
    window.addEventListener('ndn:request-calibrate', listener)
    const onTab = (e: any) => {
      const t = e?.detail?.tab as TabKey | undefined
      if (t) setTab(t)
    }
    window.addEventListener('ndn:change-tab', onTab as any)
    // Friend Spectate: listen for a request, switch to Online, then dispatch the room event for OnlinePlay
    const onSpectateReq = (e: any) => {
      try {
        const detail = e?.detail
        setTab('online')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('ndn:spectate-room', { detail }))
        }, 60)
      } catch {}
    }
    window.addEventListener('ndn:spectate-request', onSpectateReq as any)
    return () => { window.removeEventListener('ndn:request-calibrate', listener); window.removeEventListener('ndn:change-tab', onTab as any); window.removeEventListener('ndn:spectate-request', onSpectateReq as any) }
  }, [])
  // Reset scroll to top on tab change so nothing appears above the header
  useEffect(() => {
    const scroller = document.getElementById('ndn-main-scroll')
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' })
  }, [tab])
  // Refresh all-time avg when user changes or stats update
  useEffect(() => {
    if (!user?.username) return
    const refresh = () => setAllTimeAvg(avgMode === '24h' ? getRollingAvg(user.username) : getAllTimeAvg(user.username))
    refresh()
    const onUpdate = () => refresh()
    window.addEventListener('ndn:stats-updated', onUpdate as any)
    return () => window.removeEventListener('ndn:stats-updated', onUpdate as any)
  }, [user?.username, avgMode])

  async function fetchSubscription(u: any) {
    try {
      const q = u?.email ? `?email=${encodeURIComponent(u.email)}` : ''
      const res = await fetch('/api/subscription' + q);
      if (!res.ok) return;
      const data = await res.json();
      setUser({ ...u, fullAccess: !!data?.fullAccess });
    } catch {}
  }

  if (!user) {
    return <Auth onAuth={(u:any) => { setUser(u); fetchSubscription(u); }} />;
  }
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username||'NDN')}&background=8F43EE&color=fff&bold=true&rounded=true&size=64`
  return (
    <WSProvider>
    <ThemeProvider>
  <div ref={appRef} className={`${user?.fullAccess ? 'premium-body' : ''} h-screen overflow-hidden p-2 sm:p-4`}>
        <Toaster />
  <div className="max-w-[1400px] mx-auto grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-3 sm:gap-4 h-full overflow-hidden">
          {/* Desktop sidebar; hidden on mobile */}
          {!isMobile && (
            <div className="relative" style={{ width: 240 }}>
              <Sidebar active={tab} onChange={(k)=>{ setTab(k); }} user={user} />
            </div>
          )}
          {/* Wrap header + scroller in a column so header stays static and only content scrolls below it */}
          <div className="flex flex-col h-full overflow-hidden">
            <div className="pt-2">
            <header id="ndn-header" className={`header glass flex-col md:flex-row gap-2 md:gap-3`}>
              {/* Left: Brand */}
              <div className="flex items-center gap-2 order-1">
                {isMobile && (
                  <button
                    className="btn px-3 py-1 mr-1"
                    aria-label="Open navigation"
                    onClick={()=> setNavOpen(true)}
                  >☰</button>
                )}
                <h1 className="text-xl md:text-2xl font-bold text-brand-700 whitespace-nowrap">NINE-DART-NATION 🎯</h1>
              </div>
              {/* Middle: Welcome band (full width on mobile) */}
              <div className="order-3 md:order-2 w-full md:w-auto flex-1 flex flex-col items-center justify-center text-center md:text-left">
                <span className="text-base md:text-lg font-semibold flex items-center gap-2 max-w-full truncate" style={nameColor ? { color: nameColor } : undefined}>
                  <span className="hidden sm:inline">Welcome,</span>
                  <img src={avatar || fallbackAvatar} alt="avatar" className="w-6 h-6 md:w-7 md:h-7 rounded-full ring-2 ring-white/20" />
                  <span className="truncate">{user.username}🎯</span>
                </span>
                <span className="hidden sm:inline text-xs md:text-sm opacity-80">All-time 3-dart avg: <span className="font-semibold">{allTimeAvg.toFixed(2)}</span></span>
              </div>
              {/* Right: Status + Actions */}
              <div className="order-2 md:order-3 ml-0 md:ml-auto flex items-center gap-2 flex-wrap">
                <button
                  className="px-3 py-1 text-sm rounded-full bg-white/5 hover:bg-white/10 border border-white/10"
                  onClick={() => {
                    const el = appRef.current
                    if (!el) return
                    if (!document.fullscreenElement) el.requestFullscreen().catch(()=>{})
                    else document.exitFullscreen().catch(()=>{})
                  }}
                  title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
                >{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</button>
                {tab === 'online' && (
                  <button
                    className="text-[10px] md:text-xs px-3 py-1 rounded-full bg-indigo-500/25 text-indigo-100 border border-indigo-400/40 hover:bg-indigo-500/40"
                    title="Open a simulated online match"
                    onClick={() => {
                      setTimeout(() => {
                        try { window.dispatchEvent(new CustomEvent('ndn:online-match-demo', { detail: { game: 'X01', start: 501 } })) } catch {}
                      }, 40)
                    }}
                  >ONLINE DEMO</button>
                )}
                {ws ? (
                  <span className="ml-0 md:ml-2"><StatusDot status={ws.status} /></span>
                ) : null}
                {httpsInfo?.https ? (
                  <span className="text-[10px] md:text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/40" title={`Phone HTTPS active on :${httpsInfo.port}`}>HTTPS READY</span>
                ) : (
                  <span className="text-[10px] md:text-xs px-3 py-1 rounded-full bg-slate-600/30 text-slate-300 border border-slate-400/30" title="Enable HTTPS for iPhone camera pairing">HTTP ONLY</span>
                )}
              </div>
            </header>
            </div>
            {/* Mobile drawer navigation */}
            {isMobile && (
              <MobileNav
                open={navOpen}
                onClose={()=> setNavOpen(false)}
                active={tab}
                onChange={(k)=>{ setTab(k); setNavOpen(false) }}
                user={user}
              />
            )}
            <main id="ndn-main-scroll" className="space-y-4 flex-1 overflow-y-auto pr-1">
            {tab === 'settings' && (
              <ScrollFade>
                <SettingsPanel user={user} />
              </ScrollFade>
            )}
            {tab === 'score' && (
              <ScrollFade>
                <Home user={user} />
              </ScrollFade>
            )}
            {tab === 'online' && (
              <ScrollFade>
                <OnlinePlay user={user} />
              </ScrollFade>
            )}
            {tab === 'offline' && (
              <ScrollFade>
                <OfflinePlay user={user} />
              </ScrollFade>
            )}
            {tab === 'calibrate' && (
              <ScrollFade>
                <Calibrator />
              </ScrollFade>
            )}
            {tab === 'friends' && (
              <ScrollFade>
                <Friends user={user} />
              </ScrollFade>
            )}
            {tab === 'stats' && (
              <ScrollFade>
                <StatsPanel user={user} />
              </ScrollFade>
            )}
            {tab === 'tournaments' && (
              <ScrollFade>
                <Tournaments user={user} />
              </ScrollFade>
            )}
            {tab === 'admin' && (
              <ScrollFade>
                <AdminDashboard user={user} />
              </ScrollFade>
            )}
            {tab === 'fullaccess' && (
              <ScrollFade>
                <AdminAccess />
              </ScrollFade>
            )}
            </main>
          </div>
        </div>
      </div>
    </ThemeProvider>
    </WSProvider>
  )
}

// Lightweight mobile drawer that reuses the same Sidebar
function MobileNav({ open, onClose, active, onChange, user }: { open: boolean; onClose: () => void; active: TabKey; onChange: (k: TabKey)=>void; user: any }) {
  return (
    <Drawer open={open} onClose={onClose} width={300} side="left" title="Navigate">
      <div className="mt-2">
        <Sidebar active={active} onChange={onChange} user={user} />
      </div>
    </Drawer>
  )
}
