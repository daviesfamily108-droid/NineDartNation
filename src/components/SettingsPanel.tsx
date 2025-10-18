import React, { useEffect, useState } from 'react';
import { User, Settings, Volume2, Camera, Gamepad2, Eye, Mic, Save, Edit3, Shield, HelpCircle, MessageCircle, X, Send } from 'lucide-react';
import { useUserSettings } from '../store/userSettings';

export default function SettingsPanel({ user }: { user?: any }) {
  const {
    favoriteDouble, callerEnabled, callerVoice, callerVolume, speakCheckoutOnly, avgMode,
    autoStartOffline, rememberLastOffline, reducedMotion, compactHeader, allowSpectate,
    cameraScale, cameraAspect, autoscoreProvider, autoscoreWsUrl, calibrationGuide,
    preferredCameraId, preferredCameraLabel, cameraEnabled, offlineLayout, textSize, boxSize,
    setFavoriteDouble, setCallerEnabled, setCallerVoice, setCallerVolume, setSpeakCheckoutOnly,
    setAvgMode, setAutoStartOffline, setRememberLastOffline, setReducedMotion, setCompactHeader,
    setAllowSpectate, setCameraScale, setCameraAspect, setAutoscoreProvider, setAutoscoreWsUrl,
    setCalibrationGuide, setPreferredCamera, setCameraEnabled, setOfflineLayout, setTextSize, setBoxSize
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
  const [profilePhoto, setProfilePhoto] = useState('');
  const [allowAnalytics, setAllowAnalytics] = useState(true);

  // Help Assistant state
  const [helpMessages, setHelpMessages] = useState<Array<{text: string | {text: string, links?: Array<{text: string, tab: string}>}, isUser: boolean}>>([
    { text: "Hi! I'm your Nine Dart Nation assistant. How can I help you today?", isUser: false }
  ]);
  const [helpInput, setHelpInput] = useState('');

  useEffect(() => {
    const uname = user?.username || '';
    if (!uname) return;
    try {
      setFavPlayer(localStorage.getItem(`ndn:bio:favPlayer:${uname}`) || '');
      setFavTeam(localStorage.getItem(`ndn:bio:favTeam:${uname}`) || '');
      setFavDarts(localStorage.getItem(`ndn:bio:favDarts:${uname}`) || '');
      setBio(localStorage.getItem(`ndn:bio:bio:${uname}`) || '');
      setProfilePhoto(localStorage.getItem(`ndn:bio:profilePhoto:${uname}`) || '');
      setAllowAnalytics(localStorage.getItem(`ndn:settings:allowAnalytics:${uname}`) !== 'false');
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
      localStorage.setItem(`ndn:bio:profilePhoto:${uname}`, profilePhoto);
      // Dispatch event to notify avatar update
      try { window.dispatchEvent(new CustomEvent('ndn:avatar-updated', { detail: { username: uname, avatar: profilePhoto } })) } catch {}
      localStorage.setItem(`ndn:settings:allowAnalytics:${uname}`, allowAnalytics.toString());
      setIsEditing(false);
    } catch {}
  };

  // Help Assistant functions
  const faq = {
    'how to play': 'To play darts, select a game mode from the menu. For online play, join a match. For offline, start a local game.',
    'calibration': 'Go to Settings > Camera & Vision > Calibration Guide to set up your camera properly.',
    'premium': 'Premium unlocks all game modes. Click the "Upgrade to PREMIUM" button in online play.',
    'username': 'Change your username once for free in Settings > Account.',
    'voice': 'Enable voice caller in Settings > Audio & Voice. Test the voice with the Test Voice button.',
    'friends': 'Add friends in the Friends tab to play together.',
    'stats': 'View your statistics in the Stats tab.',
    'settings': 'Customize your experience in the Settings panel.',
    'support': 'Contact support via email or check the FAQ in Settings > Support.',
  };

  const navigateToTab = (tabKey: string) => {
    try {
      window.dispatchEvent(new CustomEvent('ndn:change-tab', { detail: { tab: tabKey } }));
    } catch (error) {
      console.error('Navigation failed:', error);
    }
  };

  const getResponseWithLinks = (userMessage: string): { text: string, links?: Array<{ text: string, tab: string }> } => {
    const message = userMessage.toLowerCase();

    if (message.includes('username') || message.includes('change name')) {
      return {
        text: 'You can change your username once for free.',
        links: [{ text: 'Go to Settings > Account', tab: 'settings' }]
      };
    }
    if (message.includes('premium') || message.includes('upgrade') || message.includes('subscription')) {
      return {
        text: 'Premium unlocks all game modes and features.',
        links: [{ text: 'Go to Online Play', tab: 'online' }]
      };
    }
    if (message.includes('calibrat') || message.includes('camera') || message.includes('vision')) {
      return {
        text: 'Set up your camera properly in Settings.',
        links: [{ text: 'Go to Settings > Camera & Vision', tab: 'settings' }]
      };
    }
    if (message.includes('voice') || message.includes('caller') || message.includes('audio')) {
      return {
        text: 'Enable voice calling in Settings.',
        links: [{ text: 'Go to Settings > Audio & Voice', tab: 'settings' }]
      };
    }
    if (message.includes('friend') || message.includes('play together')) {
      return {
        text: 'Add friends to play together.',
        links: [{ text: 'Go to Friends', tab: 'friends' }]
      };
    }
    if (message.includes('stat') || message.includes('score') || message.includes('performance')) {
      return {
        text: 'View your statistics and performance.',
        links: [{ text: 'Go to Stats', tab: 'stats' }]
      };
    }
    if (message.includes('setting') || message.includes('customiz') || message.includes('configur')) {
      return {
        text: 'Customize your experience.',
        links: [{ text: 'Go to Settings', tab: 'settings' }]
      };
    }
    if (message.includes('tournament') || message.includes('competition')) {
      return {
        text: 'Check out tournaments and competitions.',
        links: [{ text: 'Go to Tournaments', tab: 'tournaments' }]
      };
    }
    if (message.includes('help') || message.includes('support') || message.includes('faq')) {
      return {
        text: 'You\'re already in the help section! Check the Support section above for more resources.',
        links: [{ text: 'Scroll to Support', tab: 'settings' }]
      };
    }
    if (message.includes('how to play') || message.includes('game') || message.includes('start')) {
      return {
        text: 'To play darts, select a game mode from the menu. For online play, join a match. For offline, start a local game.',
        links: [
          { text: 'Play Online', tab: 'online' },
          { text: 'Play Offline', tab: 'offline' }
        ]
      };
    }

    return { text: "I'm not sure about that. Try asking about playing, calibration, premium, username changes, voice settings, friends, stats, or settings." };
  };

  const handleHelpSend = () => {
    if (!helpInput.trim()) return;
    const userMessage = helpInput.toLowerCase();
    setHelpMessages(prev => [...prev, { text: helpInput, isUser: true }]);
    setHelpInput('');

    // Get response with smart link suggestions
    const response = getResponseWithLinks(userMessage);

    setTimeout(() => {
      setHelpMessages(prev => [...prev, { text: response, isUser: false }]);
    }, 500);
  };

  // Username change state
  const [newUsername, setNewUsername] = useState('')
  const [changingUsername, setChangingUsername] = useState(false)
  const [usernameError, setUsernameError] = useState('')

  // Available voices for caller
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])

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
          <div className="font-semibold mb-4 flex items-center gap-2 text-black">
            <User className="w-5 h-5" /> Account
          </div>
          <div className="space-y-3">
            <div className="flex justify-center">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('ndn:logout'))}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Logout
              </button>
            </div>
            {/* Username Change */}
            <div className="border-t border-red-500/20 pt-3">
              <div className="font-medium mb-2 text-black">Change Username ({(() => {
                const count = user?.usernameChangeCount || 0;
                if (count < 2) return `${2 - count} free changes remaining`;
                return '£2 per change';
              })()})</div>
              <div className="text-sm text-black mb-2">You can change your username up to 2 times for free. Additional changes cost £2 each.</div>
              {user?.usernameChangeCount >= 2 && !newUsername.trim() ? (
                <div className="text-amber-400 text-sm mb-2">⚠️ Additional username changes cost £2</div>
              ) : null}
              <input
                className="input w-full mb-2"
                type="text"
                placeholder="New username"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                disabled={changingUsername}
              />
              {usernameError && <div className="text-red-400 text-sm mb-2">{usernameError}</div>}
              <button
                onClick={async () => {
                  setUsernameError('')
                  if (!newUsername.trim()) {
                    setUsernameError('Username required')
                    return
                  }
                  if (newUsername.length < 3 || newUsername.length > 20) {
                    setUsernameError('Username must be 3-20 characters')
                    return
                  }
                  const currentCount = user?.usernameChangeCount || 0;
                  const isFree = currentCount < 2;
                  
                  if (!isFree) {
                    // Charge £2 for additional changes
                    window.location.href = 'https://buy.stripe.com/eVq4gB3XqeNS0iw6vAfnO02'
                  } else {
                    // Free change - store the new username for after processing
                    localStorage.setItem('pendingUsernameChange', newUsername.trim())
                    // For free changes, we might need to handle this differently
                    // For now, redirect to a free processing endpoint or handle locally
                    window.location.href = '/?username-change=free'
                  }
                }}
                disabled={changingUsername || !newUsername.trim()}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                {changingUsername ? 'Processing...' : (() => {
                  const count = user?.usernameChangeCount || 0;
                  return count < 2 ? 'Change Username (FREE)' : 'Change Username (£2)';
                })()}
              </button>
            </div>
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

      {/* Profile Photo */}
      <div className="card">
        <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10">
          <div className="font-semibold mb-2 flex items-center gap-2">
            <User className="w-5 h-5 text-cyan-400" /> Profile Photo
          </div>
          <div>
            {profilePhoto && (
              <div className="mb-2">
                <img src={profilePhoto} alt="Profile" className="w-16 h-16 rounded-full object-cover" />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const photoData = event.target?.result as string;
                    setProfilePhoto(photoData);
                    // Immediately save to localStorage and update avatar in header
                    const uname = user?.username || '';
                    if (uname) {
                      localStorage.setItem(`ndn:bio:profilePhoto:${uname}`, photoData);
                    }
                    try { window.dispatchEvent(new CustomEvent('ndn:avatar-updated', { detail: { username: uname, avatar: photoData } })) } catch {}
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="hidden"
              id="profile-photo-upload"
            />
            <label htmlFor="profile-photo-upload" className="btn bg-cyan-600 hover:bg-cyan-700 cursor-pointer">
              {profilePhoto ? 'Change Photo' : 'Upload Photo'}
            </label>
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
                <option value="D18">Double 18</option>
                <option value="D16">Double 16</option>
                <option value="D14">Double 14</option>
                <option value="D12">Double 12</option>
                <option value="D10">Double 10</option>
                <option value="D8">Double 8</option>
                <option value="D6">Double 6</option>
                <option value="D4">Double 4</option>
                <option value="D2">Double 2</option>
                <option value="D1">Double 1</option>
                <option value="DB">Bullseye</option>
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
                  <button
                    onClick={() => {
                      const utterance = new SpeechSynthesisUtterance('Test voice: 180 scored!');
                      utterance.voice = availableVoices.find(v => v.name === callerVoice) || null;
                      utterance.volume = callerVolume;
                      speechSynthesis.speak(utterance);
                    }}
                    className="btn bg-blue-600 hover:bg-blue-700 mt-2"
                  >
                    Test Voice
                  </button>
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
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cameraEnabled"
                checked={cameraEnabled}
                onChange={e => setCameraEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="cameraEnabled" className="text-sm">Enable camera for scoring</label>
            </div>

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

            <div>
              <label className="block mb-2 text-sm font-medium">Text Size:</label>
              <select
                className="input w-full"
                value={textSize}
                onChange={e => setTextSize(e.target.value as 'small' | 'medium' | 'large')}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium">Box Size:</label>
              <select
                className="input w-full"
                value={boxSize}
                onChange={e => setBoxSize(e.target.value as 'small' | 'medium' | 'large')}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
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

      {/* Data & Privacy */}
      <div className="card">
        <div className="p-3 rounded-xl border border-gray-500/40 bg-gray-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" /> Data & Privacy
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowAnalytics"
                checked={allowAnalytics}
                onChange={e => setAllowAnalytics(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="allowAnalytics" className="text-sm">Allow anonymous usage analytics</label>
            </div>

            <div>
              <button
                onClick={() => {
                  // Export user data
                  const data = {
                    username: user?.username,
                    email: user?.email,
                    favPlayer,
                    favTeam,
                    favDarts,
                    bio,
                    profilePhoto,
                    settings: {
                      favoriteDouble,
                      avgMode,
                      autoStartOffline,
                      rememberLastOffline,
                      reducedMotion,
                      compactHeader,
                      allowSpectate,
                      cameraScale,
                      cameraAspect,
                      autoscoreProvider,
                      autoscoreWsUrl,
                      calibrationGuide,
                      callerEnabled,
                      callerVoice,
                      callerVolume,
                      speakCheckoutOnly,
                      textSize
                    }
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'ninedartnation-data.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="btn bg-blue-600 hover:bg-blue-700"
              >
                Export My Data
              </button>
            </div>

            <div>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                    // TODO: Implement account deletion
                    alert('Account deletion not yet implemented. Please contact support.');
                  }
                }}
                className="btn bg-red-600 hover:bg-red-700"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy & Copyright Warning */}
      <div className="card">
        <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" /> Privacy & Copyright Notice
          </div>

          <div className="space-y-3 text-sm text-slate-300">
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3">
              <p className="font-semibold text-red-300 mb-2">⚠️ IMPORTANT LEGAL NOTICE</p>
              <p className="mb-2">
                <strong>Copyright Protection:</strong> All code, assets, and intellectual property in Nine Dart Nation are protected by copyright law.
                Unauthorized copying, modification, or distribution of this software is strictly prohibited.
              </p>
              <p className="mb-2">
                <strong>Legal Consequences:</strong> Any attempt to edit, reverse-engineer, or redistribute this code will result in immediate legal action,
                including but not limited to copyright infringement lawsuits and potential criminal charges.
              </p>
              <p>
                <strong>Privacy:</strong> Your personal data and gameplay information are protected. Any unauthorized access or data collection
                violates privacy laws and will be prosecuted to the full extent of the law.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className="card">
        <div className="p-3 rounded-xl border border-teal-500/40 bg-teal-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-teal-400" /> Support & Help
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-300 mb-2">Need help? Contact us:</p>
              <a href="mailto:support@ninedartnation.com" className="btn bg-teal-600 hover:bg-teal-700">
                Email Support
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Help Assistant */}
      <div className="card">
        <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10">
          <div className="font-semibold mb-4 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-400" /> Help Assistant
          </div>

          <div className="space-y-4">
            {/* Chat Messages */}
            <div className="bg-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto space-y-3">
              {helpMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-3 py-2 rounded-lg ${
                    msg.isUser 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-700 text-slate-200'
                  }`}>
                    {typeof msg.text === 'string' ? (
                      msg.text
                    ) : (
                      <div className="space-y-2">
                        <div>{msg.text.text}</div>
                        {msg.text.links && (
                          <div className="space-y-1">
                            {msg.text.links.map((link, linkIndex) => (
                              <button
                                key={linkIndex}
                                onClick={() => navigateToTab(link.tab)}
                                className="block w-full text-left text-blue-300 hover:text-blue-200 underline text-sm"
                              >
                                {link.text}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={helpInput}
                onChange={(e) => setHelpInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleHelpSend()}
                placeholder="Ask me anything..."
                className="flex-1 input"
              />
              <button
                onClick={handleHelpSend}
                className="btn bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}