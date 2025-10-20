const jwt = require('jsonwebtoken');
const dotenv = require('dotenv'); dotenv.config();
const { WebSocketServer } = require('ws');
const { nanoid } = require('nanoid');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const https = require('https');
const path = require('path');
const Filter = require('bad-words');
const EmailTemplates = require('./server/emails/templates.js');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');
const client = require('prom-client');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
// Track HTTPS runtime status and port
let HTTPS_ACTIVE = false
let HTTPS_PORT = Number(process.env.HTTPS_PORT || 8788)
const app = express();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn('[DB] Supabase not configured - using in-memory storage only');
}
// Observability: metrics registry
const register = new client.Registry()
client.collectDefaultMetrics({ register })
const httpRequestsTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method','route','status'] })
const wsConnections = new client.Gauge({ name: 'ws_connections', help: 'Current WebSocket connections' })
const wsRooms = new client.Gauge({ name: 'ws_rooms', help: 'Current active rooms' })
const chatMessagesTotal = new client.Counter({ name: 'chat_messages_total', help: 'Total WS chat messages relayed' })
const errorsTotal = new client.Counter({ name: 'server_errors_total', help: 'Total server errors', labelNames: ['scope'] })
const celebrations180Total = new client.Counter({ name: 'celebrations_180_total', help: 'Total 180 celebrations broadcast' })
register.registerMetric(httpRequestsTotal)
register.registerMetric(wsConnections)
register.registerMetric(wsRooms)
register.registerMetric(chatMessagesTotal)
register.registerMetric(errorsTotal)
register.registerMetric(celebrations180Total)

// Security & performance
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors())
app.use(compression())
const limiter = rateLimit({ windowMs: 60 * 1000, max: 600 })
app.use(limiter)
// Logging
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
app.use(pinoHttp({ logger, genReqId: (req) => req.headers['x-request-id'] || nanoid(12) }))
// HTTP metrics middleware (after logging so route is known)
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const route = (req.route && req.route.path) || req.path || 'unknown'
    try { httpRequestsTotal.inc({ method: req.method, route, status: String(res.statusCode) }) } catch {}
  })
  next()
})
// Guard JSON body size to avoid excessive memory
app.use(express.json({ limit: '100kb' }));
// Serve static assets (mobile camera page)
app.use(express.static('./server/public'))
// In production, also serve the built client app. Prefer root ../dist, fallback to ../app/dist.
const rootDistPath = path.resolve(process.cwd(), 'dist')
const appDistPath = path.resolve(process.cwd(), 'app', 'dist')
let staticBase = null
if (fs.existsSync(rootDistPath)) {
  staticBase = rootDistPath
  app.use(express.static(rootDistPath))
} else if (fs.existsSync(appDistPath)) {
  staticBase = appDistPath
  app.use(express.static(appDistPath))
}
// Log whether we found a built SPA to serve
if (staticBase) {
  console.log(`[SPA] Serving static frontend from ${staticBase}`)
} else {
  console.warn('[SPA] No built frontend found at ../dist or ../app/dist; "/" will 404 (API+WS OK).')
}


// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  const { email, username, password } = req.body
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password required.' })
  }

  try {
    // Check if username exists in memory
    for (const u of users.values()) {
      if (u.username === username) {
        return res.status(409).json({ error: 'Username already exists.' })
      }
      if (u.email === email) {
        return res.status(409).json({ error: 'Email already exists.' })
      }
    }

    // Check if user exists in Supabase
    if (supabase) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('email, username')
        .or(`email.eq.${email},username.eq.${username}`)
        .single();

      if (existingUser) {
        if (existingUser.email === email) {
          return res.status(409).json({ error: 'Email already exists.' })
        }
        if (existingUser.username === username) {
          return res.status(409).json({ error: 'Username already exists.' })
        }
      }
    }

    const user = { email, username, password, admin: false, subscription: { fullAccess: false } }

    // Save to Supabase if available
    if (supabase) {
      const { error } = await supabase
        .from('users')
        .insert([{
          email: user.email,
          username: user.username,
          password: user.password, // Note: In production, hash passwords!
          admin: user.admin,
          subscription: user.subscription,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('[DB] Failed to save user to Supabase:', error);
        return res.status(500).json({ error: 'Failed to create account.' });
      }
    }

    // Also store in memory for current session
    users.set(email, user)

    // Create JWT token
    const token = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '100y' });
    return res.json({ user, token })
  } catch (error) {
    console.error('[SIGNUP] Error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
})

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    let user = null;

    // First check in-memory users
    for (const u of users.values()) {
      if (u.username === username && u.password === password) {
        user = u;
        break;
      }
    }

    // If not found in memory, check Supabase
    if (!user && supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('[DB] Supabase login error:', error);
      } else if (data && data.password === password) {
        user = {
          email: data.email,
          username: data.username,
          password: data.password,
          admin: data.admin || false
        };
        // Cache in memory for current session
        users.set(data.email, user);
      }
    }

    if (user) {
      // Create JWT token
      const token = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '100y' });
      return res.json({ user, token });
    } else {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Route to verify token and get user info
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Find user by username
    for (const u of users.values()) {
      if (u.username === decoded.username) {
        return res.json({ user: u });
      }
    }
    return res.status(404).json({ error: 'User not found.' });
  } catch {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});


// In-memory subscription store (demo)
let subscription = { fullAccess: false };
// Winner-based per-email premium grants (demo) email -> expiry (ms since epoch)
const premiumWinners = new Map();
// In-memory admin store (demo)
const OWNER_EMAIL = 'daviesfamily108@gmail.com'
const adminEmails = new Set([OWNER_EMAIL])
// In-memory ops flags (demo)
let maintenanceMode = false
let lastAnnouncement = null
// Profanity filter and reports store (demo)
const profanityFilter = new Filter()
const reports = []
// Admin-configurable email copy (in-memory demo)
const emailCopy = {
  reset: { title: '', intro: '', buttonLabel: '' },
  reminder: { title: '', intro: '', buttonLabel: '' },
  username: { title: '', intro: '', buttonLabel: '' },
  confirmEmail: { title: '', intro: '', buttonLabel: '' },
  changed: { title: '', intro: '', buttonLabel: '' },
}

app.get('/api/subscription', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) {
    return res.json({ fullAccess: false });
  }

  // Owner/admins always have premium in this demo
  if (adminEmails.has(email)) {
    return res.json({ fullAccess: true, source: 'admin' })
  }
  if (premiumWinners.has(email)) {
    const exp = premiumWinners.get(email)
    const now = Date.now()
    if (exp && exp > now) {
      return res.json({ fullAccess: true, source: 'tournament', expiresAt: exp })
    }
  }

  // Check user's subscription from memory
  const user = users.get(email);
  if (user?.subscription) {
    return res.json(user.subscription);
  }

  // Fallback: check Supabase if not in memory
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('subscription')
        .eq('email', email)
        .single();

      if (!error && data?.subscription) {
        return res.json(data.subscription);
      }
    } catch (err) {
      console.error('[DB] Error fetching subscription:', err);
    }
  }

  res.json({ fullAccess: false });
});

