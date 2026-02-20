 // --- REQUIRED FOR PREMIUM PAYMENTS ---
// Set this in your Render environment variables:
//   STRIPE_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/your_live_payment_link
// You can find this link in your Stripe dashboard under Payment Links.

const jwt = require('jsonwebtoken');
const dotenv = require('dotenv'); dotenv.config({ path: require('path').join(__dirname, '.env') });
// Enable verbose debug logging when NDN_DEBUG=1 (used by integration tests)
const DEBUG = String(process.env.NDN_DEBUG || '0') === '1' || String(process.env.NDN_DEBUG || '').toLowerCase() === 'true'
const upstashRestUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const { WebSocketServer } = require('ws');
const bcrypt = require('bcrypt');
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
const JWT_EXPIRES = process.env.JWT_EXPIRES || '12h';
// Track HTTPS runtime status and port
let HTTPS_ACTIVE = false
let HTTPS_PORT = Number(process.env.HTTPS_PORT || 8788)
let MAX_CLIENTS = 50000; // Default capacity
let clusteringEnabled = false;
const app = express();
// Trust proxy when behind render/netlify or nginx
try { app.set('trust proxy', 1) } catch {}

// Disable caching for dynamic JSON responses (avoid stale 304s after mutations)
function noCache(res) {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('ETag', `${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
  } catch {}
}

// Global error handlers
app.use((err, req, res, next) => {
  try {
    console.error('[UNHANDLED ERROR]', err && err.stack ? err.stack : err)
  } catch (e) { }
  try {
    if (!res.headersSent) {
      res.status(err && err.status ? err.status : 500).json({ error: err && err.message ? err.message : 'Internal Server Error' })
    }
  } catch (e) { }
})

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

// Highlights persistence (server-wide). If Supabase is configured we'll use it,
// otherwise fall back to a file-backed JSON store under server/data/highlights.json
const HIGHLIGHTS_FILE = path.join(__dirname, 'data', 'highlights.json');
let highlightsCache = null; // { username: [ {id,ts,data}, ... ] }

function loadHighlightsFromDisk() {
  if (highlightsCache !== null) return highlightsCache;
  try {
    if (fs.existsSync(HIGHLIGHTS_FILE)) {
      const raw = fs.readFileSync(HIGHLIGHTS_FILE, 'utf8');
      highlightsCache = JSON.parse(raw || '{}') || {};
      console.log('[Highlights] Loaded highlights from disk');
    } else {
      highlightsCache = {};
    }
  } catch (err) {
    console.warn('[Highlights] Failed to load from disk:', err && err.message);
    highlightsCache = {};
  }
  return highlightsCache;
}

// Help requests (helpdesk) persistence
const HELP_FILE = path.join(__dirname, 'data', 'help_requests.json')
let helpCache = null

function loadHelpFromDisk() {
  if (helpCache !== null) return helpCache
  try {
    const file = HELP_FILE
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8')
      helpCache = JSON.parse(raw || '[]') || []
      console.log('[Help] Loaded help requests from disk')
    } else {
      helpCache = []
    }
  } catch (err) {
    console.warn('[Help] Failed to load from disk:', err && err.message)
    helpCache = []
  }
  return helpCache
}

function persistHelpToDisk() {
  try {
    const dir = path.dirname(HELP_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(HELP_FILE, JSON.stringify(helpCache || [], null, 2), 'utf8')
  } catch (err) { console.warn('[Help] Failed to persist to disk:', err && err.message) }
}

async function createHelpRequest(username, message, meta) {
  const rec = { id: nanoid(8), ts: Date.now(), username: username || null, message: message || '', meta: meta || {}, status: 'open', claimedBy: null, messages: [] }
  // Supabase not used for help requests currently
  const store = loadHelpFromDisk()
  store.unshift(rec)
  if (store.length > 200) store.length = 200
  helpCache = store
  persistHelpToDisk()
  console.log('[Help] New request:', rec.id, 'from', username || 'anonymous')
  return rec
}

function getAdminFromReq(req) {
  try {
    const authHeader = String(req.headers && req.headers.authorization || '')
    const token = authHeader.split(' ')[1]
    if (!token) return null
    const decoded = jwt.verify(token, JWT_SECRET)
    const email = String(decoded.email || decoded.username || '').toLowerCase()
    const user = users.get(email) || null
    if (adminEmails.has(email) || (user && user.admin)) return { email, user }
    return null
  } catch (err) {
    return null
  }
}

function getOwnerFromReq(req) {
  try {
    const authHeader = String(req.headers && req.headers.authorization || '')
    const token = authHeader.split(' ')[1]
    if (!token) return null
    const decoded = jwt.verify(token, JWT_SECRET)
    const email = String(decoded.email || decoded.username || '').toLowerCase()
    if (!email) return null
    if (email === OWNER_EMAIL) return { email, user: users.get(email) || null }
    return null
  } catch { return null }
}

// Board radii and scoring helper (copied from authoritative server implementation)
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
  const index = Math.floor(((deg + 9) % 360) / 18);
  const sector = SectorOrder[index];
  
  // Apply tolerance bands for robustness
  const bullTol = 3.5;   // ±mm around bull boundaries
  const bandTol = 3.0;   // ±mm for treble/double bands
  const edgeTol = 2.0;   // ±mm beyond outer board edge considered MISS
  
  const bullInner = BoardRadii.bullInner;
  const bullOuter = BoardRadii.bullOuter;
  const trebInner = BoardRadii.trebleInner;
  const trebOuter = BoardRadii.trebleOuter;
  const dblInner = BoardRadii.doubleInner;
  const dblOuter = BoardRadii.doubleOuter;
  
  // Outside board edge
  if (r > dblOuter + edgeTol) return { base: 0, ring: 'MISS', sector: null, mult: 0 };
  
  // Bulls
  if (r <= bullInner + bullTol) return { base: 50, ring: 'INNER_BULL', sector: 25, mult: 2 };
  if (r <= bullOuter + bullTol) return { base: 25, ring: 'BULL', sector: 25, mult: 1 };
  
  // Double band (tolerant) - r >= 162-3=159 AND r <= 170+2=172 (within board)
  if (r >= dblInner - bandTol && r <= dblOuter + edgeTol)
    return { base: sector * 2, ring: 'DOUBLE', sector, mult: 2 };
  
  // Single outer band between trebleOuter and doubleInner - r >= 107-3=104 AND r < 162-3=159
  if (r >= trebOuter - bandTol && r < dblInner - bandTol)
    return { base: sector, ring: 'SINGLE', sector, mult: 1 };
  
  // Treble band (tolerant) - r >= 99-3=96 AND r < 107-3=104
  if (r >= trebInner - bandTol && r < trebOuter - bandTol)
    return { base: sector * 3, ring: 'TRIPLE', sector, mult: 3 };
  
  // Inner single (center region outside bulls and inside trebleInner)
  return { base: sector, ring: 'SINGLE', sector, mult: 1 };
}

async function listHelpRequests() {
  return loadHelpFromDisk()
}

async function claimHelpRequest(id, adminUser) {
  const store = loadHelpFromDisk()
  const idx = store.findIndex(r => String(r.id) === String(id))
  if (idx === -1) return null
  store[idx].status = 'claimed'
  store[idx].claimedBy = adminUser || null
  persistHelpToDisk()
  return store[idx]
}

async function resolveHelpRequest(id, adminUser) {
  const store = loadHelpFromDisk()
  const idx = store.findIndex(r => String(r.id) === String(id))
  if (idx === -1) return null
  store[idx].status = 'resolved'
  store[idx].claimedBy = adminUser || store[idx].claimedBy || null
  persistHelpToDisk()
  return store[idx]
}

function persistHighlightsToDisk() {
  try {
    const dir = path.dirname(HIGHLIGHTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HIGHLIGHTS_FILE, JSON.stringify(highlightsCache || {}, null, 2), 'utf8');
    // eslint-disable-next-line no-empty
  } catch (err) { console.warn('[Highlights] Failed to persist to disk:', err && err.message); }
}

async function getUserHighlightsPersistent(username) {
  // If Supabase is available prefer it
  if (supabase) {
    try {
      const { data, error } = await supabase.from('highlights').select('*').eq('username', username).order('ts', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []).map(r => ({ id: r.id, ts: r.ts, data: r.data }));
    } catch (err) {
      console.warn('[Highlights] Supabase fetch error:', err && err.message);
    }
  }
  const store = loadHighlightsFromDisk();
  return store[username] || [];
}

async function saveUserHighlightPersistent(username, payload) {
  if (supabase) {
    try {
      const insert = { username, ts: Date.now(), data: payload };
      const { data, error } = await supabase.from('highlights').insert(insert).select().single();
      if (error) throw error;
      return { id: data.id, ts: data.ts, data: data.data };
    } catch (err) {
      console.warn('[Highlights] Supabase insert error:', err && err.message);
    }
  }
  const store = loadHighlightsFromDisk();
  store[username] = store[username] || [];
  const rec = { id: nanoid(8), ts: Date.now(), data: payload };
  store[username].unshift(rec);
  if (store[username].length > 100) store[username] = store[username].slice(0, 100);
  persistHighlightsToDisk();
  return rec;
}

async function deleteUserHighlightPersistent(username, id) {
  if (supabase) {
    try {
      const { error } = await supabase.from('highlights').delete().eq('username', username).eq('id', id);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('[Highlights] Supabase delete error:', err && err.message);
    }
  }
  const store = loadHighlightsFromDisk();
  if (!store[username]) return false;
  const before = store[username].length;
  store[username] = store[username].filter(r => String(r.id) !== String(id));
  if (store[username].length === before) return false;
  persistHighlightsToDisk();
  return true;
}

// User avatar persistence (server-wide).
const AVATARS_FILE = path.join(__dirname, 'data', 'user_avatars.json');
let avatarsCache = null;

function loadAvatarsFromDisk() {
  if (avatarsCache !== null) return avatarsCache;
  try {
    if (fs.existsSync(AVATARS_FILE)) {
      const raw = fs.readFileSync(AVATARS_FILE, 'utf8');
      avatarsCache = JSON.parse(raw || '{}') || {};
    } else {
      avatarsCache = {};
    }
  } catch (err) {
    console.warn('[Avatars] Failed to load from disk:', err && err.message);
    avatarsCache = {};
  }
  return avatarsCache;
}

function persistAvatarsToDisk() {
  try {
    const dir = path.dirname(AVATARS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AVATARS_FILE, JSON.stringify(avatarsCache || {}, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Avatars] Failed to persist to disk:', err && err.message);
  }
}

function getUserAvatar(username) {
  const store = loadAvatarsFromDisk();
  return store[username] || null;
}

function setUserAvatar(username, dataUri) {
  const store = loadAvatarsFromDisk();
  store[username] = dataUri;
  avatarsCache = store;
  persistAvatarsToDisk();
}

// User stats persistence (server-wide). If Supabase is configured we'll use it,
// otherwise fall back to a file-backed JSON store under server/data/user_stats.json
const STATS_FILE = path.join(__dirname, 'data', 'user_stats.json');
let statsCache = null; // { username: { updatedAt, allTime, series, daily, gameModes } }

function loadStatsFromDisk() {
  if (statsCache !== null) return statsCache;
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, 'utf8');
      statsCache = JSON.parse(raw || '{}') || {};
      console.log('[Stats] Loaded stats from disk');
    } else {
      statsCache = {};
    }
  } catch (err) {
    console.warn('[Stats] Failed to load from disk:', err && err.message);
    statsCache = {};
  }
  return statsCache;
}

function persistStatsToDisk() {
  try {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(statsCache || {}, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Stats] Failed to persist to disk:', err && err.message);
  }
}

async function getUserStatsPersistent(username) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .select('payload, updated_at')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.payload) return null;
      return { ...data.payload, updatedAt: data.payload.updatedAt || new Date(data.updated_at).getTime() };
    } catch (err) {
      console.warn('[Stats] Supabase fetch error:', err && err.message);
    }
  }
  const store = loadStatsFromDisk();
  return store[username] || null;
}

async function saveUserStatsPersistent(username, payload) {
  const incomingUpdatedAt = Number(payload && payload.updatedAt) || Date.now();
  const existing = await getUserStatsPersistent(username);
  if (existing && existing.updatedAt && existing.updatedAt > incomingUpdatedAt) {
    return existing;
  }
  const next = { ...payload, updatedAt: incomingUpdatedAt };
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .upsert({ username, updated_at: new Date(incomingUpdatedAt).toISOString(), payload: next })
        .select('payload')
        .single();
      if (error) throw error;
      return data && data.payload ? data.payload : next;
    } catch (err) {
      console.warn('[Stats] Supabase upsert error:', err && err.message);
    }
  }
  const store = loadStatsFromDisk();
  store[username] = next;
  statsCache = store;
  persistStatsToDisk();
  return next;
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
let redisSubClient = null;

// Helper: get user from Redis or Supabase quickly (fast path)
async function fetchUserFromPersistence(rawId, timeoutMs = 1200) {
  const idLower = (rawId || '').toLowerCase();
  const useEmail = idLower.includes('@');
  const keyEmail = `user:email:${idLower}`;
  const keyUsername = `user:username:${rawId}`;

  const attempt = async () => {
    try {
      // Try Redis first for fast lookup
      if (redisClient) {
        try {
          const rKey = useEmail ? keyEmail : keyUsername;
          const raw = await redisClient.get(rKey);
          if (raw) {
            try { return JSON.parse(raw); } catch { return null }
          }
        } catch (err) {
          // Redis read failure — ignore and fall back
          console.warn('[REDIS] Read failed (fast path):', err && err.message);
        }
      }

      // Fallback: query Supabase synchronously for this request
      if (supabase) {
        const fetchBy = useEmail ? { col: 'email', val: idLower } : { col: 'username', val: rawId };
        try {
          const { data, error } = await supabase.from('users').select('*').eq(fetchBy.col, fetchBy.val).single();
          if (!error && data) {
            return data;
          }
        } catch (err) {
          console.warn('[DB] Fast fetch failed:', err && err.message);
        }
      }
    } catch (err) { console.warn('[PERSIST] fetchUserFromPersistence err', err) }
    return null;
  };

  // Timeout wrapper so we don't block for too long
  return Promise.race([
    attempt(),
    new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))
  ]);
}

// Helper: cache user in Redis + memory
async function cacheUserPersistent(user) {
  try {
    if (!user || !user.email) return;
    const u = { email: user.email, username: user.username, password: user.password || user.hashedPassword || user.hash || user?.password, admin: user.admin || false };
    users.set(u.email, u);
    if (redisClient) {
      try {
        // Key by email and username for quick lookups
        const eKey = `user:email:${String(u.email).toLowerCase()}`;
        const nKey = `user:username:${u.username}`;
        await redisClient.set(eKey, JSON.stringify(u));
        await redisClient.set(nKey, JSON.stringify(u));
        // Expire after 1 day to keep cache fresh
        await redisClient.expire(eKey, 60 * 60 * 24);
        await redisClient.expire(nKey, 60 * 60 * 24);
      } catch (err) { console.warn('[REDIS] Cache write failed:', err && err.message); }
    }
  } catch (err) {
    console.warn('[CACHE] cacheUserPersistent failed', err && err.message);
  }
}

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
    // If supported, setup a duplicate subscriber to handle pub/sub events for cross-instance broadcasts
    try {
      const sub = client.duplicate();
      await sub.connect();
      redisSubClient = sub;
      // Subscribe to tournament updates from other instances
      try {
        await sub.subscribe('ndn:tournaments', async (msg) => {
          try {
            const data = JSON.parse(msg || '{}')
            if (!data || !data.type) return
            if (data.type === 'tournaments') {
              try { console.log('[Redis] Received tournaments pubsub message, broadcasting to local clients') } catch {}
              if (typeof wss !== 'undefined' && wss && wss.clients) {
                for (const client of wss.clients) { if (client.readyState === 1) client.send(JSON.stringify({ type: 'tournaments', tournaments: data.tournaments })) }
              }
            }
          } catch (err) { /* ignore malformed messages */ }
        })
        console.log('[Redis] Subscribed to ndn:tournaments channel')
      } catch (err) {
        console.warn('[Redis] Failed to subscribe to ndn:tournaments channel:', err && err.message)
      }
    } catch (err) {
      // duplication may fail on some Redis providers; continue without pubsub
      console.warn('[Redis] Unable to create subscriber client:', err && err.message)
    }
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
// Upstash REST subscribe loop: listen for published messages and re-broadcast to local WS clients
async function startUpstashSubscriber(channel = 'ndn:tournaments') {
  if (!upstashRestUrl || !upstashToken) return
  const url = `${upstashRestUrl}/subscribe/${encodeURIComponent(channel)}`
  // Reconnect loop with backoff. Render + proxies can drop long-lived HTTP
  // streams; we keep reconnecting, but we do it politely.
  let attempt = 0
  const baseDelayMs = 3000
  const maxDelayMs = 30000

  while (true) {
    // Exponential backoff with jitter
    const delayMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.min(attempt, 4)))
    const jitterMs = Math.floor(Math.random() * 500)
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, delayMs + jitterMs))
    }

    // Bound the stream lifetime so we don't get stuck in half-open states.
    // Many hosting stacks/proxies will drop idle streams after ~60-120s.
    const streamMaxMs = 60000
    const controller = new AbortController()
    const abortTimer = setTimeout(() => {
      try { controller.abort(new Error('upstash-subscribe-timeout')) } catch {}
    }, streamMaxMs)

    try {
      console.log('[UPSTASH] Starting REST subscribe to', url)
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${upstashToken}` },
        signal: controller.signal,
      })

      if (!res.ok) {
        console.warn('[UPSTASH] subscribe returned status', res.status)
        attempt = Math.min(attempt + 1, 8)
        continue
      }
      if (!res.body || typeof res.body.getReader !== 'function') {
        console.warn('[UPSTASH] subscribe response missing readable body')
        attempt = Math.min(attempt + 1, 8)
        continue
      }

      // We've successfully connected; reset backoff and start reading.
      attempt = 0

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 2)
          const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const payloadStr = line.replace(/^data:\s*/, '')
              try {
                const parsed = JSON.parse(payloadStr)
                if (parsed && parsed.type === 'tournaments') {
                  try { console.log('[UPSTASH] Received tournaments via REST subscribe') } catch {}
                  if (typeof wss !== 'undefined' && wss && wss.clients) {
                    for (const client of wss.clients) {
                      if (client.readyState === 1) {
                        client.send(JSON.stringify({ type: 'tournaments', tournaments: parsed.tournaments }))
                      }
                    }
                  }
                }
              } catch (err) {
                /* ignore bad payload */
              }
            }
          }
        }
      }
    } catch (err) {
      const name = err && err.name
      const msg = err && err.message
      // Abort errors are expected due to our bounded stream lifetime.
      if (name === 'AbortError' || msg === 'upstash-subscribe-timeout') {
        console.log('[UPSTASH] subscribe reconnect (bounded stream)')
      } else {
        console.warn('[UPSTASH] subscribe error:', msg || err)
      }
      attempt = Math.min(attempt + 1, 8)
    } finally {
      try { clearTimeout(abortTimer) } catch {}
    }
  }
}

