const jwt = require('jsonwebtoken');
const dotenv = require('dotenv'); dotenv.config({ path: require('path').join(__dirname, '.env') });
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

const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
// Central debug flag for runtime logs
const DEBUG = String(process.env.NDN_DEBUG || '').toLowerCase() === '1'
// Create structured logger early
const startLogger = pino({ level: DEBUG ? 'debug' : (process.env.NDN_LOG_LEVEL || 'info') })
// Track HTTPS runtime status and port
let HTTPS_ACTIVE = false
let HTTPS_PORT = Number(process.env.HTTPS_PORT || 8788)
const app = express();

// Global error handlers
process.on('uncaughtException', (err) => {
  startLogger.error('Uncaught Exception: %s', err && err.stack ? err.stack : err);
  // process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  startLogger.error('Unhandled Rejection at: %s reason: %s', promise, reason);
  // process.exit(1);
});

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  startLogger.warn('[DB] Supabase not configured - using in-memory storage only');
}

// Initialize Redis for cross-server session management
let redisClient = null;

// DEBUG: Check Redis configuration
startLogger.debug('🔍 DEBUG: REDIS_URL exists: %s', !!process.env.REDIS_URL);
startLogger.debug('🔍 DEBUG: UPSTASH_REDIS_REST_URL exists: %s', !!process.env.UPSTASH_REDIS_REST_URL);
startLogger.debug('🔍 DEBUG: UPSTASH_REDIS_REST_TOKEN exists: %s', !!process.env.UPSTASH_REDIS_REST_TOKEN);

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Use Upstash Redis (REST-based, better for serverless)
  const { Redis } = require('@upstash/redis');
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  startLogger.info('[REDIS] Using Upstash Redis');
} else if (process.env.REDIS_URL) {
  // Fallback to standard Redis client
  const redis = require('redis');
  redisClient = redis.createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => startLogger.error('[REDIS] Error: %s', err && err.message ? err.message : err));
  redisClient.on('connect', () => startLogger.info('[REDIS] Connected'));
  redisClient.connect().catch(err => startLogger.warn('[REDIS] Failed to connect: %s', err && err.message ? err.message : err));
} else {
  startLogger.warn('[REDIS] Not configured - using in-memory storage for sessions');
}