// Username change endpoint
app.post('/api/change-username', async (req, res) => {
  const { email, newUsername } = req.body || {}
  if (!email || !newUsername) {
    return res.status(400).json({ error: 'Email and new username required.' })
  }

  try {
    // Check if new username is already taken
    for (const u of users.values()) {
      if (u.username === newUsername) {
        return res.status(409).json({ error: 'Username already exists.' })
      }
    }

    // Check Supabase too
    if (supabase) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('username')
        .eq('username', newUsername)
        .single();

      if (existingUser) {
        return res.status(409).json({ error: 'Username already exists.' })
      }
    }

    // Find and update the user
    let user = null
    for (const u of users.values()) {
      if (u.email === email) {
        user = u
        break
      }
    }

    if (!user) {
      // Check Supabase
      if (supabase) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('[DB] Supabase error:', error);
          return res.status(500).json({ error: 'Database error.' });
        }

        if (data) {
          user = data
        }
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    // Check username change count
    const currentCount = user.usernameChangeCount || 0
    const isFree = currentCount < 2

    // For paid changes, we should verify payment here, but for now we'll trust the client
    // In production, you'd verify the Stripe payment was successful

    // Update username
    const oldUsername = user.username
    user.username = newUsername
    user.usernameChangeCount = currentCount + 1

    // Update in memory
    users.set(email, user)

    // Update in Supabase
    if (supabase) {
      const { error } = await supabase
        .from('users')
        .update({
          username: newUsername,
          usernameChangeCount: user.usernameChangeCount
        })
        .eq('email', email);

      if (error) {
        console.error('[DB] Failed to update username in Supabase:', error);
        return res.status(500).json({ error: 'Failed to update username.' });
      }
    }

    // Create new JWT token with updated username
    const token = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '100y' });

    res.json({ ok: true, user, token })
  } catch (error) {
    console.error('[CHANGE_USERNAME] Error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Debug endpoint to check Supabase status
app.get('/api/debug/supabase', (req, res) => {
  res.json({
    supabaseConfigured: !!supabase,
    userCount: users.size,
    supabaseUrl: supabase ? 'configured' : 'not configured'
  });
});
app.get('/metrics', async (req, res) => {
  try {
    res.setHeader('Content-Type', register.contentType)
    // Update gauges just-in-time
    try { wsRooms.set(rooms.size) } catch {}
    try { wsConnections.set(clients.size) } catch {}
    const out = await register.metrics()
    res.end(out)
  } catch (e) {
    res.status(500).end('metrics_error')
  }
})

// Liveness and readiness
app.get('/healthz', (req, res) => res.json({ ok: true }))
app.get('/readyz', (req, res) => {
  // Basic readiness: HTTP up and WS server initialized; optionally include memory snapshot
  try {
    const mem = process.memoryUsage()
    const ready = !!wss
    res.json({ ok: ready, ws: ready, rooms: rooms?.size || 0, clients: clients?.size || 0, mem: { rss: mem.rss, heapUsed: mem.heapUsed } })
  } catch (e) {
    res.status(500).json({ ok: false, error: 'UNEXPECTED' })
  }
})

// Report LAN IPv4 addresses for phone pairing convenience
app.get('/api/hosts', (req, res) => {
  try {
    const nets = os.networkInterfaces() || {}
    const hosts = []
    for (const name of Object.keys(nets)) {
      for (const ni of nets[name] || []) {
        if (!ni) continue
        if (ni.family === 'IPv4' && !ni.internal) hosts.push(ni.address)
      }
    }
    res.json({ hosts })
  } catch (e) {
    res.json({ hosts: [] })
  }
})

// Placeholder webhook (accepts JSON; in production use Stripe raw body & verify signature)
app.post('/webhook/stripe', async (req, res) => {
  const { type, data } = req.body || {};
  if (type === 'checkout.session.completed') {
    const session = data?.object;
    const email = session?.customer_email || session?.metadata?.email;
    const purpose = session?.metadata?.purpose;
    if (email && purpose === 'subscription') {
      // Update user's subscription in memory and Supabase
      const user = users.get(email);
      if (user) {
        user.subscription = { fullAccess: true, source: 'stripe', purchasedAt: new Date().toISOString() };
      }
      if (supabase) {
        try {
          await supabase
            .from('users')
            .update({ subscription: { fullAccess: true, source: 'stripe', purchasedAt: new Date().toISOString() } })
            .eq('email', email);
        } catch (err) {
          console.error('[DB] Failed to update subscription:', err);
        }
      }
    }
  }
  // Demo: toggle fullAccess true and credit owner's wallet with premium revenue if provided
  subscription.fullAccess = true;
  try {
    const { amountCents, currency } = req.body || {}
    const cents = Math.max(0, Number(amountCents) || 0)
    const cur = String(currency || 'GBP').toUpperCase()
    if (cents > 0) creditWallet(OWNER_EMAIL, cur, cents)
  } catch {}
  res.json({ ok: true })
});

// Stripe (optional): Create a Checkout Session for username change (┬ú2)
// Configure on Render with:
//  - STRIPE_SECRET_KEY=sk_live_...
//  - STRIPE_PRICE_ID_USERNAME_CHANGE=price_...
// Optional (if you later secure webhook verification): STRIPE_WEBHOOK_SECRET=whsec_...
let stripe = null
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  }
} catch (e) {
  console.warn('[Stripe] init failed:', e?.message || e)
}

app.post('/api/stripe/create-session', async (req, res) => {
  try {
    if (!stripe || !process.env.STRIPE_PRICE_ID_USERNAME_CHANGE) {
      return res.status(400).json({ ok: false, error: 'STRIPE_NOT_CONFIGURED' })
    }
    const { email, successUrl, cancelUrl } = req.body || {}
    // Derive sensible defaults for success/cancel
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const proto = (req.headers['x-forwarded-proto'] || 'https')
    const base = `https://${host}`
    const sUrl = (typeof successUrl === 'string' && successUrl.startsWith('http')) ? successUrl : `${base}/?paid=1`
    const cUrl = (typeof cancelUrl === 'string' && cancelUrl.startsWith('http')) ? cancelUrl : `${base}/?paid=0`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ID_USERNAME_CHANGE, quantity: 1 }],
      customer_email: (typeof email === 'string' && email.includes('@')) ? email : undefined,
      metadata: { purpose: 'username-change', email: String(email||'') },
      success_url: sUrl,
      cancel_url: cUrl,
    })
    return res.json({ ok: true, url: session.url })
  } catch (e) {
    console.error('[Stripe] create-session failed:', e?.message || e)
    return res.status(500).json({ ok: false, error: 'SESSION_FAILED' })
  }
})

app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    if (!stripe || !process.env.STRIPE_PRICE_ID_SUBSCRIPTION) {
      return res.status(400).json({ ok: false, error: 'STRIPE_NOT_CONFIGURED' })
    }
    const { email, successUrl, cancelUrl } = req.body || {}
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
    }
    // Derive sensible defaults for success/cancel
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const proto = (req.headers['x-forwarded-proto'] || 'https')
    const base = `https://${host}`
    const sUrl = (typeof successUrl === 'string' && successUrl.startsWith('http')) ? successUrl : `${base}/?subscription=success`
    const cUrl = (typeof cancelUrl === 'string' && cancelUrl.startsWith('http')) ? cancelUrl : `${base}/?subscription=cancel`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ID_SUBSCRIPTION, quantity: 1 }],
      customer_email: email,
      metadata: { purpose: 'subscription', email: email },
      success_url: sUrl,
      cancel_url: cUrl,
    })
    return res.json({ ok: true, url: session.url })
  } catch (e) {
    console.error('[Stripe] create-checkout-session failed:', e?.message || e)
    return res.status(500).json({ ok: false, error: 'SESSION_FAILED' })
  }
})

// Admin management (demo; NOT secure ÔÇö no auth/signature verification)
app.get('/api/admins', (req, res) => {
  res.json({ admins: Array.from(adminEmails) })
})

app.get('/api/admins/check', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  res.json({ isAdmin: adminEmails.has(email) })
})

app.post('/api/admins/grant', (req, res) => {
  const { email, requesterEmail } = req.body || {}
  if ((requesterEmail || '').toLowerCase() !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  adminEmails.add(target)
  res.json({ ok: true, admins: Array.from(adminEmails) })
})

app.post('/api/admins/revoke', (req, res) => {
  const { email, requesterEmail } = req.body || {}
  if ((requesterEmail || '').toLowerCase() !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  if (target === OWNER_EMAIL) return res.status(400).json({ ok: false, error: 'CANNOT_REVOKE_OWNER' })
  adminEmails.delete(target)
  res.json({ ok: true, admins: Array.from(adminEmails) })
})

// Admin ops (owner-only; demo ÔÇö not secure)
app.get('/api/admin/status', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({
    ok: true,
    server: {
      clients: clients.size,
      rooms: rooms.size,
      matches: matches.size,
      premium: !!subscription.fullAccess,
      maintenance: !!maintenanceMode,
      lastAnnouncement,
    },
    matches: Array.from(matches.values()),
  })
})

app.post('/api/admin/maintenance', (req, res) => {
  const { enabled, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  maintenanceMode = !!enabled
  // Optionally notify clients
  broadcastAll({ type: 'maintenance', enabled: maintenanceMode })
  res.json({ ok: true, maintenance: maintenanceMode })
})

app.post('/api/admin/announce', (req, res) => {
  const { message, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const msg = String(message || '').trim()
  if (!msg) return res.status(400).json({ ok: false, error: 'MESSAGE_REQUIRED' })
  lastAnnouncement = { message: msg, ts: Date.now() }
  broadcastAll({ type: 'announcement', message: msg })
  res.json({ ok: true, announcement: lastAnnouncement })
})

app.post('/api/admin/subscription', (req, res) => {
  const { fullAccess, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  subscription.fullAccess = !!fullAccess
  res.json({ ok: true, subscription })
})

// Admin: list/grant/revoke per-email premium overrides (demo)
app.get('/api/admin/premium-winners', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const now = Date.now()
  const list = Array.from(premiumWinners.entries()).map(([email, exp]) => ({ email, expiresAt: exp, expired: exp <= now }))
  res.json({ ok: true, winners: list })
})

app.post('/api/admin/premium/grant', (req, res) => {
  const { email, days, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const target = String(email || '').toLowerCase()
  const d = Number(days) || 30
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const exp = Date.now() + Math.max(1, d) * 24 * 60 * 60 * 1000
  premiumWinners.set(target, exp)
  res.json({ ok: true, email: target, expiresAt: exp })
})

app.post('/api/admin/premium/revoke', (req, res) => {
  const { email, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  premiumWinners.delete(target)
  res.json({ ok: true })
})

app.get('/api/admin/system-health', async (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  
  const health = {
    database: supabase ? true : false,
    redis: false, // Not implemented yet
    websocket: wss ? true : false,
    https: HTTPS_ACTIVE,
    maintenance: maintenanceMode,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  }
  
  res.json({ ok: true, health })
})

app.get('/api/admin/matches', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, matches: Array.from(matches.values()) })
})

app.post('/api/admin/matches/delete', (req, res) => {
  const { matchId, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  if (!matchId || !matches.has(matchId)) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  matches.delete(matchId)
  // Broadcast updated lobby
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) }))
  }
  res.json({ ok: true })
})