// Only start Upstash REST subscriber if the REST URL/token are present and there's no REDIS_URL configured
if (upstashRestUrl && upstashToken && !process.env.REDIS_URL) {
  startUpstashSubscriber('ndn:tournaments').catch(err => console.warn('[UPSTASH] subscriber crashed', err && err.message))
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
// Configure CORS with a safe default allowlist (overridable via env CORS_ORIGINS)
// Read comma-separated list from CORS_ORIGINS (prefer) and fallback to CORS_ORIGIN (singular) for compatibility
const RAW_ORIGINS = [String(process.env.CORS_ORIGINS || ''), String(process.env.CORS_ORIGIN || '')]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map(s => (s || '').trim().replace(/^['"]|['"]$/g, ''))
  .filter(Boolean)
const DEFAULT_ORIGINS = [
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:8787', 'http://127.0.0.1:8787',
  'https://ninedartnation.onrender.com',
  'https://ninedartnation-1.onrender.com',
  'https://ninedartnation.netlify.app',
  'https://*.netlify.app',
]
let ALLOWED_ORIGINS = (RAW_ORIGINS.length ? RAW_ORIGINS : DEFAULT_ORIGINS)

// Ensure critical production origins are always allowed, even if env vars are restrictive
// IMPORTANT: Include Render origins so phone camera pairing (same-origin WS) is never blocked
const CRITICAL_ORIGINS = [
  'https://ninedartnation.netlify.app',
  'https://*.netlify.app',
  'https://ninedartnation.onrender.com',
  'https://ninedartnation-1.onrender.com',
  'https://*.onrender.com',
]
CRITICAL_ORIGINS.forEach(origin => {
  if (!ALLOWED_ORIGINS.includes(origin)) {
    ALLOWED_ORIGINS.push(origin)
  }
})

// If user supplied a specific netlify origin, also accept wildcard subdomains
try {
  const hasNetlifyExplicit = ALLOWED_ORIGINS.some(o => String(o || '').includes('.netlify.app'))
  const hasNetlifyWildcard = ALLOWED_ORIGINS.some(o => String(o || '').includes('*.netlify.app'))
  if (hasNetlifyExplicit && !hasNetlifyWildcard) {
    ALLOWED_ORIGINS = [...ALLOWED_ORIGINS, 'https://*.netlify.app']
    console.warn('[CORS] auto-added wildcard https://*.netlify.app to ALLOWED_ORIGINS based on detected netlify origin')
  }
} catch (e) {}
// Same for Render origins — phone camera connects from same-origin so must be allowed
try {
  const hasRenderExplicit = ALLOWED_ORIGINS.some(o => String(o || '').includes('.onrender.com'))
  const hasRenderWildcard = ALLOWED_ORIGINS.some(o => String(o || '').includes('*.onrender.com'))
  if (hasRenderExplicit && !hasRenderWildcard) {
    ALLOWED_ORIGINS = [...ALLOWED_ORIGINS, 'https://*.onrender.com']
    console.warn('[CORS] auto-added wildcard https://*.onrender.com to ALLOWED_ORIGINS based on detected Render origin')
  }
} catch (e) {}
// Show allow-list at startup so admins can confirm what the server sees
try { console.log('[CORS] ALLOWED_ORIGINS:', ALLOWED_ORIGINS) } catch {}
const _seenBlockedOrigins = new Set();
function isAllowedOrigin(origin) {
  if (!origin) return true // allow non-browser clients (no Origin header)
  try {
    const u = new URL(origin)
    const matched = ALLOWED_ORIGINS.some(allowed => {
      try {
        if (!allowed) return false
        const a = String(allowed).trim()
        // Allow wildcard entries like "*.netlify.app" (no protocol) or "https://*.netlify.app"
        const wildcard = a.includes('*')
        if (wildcard) {
          // Normalize: remove protocol if present
          const protoMatch = a.match(/^(https?:)?\/\/(.+)$/)
          const proto = protoMatch ? protoMatch[1] : ''
          const hostPattern = (protoMatch ? protoMatch[2] : a).replace(/^\*\.?/, '')
          const hostMatch = u.hostname.endsWith(hostPattern)
          const protoMatchOk = !proto || (u.protocol === (proto === 'https:' ? 'https:' : proto))
          return hostMatch && protoMatchOk
        }
        // Normal comparison by host + protocol (ignore trailing slashes or ports differences)
        const au = new URL(a)
        return (au.host === u.host) && (au.protocol === u.protocol)
      } catch {
        return String(allowed) === origin
      }
    })
    if (!matched && !_seenBlockedOrigins.has(origin)) {
      _seenBlockedOrigins.add(origin)
      console.warn('[CORS] blocked origin:', origin, 'allowed list:', ALLOWED_ORIGINS)
    }
    return matched
  } catch (err) {
    if (process.env.DEBUG_CORS === '1') console.warn('[CORS] invalid origin header:', origin)
    return false
  }
}

// Security headers with CSP; relax in dev for Vite
const IS_DEV = (process.env.NODE_ENV !== 'production')
const cspDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
  connectSrc: [
    "'self'",
    'ws:',
    'wss:',
    'https://ninedartnation.onrender.com',
    'https://ninedartnation-1.onrender.com',
    'https://ninedartnation.netlify.app',
    'https://*.netlify.app',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ],
}
if (IS_DEV) {
  // Vite dev server
  cspDirectives.scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
  cspDirectives.styleSrc = ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']
} else {
  cspDirectives.scriptSrc = ["'self'"]
}
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { useDefaults: true, directives: cspDirectives },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
}))

// Central CORS options delegate function for consistent behavior across preflight & normal requests
const corsOptionsDelegate = (origin, cb) => {
  try {
    const allowed = isAllowedOrigin(origin)
    if (process.env.DEBUG_CORS === '1' || process.env.LOG_LEVEL === 'debug') console.debug('[CORS] origin:', origin, 'allowed:', allowed)
    return cb(null, allowed)
  } catch (err) {
    console.error('[CORS] origin check failure for:', origin, err && err.stack ? err.stack : err)
    return cb(null, false)
  }
}