// Database helper functions
const db = {
  // Rooms
  async createRoom(roomId) {
    if (!supabase) return;
    await supabase.from('rooms').insert([{ id: roomId }]);
  },

  async getRoomMembers(roomId) {
    if (!supabase) return [];
    const { data } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId);
    return data || [];
  },

  async addRoomMember(roomId, clientId, username, email) {
    if (!supabase) return;
    await supabase.from('room_members').insert([{
      room_id: roomId,
      client_id: clientId,
      username,
      email
    }]);
  },

  async removeRoomMember(roomId, clientId) {
    if (!supabase) return;
    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('client_id', clientId);
  },

  async deleteRoom(roomId) {
    if (!supabase) return;
    await supabase.from('rooms').delete().eq('id', roomId);
  },

  // Matches
  async createMatch(match) {
    if (!supabase) return;
    await supabase.from('matches').insert([match]);
  },

  async getMatches() {
    if (!supabase) return [];
    const { data } = await supabase.from('matches').select('*');
    return data || [];
  },

  async updateMatch(matchId, updates) {
    if (!supabase) return;
    await supabase
      .from('matches')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', matchId);
  },

  async deleteMatch(matchId) {
    if (!supabase) return;
    await supabase.from('matches').delete().eq('id', matchId);
  },

  // Tournaments
  async createTournament(tournament) {
    if (!supabase) return;
    const { error: upsertErr } = await supabase.from('tournaments').upsert(tournament, { onConflict: 'id' });
    if (upsertErr) throw upsertErr;
    // verify
    const { data: checkRow, error: checkErr } = await supabase.from('tournaments').select('*').eq('id', tournament.id).limit(1).single();
    if (checkErr) throw checkErr;
    return checkRow;
  },

  async getTournaments() {
    if (!supabase) return [];
    const { data } = await supabase.from('tournaments').select('*');
    return data || [];
  },

  async updateTournament(tournamentId, updates) {
    if (!supabase) return;
    await supabase
      .from('tournaments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', tournamentId);
  },

  async getTournamentParticipants(tournamentId) {
    if (!supabase) return [];
    const { data } = await supabase
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournamentId);
    return data || [];
  },

  async addTournamentParticipant(tournamentId, email, username) {
    if (!supabase) return;
    const { error: insErr } = await supabase.from('tournament_participants').upsert([{ 
      tournament_id: tournamentId,
      email,
      username
    }], { onConflict: 'tournament_id,email' });
    if (insErr) throw insErr;
    // Verify participant exists
    const { data: part, error: qErr } = await supabase.from('tournament_participants').select('*').eq('tournament_id', tournamentId).eq('email', email).limit(1).single();
    if (qErr) throw qErr;
    return part;
  },

  async removeTournamentParticipant(tournamentId, email) {
    if (!supabase) return;
    const { error: delErr } = await supabase
      .from('tournament_participants')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('email', email);
    if (delErr) throw delErr;
  },

  // Friendships
  async getFriendships(userEmail) {
    if (!supabase) return [];
    const { data } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_email.eq.${userEmail},friend_email.eq.${userEmail}`);
    return data || [];
  },

  async addFriendship(userEmail, friendEmail) {
    if (!supabase) return;
    // Ensure consistent ordering to prevent duplicates
    const [email1, email2] = [userEmail, friendEmail].sort();
    await supabase.from('friendships').insert([{
      user_email: email1,
      friend_email: email2
    }]);
  },

  async removeFriendship(userEmail, friendEmail) {
    if (!supabase) return;
    const [email1, email2] = [userEmail, friendEmail].sort();
    await supabase
      .from('friendships')
      .delete()
      .eq('user_email', email1)
      .eq('friend_email', email2);
  },

  // Camera sessions
  async createCameraSession(code, desktopClientId, expiresAt) {
    if (!supabase) return;
    await supabase.from('camera_sessions').insert([{
      code,
      desktop_client_id: desktopClientId,
      expires_at: expiresAt.toISOString()
    }]);
  },

  async getCameraSession(code) {
    if (!supabase) return null;
    const { data } = await supabase
      .from('camera_sessions')
      .select('*')
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .single();
    return data;
  },

  async updateCameraSession(code, updates) {
    if (!supabase) return;
    await supabase
      .from('camera_sessions')
      .update(updates)
      .eq('code', code);
  },

  async deleteExpiredCameraSessions() {
    if (!supabase) return;
    await supabase
      .from('camera_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());
  }
};

// Redis helper functions for cross-server session management
const redisHelpers = {
  // User sessions (shared across servers)
  async setUserSession(email, sessionData) {
    if (!redisClient) return;
    await redisClient.set(`user:${email}`, JSON.stringify(sessionData), { EX: 3600 }); // 1 hour expiry
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
    await redisClient.sAdd(`room:${roomId}:members`, userEmail);
    await redisClient.hSet(`room:${roomId}:memberData`, userEmail, JSON.stringify(userData));
  },

  async removeUserFromRoom(roomId, userEmail) {
    if (!redisClient) return;
    await redisClient.sRem(`room:${roomId}:members`, userEmail);
    await redisClient.hDel(`room:${roomId}:memberData`, userEmail);
  },

  async getRoomMembers(roomId) {
    if (!redisClient) return [];
    const members = await redisClient.sMembers(`room:${roomId}:members`);
    const memberData = [];
    for (const email of members) {
      const data = await redisClient.hGet(`room:${roomId}:memberData`, email);
      if (data) memberData.push(JSON.parse(data));
    }
    return memberData;
  },

  async getRoomMemberCount(roomId) {
    if (!redisClient) return 0;
    return await redisClient.sCard(`room:${roomId}:members`);
  },

  async deleteRoom(roomId) {
    if (!redisClient) return;
    await redisClient.del(`room:${roomId}:members`);
    await redisClient.del(`room:${roomId}:memberData`);
  },

  // Active rooms tracking
  async addActiveRoom(roomId) {
    if (!redisClient) return;
    await redisClient.sAdd('active_rooms', roomId);
  },

  async removeActiveRoom(roomId) {
    if (!redisClient) return;
    await redisClient.sRem('active_rooms', roomId);
  },

  async getActiveRooms() {
    if (!redisClient) return [];
    return await redisClient.sMembers('active_rooms');
  }
};

// Observability: metrics registry
// const register = new client.Registry()
// client.collectDefaultMetrics({ register })
// const httpRequestsTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method','route','status'] })
// const wsConnections = new client.Gauge({ name: 'ws_connections', help: 'Current WebSocket connections' })
// const wsRooms = new client.Gauge({ name: 'ws_rooms', help: 'Current active rooms' })
// const chatMessagesTotal = new client.Counter({ name: 'chat_messages_total', help: 'Total WS chat messages relayed' })
// const errorsTotal = new client.Counter({ name: 'server_errors_total', help: 'Total server errors', labelNames: ['scope'] })
// const celebrations180Total = new client.Counter({ name: 'celebrations_180_total', help: 'Total 180 celebrations broadcast' })
// register.registerMetric(httpRequestsTotal)
// register.registerMetric(wsConnections)
// register.registerMetric(wsRooms)
// register.registerMetric(chatMessagesTotal)
// register.registerMetric(errorsTotal)
// register.registerMetric(celebrations180Total)

// Security & performance
// app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
// app.use(cors())
app.use(compression())
// const limiter = rateLimit({ windowMs: 60 * 1000, max: 600 })
// app.use(limiter)
// Logging
// const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
// app.use(pinoHttp({ logger, genReqId: (req) => req.headers['x-request-id'] || nanoid(12) }))
// HTTP metrics middleware (after logging so route is known)
// app.use((req, res, next) => {
//   const start = Date.now()
//   res.on('finish', () => {
//     const route = (req.route && req.route.path) || req.path || 'unknown'
//     try { httpRequestsTotal.inc({ method: req.method, route, status: String(res.statusCode) }) } catch {}
//   })
//   next()
// })
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
  startLogger.info(`[SPA] Serving static frontend from %s`, staticBase)
} else {
  startLogger.warn('[SPA] No built frontend found at ../dist or ../app/dist; "/" will 404 (API+WS OK).')
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
  startLogger.error('[DB] Failed to save user to Supabase: %s', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'Failed to create account.' });
      }
    }

    // Store in Redis for cross-server session sharing
    await redisHelpers.setUserSession(email, {
      ...user,
      status: 'online',
      lastSeen: Date.now()
    });

    // Also store in memory for current session (fallback)
    users.set(email, user)

    // Create JWT token
    const token = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '100y' });
    return res.json({ user, token })
  } catch (error) {
  startLogger.error('[SIGNUP] Error: %s', error && error.message ? error.message : error);
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
  startLogger.error('[DB] Supabase login error: %s', error && error.message ? error.message : error);
      } else if (data && data.password === password) {
        user = {
          email: data.email,
          username: data.username,
          password: data.password,
          admin: data.admin || false
        };
        // Store in Redis for cross-server session sharing
        await redisHelpers.setUserSession(data.email, {
          ...user,
          status: 'online',
          lastSeen: Date.now()
        });
        // Cache in memory for current session (fallback)
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
  startLogger.error('[LOGIN] Error: %s', error && error.message ? error.message : error);
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
// Filter out empty-string overrides so template defaults are preserved
function nonEmpty(obj) {
  if (!obj) return {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) { if (v) out[k] = v }
  return out
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
  startLogger.error('[DB] Error fetching subscription: %s', err && err.message ? err.message : err);
    }
  }

  res.json({ fullAccess: false });
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
          startLogger.error('[DB] Failed to update subscription: %s', err && err.message ? err.message : err);
        }
      }
    }
  }
  // Demo: toggle fullAccess true
  subscription.fullAccess = true;
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
  startLogger.warn('[Stripe] init failed: %s', e?.message || e)
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
  startLogger.error('[Stripe] create-session failed: %s', e?.message || e)
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
  startLogger.error('[Stripe] create-checkout-session failed: %s', e?.message || e)
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
app.get('/api/admin/status', async (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const allMatches = await db.getMatches()
  res.json({
    ok: true,
    server: {
      clients: clients.size,
      rooms: rooms.size,
      matches: allMatches.length,
      premium: !!subscription.fullAccess,
      maintenance: !!maintenanceMode,
      lastAnnouncement,
    },
    matches: allMatches,
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

app.get('/api/admin/matches', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, matches: Array.from(matches.values()) })
})

app.post('/api/admin/matches/delete', async (req, res) => {
  const { matchId, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const match = await db.getMatch(matchId)
  if (!match) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  await db.deleteMatch(matchId)
  // Broadcast updated lobby
  if (wss) {
    const allMatches = await db.getMatches()
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(JSON.stringify({ type: 'matches', matches: allMatches }))
    }
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
  if (kind === 'reset') out = EmailTemplates.passwordReset({ username: 'Alex', actionUrl: 'https://example.com/reset?token=demo', ...nonEmpty(emailCopy.reset) })
  else if (kind === 'reminder') out = EmailTemplates.passwordReminder({ username: 'Alex', actionUrl: 'https://example.com/reset?token=demo', ...nonEmpty(emailCopy.reminder) })
  else if (kind === 'username') out = EmailTemplates.usernameReminder({ username: 'Alex', actionUrl: 'https://example.com/app', ...nonEmpty(emailCopy.username) })
  else if (kind === 'confirm-email') out = EmailTemplates.emailChangeConfirm({ username: 'Alex', newEmail: 'alex+new@example.com', actionUrl: 'https://example.com/confirm?token=demo', ...nonEmpty(emailCopy.confirmEmail) })
  else if (kind === 'changed') out = EmailTemplates.passwordChangedNotice({ username: 'Alex', supportUrl: 'https://example.com/support', ...nonEmpty(emailCopy.changed) })
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

// --- Email sending ---
// Priority: 1) Microsoft Graph API (OUTLOOK_CLIENT_ID etc.)
//           2) Resend HTTP API (RESEND_API_KEY)
//           3) SMTP (SMTP_* vars)
//           4) SUPPORT_EMAIL + SUPPORT_EMAIL_PASSWORD as SMTP fallback
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''

// --- Microsoft Graph API (send from Outlook.com via HTTP, no SMTP needed) ---
const OUTLOOK_CLIENT_ID     = process.env.OUTLOOK_CLIENT_ID || ''
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || ''
let   outlookRefreshToken    = process.env.OUTLOOK_REFRESH_TOKEN || ''
let   outlookAccessToken     = ''
let   outlookTokenExpiry     = 0
const GRAPH_ENABLED = !!(OUTLOOK_CLIENT_ID && OUTLOOK_CLIENT_SECRET && outlookRefreshToken)

if (GRAPH_ENABLED) {
  startLogger.info('[Email] ✅ Microsoft Graph API configured — emails sent from Outlook account')
}

async function refreshOutlookToken() {
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      client_secret: OUTLOOK_CLIENT_SECRET,
      refresh_token: outlookRefreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Send offline_access',
    }).toString(),
  })
  const data = await res.json()
  if (!data.access_token) {
    console.error('[Email] ❌ Outlook token refresh failed:', JSON.stringify(data))
    throw new Error('OUTLOOK_TOKEN_REFRESH_FAILED')
  }
  outlookAccessToken = data.access_token
  outlookTokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  if (data.refresh_token) outlookRefreshToken = data.refresh_token
  console.log('[Email] ✅ Outlook access token refreshed, expires in', data.expires_in, 's')
}

async function sendViaGraph(to, subject, html) {
  if (Date.now() >= outlookTokenExpiry) await refreshOutlookToken()
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${outlookAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Graph API ${res.status}: ${errBody.slice(0, 200)}`)
  }
  return { ok: true, provider: 'Microsoft Graph' }
}

