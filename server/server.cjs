const jwt = require('jsonwebtoken');
const dotenv = require('dotenv'); dotenv.config();
const upstashRestUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
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
// Track HTTPS runtime status and port
let HTTPS_ACTIVE = false
let HTTPS_PORT = Number(process.env.HTTPS_PORT || 8788)
const app = express();

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // process.exit(1);
});

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? (() => {
  try {
    return createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.error('[DB] Failed to create Supabase client:', err.message);
    return null;
  }
})() : null;

if (!supabase) {
  console.warn('[DB] Supabase not configured - using in-memory storage only');
}

// Initialize Redis for cross-server session management
const redis = require('redis');

const maskRedisUrl = (url) => url ? url.replace(/\/\/([^:@]+):[^@]+@/, '//$1:***@') : url;
const requiresTlsDowngrade = (err) => {
  if (!err) return false;
  const needle = 'ERR_SSL_PACKET_LENGTH_TOO_LONG';
  return err.code === needle || String(err.message || err).includes(needle);
};

const resolveRedisUrl = () => {
  const direct = process.env.REDIS_TLS_URL || process.env.REDIS_URL;
  if (direct && direct.trim()) return direct.trim();
  if (!process.env.REDIS_HOST) return null;
  const auth = process.env.REDIS_PASSWORD
    ? `${encodeURIComponent(process.env.REDIS_USERNAME || process.env.REDIS_USER || 'default')}:${encodeURIComponent(process.env.REDIS_PASSWORD)}@`
    : '';
  const protocol = process.env.REDIS_FORCE_TLS === '1' ? 'rediss://' : 'redis://';
  const port = process.env.REDIS_PORT ? `:${process.env.REDIS_PORT}` : '';
  return `${protocol}${auth}${process.env.REDIS_HOST}${port}`;
};

const buildRedisOptions = (rawUrl) => {
  const url = rawUrl.startsWith('https://') ? rawUrl.replace('https://', 'rediss://') : rawUrl;
  const parsed = new URL(url.includes('://') ? url : `redis://${url}`);

  if (!parsed.password && process.env.REDIS_PASSWORD) {
    parsed.username = process.env.REDIS_USERNAME || process.env.REDIS_USER || 'default';
    parsed.password = process.env.REDIS_PASSWORD;
  }

  const tlsEnabled = parsed.protocol === 'rediss:' || process.env.REDIS_FORCE_TLS === '1';
  const options = { url: parsed.toString() };
  if (tlsEnabled) {
    options.socket = {
      tls: true,
      servername: parsed.hostname,
      rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
    };
  }

  return { options, tlsEnabled };
};

let redisClient = null;

const attemptConnection = (options) => new Promise((resolve, reject) => {
  const client = redis.createClient(options);
  const cleanup = () => {
    client.removeAllListeners('ready');
    client.removeAllListeners('error');
    client.removeAllListeners('end');
  };

  client.once('ready', () => {
    cleanup();
    resolve(client);
  });

  const fail = (err) => {
    cleanup();
    err.client = client;
    reject(err);
  };

  client.once('error', fail);
  client.once('end', () => fail(new Error('Connection ended before ready')));

  client.connect().catch(fail);
});

const connectRedis = async (rawUrl, allowDowngrade = true) => {
  const { options, tlsEnabled } = buildRedisOptions(rawUrl);
  const masked = maskRedisUrl(options.url);
  console.log(`[REDIS] Connecting (${tlsEnabled ? 'TLS' : 'plain'}) to ${masked?.slice(0, 60)}...`);

  try {
    const client = await attemptConnection(options);
    client.on('error', (err) => console.error('[REDIS] Connection error:', err.message || err));

    try {
      console.log('[REDIS] ping:', await client.ping());
    } catch (err) {
      console.warn('[REDIS] ping failed:', err.message || err);
    }

    console.log(`[REDIS] Connected (${tlsEnabled ? 'TLS' : 'plain'})`);
    redisClient = client;
    return client;
  } catch (err) {
    console.error('[REDIS] Connection attempt failed:', err.message || err);
    if (err && err.code) {
      console.error('[REDIS] Failure code:', err.code);
    }

    if (allowDowngrade && tlsEnabled && requiresTlsDowngrade(err)) {
      const plainUrl = options.url.replace(/^rediss:/, 'redis:');
      console.warn(`[REDIS] TLS handshake failed; retrying without TLS using ${maskRedisUrl(plainUrl)}`);
      if (err.client) {
        await err.client.quit().catch(() => {});
      }
      return connectRedis(plainUrl, false);
    }

    if (err.client) {
      await err.client.quit().catch(() => {});
    }

    throw err;
  }
};