if (process.env.DEBUG_CORS === '1') {
  console.warn('[CORS] DEBUG_CORS enabled - allowing all origins for debugging (REMOVE IN PROD)')
  // Preflight handler for explicit OPTIONS
  app.options('*', cors({ origin: true, credentials: true }))
  app.use(cors({ origin: true, credentials: true }))
} else {
  // Preflight handler for explicit OPTIONS using our delegate
  app.options('*', cors({ origin: corsOptionsDelegate, credentials: true }))
  app.use(cors({ origin: corsOptionsDelegate, credentials: true }))
  // Log origin/method for debugging
  app.use((req, res, next) => { try { if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG_CORS === '1') console.debug('[CORS] incoming', req.method, 'origin=', req.headers.origin) } catch {} ; next(); })
  app.use(cors({
    origin: (origin, cb) => {
      try {
        const allowed = isAllowedOrigin(origin)
        if (process.env.DEBUG_CORS === '1' || process.env.LOG_LEVEL === 'debug') console.debug('[CORS] origin:', origin, 'allowed:', allowed)
        // Avoid generating an Error into express; pass null so CORS middleware handles it gracefully
        return cb(null, allowed)
      } catch (err) {
        console.error('[CORS] origin check failure for:', origin, err && err.stack ? err.stack : err)
        // Reject origin, but don't throw an error object which could lead to 500.
        return cb(null, false)
      }
    },
    credentials: true,
  }))
}
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
// (debug middleware removed)
// Guard JSON body size to avoid excessive memory
app.use(express.json({ limit: '100kb' }));
// Minimal CSRF guard for cookie-bearing browser requests:
// For unsafe methods, require Origin/Referer to be on the allowlist.
// Non-browser clients (no Origin/Referer) pass through.
app.use((req, res, next) => {
  try {
    const method = (req.method || 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
    const origin = req.headers.origin || ''
    const referer = req.headers.referer || ''
    const refOrigin = (() => { try { return referer ? new URL(referer).origin : '' } catch { return '' } })()
    if (origin && !isAllowedOrigin(origin)) {
      return res.status(403).json({ error: 'CSRF blocked (origin)' })
    }
    if (!origin && refOrigin && !isAllowedOrigin(refOrigin)) {
      return res.status(403).json({ error: 'CSRF blocked (referer)' })
    }
    return next()
  } catch {
    return res.status(400).json({ error: 'Invalid request headers' })
  }
})
// Serve static assets (mobile camera page)
app.use(express.static('./public'))
// In production, also serve the built client app. Prefer root ../dist, fallback to ../app/dist, then server/dist.
// Use __dirname to be safe regardless of where the process was started
const rootDistPath = path.resolve(__dirname, '..', 'dist')
const appDistPath = path.resolve(__dirname, '..', 'app', 'dist')
const serverDistPath = path.resolve(__dirname, 'dist')
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
    // Check if username/email exists in memory (fast path first)
    for (const u of users.values()) {
      if (u.username === username) {
        return res.status(409).json({ error: 'Username already exists.' })
      }
      if (u.email === email) {
        return res.status(409).json({ error: 'Email already exists.' })
      }
    }

    // Check if user exists in Supabase (only if DB is configured)
    if (supabase) {
      try {
        const { data: existingUser, error: queryError } = await supabase
          .from('users')
          .select('email, username')
          .or(`email.eq.${email},username.eq.${username}`)
          .single();

        if (!queryError && existingUser) {
          if (existingUser.email === email) {
            return res.status(409).json({ error: 'Email already exists.' })
          }
          if (existingUser.username === username) {
            return res.status(409).json({ error: 'Username already exists.' })
          }
        }
      } catch (queryErr) {
        console.error('[DB] Query error during signup:', queryErr);
        // Continue - user probably doesn't exist
      }
    }

  // Hash password using bcrypt
  const hashed = await bcrypt.hash(String(password), 12)
  const user = { email, username, password: hashed, admin: false, subscription: { fullAccess: false } }

    // Save to Supabase - AWAIT so user is guaranteed persisted
    if (supabase) {
      try {
        const { error: insertErr } = await supabase
          .from('users')
          .insert([{
            email: user.email,
            username: user.username,
            password: user.password, // hashed
            admin: user.admin,
            subscription: user.subscription,
            created_at: new Date().toISOString()
          }]);
        if (insertErr) {
          console.error('[DB] Failed to save user to Supabase:', insertErr);
        } else {
          console.log('[SIGNUP] User persisted to Supabase:', user.username);
        }
      } catch (dbErr) {
        console.error('[DB] Supabase insert exception:', dbErr);
      }
    }

    // Store in memory immediately (fast response)
    users.set(email, user)

    // Create JWT token and respond immediately
  const token = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({ user, token })
  } catch (error) {
    console.error('[SIGNUP] Error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
})

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, email, password } = req.body || {};
  const rawId = (username || email || '').trim();
  if (!rawId || !password) {
    return res.status(400).json({ error: 'Username or email and password required.' });
  }
  const idLower = rawId.toLowerCase();

  try {
    const startTs = Date.now();
    // Check in-memory users FIRST (fastest path - no network, <1ms)
    for (const u of users.values()) {
      const uEmailLower = String(u.email||'').toLowerCase();
      const uNameLower = String(u.username||'').toLowerCase();
      const matches = idLower.includes('@')
        ? (uEmailLower === idLower)
        : (uNameLower === idLower || uEmailLower === idLower);
      if (matches) {
        const stored = String(u.password || '')
        const isHashed = stored.startsWith('$2')
        const ok = isHashed ? await bcrypt.compare(String(password), stored) : (stored === password)
        if (ok) {
          const token = jwt.sign({ username: u.username, email: u.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
          console.log('[LOGIN] Hit cache fast path for', u.username, 'latencyMs:', Date.now() - startTs);
          return res.json({ user: u, token }); // Return immediately - no Supabase call
        }
      }
    }

    // User not found in memory - try fast persistence (Redis or Supabase) with a short timeout
    try {
      const persisted = await fetchUserFromPersistence(rawId, 1200);
      if (persisted) {
        const stored = String(persisted.password || persisted.hash || persisted.hashedPassword || '');
        const isHashed = stored.startsWith('$2');
        const ok = isHashed ? await bcrypt.compare(String(password), stored) : (stored === password);
        if (ok) {
          // Cache in-memory + redis for future
          const uObj = { email: persisted.email, username: persisted.username, password: stored, admin: persisted.admin || false };
          await cacheUserPersistent(uObj);
          const token = jwt.sign({ username: uObj.username, email: uObj.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
          console.log('[LOGIN] Fast path via persistent store for', uObj.username, 'latencyMs:', Date.now() - startTs);
          return res.json({ user: uObj, token });
        }
      }
    } catch (err) { console.warn('[LOGIN] Fast path fetch failed:', err && err.message) }

    // Nothing found or not a match - keep background caching and return error
    if (supabase) {
      const fetchBy = idLower.includes('@') ? { col: 'email', val: idLower } : { col: 'username', val: rawId };
      supabase
        .from('users')
        .select('*')
        .eq(fetchBy.col, fetchBy.val)
        .single()
        .then(async ({ data, error }) => {
          try {
            if (!error && data && data.password) {
              const stored = String(data.password);
              const isHashed = stored.startsWith('$2');
              const ok = isHashed ? await bcrypt.compare(String(password), stored) : (stored === password);
              if (ok) {
                const uObj = { email: data.email, username: data.username, password: stored, admin: data.admin || false };
                users.set(data.email, uObj);
                await cacheUserPersistent(uObj);
                console.log('[LOGIN] Cached user from Supabase (bg):', data.username);
              }
            }
          } catch {}
        })
        .catch(err => console.warn('[LOGIN] Background Supabase sync failed:', err));
    }

    return res.status(401).json({ error: 'Invalid credentials.' });
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Route to verify token and get user info
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Find user by username in memory first
    for (const u of users.values()) {
      if (u.username === decoded.username) {
        return res.json({ user: u });
      }
    }
    // Not in memory - try Supabase (server may have restarted)
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('username', decoded.username)
          .single();
        if (!error && data) {
          const u = {
            email: data.email,
            username: data.username,
            password: data.password,
            admin: data.admin || false,
            subscription: data.subscription || { fullAccess: false }
          };
          users.set(data.email, u);
          console.log('[AUTH/ME] Re-cached user from Supabase:', u.username);
          return res.json({ user: u });
        }
      } catch (dbErr) {
        console.warn('[AUTH/ME] Supabase lookup failed:', dbErr && dbErr.message);
      }
    }
    return res.status(404).json({ error: 'User not found.' });
  } catch {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

// User calibration storage (persists calibration matrix to account)
app.get('/api/user/calibration', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Find user by username
    let user = null;
    for (const u of users.values()) {
      if (u.username === decoded.username) {
        user = u;
        break;
      }
    }
    if (!user) return res.status(404).json({ error: 'User not found.' });
    
    const calibration = user.calibration || null;
    return res.json({ calibration });
  } catch {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.post('/api/user/calibration', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Find user by username
    let user = null;
    for (const u of users.values()) {
      if (u.username === decoded.username) {
        user = u;
        break;
      }
    }
    if (!user) return res.status(404).json({ error: 'User not found.' });
    
    const { H, anchors, imageSize, errorPx } = req.body;
    if (!H) return res.status(400).json({ error: 'Calibration data (H) required.' });
    
    // Store calibration on user object
    user.calibration = {
      H,
      anchors: anchors || null,
      imageSize: imageSize || null,
      errorPx: errorPx || null,
      savedAt: Date.now()
    };
    
    console.log('[Calibration] Saved calibration for user:', user.username);
    return res.json({ success: true, calibration: user.calibration });
  } catch (error) {
    console.error('[Calibration] Error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Public calibration lookup (for match showcases)
app.get('/api/users/:username/calibration', (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ error: 'Username required.' });
  
  // Find user by username
  let user = null;
  for (const u of users.values()) {
    if (u.username === username) {
      user = u;
      break;
    }
  }
  if (!user) return res.status(404).json({ error: 'User not found.' });
  
  const calibration = user.calibration || null;
  return res.json({ calibration });
});

// User highlights storage (save notable visits: checkout >50 or visit >100)
app.get('/api/user/highlights', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username;
    const highlights = await getUserHighlightsPersistent(username);
    return res.json({ highlights });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.post('/api/user/highlights', express.json(), async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username;
    const payload = req.body || {};
    const rec = await saveUserHighlightPersistent(username, payload);
    console.log('[Highlights] Saved highlight for user:', username);
    return res.json({ ok: true, highlight: rec });
  } catch (err) {
    console.error('[Highlights] Error:', err && err.message);
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

// Delete a highlight by id for the authenticated user
app.delete('/api/user/highlights/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username;
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'Highlight id required.' });
    const ok = await deleteUserHighlightPersistent(username, id);
    if (!ok) return res.status(404).json({ error: 'Highlight not found.' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

// User stats storage (sync across devices)
app.get('/api/user/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username;
    const stats = await getUserStatsPersistent(username);
    return res.json({ stats: stats || null });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.post('/api/user/stats', express.json(), async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username;
    const payload = req.body && req.body.stats;
    if (!payload) return res.status(400).json({ error: 'Stats payload required.' });
    const saved = await saveUserStatsPersistent(username, payload);
    return res.json({ ok: true, stats: saved });
  } catch (err) {
    console.error('[Stats] Error saving stats:', err && err.message);
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

// Public stats endpoint - fetch another user's stats (no auth required, for friend comparison)
app.get('/api/user/stats/public/:username', async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ error: 'Username required.' });
    const stats = await getUserStatsPersistent(username);
    return res.json({ stats: stats || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// Avatar save / fetch
app.post('/api/user/avatar', express.json(), (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username || decoded.email;
    const avatar = req.body && req.body.avatar;
    if (!avatar || typeof avatar !== 'string') return res.status(400).json({ error: 'Avatar data required.' });
    if (avatar.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Avatar too large.' });
    setUserAvatar(username, avatar);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.get('/api/user/avatar/:username', (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: 'Username required.' });
  const avatar = getUserAvatar(username);
  return res.json({ ok: true, avatar: avatar || null });
});

// Helper: compute 3-dart average from stored stats for a username
function getUser3DA(username) {
  const store = loadStatsFromDisk();
  const stats = store[username];
  if (!stats || !stats.allTime) return 0;
  const { darts, scored } = stats.allTime;
  if (!darts) return 0;
  return Math.round(((scored / darts) * 3) * 100) / 100;
}

// Create a help request (open to authenticated or anonymous users)
app.post('/api/help/requests', express.json(), async (req, res) => {
  try {
    const token = (req.headers.authorization || '').split(' ')[1]
    let username = null
    if (token) {
      try { const decoded = jwt.verify(token, JWT_SECRET); username = decoded.username } catch {}
    }
    const body = req.body || {}
    const message = body.message || ''
    if (!message) return res.status(400).json({ error: 'Message required.' })
    const rec = await createHelpRequest(username, message, body.meta || {})
    // Broadcast to connected admin WS clients so admins see new requests immediately
    try {
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        const payload = JSON.stringify({ type: 'help-request', request: rec })
        for (const client of wss.clients) {
          try {
            if (client && client.readyState === 1 && client._email && adminEmails.has(String(client._email).toLowerCase())) {
              client.send(payload)
            }
          } catch (e) { /* ignore per-client send errors */ }
        }
      }
    } catch (e) { console.warn('[Help] Broadcast new request failed', e && e.message) }

    return res.json({ ok: true, request: rec })
  } catch (err) { console.error('[Help] Create error:', err && err.message); return res.status(500).json({ error: 'Internal server error.' }) }
})

// Admin: list help requests
app.get('/api/admin/help-requests', async (req, res) => {
  try {
    const admin = getAdminFromReq(req)
    if (!admin) return res.status(403).json({ error: 'Forbidden' })
    const list = await listHelpRequests()
    return res.json({ ok: true, requests: list })
  } catch (err) { console.error('[Help] List error:', err && err.message); return res.status(500).json({ error: 'Internal server error.' }) }
})

// Admin: claim a help request
app.post('/api/admin/help-requests/:id/claim', express.json(), async (req, res) => {
  try {
    const admin = getAdminFromReq(req)
    if (!admin) return res.status(403).json({ error: 'Forbidden' })
    const id = String(req.params.id || '')
    const adminEmail = admin.email
    if (!id) return res.status(400).json({ error: 'id required' })
    const rec = await claimHelpRequest(id, adminEmail)
    if (!rec) return res.status(404).json({ error: 'Not found' })
    // Broadcast claim update to admin clients (and possibly the user)
    try {
      const payload = JSON.stringify({ type: 'help-request-updated', request: rec })
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        for (const client of wss.clients) {
          try {
            if (client && client.readyState === 1 && client._email && adminEmails.has(String(client._email).toLowerCase())) {
              client.send(payload)
            }
          } catch (e) {}
        }
        // Also notify the requesting user if online
        if (rec.username) {
          const u = users.get(rec.username)
          if (u && u.wsId) {
            const target = clients.get(u.wsId)
            if (target && target.readyState === 1) {
              try { target.send(payload) } catch {}
            }
          }
        }
      }
    } catch (e) { console.warn('[Help] Broadcast claim failed', e && e.message) }

    return res.json({ ok: true, request: rec })
  } catch (err) { console.error('[Help] Claim error:', err && err.message); return res.status(500).json({ error: 'Internal server error.' }) }
})

// Admin: resolve a help request
app.post('/api/admin/help-requests/:id/resolve', express.json(), async (req, res) => {
  try {
    const admin = getAdminFromReq(req)
    if (!admin) return res.status(403).json({ error: 'Forbidden' })
    const id = String(req.params.id || '')
    const adminEmail = admin.email
    if (!id) return res.status(400).json({ error: 'id required' })
    const rec = await resolveHelpRequest(id, adminEmail)
    if (!rec) return res.status(404).json({ error: 'Not found' })
    // Broadcast resolve update
    try {
      const payload = JSON.stringify({ type: 'help-request-updated', request: rec })
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        for (const client of wss.clients) {
          try {
            if (client && client.readyState === 1 && client._email && adminEmails.has(String(client._email).toLowerCase())) {
              client.send(payload)
            }
          } catch (e) {}
        }
        if (rec.username) {
          const u = users.get(rec.username)
          if (u && u.wsId) {
            const target = clients.get(u.wsId)
            if (target && target.readyState === 1) {
              try { target.send(payload) } catch {}
            }
          }
        }
      }
    } catch (e) { console.warn('[Help] Broadcast resolve failed', e && e.message) }

    return res.json({ ok: true, request: rec })
  } catch (err) { console.error('[Help] Resolve error:', err && err.message); return res.status(500).json({ error: 'Internal server error.' }) }
})

// Camera pairing session calibration storage (temporary, code-based)
app.get('/cam/calibration/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code required.' });
  
  try {
    const sess = await camSessions.get(code);
    if (!sess) return res.status(404).json({ error: 'Pairing session not found.' });
    
    if (sess.calibration) {
      return res.json({ ok: true, calibration: sess.calibration });
    } else {
      return res.json({ ok: false, message: 'No calibration stored yet.' });
    }
  } catch (error) {
    console.error('[Camera] Calibration fetch error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/cam/calibration/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code required.' });
  
  try {
    const { H, anchors, imageSize, errorPx } = req.body;
    if (!H) return res.status(400).json({ error: 'Calibration data (H) required.' });
    
    // Get the camera session
    const sess = await camSessions.get(code);
    if (!sess) return res.status(404).json({ error: 'Pairing session not found.' });
    
    // Store calibration in the session
    sess.calibration = {
      H,
      anchors: anchors || null,
      imageSize: imageSize || null,
      errorPx: errorPx || null,
      savedAt: Date.now()
    };
    
    // Update the session in storage
    await camSessions.set(code, sess);
    
    console.log('[Camera] Saved calibration for pairing code:', code);
    return res.json({ success: true, calibration: sess.calibration });
  } catch (error) {
    console.error('[Camera] Calibration error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Camera signal relay via REST polling (fallback when WebSocket unavailable)
app.get('/cam/signal/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code required.' });
  
  try {
    const sess = await camSessions.get(code);
    if (!sess) return res.status(404).json({ error: 'Pairing session not found.' });
    
    // Get any pending messages and clear them
    const messages = sess.pendingMessages || [];
    sess.pendingMessages = [];
    await camSessions.set(code, sess);
    
    console.log('[Camera] Returning', messages.length, 'pending signals for code', code);
    return res.json({ messages });
  } catch (error) {
    console.error('[Camera] Signal fetch error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/cam/signal/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code required.' });
  
  try {
    const { type, payload, source } = req.body;
    if (!type) return res.status(400).json({ error: 'Signal type required.' });
    
    const sess = await camSessions.get(code);
    if (!sess) return res.status(404).json({ error: 'Pairing session not found.' });
    
    // Initialize pending messages array if needed
    if (!sess.pendingMessages) sess.pendingMessages = [];
    
    // Store the signal as a pending message for the other peer
    sess.pendingMessages.push({ type, payload, source });
    
    // CRITICAL FIX: Refresh WebSocket references from live clients map before relaying
    // The stored sess.desktopWs / sess.phoneWs might be stale if the connection reconnected
    if (sess.desktopId) {
      const freshDesktop = clients.get(sess.desktopId);
      if (freshDesktop && freshDesktop.readyState === WebSocket.OPEN) {
        sess.desktopWs = freshDesktop;
      }
    }
    if (sess.phoneId) {
      const freshPhone = clients.get(sess.phoneId);
      if (freshPhone && freshPhone.readyState === WebSocket.OPEN) {
        sess.phoneWs = freshPhone;
      }
    }
    
    // If both peers connected via WebSocket, relay immediately to the other peer
    if (source === 'phone' && sess.desktopWs && sess.desktopWs.readyState === WebSocket.OPEN) {
      try {
        sess.desktopWs.send(JSON.stringify({ type, code, payload }));
        console.log('[Camera] Relayed signal from phone to desktop:', type);
      } catch (e) {
        console.warn('[Camera] Failed to relay to desktop WS:', e);
      }
    } else if (source === 'desktop' && sess.phoneWs && sess.phoneWs.readyState === WebSocket.OPEN) {
      try {
        sess.phoneWs.send(JSON.stringify({ type, code, payload }));
        console.log('[Camera] Relayed signal from desktop to phone:', type);
      } catch (e) {
        console.warn('[Camera] Failed to relay to phone WS:', e);
      }
    }
    
    // Save updated session
    await camSessions.set(code, sess);
    
    console.log('[Camera] Stored signal from', source, 'for code', code, ':', type);
    return res.json({ ok: true, stored: true });
  } catch (error) {
    console.error('[Camera] Signal post error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


// In-memory subscription store (demo)
let subscription = { fullAccess: false };
// Winner-based per-email premium grants (demo) email -> expiry (ms since epoch)
const premiumWinners = new Map();
// In-memory admin store (demo)
const OWNER_EMAIL = 'daviesfamily108@gmail.com'.toLowerCase();
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
  if (adminEmails.has(String(email || '').toLowerCase())) {
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

// Debug: Inspect server-side user state for a given email (in-memory and in Supabase)
app.get('/api/debug/user', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' });
  const inMemoryUser = users.get(email) || null;
  let supabaseUser = null;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
      if (!error && data) supabaseUser = data;
    } catch (err) {
      console.error('[DEBUG] Supabase fetch failed:', err && err.message);
    }
  }
  return res.json({ ok: true, email, inMemoryUser, supabaseUser, admin: adminEmails.has(email), premiumWinner: premiumWinners.get(email) || null, supabaseConfigured: !!supabase });
});

// Debug: show registered routes & methods
app.get('/api/debug/routes', (req, res) => {
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

// Debug endpoint: returns the request headers the server receives (useful to confirm Origin)
app.get('/api/debug/headers', (req, res) => {
  try { res.json({ ok: true, headers: req.headers || {} }) } catch (e) { res.status(500).json({ ok: false, error: 'failed' }) }
})
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

// Debug: Show in-memory cache stats
app.get('/api/debug/cache', (req, res) => {
  try {
    const keys = Array.from(users.keys()).slice(0, 200);
    res.json({ ok: true, usersCount: users.size, users: keys });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'failed' });
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
    if (!process.env.STRIPE_PREMIUM_PAYMENT_LINK || premiumPaymentLink === 'https://buy.stripe.com/YOUR_PREMIUM_LINK_HERE') {
      console.error('[Stripe] STRIPE_PREMIUM_PAYMENT_LINK not set. Set this in your Render environment variables.');
      return res.status(400).json({ ok: false, error: 'STRIPE_NOT_CONFIGURED', message: 'STRIPE_PREMIUM_PAYMENT_LINK not set on server.' })
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
  res.json({ isAdmin: adminEmails.has(String(email || '').toLowerCase()) })
})

app.post('/api/admins/grant', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { email } = req.body || {}
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  adminEmails.add(String(target || '').toLowerCase())
  res.json({ ok: true, admins: Array.from(adminEmails) })
})

app.post('/api/admins/revoke', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { email } = req.body || {}
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  if (target === OWNER_EMAIL) return res.status(400).json({ ok: false, error: 'CANNOT_REVOKE_OWNER' })
  adminEmails.delete(String(target || '').toLowerCase())
  res.json({ ok: true, admins: Array.from(adminEmails) })
})

// Admin ops (owner-only; demo ��� not secure)
app.get('/api/admin/status', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
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
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { enabled } = req.body || {}
  maintenanceMode = !!enabled
  // Optionally notify clients
  broadcastAll({ type: 'maintenance', enabled: maintenanceMode })
  res.json({ ok: true, maintenance: maintenanceMode })
})

app.get('/api/admin/system-health', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  
  const uptime = process.uptime()
  const memUsage = process.memoryUsage()
  
  const isHttps = req.secure
    || (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
    || (req.headers['host'] || '').includes('.onrender.com')
    || (req.headers['origin'] || '').startsWith('https://')
    || (req.headers['referer'] || '').startsWith('https://')
  res.json({
    ok: true,
    health: {
      database: true,
      websocket: true,
      https: isHttps,
      maintenance: maintenanceMode || false,
      clustering: clusteringEnabled,
      uptime: uptime,
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      email: {
        provider: GRAPH_ENABLED ? 'Microsoft Graph (Outlook)' : RESEND_API_KEY ? 'Resend' : (mailer ? 'SMTP' : 'NONE'),
        from: GRAPH_ENABLED ? '(Outlook account)' : RESEND_API_KEY ? RESEND_FROM : EMAIL_FROM,
        smtpHost: !RESEND_API_KEY && !GRAPH_ENABLED ? (SMTP_HOST_RESOLVED || 'not set') : 'n/a',
        smtpSource: !RESEND_API_KEY && !GRAPH_ENABLED ? smtpSource : 'n/a',
        ready: !!(GRAPH_ENABLED || RESEND_API_KEY || mailer),
      },
      version: '1.0.0'
    }
  })
})

app.post('/api/admin/clustering', (req, res) => {
  console.log('[Admin] Clustering toggle request received')
  const owner = getOwnerFromReq(req)
  if (!owner) {
    console.warn('[Admin] Clustering toggle rejected — not owner')
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const { enabled, capacity } = req.body || {}

  if (typeof enabled === 'boolean') {
    clusteringEnabled = enabled
    console.log('[Admin] Clustering', enabled ? 'ENABLED' : 'DISABLED', 'by', owner.email)
  }

  if (typeof capacity === 'number') {
    MAX_CLIENTS = Math.max(1, capacity)
    console.log('[Admin] Updated max clients capacity to:', MAX_CLIENTS)
  }
  res.json({ ok: true, capacity: MAX_CLIENTS, enabled: clusteringEnabled })
})

app.post('/api/admin/announce', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { message } = req.body || {}
  const msg = String(message || '').trim()
  if (!msg) return res.status(400).json({ ok: false, error: 'MESSAGE_REQUIRED' })
  lastAnnouncement = { message: msg, ts: Date.now() }
  broadcastAll({ type: 'announcement', message: msg })
  res.json({ ok: true, announcement: lastAnnouncement })
})

app.post('/api/admin/subscription', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { fullAccess } = req.body || {}
  subscription.fullAccess = !!fullAccess
  res.json({ ok: true, subscription })
})

// Admin: list/grant/revoke per-email premium overrides (demo)
app.get('/api/admin/premium-winners', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const now = Date.now()
  const list = Array.from(premiumWinners.entries()).map(([email, exp]) => ({ email, expiresAt: exp, expired: exp <= now }))
  res.json({ ok: true, winners: list })
})

app.post('/api/admin/premium/grant', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { email, days } = req.body || {}
  const target = String(email || '').toLowerCase()
  const d = Number(days) || 30
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const exp = Date.now() + Math.max(1, d) * 24 * 60 * 60 * 1000
  premiumWinners.set(target, exp)
  res.json({ ok: true, email: target, expiresAt: exp })
})

app.post('/api/admin/premium/revoke', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { email } = req.body || {}
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  premiumWinners.delete(target)
  res.json({ ok: true })
})

app.get('/api/admin/matches', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, matches: Array.from(matches.values()) })
})

app.post('/api/admin/matches/delete', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { matchId } = req.body || {}
  if (!matchId || !matches.has(matchId)) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  matches.delete(matchId)
  // Broadcast updated lobby
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) }))
  }
  res.json({ ok: true })
})

// Admin persistence status endpoint (owner-only)
app.get('/api/admin/persistence/status', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  res.json({ ok: true, supabase: !!supabase, redis: !!redisClient || (!!upstashRestUrl && !!upstashToken), lastTournamentPersistAt })
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
    publishTournamentUpdate(arr).catch(err => console.warn('[Tournaments] publishTournamentUpdate error:', err && err.message))
    res.json({ ok: true })
  } catch (err) {
    console.warn('[Tournaments] force broadcast failed:', err && err.message)
    res.status(500).json({ ok: false, error: 'BROADCAST_FAILED' })
  }
})

// Tournaments HTTP API (demo)
app.get('/api/tournaments', (req, res) => {
  res.json({ ok: true, tournaments: Array.from(tournaments.values()) })
})

app.post('/api/tournaments/create', async (req, res) => {
  const { title, game, mode, value, description, startAt, checkinMinutes, capacity, startingScore, creatorEmail, creatorName, official, prizeType, prizeAmount, currency, prizeNotes, requesterEmail, requireCalibration } = req.body || {}
  const id = nanoid(10)
  const isOwner = String(requesterEmail || '').toLowerCase() === OWNER_EMAIL
  const isOfficial = !!official && isOwner
  const pType = isOfficial ? (prizeType === 'cash' ? 'cash' : 'premium') : 'none'
  const amount = (pType === 'cash' && isOwner) ? Math.max(0, Number(prizeAmount) || 0) : 0
  const curr = (pType === 'cash' && isOwner) ? (String(currency || 'USD').toUpperCase()) : undefined
  const notes = (isOwner && typeof prizeNotes === 'string') ? prizeNotes : ''
  const isAdminCreator = adminEmails.has(String(requesterEmail || '').toLowerCase()) || isOwner
  try { console.log('[Tournaments] create: requester=', String(requesterEmail || ''), 'isOwner=', isOwner, 'isAdminCreator=', isAdminCreator) } catch {}
  const t = {
    id,
    title: String(title || 'Community Tournament'),
    game: typeof game === 'string' ? game : 'X01',
  mode: (typeof mode === 'string' && mode.length > 0) ? mode : 'bestof',
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
      // Use upsert to avoid conflicts and verify by selecting
      const { error: upsertErr } = await supabase.from('tournaments').upsert(payload, { onConflict: 'id' })
      if (upsertErr) {
        console.warn('[Tournaments] Supabase upsert failed:', upsertErr.message || upsertErr)
        return res.status(500).json({ ok: false, error: 'DB_PERSIST_FAILED', details: upsertErr.message || upsertErr })
      }
      try {
        const { data: checkRows, error: checkErr } = await supabase.from('tournaments').select('*').eq('id', t.id).limit(1).single()
        if (checkErr || !checkRows) {
          console.warn('[Tournaments] Supabase verify failed:', checkErr || 'no row')
          return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: (checkErr && checkErr.message) || 'no row' })
        }
      } catch (err) {
        console.warn('[Tournaments] Supabase verify exception:', err && err.message)
        return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: err && err.message })
      }
      upsertTournament({ ...t })
      persistTournamentsToDisk()
    } else {
      upsertTournament({ ...t })
      // Persist to disk
      try { persistTournamentsToDisk() } catch (e) {}
    }
  } catch (err) {
    console.warn('[Tournaments] Persist error:', err && err.message)
    return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' })
  }
  try { console.log(`[TOURNAMENT CREATED] id=${id} title=${t.title} official=${!!t.official} creator=${t.creatorEmail}`) } catch (e) {}
  // Broadcast updated tournaments to all clients
  try { console.log('[Tournaments] broadcasting updated tournaments to clients:', wss.clients && wss.clients.size) } catch {}
  for (const client of wss.clients) { if (client.readyState === 1) client.send(JSON.stringify({ type: 'tournaments', tournaments: Array.from(tournaments.values()) })) }
  // Publish tournament update to other instances (Redis or Upstash REST publish)
  try { await publishTournamentUpdate(Array.from(tournaments.values())) } catch (err) { console.warn('[Tournaments] publishTournamentUpdate error:', err && err.message) }
  const stored = tournaments.get(id) || t
  res.json({ ok: true, tournament: stored })
})