// --- OAuth2 helper endpoints ---
app.get('/api/admin/outlook-auth', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  if (!OUTLOOK_CLIENT_ID) return res.status(400).json({ ok: false, error: 'Set OUTLOOK_CLIENT_ID env var first' })
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
  const redirectUri = `${proto}://${req.get('host')}/api/admin/outlook-callback`
  const authUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'
    + `client_id=${OUTLOOK_CLIENT_ID}&response_type=code`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&scope=${encodeURIComponent('https://graph.microsoft.com/Mail.Send offline_access')}`
    + `&response_mode=query`
  res.redirect(authUrl)
})

app.get('/api/admin/outlook-callback', async (req, res) => {
  const code = req.query.code
  if (!code) return res.status(400).send('No authorization code received.')
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
  const redirectUri = `${proto}://${req.get('host')}/api/admin/outlook-callback`
  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: OUTLOOK_CLIENT_ID,
        client_secret: OUTLOOK_CLIENT_SECRET,
        code: String(code),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Mail.Send offline_access',
      }).toString(),
    })
    const data = await tokenRes.json()
    if (data.refresh_token) {
      outlookRefreshToken = data.refresh_token
      outlookAccessToken  = data.access_token || ''
      outlookTokenExpiry  = Date.now() + ((data.expires_in || 3600) - 60) * 1000
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(`<h2>✅ Outlook Connected!</h2><p>Add to Render env vars:</p><textarea readonly rows="4" cols="80" onclick="this.select()">OUTLOOK_REFRESH_TOKEN=${data.refresh_token}</textarea>`)
    } else {
      res.status(400).send(`<h2>❌ Failed</h2><pre>${JSON.stringify(data, null, 2)}</pre>`)
    }
  } catch (err) {
    res.status(500).send(`<h2>❌ Error</h2><pre>${err.message}</pre>`)
  }
})

app.post('/api/admin/test-email', async (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const target = String(req.body?.to || owner.email || '').toLowerCase()
  if (!target || !target.includes('@')) return res.status(400).json({ ok: false, error: 'No email address' })
  try {
    await sendMail(target, '🎯 NDN Test Email', '<div style="font-family:sans-serif;padding:24px;"><h2>✅ Email is working!</h2><p>This test email was sent from Nine Dart Nation.</p></div>')
    res.json({ ok: true, message: `Test email sent to ${target}` })
  } catch (err) {
    res.json({ ok: false, error: err?.message || 'Failed to send test email' })
  }
})

// Resolve SMTP credentials — try SMTP_* first, then SUPPORT_EMAIL as fallback
let SMTP_HOST_RESOLVED = process.env.SMTP_HOST || ''
let SMTP_PORT_RESOLVED = process.env.SMTP_PORT || ''
let SMTP_USER_RESOLVED = process.env.SMTP_USER || ''
let SMTP_PASS_RESOLVED = process.env.SMTP_PASS || ''
let smtpSource = 'SMTP_*'

if (!RESEND_API_KEY && !GRAPH_ENABLED && (!SMTP_HOST_RESOLVED || !SMTP_USER_RESOLVED || !SMTP_PASS_RESOLVED)) {
  const supportEmail = process.env.SUPPORT_EMAIL || ''
  const supportPass  = process.env.SUPPORT_EMAIL_PASSWORD || ''
  if (supportEmail && supportPass) {
    const domain = supportEmail.split('@')[1]?.toLowerCase() || ''
    let guessHost = ''
    let guessPort = '587'
    if (domain === 'gmail.com' || domain === 'googlemail.com') { guessHost = 'smtp.gmail.com'; guessPort = '587' }
    else if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live.com')) { guessHost = 'smtp-mail.outlook.com'; guessPort = '587' }
    else if (domain.includes('yahoo')) { guessHost = 'smtp.mail.yahoo.com'; guessPort = '587' }
    else { guessHost = `smtp.${domain}`; guessPort = '587' }
    SMTP_HOST_RESOLVED = SMTP_HOST_RESOLVED || guessHost
    SMTP_PORT_RESOLVED = SMTP_PORT_RESOLVED || guessPort
    SMTP_USER_RESOLVED = SMTP_USER_RESOLVED || supportEmail
    SMTP_PASS_RESOLVED = SMTP_PASS_RESOLVED || supportPass
    smtpSource = 'SUPPORT_EMAIL'
    console.log('[Email] Using SUPPORT_EMAIL credentials as SMTP fallback → host:', guessHost)
  }
}

const EMAIL_FROM = process.env.SMTP_FROM
  || process.env.SMTP_FORM
  || process.env.EMAIL_FROM
  || SMTP_USER_RESOLVED
  || process.env.SUPPORT_EMAIL
  || 'noreply@ninedartnation.com'

// Resend-specific FROM: Resend can only send from verified domains.
// Free tier uses onboarding@resend.dev — outlook.com / gmail.com CANNOT be verified.
const RESEND_FROM = process.env.RESEND_FROM || 'Nine Dart Nation <onboarding@resend.dev>'