const redisUrl = resolveRedisUrl();
if (redisUrl) {
  connectRedis(redisUrl).catch((err) => {
    console.warn('[REDIS] Unable to connect:', err.message || err);
    console.warn('[REDIS] Falling back to in-memory storage for sessions');
  });
} else if (upstashRestUrl && upstashToken) {
  console.log('[UPSTASH] Redis REST API configured');
  // Test Upstash connection on startup (non-blocking)
  (async () => {
    try {
      const testRes = await fetch(`${upstashRestUrl}/ping`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${upstashToken}` },
        signal: AbortSignal.timeout(5000)
      });
      const testData = await testRes.json();
      if (testData.result === 'PONG') {
        console.log('[UPSTASH] ✓ Connection verified');
      } else {
        console.warn('[UPSTASH] Unexpected response:', testData);
      }
    } catch (err) {
      console.warn('[UPSTASH] Connection test warning:', err.message);
    }
  })();
} else {
  console.log('[STORAGE] No persistence configured - using in-memory storage only');
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
    if (upstashRestUrl && upstashToken) {
      try {
        await fetch(`${upstashRestUrl}/set/user:${encodeURIComponent(email)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(sessionData), ex: 3600 })
        });
      } catch (err) {
        console.warn('[UPSTASH] Failed to set user session:', err.message);
      }
    } else if (redisClient) {
      await redisClient.set(`user:${email}`, JSON.stringify(sessionData), { EX: 3600 }); // 1 hour expiry
    }
  },

  async getUserSession(email) {
    if (upstashRestUrl && upstashToken) {
      try {
        const res = await fetch(`${upstashRestUrl}/get/user:${encodeURIComponent(email)}`, {
          headers: { 'Authorization': `Bearer ${upstashToken}` }
        });
        const data = await res.json();
        return data.result ? JSON.parse(data.result) : null;
      } catch (err) {
        console.warn('[UPSTASH] Failed to get user session:', err.message);
        return null;
      }
    } else if (redisClient) {
      const data = await redisClient.get(`user:${email}`);
      return data ? JSON.parse(data) : null;
    }
    return null;
  },

  async deleteUserSession(email) {
    if (upstashRestUrl && upstashToken) {
      try {
        await fetch(`${upstashRestUrl}/del/user:${encodeURIComponent(email)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${upstashToken}` }
        });
      } catch (err) {
        console.warn('[UPSTASH] Failed to delete user session:', err.message);
      }
    } else if (redisClient) {
      await redisClient.del(`user:${email}`);
    }
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
  }
};

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
app.use(express.static('./public'))
// In production, also serve the built client app. Prefer root ../dist, fallback to ../app/dist, then server/dist.
const rootDistPath = path.resolve(process.cwd(), '..', 'dist')
const appDistPath = path.resolve(process.cwd(), '..', 'app', 'dist')
const serverDistPath = path.resolve(process.cwd(), 'dist')
let staticBase = null
if (fs.existsSync(rootDistPath)) {
  staticBase = rootDistPath
  app.use(express.static(rootDistPath))
} else if (fs.existsSync(appDistPath)) {
  staticBase = appDistPath
  app.use(express.static(appDistPath))
} else if (fs.existsSync(serverDistPath)) {
  staticBase = serverDistPath
  app.use(express.static(serverDistPath))
}
// Log whether we found a built SPA to serve
if (staticBase) {
  console.log(`[SPA] Serving static frontend from ${staticBase}`)
} else {
  console.warn('[SPA] No built frontend found at ../dist, ../app/dist, or ./dist; "/" will 404 (API+WS OK).')
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

// Stripe (optional): Create a Checkout Session for username change (-�2)
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
    console.error('[Stripe] create-checkout-session failed:', e?.message || e)
    return res.status(500).json({ ok: false, error: 'SESSION_FAILED' })
  }
})

// Admin management (demo; NOT secure ��� no auth/signature verification)
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

// Admin ops (owner-only; demo ��� not secure)
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

// Friends API routes
app.get('/api/friends/requests', (req, res) => {
  // For now, return empty array. In a real app, fetch pending friend requests for the user.
  res.json({ requests: [] });
});