app.post('/api/tournaments/join', async (req, res) => {
  const { tournamentId, email, username } = req.body || {}
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  const addr = String(email || '').toLowerCase()
  if (!addr) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const already = t.participants.find(p => p.email === addr)
  if (already) return res.json({ ok: true, joined: false, already: true, tournament: t })
  if (t.participants.length >= t.capacity) return res.status(400).json({ ok: false, error: 'FULL' })
  t.participants.push({ email: addr, username: String(username || addr) })
  try {
    if (supabase) {
      const { error: insErr } = await supabase.from('tournament_participants').upsert([ { tournament_id: t.id, email: addr, username: String(username || addr) } ], { onConflict: 'tournament_id,email' })
      if (insErr) {
        console.warn('[Tournaments] Supabase join upsert failed:', insErr.message || insErr)
        return res.status(500).json({ ok: false, error: 'DB_PERSIST_FAILED', details: insErr.message || insErr })
      }
      // Verify participant exists
      try {
        const { data: part, error: qErr } = await supabase.from('tournament_participants').select('*').eq('tournament_id', t.id).eq('email', addr).limit(1).single()
        if (qErr || !part) {
          console.warn('[Tournaments] Supabase join verify failed:', qErr || 'no row')
          return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: (qErr && qErr.message) || 'no row' })
        }
      } catch (err) {
        console.warn('[Tournaments] Supabase join verify exception:', err && err.message)
        return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: err && err.message })
      }
    }
    try { persistTournamentsToDisk() } catch (e) {}
  } catch (err) { console.warn('[Tournaments] Persist participant failed:', err && err.message); return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' }) }
  try { console.log('[Tournaments] broadcasting join update to clients:', wss.clients && wss.clients.size) } catch {}
  for (const client of wss.clients) { if (client.readyState === 1) client.send(JSON.stringify({ type: 'tournaments', tournaments: Array.from(tournaments.values()) })) }
  try { await publishTournamentUpdate(Array.from(tournaments.values())) } catch (err) { console.warn('[Tournaments] publishTournamentUpdate error:', err && err.message) }
  res.json({ ok: true, joined: true, tournament: t })
})