// Health check for quick connectivity tests
app.get('/health', (req, res) => res.json({ ok: true }))
// Surface whether HTTPS was configured so clients can prefer secure links
app.get('/api/https-info', (req, res) => {
  res.json({ https: HTTPS_ACTIVE, port: HTTPS_PORT })
})

// Email template previews (owner-only)
app.get('/api/email/preview', (req, res) => {
  const kind = String(req.query.kind || 'reset')
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).send('FORBIDDEN')
  let out
  if (kind === 'reset') out = EmailTemplates.passwordReset({ username: 'Alex', actionUrl: 'https://example.com/reset?token=demo', ...emailCopy.reset })
  else if (kind === 'reminder') out = EmailTemplates.passwordReminder({ username: 'Alex', actionUrl: 'https://example.com/reset?token=demo', ...emailCopy.reminder })
  else if (kind === 'username') out = EmailTemplates.usernameReminder({ username: 'Alex', actionUrl: 'https://example.com/app', ...emailCopy.username })
  else if (kind === 'confirm-email') out = EmailTemplates.emailChangeConfirm({ username: 'Alex', newEmail: 'alex+new@example.com', actionUrl: 'https://example.com/confirm?token=demo', ...emailCopy.confirmEmail })
  else if (kind === 'changed') out = EmailTemplates.passwordChangedNotice({ username: 'Alex', supportUrl: 'https://example.com/support', ...emailCopy.changed })
  else return res.status(400).send('Unknown kind')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(out.html)
})

// Admin: get/update email copy
app.get('/api/admin/email-copy', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, copy: emailCopy })
})
app.post('/api/admin/email-copy', (req, res) => {
  const { requesterEmail, kind, title, intro, buttonLabel } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const map = { 'reset':'reset', 'reminder':'reminder', 'username':'username', 'confirm-email':'confirmEmail', 'changed':'changed' }
  const key = map[String(kind)]
  if (!key) return res.status(400).json({ ok: false, error: 'BAD_KIND' })
  emailCopy[key] = {
    title: typeof title === 'string' ? title : (emailCopy[key]?.title||''),
    intro: typeof intro === 'string' ? intro : (emailCopy[key]?.intro||''),
    buttonLabel: typeof buttonLabel === 'string' ? buttonLabel : (emailCopy[key]?.buttonLabel||''),
  }
  res.json({ ok: true, copy: emailCopy })
})

// --- Email sending (SMTP via environment) ---
// Configure env vars in your host: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
let mailer = null
try {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
} catch (e) {
  console.warn('[Email] transporter init failed', e?.message||e)
}

async function sendMail(to, subject, html) {
  if (!mailer) throw new Error('EMAIL_NOT_CONFIGURED')
  const from = process.env.SMTP_FROM || `Nine Dart Nation <no-reply@${(process.env.MAIL_DOMAIN||'example.com')}>`
  await mailer.sendMail({ from, to, subject, html })
}

// Very simple in-memory token store for demo
const resetTokens = new Map() // email -> { token, exp }
function issueToken(email, ttlMs = 30*60*1000) {
  const token = nanoid(24)
  const exp = Date.now() + ttlMs
  resetTokens.set(email, { token, exp })
  return token
}
function verifyToken(token) {
  for (const [email, rec] of resetTokens.entries()) {
    if (rec.token === token && rec.exp > Date.now()) return email
  }
  return null
}

// Send password reset by email
app.post('/api/auth/send-reset', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase()
    if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
    const token = issueToken(email)
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const proto = (req.headers['x-forwarded-proto'] || 'https')
    const base = `${proto}://${host}`
    const actionUrl = `${base}/reset?token=${encodeURIComponent(token)}`
    const tpl = EmailTemplates.passwordReset({ username: email.split('@')[0], actionUrl, ...emailCopy.reset })
    await sendMail(email, 'Reset your Nine Dart Nation password', tpl.html)
    res.json({ ok: true })
  } catch (e) {
    const msg = e?.message || 'SEND_FAILED'
    res.status(500).json({ ok: false, error: msg })
  }
})

// Send username reminder to email
app.post('/api/auth/send-username', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase()
    const username = String(req.body?.username || '').trim()
    if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const proto = (req.headers['x-forwarded-proto'] || 'https')
    const base = `${proto}://${host}`
    const actionUrl = `${base}/`
    const tpl = EmailTemplates.usernameReminder({ username: username || email.split('@')[0], actionUrl, ...emailCopy.username })
    await sendMail(email, 'Your Nine Dart Nation username', tpl.html)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message||'SEND_FAILED' })
  }
})

// Confirm password reset with token (demo: verifies token only; replace with real user persistence)
app.post('/api/auth/confirm-reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {}
    const t = String(token || '')
    if (!t) return res.status(400).json({ ok: false, error: 'TOKEN_REQUIRED' })
    const email = verifyToken(t)
    if (!email) return res.status(400).json({ ok: false, error: 'TOKEN_INVALID' })
    if (typeof newPassword !== 'string' || newPassword.length < 10) {
      return res.status(400).json({ ok: false, error: 'WEAK_PASSWORD' })
    }
    // In a real app, hash and store password for the user identified by `email`
    // For demo, consume token so it can't be reused
    resetTokens.delete(email)
    try {
      const tpl = EmailTemplates.passwordChangedNotice({ username: email.split('@')[0], supportUrl: 'https://example.com/support', ...emailCopy.changed })
      await sendMail(email, 'Your Nine Dart Nation password was changed', tpl.html)
    } catch {}
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'RESET_FAILED' })
  }
})

// SPA fallback: serve index.html for any non-API, non-static route when a dist exists
if (staticBase) {
  app.get('*', (req, res, next) => {
    const p = req.path || ''
    if (p.startsWith('/api') || p === '/health') return next()
    // mobile camera page is a static file in /public
    if (p === '/mobile-cam.html') return next()
    const indexPath = path.join(staticBase, 'index.html')
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath)
    next()
  })
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces?.() || {}
  const hosts = []
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (!ni) continue
      if (ni.family === 'IPv4' && !ni.internal) hosts.push(ni.address)
    }
  }
  console.log(`[HTTP] Server listening on 0.0.0.0:${PORT}`)
  if (hosts.length) {
    for (const ip of hosts) console.log(`       LAN:  http://${ip}:${PORT}`)
  } else {
    console.log(`       TIP: open http://localhost:${PORT} on this PC; phones use your LAN IP`)
  }
});
// Constrain ws payload size for safety
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 128 * 1024 });
console.log(`[WS] WebSocket attached to same server at path /ws`);
wsConnections.set(0)

// Optional HTTPS server for iOS camera (requires certs)
let httpsServer = null
let wssSecure = null
try {
  const ENABLE_HTTPS = String(process.env.NDN_HTTPS || '0') === '1'
  if (ENABLE_HTTPS) {
    // Resolve certificate/key paths
    const keyPath = process.env.NDN_TLS_KEY || path.resolve(process.cwd(), 'server', 'certs', 'server.key')
    const certPath = process.env.NDN_TLS_CERT || path.resolve(process.cwd(), 'server', 'certs', 'server.crt')
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const key = fs.readFileSync(keyPath)
      const cert = fs.readFileSync(certPath)
      httpsServer = https.createServer({ key, cert }, app)
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        const nets = os.networkInterfaces?.() || {}
        const hosts = []
        for (const name of Object.keys(nets)) {
          for (const ni of nets[name] || []) {
            if (!ni) continue
            if (ni.family === 'IPv4' && !ni.internal) hosts.push(ni.address)
          }
        }
        console.log(`[HTTPS] Server listening on 0.0.0.0:${HTTPS_PORT}`)
        HTTPS_ACTIVE = true
        if (hosts.length) {
          for (const ip of hosts) console.log(`        LAN: https://${ip}:${HTTPS_PORT}`)
        }
      })
      // Attach a secure WebSocket for HTTPS clients
      wssSecure = new WebSocketServer({ server: httpsServer, maxPayload: 128 * 1024 })
      console.log(`[WS] Secure WebSocket attached to HTTPS server`)
    } else {
      console.warn(`[HTTPS] NDN_HTTPS=1 but cert files not found. Expected at:\n  key: ${keyPath}\n  cert: ${certPath}`)
    }
  }
} catch (e) {
  console.warn('[HTTPS] Failed to initialize HTTPS server:', e?.message || e)
}