app.get('/api/friends/messages', (req, res) => {
  // For now, return empty array. In a real app, fetch chat messages for the user.
  res.json({ messages: [] });
});

app.get('/api/friends/list', (req, res) => {
  // For now, return empty array. In a real app, fetch friends list for the user.
  res.json({ friends: [] });
});

app.get('/api/friends/suggested', (req, res) => {
  // For now, return empty array. In a real app, fetch suggested friends for the user.
  res.json({ suggestions: [] });
});

app.get('/api/friends/outgoing', (req, res) => {
  // For now, return empty array. In a real app, fetch outgoing friend requests.
  res.json({ requests: [] });
});

app.get('/api/friends/search', (req, res) => {
  // For now, return empty array. In a real app, search for friends by query.
  res.json({ results: [] });
});

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

// Room management helper functions
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

// Constrain ws payload size for safety
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 128 * 1024 });
console.log(`[WS] WebSocket attached to same server at path /ws`);
wsConnections.set(0)

// WebSocket connection handler
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
          try { chatMessagesTotal.inc() } catch {}
        }
      } else if (data.type === 'celebration') {
        // Broadcast client-declared celebrations (e.g., leg win) to the room
        if (ws._roomId) {
          const kind = (data.kind === '180' ? '180' : (data.kind === 'leg' ? 'leg' : 'custom'))
          broadcastToRoom(ws._roomId, { type: 'celebration', kind, by: data.by || (ws._username || `user-${ws._id}`), ts: Date.now() }, null)
        }
      } else if (data.type === 'cam-create') {
        // Desktop requests a 4-letter pairing code
        const code = genCamCode()
        const camSession = { code, desktopId: ws._id, desktopWs: ws, phoneId: null, phoneWs: null, ts: Date.now() }
        await camSessions.set(code, camSession)
        try { ws.send(JSON.stringify({ type: 'cam-code', code, expiresAt: Date.now() + CAM_TTL_MS })) } catch {}
      } else if (data.type === 'cam-join') {
        // Phone joins with code
        const code = String(data.code || '').toUpperCase()
        const sess = await camSessions.get(code)
        if (!sess) { try { ws.send(JSON.stringify({ type: 'cam-error', code: 'INVALID_CODE' })) } catch {}; return }
        // Expire stale codes
        if (sess.ts && (Date.now() - sess.ts) > CAM_TTL_MS) { await camSessions.delete(code); try { ws.send(JSON.stringify({ type: 'cam-error', code: 'EXPIRED' })) } catch {}; return }
        sess.phoneId = ws._id
        sess.phoneWs = ws
        // Get fresh desktop WebSocket
        const desktop = clients.get(sess.desktopId)
        if (desktop && desktop.readyState === 1) {
          sess.desktopWs = desktop
        }
        await camSessions.set(code, sess)
        if (desktop && desktop.readyState === 1) {
          try { desktop.send(JSON.stringify({ type: 'cam-peer-joined', code })) } catch {}
        }
        try { ws.send(JSON.stringify({ type: 'cam-joined', code })) } catch {}
      } else if (data.type === 'cam-data') {
        // Forward camera data between desktop and phone
        const code = String(data.code || '').toUpperCase()
        const sess = await camSessions.get(code)
        if (!sess) return
        // Determine target
        let targetWs = null
        if (ws._id === sess.desktopId && sess.phoneWs) {
          targetWs = sess.phoneWs
        } else if (ws._id === sess.phoneId && sess.desktopWs) {
          targetWs = sess.desktopWs
        }
        if (targetWs && targetWs.readyState === 1) {
          try { targetWs.send(JSON.stringify({ type: 'cam-data', code, payload: data.payload })) } catch {}
        }
      } else if (data.type === 'spectate') {
        await leaveRoom(ws);
        await joinRoom(ws, data.roomId);
        ws._spectator = true;
        ws.send(JSON.stringify({ type: 'spectating', roomId: data.roomId, id: ws._id }));
        if (ws._roomId) {
          broadcastToRoom(ws._roomId, { type: 'peer-joined', id: ws._id, spectator: true }, ws)
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

  ws.on('close', async (code, reasonBuf) => {
    const reason = (() => { try { return reasonBuf ? reasonBuf.toString() : '' } catch { return '' } })()
    try { console.log(`[WS] close id=${ws._id} code=${code} reason=${reason}`) } catch {}
    // Clean up room
    await leaveRoom(ws);
    try { wsConnections.dec() } catch {}
    // Remove any matches created by this client
    for (const [id, m] of Array.from(matches.entries())) {
      if (m.creatorId === ws._id) matches.delete(id)
    }
    clients.delete(ws._id)
    // Cleanup camera sessions involving this client
    for (const [code, sess] of camSessions.entries()) {
      if (sess.desktopId === ws._id || sess.phoneId === ws._id) {
        await camSessions.delete(code)
      }
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
  });
});

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
const camSessions = {
  async set(key, value) {
    // Store serializable data in Upstash (without WebSocket references)
    const upstashData = {
      code: value.code,
      desktopId: value.desktopId,
      phoneId: value.phoneId,
      ts: value.ts
    };
    
    if (upstashRestUrl && upstashToken) {
      try {
        await fetch(`${upstashRestUrl}/set/cam:${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(upstashData), ex: 120 }) // 2 minutes TTL
        });
      } catch (err) {
        console.warn('[UPSTASH] Failed to set camera session:', err.message);
      }
    }
    // Always keep full local cache with WebSocket references
    localCamSessions.set(key, value);
  },

  async get(key) {
    // Check local cache first (has WebSocket refs)
    if (localCamSessions.has(key)) {
      return localCamSessions.get(key);
    }
    // Try Upstash (fetch serializable data)
    if (upstashRestUrl && upstashToken) {
      try {
        const res = await fetch(`${upstashRestUrl}/get/cam:${encodeURIComponent(key)}`, {
          headers: { 'Authorization': `Bearer ${upstashToken}` }
        });
        const data = await res.json();
        if (data.result) {
          const upstashData = JSON.parse(data.result);
          // Reconstruct with WebSocket refs from clients
          const fullData = {
            ...upstashData,
            desktopWs: clients.get(upstashData.desktopId),
            phoneWs: clients.get(upstashData.phoneId)
          };
          localCamSessions.set(key, fullData);
          return fullData;
        }
      } catch (err) {
        console.warn('[UPSTASH] Failed to get camera session:', err.message);
      }
    }
    return undefined;
  },

  async delete(key) {
    if (upstashRestUrl && upstashToken) {
      try {
        await fetch(`${upstashRestUrl}/del/cam:${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${upstashToken}` }
        });
      } catch (err) {
        console.warn('[UPSTASH] Failed to delete camera session:', err.message);
      }
    }
    localCamSessions.delete(key);
  },

  entries() {
    return localCamSessions.entries();
  },

  has(key) {
    return localCamSessions.has(key);
  }
};
const localCamSessions = new Map(); // Local cache for camSessions with WebSocket refs
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
// (async () => {
//   if (supabase) {
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
// Friend requests persistence
const friendRequests = [];
const FRIEND_REQUESTS_FILE = './friend-requests.json'
function saveFriendRequests() {
  try {
    fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify({ requests: friendRequests }, null, 2))
  } catch {}
}
function loadFriendRequests() {
  try {
    if (!fs.existsSync(FRIEND_REQUESTS_FILE)) return
    const j = JSON.parse(fs.readFileSync(FRIEND_REQUESTS_FILE, 'utf8'))
    if (j && j.requests) {
      friendRequests.splice(0, friendRequests.length, ...j.requests)
    }
  } catch {}
}
loadFriendRequests()

// Admin-configurable demo users (for quick setup)
// NOTE: In production, use real user signup with email verification!
const demoUsers = [
  // email, username, password, admin?
  ['alice@example.com', 'Alice', 'Password123', false],
  ['bob@example.com', 'Bob', 'Password123', false],
  ['carol@example.com', 'Carol', 'Password123', false],
  ['dave@example.com', 'Dave', 'Password123', true],
  ['eve@example.com', 'Eve', 'Password123', false],
  ['mallory@example.com', 'Mallory', 'Password123', false],
  ['admin@example.com', 'Admin', 'Password123', true],
]

// Optional: auto-create demo users on startup (for development)
// (async () => {
//   for (const [email, username, password, isAdmin] of demoUsers) {
//     const lowerEmail = email.toLowerCase()
//     if (!users.has(lowerEmail)) {
//       const user = { email: lowerEmail, username, password, admin: !!isAdmin, subscription: { fullAccess: false } }
//       users.set(lowerEmail, user)
//       console.log(`[DEV] Created demo user: ${username} <${lowerEmail}>`)
//       // In a real app, you'd save to DB here
//     }
//   }
// })();

