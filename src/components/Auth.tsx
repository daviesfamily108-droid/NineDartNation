import { useState } from 'react';
import { Eye, EyeOff, Trophy, Users, BarChart3, ShieldCheck, MessageCircle } from 'lucide-react';

// Demo-only admin credentials. Allow build-time override via Vite env vars so
// deployments (e.g., Netlify) can set their own values without editing code.
// SECURITY NOTE: These live in the client bundle and are NOT secure; for demo only.
const ADMIN_EMAIL = ((import.meta as any).env?.VITE_ADMIN_EMAIL as string) || 'daviesfamily108@gmail.com';
const ADMIN_USERNAME = ((import.meta as any).env?.VITE_ADMIN_USERNAME as string) || 'DartsWithG';
const ADMIN_PASSWORD = ((import.meta as any).env?.VITE_ADMIN_PASSWORD as string) || 'Cymru-2015';

function validatePassword(password: string) {
  return password.length >= 10 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export default function Auth({ onAuth }: { onAuth: (user: any) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reminder, setReminder] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleSignIn(e: any) {
    e.preventDefault();
    if (!username || !password) {
      setError('Username and password required.');
      return;
    }
    // Simulate login: fetch user from localStorage
    const users = JSON.parse(localStorage.getItem('ndn:users') || '{}');
    const user = users[username];
    if (user && user.password === password) {
      setError('');
      localStorage.setItem('ndn:currentUser', JSON.stringify(user));
      onAuth(user);
    } else {
      setError('Invalid username or password.');
    }
  }

  function handleSignUp(e: any) {
    e.preventDefault();
    if (!email || !username || !password) {
      setError('Email, username, and password required.');
      return;
    }
    // Simulate signup: store user in localStorage
    const users = JSON.parse(localStorage.getItem('ndn:users') || '{}');
    if (users[username]) {
      setError('Username already exists.');
      return;
    }
    const user = { email, username, password, admin: false };
    users[username] = user;
    localStorage.setItem('ndn:users', JSON.stringify(users));
    localStorage.setItem('ndn:currentUser', JSON.stringify(user));
    setError('');
    onAuth(user);
  }

  async function handleReset(e: any) {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) { setError('Enter your email address.'); return }
    try {
      const r = await fetch('/api/auth/send-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json()
      if (!j?.ok) throw new Error(j?.error || 'Failed to send reset email')
      setError('Password reset link sent to your email.');
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email');
    }
  }

  async function handleSendUsername(e: any) {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) { setError('Enter your email address.'); return }
    try {
      const r = await fetch('/api/auth/send-username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json()
      if (!j?.ok) throw new Error(j?.error || 'Failed to send username email')
      setError('Your username has been emailed to you.');
    } catch (err: any) {
      setError(err?.message || 'Failed to send username email');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background accents */}
      <div className="background-animated" />
      <div className="relative z-10 w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
        {/* Auth Card */}
        <form className="card w-full space-y-4" onSubmit={mode === 'signin' ? handleSignIn : mode === 'signup' ? handleSignUp : handleReset}>
          <div className="flex flex-col items-center justify-center gap-2 mb-2 text-center">
            <h1 className="logo text-center">NINE-DART-NATION 🎯</h1>
            <span className="badge">Welcome</span>
          </div>
          <h2 className="text-2xl font-bold">{mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}</h2>
          {(mode === 'signup' || mode === 'reset') && (
            <input className="input w-full" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          )}
          {mode !== 'reset' && (
            <input className="input w-full" type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          )}
          {mode !== 'reset' && (
            <div className="relative">
              <input
                className="input w-full pr-10"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                onFocus={() => setShowPassword(false)}
                onBlur={() => setShowPassword(false)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white"
                tabIndex={-1}
                onMouseDown={e => { e.preventDefault(); setShowPassword(true); }}
                onMouseUp={e => { e.preventDefault(); setShowPassword(false); }}
                onMouseLeave={() => setShowPassword(false)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          )}
          {mode === 'signup' && (
            <input className="input w-full" type="text" placeholder="Password Reminder (optional)" value={reminder} onChange={e => setReminder(e.target.value)} />
          )}
          {error && <div className="text-red-400 font-semibold text-sm">{error}</div>}
          <button className="btn w-full" type="submit">{mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Send Reset Link'}</button>
          {mode === 'reset' && (
            <button className="btn w-full mt-2 bg-white/10 hover:bg-white/20" type="button" onClick={handleSendUsername}>Email me my username</button>
          )}
          <div className="flex justify-between text-sm mt-2">
            <button type="button" className="underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}</button>
            <button type="button" className="underline" onClick={() => setMode('reset')}>Forgot password?</button>
          </div>
          <div className="text-xs text-slate-200/80">
            Tip: Use the admin demo credentials to explore admin features.
          </div>
        </form>

        {/* Hints / Teaser Panel */}
        <aside className="card w-full">
          <h3 className="text-xl font-bold mb-3">What’s inside</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3"><Users className="w-5 h-5 text-indigo-300 mt-1" />
              <div>
                <div className="font-semibold">Online & Friends</div>
                <div className="text-sm text-slate-200/90">Challenge friends, chat, and join leagues.</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><BarChart3 className="w-5 h-5 text-indigo-300 mt-1" />
              <div>
                <div className="font-semibold">Deep Stats</div>
                <div className="text-sm text-slate-200/90">Track 3-dart averages, best legs, and more.</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><Trophy className="w-5 h-5 text-indigo-300 mt-1" />
              <div>
                <div className="font-semibold">Game Modes</div>
                <div className="text-sm text-slate-200/90">Start with 3 free online games upon signup. After that, PREMIUM is required to play all games.</div>
              </div>
            </li>
            <li className="flex items-start gap-3"><ShieldCheck className="w-5 h-5 text-indigo-300 mt-1" />
              <div>
                <div className="font-semibold">Premium Perks</div>
                <div className="text-sm text-slate-200/90">Polished UI, upcoming features, and early access.</div>
              </div>
            </li>
          </ul>
          <a
            href={(import.meta as any).env?.VITE_DISCORD_INVITE_URL || 'https://discord.gg/8GtbZ6RU'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn mt-4 flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" /> Join BullseyeDartsLeague
          </a>
        </aside>
      </div>
    </div>
  );
}