// Simple in-memory rooms
const rooms = new Map(); // roomId -> Set(ws)
// Simple in-memory match lobby
const matches = new Map(); // matchId -> { id, creatorId, creatorName, mode, value, startingScore, game, creatorAvg, createdAt }
const clients = new Map(); // wsId -> ws
// WebRTC camera pairing sessions (code -> { code, desktopId, phoneId, ts })
const camSessions = new Map();
const CAM_TTL_MS = 2 * 60 * 1000 // 2 minutes
function genCamCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = ''
  for (let i=0;i<4;i++) code += letters[Math.floor(Math.random()*letters.length)]
  if (camSessions.has(code)) return genCamCode()
  return code
}
// (removed duplicate camSessions/genCamCode)
// Simple in-memory tournaments
// { id, title, game, mode, value, description, startAt, checkinMinutes, capacity, participants: [{email, username}], official, prize, status: 'scheduled'|'running'|'completed', winnerEmail,
//   prizeType: 'premium'|'cash'|'none', prizeAmount?: number, currency?: string, payoutStatus?: 'none'|'pending'|'paid', prizeNotes?: string, createdAt?: number, paidAt?: number }
const tournaments = new Map();
// Simple in-memory users and friendships (demo)
// users: email -> { email, username, status: 'online'|'offline'|'ingame', wsId? }
const users = new Map();
// Migration: If any old users exist in global object, migrate them to Map
if (global.oldUsers && typeof global.oldUsers === 'object') {
  for (const key of Object.keys(global.oldUsers)) {
    const u = global.oldUsers[key];
    if (u && u.email && u.username && u.password) {
      users.set(u.email, u);
    }
  }
}
// Load users from Supabase on startup
(async () => {
  if (supabase) {
    try {
      console.log('[DB] Loading users from Supabase...');
      const { data, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        console.error('[DB] Failed to load users from Supabase:', error);
      } else if (data) {
        let loadedCount = 0;
        for (const user of data) {
          users.set(user.email, {
            email: user.email,
            username: user.username,
            password: user.password,
            admin: user.admin || false,
            subscription: user.subscription || { fullAccess: false }
          });
          loadedCount++;
        }
        console.log(`[DB] Successfully loaded ${loadedCount} users from Supabase`);
      } else {
        console.log('[DB] No users found in Supabase');
      }
    } catch (err) {
      console.error('[DB] Error loading users from Supabase:', err);
    }
  } else {
    console.warn('[DB] Supabase not configured - using in-memory storage only');
  }
})();
// Initialize demo admin user
if (!users.has('daviesfamily108@gmail.com')) {
  users.set('daviesfamily108@gmail.com', {
    email: 'daviesfamily108@gmail.com',
    username: 'DartsWithG',
    password: 'Cymru-2015',
    admin: true
  });
}
// friends: email -> Set(friendEmail)
const friendships = new Map();
// simple messages store: recipientEmail -> [{ id, from, message, ts }]
const messages = new Map();
// In-memory wallets: email -> { email, balances: { [currency]: cents } }
const wallets = new Map();
// In-memory withdrawals: id -> { id, email, currency, amountCents, status: 'pending'|'paid'|'rejected', requestedAt, decidedAt?, notes? }
const withdrawals = new Map();
// In-memory payout methods: email -> { brand, last4, addedAt }
const payoutMethods = new Map();

function creditWallet(email, currency, amountCents) {
  const addr = String(email||'').toLowerCase()
  if (!addr || !currency || !Number.isFinite(amountCents) || amountCents <= 0) return
  const code = String(currency).toUpperCase()
  const w = wallets.get(addr) || { email: addr, balances: {} }
  w.balances[code] = (w.balances[code] || 0) + Math.floor(amountCents)
  wallets.set(addr, w)
}

function debitWallet(email, currency, amountCents) {
  const addr = String(email||'').toLowerCase()
  const code = String(currency).toUpperCase()
  const w = wallets.get(addr)
  if (!w) return false
  const bal = w.balances[code] || 0
  if (amountCents > bal) return false
  w.balances[code] = bal - Math.floor(amountCents)
  wallets.set(addr, w)
  return true
}

// Persistence helpers (demo)
const FRIENDS_FILE = './friends.json'
function saveFriendships() {
  try {
    const obj = {}
    for (const [k, v] of friendships.entries()) obj[k] = Array.from(v)
    fs.writeFileSync(FRIENDS_FILE, JSON.stringify({ friendships: obj }, null, 2))
  } catch {}
}
function loadFriendships() {
  try {
    if (!fs.existsSync(FRIENDS_FILE)) return
    const j = JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf8'))
    if (j && j.friendships) {
      for (const [k, arr] of Object.entries(j.friendships)) {
        friendships.set(k, new Set(arr))
      }
    }
  } catch {}
}
loadFriendships()

