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
const EmailTemplates = require('./emails/templates.js');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');
const client = require('prom-client');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Allow overridable CLI flags for testing convenience: --data-dir <path>, --debug, --port <num>, --log-level <level>
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--data-dir' && argv[i+1]) { process.env.NDN_DATA_DIR = argv[i+1]; i++ }
  if (argv[i] === '--debug') { process.env.NDN_DEBUG = '1' }
  if (argv[i] === '--port' && argv[i+1]) { process.env.PORT = argv[i+1]; i++ }
  if (argv[i] === '--log-level' && argv[i+1]) { process.env.NDN_LOG_LEVEL = argv[i+1]; i++ }
}
const PORT = process.env.PORT || 8787;
const DEBUG = String(process.env.NDN_DEBUG || '').toLowerCase() === '1'
const DATA_DIR = process.env.NDN_DATA_DIR ? path.resolve(process.env.NDN_DATA_DIR) : path.join(__dirname, 'data')
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
// Track HTTPS runtime status and port
let HTTPS_ACTIVE = false
let HTTPS_PORT = Number(process.env.HTTPS_PORT || 8788)
const app = express();

// Prestart duration (seconds) used between acceptance and match start (clients will show pregame stats)
const PRESTART_SECONDS = Number(process.env.PRESTART_SECONDS) || 20;

// Keep a map of invite timers to auto-expire join invites sent via join-match
const inviteTimers = new Map();

// Pending prestart sessions keyed by roomId
const pendingPrestarts = new Map();
// Per-room server-side autocommit permission (roomId -> boolean)
const roomAutocommitAllowed = new Map();
// Track room creator id so allow host-only operations
const roomCreator = new Map();

// Board radii in mm (duplicate of vision constants to validate client pBoard coords)
const BoardRadii = {
  bullInner: 6.35,
  bullOuter: 15.9,
  trebleInner: 99,
  trebleOuter: 107,
  doubleInner: 162,
  doubleOuter: 170,
};

const SectorOrder = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];

function scoreAtBoardPoint(p) {
  const r = Math.hypot(p.x, p.y);
  let ang = Math.atan2(p.y, p.x);
  let deg = (ang * 180) / Math.PI;
  deg = (deg + 360 + 90) % 360; // 0 at top
  const sector = SectorOrder[Math.floor(deg / 18)];
  if (r <= BoardRadii.bullInner) return { base: 50, ring: 'INNER_BULL', sector: 25, mult: 2 };
  if (r <= BoardRadii.bullOuter) return { base: 25, ring: 'BULL', sector: 25, mult: 1 };
  if (r >= BoardRadii.doubleOuter) return { base: 0, ring: 'MISS', sector: null, mult: 0 };
  if (r >= BoardRadii.doubleInner) return { base: sector * 2, ring: 'DOUBLE', sector: sector, mult: 2 };
  if (r >= BoardRadii.trebleOuter) return { base: sector, ring: 'SINGLE', sector: sector, mult: 1 };
  if (r >= BoardRadii.trebleInner) return { base: sector * 3, ring: 'TRIPLE', sector: sector, mult: 3 };
  return { base: sector, ring: 'SINGLE', sector: sector, mult: 1 };
}

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? (() => {
  try {
    return createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    startLogger.error('[DB] Failed to create Supabase client: %s', err.message);
    return null;
  }
})() : null;

if (!supabase) {
  startLogger.warn('[DB] Supabase not configured - using in-memory storage only');
}

// Initialize Redis for cross-server session management
const { Redis } = require('@upstash/redis');

// DEBUG: Check if REDIS_URL is set
const startLogger = pino({ level: DEBUG ? 'debug' : (process.env.NDN_LOG_LEVEL || 'info') })
startLogger.debug('🔍 DEBUG: REDIS_URL exists: %s', !!process.env.REDIS_URL);
if (process.env.REDIS_URL) {
  startLogger.debug('🔍 DEBUG: REDIS_URL starts with: %s...', process.env.REDIS_URL.substring(0, 20));
}

const redisClient = process.env.REDIS_URL ? (() => {
  try {
    return new Redis({ url: process.env.REDIS_URL });
  } catch (err) {
  startLogger.error('[REDIS] Failed to create client:', err.message);
    return null;
  }
})() : null;

if (redisClient) {
  startLogger.info('[REDIS] Upstash Redis client initialized');
} else {
  startLogger.warn('[REDIS] Not configured - using in-memory storage for sessions');
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

// Redis helper functions for cross-server session management
const redisHelpers = {
  // User sessions (shared across servers)
  async setUserSession(email, sessionData) {
    if (!redisClient) return;
    await redisClient.set(`user:${email}`, JSON.stringify(sessionData), { ex: 3600 }); // 1 hour expiry
  },

  async getUserSession(email) {
    if (!redisClient) return null;
    const data = await redisClient.get(`user:${email}`);
    return data ? JSON.parse(data) : null;
  },

  async deleteUserSession(email) {
    if (!redisClient) return;
    await redisClient.del(`user:${email}`);
  },

  // Room memberships (shared across servers)
  async addUserToRoom(roomId, userEmail, userData) {
    if (!redisClient) return;
    await redisClient.sadd(`room:${roomId}:members`, userEmail);
    await redisClient.hset(`room:${roomId}:memberData`, userEmail, JSON.stringify(userData));
  },

  async removeUserFromRoom(roomId, userEmail) {
    if (!redisClient) return;
    await redisClient.srem(`room:${roomId}:members`, userEmail);
    await redisClient.hdel(`room:${roomId}:memberData`, userEmail);
  },

  async getRoomMembers(roomId) {
    if (!redisClient) return [];
    const members = await redisClient.smembers(`room:${roomId}:members`);
    const memberData = [];
    for (const email of members) {
      const data = await redisClient.hget(`room:${roomId}:memberData`, email);
      if (data) memberData.push(JSON.parse(data));
    }
    return memberData;
  }
};

// Security & performance
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors())
app.use(compression())
// Global rate limiter: more generous for free-tier Render (100 req/min per IP)
const limiter = rateLimit({ 
  windowMs: 60 * 1000,  // 1 minute window
  max: 100,             // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and metrics
    return req.path === '/readyz' || req.path === '/metrics'
  }
})
// Stricter limiter for auth endpoints (10 req/min per IP to prevent brute force)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
})
// More permissive limiter for API endpoints (300 req/min per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
})
// Parse authentication on each request - sets req.user if possible
app.use(parseAuth);
app.use(limiter)
// Apply auth limiter to auth endpoints
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/login', authLimiter);
// Apply API limiter to other endpoints
app.use('/api/', apiLimiter);
// Logging
// Reuse the early startLogger so logging is consistent before/after app initialization
const logger = startLogger
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
app.use(express.static('./public'))
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
  logger.info(`[SPA] Serving static frontend from ${staticBase}`)
} else {
  logger.warn('[SPA] No built frontend found at ../dist or ../app/dist; "/" will 404 (API+WS OK).')
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
  startLogger.error('[DB] Failed to save user to Supabase:', error);
        return res.status(500).json({ error: 'Failed to create account.' });
      }
    }

    // Also store in memory for current session
    users.set(email, user)

    // Create JWT token
    const token = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '100y' });
    return res.json({ user, token })
  } catch (error) {
  startLogger.error('[SIGNUP] Error:', error);
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
  startLogger.error('[DB] Supabase login error:', error);
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
  startLogger.error('[LOGIN] Error:', error);
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
// Server notifications: email -> Array<notification>
// notification: { id, email, message, type, read, createdAt, meta }
const notifications = new Map();
// In-memory admin store (demo)
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'daviesfamily108@gmail.com').toLowerCase();
const adminEmails = new Set([OWNER_EMAIL])

// Admin API key (cluster/op key) for server-to-server operations. Keep secret in env.
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Middleware: parse auth header, set req.user with { email, username, isAdmin }
function parseAuth(req, res, next) {
  try {
    const auth = String(req.headers.authorization || '').trim();
    // Support x-api-key as admin key header
    const apiKey = String(req.headers['x-api-key'] || '').trim();
    if (apiKey && ADMIN_API_KEY && apiKey === ADMIN_API_KEY) {
      req.user = { email: OWNER_EMAIL, username: OWNER_EMAIL, isAdmin: true, adminApiKey: true };
      return next();
    }
    if (!auth) return next();
    const parts = auth.split(' ');
    if (parts.length !== 2) return next();
    const scheme = parts[0];
    const token = parts[1];
    if (scheme.toLowerCase() === 'bearer' && token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const email = (decoded && decoded.email) ? String(decoded.email).toLowerCase() : null;
        const username = (decoded && decoded.username) ? String(decoded.username) : null;
        const isAdmin = email ? adminEmails.has(email) : false;
        req.user = { email, username, isAdmin, tokenDecoded: decoded };
      } catch (e) {
        // invalid token - ignore, continue as unauthenticated
      }
    }
  } catch (err) {
    // ignore
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.user || !req.user.email) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
  return next();
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) return next();
  return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
}