if (RESEND_API_KEY) {
  startLogger.info('[Email] ✅ Resend API key configured — using HTTP email delivery')
  startLogger.info('[Email] Resend FROM: %s', RESEND_FROM)
}

let mailer = null
if (!RESEND_API_KEY && !GRAPH_ENABLED) {
  try {
    if (SMTP_HOST_RESOLVED && SMTP_PORT_RESOLVED && SMTP_USER_RESOLVED && SMTP_PASS_RESOLVED) {
      mailer = nodemailer.createTransport({
        host: SMTP_HOST_RESOLVED,
        port: Number(SMTP_PORT_RESOLVED),
        secure: Number(SMTP_PORT_RESOLVED) === 465,
        auth: { user: SMTP_USER_RESOLVED, pass: SMTP_PASS_RESOLVED },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        tls: { rejectUnauthorized: false },
      })
      startLogger.info('[Email] SMTP transporter created (source: %s) → host: %s  port: %s  user: %s  from: %s',
        smtpSource, SMTP_HOST_RESOLVED, SMTP_PORT_RESOLVED, SMTP_USER_RESOLVED, EMAIL_FROM)
      mailer.verify().then(() => {
        startLogger.info('[Email] ✅ SMTP connection verified successfully')
      }).catch((err) => {
        startLogger.error('[Email] ❌ SMTP connection verification failed: %s', err?.message || err)
        startLogger.error('[Email] 💡 Outlook SMTP is blocked from cloud hosts. Use Graph API: set OUTLOOK_CLIENT_ID + OUTLOOK_CLIENT_SECRET')
      })
    } else {
      startLogger.warn('[Email] ⚠️  No email provider configured.')
      startLogger.warn('[Email] Option 1 (Outlook): Set OUTLOOK_CLIENT_ID + OUTLOOK_CLIENT_SECRET + OUTLOOK_REFRESH_TOKEN')
      startLogger.warn('[Email] Option 2: Set RESEND_API_KEY')
      startLogger.warn('[Email] Option 3: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS')
    }
  } catch (e) {
    startLogger.warn('[Email] transporter init failed: %s', e?.message || e)
  }
}

const SEND_MAIL_TIMEOUT_MS = 30000
async function sendMail(to, subject, html) {
  const startMs = Date.now()
  const provider = GRAPH_ENABLED ? 'Graph' : RESEND_API_KEY ? 'Resend' : (mailer ? 'SMTP' : 'NONE')
  console.log('[Email] Sending to', to, 'via', provider, '— subject:', subject.slice(0, 50))

  // --- Microsoft Graph API (Outlook.com) ---
  if (GRAPH_ENABLED) {
    try {
      const result = await Promise.race([
        sendViaGraph(to, subject, html),
        new Promise((_, reject) => setTimeout(() => reject(new Error('EMAIL_SEND_TIMEOUT')), SEND_MAIL_TIMEOUT_MS)),
      ])
      console.log('[Email] ✅ Sent via Graph API in', Date.now() - startMs, 'ms')
      return result
    } catch (err) {
      console.error('[Email] ❌ Graph API failed after', Date.now() - startMs, 'ms:', err?.message || err)
      throw err
    }
  }

  if (RESEND_API_KEY) {
    try {
      const res = await Promise.race([
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('EMAIL_SEND_TIMEOUT')), SEND_MAIL_TIMEOUT_MS)),
      ])
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('[Email] ❌ Resend error:', res.status, JSON.stringify(data))
        throw new Error(data?.message || `Resend API error ${res.status}`)
      }
      console.log('[Email] ✅ Sent via Resend in', Date.now() - startMs, 'ms — id:', data?.id)
      return data
    } catch (err) {
      console.error('[Email] ❌ Resend failed after', Date.now() - startMs, 'ms:', err?.message || err)
      throw err
    }
  }

  if (!mailer) {
    console.error('[Email] ❌ No email provider configured — cannot send')
    throw new Error('EMAIL_NOT_CONFIGURED')
  }
  try {
    const result = await Promise.race([
      mailer.sendMail({ from: EMAIL_FROM, to, subject, html }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('EMAIL_SEND_TIMEOUT')), SEND_MAIL_TIMEOUT_MS)),
    ])
    console.log('[Email] ✅ Sent via SMTP in', Date.now() - startMs, 'ms — messageId:', result?.messageId)
    return result
  } catch (err) {
    console.error('[Email] ❌ SMTP failed after', Date.now() - startMs, 'ms:', err?.message || err)
    throw err
  }
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
    // Look up user to verify email exists before sending
    let foundUser = null
    for (const u of users.values()) {
      if (String(u.email || '').toLowerCase() === email) { foundUser = u; break }
    }
    if (!foundUser && supabase) {
      try {
        const { data } = await supabase.from('users').select('*').eq('email', email).single()
        if (data) { foundUser = data; users.set(email, data) }
      } catch {}
    }
    if (!foundUser) return res.status(400).json({ ok: false, error: 'No account found with that email.' })
    const token = issueToken(email)
    const frontendUrl = (process.env.FRONTEND_URL || req.headers.origin || 'https://ninedartnation.netlify.app').replace(/\/+$/, '')
    const actionUrl = `${frontendUrl}/reset?token=${encodeURIComponent(token)}`
    const displayName = foundUser.username || email.split('@')[0]
    const tpl = EmailTemplates.passwordReset({ username: displayName, actionUrl, ...nonEmpty(emailCopy.reset) })
    await sendMail(email, 'Reset your Nine Dart Nation password', tpl.html)
    res.json({ ok: true })
  } catch (e) {
    console.error('[send-reset] Error:', e?.message || e)
    const msg = e?.message || 'SEND_FAILED'
    res.status(500).json({ ok: false, error: msg })
  }
})

// Send username reminder to email
app.post('/api/auth/send-username', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase()
    if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
    let foundUser = null
    for (const u of users.values()) {
      if (String(u.email || '').toLowerCase() === email) { foundUser = u; break }
    }
    if (!foundUser && supabase) {
      try {
        const { data } = await supabase.from('users').select('*').eq('email', email).single()
        if (data) { foundUser = data; users.set(email, data) }
      } catch {}
    }
    if (!foundUser) return res.status(400).json({ ok: false, error: 'No account found with that email.' })
    const frontendUrl = (process.env.FRONTEND_URL || req.headers.origin || 'https://ninedartnation.netlify.app').replace(/\/+$/, '')
    const actionUrl = `${frontendUrl}/`
    const tpl = EmailTemplates.usernameReminder({ username: foundUser.username || email.split('@')[0], actionUrl, ...nonEmpty(emailCopy.username) })
    await sendMail(email, 'Your Nine Dart Nation username', tpl.html)
    res.json({ ok: true })
  } catch (e) {
    console.error('[send-username] Error:', e?.message || e)
    res.status(500).json({ ok: false, error: e?.message||'SEND_FAILED' })
  }
})