function broadcastAll(data) {
  const payload = (typeof data === 'string') ? data : JSON.stringify(data)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

function broadcastTournaments() {
  const list = Array.from(tournaments.values())
  broadcastAll({ type: 'tournaments', tournaments: list })
}

function joinRoom(ws, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws._roomId = roomId;
  if (ws._email && users.has(ws._email)) {
    const u = users.get(ws._email)
    u.status = 'ingame'
    u.lastSeen = Date.now()
    users.set(ws._email, u)
  }
}

function leaveRoom(ws) {
  const roomId = ws._roomId;
  if (!roomId) return;
  const set = rooms.get(roomId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(roomId);
  }
  ws._roomId = null;
  if (ws._email && users.has(ws._email)) {
    const u = users.get(ws._email)
    // If still connected, revert to online; otherwise close handler will set offline
    u.status = 'online'
    u.lastSeen = Date.now()
    users.set(ws._email, u)
  }
}

function broadcastToRoom(roomId, data, exceptWs=null) {
  const set = rooms.get(roomId);
  if (!set) return;
  const payload = (typeof data === 'string') ? data : JSON.stringify(data)
  for (const client of set) {
    if (client.readyState === 1 && client !== exceptWs) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws, req) => {
  try { console.log(`[WS] client connected path=${req?.url||'/'} origin=${req?.headers?.origin||''}`) } catch {}
  ws._id = nanoid(8);
  clients.set(ws._id, ws)
  wsConnections.inc()
  // Heartbeat
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  // Log low-level socket errors
  ws.on('error', (err) => {
    try { console.warn(`[WS] error id=${ws._id} message=${err?.message||err}`) } catch {}
  })
  // Token-bucket rate limit: 10 msg/sec, burst 20
  ws._bucket = { tokens: 20, last: Date.now(), rate: 10, capacity: 20 }
  function allowMessage() {
    const now = Date.now()
    const delta = (now - ws._bucket.last) / 1000
    ws._bucket.last = now
    ws._bucket.tokens = Math.min(ws._bucket.capacity, ws._bucket.tokens + delta * ws._bucket.rate)
    if (ws._bucket.tokens >= 1) { ws._bucket.tokens -= 1; return true }
    return false
  }
  // Push last announcement on connect
  if (lastAnnouncement) {
    try { ws.send(JSON.stringify({ type: 'announcement', message: lastAnnouncement.message })) } catch {}
  }
  // Push tournaments snapshot on connect
  try { ws.send(JSON.stringify({ type: 'tournaments', tournaments: Array.from(tournaments.values()) })) } catch {}
  // Track presence if client later identifies

  ws.on('message', (msg) => {
    if (typeof msg?.length === 'number' && msg.length > 128 * 1024) return
    if (!allowMessage()) return
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'join') {
        leaveRoom(ws);
        joinRoom(ws, data.roomId);
        ws.send(JSON.stringify({ type: 'joined', roomId: data.roomId, id: ws._id }));
        // Optionally notify others that someone joined (presence will carry details)
        if (ws._roomId) {
          broadcastToRoom(ws._roomId, { type: 'peer-joined', id: ws._id }, ws)
        }
      } else if (data.type === 'state') {
        // Spectators cannot publish state
        if (ws._spectator) return
        // forward game state to others in room
        if (ws._roomId) {
          broadcastToRoom(ws._roomId, { type: 'state', payload: data.payload, from: ws._id }, ws);
          // Celebration hook: if payload indicates a last visit score of 180, broadcast a celebration
          try {
            const p = data?.payload
            // Expect shape similar to client match store: players -> [ { legs: [ { visits: [{ score }] } ] } ] and currentPlayerIdx
            if (p && Array.isArray(p.players) && typeof p.currentPlayerIdx === 'number') {
              const cur = p.players[p.currentPlayerIdx]
              const leg = cur?.legs?.[cur.legs?.length - 1]
              const v = leg?.visits?.[leg.visits?.length - 1]
              if (v && Number(v.score) === 180) {
                celebrations180Total.inc()
                broadcastToRoom(ws._roomId, { type: 'celebration', kind: '180', by: ws._username || `user-${ws._id}`, ts: Date.now() }, null)
              }
              // Leg win celebration: remaining 0 right after a visit
              if (leg && Number(leg.totalScoreRemaining) === 0 && Array.isArray(leg.visits) && leg.visits.length > 0) {
                broadcastToRoom(ws._roomId, { type: 'celebration', kind: 'leg', by: ws._username || `user-${ws._id}`, ts: Date.now() }, null)
              }
            }
          } catch { /* noop */ }
        }
        // mark activity
        if (ws._email && users.has(ws._email)) {
          const u = users.get(ws._email)
          u.lastSeen = Date.now()
          users.set(ws._email, u)
        }
      } else if (data.type === 'presence') {
        ws._username = data.username || `user-${ws._id}`
        ws._email = (data.email || '').toLowerCase()
        if (ws._email) {
          const u = users.get(ws._email) || { email: ws._email, username: ws._username, status: 'online', allowSpectate: true }
          u.username = ws._username
          u.status = 'online'
          u.wsId = ws._id
          u.lastSeen = Date.now()
          if (typeof data.allowSpectate === 'boolean') u.allowSpectate = !!data.allowSpectate
          users.set(ws._email, u)
        }
        if (ws._roomId) {
          broadcastToRoom(ws._roomId, { type: 'presence', id: ws._id, username: data.username }, null)
        }
      } else if (data.type === 'chat') {
        // Optionally block spectator chat
        if (ws._spectator) return
        if (ws._roomId) {
          let raw = String(data.message || '').slice(0, 500)
          let cleanMsg
          try { cleanMsg = profanityFilter.clean(raw) } catch { cleanMsg = raw }
          broadcastToRoom(ws._roomId, { type: 'chat', message: cleanMsg, from: ws._id }, null);
          try { chatMessagesTotal.inc() } catch {}
        }
      } else if (data.type === 'celebration') {
        // Broadcast client-declared celebrations (e.g., leg win) to the room
        if (ws._roomId) {
          const kind = (data.kind === '180' ? '180' : (data.kind === 'leg' ? 'leg' : 'custom'))
          broadcastToRoom(ws._roomId, { type: 'celebration', kind, by: data.by || (ws._username || `user-${ws._id}`), ts: Date.now() }, null)
        }
      } else if (data.type === 'report') {
        // Abuse report from a client for an in-room message or behavior
        const offenderId = typeof data.offenderId === 'string' ? data.offenderId : null
        const reason = String(data.reason || '').slice(0, 300)
        const original = String(data.message || '').slice(0, 500)
        if (!reason) { try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'Reason required.' })) } catch {}; return }
        const rep = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          reporter: (ws._email || ws._username || `user-${ws._id}`).toLowerCase?.() || (ws._username || `user-${ws._id}`),
          offender: offenderId || null,
          reason,
          messageId: null,
          message: original,
          roomId: ws._roomId || null,
          ts: Date.now(),
          status: 'open',
        }
        reports.push(rep)
        // Notify online admins
        for (const s of clients.values()) {
          try {
            const em = (s._email || '').toLowerCase()
            if (adminEmails.has(em)) s.send(JSON.stringify({ type: 'admin-report', report: rep }))
          } catch {}
        }
        try { ws.send(JSON.stringify({ type: 'report-received', id: rep.id })) } catch {}
      } else if (data.type === 'spectate') {
        // Join a room as a spectator (read-only)
        const roomId = String(data.roomId || '')
        if (!roomId) return
        // Check whether any active player in the room disallows spectating
        const set = rooms.get(roomId)
        if (!set || set.size === 0) { try { ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND', message: 'Room not found.' })) } catch {}; return }
        let allowed = true
        for (const peer of set) {
          try {
            if (!peer || peer._spectator) continue
            const em = (peer._email || '').toLowerCase()
            if (em && users.has(em)) {
              const u = users.get(em)
              if (u && u.allowSpectate === false) { allowed = false; break }
            }
          } catch {}
        }
        if (!allowed) { try { ws.send(JSON.stringify({ type: 'error', code: 'SPECTATE_NOT_ALLOWED', message: 'Spectating is disabled by the player.' })) } catch {}; return }
        leaveRoom(ws)
        joinRoom(ws, roomId)
        ws._spectator = true
        try { ws.send(JSON.stringify({ type: 'joined', roomId, id: ws._id, spectator: true })) } catch {}
        if (ws._roomId) {
          broadcastToRoom(ws._roomId, { type: 'peer-joined', id: ws._id, spectator: true }, ws)
        }
        // mark activity
        if (ws._email && users.has(ws._email)) {
          const u = users.get(ws._email)
          u.lastSeen = Date.now()
          users.set(ws._email, u)
        }
      } else if (data.type === 'create-match') {
        // mode: 'bestof'|'firstto', value: number, startingScore?: number
        const premiumGames = ['Around the Clock', 'Cricket', 'Halve It', 'Shanghai', 'High-Low', 'Killer']
        const game = typeof data.game === 'string' ? data.game : 'X01'
        // Server-side premium gating
        if (premiumGames.includes(game) && !subscription.fullAccess) {
          ws.send(JSON.stringify({ type: 'error', code: 'PREMIUM_REQUIRED', message: 'PREMIUM required to create this game.' }))
          return
        }
        const id = nanoid(10)
        const m = {
          id,
          creatorId: ws._id,
          creatorName: ws._username || `user-${ws._id}`,
          mode: data.mode === 'firstto' ? 'firstto' : 'bestof',
          value: Number(data.value) || 1,
          startingScore: Number(data.startingScore) || 501,
          creatorAvg: Number(data.creatorAvg) || 0,
          game,
          requireCalibration: !!data.requireCalibration,
          createdAt: Date.now(),
        }
        matches.set(id, m)
        // Broadcast lobby list to all (pre-stringified)
        const lobbyPayload = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
        for (const client of wss.clients) {
          if (client.readyState === 1) client.send(lobbyPayload)
        }
      } else if (data.type === 'list-matches') {
        ws.send(JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) }))
      } else if (data.type === 'list-tournaments') {
        ws.send(JSON.stringify({ type: 'tournaments', tournaments: Array.from(tournaments.values()) }))
      } else if (data.type === 'join-match') {
        const m = matches.get(data.matchId)
        if (!m) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND', message: 'Match not available.' })) } catch {}
          return
        }
        const premiumGames = ['Around the Clock', 'Cricket', 'Halve It', 'Shanghai', 'High-Low', 'Killer']
        if (premiumGames.includes(m.game) && !subscription.fullAccess) {
          ws.send(JSON.stringify({ type: 'error', code: 'PREMIUM_REQUIRED', message: 'PREMIUM required to join this game.' }))
          return
        }
        // Enforce calibration when required
        if (m.requireCalibration && !data.calibrated) {
          ws.send(JSON.stringify({ type: 'error', code: 'CALIBRATION_REQUIRED', message: 'Calibration required to join this match.' }))
          return
        }
        const creator = clients.get(m.creatorId)
        if (creator && creator.readyState === 1) {
          creator.send(JSON.stringify({
            type: 'invite',
            matchId: m.id,
            fromId: ws._id,
            fromName: ws._username || `user-${ws._id}`,
            calibrated: !!data.calibrated,
            boardPreview: (typeof data.boardPreview === 'string' && data.boardPreview.startsWith('data:image')) ? data.boardPreview : null,
            game: m.game,
            mode: m.mode,
            value: m.value,
            startingScore: m.startingScore,
          }))
        }
      } else if (data.type === 'invite-response') {
        const { matchId, accept, toId } = data
        const m = matches.get(matchId)
        if (!m) return
        const requester = clients.get(toId)
        if (accept) {
          // Start a room using matchId and notify both sides
          const roomId = matchId
          // tell both clients to join this room
          const creator = clients.get(m.creatorId)
          const payload = { type: 'match-start', roomId, match: m }
          if (creator && creator.readyState === 1) creator.send(JSON.stringify(payload))
          if (requester && requester.readyState === 1) requester.send(JSON.stringify(payload))
          matches.delete(matchId)
          // Mark both players as in-game and store match metadata for friends list
          try {
            const creatorEmail = creator?._email || ''
            const requesterEmail = requester?._email || ''
            if (creatorEmail) {
              const u = users.get(creatorEmail) || { email: creatorEmail, username: creator?._username || creatorEmail, status: 'online' }
              u.status = 'ingame'; u.lastSeen = Date.now();
              u.currentRoomId = roomId; u.currentMatch = { game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore }
              users.set(creatorEmail, u)
            }
            if (requesterEmail) {
              const u2 = users.get(requesterEmail) || { email: requesterEmail, username: requester?._username || requesterEmail, status: 'online' }
              u2.status = 'ingame'; u2.lastSeen = Date.now();
              u2.currentRoomId = roomId; u2.currentMatch = { game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore }
              users.set(requesterEmail, u2)
            }
          } catch {}
        } else {
          if (requester && requester.readyState === 1) requester.send(JSON.stringify({ type: 'declined', matchId }))
          matches.delete(matchId)
        }
        // Broadcast updated lobby
        const lobbyPayload2 = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
        for (const client of wss.clients) {
          if (client.readyState === 1) client.send(lobbyPayload2)
        }
      } else if (data.type === 'cancel-match') {
        const id = String(data.matchId || '')
        const m = matches.get(id)
        if (!m) return
        // Only the creator may cancel
        if (m.creatorId !== ws._id) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only the creator can cancel this match.' })) } catch {}
          return
        }
        matches.delete(id)
        const lobbyPayload = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
        for (const client of wss.clients) {
          if (client.readyState === 1) client.send(lobbyPayload)
        }
      } else if (data.type === 'cam-create') {
        // Desktop requests a 4-letter pairing code
        const code = genCamCode()
        camSessions.set(code, { code, desktopId: ws._id, phoneId: null, ts: Date.now() })
        try { ws.send(JSON.stringify({ type: 'cam-code', code, expiresAt: Date.now() + CAM_TTL_MS })) } catch {}
      } else if (data.type === 'cam-join') {
        // Phone joins with code
        const code = String(data.code || '').toUpperCase()
        const sess = camSessions.get(code)
        if (!sess) { try { ws.send(JSON.stringify({ type: 'cam-error', code: 'INVALID_CODE' })) } catch {}; return }
        // Expire stale codes
        if (sess.ts && (Date.now() - sess.ts) > CAM_TTL_MS) { camSessions.delete(code); try { ws.send(JSON.stringify({ type: 'cam-error', code: 'EXPIRED' })) } catch {}; return }
        sess.phoneId = ws._id
        camSessions.set(code, sess)
        const desktop = clients.get(sess.desktopId)
        if (desktop && desktop.readyState === 1) desktop.send(JSON.stringify({ type: 'cam-peer-joined', code }))
        try { ws.send(JSON.stringify({ type: 'cam-joined', code })) } catch {}
      } else if (data.type === 'cam-offer' || data.type === 'cam-answer' || data.type === 'cam-ice') {
        const code = String(data.code || '').toUpperCase()
        const sess = camSessions.get(code)
        if (!sess) return
        const targetId = (data.type === 'cam-offer') ? sess.desktopId : sess.phoneId
        const target = clients.get(targetId)
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ type: data.type, code, payload: data.payload }))
        }
      } else if (data.type === 'start-friend-match') {
        const toEmail = String(data.toEmail || '').toLowerCase()
        const game = typeof data.game === 'string' ? data.game : 'X01'
        const mode = (data.mode === 'firstto') ? 'firstto' : 'bestof'
        const value = Number(data.value) || 1
        const startingScore = Number(data.startingScore) || 501
  const premiumGames = ['Around the Clock', 'Cricket', 'Halve It', 'Shanghai', 'High-Low', 'Killer']
        // Server-side premium gating (demo-global)
        if (premiumGames.includes(game) && !subscription.fullAccess) {
          ws.send(JSON.stringify({ type: 'error', code: 'PREMIUM_REQUIRED', message: 'PREMIUM required to start this game.' }))
          return
        }
        if (!ws._email || !toEmail) return
        const toUser = users.get(toEmail)
        if (!toUser || !toUser.wsId) {
          ws.send(JSON.stringify({ type: 'error', code: 'USER_OFFLINE', message: 'Friend is offline.' }))
          return
        }
        const target = clients.get(toUser.wsId)
        if (!target || target.readyState !== 1) {
          ws.send(JSON.stringify({ type: 'error', code: 'USER_OFFLINE', message: 'Friend is offline.' }))
          return
        }
        const roomId = nanoid(10)
        const m = {
          id: roomId,
          creatorId: ws._id,
          creatorName: ws._username || `user-${ws._id}`,
          mode,
          value,
          startingScore,
          creatorAvg: 0,
          game,
          createdAt: Date.now(),
        }
        const payload = { type: 'match-start', roomId, match: m }
        try { if (ws.readyState === 1) ws.send(JSON.stringify(payload)) } catch {}
        try { if (target.readyState === 1) target.send(JSON.stringify(payload)) } catch {}
        // Mark both players as in-game and store match metadata
        try {
          const meEmail = ws._email || ''
          const toEmailReal = toEmail || ''
          if (meEmail) {
            const u = users.get(meEmail) || { email: meEmail, username: ws._username || meEmail, status: 'online' }
            u.status = 'ingame'; u.lastSeen = Date.now();
            u.currentRoomId = roomId; u.currentMatch = { game, mode, value, startingScore }
            users.set(meEmail, u)
          }
          if (toEmailReal) {
            const u2 = users.get(toEmailReal) || { email: toEmailReal, username: users.get(toEmailReal)?.username || toEmailReal, status: 'online' }
            u2.status = 'ingame'; u2.lastSeen = Date.now();
            u2.currentRoomId = roomId; u2.currentMatch = { game, mode, value, startingScore }
            users.set(toEmailReal, u2)
          }
        } catch {}
      }
    } catch (e) {
      try { errorsTotal.inc({ scope: 'ws_message' }) } catch {}
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', (code, reasonBuf) => {
    const reason = (() => { try { return reasonBuf ? reasonBuf.toString() : '' } catch { return '' } })()
    try { console.log(`[WS] close id=${ws._id} code=${code} reason=${reason}`) } catch {}
    // Clean up room
    leaveRoom(ws);
    try { wsConnections.dec() } catch {}
    // Remove any matches created by this client
    for (const [id, m] of Array.from(matches.entries())) {
      if (m.creatorId === ws._id) matches.delete(id)
    }
    clients.delete(ws._id)
    // Cleanup camera sessions involving this client
    for (const [code, sess] of Array.from(camSessions.entries())) {
      if (sess.desktopId === ws._id || sess.phoneId === ws._id) camSessions.delete(code)
    }
    if (ws._email && users.has(ws._email)) {
      const u = users.get(ws._email)
      if (u && u.wsId === ws._id) {
        u.status = 'offline'
        u.lastSeen = Date.now()
        u.wsId = undefined
        users.set(ws._email, u)
      }
    }
    // Broadcast updated lobby
    const lobbyPayload3 = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(lobbyPayload3)
    }
    // Cleanup any camera sessions involving this client
    for (const [code, sess] of Array.from(camSessions.entries())) {
      if (sess.desktopId === ws._id || sess.phoneId === ws._id) camSessions.delete(code)
    }
  });
});