function requireSelfOrAdminForEmail(targetEmail) {
  return function (req, res, next) {
    const emailParam = targetEmail(req);
    if (!emailParam) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' });
    const email = String(emailParam || '').toLowerCase();
    if (req.user && (req.user.isAdmin || req.user.email === email)) return next();
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  };
}
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
      startLogger.error('[DB] Error fetching subscription:', err);
    }
  }

  res.json({ fullAccess: false });
});

// Notifications endpoints (demo): persist in-memory. If Supabase is configured,
// attempt to persist there as well to survive restarts.
// Helper: create (and persist) a notification for an email
async function createNotification(email, message, type = 'generic', meta = null) {
  if (!email || !message) return null;
  const e = String(email).toLowerCase();
  const id = require('nanoid').nanoid();
  const n = { id, email: e, message: String(message), type: String(type || 'generic'), read: false, createdAt: Date.now(), meta: meta || null };
  const current = notifications.get(e) || [];
  // Avoid duplicate insert if same type/message exists and still unread
  if (current.some(x => x.type === n.type && x.message === n.message && !x.read)) {
    return { ok: true, id: 'duplicate' };
  }
  current.unshift(n);
  notifications.set(e, current.slice(0, 50));
  if (supabase) {
    try {
      await supabase.from('notifications').insert([{ id: n.id, email: n.email, message: n.message, type: n.type, read: n.read, created_at: new Date(n.createdAt).toISOString(), meta: n.meta }]);
    } catch (err) {
      startLogger.error('[DB] Failed to insert notification:', err);
    }
  }
  return { ok: true, id };
}

// Admin: bulk create notifications (owner-only)
app.post('/api/admin/notifications/bulk', requireAdmin, async (req, res) => {
  const { requesterEmail, emails, message, type, all, meta } = req.body || {};
  // Ensure caller is authorised (owner or admin); existing owner check remains as fallback
  if (requesterEmail && String((requesterEmail || '').toLowerCase()) !== OWNER_EMAIL && (!req.user || !req.user.isAdmin)) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  if (!message) return res.status(400).json({ ok: false, error: 'MESSAGE_REQUIRED' });
  const targets = [];
  if (all) {
    // If Supabase available, load all users, otherwise use in-memory users map
    if (supabase) {
      try {
        const { data, error } = await supabase.from('users').select('email');
        if (!error && Array.isArray(data)) {
          for (const u of data) targets.push(String(u.email || '').toLowerCase());
        }
  } catch (err) { startLogger.error('[DB] Failed to fetch users for bulk notifications:', err && err.message); }
    } else {
      for (const [k] of users.entries()) targets.push(k);
    }
  } else if (Array.isArray(emails)) {
    for (const e of emails) targets.push(String(e || '').toLowerCase());
  }
  if (targets.length === 0) return res.status(400).json({ ok: false, error: 'NO_TARGETS' });
  // Create notices sequentially to avoid overloading DB
  const results = [];
  for (const t of targets) {
    try { results.push(await createNotification(t, message, type || 'generic', meta)); } catch (err) { results.push({ ok: false, error: err && err.message }); }
  }
  return res.json({ ok: true, created: results.length, results });
});

app.get('/api/notifications', requireAuth, async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' });
  if (!req.user || (!req.user.isAdmin && req.user.email !== email)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  // Prefer Supabase if available
  if (supabase) {
    try {
      const { data, error } = await supabase.from('notifications').select('*').eq('email', email);
      if (!error && data) return res.json(data);
    } catch (err) {
      startLogger.error('[DB] Failed to fetch notifications:', err);
    }
  }
  const list = notifications.get(email) || [];
  return res.json(list);
});

app.post('/api/notifications', requireAuth, async (req, res) => {
  const { email, message, type, meta } = req.body || {};
  if (!email || !message) return res.status(400).json({ ok: false, error: 'Missing email or message' });
  // Only admin or the target user may create notifications for the target email
  if (!req.user || (!req.user.isAdmin && req.user.email !== String(email).toLowerCase())) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  try {
    const out = await createNotification(email, message, type, meta);
    return res.json(out);
  } catch (err) {
    startLogger.error('[NOTIF] create failed:', err && err.message);
    return res.status(500).json({ ok: false, error: 'FAILED' });
  }
});

app.delete('/api/notifications/:id', requireAuth, requireSelfOrAdminForEmail((req) => req.query.email), async (req, res) => {
  const id = String(req.params.id || '');
  const email = String(req.query.email || '').toLowerCase();
  if (!id || !email) return res.status(400).json({ ok: false, error: 'Missing id or email' });
  // Remove from in-memory map
  const list = notifications.get(email) || [];
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) {
    list.splice(idx, 1);
    notifications.set(email, list);
  }
  if (supabase) {
    try {
      await supabase.from('notifications').delete().eq('id', id);
    } catch (err) {
      startLogger.error('[DB] Failed to delete notification:', err);
    }
  }
  return res.json({ ok: true });
});

app.patch('/api/notifications/:id', requireAuth, requireSelfOrAdminForEmail((req) => req.query.email), async (req, res) => {
  const id = String(req.params.id || '');
  const email = String(req.query.email || '').toLowerCase();
  const { read } = req.body || {};
  if (!id || !email || typeof read !== 'boolean') return res.status(400).json({ ok: false, error: 'Missing id/email/read' });
  const list = notifications.get(email) || [];
  const n = list.find(x => x.id === id);
  if (n) n.read = !!read;
  notifications.set(email, list);
  if (supabase) {
    try {
      await supabase.from('notifications').update({ read: !!read }).eq('id', id);
    } catch (err) {
      startLogger.error('[DB] Failed to update notification:', err);
    }
  }
  return res.json({ ok: true });
});

// Debug endpoint to check Supabase status
app.get('/api/debug/supabase', requireAdmin, (req, res) => {
  res.json({
    supabaseConfigured: !!supabase,
    userCount: users.size,
    supabaseUrl: supabase ? 'configured' : 'not configured'
  });
});

// Debug: Inspect server-side user state for a given email (in-memory and in Supabase)
app.get('/api/debug/user', requireAdmin, async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' });
  const inMemoryUser = users.get(email) || null;
  let supabaseUser = null;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
      if (!error && data) supabaseUser = data;
    } catch (err) {
      startLogger.error('[DEBUG] Supabase fetch failed:', err && err.message);
    }
  }
  return res.json({ ok: true, email, inMemoryUser, supabaseUser, admin: adminEmails.has(email), premiumWinner: premiumWinners.get(email) || null, supabaseConfigured: !!supabase });
});

// Debug: show registered routes & methods
app.get('/api/debug/routes', requireAdmin, (req, res) => {
  try {
    const routes = (app._router?.stack || [])
      .filter((r) => r.route)
      .map((r) => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));
    return res.json({ ok: true, routes });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err && err.message });
  }
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
          startLogger.error('[DB] Failed to update subscription:', err);
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
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'YOUR_STRIPE_SECRET_KEY_HERE') {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  }
} catch (e) {
  startLogger.warn('[Stripe] init failed:', e?.message || e)
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
    startLogger.error('[Stripe] create-session failed:', e?.message || e)
    return res.status(500).json({ ok: false, error: 'SESSION_FAILED' })
  }
})

app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    // Use payment link instead of API to avoid exposing keys
    const premiumPaymentLink = process.env.STRIPE_PREMIUM_PAYMENT_LINK || 'https://buy.stripe.com/YOUR_PREMIUM_LINK_HERE';
    
    if (premiumPaymentLink === 'https://buy.stripe.com/YOUR_PREMIUM_LINK_HERE') {
      return res.status(400).json({ ok: false, error: 'STRIPE_NOT_CONFIGURED' })
    }
    
    const { email } = req.body || {}
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
    }
    
    // Return the payment link directly
    return res.json({ ok: true, url: premiumPaymentLink })
  } catch (e) {
    startLogger.error('[Stripe] create-checkout-session failed:', e?.message || e)
    return res.status(500).json({ ok: false, error: 'SESSION_FAILED' })
  }
})

// Admin management (demo; NOT secure ÔÇö no auth/signature verification)
app.get('/api/admins', requireAdmin, (req, res) => {
  res.json({ admins: Array.from(adminEmails) })
})

app.get('/api/admins/check', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  res.json({ isAdmin: adminEmails.has(email) })
})

