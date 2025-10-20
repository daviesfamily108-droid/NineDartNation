import React, { useEffect, useState } from 'react';
import { User, Settings, Volume2, Camera, Gamepad2, Eye, Mic, Save, Edit3 } from 'lucide-react';
import { useUserSettings } from '../store/userSettings';

export default function SettingsPanel({ user }: { user?: any }) {
  const {
    favoriteDouble, callerEnabled, callerVoice, callerVolume, speakCheckoutOnly, avgMode,
    autoStartOffline, rememberLastOffline, reducedMotion, compactHeader, allowSpectate,
    cameraScale, cameraAspect, autoscoreProvider, autoscoreWsUrl, calibrationGuide,
    preferredCameraId, preferredCameraLabel, offlineLayout,
    setFavoriteDouble, setCallerEnabled, setCallerVoice, setCallerVolume, setSpeakCheckoutOnly,
    setAvgMode, setAutoStartOffline, setRememberLastOffline, setReducedMotion, setCompactHeader,
    setAllowSpectate, setCameraScale, setCameraAspect, setAutoscoreProvider, setAutoscoreWsUrl,
    setCalibrationGuide, setPreferredCamera, setOfflineLayout
  } = useUserSettings();

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

  // Profile bio fields with edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [favPlayer, setFavPlayer] = useState('');
  const [favTeam, setFavTeam] = useState('');
  const [favDarts, setFavDarts] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    const uname = user?.username || '';
    if (!uname) return;
    try {
      setFavPlayer(localStorage.getItem(`ndn:bio:favPlayer:${uname}`) || '');
      setFavTeam(localStorage.getItem(`ndn:bio:favTeam:${uname}`) || '');
      setFavDarts(localStorage.getItem(`ndn:bio:favDarts:${uname}`) || '');
      setBio(localStorage.getItem(`ndn:bio:bio:${uname}`) || '');
    } catch {}
  }, [user?.username]);

  const saveBio = () => {
    const uname = user?.username || '';
    if (!uname) return;
    try {
      localStorage.setItem(`ndn:bio:favPlayer:${uname}`, favPlayer);
      localStorage.setItem(`ndn:bio:favTeam:${uname}`, favTeam);
      localStorage.setItem(`ndn:bio:favDarts:${uname}`, favDarts);
      localStorage.setItem(`ndn:bio:bio:${uname}`, bio);
      setIsEditing(false);
    } catch {}
  };

  // Available voices for caller
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices.filter(v => v.lang.startsWith('en')));
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  return (
    <div className="space-y-6">
      {/* Account Actions - Moved to top */}
      <div className="card">
        <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2 text-red-700">
            <User className="w-5 h-5" /> Account
          </div>
          <div className="flex justify-center">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('ndn:logout'))}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Profile Bio Section */}
      <div className="card">
        <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-brand-400" /> Profile Bio
            </div>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 text-sm transition-colors"
              >
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <button
                onClick={saveBio}
                className="flex items-center gap-2 px-3 py-1 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 text-sm transition-colors"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block mb-1 text-sm font-medium">Favourite Player:</label>
              {isEditing ? (
                <input
                  className="input w-full"
                  type="text"
                  value={favPlayer}
                  onChange={e => setFavPlayer(e.target.value)}
                  placeholder="e.g. Michael van Gerwen"
                />
              ) : (
                <div className="px-3 py-2 bg-slate-800/50 rounded-lg text-slate-300 min-h-[2.5rem] flex items-center">
                  {favPlayer || 'Not set'}
                </div>
              )}
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Favourite Football Team:</label>
              {isEditing ? (
                <input
                  className="input w-full"
                  type="text"
                  value={favTeam}
                  onChange={e => setFavTeam(e.target.value)}
                  placeholder="e.g. Manchester United"
                />
              ) : (
                <div className="px-3 py-2 bg-slate-800/50 rounded-lg text-slate-300 min-h-[2.5rem] flex items-center">
                  {favTeam || 'Not set'}
                </div>
              )}
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Favourite Darts:</label>
              {isEditing ? (
                <input
                  className="input w-full"
                  type="text"
                  value={favDarts}
                  onChange={e => setFavDarts(e.target.value)}
                  placeholder="e.g. Unicorn Phase 5, 24g"
                />
              ) : (
                <div className="px-3 py-2 bg-slate-800/50 rounded-lg text-slate-300 min-h-[2.5rem] flex items-center">
                  {favDarts || 'Not set'}
                </div>
              )}
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Short Bio / Quote:</label>
              {isEditing ? (
                <textarea
                  className="input w-full"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Write something about yourself..."
                  rows={3}
                />
              ) : (
                <div className="px-3 py-2 bg-slate-800/50 rounded-lg text-slate-300 min-h-[4rem] flex items-start">
                  {bio || 'No bio set'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Game Preferences */}
      <div className="card">
        <div className="p-3 rounded-xl border border-green-500/40 bg-green-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-green-400" /> Game Preferences
          </div>

          <div className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium">Favourite Double:</label>
              <select
                className="input w-full"
                value={favoriteDouble}
                onChange={e => setFavoriteDouble(e.target.value)}
              >
                <option value="any">Any Double</option>
                <option value="D20">Double 20</option>
                <option value="D19">Double 19</option>
                <option value="D18">Double 18</option>
                <option value="D17">Double 17</option>
                <option value="D16">Double 16</option>
                <option value="D15">Double 15</option>
                <option value="D14">Double 14</option>
                <option value="D13">Double 13</option>
                <option value="D12">Double 12</option>
                <option value="D11">Double 11</option>
                <option value="D10">Double 10</option>
                <option value="D9">Double 9</option>
                <option value="D8">Double 8</option>
                <option value="D7">Double 7</option>
                <option value="D6">Double 6</option>
                <option value="D5">Double 5</option>
                <option value="D4">Double 4</option>
                <option value="D3">Double 3</option>
                <option value="D2">Double 2</option>
                <option value="D1">Double 1</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium">Average Display Mode:</label>
              <select
                className="input w-full"
                value={avgMode}
                onChange={e => setAvgMode(e.target.value as 'all-time' | '24h')}
              >
                <option value="all-time">All Time Average</option>
                <option value="24h">24 Hour Average</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="autoStartOffline"
                checked={autoStartOffline}
                onChange={e => setAutoStartOffline(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="autoStartOffline" className="text-sm">Auto-start offline games</label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="rememberLastOffline"
                checked={rememberLastOffline}
                onChange={e => setRememberLastOffline(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="rememberLastOffline" className="text-sm">Remember last offline game settings</label>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium">Offline Game Layout:</label>
              <select
                className="input w-full"
                value={offlineLayout || 'classic'}
                onChange={e => setOfflineLayout(e.target.value as 'classic' | 'modern')}
              >
                <option value="classic">Classic Layout</option>
                <option value="modern">Modern Layout</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Audio & Voice Settings */}
      <div className="card">
        <div className="p-3 rounded-xl border border-purple-500/40 bg-purple-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-purple-400" /> Audio & Voice
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="callerEnabled"
                checked={callerEnabled}
                onChange={e => setCallerEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="callerEnabled" className="text-sm font-medium">Enable Voice Caller</label>
            </div>

            {callerEnabled && (
              <>
                <div>
                  <label className="block mb-2 text-sm font-medium">Voice:</label>
                  <select
                    className="input w-full"
                    value={callerVoice}
                    onChange={e => setCallerVoice(e.target.value)}
                  >
                    {availableVoices.map(voice => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-2 text-sm font-medium">Volume: {Math.round(callerVolume * 100)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={callerVolume}
                    onChange={e => setCallerVolume(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="speakCheckoutOnly"
                    checked={speakCheckoutOnly}
                    onChange={e => setSpeakCheckoutOnly(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="speakCheckoutOnly" className="text-sm">Only announce checkouts</label>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Camera & Vision Settings */}
      <div className="card">
        <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" /> Camera & Vision
          </div>

          <div className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium">Camera Scale: {cameraScale.toFixed(2)}x</label>
              <input
                type="range"
                min="0.5"
                max="1.25"
                step="0.05"
                value={cameraScale}
                onChange={e => setCameraScale(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium">Camera Aspect Ratio:</label>
              <select
                className="input w-full"
                value={cameraAspect || 'wide'}
                onChange={e => setCameraAspect(e.target.value as 'wide' | 'square')}
              >
                <option value="wide">Wide (16:9)</option>
                <option value="square">Square (1:1)</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="calibrationGuide"
                checked={calibrationGuide}
                onChange={e => setCalibrationGuide(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="calibrationGuide" className="text-sm">Show calibration guide</label>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium">Autoscore Provider:</label>
              <select
                className="input w-full"
                value={autoscoreProvider || 'built-in'}
                onChange={e => setAutoscoreProvider(e.target.value as 'built-in' | 'external-ws')}
              >
                <option value="built-in">Built-in Vision</option>
                <option value="external-ws">External WebSocket</option>
              </select>
            </div>

            {autoscoreProvider === 'external-ws' && (
              <div>
                <label className="block mb-2 text-sm font-medium">External WebSocket URL:</label>
                <input
                  className="input w-full"
                  type="url"
                  value={autoscoreWsUrl || ''}
                  onChange={e => setAutoscoreWsUrl(e.target.value)}
                  placeholder="ws://localhost:8080"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* UI & Accessibility */}
      <div className="card">
        <div className="p-3 rounded-xl border border-orange-500/40 bg-orange-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-orange-400" /> UI & Accessibility
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="reducedMotion"
                checked={reducedMotion}
                onChange={e => setReducedMotion(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="reducedMotion" className="text-sm">Reduce motion/animations</label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="compactHeader"
                checked={compactHeader}
                onChange={e => setCompactHeader(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="compactHeader" className="text-sm">Compact header layout</label>
            </div>
          </div>
        </div>
      </div>

      {/* Online & Social */}
      <div className="card">
        <div className="p-3 rounded-xl border border-pink-500/40 bg-pink-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Mic className="w-5 h-5 text-pink-400" /> Online & Social
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowSpectate"
                checked={allowSpectate}
                onChange={e => setAllowSpectate(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="allowSpectate" className="text-sm">Allow others to spectate my games</label>
            </div>
          </div>
        </div>
      </div>

      {/* Achievements & Badges Section */}
      <div className="card">
        <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2 text-yellow-700">
            <Settings className="w-5 h-5" /> Achievements & Badges
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.map(a => (
              <div key={a.key} className={`flex flex-col items-center p-3 rounded-xl border ${a.unlocked ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-400 bg-slate-700/10'}`}>
                <div className="text-3xl mb-2">{a.icon}</div>
                <div className={`font-bold mb-1 text-center ${a.unlocked ? 'text-emerald-400' : 'text-slate-400'}`}>{a.label}</div>
                <div className="text-xs text-slate-300 text-center mb-2">{a.desc}</div>
                {!a.unlocked && <div className="text-xs text-amber-400 font-medium">🔒 Locked</div>}
                {a.unlocked && <div className="text-xs text-emerald-400 font-medium">✅ Unlocked!</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}