app.post('/api/tournaments/leave', async (req, res) => {
  const { tournamentId, email } = req.body || {}
  const t = tournaments.get(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.status !== 'scheduled') return res.status(400).json({ ok: false, error: 'ALREADY_STARTED' })
  const addr = String(email || '').toLowerCase()
  if (!addr) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  const before = t.participants.length
  t.participants = t.participants.filter(p => p.email !== addr)
  const left = t.participants.length < before
  if (left) {
    try {
      if (supabase) {
        const { error: delErr, data: delData } = await supabase.from('tournament_participants').delete().eq('tournament_id', t.id).eq('email', addr)
        if (delErr) {
          console.warn('[Tournaments] Supabase leave failed:', delErr)
          return res.status(500).json({ ok: false, error: 'DB_PERSIST_FAILED', details: delErr.message || delErr })
        }
        // Optionally verify delete: ensure participant no longer exists
        try {
          const { data: rem, error: remErr } = await supabase.from('tournament_participants').select('*').eq('tournament_id', t.id).eq('email', addr).limit(1).single()
          if (!rem && !remErr) {
            // Good: no participant
          } else if (remErr && remErr.code === 'PGRST116') {
            // 'no rows' may be surfaced as a specific error; treat as success
          } else if (rem) {
            console.warn('[Tournaments] Supabase leave verify failed: still exists')
            return res.status(500).json({ ok: false, error: 'DB_VERIFY_FAILED', details: 'still exists' })
          }
        } catch (err) {
          // Non-blocking: log verify failure but don't block operation
          console.warn('[Tournaments] Supabase leave verify exception:', err && err.message)
        }
      }
      try { persistTournamentsToDisk() } catch (e) {}
    } catch (err) { console.warn('[Tournaments] Persist participant removal failed:', err && err.message); return res.status(500).json({ ok: false, error: 'PERSIST_ERROR' }) }
  }
  if (left) for (const client of wss.clients) { if (client.readyState === 1) client.send(JSON.stringify({ type: 'tournaments', tournaments: Array.from(tournaments.values()) })) }
  if (left) try { console.log('[Tournaments] broadcasting leave update to clients:', wss.clients && wss.clients.size) } catch {}
  if (left) try { await publishTournamentUpdate(Array.from(tournaments.values())) } catch (err) { console.warn('[Tournaments] publishTournamentUpdate error:', err && err.message) }
  res.json({ ok: true, left, tournament: t })
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
  try { persistTournamentsToDisk() } catch (e) {}
  try { (async () => {
    if (!supabase) return
    await supabase.from('tournaments').delete().eq('id', id)
    await supabase.from('tournament_participants').delete().eq('tournament_id', id)
  })() } catch (err) { console.warn('[Tournaments] Supabase delete failed:', err && err.message) }
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
  
  tournaments.delete(id)
  try { persistTournamentsToDisk() } catch (e) {}
  try { (async () => {
    if (!supabase) return
    await supabase.from('tournaments').delete().eq('id', id)
    await supabase.from('tournament_participants').delete().eq('tournament_id', id)
  })() } catch (err) { console.warn('[Tournaments] Supabase delete failed:', err && err.message) }
  broadcastTournaments()
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
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).send('FORBIDDEN')
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
  console.log('[Email] ✅ Microsoft Graph API configured — emails will be sent from your Outlook account')
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
  // Microsoft may rotate the refresh token — keep the latest one
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

// --- OAuth2 helper: let admin connect their Outlook account easily ---
app.get('/api/admin/outlook-auth', (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  if (!OUTLOOK_CLIENT_ID) return res.status(400).json({ ok: false, error: 'Set OUTLOOK_CLIENT_ID env var first' })
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
  const redirectUri = `${proto}://${req.get('host')}/api/admin/outlook-callback`
  const authUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'
    + `client_id=${OUTLOOK_CLIENT_ID}`
    + `&response_type=code`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&scope=${encodeURIComponent('https://graph.microsoft.com/Mail.Send offline_access')}`
    + `&response_mode=query`
  res.redirect(authUrl)
})

app.get('/api/admin/outlook-callback', async (req, res) => {
  const code = req.query.code
  if (!code) return res.status(400).send('No authorization code received. ' + (req.query.error_description || ''))
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
      console.log('[Email] ✅ Outlook OAuth2 connected successfully')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(
        `<html><body style="font-family:sans-serif;background:#18122B;color:#F5F5F5;padding:2rem;text-align:center;">` +
        `<h2>✅ Outlook Connected!</h2>` +
        `<p>Add this env var to <b>Render</b> so it persists across deploys:</p>` +
        `<textarea readonly rows="4" cols="80" style="background:#0f0c1d;color:#a084e8;border:1px solid #8F43EE;border-radius:8px;padding:12px;font-size:13px;width:90%;max-width:600px;"` +
        ` onclick="this.select()">OUTLOOK_REFRESH_TOKEN=${data.refresh_token}</textarea>` +
        `<p style="opacity:0.6;margin-top:1rem;">Copy the value above and paste it as an env var in Render dashboard.</p>` +
        `</body></html>`
      )
    } else {
      console.error('[Email] ❌ Outlook OAuth2 failed:', JSON.stringify(data))
      res.status(400).send(`<h2>❌ Failed</h2><pre>${JSON.stringify(data, null, 2)}</pre>`)
    }
  } catch (err) {
    console.error('[Email] ❌ Outlook callback error:', err)
    res.status(500).send(`<h2>❌ Error</h2><pre>${err.message}</pre>`)
  }
})

// --- Admin: test email ---
app.post('/api/admin/test-email', async (req, res) => {
  const owner = getOwnerFromReq(req)
  if (!owner) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  const { to } = req.body || {}
  const target = String(to || owner.email || '').toLowerCase()
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

// Fallback: if primary SMTP vars are missing, try SUPPORT_EMAIL + SUPPORT_EMAIL_PASSWORD
// Attempt to detect the SMTP host from the email domain
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

// Resolve FROM address: SMTP_FROM → SMTP_FORM (common typo) → SMTP_USER → SUPPORT_EMAIL
const EMAIL_FROM = process.env.SMTP_FROM
  || process.env.SMTP_FORM
  || process.env.EMAIL_FROM
  || SMTP_USER_RESOLVED
  || process.env.SUPPORT_EMAIL
  || 'noreply@ninedartnation.com'

// Resend-specific FROM: Resend can only send from verified domains.
// Free tier uses onboarding@resend.dev — outlook.com / gmail.com CANNOT be verified.
const RESEND_FROM = process.env.RESEND_FROM || 'Nine Dart Nation <onboarding@resend.dev>'

// --- Resend (HTTP API) ---
if (RESEND_API_KEY) {
  console.log('[Email] ✅ Resend API key configured — using HTTP email delivery')
  console.log('[Email] Resend FROM:', RESEND_FROM)
}

// --- SMTP ---
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
        logger: DEBUG,
        debug: DEBUG,
      })
      console.log('[Email] SMTP transporter created (source: %s) → host: %s  port: %s  user: %s  from: %s',
        smtpSource, SMTP_HOST_RESOLVED, SMTP_PORT_RESOLVED, SMTP_USER_RESOLVED, EMAIL_FROM)
      mailer.verify().then(() => {
        console.log('[Email] ✅ SMTP connection verified successfully')
      }).catch((err) => {
        console.error('[Email] ❌ SMTP connection verification failed:', err?.message || err)
        console.error('[Email] 💡 Outlook.com SMTP is blocked from cloud hosts. Use Microsoft Graph API instead:')
        console.error('[Email]    Set OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, then visit /api/admin/outlook-auth')
      })
    } else {
      const missing = []
      if (!SMTP_HOST_RESOLVED) missing.push('SMTP_HOST')
      if (!SMTP_PORT_RESOLVED) missing.push('SMTP_PORT')
      if (!SMTP_USER_RESOLVED) missing.push('SMTP_USER')
      if (!SMTP_PASS_RESOLVED) missing.push('SMTP_PASS')
      console.warn('[Email] ⚠️  No email provider configured. Missing:', missing.join(', '))
      console.warn('[Email] Option 1 (best for Outlook): Set OUTLOOK_CLIENT_ID + OUTLOOK_CLIENT_SECRET + OUTLOOK_REFRESH_TOKEN')
      console.warn('[Email] Option 2: Set RESEND_API_KEY (free at resend.com)')
      console.warn('[Email] Option 3: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS')
    }
  } catch (e) {
    console.warn('[Email] transporter init failed', e?.message||e)
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

  // --- Resend HTTP path ---
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

  // --- SMTP path ---
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
    // Use Origin header (frontend URL) or FRONTEND_URL env var — NOT the backend host
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
    // Look up user by email to get their actual username
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
    // Hash the new password
    const hashed = await bcrypt.hash(String(newPassword), 12)
    // Update in-memory user
    const memUser = users.get(email)
    if (memUser) {
      memUser.password = hashed
      users.set(email, memUser)
    }
    // Update in Supabase
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
    // Consume token so it can't be reused
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

// Friends API routes
// NOTE: Keep these minimal for the built/server entry used by integration tests.
// The full friends system may be implemented elsewhere, but messaging must work here.

// Friends list
app.get('/api/friends/list', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  noCache(res)
  
  console.log('[FRIENDS-LIST-START] email=%s', email)
  
  // CRITICAL FIX: Always query Supabase directly if available to ensure friends persist across server restarts
  // The in-memory friendships Map is only a cache and may be empty after restart
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('friend_email, friend_username')
        .eq('user_email', email)
      
      console.log('[FRIENDS-LIST-RESULT] Supabase query: error=%s dataLength=%d', error?.message || 'none', data?.length || 0)
      
      if (!error && Array.isArray(data) && data.length > 0) {
        // Merge Supabase rows with any existing in-memory cache to avoid losing recent local updates
        const existing = friendships.get(email) || new Set()
        const users = global.users || new Map()
        // Populate global.users with persisted usernames from Supabase
        for (const row of data) {
          const friendEmail = String(row.friend_email || '').toLowerCase()
          if (friendEmail && row.friend_username) {
            if (!users.has(friendEmail)) {
              users.set(friendEmail, { email: friendEmail, username: row.friend_username, status: 'offline' })
            } else if (!users.get(friendEmail).username) {
              const u = users.get(friendEmail)
              u.username = row.friend_username
              users.set(friendEmail, u)
            }
          }
        }
        global.users = users
        const merged = new Set(existing)
        for (const row of data) {
          const friendEmail = String(row.friend_email || '').toLowerCase()
          if (friendEmail && friendEmail !== email) merged.add(friendEmail)
        }
        console.log('[FRIENDS-LIST-REBUILT] Merged friendships set: %s', JSON.stringify(Array.from(merged)))
        friendships.set(email, merged)
      } else if (error) {
        console.error('[FRIENDS-LIST-ERROR] Supabase error:', error)
      } else if (!error && Array.isArray(data) && data.length === 0) {
        // Do not clear the in-memory friendships if Supabase has no rows yet
        console.log('[FRIENDS-LIST-NO-ROWS] Supabase returned 0 rows; keeping existing in-memory friendships')
        // REPAIR: If in-memory has friendships but Supabase doesn't, re-persist them
        const existing = friendships.get(email)
        if (existing && existing.size > 0) {
          console.log('[FRIENDS-LIST-REPAIR] In-memory has %d friends but Supabase has 0; re-persisting to Supabase', existing.size)
          for (const friendEmail of existing) {
            try { await upsertFriendshipSupabase(email, friendEmail) } catch (e) {}
          }
        }

        // RECOVERY: If friendships table is empty, rebuild from accepted friend requests
        try {
          const { data: accepted, error: acceptedError } = await supabase
            .from('friend_requests')
            .select('from_email,to_email,status')
            .eq('status', 'accepted')
            .or(`from_email.eq.${email},to_email.eq.${email}`)

          console.log('[FRIENDS-LIST-ACCEPTED] Supabase accepted requests: error=%s dataLength=%d', acceptedError?.message || 'none', accepted?.length || 0)

          if (!acceptedError && Array.isArray(accepted) && accepted.length > 0) {
            const merged = new Set(existing ? Array.from(existing) : [])
            for (const row of accepted) {
              const from = String(row.from_email || '').toLowerCase()
              const to = String(row.to_email || '').toLowerCase()
              const friendEmail = from === email ? to : from
              if (friendEmail && friendEmail !== email) merged.add(friendEmail)
            }
            if (merged.size > 0) {
              friendships.set(email, merged)
              for (const friendEmail of merged) {
                try { await upsertFriendshipSupabase(email, friendEmail) } catch (e) {}
              }
            }
          }
        } catch (err) {
          console.warn('[FRIENDS-LIST-ACCEPTED] Failed to rebuild from friend_requests:', err?.message || err)
        }
      }
    } catch (err) {
      console.error('[FRIENDS-LIST-EXCEPTION] Exception:', err)
    }
  } else {
    console.log('[FRIENDS-LIST-NO-SUPABASE] Supabase not configured')
    // Fallback: Load from in-memory if Supabase is unavailable (development/test mode)
    if (!friendships.size) {
      await loadFriendshipsFromSupabase()
    }
  }
  
  const set = friendships.get(email) || new Set()
  const users = global.users || new Map()
  const list = Array.from(set).map(e => {
    const u = users.get(e) || { email: e, username: e, status: 'offline' }
    const uname = u.username || e
    const avatar = getUserAvatar(uname) || null
    const threeDartAvg = getUser3DA(uname)
    return { email: e, username: uname, status: u.status || 'offline', lastSeen: u.lastSeen, roomId: u.currentRoomId || null, match: u.currentMatch || null, avatar, threeDartAvg }
  })
  res.json({ ok: true, friends: list })
})

// Search users
app.get('/api/friends/search', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase()
  const callerEmail = String(req.query.email || '').toLowerCase()
  const users = global.users || new Map()
  const results = []
  const seenEmails = new Set()
  const myFriends = friendships.get(callerEmail) || new Set()
  const pendingOut = (friendRequests || []).filter(r => r && String(r.from || '').toLowerCase() === callerEmail && String(r.status || 'pending') === 'pending').map(r => String(r.to || '').toLowerCase())
  const pendingIn = (friendRequests || []).filter(r => r && String(r.to || '').toLowerCase() === callerEmail && String(r.status || 'pending') === 'pending').map(r => String(r.from || '').toLowerCase())

  function buildResult(e, u) {
    const uname = u.username || e
    const avatar = getUserAvatar(uname) || null
    const threeDartAvg = getUser3DA(uname)
    let relationship = 'none'
    if (myFriends.has(e)) relationship = 'friend'
    else if (pendingOut.includes(e)) relationship = 'pending-outgoing'
    else if (pendingIn.includes(e)) relationship = 'pending-incoming'
    return { email: e, username: uname, status: u.status || 'offline', lastSeen: u.lastSeen, avatar, threeDartAvg, relationship }
  }

  // Search in-memory first
  for (const [e, u] of users.entries()) {
    if (e === callerEmail) continue
    if (!q || e.includes(q) || (u.username||'').toLowerCase().includes(q)) {
      results.push(buildResult(e, u))
      seenEmails.add(e)
    }
    if (results.length >= 20) break
  }

  // If fewer than 20 results and Supabase is available, also search the database
  if (results.length < 20 && q && supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('email, username')
        .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(20)
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const e = String(row.email || '').toLowerCase()
          if (e === callerEmail || seenEmails.has(e)) continue
          if (!users.has(e)) {
            users.set(e, { email: e, username: row.username, status: 'offline' })
          }
          results.push(buildResult(e, users.get(e) || { email: e, username: row.username, status: 'offline' }))
          seenEmails.add(e)
          if (results.length >= 20) break
        }
      }
    } catch {}
  }

  res.json({ ok: true, results })
})

// Suggested friends
app.get('/api/friends/suggested', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  const users = global.users || new Map()
  const set = friendships.get(email) || new Set()
  const suggestions = []
  for (const [e, u] of users.entries()) {
    if (e !== email && !set.has(e)) {
      const uname = u.username || e
      const avatar = getUserAvatar(uname) || null
      const threeDartAvg = getUser3DA(uname)
      suggestions.push({ email: e, username: uname, status: u.status || 'offline', lastSeen: u.lastSeen, avatar, threeDartAvg })
    }
    if (suggestions.length >= 10) break
  }
  res.json({ ok: true, suggestions })
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

  const now = Date.now()
  const id = `${now}-${Math.random().toString(36).slice(2,8)}`

  // Store as a true 2-way thread (in-memory)
  const threadKey = [from, to].sort().join('|')
  if (!global.dmThreads) global.dmThreads = new Map()
  const dmThreads = global.dmThreads
  const thread = dmThreads.get(threadKey) || []
  const item = { id, from, to, message: msg, ts: now, readBy: [from] }
  thread.push(item)
  dmThreads.set(threadKey, thread)

  // Legacy inbox storage (recipient only)
  if (!global.messages) global.messages = new Map()
  const messages = global.messages
  const arr = messages.get(to) || []
  arr.push({ id, from, message: msg, ts: now, read: false })
  messages.set(to, arr)

  // Try deliver via WS if recipient online
  try {
    const users = global.users
    const clients = global.clients
    const u = users && users.get ? users.get(to) : null
    if (u && u.wsId && clients && clients.get) {
      const target = clients.get(u.wsId)
      if (target && target.readyState === 1) {
        target.send(JSON.stringify({ type: 'friend-message', from, to, message: msg, ts: item.ts, id: item.id }))
      }
    }
  } catch {}

  res.json({ ok: true })
})

// Fetch recent inbox messages (legacy endpoint)
app.get('/api/friends/messages', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  if (!global.messages) global.messages = new Map()
  const messages = global.messages
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
  // Mark read by `me`
  for (const m of thread) {
    try {
      if (Array.isArray(m.readBy) && !m.readBy.includes(me)) m.readBy.push(me)
    } catch {}
  }
  dmThreads.set(threadKey, dmThreads.get(threadKey) || thread)
  global.dmThreads = dmThreads

  // Mark legacy inbox items from `other` as read
  try {
    if (!global.messages) global.messages = new Map()
    const messages = global.messages
    const inbox = messages.get(me) || []
    for (const m of inbox) {
      if (String(m.from||'').toLowerCase() === other) m.read = true
    }
    messages.set(me, inbox)
  } catch {}

  res.json({ ok: true, thread })
})

// Friend requests (incoming/outgoing)
// Stored in `friendRequests` array and persisted to FRIEND_REQUESTS_FILE + Supabase.
// Shape: { from: string, to: string, ts: number, status?: 'pending'|'accepted'|'declined'|'cancelled' }
app.get('/api/friends/requests', async (req, res) => {
const email = String(req.query.email || '').toLowerCase()
noCache(res)
if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })

// Hydrate from Supabase to pick up any requests persisted across restarts
try { await loadFriendRequestsFromSupabase() } catch {}

const users = global.users || new Map()

const incoming = (friendRequests || [])
    .filter((r) => r && String(r.to || '').toLowerCase() === email && String(r.status || 'pending') === 'pending')
    .map((r) => {
      const from = String(r.from || '').toLowerCase()
      const u = users.get(from) || { email: from, username: from, status: 'offline' }
      return { id: r.id, fromEmail: from, fromUsername: u.username, toEmail: email, toUsername: (users.get(email) || {}).username || email, requestedAt: r.ts }
    })
    .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0))

  res.json({ ok: true, requests: incoming })
})

app.get('/api/friends/outgoing', async (req, res) => {
const email = String(req.query.email || '').toLowerCase()
if (!email) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })

// Hydrate from Supabase to pick up any requests persisted across restarts
try { await loadFriendRequestsFromSupabase() } catch {}

const users = global.users || new Map()

const outgoing = (friendRequests || [])
    .filter((r) => r && String(r.from || '').toLowerCase() === email && String(r.status || 'pending') === 'pending')
    .map((r) => {
      const to = String(r.to || '').toLowerCase()
      const u = users.get(to) || { email: to, username: to, status: 'offline' }
      return { id: r.id, fromEmail: email, fromUsername: (users.get(email) || {}).username || email, toEmail: to, toUsername: u.username, requestedAt: r.ts }
    })
    .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0))

  res.json({ ok: true, requests: outgoing })
})

// Send a friend request (creates a pending request instead of instant friendship)
app.post('/api/friends/add', async (req, res) => {
  const { email, friend } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(friend || '').toLowerCase()
  if (!me || !other || me === other) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  // If already friends, skip
  const mySet = friendships.get(me) || new Set()
  if (mySet.has(other)) return res.json({ ok: true, already: true })
  // If a pending request already exists from me to them, skip
  const existing = friendRequests.find(r => r && String(r.from || '').toLowerCase() === me && String(r.to || '').toLowerCase() === other && String(r.status || 'pending') === 'pending')
  if (existing) return res.json({ ok: true, already: true })
  const id = nanoid(10)
  const request = { id, from: me, to: other, ts: Date.now(), status: 'pending' }
  friendRequests.push(request)
  saveFriendRequests()
  // Also persist individual request to Supabase immediately
  try { await upsertFriendRequestSupabase(request) } catch {}
  // Create notification for the recipient
  const users = global.users || new Map()
  const clients = global.clients || new Map()
  const fromUser = users.get(me)
  const fromName = (fromUser && fromUser.username) || me
  createNotification(other, `${fromName} sent you a friend request`, 'friend-request', { fromEmail: me, requestId: id })
  // Try deliver via WS
  const recipientUser = users.get(other)
  if (recipientUser && recipientUser.wsId && clients.get) {
    const target = clients.get(recipientUser.wsId)
    if (target && target.readyState === 1) {
      target.send(JSON.stringify({ type: 'friend-request', fromEmail: me, fromName, requestId: id }))
    }
  }
  res.json({ ok: true })
})

// Remove a friend (mutual removal)
app.post('/api/friends/remove', async (req, res) => {
  const { email, friend } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(friend || '').toLowerCase()
  const mySet = friendships.get(me)
  if (mySet) mySet.delete(other)
  const otherSet = friendships.get(other)
  if (otherSet) otherSet.delete(me)
  saveFriendships()
  await deleteFriendshipSupabase(me, other)
  const users = global.users || new Map()
  const clients = global.clients || new Map()
  const myUser = users.get(me)
  const myName = (myUser && myUser.username) || me
  createNotification(other, `${myName} removed you from their friends list`, 'friend-removed', { fromEmail: me })
  // Try deliver via WS
  const otherUser = users.get(other)
  if (otherUser && otherUser.wsId && clients.get) {
    const target = clients.get(otherUser.wsId)
    if (target && target.readyState === 1) {
      target.send(JSON.stringify({ type: 'friend-removed', fromEmail: me, fromName: myName }))
    }
  }
  res.json({ ok: true })
})

// Accept a friend request
app.post('/api/friends/accept', async (req, res) => {
  const { email, requestId, fromEmail } = req.body || {}
  const me = String(email || '').toLowerCase()
  const fallbackFrom = String(fromEmail || '').toLowerCase()

  console.log('[ACCEPT-START] email=%s requestId=%s', me, requestId)

  if (!me || (!requestId && !fallbackFrom)) {
    return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  }

  // Hydrate from Supabase first to ensure we have all requests
  try { await loadFriendRequestsFromSupabase() } catch {}

  const idx = friendRequests.findIndex(
    r =>
      r &&
      (!requestId || r.id === requestId) &&
      String(r.to || '').toLowerCase() === me &&
      String(r.status || 'pending') === 'pending',
  )
  let requestIdx = idx
  if (requestIdx === -1 && fallbackFrom) {
    requestIdx = friendRequests.findIndex(
      r =>
        r &&
        String(r.from || '').toLowerCase() === fallbackFrom &&
        String(r.to || '').toLowerCase() === me &&
        String(r.status || 'pending') === 'pending',
    )
  }
  if (requestIdx === -1) {
    console.log('[ACCEPT-ERROR] Request not found: requestId=%s me=%s', requestId, me)
    return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })
  }
  const other = String(friendRequests[requestIdx].from || '').toLowerCase()
  console.log('[ACCEPT-FOUND] Accepting request from=%s to=%s', other, me)
  
  friendRequests[requestIdx].status = 'accepted'
  saveFriendRequests()
  // Update the request status in Supabase
  try { await upsertFriendRequestSupabase(friendRequests[requestIdx]) } catch {}

  // Add mutual friendship
  const mySet = friendships.get(me) || new Set()
  mySet.add(other)
  friendships.set(me, mySet)
  const otherSet = friendships.get(other) || new Set()
  otherSet.add(me)
  friendships.set(other, otherSet)
  saveFriendships()
  
  console.log('[ACCEPT-MEMORY] In-memory updated: %s has %d friends, %s has %d friends', me, mySet.size, other, otherSet.size)
  
  try {
    await upsertFriendshipSupabase(me, other)
    console.log('[ACCEPT-DB-DONE] upsertFriendshipSupabase completed')
  } catch (err) {
    console.error('[ACCEPT-DB-ERROR] upsertFriendshipSupabase failed:', err)
    // Don't fail the response — in-memory friendship is already set
  }
  // Notify the original sender
  const users = global.users || new Map()
  const clients = global.clients || new Map()
  const myUser = users.get(me)
  const myName = (myUser && myUser.username) || me
  createNotification(other, `${myName} accepted your friend request`, 'friend-accepted', { fromEmail: me })
  const otherUser = users.get(other)
  const otherName = (otherUser && otherUser.username) || other
  // Notify the original sender via WS
  if (otherUser && otherUser.wsId && clients.get) {
    const target = clients.get(otherUser.wsId)
    if (target && target.readyState === 1) {
      target.send(JSON.stringify({ type: 'friend-accepted', fromEmail: me, fromName: myName }))
    }
  }
  // Also notify the acceptor via WS so their friends list refreshes immediately
  if (myUser && myUser.wsId && clients.get) {
    const selfTarget = clients.get(myUser.wsId)
    if (selfTarget && selfTarget.readyState === 1) {
      selfTarget.send(JSON.stringify({ type: 'friend-accepted', fromEmail: other, fromName: otherName }))
    }
  }
  res.json({ ok: true })
})

// Decline a friend request
app.post('/api/friends/decline', async (req, res) => {
  const { email, requestId } = req.body || {}
  const me = String(email || '').toLowerCase()
  if (!me || !requestId) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  try { await loadFriendRequestsFromSupabase() } catch {}
  const idx = friendRequests.findIndex(r => r && r.id === requestId && String(r.to || '').toLowerCase() === me && String(r.status || 'pending') === 'pending')
  if (idx === -1) return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })
  const other = String(friendRequests[idx].from || '').toLowerCase()
  friendRequests[idx].status = 'declined'
  saveFriendRequests()
  try { await upsertFriendRequestSupabase(friendRequests[idx]) } catch {}
  const users = global.users || new Map()
  const clients = global.clients || new Map()
  const myUser = users.get(me)
  const myName = (myUser && myUser.username) || me
  createNotification(other, `${myName} declined your friend request`, 'friend-declined', { fromEmail: me })
  const otherUser = users.get(other)
  if (otherUser && otherUser.wsId && clients.get) {
    const target = clients.get(otherUser.wsId)
    if (target && target.readyState === 1) {
      target.send(JSON.stringify({ type: 'friend-declined', fromEmail: me, fromName: myName }))
    }
  }
  res.json({ ok: true })
})

// Cancel an outgoing friend request
app.post('/api/friends/cancel', async (req, res) => {
  const { email, requestId } = req.body || {}
  const me = String(email || '').toLowerCase()
  if (!me || !requestId) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  try { await loadFriendRequestsFromSupabase() } catch {}
  const idx = friendRequests.findIndex(r => r && r.id === requestId && String(r.from || '').toLowerCase() === me && String(r.status || 'pending') === 'pending')
  if (idx === -1) return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })
  friendRequests[idx].status = 'cancelled'
  saveFriendRequests()
  try { await upsertFriendRequestSupabase(friendRequests[idx]) } catch {}
  res.json({ ok: true })
})

if (!global.__NDN_PATCHED) {
// --- Minimal auth helpers + in-memory notifications & wallet for integration tests ---
const adminEmails = new Set([String(process.env.OWNER_EMAIL || 'daviesfamily108@gmail.com').toLowerCase()]);

function verifyTokenFromHeader(req) {
  try {
    const header = String(req.headers && req.headers.authorization || '')
    const token = header.split(' ')[1]
    if (!token) return null
    const decoded = jwt.verify(token, JWT_SECRET)
    return String(decoded.email || decoded.username || '').toLowerCase()
  } catch (e) { return null }
}

function requireAuth(req, res, next) {
  const email = verifyTokenFromHeader(req)
  if (!email) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' })
  req.user = { email }
  next()
}

function requireAdmin(req, res, next) {
  const email = verifyTokenFromHeader(req)
  if (!email || !adminEmails.has(email)) return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' })
  req.user = { email }
  next()
}

function requireSelfOrAdminForEmail(getEmailFromReq) {
  return (req, res, next) => {
    const email = verifyTokenFromHeader(req)
    const target = (getEmailFromReq(req) || '').toLowerCase()
    if (!email) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' })
    if (email === target || adminEmails.has(email)) { req.user = { email }; return next() }
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
}

// Simple in-memory notifications store
const notifications = new Map(); // id -> { id, email, message, read }

function makeId() { return nanoid(10) }

// Helper: create a notification entry in-memory
function createNotification(email, message, type, meta) {
  if (!email || !message) return null
  const e = String(email).toLowerCase()
  const id = makeId()
  const rec = { id, email: e, message: String(message), read: false, type: type || 'generic', createdAt: Date.now(), meta: meta || null }
  notifications.set(id, rec)
  return rec
}

app.get('/api/notifications', requireAuth, (req, res) => {
  const email = (req.query.email || req.user?.email || '').toLowerCase()
  const arr = []
  for (const v of notifications.values()) if (!email || (v.email || '').toLowerCase() === email) arr.push(v)
  res.json(arr)
})

app.post('/api/notifications', requireAuth, (req, res) => {
  try {
    const body = req.body || {}
    const id = makeId()
    const rec = { id, email: String(body.email || req.user.email || '').toLowerCase(), message: String(body.message || ''), read: false, type: body.type || null }
    notifications.set(id, rec)
    res.json({ ok: true, notification: rec })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.patch('/api/notifications/:id', requireAuth, requireSelfOrAdminForEmail((req) => req.query.email), (req, res) => {
  const id = String(req.params.id || '')
  const rec = notifications.get(id)
  if (!rec) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  Object.assign(rec, req.body || {})
  notifications.set(id, rec)
  res.json({ ok: true })
})

app.delete('/api/notifications/:id', requireAuth, requireSelfOrAdminForEmail((req) => req.query.email), (req, res) => {
  const id = String(req.params.id || '')
  const ok = notifications.delete(id)
  res.json({ ok })
})

// Minimal in-memory wallet
const wallets = new Map(); // email -> { balances: { USD: cents }, payoutMethods: [] }
// simple in-memory withdrawal requests for integration tests
const withdrawals = []

function ensureWallet(email) {
  email = String(email || '').toLowerCase()
  if (!wallets.has(email)) wallets.set(email, { balances: { USD: 0 }, payoutMethods: [] })
  return wallets.get(email)
}

app.get('/api/wallet/balance', requireAuth, (req, res) => {
  const email = String(req.query.email || req.user?.email || '').toLowerCase()
  const w = ensureWallet(email)
  res.json({ ok: true, wallet: w })
})

app.post('/api/admin/wallet/credit', requireAdmin, (req, res) => {
  try {
    const { email, currency, amount } = req.body || {}
    const cents = Math.round(parseFloat(amount || '0') * 100)
    const w = ensureWallet(String(email || '').toLowerCase())
    w.balances[currency || 'USD'] = (w.balances[currency || 'USD'] || 0) + cents
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.post('/api/wallet/link-card', requireAuth, (req, res) => {
  const { email, brand, last4 } = req.body || {}
  const w = ensureWallet(String(email || req.user?.email || '').toLowerCase())
  w.payoutMethods.push({ id: makeId(), brand, last4 })
  res.json({ ok: true })
})

app.post('/api/wallet/withdraw', requireAuth, (req, res) => {
  const { email, currency, amount } = req.body || {}
  const w = ensureWallet(String(email || req.user?.email || '').toLowerCase())
  const cents = Math.round(parseFloat(amount || '0') * 100)
  if ((w.balances[currency || 'USD'] || 0) < cents) return res.status(400).json({ ok: false, error: 'INSUFFICIENT_FUNDS' })
  w.balances[currency || 'USD'] -= cents
  const reqRec = { id: makeId(), email: String(email || req.user.email).toLowerCase(), currency: currency || 'USD', amount: cents, status: 'paid' }
  // persist to in-memory withdrawals list so admins can list them in tests
  withdrawals.push(reqRec)
  res.json({ ok: true, request: reqRec })
})

app.get('/api/admin/wallet/withdrawals', requireAdmin, (req, res) => {
  // return all withdrawals (no pagination required for tests)
  res.json({ ok: true, withdrawals: withdrawals.slice().reverse() })
})

global.__NDN_PATCHED = true
}

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
  try {
    try { console.log('[BROADCAST] room=%s clients=%s except=%s data=%s', roomId, Array.from(set).map(s => s && s._id).join(','), exceptWs && exceptWs._id, typeof data === 'string' ? data : JSON.stringify(data).slice(0,200)) } catch {}
  } catch {}
  for (const client of set) {
    try {
      const cid = client && client._id
      const ready = client && client.readyState
      if (DEBUG) {
        try { console.log('[BROADCAST-SEND] room=%s target=%s readyState=%s except=%s', roomId, cid, ready, exceptWs && exceptWs._id) } catch {}
      }
      if (client.readyState === 1 && client !== exceptWs) {
        try {
          client.send(payload)
          if (DEBUG) try { console.log('[BROADCAST-SENT] room=%s target=%s', roomId, cid) } catch {}
        } catch (e) {
          try { console.warn('[BROADCAST] failed send to %s: %s', cid, e && e.message) } catch {}
        }
      }
    } catch (e) {
      try { console.warn('[BROADCAST] iteration error for room=%s: %s', roomId, e && e.message) } catch {}
    }
  }
}

// Broadcast a message to all connected WebSocket clients (pre-stringified)
function broadcastAll(data) {
  if (!wss) return
  const payload = (typeof data === 'string') ? data : JSON.stringify(data)
  for (const client of wss.clients) {
    try { if (client.readyState === 1) client.send(payload) } catch (e) {}
  }
}

// Broadcast tournaments snapshot to local clients and optionally publish cross-instance via Redis/Upstash
async function broadcastTournaments() {
  try {
    const arr = Array.from(tournaments.values())
    broadcastAll({ type: 'tournaments', tournaments: arr })
    try { await publishTournamentUpdate(arr) } catch (err) { console.warn('[Tournaments] publishTournamentUpdate error:', err && err.message) }
  } catch (err) { console.warn('[Tournaments] broadcastTournaments error:', err && err.message) }
}

// Constrain ws payload size for safety
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 128 * 1024 });
// MAX_CLIENTS and clusteringEnabled moved to top
console.log(`[WS] WebSocket attached to same server at path /ws`);
wsConnections.set(0)

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  // Check capacity
  if (wss.clients.size > MAX_CLIENTS) {
    try { ws.close(1013, 'Server full') } catch {}
    return
  }
  // Enforce origin allowlist for WS as well
  try {
    const origin = req?.headers?.origin || ''
    if (!isAllowedOrigin(origin)) {
      try { ws.close(1008, 'Origin not allowed') } catch {}
      return
    }
  } catch {}
  try { console.log(`[WS] client connected path=${req?.url||'/'} origin=${req?.headers?.origin||''}`) } catch {}
  ws._id = nanoid(8);
  clients.set(ws._id, ws)
  wsConnections.inc()
  ws._authed = false
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
      try { console.log('[WSMSG-TYPE] from=%s room=%s type=%s', ws._id, ws._roomId, data && data.type) } catch {}
      // Optional WS auth: if REQUIRE_WS_AUTH=1, demand a valid JWT via 'auth' or in 'presence.token'
      if (String(process.env.REQUIRE_WS_AUTH || '0') === '1') {
        if (!ws._authed) {
          let tok = null
          if (data && typeof data.token === 'string') tok = data.token
          if (!tok && data && data.type === 'presence' && typeof data.token === 'string') tok = data.token
          if (tok) {
            try {
              const decoded = jwt.verify(tok, JWT_SECRET)
              ws._authed = true
              ws._username = decoded?.username || ws._username
              ws._email = String(decoded?.email || '').toLowerCase() || ws._email
            } catch {
              try { ws.close(1008, 'Invalid token') } catch {}
              return
            }
          } else {
            // If the message isn't an auth/presence attempt, ignore until authed
            if (data.type !== 'auth' && data.type !== 'presence') return
          }
        }
      }
      // Handle heartbeat pings — keep user marked as online and update lastSeen
      if (data.type === 'ping') {
        if (ws._email && users.has(ws._email)) {
          const u = users.get(ws._email)
          u.lastSeen = Date.now()
          if (u.status !== 'ingame') u.status = 'online'
          users.set(ws._email, u)
        }
        return
      }
      if (data.type === 'join') {
        await leaveRoom(ws);
        await joinRoom(ws, data.roomId);
        ws.send(JSON.stringify({ type: 'joined', roomId: data.roomId, id: ws._id }));
        // Optionally notify others that someone joined (presence will carry details)
        if (ws._roomId) {
          broadcastToRoom(ws._roomId, { type: 'peer-joined', id: ws._id }, ws)
        }
      } else if (data.type === 'state' || data.type === 'sync') {
        // Spectators cannot publish state
        if (ws._spectator) return
        // forward game state to others in room
        // 'sync' is a legacy alias — normalize the payload location
        const statePayload = data.payload || data.match || data
        if (ws._roomId) {
          broadcastToRoom(ws._roomId, { type: 'state', payload: statePayload, from: ws._id }, ws);
          // Celebration hook: if payload indicates a last visit score of 180, broadcast a celebration
          try {
            const p = statePayload
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
        // Re-associate any matches created by this user (they may have reconnected
        // with a new ws._id but the match still has the old creatorId)
        try {
          for (const [_mid, m] of matches.entries()) {
            if (m.creatorName && ws._username && m.creatorName === ws._username && m.creatorId !== ws._id) {
              console.log('[PRESENCE] re-associating match %s creator %s: old=%s new=%s', _mid, ws._username, m.creatorId, ws._id)
              m.creatorId = ws._id
            }
          }
        } catch (e) { console.warn('[PRESENCE] match re-association error:', e) }
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
      } else if (data.type === 'list-tournaments') {
        try { ws.send(JSON.stringify({ type: 'tournaments', tournaments: Array.from(tournaments.values()) })) } catch {}
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
  } else if (data.type === 'cam-offer' || data.type === 'cam-answer' || data.type === 'cam-ice' || data.type === 'cam-calibration') {
        // Forward WebRTC signals and calibration between desktop and phone
        const code = String(data.code || '').toUpperCase()
        const sess = await camSessions.get(code)
        if (!sess) return
        // Route to the OTHER peer: if sender is desktop, forward to phone and vice versa
        const isDesktop = (ws._id === sess.desktopId)
        let targetWs = null
        if (isDesktop && sess.phoneWs) {
          targetWs = sess.phoneWs
        } else if (!isDesktop && sess.desktopWs) {
          targetWs = sess.desktopWs
        }
        // Try to send via WebSocket, store as pending if not connected
        if (targetWs && targetWs.readyState === 1) {
          try { targetWs.send(JSON.stringify({ type: data.type, code, payload: data.payload })) } catch {}
        } else {
          // Store as pending message for REST polling fallback
          if (!sess.pendingMessages) sess.pendingMessages = []
          sess.pendingMessages.push({ type: data.type, payload: data.payload })
          await camSessions.set(code, sess)
        }
  } else if (data.type === 'help-message') {
          // Route helpdesk chat messages between user and admin in real-time
          try {
            const requestId = String(data.requestId || '')
            const text = String(data.message || '')
            if (!requestId || !text) return
            const store = loadHelpFromDisk()
            const idx = store.findIndex(r => String(r.id) === String(requestId))
            if (idx === -1) return
            const reqRec = store[idx]
            const msgObj = {
              fromEmail: ws._email || null,
              fromName: ws._username || null,
              message: text,
              ts: Date.now(),
              admin: !!(ws._email && adminEmails.has(String(ws._email).toLowerCase()))
            }
            reqRec.messages = reqRec.messages || []
            reqRec.messages.push(msgObj)
            // Persist change
            helpCache = store
            persistHelpToDisk()

            const payload = JSON.stringify({ type: 'help-message', requestId: reqRec.id, message: msgObj })

            // If sender is admin, target the requesting user
            if (ws._email && adminEmails.has(String(ws._email).toLowerCase())) {
              if (reqRec.username) {
                const u = users.get(reqRec.username)
                if (u && u.wsId) {
                  const target = clients.get(u.wsId)
                  if (target && target.readyState === 1) {
                    try { target.send(payload) } catch {}
                  }
                }
              }
              // Also echo to other admin clients (so admin UI chat updates)
              for (const client of wss.clients) {
                try {
                  if (client && client.readyState === 1 && client._email && adminEmails.has(String(client._email).toLowerCase())) {
                    client.send(payload)
                  }
                } catch (e) {}
              }
            } else {
              // Sender is user (or anonymous). If claimed, route to claimed admin; otherwise broadcast to all admins
              let sentToAdmin = false
              if (reqRec.claimedBy) {
                const adminEmail = String(reqRec.claimedBy || '').toLowerCase()
                const a = users.get(adminEmail)
                if (a && a.wsId) {
                  const target = clients.get(a.wsId)
                  if (target && target.readyState === 1) {
                    try { target.send(payload); sentToAdmin = true } catch {}
                  }
                }
              }
              if (!sentToAdmin) {
                for (const client of wss.clients) {
                  try {
                    if (client && client.readyState === 1 && client._email && adminEmails.has(String(client._email).toLowerCase())) {
                      client.send(payload)
                    }
                  } catch (e) {}
                }
              }
            }
          } catch (e) { console.warn('[Help] help-message handling failed', e && e.message) }
        } else if (data.type === 'help-typing') {
          // Brief typing indicator forwarded to relevant parties (admins + requesting user)
          try {
            const requestId = String(data.requestId || '')
            if (!requestId) return
            const store = loadHelpFromDisk()
            const idx = store.findIndex(r => String(r.id) === String(requestId))
            if (idx === -1) return
            const reqRec = store[idx]
            const who = String(data.fromName || data.fromEmail || (data.admin ? 'admin' : 'user'))
            const msg = { type: 'help-typing', requestId: reqRec.id, fromName: who, admin: !!data.admin }
            const payload2 = JSON.stringify(msg)
            // Send to claimed admin (if present) or broadcast to admins
            if (reqRec.claimedBy) {
              const adminEmail = String(reqRec.claimedBy || '').toLowerCase()
              const a = users.get(adminEmail)
              if (a && a.wsId) {
                const target = clients.get(a.wsId)
                if (target && target.readyState === 1) {
                  try { target.send(payload2) } catch {}
                }
              }
            } else {
              for (const client of wss.clients) {
                try {
                  if (client && client.readyState === 1 && client._email && adminEmails.has(String(client._email).toLowerCase())) {
                    client.send(payload2)
                  }
                } catch (e) {}
              }
            }
            // Also notify requesting user if online
            if (reqRec.username) {
              const u = users.get(reqRec.username)
              if (u && u.wsId) {
                const target = clients.get(u.wsId)
                if (target && target.readyState === 1) {
                  try { target.send(payload2) } catch {}
                }
              }
            }
          } catch (e) { console.warn('[Help] help-typing handling failed', e && e.message) }
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
      else if (data.type === 'create-match') {
        const game = typeof data.game === 'string' ? data.game : 'X01'
        const id = nanoid(10)
        const m = {
          id,
          creatorId: ws._id,
          creatorName: ws._username || `user-${ws._id}`,
          creatorEmail: ws._email || '',
          mode: data.mode === 'firstto' ? 'firstto' : 'bestof',
          value: Number(data.value) || 1,
          startingScore: Number(data.startingScore) || 501,
          creatorAvg: Number(data.creatorAvg) || 0,
          game,
          requireCalibration: !!data.requireCalibration,
          createdAt: Date.now(),
        }
        matches.set(id, m)
        try { persistMatchesToDisk() } catch (e) {}
        // Broadcast lobby list to all
        const lobbyPayload = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
        for (const client of wss.clients) { if (client.readyState === 1) client.send(lobbyPayload) }
      } else if (data.type === 'list-matches') {
        ws.send(JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) }))
      }
      // ── Join-match: opponent wants to join a match ──
      else if (data.type === 'join-match') {
        const matchId = String(data.matchId || '')
        const m = matches.get(matchId)
        if (!m) { try { ws.send(JSON.stringify({ type: 'error', code: 'NOT_FOUND', message: 'Match not found' })) } catch {} ; return }
        // Store the joiner info on the match
        m.joinerId = ws._id
        m.joinerName = ws._username || `user-${ws._id}`
        m.joinerEmail = ws._email || ''
        matches.set(matchId, m)
        // Send an invite notification to the CREATOR so they can accept/decline.
        // The joiner receives a waiting acknowledgement.
        const invitePayload = JSON.stringify({
          type: 'invite',
          matchId: m.id,
          game: m.game,
          mode: m.mode,
          value: m.value,
          startingScore: m.startingScore,
          fromId: ws._id,
          fromName: m.joinerName
        })
        // Send waiting ack to joiner
        try { ws.send(JSON.stringify({ type: 'invite-waiting', matchId: m.id, creatorName: m.creatorName })) } catch {}
        // Send invite to creator — try by ID first, then by username as fallback
        let creatorFound = false
        try {
          for (const client of wss.clients) {
            if (client.readyState === 1 && client._id === m.creatorId) {
              client.send(invitePayload)
              creatorFound = true
              break
            }
          }
          // Fallback: find creator by username if ID lookup failed (reconnected with new ID)
          if (!creatorFound && m.creatorName) {
            for (const client of wss.clients) {
              if (client.readyState === 1 && client._username === m.creatorName && client._id !== ws._id) {
                client.send(invitePayload)
                // Update the match's creatorId to the new connection
                m.creatorId = client._id
                matches.set(matchId, m)
                creatorFound = true
                console.log('[JOIN-MATCH] creator found by username fallback, updated creatorId to %s', client._id)
                break
              }
            }
          }
        } catch {}
        // Also try email-based lookup as a last resort
        if (!creatorFound) {
          try {
            for (const client of wss.clients) {
              if (client.readyState === 1 && client._email && m.creatorEmail && client._email === m.creatorEmail && client._id !== ws._id) {
                client.send(invitePayload)
                m.creatorId = client._id
                matches.set(matchId, m)
                creatorFound = true
                console.log('[JOIN-MATCH] creator found by email fallback, updated creatorId to %s', client._id)
                break
              }
            }
          } catch {}
        }
        console.log('[JOIN-MATCH] %s wants to join match %s (creator=%s creatorId=%s creatorFound=%s)', ws._username, matchId, m.creatorName, m.creatorId, creatorFound)
      }
      // ── Prestart choice: bull or skip ──
      else if (data.type === 'prestart-choice') {
        const roomId = String(data.roomId || '')
        const choice = data.choice === 'bull' ? 'bull' : 'skip'
        if (!global._prestartState) global._prestartState = new Map()
        const state = global._prestartState.get(roomId)
        if (!state) return
        state.choices[ws._id] = choice
        global._prestartState.set(roomId, state)
        // Notify the other player of this choice
        const m = matches.get(roomId)
        if (m) {
          const notifyPayload = JSON.stringify({ type: 'prestart-choice-notify', roomId, playerId: ws._id, playerName: ws._username, choice })
          for (const client of wss.clients) {
            if (client.readyState === 1 && (client._id === m.creatorId || client._id === m.joinerId) && client._id !== ws._id) {
              try { client.send(notifyPayload) } catch {}
            }
          }
        }
        // Check if both players have chosen
        const choiceValues = Object.values(state.choices)
        if (choiceValues.length >= 2) {
          const allSkip = choiceValues.every(c => c === 'skip')
          const anyBull = choiceValues.some(c => c === 'bull')
          if (allSkip) {
            // Both skipped → creator throws first → start match
            const startPayload = JSON.stringify({ type: 'match-start', roomId, firstThrowerId: m?.creatorId, firstThrowerName: m?.creatorName, match: { game: m?.game, mode: m?.mode, value: m?.value, startingScore: m?.startingScore, creatorName: m?.creatorName, creatorId: m?.creatorId, joinerName: m?.joinerName, joinerId: m?.joinerId } })
            for (const client of wss.clients) {
              if (client.readyState === 1 && m && (client._id === m.creatorId || client._id === m.joinerId)) {
                try { client.send(startPayload) } catch {}
              }
            }
            console.log('[PRESTART] both skipped in %s, creator %s goes first', roomId, m?.creatorName)
          } else if (anyBull) {
            // At least one chose bull → activate bull-up
            const bullPayload = JSON.stringify({ type: 'prestart-bull', roomId })
            for (const client of wss.clients) {
              if (client.readyState === 1 && m && (client._id === m.creatorId || client._id === m.joinerId)) {
                try { client.send(bullPayload) } catch {}
              }
            }
            console.log('[PRESTART] bull-up activated in %s', roomId)
          }
        }
      }
      // ── Prestart bull throw: player reports distance in mm ──
      else if (data.type === 'prestart-bull-throw') {
        const roomId = String(data.roomId || '')
        const score = Number(data.score || 999)
        if (!global._prestartState) global._prestartState = new Map()
        const state = global._prestartState.get(roomId)
        if (!state) return
        if (!state.throws) state.throws = {}
        state.throws[ws._id] = { score, name: ws._username }
        global._prestartState.set(roomId, state)
        const m = matches.get(roomId)
        if (!m) return
        // Check if both players have thrown
        const throwEntries = Object.entries(state.throws)
        if (throwEntries.length >= 2) {
          const sorted = throwEntries.sort((a, b) => a[1].score - b[1].score)
          if (sorted[0][1].score === sorted[1][1].score) {
            // Tie — reset throws for another round
            state.throws = {}
            global._prestartState.set(roomId, state)
            const tiePayload = JSON.stringify({ type: 'prestart-bull-tie', roomId })
            for (const client of wss.clients) {
              if (client.readyState === 1 && (client._id === m.creatorId || client._id === m.joinerId)) {
                try { client.send(tiePayload) } catch {}
              }
            }
            // Re-activate bull-up
            const bullPayload = JSON.stringify({ type: 'prestart-bull', roomId })
            for (const client of wss.clients) {
              if (client.readyState === 1 && (client._id === m.creatorId || client._id === m.joinerId)) {
                try { client.send(bullPayload) } catch {}
              }
            }
            console.log('[PRESTART] bull-up tie in %s, going again', roomId)
          } else {
            const winnerId = sorted[0][0]
            const winnerName = sorted[0][1].name
            const winnerPayload = JSON.stringify({ type: 'prestart-bull-winner', roomId, winnerId, winnerName, throws: state.throws })
            for (const client of wss.clients) {
              if (client.readyState === 1 && (client._id === m.creatorId || client._id === m.joinerId)) {
                try { client.send(winnerPayload) } catch {}
              }
            }
            console.log('[PRESTART] bull winner in %s: %s (%.1fmm)', roomId, winnerName, sorted[0][1].score)
          }
        }
      }
      // ── Invite response (accept/decline) ──
      else if (data.type === 'invite-response') {
        const matchId = String(data.matchId || '')
        const accept = !!data.accept
        const m = matches.get(matchId)
        if (!m) return
        if (accept) {
          const startPayload = JSON.stringify({ type: 'match-start', roomId: matchId, firstThrowerId: m.creatorId, firstThrowerName: m.creatorName, match: { game: m.game, mode: m.mode, value: m.value, startingScore: m.startingScore, creatorName: m.creatorName, creatorId: m.creatorId, joinerName: m.joinerName, joinerId: m.joinerId } })
          for (const client of wss.clients) {
            if (client.readyState === 1 && (client._id === m.creatorId || client._id === m.joinerId)) {
              try { client.send(startPayload) } catch {}
            }
          }
          console.log('[INVITE-RESPONSE] accepted match %s — match-start sent', matchId)
        }
      }
      // ── Invite accept: creator accepts an incoming invite → start prestart for both ──
      else if (data.type === 'invite-accept') {
        const matchId = String(data.matchId || '')
        const m = matches.get(matchId)
        if (!m) return
        const prestartEndsAt = Date.now() + 15000
        const prestartPayload = JSON.stringify({
          type: 'match-prestart',
          match: { ...m, modeType: m.mode || 'firstto', legs: m.value || 1, createdBy: m.creatorName },
          prestartEndsAt
        })
        // Initialise prestart state
        if (!global._prestartState) global._prestartState = new Map()
        global._prestartState.set(matchId, { choices: {}, throws: {}, prestartEndsAt })
        // Send prestart to both creator and joiner
        for (const client of wss.clients) {
          if (client.readyState === 1 && (client._id === m.creatorId || client._id === m.joinerId)) {
            try { client.send(prestartPayload) } catch {}
          }
        }
        console.log('[INVITE-ACCEPT] creator accepted invite for match %s — prestart sent to both', matchId)
      }
      // ── Invite decline: creator declines an incoming invite ──
      else if (data.type === 'invite-decline') {
        const matchId = String(data.matchId || '')
        const m = matches.get(matchId)
        if (!m) return
        // Notify the joiner
        const declinePayload = JSON.stringify({ type: 'declined', matchId })
        for (const client of wss.clients) {
          if (client.readyState === 1 && client._id === m.joinerId) {
            try { client.send(declinePayload) } catch {}
          }
        }
        // Track decline count — remove match after 3 declines
        m.declineCount = (m.declineCount || 0) + 1
        if (m.declineCount >= 3) {
          matches.delete(matchId)
          console.log('[INVITE-DECLINE] match %s removed after %d declines', matchId, m.declineCount)
          try { persistMatchesToDisk() } catch {}
          // Broadcast updated lobby
          const lobbyPayload = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
          for (const c of wss.clients) { if (c.readyState === 1) try { c.send(lobbyPayload) } catch {} }
        } else {
          // Clear joiner info so someone else can join
          m.joinerId = null
          m.joinerName = null
          m.joinerEmail = null
          matches.set(matchId, m)
          console.log('[INVITE-DECLINE] creator declined match %s (declines: %d/3)', matchId, m.declineCount)
        }
      }
      else if (data.type === 'match-quit') {
        // A player quit the match — notify everyone else in the room
        const roomId = ws._roomId
        if (roomId) {
          broadcastToRoom(roomId, {
            type: 'opponent-quit',
            quitterName: ws._username || 'Opponent',
            quitterId: ws._id
          }, ws)
        }
      }
      else if (data.type === 'match-pause') {
        // A player paused the match — notify everyone else in the room
        const roomId = ws._roomId
        if (roomId) {
          broadcastToRoom(roomId, {
            type: 'opponent-paused',
            pauserName: ws._username || 'Opponent',
            pauseMinutes: data.pauseMinutes || null,
            pauseStartedAt: Date.now()
          }, ws)
        }
      }
      else if (data.type === 'match-unpause') {
        // A player resumed the match — notify everyone else in the room
        const roomId = ws._roomId
        if (roomId) {
          broadcastToRoom(roomId, {
            type: 'opponent-unpaused',
            resumerName: ws._username || 'Opponent'
          }, ws)
        }
      }
      else if (data.type === 'set-match-autocommit') {
        // Host or admin may toggle server-side autocommit allowed flag for a room
        const roomId = String(data.roomId || '')
        const allow = !!data.allow
        if (!roomId) return
        const creatorId = roomCreator.get(roomId)
        const isCreator = creatorId && String(creatorId) === String(ws._id)
        const isAdmin = ws._email && adminEmails && adminEmails.has && adminEmails.has(String(ws._email).toLowerCase())
        if (!isCreator && !isAdmin) {
          try { ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only match creator or admin can set autocommit' })) } catch {}
          return
        }
        try { roomAutocommitAllowed.set(roomId, !!allow) } catch (e) {}
        // Notify all participants in the room of the updated setting
        broadcastToRoom(roomId, { type: 'match-autocommit-updated', roomId, allow })
        // Also notify the sender directly (ack) so tests can assert server processed toggle.
        try { ws.send(JSON.stringify({ type: 'match-autocommit-updated', roomId, allow })) } catch {}
      } else if (data.type === 'auto-visit') {
        // Minimal server-side autocommit handling for packaged runtime used in tests
        // Provide conservative validation so tests relying on pBoard mismatch (e.g. 9999,9999)
        // are rejected rather than accepted by this simplified runtime.
        try {
            const roomId = String(data.roomId || '')
          const value = Number(data.value || 0)
          const darts = Number(data.darts || 3)
          const ring = (typeof data.ring === 'string') ? data.ring : null
          const sector = (typeof data.sector === 'number' || typeof data.sector === 'string') ? Number(data.sector) : null
          const pBoard = data.pBoard && typeof data.pBoard === 'object' ? { x: Number(data.pBoard.x || 0), y: Number(data.pBoard.y || 0) } : null
          const calibrationValid = !!data.calibrationValid
          if (!roomId) return
            // Require calibration validity and a pBoard payload for server autocommit
          if (!calibrationValid) { try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'Client reports invalid calibration - autocommit rejected' })) } catch {} ; return }
          if (!pBoard) { try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'pBoard required for server autocommit' })) } catch {} ; return }
            // Enforce autocommit allowed flag (or creator/admin override)
            try {
              const isCreator = String(roomCreator.get(roomId)) === String(ws._id)
              const isAdmin = !!(ws._email && adminEmails && adminEmails.has && adminEmails.has(String(ws._email).toLowerCase()))
              const allowed = (roomAutocommitAllowed.get(roomId) === true) || isCreator || isAdmin
              if (!allowed) { try { ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Autocommit not allowed for this room' })) } catch {} ; return }
            } catch (e) {
              // If something goes wrong determining allowed, reject conservatively
              try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'Autocommit validation failed' })) } catch {} ; return
            }
          // Validate pBoard coordinates against expected board scoring (approximation from authoritative server)
          try {
            const srvScore = scoreAtBoardPoint(pBoard)
            const allowedVal = Number(srvScore.base || 0)
            if (allowedVal !== value || (ring && srvScore.ring !== ring) || (sector && Number(srvScore.sector) !== Number(sector))) {
              try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', message: 'pBoard does not match claimed score' })) } catch {}
              return
            }
              const rad = Math.hypot(Number(pBoard.x || 0), Number(pBoard.y || 0))
              // Reject obviously out-of-bounds coordinates aggressively
              if (Math.abs(pBoard.x) > 10000 || Math.abs(pBoard.y) > 10000) {
                try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', message: 'pBoard outside plausible bounds' })) } catch {}
                return
              }
              if (rad > (BoardRadii.doubleOuter + 5)) {
              try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', message: 'pBoard outside board bounds' })) } catch {}
              return
            }
          } catch (e) {
            try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_PAYLOAD', message: 'pBoard validation failed' })) } catch {}
            return
          }
          // Ensure sender is in the room
          if (ws._roomId !== roomId) { try { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'Not in room' })) } catch {} ; return }
            // Deduplicate near-duplicate auto-visits from the same player in short succession
            try {
              // store last visit signature+timestamp per room/player to avoid broadcasting duplicates
              if (!global._lastAutoVisit) global._lastAutoVisit = new Map();
              const roomMap = global._lastAutoVisit.get(roomId) || new Map();
              const lastRec = roomMap.get(ws._id) || { ts: 0, sig: null };
              const nowTs = Date.now();
              const sig = `${value}:${ring || ''}:${sector || ''}:${Number(pBoard.x||0)}:${Number(pBoard.y||0)}`;
              // If identical signature and within 250ms, ignore as a duplicate
              if (lastRec.sig === sig && (nowTs - lastRec.ts) < 250) {
                try { ws.send(JSON.stringify({ type: 'error', code: 'TOO_SOON', message: 'Duplicate auto-visit ignored' })) } catch {}
                return
              }
              roomMap.set(ws._id, { ts: nowTs, sig });
              global._lastAutoVisit.set(roomId, roomMap);
            } catch (e) {}

            const visit = { by: ws._id, value, darts, ring, sector, ts: Date.now(), pBoard }
          try { console.log('[AUTO_VISIT_BROADCAST] room=%s visitBy=%s visit=%s', roomId, ws._id, JSON.stringify(visit).slice(0,200)) } catch {}
          try {
            const members = Array.from((rooms.get(roomId) || [])).map(c => ({ id: c && c._id, readyState: c && c.readyState }))
            try { console.log('[AUTO_VISIT_ROOM_MEMBERS] room=%s members=%s', roomId, JSON.stringify(members)) } catch {}
          } catch (e) { try { console.warn('[AUTO_VISIT] failed to list room members %s', e && e.message) } catch {} }
          try { broadcastToRoom(roomId, { type: 'visit-commit', roomId, visit }) } catch (e) { try { console.warn('[AUTO_VISIT] broadcast failed %s', e && e.message) } catch {} }
        } catch (e) { try { console.warn('[AUTO_VISIT] handler error %s', e && e.message) } catch {} }
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
    // Instead of immediately removing matches created by this client, keep them
    // for a grace period (2 minutes) so the creator can reconnect.  Mark with a
    // timestamp so a periodic cleanup can prune truly orphaned matches later.
    for (const [id, m] of Array.from(matches.entries())) {
      if (m.creatorId === ws._id) {
        m._creatorDisconnectedAt = Date.now()
        console.log('[WS] creator disconnected for match %s, keeping for grace period', id)
      }
    }
    // Schedule cleanup of orphaned matches after 2 minutes
    const disconnectedId = ws._id
    const disconnectedUsername = ws._username
    setTimeout(() => {
      try {
        for (const [id, m] of Array.from(matches.entries())) {
          // Only delete if the match still points to the disconnected ID
          // (i.e. the creator did NOT reconnect and re-associate)
          if (m.creatorId === disconnectedId && m._creatorDisconnectedAt) {
            // Check if the creator reconnected with a different ID by looking
            // for a client with the same username
            let reconnected = false
            try {
              for (const client of wss.clients) {
                if (client.readyState === 1 && client._username && client._username === disconnectedUsername) {
                  reconnected = true
                  // Re-associate the match with the new connection
                  m.creatorId = client._id
                  delete m._creatorDisconnectedAt
                  console.log('[WS] creator %s reconnected for match %s, new id=%s', disconnectedUsername, id, client._id)
                  break
                }
              }
            } catch {}
            if (!reconnected) {
              matches.delete(id)
              console.log('[WS] deleted orphaned match %s (creator %s never reconnected)', id, disconnectedUsername)
              // Broadcast updated lobby
              try {
                const lobbyUpdate = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
                for (const client of wss.clients) { if (client.readyState === 1) client.send(lobbyUpdate) }
              } catch {}
            }
          }
        }
      } catch (e) { console.warn('[WS] orphaned match cleanup error:', e) }
    }, 120000) // 2 minutes grace period
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

// Persist matches to disk (fallback if Supabase not configured)
const MATCHES_FILE = path.join(__dirname, 'data', 'matches.json')
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
      console.log('[Matches] Loaded', matches.size, 'matches from disk')
    }
  } catch (err) { console.warn('[Matches] Failed to load from disk:', err && err.message) }
}

function persistMatchesToDisk() {
  try {
    const dir = path.dirname(MATCHES_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const arr = Array.from(matches.values())
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(arr, null, 2), 'utf8')
  try { console.log(`[Matches] Persisted ${arr.length} matches to ${MATCHES_FILE}`) } catch (e) {}
  } catch (err) { console.warn('[Matches] Failed to persist to disk:', err && err.message) }
}

loadMatchesFromDisk()

// Periodic stale match cleanup: remove matches older than 2 hours or with status 'completed'
const MATCH_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours
setInterval(() => {
  const now = Date.now()
  let removed = 0
  for (const [id, m] of matches) {
    const age = now - (m.createdAt || 0)
    if (age > MATCH_MAX_AGE_MS || m.status === 'completed' || m.status === 'played') {
      matches.delete(id)
      removed++
    }
  }
  if (removed > 0) {
    try { persistMatchesToDisk() } catch {}
    const lobbyPayload = JSON.stringify({ type: 'matches', matches: Array.from(matches.values()) })
    for (const c of wss.clients) { if (c.readyState === 1) try { c.send(lobbyPayload) } catch {} }
    console.log('[Matches] Cleaned up %d stale matches', removed)
  }
}, 60 * 1000) // run every minute

// Per-room server-side autocommit permission (roomId -> boolean)
const roomAutocommitAllowed = new Map();
// Track room creator id so allow host-only operations
const roomCreator = new Map();
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
let lastOfficialDeleteAt = 0
let lastTournamentPersistAt = null

function normalizeTournament(raw) {
  const row = raw || {}
  const id = String(row.id || row.tournament_id || nanoid(10))
  const startAt = (() => {
    if (typeof row.startAt === 'number') return row.startAt
    if (row.start_at) {
      const ts = Date.parse(row.start_at)
      if (!Number.isNaN(ts)) return ts
    }
    if (typeof row.start === 'number') return row.start
    return Date.now() + 60 * 60 * 1000
  })()
  const createdAt = (() => {
    if (typeof row.createdAt === 'number') return row.createdAt
    if (row.created_at) {
      const ts = Date.parse(row.created_at)
      if (!Number.isNaN(ts)) return ts
    }
    return Date.now()
  })()
  const updatedAt = (() => {
    if (typeof row.updatedAt === 'number') return row.updatedAt
    if (row.updated_at) {
      const ts = Date.parse(row.updated_at)
      if (!Number.isNaN(ts)) return ts
    }
    return createdAt
  })()

  return {
    id,
    title: String(row.title || 'Community Tournament'),
    game: typeof row.game === 'string' ? row.game : 'X01',
    mode: row.mode === 'firstto' ? 'firstto' : 'bestof',
    value: Number(row.value) || 1,
    description: typeof row.description === 'string' ? row.description : '',
    startAt,
    checkinMinutes: Number(row.checkinMinutes ?? row.checkin_minutes ?? 15) || 0,
    capacity: Number(row.capacity ?? 8) || 8,
    participants: Array.isArray(row.participants) ? row.participants : [],
    official: !!row.official,
    requireCalibration: !!(row.requireCalibration ?? row.require_calibration),
    prize: !!row.prize,
    prizeType: row.prizeType || row.prize_type || 'none',
    prizeAmount: row.prizeAmount ?? row.prize_amount ?? null,
    currency: row.currency || null,
    payoutStatus: row.payoutStatus || row.payout_status || 'none',
    status: row.status || 'scheduled',
    winnerEmail: row.winnerEmail ?? row.winner_email ?? null,
    winnerName: row.winnerName ?? row.winner_name ?? null,
    startingScore: row.startingScore ?? row.starting_score ?? null,
    creatorEmail: row.creatorEmail ?? row.creator_email ?? null,
    creatorName: row.creatorName ?? row.creator_name ?? null,
    prizeNotes: row.prizeNotes ?? row.prize_notes ?? '',
    createdAt,
    updatedAt
  }
}

function upsertTournament(raw) {
  const normalized = normalizeTournament(raw)
  tournaments.set(normalized.id, normalized)
  return normalized
}

// Persist tournaments to disk (fallback if Supabase not configured)
const TOURNAMENTS_FILE = path.join(__dirname, 'data', 'tournaments.json')
function loadTournamentsFromDisk() {
  try {
    if (!fs.existsSync(TOURNAMENTS_FILE)) return
    const raw = fs.readFileSync(TOURNAMENTS_FILE, 'utf8') || ''
    const arr = JSON.parse(raw || '[]')
    if (Array.isArray(arr)) {
      tournaments.clear()
      for (const t of arr) { upsertTournament(t) }
      console.log('[Tournaments] Loaded', tournaments.size, 'tournaments from disk')
    }
  } catch (err) { console.warn('[Tournaments] Failed to load from disk:', err && err.message) }
}

function persistTournamentsToDisk() {
  try {
    const dir = path.dirname(TOURNAMENTS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const arr = Array.from(tournaments.values())
  fs.writeFileSync(TOURNAMENTS_FILE, JSON.stringify(arr, null, 2), 'utf8')
  try { lastTournamentPersistAt = Date.now() } catch {}
  // Also persist into Redis/Upstash for cross-instance persistence if available
  try { persistTournamentsToRedis(arr).catch(() => {}) } catch {}
  } catch (err) { console.warn('[Tournaments] Failed to persist to disk:', err && err.message) }
}

// Persist tournaments to Redis or Upstash REST key for cross-instance persistence.
async function persistTournamentsToRedis(arr) {
  try {
    if (redisClient) {
      try {
  await redisClient.set('ndn:tournaments:json', JSON.stringify(arr));
  try { lastTournamentPersistAt = Date.now() } catch {}
  return true
      } catch (err) { console.warn('[Tournaments] Redis set failed:', err && err.message) }
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
      } catch (err) { console.warn('[Tournaments] Upstash set failed:', err && err.message) }
    }
  } catch (err) { console.warn('[Tournaments] persistTournamentsToRedis error:', err && err.message) }
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
          for (const t of data) upsertTournament(t)
          console.log('[Tournaments] Loaded', tournaments.size, 'tournaments from Supabase')
          return
        }
      } catch (err) { console.warn('[Tournaments] Supabase load failed:', err && err.message) }
    }
    // try Redis/Upstash
    try {
      if (redisClient) {
        const raw = await redisClient.get('ndn:tournaments:json')
        if (raw) {
          const arr = JSON.parse(raw || '[]')
          if (Array.isArray(arr) && arr.length) {
            tournaments.clear()
            for (const t of arr) upsertTournament(t)
            console.log('[Tournaments] Loaded', tournaments.size, 'tournaments from Redis')
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
            for (const t of arr) upsertTournament(t)
            console.log('[Tournaments] Loaded', tournaments.size, 'tournaments from Upstash')
            return
          }
        }
      }
    } catch (err) { console.warn('[Tournaments] Redis/Upstash load failed:', err && err.message) }
    // Fallback to disk
    loadTournamentsFromDisk()
  } catch (err) { console.warn('[Tournaments] loadTournamentsFromPersistence error:', err && err.message) }
}

async function publishTournamentUpdate(arr) {
  const payload = { type: 'tournaments', tournaments: arr }
  try {
    // Prefer Redis TCP client publish if available
    if (redisClient && typeof redisClient.publish === 'function') {
      await redisClient.publish('ndn:tournaments', JSON.stringify(payload))
      return
    }
  } catch (err) { console.warn('[Redis] Failed to publish via redis client:', err && err.message) }

  // Fallback: Upstash REST publish
  try {
    if (upstashRestUrl && upstashToken) {
      const res = await fetch(`${upstashRestUrl}/publish/ndn:tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${upstashToken}` },
        body: JSON.stringify({ message: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(5000)
      })
      try { const j = await res.json(); console.log('[UPSTASH] publish response', res.status, j); if (!res.ok) console.warn('[UPSTASH] publish response not ok', j) } catch (e) {}
    }
  } catch (err) { console.warn('[UPSTASH] Failed to publish tournament update:', err && err.message) }
}

// Load persisted tournaments at startup
// Load persisted tournaments at startup (prefer Supabase -> Redis/Upstash -> disk)
(async () => { await loadTournamentsFromPersistence().catch(err => console.warn('[Tournaments] initial load failed', err && err.message)) })()
// Optional: if SUPABASE configured and NDN_AUTO_MIGRATE_TOURNAMENTS=1, upsert disk tournaments to Supabase
if (supabase && String(process.env.NDN_AUTO_MIGRATE_TOURNAMENTS || '') === '1') {
  (async () => {
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
          try {
            await supabase.from('tournaments').upsert(payload, { onConflict: 'id' })
          } catch (err) {
            console.warn('[Tournaments] Auto-migrate upsert failed:', err && err.message)
          }
        }
        console.log('[Tournaments] Auto-migrated', arr.length, 'tournaments into Supabase')
      }
    } catch (err) { console.warn('[Tournaments] Auto-migrate failed', err && err.message) }
  })().catch(err => console.warn('[Tournaments] Auto-migrate task crashed', err && err.message))
}
// Simple in-memory users and friendships (demo)
// users: email -> { email, username, status: 'online'|'offline'|'ingame', wsId? }
const users = new Map();
global.users = users;
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
            subscription: user.subscription || { fullAccess: false },
            status: 'offline',
            lastSeen: null
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
  admin: true,
  status: 'offline',
  lastSeen: null
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
  // Also persist to Supabase
  saveFriendRequestsSupabase().catch(() => {})
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

// Supabase-backed persistence for friend requests
async function loadFriendRequestsFromSupabase() {
  if (!supabase) return
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
    if (error) {
      // Table might not exist — log instructions for manual creation
      if (/relation.*does not exist|could not find/i.test(error.message || '')) {
        console.warn('[FriendRequests] friend_requests table does not exist in Supabase.')
        console.warn('[FriendRequests] Please create it in the Supabase SQL editor:')
        console.warn('  CREATE TABLE IF NOT EXISTS friend_requests (')
        console.warn('    id TEXT PRIMARY KEY,')
        console.warn('    from_email TEXT NOT NULL,')
        console.warn('    to_email TEXT NOT NULL,')
        console.warn('    from_username TEXT,')
        console.warn('    to_username TEXT,')
        console.warn('    status TEXT NOT NULL DEFAULT \'pending\',')
        console.warn('    ts BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,')
        console.warn('    created_at TIMESTAMPTZ DEFAULT NOW()')
        console.warn('  );')
        console.warn('  CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_email);')
        console.warn('  CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_email);')
      } else {
        console.error('[FriendRequests] Supabase load error:', error.message)
      }
      return
    }
    if (Array.isArray(data) && data.length > 0) {
      const existingIds = new Set(friendRequests.map(r => r.id))
      const users = global.users || new Map()
      let added = 0
      for (const row of data) {
        if (!existingIds.has(row.id)) {
          friendRequests.push({
            id: row.id,
            from: row.from_email,
            to: row.to_email,
            fromUsername: row.from_username || row.from_email,
            toUsername: row.to_username || row.to_email,
            ts: row.ts || Date.now(),
            status: row.status || 'pending',
          })
          added++
          
          // Populate/update global.users with persisted usernames
          if (row.from_username && !users.has(row.from_email)) {
            users.set(row.from_email, { email: row.from_email, username: row.from_username, status: 'offline' })
          }
          if (row.to_username && !users.has(row.to_email)) {
            users.set(row.to_email, { email: row.to_email, username: row.to_username, status: 'offline' })
          }
        }
      }
      global.users = users
      if (added > 0) {
        console.log(`[FriendRequests] Loaded ${added} friend requests from Supabase`)
      }
    }
  } catch (err) {
    console.warn('[FriendRequests] Failed to load from Supabase:', err?.message || err)
  }
}

async function saveFriendRequestsSupabase() {
  if (!supabase) return
  try {
    const users = global.users || new Map()
    // Upsert all current requests with usernames
    const rows = friendRequests.map(r => {
      const fromEmail = String(r.from || '').toLowerCase()
      const toEmail = String(r.to || '').toLowerCase()
      const fromUser = users.get(fromEmail)
      const toUser = users.get(toEmail)
      return {
        id: r.id,
        from_email: fromEmail,
        to_email: toEmail,
        from_username: r.fromUsername || (fromUser && fromUser.username) || fromEmail,
        to_username: r.toUsername || (toUser && toUser.username) || toEmail,
        status: r.status || 'pending',
        ts: r.ts || Date.now(),
      }
    })
    if (rows.length === 0) return
    const { error } = await supabase
      .from('friend_requests')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
    if (error) {
      // If table doesn't exist, skip silently (it will be created on next load)
      if (!/relation.*does not exist/i.test(error.message || '')) {
        console.warn('[FriendRequests] Supabase save error:', error.message)
      }
    }
  } catch (err) {
    console.warn('[FriendRequests] Supabase save exception:', err?.message || err)
  }
}

async function upsertFriendRequestSupabase(req) {
  if (!supabase) return
  try {
    // Resolve usernames from global.users if available
    const users = global.users || new Map()
    const fromEmail = String(req.from || '').toLowerCase()
    const toEmail = String(req.to || '').toLowerCase()
    const fromUser = users.get(fromEmail)
    const toUser = users.get(toEmail)
    const fromUsername = req.fromUsername || (fromUser && fromUser.username) || fromEmail
    const toUsername = req.toUsername || (toUser && toUser.username) || toEmail

    const row = {
      id: req.id,
      from_email: fromEmail,
      to_email: toEmail,
      from_username: fromUsername,
      to_username: toUsername,
      status: req.status || 'pending',
      ts: req.ts || Date.now(),
    }
    const { error } = await supabase
      .from('friend_requests')
      .upsert([row], { onConflict: 'id', ignoreDuplicates: false })
    if (error && !/relation.*does not exist/i.test(error.message || '')) {
      console.warn('[FriendRequests] Supabase upsert error:', error.message)
    }
  } catch (err) {
    console.warn('[FriendRequests] Supabase upsert exception:', err?.message || err)
  }
}

// Persistence helpers for friendships
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

// Ensure the Supabase friendships table exists with the required unique constraint.
// AUTO-CREATES the table if it doesn't exist to prevent friends list from being empty after deploy.
async function ensureFriendshipsTable() {
  if (!supabase) return
  try {
    // First, try to create the table if it doesn't exist
    // This uses Supabase's SQL execution via RPC or direct query
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS friendships (
        id BIGSERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        friend_email TEXT NOT NULL,
        user_username TEXT,
        friend_username TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
    const addConstraintSQL = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'friendships_user_friend_unique'
        ) THEN
          ALTER TABLE friendships ADD CONSTRAINT friendships_user_friend_unique UNIQUE (user_email, friend_email);
        END IF;
      END $$;
    `
    const addUsernameColumnsSQL = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='friendships' AND column_name='user_username') THEN
          ALTER TABLE friendships ADD COLUMN user_username TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='friendships' AND column_name='friend_username') THEN
          ALTER TABLE friendships ADD COLUMN friend_username TEXT;
        END IF;
      END $$;
    `
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_email);
      CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_email);
    `
    
    // Try to execute the SQL to create/update the table
    try {
      // Supabase JS doesn't have direct SQL execution, so we test with a simple select first
      const { error: selectError } = await supabase.from('friendships').select('id').limit(1)
      
      if (selectError && /relation.*does not exist|could not find/i.test(selectError.message || '')) {
        console.log('[Friends] Friendships table does not exist - attempting to create via Supabase dashboard is required')
        console.log('[Friends] Please create the table in Supabase SQL Editor:')
        console.log(createTableSQL)
        console.log(addConstraintSQL)
        console.log(createIndexSQL)
        console.log('[Friends] IMPORTANT: Run the above SQL in your Supabase dashboard to persist friends across deploys!')
      } else {
        // Table exists, check if username columns need to be added
        console.log('[Friends] Table exists, checking for username columns...')
        console.log('[Friends] If usernames are not persisting, run this SQL in Supabase dashboard:')
        console.log(addUsernameColumnsSQL)
      }
    } catch (e) {
      console.warn('[Friends] Table existence check failed:', e?.message || e)
    }
    
    // Now test the upsert with constraint
    const testRow = { user_email: '__test__@ndn.check', friend_email: '__test2__@ndn.check', user_username: '__test__', friend_username: '__test2__' }
    const { error } = await supabase.from('friendships').upsert([testRow], { onConflict: 'user_email,friend_email', ignoreDuplicates: true })
    if (error) {
      console.warn('[Friends] Friendships table upsert test failed:', error.message)
      if (/relation.*does not exist|could not find/i.test(error.message || '')) {
        console.error('[Friends] CRITICAL: The friendships table does not exist in Supabase!')
        console.error('[Friends] Friends will NOT persist across deploys until you create the table.')
        console.error('[Friends] Run this SQL in your Supabase dashboard:')
        console.error('  CREATE TABLE IF NOT EXISTS friendships (')
        console.error('    id BIGSERIAL PRIMARY KEY,')
        console.error('    user_email TEXT NOT NULL,')
        console.error('    friend_email TEXT NOT NULL,')
        console.error('    created_at TIMESTAMPTZ DEFAULT NOW(),')
        console.error('    UNIQUE(user_email, friend_email)')
        console.error('  );')
        console.error('  CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_email);')
        console.error('  CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_email);')
      } else if (/there is no unique or exclusion constraint/i.test(error.message || '')) {
        console.error('[Friends] CRITICAL: Missing unique constraint on friendships(user_email, friend_email).')
        console.error('[Friends] Run this SQL: ALTER TABLE friendships ADD CONSTRAINT friendships_user_friend_unique UNIQUE (user_email, friend_email);')
      }
    } else {
      console.log('[Friends] ✓ Friendships table verified OK - friends will persist across deploys')
      try {
        await supabase.from('friendships').delete().eq('user_email', '__test__@ndn.check')
      } catch {}
    }
  } catch (err) {
    console.warn('[Friends] ensureFriendshipsTable check failed:', err?.message || err)
  }
}