app.post('/api/admins/grant', requireAdmin, (req, res) => {
  const { email, requesterEmail } = req.body || {}
  if ((requesterEmail || '').toLowerCase() !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  adminEmails.add(target)
  res.json({ ok: true, admins: Array.from(adminEmails) })
})

app.post('/api/admins/revoke', requireAdmin, (req, res) => {
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

app.get('/api/admin/system-health', (req, res) => {
  const authHeader = req.headers.authorization || ''
  
  // Basic authentication check
  const isAuthenticated = !!authHeader
  if (!isAuthenticated) {
    return res.status(403).json({ ok: false, error: 'UNAUTHORIZED' })
  }
  
  const uptime = process.uptime()
  const memUsage = process.memoryUsage()
  
  res.json({
    ok: true,
    health: {
      database: true, // Would check actual DB
      websocket: true, // Would check WebSocket server status
      https: process.env.NODE_ENV === 'production',
      maintenance: maintenanceMode || false,
      clustering: false, // Would check actual clustering status
      uptime: uptime,
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      version: '1.0.0'
    }
  })
})

app.post('/api/admin/clustering', (req, res) => {
  const authHeader = req.headers.authorization || ''
  
  // Verify authorization header exists
  if (!authHeader) {
    return res.status(403).json({ ok: false, error: 'UNAUTHORIZED' })
  }
  
  const { enabled, maxWorkers, capacity } = req.body || {}
  
  // Store clustering config
  const clusteringConfig = {
    enabled: !!enabled,
    maxWorkers: Number(maxWorkers) || 4,
    capacity: Number(capacity) || 1500,
    updatedAt: new Date().toISOString()
  }
  
  // In production, this would:
  // 1. Set NODE_WORKERS environment variable
  // 2. Restart worker processes
  // 3. Configure load balancer
  
  logger.info('[Admin] Clustering config updated: %o', clusteringConfig)
  
  res.json({ 
    ok: true, 
    clustering: clusteringConfig,
    message: `Clustering ${enabled ? 'enabled' : 'disabled'}. Capacity: ${capacity} concurrent users.`
  })
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

// --- Subscription expiry scanner & notification cron --------------------------------
async function scanSubscriptionsAndNotify() {
  const now = Date.now();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const candidates = [];
  if (supabase) {
    try {
      const { data, error } = await supabase.from('users').select('email, subscription');
      if (error) {
        startLogger.error('[SCAN] Failed to load users from DB for subscription scan:', error?.message || error);
      } else if (Array.isArray(data)) {
        for (const u of data) {
          const email = String(u.email || '').toLowerCase();
          const sub = u.subscription || null;
          if (!sub) continue;
          let exp = null;
          if (sub.expiresAt) exp = typeof sub.expiresAt === 'string' ? Date.parse(sub.expiresAt) : Number(sub.expiresAt);
          // expiring soon
          if (exp && exp > now && exp - now <= THREE_DAYS_MS) candidates.push({ email, type: 'sub_expiring', sub, exp });
          // expired - when expiresAt <= now and subscription isn't granting fullAccess
          if (exp && exp <= now && !sub.fullAccess) candidates.push({ email, type: 'sub_expired', sub, exp });
        }
      }
  } catch (err) { startLogger.error('[SCAN] DB scan failed:', err && err.message); }
  } else {
    // Fallback: scan in-memory users map
    for (const [email, u] of users.entries()) {
      const sub = u.subscription || null;
      if (!sub) continue;
      let exp = null;
      if (sub.expiresAt) exp = typeof sub.expiresAt === 'string' ? Date.parse(sub.expiresAt) : Number(sub.expiresAt);
      if (exp && exp > now && exp - now <= THREE_DAYS_MS) candidates.push({ email, type: 'sub_expiring', sub, exp });
      if (exp && exp <= now && !sub.fullAccess) candidates.push({ email, type: 'sub_expired', sub, exp });
    }
    // Also include premiumWinners map entries (demo mode)
    for (const [email, exp] of premiumWinners.entries()) {
      if (!email) continue;
      if (exp && exp > now && exp - now <= THREE_DAYS_MS) candidates.push({ email: String(email || '').toLowerCase(), type: 'sub_expiring', sub: { fullAccess: true, source: 'tournament', expiresAt: exp }, exp });
      if (exp && exp <= now) candidates.push({ email: String(email || '').toLowerCase(), type: 'sub_expired', sub: { fullAccess: false, source: 'tournament', expiresAt: exp }, exp });
    }
  }
  for (const c of candidates) {
    try {
      // Compute a human-friendly message
      if (c.type === 'sub_expiring') {
        const days = Math.ceil((c.exp - now) / (24 * 60 * 60 * 1000));
        const msg = `Your premium subscription expires in ${days} day(s)`;
        await createNotification(c.email, msg, 'sub_expiring', { days, expiresAt: c.exp });
      } else if (c.type === 'sub_expired') {
        const msg = 'Your premium subscription has ended';
        await createNotification(c.email, msg, 'sub_expired', { expiresAt: c.exp });
      }
    } catch (err) {
      startLogger.error('[SCAN] Failed to create notification for', c && c.email, err && err.message);
    }
  }
}

// Run on startup and every 6 hours
try { scanSubscriptionsAndNotify().catch(e => startLogger.error('[SCAN] startup scan failed', e && e.message)); } catch {}
setInterval(() => { scanSubscriptionsAndNotify().catch(e => startLogger.error('[SCAN] scheduled run failed', e && e.message)); }, 1000 * 60 * 60 * 6);

// Admin endpoint to trigger subscription scan manually
app.post('/api/admin/notifications/scan-subscriptions', async (req, res) => {
  const { requesterEmail } = req.body || {};
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  try {
    await scanSubscriptionsAndNotify();
    return res.json({ ok: true });
  } catch (err) {
    startLogger.error('[ADMIN] manual scan failed:', err && err.message);
    return res.status(500).json({ ok: false, error: 'FAILED' });
  }
});

// Admin: list/grant/revoke per-email premium overrides (demo)
app.get('/api/admin/premium-winners', requireAdmin, (req, res) => {
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

app.get('/api/admin/matches', requireAdmin, (req, res) => {
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
  persistMatchesToDisk()
  try { (async () => { if (!supabase) return; await supabase.from('matches').delete().eq('id', matchId) })() } catch (err) { startLogger.warn('[Matches] Supabase delete failed:', err && err.message) }
  // Broadcast updated lobby
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) }))
  }
  res.json({ ok: true })
})

// Admin persistence status endpoint (owner-only)
app.get('/api/admin/persistence/status', requireAdmin, (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, supabase: !!supabase, redis: !!redisClient || (!!upstashRestUrl && !!upstashToken), lastTournamentPersistAt })
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
app.get('/api/admin/email-copy', requireAdmin, (req, res) => {
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
  startLogger.warn('[Email] transporter init failed', e?.message||e)
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
  logger.info(`[HTTP] Server listening on 0.0.0.0:${PORT}`)
  if (hosts.length) {
  for (const ip of hosts) logger.info(`       LAN:  http://${ip}:${PORT}`)
  } else {
  logger.info(`       TIP: open http://localhost:${PORT} on this PC; phones use your LAN IP`)
  }
});

// Debug: when running in debug mode, print out registered routes for troubleshooting
try {
  if (String(process.env.NDN_DEBUG || '').toLowerCase() === '1') {
    const routes = (app._router && app._router.stack || [])
      .filter(r => r.route)
      .map(r => ({ path: r.route.path, methods: Object.keys(r.route.methods) }))
    logger.info('[DEBUG] Registered HTTP routes: %o', routes)
  }
} catch (e) { /* ignore */ }
// Constrain ws payload size for safety
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 128 * 1024 });
logger.info(`[WS] WebSocket attached to same server at path /ws`);
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
  logger.info(`[HTTPS] Server listening on 0.0.0.0:${HTTPS_PORT}`)
        HTTPS_ACTIVE = true
        if (hosts.length) {
          for (const ip of hosts) logger.info(`        LAN: https://${ip}:${HTTPS_PORT}`)
        }
      })
      // Attach a secure WebSocket for HTTPS clients
      wssSecure = new WebSocketServer({ server: httpsServer, maxPayload: 128 * 1024 })
  logger.info(`[WS] Secure WebSocket attached to HTTPS server`)
    } else {
      startLogger.warn(`[HTTPS] NDN_HTTPS=1 but cert files not found. Expected at:\n  key: ${keyPath}\n  cert: ${certPath}`)
    }
  }
} catch (e) {
  startLogger.warn('[HTTPS] Failed to initialize HTTPS server:', e?.message || e)
}

// Simple in-memory rooms
const rooms = new Map(); // roomId -> Set(ws)
// Simple in-memory match lobby
const matches = new Map(); // matchId -> { id, creatorId, creatorName, mode, value, startingScore, game, creatorAvg, createdAt }

// Persist matches to disk (fallback if Supabase not configured)
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json')
function loadMatchesFromDisk() {
  try {
    if (!fs.existsSync(MATCHES_FILE)) return
    const raw = fs.readFileSync(MATCHES_FILE, 'utf8') || ''
    const arr = JSON.parse(raw || '[]')
    if (Array.isArray(arr)) {
      matches.clear()
      for (const t of arr) {
        matches.set(String(t.id), t)
      }
  logger.info('[Matches] Loaded %d matches from disk', matches.size)
    }
  } catch (err) { startLogger.warn('[Matches] Failed to load from disk:', err && err.message) }
}

