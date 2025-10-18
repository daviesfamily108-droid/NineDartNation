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
import { useWS } from './components/WSProvider'
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
import OpsDashboard from './components/OpsDashboard'

export default function App() {
  const appRef = useRef<HTMLDivElement | null>(null);
  const [avatar, setAvatar] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [httpsInfo, setHttpsInfo] = useState<{ https: boolean; port: number } | null>(null);
  const ws = (() => { try { return useWS() } catch { return null } })()
  const [tab, setTab] = useState<TabKey>('score')
  const [isMobile, setIsMobile] = useState<boolean>(false)
  const [navOpen, setNavOpen] = useState<boolean>(false)
  const [user, setUser] = useState<any>(null)
  const [allTimeAvg, setAllTimeAvg] = useState<number>(0)
  const { avgMode } = useUserSettings()


  // Restore user from token on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      // Validate token with server
      const API_URL = (import.meta as any).env?.VITE_API_URL || '';
      fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data?.user) {
          setUser(data.user);
        } else {
          // Token invalid, remove it
          localStorage.removeItem('authToken');
        }
      })
      .catch(() => {
        // Network error, keep token for offline retry
      });
    }
  }, []);

  useEffect(() => {
    const onLogout = () => {
      try {
        localStorage.removeItem('mockUser');
        localStorage.removeItem('authToken');
      } catch {}
      setUser(null);
      setTab('score');
    };
    window.addEventListener('ndn:logout' as any, onLogout as any);
    return () => window.removeEventListener('ndn:logout' as any, onLogout as any);
  }, []);
  // Refresh all-time avg when user changes or stats update
  useEffect(() => {
    if (!user?.username) return
    const refresh = () => setAllTimeAvg(avgMode === '24h' ? getRollingAvg(user.username) : getAllTimeAvg(user.username))
    refresh()
    const onUpdate = () => refresh()
    window.addEventListener('ndn:stats-updated', onUpdate as any)
    return () => window.removeEventListener('ndn:stats-updated', onUpdate as any)
  }, [user?.username, avgMode])

  // Load avatar from localStorage when user changes
  useEffect(() => {
    if (!user?.username) {
      setAvatar('');
      return;
    }
    const storedAvatar = localStorage.getItem(`ndn:bio:profilePhoto:${user.username}`);
    setAvatar(storedAvatar || '');
  }, [user?.username])

  // Listen for avatar updates from SettingsPanel
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('ndn:bio:profilePhoto:') && user?.username && e.key.endsWith(user.username)) {
        setAvatar(e.newValue || '');
      }
    };
    const handleAvatarUpdate = (e: any) => {
      // Check if this update is for the current user
      if (e.detail?.username === user?.username) {
        setAvatar(e.detail?.avatar || '');
      }
      // Also check localStorage as backup for any avatar update
      if (user?.username) {
        const storedAvatar = localStorage.getItem(`ndn:bio:profilePhoto:${user.username}`);
        setAvatar(storedAvatar || '');
      }
    };
    // Also check localStorage when window becomes visible (user switches tabs)
    const handleVisibilityChange = () => {
      if (!document.hidden && user?.username) {
        const storedAvatar = localStorage.getItem(`ndn:bio:profilePhoto:${user.username}`);
        setAvatar(storedAvatar || '');
      }
    };
    
    // Check localStorage every 2 seconds as a fallback
    const checkAvatarInterval = setInterval(() => {
      if (user?.username) {
        const storedAvatar = localStorage.getItem(`ndn:bio:profilePhoto:${user.username}`);
        if (storedAvatar && storedAvatar !== avatar) {
          setAvatar(storedAvatar);
        }
      }
    }, 2000);
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('ndn:avatar-updated' as any, handleAvatarUpdate as any);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('ndn:avatar-updated' as any, handleAvatarUpdate as any);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(checkAvatarInterval);
    };
  }, [user?.username, avatar]);

  // Handle payment success for username change
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paid = urlParams.get('paid');
    const usernameChange = urlParams.get('username-change');
    if (paid === '1' || paid === 'username-change' || usernameChange === 'free') {
      const pendingUsername = localStorage.getItem('pendingUsernameChange');
      if (pendingUsername && user?.email) {
        // Call the change username API
        const API_URL = (import.meta as any).env?.VITE_API_URL || '';
        fetch(`${API_URL}/api/change-username`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, newUsername: pendingUsername })
        })
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            alert('Username changed successfully!');
            localStorage.removeItem('pendingUsernameChange');
            // Update user data and token
            if (data.token) {
              localStorage.setItem('authToken', data.token);
            }
            if (data.user) {
              setUser(data.user);
            }
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            alert('Failed to change username: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(() => {
          alert('Network error while changing username');
        });
      }
    }
  }, [user?.email]);

  // Handle payment success for premium subscription
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const subscription = urlParams.get('subscription');
    if (subscription === 'success' && user?.email) {
      // Refresh user data to get updated subscription status
      const API_URL = (import.meta as any).env?.VITE_API_URL || '';
      fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          alert('Premium subscription activated successfully!');
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      })
      .catch(() => {
        alert('Subscription activated, but failed to refresh user data. Please refresh the page.');
      });
    }
  }, [user?.email]);

  // Detect mobile/tablet layout via comprehensive device detection
  useEffect(() => {
    const update = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const pixelRatio = window.devicePixelRatio || 1

      // Comprehensive mobile/tablet detection
      const mqMobile = window.matchMedia('(max-width: 768px)').matches
      const mqTablet = window.matchMedia('(max-width: 1024px) and (min-width: 769px)').matches
      const uaMobile = /Mobi|Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini|Windows Phone/i.test(navigator.userAgent || '')
      const uaTablet = /iPad|Android(?=.*\bMobile\b)|Tablet|PlayBook|Silk/i.test(navigator.userAgent || '')
      const touchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const smallScreen = width < 1025
      const verySmallScreen = width < 769

      // Determine device type
      const isTablet = (mqTablet && touchScreen) || uaTablet || (width >= 769 && width <= 1024 && touchScreen)
      const isMobile = mqMobile || uaMobile || verySmallScreen || (width < 769 && touchScreen)
      const isMobileDevice = isMobile || isTablet

      setIsMobile(isMobileDevice)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    const mqMobile = window.matchMedia('(max-width: 768px)')
    const mqTablet = window.matchMedia('(max-width: 1024px) and (min-width: 769px)')

    try {
      mqMobile.addEventListener('change', update)
      mqTablet.addEventListener('change', update)
    } catch {}

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      try {
        mqMobile.removeEventListener('change', update)
        mqTablet.removeEventListener('change', update)
      } catch {}
    }
  }, [])

  // Global logout handler: return to sign-in screen and clear minimal local user context
  useEffect(() => {
    const onLogout = () => {
      try {
        // Clear any lightweight local flags (keep stats unless explicitly reset)
        localStorage.removeItem('ndn:avatar')
      } catch {}
      setUser(null)
      setTab('score')
    }
    window.addEventListener('ndn:logout' as any, onLogout as any)
    return () => window.removeEventListener('ndn:logout' as any, onLogout as any)
  }, [])

  // Apply username changes from Settings globally and propagate via WS presence
  useEffect(() => {
    const onName = (e: any) => {
      try {
        const next = String(e?.detail?.username || '').trim()
        if (!next) return
        setUser((prev: any) => {
          const u = prev ? { ...prev, username: next } : prev
          return u
        })
        // Recompute name color on next effect pass based on new username/avatar
        // Send presence update so friends/lobby reflect the new name
        try {
          const email = (user?.email || '').toLowerCase()
          if (ws && next && email) ws.send({ type: 'presence', username: next, email })
        } catch {}
      } catch {}
    }
    window.addEventListener('ndn:username-changed' as any, onName as any)
    return () => window.removeEventListener('ndn:username-changed' as any, onName as any)
  }, [ws, user?.email])

  // Handle tab changes from Home component quick access pills
  useEffect(() => {
    const onTabChange = (e: any) => {
      try {
        const tab = String(e?.detail?.tab || '').trim()
        if (tab && ['score', 'offline', 'online', 'stats', 'settings', 'admin', 'tournaments', 'friends'].includes(tab)) {
          setTab(tab as TabKey)
        }
      } catch {}
    }
    window.addEventListener('ndn:change-tab' as any, onTabChange as any)
    return () => window.removeEventListener('ndn:change-tab' as any, onTabChange as any)
  }, [])

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
    <ThemeProvider>
  <div ref={appRef} className={`${user?.fullAccess ? 'premium-body' : ''} h-screen overflow-hidden p-1 xs:p-2 sm:p-3 md:p-4`}>
        <Toaster />
  <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-2 xs:gap-3 sm:gap-4 h-full overflow-hidden">
          {/* Desktop sidebar; hidden on mobile/tablet */}
          {!isMobile && (
            <div className="relative hidden lg:block" style={{ width: 240 }}>
              <Sidebar active={tab} onChange={(k)=>{ setTab(k); }} user={user} />
            </div>
          )}
          {/* Wrap header + scroller in a column so header stays static and only content scrolls below it */}
          <div className="flex flex-col h-full overflow-hidden">
            <div className="pt-1 xs:pt-2">
            <header id="ndn-header" className={`header glass flex-col xs:flex-col sm:flex-row gap-2 xs:gap-2 sm:gap-3`}>
              {/* Left: Brand */}
              <div className="flex items-center gap-2 order-1">
                <h1
                  className="text-lg xs:text-xl sm:text-xl md:text-2xl font-bold text-brand-700 whitespace-nowrap cursor-pointer select-none"
                  onClick={() => { if (isMobile) setTab('score') }}
                  title={isMobile ? 'Go Home' : undefined}
                >
                  NINE-DART-NATION 🎯
                </h1>
              </div>
              {/* Middle: Welcome band (full width on mobile) */}
              <div className="order-3 xs:order-3 sm:order-2 w-full sm:w-auto flex-1 flex flex-col items-center justify-center text-center sm:text-left !text-black">
                <span className="text-sm xs:text-base sm:text-base md:text-lg font-semibold flex items-center gap-2 max-w-full truncate !text-black" style={{ color: '#000000', WebkitTextFillColor: '#000000' }}>
                  <span className="hidden xs:inline !text-black">Welcome</span>
                  <img src={avatar || fallbackAvatar} alt="avatar" className="w-5 h-5 xs:w-6 xs:h-6 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full ring-2 ring-white/20" />
                  <span className="truncate !text-black" style={{ color: '#000000', WebkitTextFillColor: '#000000' }}>{user.username}🎯</span>
                </span>
                <span className="hidden xs:inline text-xs xs:text-xs sm:text-xs md:text-sm !text-black" style={{ color: '#000000', WebkitTextFillColor: '#000000' }}>All-time 3-dart avg: <span className="font-semibold !text-black" style={{ color: '#000000', WebkitTextFillColor: '#000000' }}>{allTimeAvg.toFixed(2)}</span></span>
                {isMobile && (
                  <button
                    className="btn px-3 py-1 xs:px-3 xs:py-1 sm:px-3 sm:py-1 mt-1 text-sm xs:text-sm"
                    aria-label="Open navigation"
                    onClick={()=> setNavOpen(true)}
                  >☰ Menu</button>
                )}
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
                <div className="space-y-6">
                  <AdminDashboard user={user} />
                  <OpsDashboard user={user} />
                </div>
              </ScrollFade>
            )}
            {tab === 'fullaccess' && (
              <ScrollFade>
                <AdminAccess user={user} />
              </ScrollFade>
            )}
            </main>
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}

// Lightweight mobile drawer that reuses the same Sidebar
function MobileNav({ open, onClose, active, onChange, user }: { open: boolean; onClose: () => void; active: TabKey; onChange: (k: TabKey)=>void; user: any }) {
  return (
    <Drawer open={open} onClose={onClose} width={320} side="left" title="Navigate">
      <div className="mt-2">
        <Sidebar active={active} onChange={onChange} user={user} className="flex relative static max-h-[80vh] w-full" />
      </div>
    </Drawer>
  )
}