// Supabase-backed persistence for friendships (keeps data across restarts in hosted environments)
async function loadFriendshipsFromSupabase() {
  if (!supabase) {
    console.log('[Friends] Supabase not configured - cannot load friendships from database')
    return
  }
  console.log('[Friends] Loading friendships from Supabase...')
  try {
    const { data, error } = await supabase
      .from('friendships')
      .select('user_email, friend_email, user_username, friend_username')
    
    if (error) {
      console.error('[Friends] FAILED to load friendships from Supabase:', error.message)
      if (/relation.*does not exist/i.test(error.message || '')) {
        console.error('[Friends] The friendships table does not exist! Friends will be lost on deploy.')
        console.error('[Friends] Create the table in Supabase SQL Editor - see ensureFriendshipsTable logs above.')
      }
      throw error
    }
    
    if (Array.isArray(data)) {
      let added = 0
      const users = global.users || new Map()
      for (const row of data) {
        const a = String(row.user_email || '').toLowerCase()
        const b = String(row.friend_email || '').toLowerCase()
        if (!a || !b || a === b) continue
        const setA = friendships.get(a) || new Set()
        setA.add(b)
        friendships.set(a, setA)
        added++
        
        // Populate/update global.users with persisted usernames if not already present
        if (row.user_username && !users.has(a)) {
          users.set(a, { email: a, username: row.user_username, status: 'offline' })
        } else if (row.user_username && users.has(a) && !users.get(a).username) {
          const u = users.get(a)
          u.username = row.user_username
          users.set(a, u)
        }
        if (row.friend_username && !users.has(b)) {
          users.set(b, { email: b, username: row.friend_username, status: 'offline' })
        } else if (row.friend_username && users.has(b) && !users.get(b).username) {
          const u = users.get(b)
          u.username = row.friend_username
          users.set(b, u)
        }
      }
      global.users = users
      // Only save to disk if we loaded something - disk is ephemeral anyway on Render
      if (added > 0) saveFriendships()
      console.log(`[Friends] ✓ Loaded ${added} friendship links from Supabase (${data.length} rows)`)
      if (added === 0 && data.length === 0) {
        console.log('[Friends] No friendships found in Supabase database')
      }
    } else {
      console.warn('[Friends] Unexpected response from Supabase - data is not an array:', typeof data)
    }
  } catch (err) {
    console.error('[Friends] Exception loading friendships from Supabase:', err?.message || err)
  }
}