function persistMatchesToDisk() {
  try {
    const dir = path.dirname(MATCHES_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const arr = Array.from(matches.values())
    fs.writeFileSync(MATCHES_FILE, JSON.stringify(arr, null, 2), 'utf8')
  } catch (err) { startLogger.warn('[Matches] Failed to persist to disk:', err && err.message) }
}

loadMatchesFromDisk()
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
let lastTournamentPersistAt = null

// Persist tournaments to disk (fallback if Supabase not configured)
const TOURNAMENTS_FILE = path.join(DATA_DIR, 'tournaments.json')
function loadTournamentsFromDisk() {
  try {
    if (!fs.existsSync(TOURNAMENTS_FILE)) return
    const raw = fs.readFileSync(TOURNAMENTS_FILE, 'utf8') || ''
    const arr = JSON.parse(raw || '[]')
    if (Array.isArray(arr)) {
      tournaments.clear()
      for (const t of arr) {
        tournaments.set(String(t.id), t)
      }
  logger.info('[Tournaments] Loaded %d tournaments from disk', tournaments.size)
    }
  } catch (err) { startLogger.warn('[Tournaments] Failed to load from disk:', err && err.message) }
}

function persistTournamentsToDisk() {

// Persist tournaments to Redis or Upstash REST key for cross-instance persistence.
async function persistTournamentsToRedis(arr) {
  try {
    if (redisClient) {
      try {
  await redisClient.set('ndn:tournaments:json', JSON.stringify(arr));
  try { lastTournamentPersistAt = Date.now() } catch {}
  return true
  } catch (err) { startLogger.warn('[Tournaments] Redis set failed:', err && err.message) }
    }
    if (upstashRestUrl && upstashToken) {
      try {
  await fetch(`${upstashRestUrl}/set/ndn:tournaments:json`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(arr) })
        })
  try { lastTournamentPersistAt = Date.now() } catch {}
  return true
  } catch (err) { startLogger.warn('[Tournaments] Upstash set failed:', err && err.message) }
    }
  } catch (err) { startLogger.warn('[Tournaments] persistTournamentsToRedis error:', err && err.message) }
  return false
}

// Load tournaments from persistence: prefer Supabase, then Redis/Upstash, then disk.
async function loadTournamentsFromPersistence() {
  try {
    if (supabase) {
      try {
        const { data } = await supabase.from('tournaments').select('*');
        if (Array.isArray(data) && data.length) {
          tournaments.clear()
          for (const t of data) tournaments.set(String(t.id), t)
          logger.info('[Tournaments] Loaded %d tournaments from Supabase', tournaments.size)
          return
        }
  } catch (err) { startLogger.warn('[Tournaments] Supabase load failed:', err && err.message) }
    }
    // try Redis/Upstash
    try {
      if (redisClient) {
        const raw = await redisClient.get('ndn:tournaments:json')
        if (raw) {
          const arr = JSON.parse(raw || '[]')
          if (Array.isArray(arr) && arr.length) {
            tournaments.clear()
            for (const t of arr) tournaments.set(String(t.id), t)
            logger.info('[Tournaments] Loaded %d tournaments from Redis', tournaments.size)
            return
          }
        }
      } else if (upstashRestUrl && upstashToken) {
        const res = await fetch(`${upstashRestUrl}/get/ndn:tournaments:json`, { headers: { 'Authorization': `Bearer ${upstashToken}` } })
        const json = await res.json()
        const raw = json.result
        if (raw) {
          const arr = JSON.parse(raw || '[]')
          if (Array.isArray(arr) && arr.length) {
            tournaments.clear()
            for (const t of arr) tournaments.set(String(t.id), t)
            logger.info('[Tournaments] Loaded %d tournaments from Upstash', tournaments.size)
            return
          }
        }
      }
  } catch (err) { startLogger.warn('[Tournaments] Redis/Upstash load failed:', err && err.message) }
    // Fallback to disk
    loadTournamentsFromDisk()
  } catch (err) { startLogger.warn('[Tournaments] loadTournamentsFromPersistence error:', err && err.message) }
}
  try {
    const dir = path.dirname(TOURNAMENTS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const arr = Array.from(tournaments.values())
  fs.writeFileSync(TOURNAMENTS_FILE, JSON.stringify(arr, null, 2), 'utf8')
  try { lastTournamentPersistAt = Date.now() } catch {}
  // Also persist into Redis/Upstash for cross-instance persistence if available
  try { persistTournamentsToRedis(arr).catch(() => {}) } catch {}
  } catch (err) { startLogger.warn('[Tournaments] Failed to persist to disk:', err && err.message) }
}

// Load persisted tournaments at startup (prefer Supabase -> Redis/Upstash -> disk)
;(async () => { await loadTournamentsFromPersistence().catch(err => startLogger.warn('[Tournaments] initial load failed', err && err.message)) })()
// Optional: if SUPABASE configured and NDN_AUTO_MIGRATE_TOURNAMENTS=1, upsert disk tournaments to Supabase
if (supabase && String(process.env.NDN_AUTO_MIGRATE_TOURNAMENTS || '') === '1') {
  try {
    const raw = fs.existsSync(TOURNAMENTS_FILE) ? fs.readFileSync(TOURNAMENTS_FILE, 'utf8') : '[]'
    const arr = JSON.parse(raw || '[]') || []
    if (Array.isArray(arr) && arr.length) {
      for (const t of arr) {
        const payload = {
          id: t.id,
          title: t.title,
          game: t.game,
          mode: t.mode,
          value: t.value,
          description: t.description || null,
          start_at: t.startAt ? new Date(t.startAt).toISOString() : null,
          checkin_minutes: t.checkinMinutes || null,
          capacity: t.capacity || null,
          official: !!t.official,
          prize: !!t.prize || false,
          prize_type: t.prizeType || null,
          prize_amount: t.prizeAmount || null,
          currency: t.currency || null,
          payout_status: t.payoutStatus || null,
          status: t.status || 'scheduled',
          winner_email: t.winnerEmail || null,
          starting_score: t.startingScore || null,
          creator_email: t.creatorEmail || null,
          creator_name: t.creatorName || null,
          created_at: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString()
        }
        await supabase.from('tournaments').upsert(payload, { onConflict: 'id' })
      }
  logger.info('[Tournaments] Auto-migrated %d tournaments into Supabase', arr.length)
    }
  } catch (err) { startLogger.warn('[Tournaments] Auto-migrate failed', err && err.message) }
}
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
  logger.info('[DB] Loading users from Supabase...');
      const { data, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        startLogger.error('[DB] Failed to load users from Supabase:', error);
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
  logger.info(`[DB] Successfully loaded ${loadedCount} users from Supabase`);
      } else {
  logger.info('[DB] No users found in Supabase');
      }
    } catch (err) {
      startLogger.error('[DB] Error loading users from Supabase:', err);
    }
  } else {
    startLogger.warn('[DB] Supabase not configured - using in-memory storage only');
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
  // Diagnostic log: print tournaments count and ids when broadcasting
  try {
    const ids = list.map(t => t.id).slice(0,50)
  logger.info(`[BROADCAST] tournaments=%d ids=%s`, list.length, ids.join(','))
  } catch (e) { logger.warn('[BROADCAST] could not stringify tournaments %s', e && e.message) }
  broadcastAll({ type: 'tournaments', tournaments: list })
}

async function joinRoom(ws, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws._roomId = roomId;
  if (ws._email) {
    // Update user status in Redis for cross-server sharing
    const userSession = await redisHelpers.getUserSession(ws._email);
    if (userSession) {
      userSession.status = 'ingame';
      userSession.lastSeen = Date.now();
      userSession.currentRoomId = roomId;
      await redisHelpers.setUserSession(ws._email, userSession);
    }
    // Also update local cache
    if (users.has(ws._email)) {
      const u = users.get(ws._email)
      u.status = 'ingame'
      u.lastSeen = Date.now()
      users.set(ws._email, u)
    }
  }
}

async function leaveRoom(ws) {
  const roomId = ws._roomId;
  if (!roomId) return;
  const set = rooms.get(roomId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(roomId);
  }
  // if room no longer has participants, clear server-side autocommit/context
  try {
    if (!rooms.has(roomId)) {
      roomAutocommitAllowed.delete(roomId)
      roomCreator.delete(roomId)
    }
  } catch {}
  ws._roomId = null;
  if (ws._email) {
    // Update user status in Redis for cross-server sharing
    const userSession = await redisHelpers.getUserSession(ws._email);
    if (userSession) {
      userSession.status = 'online';
      userSession.lastSeen = Date.now();
      userSession.currentRoomId = null;
      await redisHelpers.setUserSession(ws._email, userSession);
    }
    // Also update local cache
    if (users.has(ws._email)) {
      const u = users.get(ws._email)
      // If still connected, revert to online; otherwise close handler will set offline
      u.status = 'online'
      u.lastSeen = Date.now()
      users.set(ws._email, u)
    }
  }
}

