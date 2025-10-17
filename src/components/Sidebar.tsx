import { LayoutDashboard, Camera, Users, Trophy, Settings, MessageCircle, Lock, PoundSterling, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFreeRemaining } from '../utils/quota'
import { useIsAdmin } from '../utils/admin'
import { DISCORD_INVITE_URL } from '../utils/config'

export type TabKey = 'score' | 'online' | 'offline' | 'friends' | 'stats' | 'calibrate' | 'settings' | 'admin' | 'tournaments' | 'fullaccess' | 'help';

export function getTabs(user: any) {
  const baseTabs = [
    { key: 'score', label: 'Home', icon: LayoutDashboard },
    { key: 'online', label: 'Online', icon: Users },
    { key: 'offline', label: 'Offline', icon: Trophy },
    { key: 'tournaments', label: 'Tournaments', icon: Trophy },
    { key: 'friends', label: 'Friends', icon: Users },
    { key: 'stats', label: 'Stats', icon: Trophy },
    { key: 'calibrate', label: 'Calibrate', icon: Camera },
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'help', label: 'Help', icon: HelpCircle },
  ];
  // Admin tab visibility handled in Sidebar via hook (client-side fetch)
  if (!user?.fullAccess) {
    baseTabs.push({ key: 'fullaccess', label: 'PREMIUM £€$', icon: PoundSterling });
  }
  return baseTabs;
}

export function Sidebar({
  active,
  onChange,
  user,
  className,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  user: any;
  className?: string;
}) {
  const tabs = getTabs(user);
  const isAdmin = useIsAdmin(user?.email)
  // IMPORTANT: Admin tab is ONLY shown for explicitly granted admin users
  // Premium status does NOT automatically grant admin access
  // Admin access must be granted via /api/admins/grant endpoint by the owner
  if (isAdmin && !tabs.some(t => t.key === 'admin')) {
    const idx = tabs.findIndex(t => t.key === 'settings')
    const adminTab = { key: 'admin', label: 'Admin', icon: Settings } as const
    if (idx >= 0) tabs.splice(idx, 0, adminTab as any); else tabs.push(adminTab as any)
  }
  const [showDiscord, setShowDiscord] = useState(false);
  const freeLeft = user?.username && !user?.fullAccess ? getFreeRemaining(user.username) : Infinity
  useEffect(() => {
    if (!showDiscord) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') setShowDiscord(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showDiscord])
  return (
    <aside className={`${user?.fullAccess ? 'premium-sidebar' : ''} sidebar glass ${className ? '' : 'w-60'} p-2 sm:p-4 rounded-2xl ${className ?? 'hidden sm:flex'} flex-col gap-2 overflow-y-auto overflow-x-hidden ${className ? '' : 'fixed top-2 bottom-2 sm:top-4 sm:bottom-4'}`}>
      {tabs.map(({ key, label, icon: Icon }) => {
  if (key === 'admin' && !isAdmin) return null
        return (
        <button
          key={key}
          className={`tab whitespace-nowrap flex items-center justify-start gap-3 ${active === key ? 'tab--active' : 'tab--inactive'} ${key === 'fullaccess' ? '' : ''}`}
          onClick={() => onChange(key as TabKey)}
          title={label}
          style={{ fontWeight: 700, fontSize: '1.1rem', color: active === key ? '#fff' : '#E5E7EB', letterSpacing: '0.02em' }}
        >
          <Icon className="w-6 h-6" />
          <span className="flex items-center gap-2">
            {label}
            {key === 'online' && !user?.fullAccess && freeLeft <= 0 && (
              <span title="Weekly free games used" className="inline-flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-full bg-rose-600 text-white">
                <Lock className="w-3 h-3" />
                Locked
              </span>
            )}
          </span>
          {/* Only the tab label should show PREMIUM; remove extra badge */}
        </button>
        )
      })}
      {/* Discord tab at the end */}
      <button
        className="tab tab--compact whitespace-nowrap flex items-center justify-start gap-3 bg-[#5865F2] text-white mt-2"
        onClick={() => setShowDiscord(true)}
        title="BullseyeDartsLeague"
        style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.02em' }}
      >
        <MessageCircle className="w-6 h-6" />
        <span className="truncate">BullseyeDartsLeague</span>
      </button>
      {/* Discord about dialog via portal */}
      {showDiscord && createPortal(
        <div className="fixed inset-0 z-[1000]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDiscord(false)} onTouchStart={() => setShowDiscord(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" className="card max-w-md w-full relative text-left p-6 rounded-xl">
              <button className="absolute -top-3 -right-3 btn px-3 py-1" aria-label="Close" onClick={() => setShowDiscord(false)}>✕</button>
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-[#8ea1e1]">
                <MessageCircle className="w-6 h-6" /> BullseyeDartsLeague
              </h3>
              <div className="mb-4 text-lg font-semibold">Join this fantastic Online Darts League with divisions and other cool stuff included</div>
        <a
          href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn bg-[#5865F2] text-white w-full font-bold text-lg"
              >
                Join Discord
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  )
}