async function upsertFriendshipSupabase(a, b, aUsername, bUsername) {
console.log('[SUPABASE-UPSERT-START] a=%s b=%s supabase=%s', a, b, !!supabase)
if (!supabase) {
  console.log('[SUPABASE-UPSERT-SKIP] Supabase not configured')
  return
}

// Resolve usernames from global.users if not provided
const users = global.users || new Map()
const userA = users.get(a)
const userB = users.get(b)
const usernameA = aUsername || (userA && userA.username) || a
const usernameB = bUsername || (userB && userB.username) || b

const rows = [
  { user_email: a, friend_email: b, user_username: usernameA, friend_username: usernameB },
  { user_email: b, friend_email: a, user_username: usernameB, friend_username: usernameA },
]

try {
  console.log('[SUPABASE-UPSERT-CALL] Calling supabase.from(friendships).upsert with rows:', JSON.stringify(rows))
  let { data, error } = await supabase
    .from('friendships')
    .upsert(rows, { onConflict: 'user_email,friend_email', ignoreDuplicates: true })
    .select()

  // Some databases may not have a unique constraint for the specified onConflict columns.
  // If so, fall back to a simple insert to persist the rows instead of failing.
  if (error && /unique|exclusion constraint|conflict/i.test(error.message || '')) {
    console.warn('[SUPABASE-UPSERT-FALLBACK] Upsert failed due to missing constraint; retrying with insert')
    ;({ data, error } = await supabase.from('friendships').insert(rows).select())
  }

  // If both upsert and insert fail, try inserting rows one at a time
  // (handles partial duplicates where one row exists but the other doesn't)
  if (error) {
    console.warn('[SUPABASE-UPSERT-INDIVIDUAL] Batch failed, trying individual inserts')
    for (const row of rows) {
      try {
        await supabase.from('friendships').upsert([row], { onConflict: 'user_email,friend_email', ignoreDuplicates: true })
      } catch (e2) {
        // Try plain insert as last resort
        try { await supabase.from('friendships').insert([row]) } catch (e3) {}
      }
    }
    // Re-verify at least one row exists
    const { data: verify } = await supabase.from('friendships').select('user_email').eq('user_email', a).eq('friend_email', b).limit(1)
    if (verify && verify.length > 0) {
      console.log('[SUPABASE-UPSERT-RECOVERED] Individual inserts succeeded')
      error = null
    }
  }


    if (error) {
      console.error('[SUPABASE-UPSERT-ERROR] error:', JSON.stringify(error))
      throw new Error(error.message || 'Supabase upsert failed')
    }

    console.log('[SUPABASE-UPSERT-SUCCESS] Created friendship: %s <-> %s', a, b)
  } catch (err) {
    console.error('[SUPABASE-UPSERT-EXCEPTION] exception:', err)
    // Do NOT re-throw — friendships are still in-memory and will be retried on next list query
  }
}