function broadcastToRoom(roomId, data, exceptWs=null) {
  const set = rooms.get(roomId);
  if (!set) return;
  const payload = (typeof data === 'string') ? data : JSON.stringify(data)
  try {
    if (DEBUG) {
      try { logger.debug('[BROADCAST] room=%s clients=%s except=%s data=%s', roomId, Array.from(set).map(s => s && s._id).join(','), exceptWs && exceptWs._id, typeof data === 'string' ? data : JSON.stringify(data).slice(0,200)) } catch {}
      try { console.log('[BROADCAST] room=%s clients=%s except=%s data=%s', roomId, Array.from(set).map(s => s && s._id).join(','), exceptWs && exceptWs._id, typeof data === 'string' ? data : JSON.stringify(data).slice(0,200)) } catch {}
    }
  } catch {}
  for (const client of set) {
    try {
      const cid = client && client._id
      const ready = client && client.readyState
      if (DEBUG) {
        try { logger.debug('[BROADCAST-SEND] room=%s target=%s readyState=%s except=%s', roomId, cid, ready, exceptWs && exceptWs._id) } catch {}
        try { console.log('[BROADCAST-SEND] room=%s target=%s readyState=%s except=%s', roomId, cid, ready, exceptWs && exceptWs._id) } catch {}
      }
      if (client.readyState === 1 && client !== exceptWs) {
        try {
          client.send(payload)
          try { if (DEBUG) logger.debug('[BROADCAST-SENT] room=%s target=%s', roomId, cid) } catch {}
          try { if (DEBUG) console.log('[BROADCAST-SENT] room=%s target=%s', roomId, cid) } catch {}
        } catch (e) {
          try { startLogger.warn('[BROADCAST] failed send to %s: %s', cid, e && e.message) } catch {}
        }
      }
    } catch (e) {
      try { logger.warn('[BROADCAST] iteration error for room=%s: %s', roomId, e && e.message) } catch {}
    }
  }
}