// Friends HTTP API (demo)
app.get('/api/friends/list', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  const set = friendships.get(email) || new Set()
  const list = Array.from(set).map(e => {
    const u = users.get(e) || { email: e, username: e, status: 'offline' }
    return { email: e, username: u.username, status: u.status, lastSeen: u.lastSeen, roomId: u.currentRoomId || null, match: u.currentMatch || null }
  })
  res.json({ ok: true, friends: list })
})

// Heartbeat sweep to terminate dead sockets
const HEARTBEAT_INTERVAL = 30000
const hbTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      try { ws.terminate() } catch {}
      continue
    }
    ws.isAlive = false
    try { ws.ping() } catch {}
  }
  // Clean up expired camera sessions
  const now = Date.now()
  for (const [code, sess] of camSessions.entries()) {
    if (now - (sess.ts || 0) > CAM_TTL_MS) camSessions.delete(code)
  }
}, HEARTBEAT_INTERVAL)

function shutdown() {
  console.log('\n[Shutdown] closing servers...')
  try { clearInterval(hbTimer) } catch {}
  try { wss.close() } catch {}
  try { server.close(() => process.exit(0)) } catch { process.exit(0) }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

app.get('/api/friends/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase()
  const results = []
  for (const [e, u] of users.entries()) {
    if (!q || e.includes(q) || (u.username||'').toLowerCase().includes(q)) results.push({ email: e, username: u.username, status: u.status, lastSeen: u.lastSeen })
    if (results.length >= 20) break
  }
  res.json({ ok: true, results })
})

app.get('/api/friends/suggested', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  const set = friendships.get(email) || new Set()
  const suggestions = []
  for (const [e, u] of users.entries()) {
    if (e !== email && !set.has(e)) suggestions.push({ email: e, username: u.username, status: u.status, lastSeen: u.lastSeen })
    if (suggestions.length >= 10) break
  }
  res.json({ ok: true, suggestions })
})

app.post('/api/friends/add', (req, res) => {
  const { email, friend } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(friend || '').toLowerCase()
  if (!me || !other || me === other) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const set = friendships.get(me) || new Set()
  set.add(other)
  friendships.set(me, set)
  saveFriendships()
  res.json({ ok: true })
})

app.post('/api/friends/remove', (req, res) => {
  const { email, friend } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(friend || '').toLowerCase()
  const set = friendships.get(me)
  if (set) set.delete(other)
  saveFriendships()
  res.json({ ok: true })
})

// Send a simple invite via WS if recipient is online
app.post('/api/friends/invite', (req, res) => {
  const { fromEmail, toEmail, game, mode, value, startingScore } = req.body || {}
  const to = String(toEmail || '').toLowerCase()
  const from = String(fromEmail || '').toLowerCase()
  if (!to || !from) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const u = users.get(to)
  if (u && u.wsId) {
    const target = clients.get(u.wsId)
    if (target && target.readyState === 1) {
      target.send(JSON.stringify({ type: 'friend-invite', fromEmail: from, fromName: (users.get(from)?.username || from), game: game || 'X01', mode: mode || 'bestof', value: Number(value)||3, startingScore: Number(startingScore)||501 }))
      return res.json({ ok: true, delivered: true })
    }
  }
  res.json({ ok: true, delivered: false })
})

