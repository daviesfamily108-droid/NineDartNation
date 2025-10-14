import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';

export default function SettingsPanel({ user }: { user?: any }) {
  // Achievements state
  const [achievements, setAchievements] = useState([
    { key: 'first180', label: 'First 180', unlocked: false, icon: '🎯', desc: 'Score 180 in a match.' },
    { key: 'hundredGames', label: '100 Games Played', unlocked: false, icon: '🏅', desc: 'Play 100 games.' },
    { key: 'tournamentWin', label: 'Tournament Winner', unlocked: false, icon: '🥇', desc: 'Win a tournament.' },
    { key: 'bestLeg', label: 'Best Leg', unlocked: false, icon: '⚡', desc: 'Finish a leg in 12 darts or less.' },
    { key: 'comeback', label: 'Comeback', unlocked: false, icon: '🔥', desc: 'Win after trailing by 3 legs.' },
  ]);

  useEffect(() => {
    const uname = user?.username || '';
    if (!uname) return;
    setAchievements(prev => prev.map(a => ({
      ...a,
      unlocked: !!localStorage.getItem(`ndn:achieve:${a.key}:${uname}`)
    })));
  }, [user?.username]);

  // Profile bio fields
  const [favPlayer, setFavPlayer] = useState('');
  const [favTeam, setFavTeam] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    const uname = user?.username || '';
    if (!uname) return;
    try {
      setFavPlayer(localStorage.getItem(`ndn:bio:favPlayer:${uname}`) || '');
      setFavTeam(localStorage.getItem(`ndn:bio:favTeam:${uname}`) || '');
      setBio(localStorage.getItem(`ndn:bio:bio:${uname}`) || '');
    } catch {}
  }, [user?.username]);

  useEffect(() => {
    const uname = user?.username || '';
    if (!uname) return;
    try {
      localStorage.setItem(`ndn:bio:favPlayer:${uname}`, favPlayer);
      localStorage.setItem(`ndn:bio:favTeam:${uname}`, favTeam);
      localStorage.setItem(`ndn:bio:bio:${uname}`, bio);
    } catch {}
  }, [favPlayer, favTeam, bio, user?.username]);

  return (
    <div>
      <div className="card">
        {/* Achievements & Badges Section */}
        <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 mb-4">
          <div className="font-semibold mb-2 flex items-center gap-2 text-yellow-700">Achievements & Badges</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {achievements.map(a => (
              <div key={a.key} className={`flex flex-col items-center p-2 rounded-xl border ${a.unlocked ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-400 bg-slate-700/10'}`}>
                <div className="text-3xl mb-1">{a.icon}</div>
                <div className={`font-bold mb-1 ${a.unlocked ? 'text-emerald-400' : 'text-slate-400'}`}>{a.label}</div>
                <div className="text-xs text-slate-300 text-center mb-1">{a.desc}</div>
                {!a.unlocked && <div className="text-xs text-amber-400">Locked</div>}
                {a.unlocked && <div className="text-xs text-emerald-400">Unlocked!</div>}
                              </div>
            ))}
          </div>
        </div>
        {/* Profile Bio Section */}
        <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 mb-4">
          <div className="font-semibold mb-2 flex items-center gap-2"><User className="w-5 h-5 text-brand-400" /> Profile Bio</div>
          <label className="block mb-1 text-sm">Favourite Player:</label>
          <input className="input w-full mb-2" type="text" value={favPlayer} onChange={e => setFavPlayer(e.target.value)} placeholder="e.g. Michael van Gerwen" />
          <label className="block mb-1 text-sm">Favourite Football Team:</label>
          <input className="input w-full mb-2" type="text" value={favTeam} onChange={e => setFavTeam(e.target.value)} placeholder="e.g. Manchester United" />
          <label className="block mb-1 text-sm">Short Bio / Quote:</label>
          <textarea className="input w-full mb-2" value={bio} onChange={e => setBio(e.target.value)} placeholder="Write something about yourself..." rows={2} />
        </div>
      </div>
    </div>
  );
}