wss.on('connection', (ws, req) => {
  try { logger.info(`[WS] client connected path=${req?.url||'/'} origin=${req?.headers?.origin||''}`) } catch {}
  ws._id = nanoid(8);
  clients.set(ws._id, ws)
  wsConnections.inc()
  // Heartbeat
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  // Log low-level socket errors
  ws.on('error', (err) => {
    try { startLogger.warn(`[WS] error id=${ws._id} message=${err?.message||err}`) } catch {}
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

  ws.on('message', async (msg) => {
    if (typeof msg?.length === 'number' && msg.length > 128 * 1024) return
    if (!allowMessage()) return
    try {
      const data = JSON.parse(msg.toString());
  try { if (DEBUG) logger.debug('[WSMSG] from=%s room=%s type=%s', ws._id, ws._roomId, data && data.type) } catch {}
      if (data.type === 'join') {
        await leaveRoom(ws);
        await joinRoom(ws, data.roomId);
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
          // Update user session in Redis for cross-server sharing
          const userSession = await redisHelpers.getUserSession(ws._email) || {
            email: ws._email,
            username: ws._username,
            status: 'online',
            allowSpectate: true
          };
          userSession.username = ws._username;
          userSession.status = 'online';
          userSession.lastSeen = Date.now();
          userSession.wsId = ws._id;
          if (typeof data.allowSpectate === 'boolean') userSession.allowSpectate = !!data.allowSpectate;
          await redisHelpers.setUserSession(ws._email, userSession);

          // Also update local cache
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
          try { chatMessagesTotal.inc() } catch (e) {}
        }
      } else if (data.type === 'celebration') {
        // Broadcast client-declared celebrations (e.g., leg win) to the room
        if (ws._roomId) {
          const kind = (data.kind === '180' ? '180' : (data.kind === 'leg' ? 'leg' : 'custom'))
          broadcastToRoom(ws._roomId, { type: 'celebration', kind, by: data.by || (ws._username || `user-${ws._id}`), ts: Date.now() }, null)
        }
      } else if (data.type === 'report') {
  } else if (data.type === 'set-match-autocommit') {
        // Host or admin may toggle server-side autocommit allowed flag for a room
        const roomId = String(data.roomId || '')
        const allow = !!data.allow
        if (!roomId) return
  const creatorId = roomCreator.get(roomId)
  const isCreator = creatorId && String(creatorId) === String(ws._id)
  // Admins may be declared via adminEmails (owner) or via the users map.
  const isAdmin = ws._email && (adminEmails.has(String(ws._email)) || (users.get(String(ws._email)) && !!users.get(String(ws._email)).admin))
        if (!isCreator && !isAdmin) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only match creator or admin can set autocommit' })) } catch {}
          return
        }
  try { roomAutocommitAllowed.set(roomId, !!allow) } catch (e) {}
  try { if (DEBUG) logger.debug('[SET_AUTOCOMMIT] room=%s allow=%s by=%s creatorId=%s isCreator=%s isAdmin=%s', roomId, allow, ws._id, creatorId, isCreator, isAdmin) } catch {}
        // Notify all participants in the room of the updated setting
        broadcastToRoom(roomId, { type: 'match-autocommit-updated', roomId, allow })
  // Also notify the sender directly (ack) so tests can assert server processed toggle.
  try { ws.send(JSON.stringify({ type: 'match-autocommit-updated', roomId, allow })) } catch {}
  } else if (data.type === 'auto-visit') {
        // clients request server-side autocommit for a detection: validate and broadcast server-verified commit
        const roomId = String(data.roomId || '')
        const value = Number(data.value || 0)
        const darts = Number(data.darts || 3)
  const ring = (typeof data.ring === 'string') ? data.ring : null
  const sector = (typeof data.sector === 'number' || typeof data.sector === 'string') ? Number(data.sector) : null
  const pBoard = data.pBoard && typeof data.pBoard === 'object' ? { x: Number(data.pBoard.x || 0), y: Number(data.pBoard.y || 0) } : null
  const calibrationValid = !!data.calibrationValid
        if (!roomId) return
  // Ensure sender is currently in the room and autocommit is allowed (either room flag or creator/admin override)
  const creatorId = roomCreator.get(roomId)
  const isCreator = creatorId && String(creatorId) === String(ws._id)
  const isAdmin = ws._email && (adminEmails.has(String(ws._email)) || (users.get(String(ws._email)) && !!users.get(String(ws._email)).admin))
  const allowed = (roomAutocommitAllowed.get(roomId) === true) || isCreator || isAdmin
        try {
          if (DEBUG) {
            try { logger.debug('[AUTO_VISIT_DEBUG] room=%s ws=%s creator=%s isCreator=%s isAdmin=%s allowed=%s', roomId, ws._id, creatorId, isCreator, isAdmin, allowed) } catch {}
            try { logger.debug('[AUTO_VISIT_DEBUG] roomMembers=%s', Array.from((rooms.get(roomId) || [])).map(c => c && c._id).join(',')) } catch {}
            try { console.log('[AUTO_VISIT_DEBUG] room=%s ws=%s creator=%s isCreator=%s isAdmin=%s allowed=%s', roomId, ws._id, creatorId, isCreator, isAdmin, allowed) } catch {}
            try { const members = Array.from((rooms.get(roomId) || [])).map(c => c && c._id).join(','); console.log('[AUTO_VISIT_DEBUG] roomMembers=%s', members) } catch {}
          }
        } catch {}
        if (!allowed) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Autocommit is not allowed for this match' })) } catch {}
          try { if (DEBUG) logger.debug('[AUTO_VISIT_HANDLER] rejected allowed=%s by=%s room=%s creator=%s', allowed, ws._id, roomId, String(roomCreator.get(roomId))) } catch {}
          return
        }
  // Validate pBoard if provided and ensure it maps to the requested value.
  // Allow creators/admin to bypass strict pBoard validation (owner override).
        if (!calibrationValid) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'Client reports invalid calibration - autocommit rejected' })) } catch {}
          return
        }
        if (!pBoard) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'pBoard required for server autocommit' })) } catch {}
          return
        }
  if (pBoard && !isCreator && !isAdmin) {
          try {
            const srvScore = scoreAtBoardPoint(pBoard)
            // simple check: require base equal, ring equal and sector equal (if provided)
            const allowedVal = Number(srvScore.base || 0)
            if (allowedVal !== value || (ring && srvScore.ring !== ring) || (sector && Number(srvScore.sector) !== Number(sector))) {
              try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', message: 'pBoard does not match claimed score' })) } catch {}
              try { if (DEBUG) logger.debug('[AUTO_VISIT_HANDLER] rejected pBoard mismatch room=%s by=%s allowedVal=%s value=%s srv=%s', roomId, ws._id, allowedVal, value, JSON.stringify(srvScore)) } catch {}
              return
            }
            // reject points outside the double ring by a small margin
            const rad = Math.hypot(pBoard.x, pBoard.y)
            if (rad > (BoardRadii.doubleOuter + 5)) {
              try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', message: 'pBoard outside board bounds' })) } catch {}
              return
            }
          } catch (e) {
            try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', message: 'pBoard validation failed' })) } catch {}
            return
          }
        }
        if (ws._roomId !== roomId) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'Not in room' })) } catch {}
          return
        }
  // Broadcast server-verified visit commit to the room - clients should apply this visit
        const visit = { by: ws._id, value, darts, ring, sector, ts: Date.now(), pBoard }
  try {
    if (DEBUG) {
      try { logger.debug('[AUTO_VISIT_BROADCAST] room=%s visitBy=%s visit=%s', roomId, ws._id, JSON.stringify(visit).slice(0,200)) } catch {}
      try { console.log('[AUTO_VISIT_BROADCAST] room=%s visitBy=%s visit=%s', roomId, ws._id, JSON.stringify(visit).slice(0,200)) } catch {}
    }
    // Dump room membership with readyState for debugging
    try {
      const members = Array.from((rooms.get(roomId) || [])).map(c => ({ id: c && c._id, readyState: c && c.readyState }))
      try { logger.debug('[AUTO_VISIT_ROOM_MEMBERS] room=%s members=%s', roomId, JSON.stringify(members)) } catch {}
      try { console.log('[AUTO_VISIT_ROOM_MEMBERS] room=%s members=%s', roomId, JSON.stringify(members)) } catch {}
    } catch (e) { try { logger.warn('[AUTO_VISIT] failed to list room members %s', e && e.message) } catch {} }
    broadcastToRoom(roomId, { type: 'visit-commit', roomId, visit })
  } catch (e) { try { if (DEBUG) logger.debug('[AUTO_VISIT_BROADCAST] broadcast failed room=%s err=%s', roomId, e && e.message) } catch {} }
  // Also ack to the sender (useful for tests and immediate application)
  try { ws.send(JSON.stringify({ type: 'visit-commit', roomId, visit })) } catch {}
  try { if (DEBUG) logger.debug('[AUTO_VISIT_HANDLER] room=%s by=%s allowed=%s', roomId, ws._id, allowed) } catch {}
        // Optionally log to server audit logs (console for now)
  try { if (DEBUG) logger.debug('[AUTOVISIT] room=%s by=%s value=%s darts=%s ring=%s sector=%s', roomId, ws._id, value, darts, ring, sector) } catch {}
      } else if (data.type === 'cam-create') {
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
        await leaveRoom(ws)
        await joinRoom(ws, roomId)
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
  // Initialize server-side per-room flags for this match (creator can toggle later)
  try { roomAutocommitAllowed.set(id, false); roomCreator.set(id, String(ws._id)); } catch (e) {}
        persistMatchesToDisk()
        (async () => {
          if (!supabase) return
          try {
            const payload = {
              id: m.id,
              creator_id: m.creatorId,
              creator_name: m.creatorName,
              mode: m.mode,
              value: m.value,
              starting_score: m.startingScore,
              creator_avg: m.creatorAvg,
              game: m.game,
              require_calibration: !!m.requireCalibration,
              created_at: new Date(m.createdAt).toISOString(),
              status: 'waiting'
            }
            await supabase.from('matches').insert([payload])
          } catch (err) { startLogger.warn('[Matches] Supabase create failed:', err && err.message) }
        })()
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
          // Start a 60-second timer; if creator does not respond, expire the match
          try {
            if (inviteTimers.has(m.id)) {
              try { clearTimeout(inviteTimers.get(m.id)) } catch {}
            }
          } catch {}
          const t = setTimeout(() => {
            if (matches.has(m.id)) {
              const reqClient = clients.get(ws._id)
              try { if (reqClient && reqClient.readyState === 1) reqClient.send(JSON.stringify({ type: 'invite-expired', matchId: m.id })) } catch {}
              matches.delete(m.id)
              persistMatchesToDisk()
              // broadcast updated lobby
              const lobbyPayload = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
              for (const c of wss.clients) {
                if (c.readyState === 1) try { c.send(lobbyPayload) } catch {}
              }
            }
            inviteTimers.delete(m.id)
          }, 60 * 1000)
          inviteTimers.set(m.id, t)
        }
      } else if (data.type === 'invite-response') {
        const { matchId, accept, toId } = data
        const m = matches.get(matchId)
        if (!m) return
        const requester = clients.get(toId)
        if (accept) {
          // clear invite timer if present
          try { if (inviteTimers.has(matchId)) { clearTimeout(inviteTimers.get(matchId)); inviteTimers.delete(matchId) } } catch {}
          // Create a prestart session and notify both players; then after PRESTART_SECONDS start the match
          const roomId = matchId
          const creator = clients.get(m.creatorId)
          const payload = { type: 'match-prestart', roomId, match: m, prestartEndsAt: Date.now() + (PRESTART_SECONDS * 1000) }
          if (creator && creator.readyState === 1) creator.send(JSON.stringify(payload))
          if (requester && requester.readyState === 1) requester.send(JSON.stringify(payload))
          matches.delete(matchId)
          persistMatchesToDisk()
          try { (async () => { if (!supabase) return; await supabase.from('matches').delete().eq('id', matchId) })() } catch (err) { startLogger.warn('[Matches] Supabase delete failed:', err && err.message) }
          // Setup a pending prestart session so we can collect prestart choices (skip/bull) and bull-up throws
          try {
            const pre = { roomId, match: m, players: [m.creatorId, requester._id], choices: {}, bullRound: 0, bullThrows: {}, timer: null }
            pendingPrestarts.set(roomId, pre)
            // Start a countdown to finalize match start if no special choices are made
            pre.timer = setTimeout(() => {
              try {
                const startPayload = { type: 'match-start', roomId, match: m }
                const cr = clients.get(m.creatorId)
                const rq = clients.get(requester._id)
                if (cr && cr.readyState === 1) cr.send(JSON.stringify(startPayload))
                if (rq && rq.readyState === 1) rq.send(JSON.stringify(startPayload))
                // Initialize server-side per-room flags
                try { roomAutocommitAllowed.set(roomId, false); roomCreator.set(roomId, String(m.creatorId)); } catch (e) {}
              } catch (err) { startLogger.warn('[Prestart] auto-start failed', err) }
              pendingPrestarts.delete(roomId)
            }, PRESTART_SECONDS * 1000)
          } catch (err) { startLogger.warn('[Prestart] setup failed', err) }
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
          persistMatchesToDisk()
          try { (async () => { if (!supabase) return; await supabase.from('matches').delete().eq('id', matchId) })() } catch (err) { startLogger.warn('[Matches] Supabase delete failed:', err && err.message) }
        }
        // Broadcast updated lobby
        const lobbyPayload2 = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
        for (const client of wss.clients) {
          if (client.readyState === 1) client.send(lobbyPayload2)
        }
      } else if (data.type === 'prestart-choice') {
        const roomId = String(data.roomId || '')
        const sess = pendingPrestarts.get(roomId)
        if (!sess) return
        const playerId = ws._id
        sess.choices[playerId] = data.choice
        // Notify both players about the choice
        const notify = { type: 'prestart-choice-notify', roomId, playerId, choice: data.choice }
        for (const pid of sess.players) {
          const c = clients.get(pid)
          if (c && c.readyState === 1) c.send(JSON.stringify(notify))
        }
        // If both chosen and both chose skip -> start match
        const allChosen = sess.players.every(pid => !!sess.choices[pid])
        if (allChosen) {
          const choices = Object.values(sess.choices)
          const unique = Array.from(new Set(choices))
          if (unique.length === 1 && unique[0] === 'skip') {
            const startPayload = { type: 'match-start', roomId, match: sess.match }
            for (const pid of sess.players) {
              const c = clients.get(pid)
              if (c && c.readyState === 1) c.send(JSON.stringify(startPayload))
            }
            try { if (sess.timer) clearTimeout(sess.timer) } catch {}
            pendingPrestarts.delete(roomId)
          } else if (unique.length === 1 && unique[0] === 'bull') {
            // Start bull-up round
            const payload = { type: 'prestart-bull', roomId }
            for (const pid of sess.players) {
              const c = clients.get(pid)
              if (c && c.readyState === 1) c.send(JSON.stringify(payload))
            }
          }
        }
      } else if (data.type === 'prestart-bull-throw') {
        const roomId = String(data.roomId || '')
        const sess = pendingPrestarts.get(roomId)
        if (!sess) return
        const pid = ws._id
        const score = Math.max(0, Number(data.score || 0))
        sess.bullThrows[pid] = sess.bullThrows[pid] || []
        sess.bullThrows[pid].push(score)
        // If both players submitted a throw for this round
        const haveBoth = sess.players.every(p => (sess.bullThrows[p] || []).length > 0)
        if (!haveBoth) return
        // Evaluate last throw
        const p0 = sess.players[0]
        const p1 = sess.players[1]
        const s0 = sess.bullThrows[p0][sess.bullThrows[p0].length - 1] || 0
        const s1 = sess.bullThrows[p1][sess.bullThrows[p1].length - 1] || 0
        const hit0 = s0 === 50
        const hit1 = s1 === 50
        if (hit0 && !hit1) {
          const payload = { type: 'prestart-bull-winner', roomId, winnerId: p0 }
          for (const pid of sess.players) {
            const c = clients.get(pid)
            if (c && c.readyState === 1) c.send(JSON.stringify(payload))
          }
              const startPayload = { type: 'match-start', roomId, match: sess.match, firstPlayerId: p0 }
          for (const pid of sess.players) {
            const c = clients.get(pid)
            if (c && c.readyState === 1) c.send(JSON.stringify(startPayload))
          }
              try { roomAutocommitAllowed.set(roomId, false); roomCreator.set(roomId, String(sess.match.creatorId)); } catch (e) {}
          try { if (sess.timer) clearTimeout(sess.timer) } catch {}
          pendingPrestarts.delete(roomId)
          matches.delete(sess.match.id)
          persistMatchesToDisk()
        } else if (hit1 && !hit0) {
          const payload = { type: 'prestart-bull-winner', roomId, winnerId: p1 }
          for (const pid of sess.players) {
            const c = clients.get(pid)
            if (c && c.readyState === 1) c.send(JSON.stringify(payload))
          }
          const startPayload = { type: 'match-start', roomId, match: sess.match, firstPlayerId: p1 }
          for (const pid of sess.players) {
            const c = clients.get(pid)
            if (c && c.readyState === 1) c.send(JSON.stringify(startPayload))
          }
          try { roomAutocommitAllowed.set(roomId, false); roomCreator.set(roomId, String(sess.match.creatorId)); } catch (e) {}
          try { if (sess.timer) clearTimeout(sess.timer) } catch {}
          pendingPrestarts.delete(roomId)
          matches.delete(sess.match.id)
          persistMatchesToDisk()
        } else {
          // Tie (both hit or both missed), tell clients to repeat the round
          const tiePayload = { type: 'prestart-bull-tie', roomId }
          for (const pid of sess.players) {
            const c = clients.get(pid)
            if (c && c.readyState === 1) c.send(JSON.stringify(tiePayload))
          }
          // Keep bullThrows arrays; next round will push additional entries
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
  persistMatchesToDisk()
  try { (async () => { if (!supabase) return; await supabase.from('matches').delete().eq('id', id) })() } catch (err) { startLogger.warn('[Matches] Supabase delete failed:', err && err.message) }
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
        logger.error('Invalid message: %o', e);
    }
  });

  ws.on('close', async (code, reasonBuf) => {
    const reason = (() => { try { return reasonBuf ? reasonBuf.toString() : '' } catch { return '' } })()
  try { logger.info(`[WS] close id=${ws._id} code=${code} reason=${reason}`) } catch {}
    // Clean up room
    await leaveRoom(ws);
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
        // Update user status in Redis for cross-server sharing
        const userSession = await redisHelpers.getUserSession(ws._email);
        if (userSession) {
          userSession.status = 'offline';
          userSession.lastSeen = Date.now();
          userSession.wsId = undefined;
          userSession.currentRoomId = null;
          await redisHelpers.setUserSession(ws._email, userSession);
        }
        // Also update local cache
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
  logger.warn('\n[Shutdown] closing servers...')
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

// Friend requests (incoming/outgoing)
// Stored in `friendRequests` array and persisted to FRIEND_REQUESTS_FILE.
// Shape: { from: string, to: string, ts: number, status?: 'pending'|'accepted'|'declined'|'cancelled' }
app.get('/api/friends/requests', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })

  const incoming = (friendRequests || [])
    .filter((r) => r && String(r.to || '').toLowerCase() === email && String(r.status || 'pending') === 'pending')
    .map((r) => {
      const from = String(r.from || '').toLowerCase()
      const u = users.get(from) || { email: from, username: from, status: 'offline' }
      return { ...r, from, to: email, fromName: u.username }
    })
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))

  res.json({ ok: true, requests: incoming })
})