// Simple message stub; deliver if online and store
app.post('/api/friends/message', (req, res) => {
  const { fromEmail, toEmail, message } = req.body || {}
  const to = String(toEmail || '').toLowerCase()
  const from = String(fromEmail || '').toLowerCase()
  let raw = String(message || '').slice(0, 500)
  if (!to || !from || !raw) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  let msg
  try { msg = profanityFilter.clean(raw) } catch { msg = raw }
  const arr = messages.get(to) || []
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, from, message: msg, ts: Date.now() }
  arr.push(item)
  messages.set(to, arr)
  // Try deliver via WS if recipient online
  const u = users.get(to)
  if (u && u.wsId) {
    const target = clients.get(u.wsId)
    if (target && target.readyState === 1) {
      target.send(JSON.stringify({ type: 'friend-message', from, message: msg, ts: item.ts, id: item.id }))
    }
  }
  res.json({ ok: true, delivered: !!(u && u.wsId) })
})

// Fetch recent inbox messages
app.get('/api/friends/messages', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const arr = messages.get(email) || []
  res.json({ ok: true, messages: arr.slice(-200).sort((a,b)=>b.ts-a.ts) })
})

// Report bad behavior or a specific message
app.post('/api/friends/report', (req, res) => {
  const { reporterEmail, offenderEmail, reason, messageId } = req.body || {}
  const reporter = String(reporterEmail || '').toLowerCase()
  const offender = String(offenderEmail || '').toLowerCase()
  const why = String(reason || '').slice(0, 300)
  if (!reporter || !offender || !why) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const rep = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, reporter, offender, reason: why, messageId: messageId ? String(messageId) : null, ts: Date.now(), status: 'open' }
  reports.push(rep)
  // Notify online admins
  for (const ws of clients.values()) {
    try {
      const em = (ws._email || '').toLowerCase()
      if (adminEmails.has(em)) ws.send(JSON.stringify({ type: 'admin-report', report: rep }))
    } catch {}
  }
  res.json({ ok: true, id: rep.id })
})

// Admin: list reports
app.get('/api/admin/reports', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, reports })
})

// Admin: resolve/act on a report
app.post('/api/admin/reports/resolve', (req, res) => {
  const { id, action, notes, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const idx = reports.findIndex(r => r.id === id)
  if (idx === -1) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  reports[idx].status = String(action || 'resolved')
  reports[idx].notes = String(notes || '')
  res.json({ ok: true, report: reports[idx] })
})

// Wallet API (demo, not secure)
app.get('/api/wallet/balance', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const w = wallets.get(email) || { email, balances: {} }
  res.json({ ok: true, wallet: w })
})

// Wallet: get linked payout method (brand + last4)
app.get('/api/wallet/payout-method', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const m = payoutMethods.get(email) || null
  res.json({ ok: true, method: m })
})

// Wallet: link/update payout method (store non-sensitive brand + last4 for display only)
app.post('/api/wallet/link-card', (req, res) => {
  const { email, brand, last4 } = req.body || {}
  const addr = String(email || '').toLowerCase()
  const b = String(brand || '').trim()
  const l4 = String(last4 || '').trim()
  if (!addr || !b || !l4 || !/^\d{4}$/.test(l4)) {
    return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  }
  payoutMethods.set(addr, { brand: b, last4: l4, addedAt: Date.now() })
  res.json({ ok: true, method: payoutMethods.get(addr) })
})

app.post('/api/wallet/withdraw', (req, res) => {
  const { email, currency, amount } = req.body || {}
  const addr = String(email || '').toLowerCase()
  const curr = String(currency || 'USD').toUpperCase()
  const amt = Math.round(Number(amount) * 100)
  if (!addr || !curr || !Number.isFinite(amt) || amt <= 0) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const w = wallets.get(addr)
  if (!w || (w.balances[curr]||0) < amt) return res.status(400).json({ ok: false, error: 'INSUFFICIENT_FUNDS' })
  const id = nanoid(10)
  const method = payoutMethods.get(addr)
  // If a payout method is linked, debit and mark as paid instantly
  if (method) {
    const ok = debitWallet(addr, curr, amt)
    if (!ok) return res.status(400).json({ ok: false, error: 'INSUFFICIENT_FUNDS' })
    const item = { id, email: addr, currency: curr, amountCents: amt, status: 'paid', requestedAt: Date.now(), decidedAt: Date.now(), notes: `Paid to ${method.brand} ÔÇóÔÇóÔÇóÔÇó ${method.last4}` }
    withdrawals.set(id, item)
    return res.json({ ok: true, request: item, paid: true, method })
  }
  // Otherwise, create a pending request for admin review
  const item = { id, email: addr, currency: curr, amountCents: amt, status: 'pending', requestedAt: Date.now() }
  withdrawals.set(id, item)
  res.json({ ok: true, request: item, paid: false })
})

// Admin: list withdrawals
app.get('/api/admin/wallet/withdrawals', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, withdrawals: Array.from(withdrawals.values()) })
})