// Confirm password reset with token — updates password in memory + Supabase
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
    const hashed = await bcrypt.hash(String(newPassword), 12)
    const memUser = users.get(email)
    if (memUser) {
      memUser.password = hashed
      users.set(email, memUser)
    }
    if (supabase) {
      try {
        const { error: updateErr } = await supabase
          .from('users')
          .update({ password: hashed })
          .eq('email', email)
        if (updateErr) console.error('[confirm-reset] Supabase update error:', updateErr)
        else console.log('[confirm-reset] Password updated in Supabase for', email)
      } catch (dbErr) {
        console.error('[confirm-reset] Supabase exception:', dbErr)
      }
    }
    resetTokens.delete(email)
    try {
      const frontendUrl = (process.env.FRONTEND_URL || 'https://ninedartnation.netlify.app').replace(/\/+$/, '')
      const tpl = EmailTemplates.passwordChangedNotice({ username: (memUser?.username || email.split('@')[0]), supportUrl: `${frontendUrl}/`, ...emailCopy.changed })
      await sendMail(email, 'Your Nine Dart Nation password was changed', tpl.html)
    } catch {}
    res.json({ ok: true })
  } catch (e) {
    console.error('[confirm-reset] Error:', e?.message || e)
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
  startLogger.info(`[HTTP] Server listening on 0.0.0.0:%s`, PORT)
  if (hosts.length) {
  for (const ip of hosts) startLogger.info(`       LAN:  http://%s:%s`, ip, PORT)
  } else {
  startLogger.info(`       TIP: open http://localhost:%s on this PC; phones use your LAN IP`, PORT)
  }
});
// Constrain ws payload size for safety
const wss = null; // new WebSocketServer({ server, path: '/ws', maxPayload: 128 * 1024 });
startLogger.info('[WS] WebSocket disabled for debugging');
// wsConnections.set(0)

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
  startLogger.info(`[HTTPS] Server listening on 0.0.0.0:%s`, HTTPS_PORT)
        HTTPS_ACTIVE = true
        if (hosts.length) {
          for (const ip of hosts) startLogger.info(`        LAN: https://%s:%s`, ip, HTTPS_PORT)
        }
      })
      // Attach a secure WebSocket for HTTPS clients
      wssSecure = new WebSocketServer({ server: httpsServer, maxPayload: 128 * 1024 })
  startLogger.info(`[WS] Secure WebSocket attached to HTTPS server`)
    } else {
  startLogger.warn(`[HTTPS] NDN_HTTPS=1 but cert files not found. Expected at:\n  key: %s\n  cert: %s`, keyPath, certPath)
    }
  }
} catch (e) {
  startLogger.warn('[HTTPS] Failed to initialize HTTPS server: %s', e?.message || e)
}

// Load persistent data from database on startup
async function loadPersistentData() {
  if (!supabase) return;

  try {
    // Load tournaments
    const tournamentsData = await db.getTournaments();
    for (const t of tournamentsData) {
      tournaments.set(t.id, t);
    }
  startLogger.info(`[DB] Loaded %d tournaments`, tournaments.size);

    // Load matches
    // Note: matches are loaded on-demand, not preloaded to avoid memory usage with 1.5k concurrent users

    // Clean up expired camera sessions
    await db.deleteExpiredCameraSessions();

  } catch (error) {
  startLogger.error('[DB] Failed to load persistent data: %s', error && error.message ? error.message : error);
  }
}

// Simple in-memory rooms (WebSocket connections - not persisted)
const rooms = new Map(); // roomId -> Set(ws)
// Simple in-memory match lobby (loaded from DB)
const matches = new Map(); // matchId -> match data
const clients = new Map(); // wsId -> ws (not persisted)
// WebRTC camera pairing sessions (stored in DB)
const camSessions = new Map();
const CAM_TTL_MS = 2 * 60 * 1000 // 2 minutes
function genCamCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = ''
  for (let i=0;i<4;i++) code += letters[Math.floor(Math.random()*letters.length)]
  if (camSessions.has(code)) return genCamCode()
  return code
}
// Simple in-memory tournaments (loaded from DB)
const tournaments = new Map();
// Simple in-memory users and friendships (demo)
// users: email -> { email, username, status: 'online'|'offline'|'ingame', wsId? }
const users = new Map();

// Load persistent data on startup
loadPersistentData();
//     try {
//       console.log('[DB] Loading users from Supabase...');
//       const { data, error } = await supabase
//         .from('users')
//         .select('*');

//       if (error) {
//         console.error('[DB] Failed to load users from Supabase:', error);
//       } else if (data) {
//         let loadedCount = 0;
//         for (const user of data) {
//           users.set(user.email, {
//             email: user.email,
//             username: user.username,
//             password: user.password,
//             admin: user.admin || false,
//             subscription: user.subscription || { fullAccess: false }
//           });
//           loadedCount++;
//         }
//         console.log(`[DB] Successfully loaded ${loadedCount} users from Supabase`);
//       } else {
//         console.log('[DB] No users found in Supabase');
//       }
//     } catch (err) {
//       console.error('[DB] Error loading users from Supabase:', err);
//     }
//   } else {
//     console.warn('[DB] Supabase not configured - using in-memory storage only');
//   }
// })();
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
  if (!wss) return
  const payload = (typeof data === 'string') ? data : JSON.stringify(data)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

async function broadcastTournaments() {
  const list = await db.getTournaments()
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
  for (const client of set) {
    if (client.readyState === 1 && client !== exceptWs) {
      client.send(payload);
    }
  }
}