app.get('/api/friends/outgoing', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })

  const outgoing = (friendRequests || [])
    .filter((r) => r && String(r.from || '').toLowerCase() === email && String(r.status || 'pending') === 'pending')
    .map((r) => {
      const to = String(r.to || '').toLowerCase()
      const u = users.get(to) || { email: to, username: to, status: 'offline' }
      return { ...r, from: email, to, toName: u.username }
    })
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))

  res.json({ ok: true, requests: outgoing })
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
  // Store as a true 2-way thread.
  // Keep legacy `messages` (inbox by recipient) for backwards compatibility.
  const now = Date.now()
  const id = `${now}-${Math.random().toString(36).slice(2,8)}`
  const threadKey = [from, to].sort().join('|')
  if (!global.dmThreads) global.dmThreads = new Map()
  const dmThreads = global.dmThreads
  const thread = dmThreads.get(threadKey) || []
  const item = { id, from, to, message: msg, ts: now, readBy: [from] }
  thread.push(item)
  dmThreads.set(threadKey, thread)

  // Legacy inbox storage (recipient only)
  const arr = messages.get(to) || []
  arr.push({ id, from, message: msg, ts: now, read: false })
  messages.set(to, arr)
  // Try deliver via WS if recipient online
  const u = users.get(to)
  if (u && u.wsId) {
    const target = clients.get(u.wsId)
    if (target && target.readyState === 1) {
      target.send(JSON.stringify({ type: 'friend-message', from, to, message: msg, ts: item.ts, id: item.id }))
    }
  }
  res.json({ ok: true, delivered: !!(u && u.wsId) })
})

// Fetch recent inbox messages (legacy endpoint)
app.get('/api/friends/messages', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const arr = messages.get(email) || []
  res.json({ ok: true, messages: arr.slice(-200).sort((a,b)=>b.ts-a.ts) })
})

