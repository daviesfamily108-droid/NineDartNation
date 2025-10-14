import { useEffect, useState } from 'react';
import { formatAvg } from '../utils/stats'
import { getAllTime } from '../store/profileStats'
import { STRIPE_CHECKOUT_URL } from '../utils/stripe'
import { useUserSettings } from '../store/userSettings'

function goTab(tab: string) {
  try { window.dispatchEvent(new CustomEvent('ndn:change-tab', { detail: { tab } })) } catch {}
}

export default function Home({ user }: { user?: any }) {
  const [showLegal, setShowLegal] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [fact, setFact] = useState<string>('');
  const { lastOffline } = useUserSettings()

  // Rotate a random "Did you know?" each time Home mounts
  useEffect(() => {
    const facts: string[] = [
      'The fastest televised 9-darter took roughly 25 seconds!',
      'A perfect leg (501) can be finished in nine darts.',
      'The inner bull is worth 50; the outer bull is 25.',
      'Standard dartboards are made from compressed sisal fibers.',
      'Doubles and trebles are the thin outer and middle rings.',
      'Professional oche (throw line) distance is 7 ft 9¼ in (2.37 m).',
      '“Dartitis” is a real condition affecting a player’s throwing motion.',
      'Phil Taylor holds a record number of World Championship titles.',
      'Checkout routes often end on a double—classic “double-out”.',
      'The highest 3-dart score is 180 (triple 20, triple 20, triple 20).'
    ];
    const idx = Math.floor(Math.random() * facts.length);
    setFact(facts[idx]);
  }, []);
  return (
    <div className={`${user?.fullAccess ? 'premium-main' : ''} relative min-h-[600px] flex flex-col items-center justify-center overflow-hidden`}>
      {/* Background only */}
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-purple-700 via-indigo-500 to-blue-600 opacity-60 blur-2xl"></div>
        <div className="absolute top-20 left-1/4 w-40 h-40 bg-pink-400 rounded-full opacity-30 blur-2xl animate-pulse"></div>
        <div className="absolute bottom-10 right-1/4 w-32 h-32 bg-blue-400 rounded-full opacity-30 blur-2xl animate-pulse"></div>
      </div>

      {/* Foreground content */}
  <div className="relative z-10 w-full max-w-3xl mx-auto bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 flex flex-col items-center">
  <h2 className="text-3xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-400 to-blue-400 mb-3 md:mb-4 drop-shadow-xl text-center">Welcome to Nine Dart Nation</h2>
  <p className="text-lg md:text-2xl text-white/80 mb-2 font-semibold text-center">Your home for competitive darts, stats, and online play.</p>
  <p className="text-sm md:text-lg text-white/60 mb-4 italic text-center">"Where every dart counts and every player matters."</p>

        {/* Did You Know - moved up for full visibility and randomized each mount */}
        {fact && (
          <div className="w-full mb-6">
            <div className="mx-auto max-w-xl rounded-full px-5 py-2 text-center text-indigo-100 bg-gradient-to-r from-indigo-600/80 to-fuchsia-600/80 shadow-md">
              <span className="font-semibold">Did you know?</span> <span className="opacity-90">{fact}</span>
            </div>
          </div>
        )}

  <div className="flex flex-wrap gap-3 sm:gap-4 md:gap-6 justify-center mb-6 md:mb-8 w-full">
          <button
            onClick={()=>{
              // Switch to Offline and auto-start using the last saved offline settings
              goTab('offline');
              try {
                // Preconfigure format and starting score
                window.dispatchEvent(new CustomEvent('ndn:offline-format', {
                  detail: {
                    formatType: 'first',
                    formatCount: Number(lastOffline?.firstTo) || 1,
                    startScore: Number(lastOffline?.x01Start) || 501,
                  }
                }))
              } catch {}
              try {
                // Give the Offline tab a tick to mount, then auto-start the chosen mode
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('ndn:auto-start', {
                    detail: { mode: lastOffline?.mode || 'X01' }
                  }))
                }, 50)
              } catch {}
            }}
            className="px-6 md:px-8 py-3 md:py-4 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 text-lg md:text-xl"
          >
            <span aria-hidden>🎯</span> Start New Match
          </button>
          <button onClick={()=>goTab('stats')} className="px-6 md:px-8 py-3 md:py-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 text-lg md:text-xl"><span aria-hidden>📊</span> View Stats</button>
          <button onClick={()=>goTab('online')} className="px-6 md:px-8 py-3 md:py-4 rounded-full bg-gradient-to-r from-green-500 to-blue-400 text-white font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 text-lg md:text-xl"><span aria-hidden>🏆</span> Join Online League</button>
          <button onClick={()=>{ goTab('offline'); try { window.dispatchEvent(new CustomEvent('ndn:auto-start', { detail: { mode: 'Double Practice' } })) } catch {} }} className="px-6 md:px-8 py-3 md:py-4 rounded-full bg-gradient-to-r from-pink-500 to-indigo-500 text-white font-bold shadow-xl hover:scale-105 transition-transform flex items-center gap-2 text-lg md:text-xl"><span aria-hidden>💡</span> Practice Doubles</button>
        </div>

        {/* Removed older stat pill grid; now using BEST/WORST grid below */}

        {/* Replaced Free/Premium cards with BEST/WORST vertical grid */}
        {(() => {
          const name = user?.username || 'Player 1'
          const all = getAllTime(name)
          const isPremium = !!user?.fullAccess
          const GRID = 'grid grid-cols-[160px,1fr,1fr]';
          const Row = ({ label, left, right, lock }: { label: string; left: string; right: string; lock?: boolean }) => (
            <div className={`relative ${GRID} gap-2 items-center p-2 rounded-lg ${lock ? 'bg-white/5 border border-white/10 overflow-hidden' : 'bg-indigo-500/10 border border-indigo-500/40'} mb-2`}>
              <div className="text-[12px] opacity-80 pl-2 text-left">{label}</div>
              <div className={`text-sm font-semibold text-center ${lock ? 'opacity-50 blur-[0.5px]' : ''}`}>{left}</div>
              <div className={`text-sm font-semibold text-center ${lock ? 'opacity-50 blur-[0.5px]' : ''}`}>{right}</div>
              {lock && (
                <button
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/35 hover:bg-slate-900/45 transition"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: user.email })
                      });
                      const data = await res.json();
                      if (data.ok && data.url) {
                        window.open(data.url, '_blank');
                      } else {
                        alert('Failed to create checkout session. Please try again.');
                      }
                    } catch (err) {
                      alert('Error creating checkout. Please try again.');
                    }
                  }}
                  title="Unlock with PREMIUM"
                >
                  <span className="text-[12px] font-semibold">Unlock PREMIUM</span>
                </button>
              )}
            </div>
          )
          return (
            <div className="w-full mt-2 rounded-2xl p-3 bg-white/5 border border-white/10">
              <div className={`${GRID} gap-2 mb-2 px-1 items-center`}>
                <div className="text-[12px] opacity-0 select-none">label</div>
                <div className="text-[12px] font-semibold text-center">BEST</div>
                <div className="text-[12px] font-semibold text-center">WORST</div>
              </div>
              <Row label="3-dart avg" left={formatAvg(all.best3||0)} right={formatAvg(all.worst3||0)} />
              <Row label="9-dart avg" left={formatAvg(all.bestFNAvg||0)} right={formatAvg(all.worstFNAvg||0)} lock={!isPremium} />
              <Row label="Leg (darts)" left={String(all.bestLegDarts||0)} right={String(all.worstLegDarts||0)} lock={!isPremium} />
              <Row label="Checkout" left={String(all.bestCheckout||0)} right={'—'} lock={!isPremium} />
            </div>
          )
        })()}

  <button className="mt-8 md:mt-10 px-8 md:px-10 py-3 md:py-4 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold shadow-xl hover:scale-110 transition-transform text-lg md:text-xl" onClick={() => setShowHowTo(true)}>How to Play / Getting Started</button>
      </div>

      {/* Footer */}
      <footer className="w-full py-2 md:py-2 text-center text-white/80 text-xs md:text-sm font-medium absolute bottom-0 left-0 z-20 flex items-center justify-center gap-1 md:gap-2">
        <button className="flex items-center gap-1 md:gap-2 hover:text-white transition" onClick={() => setShowLegal(true)}>
          <span>©</span>
          <span style={{ letterSpacing: '0.05em' }}>NINEDARTNATION</span>
        </button>
      </footer>

      {/* Legal Dialog */}
      {showLegal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="card max-w-lg w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold" onClick={() => setShowLegal(false)}>Close</button>
            <h3 className="text-xl font-bold mb-2">Legal Information</h3>
            <ul className="list-disc pl-5 mb-2">
              <li>Terms & Conditions: All users must follow fair play and site rules.</li>
              <li>Privacy Policy: Your data is protected and never shared without consent.</li>
              <li>Copyright © {new Date().getFullYear()} NINEDARTNATION. All rights reserved.</li>
              <li>Contact: support@ninedartnation.com</li>
            </ul>
            <p className="text-sm text-purple-200">For full legal details, please contact us or visit our legal page.</p>
          </div>
        </div>
      )}

      {/* How to Play Dialog */}
      {showHowTo && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="card max-w-lg w-full relative text-left bg-[#2d2250] text-white p-6 rounded-xl shadow-xl">
            <button className="absolute top-2 right-2 btn px-2 py-1 bg-purple-500 text-white font-bold" onClick={() => setShowHowTo(false)}>Close</button>
            <h3 className="text-xl font-bold mb-2">Getting Started</h3>
            <ul className="list-disc pl-5 mb-2">
              <li>Choose a game mode and invite friends or play solo.</li>
              <li>Track your stats and progress in the Stats tab.</li>
              <li>Join the BullseyeDartsLeague for online competition.</li>
              <li>Upgrade to PREMIUM for advanced features and modes.</li>
              <li>Need help? Visit the Settings tab for support and tips.</li>
            </ul>
            <p className="text-sm text-purple-200">Ready to play? Hit "Start New Match" and let the darts fly!</p>
          </div>
        </div>
      )}
    </div>
  );
}