if (wss) {
  wss.on('connection', async (ws, req) => {
  try { startLogger.debug('[WS] client connected path=%s origin=%s', req?.url||'/', req?.headers?.origin||'') } catch {}
    ws._id = nanoid(8);
    clients.set(ws._id, ws)
    wsConnections.inc()
    // Heartbeat
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    // Log low-level socket errors
    ws.on('error', (err) => {
  try { startLogger.warn('[WS] error id=%s message=%s', ws._id, err && err.message ? err.message : err) } catch {}
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
  try {
    const tournaments = await db.getTournaments()
    ws.send(JSON.stringify({ type: 'tournaments', tournaments }))
  } catch {}
  // Push matches snapshot on connect
  try {
    const matches = await db.getMatches()
    ws.send(JSON.stringify({ type: 'matches', matches }))
  } catch {}
  // Track presence if client later identifies

  ws.on('message', async (msg) => {
    if (typeof msg?.length === 'number' && msg.length > 128 * 1024) return
    if (!allowMessage()) return
    try {
      const data = JSON.parse(msg.toString());
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
           creatorEmail: ws._email || '',
           mode: (typeof data.mode === 'string' && data.mode.length > 0) ? data.mode : 'bestof',
           value: Number(data.value) || 1,
           startingScore: Number(data.startingScore) || 501,
           creatorAvg: Number(data.creatorAvg) || 0,
           game,
           requireCalibration: !!data.requireCalibration,
           createdAt: Date.now(),
         }
        await db.createMatch(m)
        // Broadcast lobby list to all (pre-stringified)
        const allMatches = await db.getMatches()
        const lobbyPayload = JSON.stringify({ type: 'matches', matches: allMatches })
        for (const client of wss.clients) {
          if (client.readyState === 1) client.send(lobbyPayload)
        }
      } else if (data.type === 'list-matches') {
        const matches = await db.getMatches()
        ws.send(JSON.stringify({ type: 'matches', matches }))
      } else if (data.type === 'list-tournaments') {
        const tournaments = await db.getTournaments()
        ws.send(JSON.stringify({ type: 'tournaments', tournaments }))
      } else if (data.type === 'join-match') {
        const m = await db.getMatch(data.matchId)
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
        // Store joiner info
        m.joinerId = ws._id
        m.joinerName = ws._username || `user-${ws._id}`
        m.joinerEmail = ws._email || ''
        try { await db.updateMatch(data.matchId, { joinerId: m.joinerId, joinerName: m.joinerName, joinerEmail: m.joinerEmail }) } catch {}
        const invitePayload = JSON.stringify({
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
        })
        // Send waiting ack to joiner
        try { ws.send(JSON.stringify({ type: 'invite-waiting', matchId: m.id, creatorName: m.creatorName })) } catch {}
        // Send invite to creator — 3-tier lookup: ID, username, email
        let creatorFound = false
        // 1) Direct ID lookup
        const creator = clients.get(m.creatorId)
        if (creator && creator.readyState === 1) {
          creator.send(invitePayload)
          creatorFound = true
        }
        // 2) Username fallback
        if (!creatorFound && m.creatorName) {
          for (const client of wss.clients) {
            if (client.readyState === 1 && client._username === m.creatorName && client._id !== ws._id) {
              client.send(invitePayload)
              m.creatorId = client._id
              try { await db.updateMatch(data.matchId, { creatorId: client._id }) } catch {}
              creatorFound = true
              break
            }
          }
        }
        // 3) Email fallback
        if (!creatorFound && m.creatorEmail) {
          for (const client of wss.clients) {
            if (client.readyState === 1 && client._email && client._email === m.creatorEmail && client._id !== ws._id) {
              client.send(invitePayload)
              m.creatorId = client._id
              try { await db.updateMatch(data.matchId, { creatorId: client._id }) } catch {}
              creatorFound = true
              break
            }
          }
        }
        startLogger.info('[JOIN-MATCH] %s wants to join match %s (creator=%s creatorFound=%s)', ws._username, data.matchId, m.creatorName, creatorFound)
      } else if (data.type === 'invite-accept') {
        // Creator accepted the invite — start prestart for both players
        const matchId = String(data.matchId || '')
        const m = await db.getMatch(matchId)
        if (!m) return
        const roomId = matchId
        const PRESTART_MS = (typeof PRESTART_SECONDS !== 'undefined' ? PRESTART_SECONDS : 15) * 1000
        // Find creator and joiner connections (3-tier lookup)
        let creatorWs = clients.get(m.creatorId)
        if (!creatorWs || creatorWs.readyState !== 1) {
          for (const c of wss.clients) {
            if (c.readyState === 1 && ((m.creatorName && c._username === m.creatorName) || (m.creatorEmail && c._email === m.creatorEmail))) {
              creatorWs = c; m.creatorId = c._id; break
            }
          }
        }
        let joinerWs = m.joinerId ? clients.get(m.joinerId) : null
        if (!joinerWs || joinerWs.readyState !== 1) {
          for (const c of wss.clients) {
            if (c.readyState === 1 && ((m.joinerName && c._username === m.joinerName) || (m.joinerEmail && c._email === m.joinerEmail))) {
              joinerWs = c; m.joinerId = c._id; break
            }
          }
        }
        const payload = JSON.stringify({ type: 'match-prestart', roomId, match: m, prestartEndsAt: Date.now() + PRESTART_MS })
        if (creatorWs && creatorWs.readyState === 1) try { creatorWs.send(payload) } catch {}
        if (joinerWs && joinerWs.readyState === 1) try { joinerWs.send(payload) } catch {}
        await db.deleteMatch(matchId)
        // Broadcast updated lobby
        try {
          const remaining = await db.getMatches()
          const lobbyUpdate = JSON.stringify({ type: 'matches', matches: remaining })
          for (const c of wss.clients) { if (c.readyState === 1) try { c.send(lobbyUpdate) } catch {} }
        } catch {}
        startLogger.info('[INVITE-ACCEPT] creator accepted invite for match %s — prestart sent to both', matchId)
      } else if (data.type === 'invite-decline') {
        // Creator declined the invite
        const matchId = String(data.matchId || '')
        const m = await db.getMatch(matchId)
        if (!m) return
        // Notify the joiner
        let joinerWs = m.joinerId ? clients.get(m.joinerId) : null
        if (!joinerWs || joinerWs.readyState !== 1) {
          for (const c of wss.clients) {
            if (c.readyState === 1 && ((m.joinerName && c._username === m.joinerName) || (m.joinerEmail && c._email === m.joinerEmail))) {
              joinerWs = c; break
            }
          }
        }
        if (joinerWs && joinerWs.readyState === 1) {
          try { joinerWs.send(JSON.stringify({ type: 'declined', matchId })) } catch {}
        }
        // Clear joiner info but keep the match available
        try { await db.updateMatch(matchId, { joinerId: null, joinerName: null, joinerEmail: null }) } catch {}
        // Broadcast updated lobby
        try {
          const remaining = await db.getMatches()
          const lobbyUpdate = JSON.stringify({ type: 'matches', matches: remaining })
          for (const c of wss.clients) { if (c.readyState === 1) try { c.send(lobbyUpdate) } catch {} }
        } catch {}
        startLogger.info('[INVITE-DECLINE] creator declined match %s', matchId)
      } else if (data.type === 'invite-response') {
        const { matchId, accept, toId } = data
        const m = await db.getMatch(matchId)
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
          await db.deleteMatch(matchId)
          // Mark both players as in-game and store match metadata for friends list
          try {
            const creatorEmail = creator?._email || ''
            const requesterEmail = requester?._email || ''
            if (creatorEmail) {
              // Update Redis session
              const creatorSession = await redisHelpers.getUserSession(creatorEmail);
              if (creatorSession) {
                creatorSession.status = 'ingame';
                creatorSession.lastSeen = Date.now();
                creatorSession.currentRoomId = roomId;
                creatorSession.currentMatch = { game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore };
                await redisHelpers.setUserSession(creatorEmail, creatorSession);
              }
              // Update local cache
              const u = users.get(creatorEmail) || { email: creatorEmail, username: creator?._username || creatorEmail, status: 'online' }
              u.status = 'ingame'; u.lastSeen = Date.now();
              u.currentRoomId = roomId; u.currentMatch = { game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore }
              users.set(creatorEmail, u)
            }
            if (requesterEmail) {
              // Update Redis session
              const requesterSession = await redisHelpers.getUserSession(requesterEmail);
              if (requesterSession) {
                requesterSession.status = 'ingame';
                requesterSession.lastSeen = Date.now();
                requesterSession.currentRoomId = roomId;
                requesterSession.currentMatch = { game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore };
                await redisHelpers.setUserSession(requesterEmail, requesterSession);
              }
              // Update local cache
              const u2 = users.get(requesterEmail) || { email: requesterEmail, username: requester?._username || requesterEmail, status: 'online' }
              u2.status = 'ingame'; u2.lastSeen = Date.now();
              u2.currentRoomId = roomId; u2.currentMatch = { game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore }
              users.set(requesterEmail, u2)
            }
          } catch {}
        } else {
          if (requester && requester.readyState === 1) requester.send(JSON.stringify({ type: 'declined', matchId }))
          await db.deleteMatch(matchId)
        }
        // Broadcast updated lobby
        const allMatches2 = await db.getMatches()
        const lobbyPayload2 = JSON.stringify({ type: 'matches', matches: allMatches2 })
        for (const client of wss.clients) {
          if (client.readyState === 1) client.send(lobbyPayload2)
        }
      } else if (data.type === 'cancel-match') {
        const id = String(data.matchId || '')
        const m = await db.getMatch(id)
        if (!m) return
        // Only the creator may cancel
        if (m.creatorId !== ws._id) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only the creator can cancel this match.' })) } catch {}
          return
        }
        await db.deleteMatch(id)
        const allMatches = await db.getMatches()
        const lobbyPayload = JSON.stringify({ type: 'matches', matches: allMatches })
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
      } else if (data.type === 'cam-offer' || data.type === 'cam-answer' || data.type === 'cam-ice' || data.type === 'cam-calibration') {
        const code = String(data.code || '').toUpperCase()
        const sess = camSessions.get(code)
        if (!sess) return
        // Route to the OTHER peer: if sender is desktop, forward to phone and vice versa
        const targetId = (ws._id === sess.desktopId) ? sess.phoneId : sess.desktopId
        const target = clients.get(targetId)
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ type: data.type, code, payload: data.payload }))
        }
      } else if (data.type === 'start-friend-match') {
        const toEmail = String(data.toEmail || '').toLowerCase()
        const game = typeof data.game === 'string' ? data.game : 'X01'
  const mode = (typeof data.mode === 'string' && data.mode.length > 0) ? data.mode : 'bestof'
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
            // Update Redis session
            const meSession = await redisHelpers.getUserSession(meEmail);
            if (meSession) {
              meSession.status = 'ingame';
              meSession.lastSeen = Date.now();
              meSession.currentRoomId = roomId;
              meSession.currentMatch = { game, mode, value, startingScore };
              await redisHelpers.setUserSession(meEmail, meSession);
            }
            // Update local cache
            const u = users.get(meEmail) || { email: meEmail, username: ws._username || meEmail, status: 'online' }
            u.status = 'ingame'; u.lastSeen = Date.now();
            u.currentRoomId = roomId; u.currentMatch = { game, mode, value, startingScore }
            users.set(meEmail, u)
          }
          if (toEmailReal) {
            // Update Redis session
            const toSession = await redisHelpers.getUserSession(toEmailReal);
            if (toSession) {
              toSession.status = 'ingame';
              toSession.lastSeen = Date.now();
              toSession.currentRoomId = roomId;
              toSession.currentMatch = { game, mode, value, startingScore };
              await redisHelpers.setUserSession(toEmailReal, toSession);
            }
            // Update local cache
            const u2 = users.get(toEmailReal) || { email: toEmailReal, username: users.get(toEmailReal)?.username || toEmailReal, status: 'online' }
            u2.status = 'ingame'; u2.lastSeen = Date.now();
            u2.currentRoomId = roomId; u2.currentMatch = { game, mode, value, startingScore }
            users.set(toEmailReal, u2)
          }
        } catch {}
      }
    } catch (e) {
      try { errorsTotal.inc({ scope: 'ws_message' }) } catch {}
  startLogger.error('Invalid message: %s', e && e.message ? e.message : e);
    }
  });

  ws.on('close', async (code, reasonBuf) => {
    const reason = (() => { try { return reasonBuf ? reasonBuf.toString() : '' } catch { return '' } })()
  try { startLogger.debug('[WS] close id=%s code=%s reason=%s', ws._id, code, reason) } catch {}
    // Clean up room
    await leaveRoom(ws);
    try { wsConnections.dec() } catch {}
    // Instead of immediately removing matches, keep them for a grace period
    // (2 minutes) so the creator can reconnect.
    const disconnectedId = ws._id
    const disconnectedUsername = ws._username
    setTimeout(async () => {
      try {
        const allMatches = await db.getMatches()
        for (const m of allMatches) {
          if (m.creatorId === disconnectedId) {
            let reconnected = false
            for (const client of wss.clients) {
              if (client.readyState === 1 && client._username && client._username === disconnectedUsername) {
                reconnected = true
                try { await db.updateMatch(m.id, { creatorId: client._id }) } catch {}
                break
              }
            }
            if (!reconnected) {
              await db.deleteMatch(m.id)
              try {
                const remaining = await db.getMatches()
                const lobbyUpdate = JSON.stringify({ type: 'matches', matches: remaining })
                for (const client of wss.clients) { if (client.readyState === 1) client.send(lobbyUpdate) }
              } catch {}
            }
          }
        }
      } catch (e) { startLogger.warn('[WS] orphaned match cleanup error:', e) }
    }, 120000)
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
    const matchesList = await db.getMatches()
    const lobbyPayload3 = JSON.stringify({ type: 'matches', matches: matchesList })
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(lobbyPayload3)
    }
    // Cleanup any camera sessions involving this client
    for (const [code, sess] of Array.from(camSessions.entries())) {
      if (sess.desktopId === ws._id || sess.phoneId === ws._id) camSessions.delete(code)
    }
  });
});
}

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
  if (wss) {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        try { ws.terminate() } catch {}
        continue
      }
      ws.isAlive = false
      try { ws.ping() } catch {}
    }
  }
  // Clean up expired camera sessions
  const now = Date.now()
  for (const [code, sess] of camSessions.entries()) {
    if (now - (sess.ts || 0) > CAM_TTL_MS) camSessions.delete(code)
  }
}, HEARTBEAT_INTERVAL)