// Fetch a true 2-way thread between the current user and another user.
app.get('/api/friends/thread', (req, res) => {
  const me = String(req.query.email || '').toLowerCase()
  const other = String(req.query.other || '').toLowerCase()
  if (!me || !other || me === other) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const threadKey = [me, other].sort().join('|')
  const dmThreads = global.dmThreads || new Map()

  const thread = (dmThreads.get(threadKey) || []).slice(-400).sort((a,b)=>a.ts-b.ts)
  // Mark as read for `me` (idempotent)
  for (const m of thread) {
    try {
      if (Array.isArray(m.readBy) && !m.readBy.includes(me)) m.readBy.push(me)
    } catch {}
  }
  dmThreads.set(threadKey, dmThreads.get(threadKey) || thread)
  global.dmThreads = dmThreads

  // Also mark legacy inbox items from `other` as read.
  try {
    const inbox = messages.get(me) || []
    for (const m of inbox) {
      if (String(m.from||'').toLowerCase() === other) m.read = true
    }
    messages.set(me, inbox)
  } catch {}

  res.json({ ok: true, thread })
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
app.get('/api/admin/reports', requireAdmin, (req, res) => {
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
app.get('/api/wallet/balance', requireAuth, requireSelfOrAdminForEmail((req) => req.query.email), (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const w = wallets.get(email) || { email, balances: {} }
  res.json({ ok: true, wallet: w })
})

// Wallet: get linked payout method (brand + last4)
app.get('/api/wallet/payout-method', requireAuth, requireSelfOrAdminForEmail((req) => req.query.email), (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const m = payoutMethods.get(email) || null
  res.json({ ok: true, method: m })
})

// Wallet: link/update payout method (store non-sensitive brand + last4 for display only)
app.post('/api/wallet/link-card', requireAuth, requireSelfOrAdminForEmail((req) => req.body && String(req.body.email || '').toLowerCase()), (req, res) => {
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

app.post('/api/wallet/withdraw', requireAuth, requireSelfOrAdminForEmail((req) => req.body && String(req.body.email || '').toLowerCase()), (req, res) => {
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

// Admin: credit wallet (owner-only)
app.post('/api/admin/wallet/credit', requireAdmin, async (req, res) => {
  const { email, currency, amount } = req.body || {}
  const addr = String(email || '').toLowerCase()
  const curr = String(currency || 'USD').toUpperCase()
  const amt = Math.round(Number(amount) * 100)
  if (!addr || !Number.isFinite(amt) || amt <= 0) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  creditWallet(addr, curr, amt)
  const item = { id: nanoid(10), email: addr, currency: curr, amountCents: amt, ts: Date.now(), by: req.user && req.user.email }
  logger.info('[WALLET] Credited %o', item)
  return res.json({ ok: true, credited: item })
})

// Admin: process withdrawal (approve or reject)
app.post('/api/admin/wallet/withdrawals/decide', requireAdmin, (req, res) => {
  const { id, action, notes } = req.body || {}
  if (!id || !action) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const wReq = withdrawals.get(id)
  if (!wReq) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (action === 'reject') {
    wReq.status = 'rejected'
    wReq.decidedAt = Date.now()
    wReq.notes = String(notes || '')
    withdrawals.set(id, wReq)
    return res.json({ ok: true, request: wReq })
  }
  if (action === 'paid') {
    const ok = debitWallet(wReq.email, wReq.currency, wReq.amountCents)
    if (!ok) return res.status(400).json({ ok: false, error: 'INSUFFICIENT_FUNDS' })
    wReq.status = 'paid'
    wReq.decidedAt = Date.now()
    wReq.notes = String(notes || '')
    withdrawals.set(id, wReq)
    return res.json({ ok: true, request: wReq })
  }
  return res.status(400).json({ ok: false, error: 'UNKNOWN_ACTION' })
})

// Admin: list withdrawals
app.get('/api/admin/wallet/withdrawals', requireAdmin, (req, res) => {
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

app.post('/api/tournaments/create', async (req, res) => {
  const { title, game, mode, value, description, startAt, checkinMinutes, capacity, startingScore, creatorEmail, creatorName, official, prizeType, prizeAmount, currency, prizeNotes, requesterEmail, requireCalibration } = req.body || {}
  const isOwner = String(requesterEmail || '').toLowerCase() === OWNER_EMAIL
  const isOfficial = !!official && isOwner
  const isAdminCreator = adminEmails.has(String(requesterEmail || '').toLowerCase()) || isOwner
  const id = nanoid(10)
  // Only the owner can create "official" tournaments or set prize metadata
  // Normalize prize metadata
  const pType = isOfficial ? (prizeType === 'cash' ? 'cash' : 'premium') : 'none'
  const amount = (pType === 'cash' && isOwner) ? Math.max(0, Number(prizeAmount) || 0) : 0
  const curr = (pType === 'cash' && isOwner) ? (String(currency || 'USD').toUpperCase()) : undefined
  const notes = (isOwner && typeof prizeNotes === 'string') ? prizeNotes : ''
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
    requireCalibration: !!requireCalibration,
    prize: isOfficial ? (pType !== 'none') : false,
    prizeType: pType,
    prizeAmount: amount || undefined,
    currency: curr,
    payoutStatus: pType === 'cash' ? 'none' : 'none',
    prizeNotes: notes,
    status: 'scheduled',
    winnerEmail: null,
  creatorEmail: String(creatorEmail || ''),
  creatorName: (isAdminCreator ? 'ADMIN' : String(creatorName || '')),
    createdAt: Date.now(),
    startingScore: (typeof startingScore === 'number' && startingScore>0) ? Math.floor(startingScore) : (String(game)==='X01' ? 501 : undefined),
  }
  // Persist to Supabase when configured; otherwise persist locally
  try {
    if (supabase) {
      const payload = {
        id: t.id,
        title: t.title,
        game: t.game,
        mode: t.mode,
        value: t.value,
        description: t.description || null,
        start_at: new Date(t.startAt).toISOString(),
        checkin_minutes: t.checkinMinutes || null,
        capacity: t.capacity || null,
        official: !!t.official,
        prize: !!t.prize || false,
        prize_type: t.prizeType || null,
        prize_amount: t.prizeAmount || null,
        currency: t.currency || null,
        payout_status: t.payoutStatus || null,
        status: t.status || 'scheduled',
        winner_email: t.winnerEmail || null,
        starting_score: t.startingScore || null,
        creator_email: t.creatorEmail || null,
        creator_name: t.creatorName || null,
        created_at: new Date(t.createdAt).toISOString()
      }
      // Use upsert (insert/edit) to avoid conflict and verify by selecting
      const { error: upsertErr } = await supabase.from('tournaments').upsert(payload, { onConflict: 'id' })
      if (upsertErr) {
        startLogger.warn('[Tournaments] Supabase upsert failed:', upsertErr.message || upsertErr)
        return res.status(500).json({ ok: false, error: 'DB_PERSIST_FAILED', details: upsertErr.message || upsertErr })
      }
      // Verify the created row is readable from DB
      try {
        const { data: checkRows, error: checkErr } = await supabase.from('tournaments').select('*').eq('id', t.id).limit(1).single()
        if (checkErr || !checkRows) {
          startLogger.warn('[Tournaments] Supabase verify failed:', checkErr || 'no row')
          return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: (checkErr && checkErr.message) || 'no row' })
        }
      } catch (err) {
        startLogger.warn('[Tournaments] Supabase verify exception:', err && err.message)
        return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: err && err.message })
      }
      // Persist local cache and backups
      tournaments.set(id, t)
      persistTournamentsToDisk()
    } else {
      tournaments.set(id, t)
      persistTournamentsToDisk()
    }
  } catch (err) {
    startLogger.warn('[Tournaments] Persist error:', err && err.message)
    return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' })
  }
  // Diagnostic log: announce creation
  try { logger.info('[TOURNAMENT CREATED] id=%s title=%s official=%s creator=%s', id, t.title, !!t.official, t.creatorEmail) } catch (e) {}
  broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

app.post('/api/tournaments/join', async (req, res) => {
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
  t.participants.push({ email: addr, username: String(username || addr) })
  // Persist participant to DB if configured
  try {
    if (supabase) {
      const { error: insErr } = await supabase.from('tournament_participants').upsert([ { tournament_id: t.id, email: addr, username: String(username || addr) } ], { onConflict: 'tournament_id,email' })
      if (insErr) {
        startLogger.warn('[Tournaments] Supabase join upsert failed:', insErr.message || insErr)
        return res.status(500).json({ ok: false, error: 'DB_PERSIST_FAILED', details: insErr.message || insErr })
      }
      // Verify participant exists
      try {
        const { data: part, error: qErr } = await supabase.from('tournament_participants').select('*').eq('tournament_id', t.id).eq('email', addr).limit(1).single()
        if (qErr || !part) {
          startLogger.warn('[Tournaments] Supabase join verify failed:', qErr || 'no row')
          return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: (qErr && qErr.message) || 'no row' })
        }
      } catch (err) {
        startLogger.warn('[Tournaments] Supabase join verify exception:', err && err.message)
        return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: err && err.message })
      }
    }
    persistTournamentsToDisk()
  } catch (err) {
    startLogger.warn('[Tournaments] Persist participant failed:', err && err.message)
    return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' })
  }
  broadcastTournaments()
  res.json({ ok: true, joined: true, tournament: t })
})

// Leave a tournament (only allowed before it starts)
app.post('/api/tournaments/leave', async (req, res) => {
  const { tournamentId, email } = req.body || {}
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  const addr = String(email || '').toLowerCase()
  if (!addr) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const before = t.participants.length
  t.participants = t.participants.filter(p => p.email !== addr)
  // Persist participant removal
  try {
    if (supabase) {
      const { error: delErr } = await supabase.from('tournament_participants').delete().eq('tournament_id', t.id).eq('email', addr)
      if (delErr) {
        startLogger.warn('[Tournaments] Supabase leave failed:', delErr)
        return res.status(500).json({ ok: false, error: 'DB_PERSIST_FAILED', details: delErr.message || delErr })
      }
      // Verify participant no longer exists
      try {
        const { data: rem, error: remErr } = await supabase.from('tournament_participants').select('*').eq('tournament_id', t.id).eq('email', addr).limit(1).single()
        if (rem) {
          startLogger.warn('[Tournaments] Supabase leave verify failed: still exists')
          return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: 'still exists' })
        }
        // If remErr means no rows, it's fine
      } catch (err) {
        // If single() errors because no rows found, supabase returns an error; ignore
        if (err && err.message && err.message.includes('no rows')) {
          // expected
        } else {
          startLogger.warn('[Tournaments] Supabase leave verify exception:', err && err.message)
        }
      }
    }
    persistTournamentsToDisk()
  } catch (err) {
    startLogger.warn('[Tournaments] Persist participant removal failed:', err && err.message)
    return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' })
  }
  const left = t.participants.length < before
  if (left) broadcastTournaments()
  res.json({ ok: true, left, tournament: t })
})

// Owner-only: set winner and grant prize (official ones only grant prize)
app.post('/api/admin/tournaments/winner', async (req, res) => {
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
  persistTournamentsToDisk()
  try {
    if (supabase) {
      const { error } = await supabase.from('tournaments').update({ status: t.status, winner_email: t.winnerEmail, payout_status: t.payoutStatus }).eq('id', t.id)
      if (error) {
  startLogger.warn('[Tournaments] Supabase winner update failed:', error)
        return res.status(500).json({ ok: false, error: 'DB_PERSIST_FAILED' })
      }
    }
  } catch (err) { startLogger.warn('[Tournaments] Supabase winner update failed:', err && err.message); return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' }) }
  broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

// Admin: list tournaments (owner only)
app.get('/api/admin/tournaments', requireAdmin, (req, res) => {
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
  persistTournamentsToDisk()
  try { (async () => {
    if (!supabase) return
    await supabase.from('tournaments').update({
      title: t.title,
      game: t.game,
      mode: t.mode,
      value: t.value,
      description: t.description,
      start_at: new Date(t.startAt).toISOString(),
      checkin_minutes: t.checkinMinutes,
      capacity: t.capacity,
      status: t.status,
      prize_type: t.prizeType || null,
      prize_amount: t.prizeAmount || null,
      currency: t.currency || null,
      starting_score: t.startingScore || null
    }).eq('id', t.id)
  })() } catch (err) { startLogger.warn('[Tournaments] Supabase update failed:', err && err.message) }
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
  persistTournamentsToDisk()
  try { (async () => {
    if (!supabase) return
    await supabase.from('tournaments').delete().eq('id', id)
    await supabase.from('tournament_participants').delete().eq('tournament_id', id)
  })() } catch (err) { startLogger.warn('[Tournaments] Supabase delete failed:', err && err.message) }
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
  persistTournamentsToDisk()
  try { (async () => {
    if (!supabase) return
    await supabase.from('tournaments').delete().eq('id', id)
    await supabase.from('tournament_participants').delete().eq('tournament_id', id)
  })() } catch (err) { startLogger.warn('[Tournaments] Supabase delete failed:', err && err.message) }
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

// Admin: force re-broadcast of tournaments to all instances
app.post('/api/admin/tournaments/broadcast', (req, res) => {
  const owner = getAdminFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  try {
    const arr = Array.from(tournaments.values())
    // Broadcast locally
    for (const client of wss.clients) { if (client.readyState === 1) client.send(JSON.stringify({ type: 'tournaments', tournaments: arr })) }
    // Publish cross-instance
  publishTournamentUpdate(arr).catch(err => startLogger.warn('[Tournaments] publishTournamentUpdate error:', err && err.message))
    res.json({ ok: true })
  } catch (err) {
    startLogger.warn('[Tournaments] force broadcast failed:', err && err.message)
    res.status(500).json({ ok: false, error: 'BROADCAST_FAILED' })
  }
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