// Admin: decide withdrawal (approve or reject)
app.post('/api/admin/wallet/withdrawals/decide', (req, res) => {
  const { id, approve, notes, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const item = withdrawals.get(String(id||''))
  if (!item) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (item.status !== 'pending') return res.status(400).json({ ok: false, error: 'ALREADY_DECIDED' })
  item.decidedAt = Date.now()
  item.notes = String(notes || '')
  if (approve) {
    // debit wallet now
    const ok = debitWallet(item.email, item.currency, item.amountCents)
    if (!ok) return res.status(400).json({ ok: false, error: 'INSUFFICIENT_FUNDS' })
    item.status = 'paid'
  } else {
    item.status = 'rejected'
  }
  withdrawals.set(item.id, item)
  res.json({ ok: true, withdrawal: item })
})

// Admin: credit a user's wallet (owner-only; currency amount in major units or cents?)
app.post('/api/admin/wallet/credit', (req, res) => {
  const { email, currency, amountCents, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const addr = String(email || '').toLowerCase()
  const cur = String(currency || 'GBP').toUpperCase()
  const cents = Math.round(Number(amountCents))
  if (!addr || !cur || !Number.isFinite(cents) || cents <= 0) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  creditWallet(addr, cur, cents)
  const w = wallets.get(addr) || { email: addr, balances: {} }
  res.json({ ok: true, wallet: w })
})

// WS heartbeat interval to drop dead peers (moved earlier; keep single definition)

// Tournaments HTTP API (demo)
app.get('/api/tournaments', (req, res) => {
  res.json({ ok: true, tournaments: Array.from(tournaments.values()) })
})

app.post('/api/tournaments/create', (req, res) => {
  const { title, game, mode, value, description, startAt, checkinMinutes, capacity, startingScore, creatorEmail, creatorName, official, prizeType, prizeAmount, currency, prizeNotes, entryFee, requesterEmail } = req.body || {}
  const id = nanoid(10)
  // Only the owner can create "official" tournaments or set prize metadata
  const isOwner = String(requesterEmail || '').toLowerCase() === OWNER_EMAIL
  const isOfficial = !!official && isOwner
  // Only owner can create money tournaments (entryFee > 0) or premium tournaments
  const canCreateMoneyTournament = isOwner && Number(entryFee) > 0
  const canCreatePremiumTournament = isOwner
  // Normalize prize metadata
  const pType = isOfficial ? (prizeType === 'cash' ? 'cash' : 'premium') : 'none'
  const amount = (pType === 'cash' && isOwner) ? Math.max(0, Number(prizeAmount) || 0) : 0
  const curr = (pType === 'cash' && isOwner) ? (String(currency || 'GBP').toUpperCase()) : undefined
  const notes = (isOwner && typeof prizeNotes === 'string') ? prizeNotes : ''
  const fee = (canCreateMoneyTournament && Number(entryFee) > 0) ? Math.max(0, Number(entryFee)) : 0
  const t = {
    id,
    title: String(title || 'Community Tournament'),
    game: typeof game === 'string' ? game : 'X01',
    mode: (mode === 'firstto' ? 'firstto' : 'bestof'),
    value: Number(value) || 1,
    description: String(description || ''),
    startAt: Number(startAt) || (Date.now() + 60*60*1000),
    checkinMinutes: Math.max(0, Number(checkinMinutes) || 30),
    capacity: Math.min(64, Math.max(6, Number(capacity) || 8)),
  participants: [],
    official: isOfficial,
    prize: isOfficial ? (pType !== 'none') : false,
    prizeType: pType,
    prizeAmount: amount || undefined,
    currency: curr,
    payoutStatus: pType === 'cash' ? 'none' : 'none',
    prizeNotes: notes,
    entryFee: fee, // Entry fee in cents
    prizeFund: 0, // Total collected prize fund in cents
    status: 'scheduled',
    winnerEmail: null,
    creatorEmail: String(creatorEmail || ''),
    creatorName: String(creatorName || ''),
    createdAt: Date.now(),
    startingScore: (typeof startingScore === 'number' && startingScore>0) ? Math.floor(startingScore) : (String(game)==='X01' ? 501 : undefined),
  }
  tournaments.set(id, t)
  broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

app.post('/api/tournaments/join', (req, res) => {
  const { tournamentId, email, username } = req.body || {}
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  const addr = String(email || '').toLowerCase()
  if (!addr) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  // Winners cooldown: if official tournament and user has an active premium grant, block until expiry
  if (t.official && premiumWinners.has(addr)) {
    const exp = premiumWinners.get(addr)
    if (exp && exp > Date.now()) {
      return res.status(403).json({ ok: false, error: 'WINNER_COOLDOWN', until: exp, message: 'Recent winners must wait until their premium month expires before re-entering.' })
    }
  }
  const already = t.participants.find(p => p.email === addr)
  if (already) return res.json({ ok: true, joined: false, already: true, tournament: t })
  if (t.participants.length >= t.capacity) return res.status(400).json({ ok: false, error: 'FULL' })
  
  // Check entry fee payment for money tournaments
  if (t.entryFee > 0) {
    const currency = t.currency || 'GBP'
    const w = wallets.get(addr)
    const balance = w ? (w.balances[currency] || 0) : 0
    if (balance < t.entryFee) {
      return res.status(400).json({ ok: false, error: 'INSUFFICIENT_FUNDS', required: t.entryFee, balance, currency })
    }
    // Deduct entry fee and add to prize fund
    debitWallet(addr, currency, t.entryFee)
    t.prizeFund = (t.prizeFund || 0) + t.entryFee
  }
  
  t.participants.push({ email: addr, username: String(username || addr) })
  broadcastTournaments()
  res.json({ ok: true, joined: true, tournament: t })
})

// Leave a tournament (only allowed before it starts)
app.post('/api/tournaments/leave', (req, res) => {
  const { tournamentId, email } = req.body || {}
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  const addr = String(email || '').toLowerCase()
  if (!addr) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const before = t.participants.length
  t.participants = t.participants.filter(p => p.email !== addr)
  const left = t.participants.length < before
  if (left) broadcastTournaments()
  res.json({ ok: true, left, tournament: t })
})

// Owner-only: set winner and grant prize (official ones only grant prize)
app.post('/api/admin/tournaments/winner', (req, res) => {
  const { tournamentId, winnerEmail, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  t.status = 'completed'
  t.winnerEmail = String(winnerEmail || '').toLowerCase()
  if (t.official) {
    if (t.prizeType === 'cash') {
      // mark payout required; manual processing for now
      t.payoutStatus = 'pending'
      // credit winner's in-app wallet balance (store in cents)
      if (t.currency && typeof t.prizeAmount === 'number' && t.prizeAmount > 0 && t.winnerEmail) {
        creditWallet(t.winnerEmail, t.currency, Math.round(t.prizeAmount * 100))
      }
    } else {
      // default premium prize
      const ONE_MONTH = 30 * 24 * 60 * 60 * 1000
      premiumWinners.set(t.winnerEmail, Date.now() + ONE_MONTH)
      t.payoutStatus = 'none'
    }
  }
  broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

// Admin: list tournaments (owner only)
app.get('/api/admin/tournaments', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, tournaments: Array.from(tournaments.values()) })
})

// Admin: update tournament fields (owner only)
app.post('/api/admin/tournaments/update', (req, res) => {
  const { tournamentId, patch, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  const allowed = ['title','game','mode','value','description','startAt','checkinMinutes','capacity','status','prizeType','prizeAmount','currency','prizeNotes','startingScore']
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      t[k] = patch[k]
    }
  }
  tournaments.set(t.id, t)
  broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

// Admin: delete tournament
app.post('/api/admin/tournaments/delete', (req, res) => {
  const { tournamentId, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const id = String(tournamentId || '')
  const t = tournaments.get(id)
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  // Mark suppression window if official
  if (t.official) lastOfficialDeleteAt = Date.now()
  tournaments.delete(id)
  broadcastTournaments()
  res.json({ ok: true })
})

// User: delete own tournament (only if scheduled and creator)
app.post('/api/tournaments/delete', (req, res) => {
  const { tournamentId, requesterEmail } = req.body || {}
  const id = String(tournamentId || '')
  const reqEmail = String(requesterEmail || '').toLowerCase()
  const t = tournaments.get(id)
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  // Only allowed if tournament is not started yet
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  // Permission: creator or owner can delete
  const isOwner = reqEmail === OWNER_EMAIL
  const isCreator = reqEmail && t.creatorEmail && reqEmail === String(t.creatorEmail).toLowerCase()
  if (!isOwner && !isCreator) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  if (t.official) lastOfficialDeleteAt = Date.now()
  tournaments.delete(id)
  broadcastTournaments()
  res.json({ ok: true })
})

// Admin: mark prize paid (for cash prize)
app.post('/api/admin/tournaments/mark-paid', (req, res) => {
  const { tournamentId, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.prizeType !== 'cash') return res.status(400).json({ ok: false, error: 'NOT_CASH_PRIZE' })
  t.payoutStatus = 'paid'
  t.paidAt = Date.now()
  tournaments.set(t.id, t)
  broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

// Admin: reseed weekly official tournament
app.post('/api/admin/tournaments/reseed-weekly', (req, res) => {
  const { requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  ensureOfficialWeekly()
  res.json({ ok: true })
})

// Seed/ensure an official weekly tournament
function getNextFridayAt1945(nowMs) {
  const now = new Date(nowMs)
  const day = now.getDay() // 0 Sun .. 6 Sat
  // Base target is this week's Friday at 19:45
  const thisFriday = new Date(now)
  const diffToFriday = (5 - day + 7) % 7
  thisFriday.setDate(now.getDate() + diffToFriday)
  thisFriday.setHours(19, 45, 0, 0)
  if (diffToFriday === 0) {
    // Today is Friday; if time not passed, use today, else push a week
    if (now.getTime() <= thisFriday.getTime()) return thisFriday.getTime()
    const next = new Date(thisFriday.getTime() + 7*24*60*60*1000)
    return next.getTime()
  }
  return thisFriday.getTime()
}

function ensureOfficialWeekly() {
  const now = Date.now()
  // We want at least one scheduled official tournament in the future (for early enrollment)
  const upcoming = Array.from(tournaments.values()).filter(t => t.official && t.status === 'scheduled')
  if (upcoming.length === 0) {
    // Schedule the next Friday at 19:45
    const id = nanoid(10)
    const t = {
      id,
      title: 'NDN Premium Winner Giveaway',
      game: 'X01',
      mode: 'bestof',
      value: 3,
      description: 'Official weekly tournament ÔÇö every Friday at 19:45. Max 32, starts with 8+. Winner earns 1 month PREMIUM.',
      startAt: getNextFridayAt1945(now),
      checkinMinutes: 30,
      capacity: 32,
      participants: [],
      official: true,
      prize: true,
      prizeType: 'premium',
      payoutStatus: 'none',
      status: 'scheduled',
      winnerEmail: null,
      createdAt: Date.now(),
      startingScore: 501,
    }
    tournaments.set(id, t)
    broadcastTournaments()
  } else {
    // If there is a scheduled official tournament but it's sooner than the coming Friday (edge), ensure there's also one for the following Friday for early enrollment window
    const nextStart = getNextFridayAt1945(now)
    const hasNext = upcoming.some(t => t.startAt === nextStart)
    if (!hasNext) {
      const id2 = nanoid(10)
      const t2 = {
        id: id2,
        title: 'NDN Premium Winner Giveaway',
        game: 'X01',
        mode: 'bestof',
        value: 3,
        description: 'Official weekly tournament ÔÇö every Friday at 19:45. Max 32, starts with 8+. Winner earns 1 month PREMIUM.',
        startAt: nextStart,
        checkinMinutes: 30,
        capacity: 32,
        participants: [],
        official: true,
        prize: true,
        prizeType: 'premium',
        payoutStatus: 'none',
        status: 'scheduled',
        winnerEmail: null,
        createdAt: Date.now(),
        startingScore: 501,
      }
      tournaments.set(id2, t2)
      broadcastTournaments()
    }
  }
}

ensureOfficialWeekly()

// Simple scheduler for reminders and start triggers
let lastOfficialDeleteAt = 0
const OFFICIAL_RESEED_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes after a manual delete, do not reseed
setInterval(() => {
  const now = Date.now()
  for (const t of tournaments.values()) {
    if (t.status === 'scheduled') {
      // Reminder window
      const remindAt = t.startAt - (t.checkinMinutes * 60 * 1000)
      if (!t._reminded && now >= remindAt && now < t.startAt) {
        t._reminded = true
        broadcastAll({ type: 'tournament-reminder', tournamentId: t.id, title: t.title, startAt: t.startAt, message: `Only ${t.checkinMinutes} minutes to go until the ${t.title} is live ÔÇö check in ready or lose your spot at 19:45!` })
      }
      // Start condition at start time with min participants 8 (for official) or 2 otherwise
      const minPlayers = t.official ? 8 : 2
      if (now >= t.startAt && t.participants.length >= minPlayers) {
        t.status = 'running'
        broadcastAll({ type: 'tournament-start', tournamentId: t.id, title: t.title })
      }
      // If startAt passed and not enough players, leave scheduled; owner can adjust later
    }
  }
  // Continuously ensure next week's official tournament remains seeded for early enrollment
  if ((now - lastOfficialDeleteAt) > OFFICIAL_RESEED_COOLDOWN_MS) {
    ensureOfficialWeekly()
  }
}, 30 * 1000)