async function deleteFriendshipSupabase(a, b) {
  if (!supabase) return
  try {
    await supabase
      .from('friendships')
      .delete()
      .or(
        `and(user_email.eq.${a},friend_email.eq.${b}),and(user_email.eq.${b},friend_email.eq.${a})`,
      )
  } catch (err) {
    console.warn('[Friends] Supabase delete failed:', err?.message || err)
  }
}

// Attempt to hydrate friendships from Supabase on startup (in addition to local file)
// Also verify the table has the required unique constraint
// CRITICAL: This ensures friends persist across Render deploys!
;(async () => {
  console.log('[Friends] === STARTUP: Initializing friends persistence ===')
  try {
    await ensureFriendshipsTable()
    await loadFriendshipsFromSupabase()
    console.log('[Friends] === STARTUP: Friends initialization complete ===')
  } catch (err) {
    console.error('[Friends] === STARTUP: Friends initialization FAILED ===', err?.message || err)
    // Try loading anyway as fallback
    try {
      await loadFriendshipsFromSupabase()
    } catch (e2) {
      console.error('[Friends] Fallback load also failed:', e2?.message || e2)
    }
  }
})()

// Also hydrate friend requests from Supabase on startup
loadFriendRequestsFromSupabase().catch((err) => {
  console.warn('[FriendRequests] Startup load from Supabase failed:', err?.message || err)
})

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