function shutdown() {
  startLogger.info('\n[Shutdown] closing servers...')
  try { clearInterval(hbTimer) } catch {}
  if (wss) try { wss.close() } catch {}
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
  // Store as a true 2-way thread.
  // We keep legacy `messages` (inbox by recipient) for backwards compatibility,
  // plus a new `dmThreads` map keyed by a canonical pair key.
  const now = Date.now()
  const id = `${now}-${Math.random().toString(36).slice(2,8)}`
  const threadKey = [from, to].sort().join('|')
  if (!global.dmThreads) global.dmThreads = new Map()
  const dmThreads = global.dmThreads
  const thread = dmThreads.get(threadKey) || []
  const item = { id, from, to, message: msg, ts: now, readBy: [from] }
  thread.push(item)
  dmThreads.set(threadKey, thread)

  // Legacy inbox storage (recipient only). Keep shape compatible with prior UI.
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

// Fetch recent inbox messages (legacy endpoint).
// Now includes best-effort read state if available.
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

// WS heartbeat interval to drop dead peers (moved earlier; keep single definition)

// Tournaments HTTP API (demo)
app.get('/api/tournaments', async (req, res) => {
  const tournaments = await db.getTournaments()
  res.json({ ok: true, tournaments })
})

app.post('/api/tournaments/create', async (req, res) => {
  const { title, game, mode, value, description, startAt, checkinMinutes, capacity, startingScore, creatorEmail, creatorName, prizeAmount, prizeNotes, requesterEmail, requireCalibration } = req.body || {}
  const id = nanoid(10)
  // Only the owner can create "official" tournaments or set prize metadata
  const isOwner = String(requesterEmail || '').toLowerCase() === OWNER_EMAIL
  const isOfficial = !!official && isOwner
  // Normalize prize metadata
  const pType = isOfficial ? 'premium' : 'none'
  const amount = isOfficial && isOwner ? Math.max(0, Number(prizeAmount) || 0) : 0
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
    prizeNotes: notes,
    status: 'scheduled',
    winnerEmail: null,
    creatorEmail: String(creatorEmail || ''),
    creatorName: String(creatorName || ''),
    createdAt: Date.now(),
    startingScore: (typeof startingScore === 'number' && startingScore>0) ? Math.floor(startingScore) : (String(game)==='X01' ? 501 : undefined),
  }
  await db.createTournament(t)
  await broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

app.post('/api/tournaments/join', async (req, res) => {
  const { tournamentId, email, username } = req.body || {}
  const t = await db.getTournament(String(tournamentId || ''))
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
  await db.updateTournament(t.id, t)
  await broadcastTournaments()
  res.json({ ok: true, joined: true, tournament: t })
})

// Leave a tournament (only allowed before it starts)
app.post('/api/tournaments/leave', async (req, res) => {
  const { tournamentId, email } = req.body || {}
  const t = await db.getTournament(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  const addr = String(email || '').toLowerCase()
  if (!addr) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const before = t.participants.length
  t.participants = t.participants.filter(p => p.email !== addr)
  const left = t.participants.length < before
  if (left) {
    await db.updateTournament(t.id, t)
    await broadcastTournaments()
  }
  res.json({ ok: true, left, tournament: t })
})

// Owner-only: set winner and grant prize (official ones only grant prize)
app.post('/api/admin/tournaments/winner', async (req, res) => {
  const { tournamentId, winnerEmail, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const t = await db.getTournament(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  t.status = 'completed'
  t.winnerEmail = String(winnerEmail || '').toLowerCase()
  if (t.official) {
    // default premium prize
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000
    premiumWinners.set(t.winnerEmail, Date.now() + ONE_MONTH)
  }
  await db.updateTournament(t.id, t)
  await broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

// Admin: list tournaments (owner only)
app.get('/api/admin/tournaments', async (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const tournaments = await db.getTournaments()
  res.json({ ok: true, tournaments })
})

// Admin: update tournament fields (owner only)
app.post('/api/admin/tournaments/update', async (req, res) => {
  const { tournamentId, patch, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const t = await db.getTournament(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  const allowed = ['title','game','mode','value','description','startAt','checkinMinutes','capacity','status','prizeType','prizeAmount','prizeNotes','startingScore']
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      if (k === 'prizeType') {
        t[k] = patch[k] === 'none' ? 'none' : 'premium'
      } else {
        t[k] = patch[k]
      }
    }
  }
  await db.updateTournament(t.id, t)
  await broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

// Admin: delete tournament
app.post('/api/admin/tournaments/delete', async (req, res) => {
  const { tournamentId, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const id = String(tournamentId || '')
  const t = await db.getTournament(id)
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  // Mark suppression window if official
  if (t.official) lastOfficialDeleteAt = Date.now()
  await db.deleteTournament(id)
  await broadcastTournaments()
  res.json({ ok: true })
})

// User: delete own tournament (only if scheduled and creator)
app.post('/api/tournaments/delete', async (req, res) => {
  const { tournamentId, requesterEmail } = req.body || {}
  const id = String(tournamentId || '')
  const reqEmail = String(requesterEmail || '').toLowerCase()
  const t = await db.getTournament(id)
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  // Only allowed if tournament is not started yet
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  // Permission: creator or owner can delete
  const isOwner = reqEmail === OWNER_EMAIL
  const isCreator = reqEmail && t.creatorEmail && reqEmail === String(t.creatorEmail).toLowerCase()
  if (!isOwner && !isCreator) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  if (t.official) lastOfficialDeleteAt = Date.now()
  await db.deleteTournament(id)
  await broadcastTournaments()
  res.json({ ok: true })
})

// Admin: reseed weekly official tournament
app.post('/api/admin/tournaments/reseed-weekly', async (req, res) => {
  const { requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  await ensureOfficialWeekly()
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

async function ensureOfficialWeekly() {
  const now = Date.now()
  // We want at least one scheduled official tournament in the future (for early enrollment)
  const allTournaments = await db.getTournaments()
  const upcoming = allTournaments.filter(t => t.official && t.status === 'scheduled')
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
      status: 'scheduled',
      winnerEmail: null,
      createdAt: Date.now(),
      startingScore: 501,
    }
    await db.createTournament(t)
    await broadcastTournaments()
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
        status: 'scheduled',
        winnerEmail: null,
        createdAt: Date.now(),
        startingScore: 501,
      }
      await db.createTournament(t2)
      await broadcastTournaments()
    }
  }
}

(async () => {
  await ensureOfficialWeekly()
})();

// Simple scheduler for reminders and start triggers
let lastOfficialDeleteAt = 0
const OFFICIAL_RESEED_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes after a manual delete, do not reseed
setInterval(async () => {
  const now = Date.now()
  const allTournaments = await db.getTournaments()
  for (const t of allTournaments) {
    if (t.status === 'scheduled') {
      // Reminder window
      const remindAt = t.startAt - (t.checkinMinutes * 60 * 1000)
      if (!t._reminded && now >= remindAt && now < t.startAt) {
        t._reminded = true
        await db.updateTournament(t.id, t)
        broadcastAll({ type: 'tournament-reminder', tournamentId: t.id, title: t.title, startAt: t.startAt, message: `Only ${t.checkinMinutes} minutes to go until the ${t.title} is live ÔÇö check in ready or lose your spot at 19:45!` })
      }
      // Start condition at start time with min participants 8 (for official) or 2 otherwise
      const minPlayers = t.official ? 8 : 2
      if (now >= t.startAt && t.participants.length >= minPlayers) {
        t.status = 'running'
        await db.updateTournament(t.id, t)
        broadcastAll({ type: 'tournament-start', tournamentId: t.id, title: t.title })
      }
      // If startAt passed and not enough players, leave scheduled; owner can adjust later
    }
  }
  // Continuously ensure next week's official tournament remains seeded for early enrollment
  if ((now - lastOfficialDeleteAt) > OFFICIAL_RESEED_COOLDOWN_MS) {
    await ensureOfficialWeekly()
  }
}, 30 * 1000)
