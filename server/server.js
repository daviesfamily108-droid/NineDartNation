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
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn('[DB] Supabase not configured - using in-memory storage only');
}

// Initialize Redis for cross-server session management
const redis = require('redis');

// DEBUG: Check if REDIS_URL is set
console.log('?? DEBUG: REDIS_URL exists:', !!process.env.REDIS_URL);
if (process.env.REDIS_URL) {
  console.log('?? DEBUG: REDIS_URL starts with:', process.env.REDIS_URL.substring(0, 20) + '...');
  console.log('?? DEBUG: REDIS_URL length:', process.env.REDIS_URL.length);
}

// Handle Redis URL - ensure it has proper protocol
let redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  // Convert https:// to rediss:// for TLS connections (Upstash, etc.)
  if (redisUrl.startsWith('https://')) {
    redisUrl = redisUrl.replace('https://', 'rediss://');
    console.log('[REDIS] Converted https:// to rediss:// for TLS');
  } else if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    redisUrl = 'redis://' + redisUrl;
    console.log('[REDIS] Added redis:// protocol to URL');
  }
  console.log('[REDIS] Final Redis URL starts with:', redisUrl.substring(0, 20) + '...');
}

const redisClient = redisUrl ? redis.createClient({ url: redisUrl }) : null;

if (redisClient) {
  redisClient.on('error', (err) => {
    console.error('[REDIS] Connection error:', err.message);
    if (err.message.includes('Invalid protocol')) {
      console.error('[REDIS] Check that REDIS_URL starts with redis:// or rediss://');
    }
  });
  redisClient.on('connect', () => console.log('[REDIS] Connected successfully'));
  redisClient.connect().catch(err => {
    console.warn('[REDIS] Failed to connect:', err.message);
    console.warn('[REDIS] Falling back to in-memory storage for sessions');
  });
} else {
  console.warn('[REDIS] Not configured - using in-memory storage for sessions');
}

// Redis-backed Map class for shared state synchronization
class RedisMap {
  constructor(redisClient, keyPrefix, ttlSeconds = 3600) {
    this.redis = redisClient;
    this.prefix = keyPrefix;
    this.ttl = ttlSeconds;
    this.localCache = new Map();
  }

  _key(k) { return `${this.prefix}:${k}`; }

  async set(key, value) {
    this.localCache.set(key, value);
    if (this.redis) {
      try {
        await this.redis.setEx(this._key(key), this.ttl, JSON.stringify(value));
      } catch (err) {
        console.warn(`[REDIS] Failed to set ${this.prefix}:${key}:`, err.message);
      }
    }
    return this;
  }

  async get(key) {
    // Check local cache first
    if (this.localCache.has(key)) {
      return this.localCache.get(key);
    }
    // Try Redis
    if (this.redis) {
      try {
        const data = await this.redis.get(this._key(key));
        if (data) {
          const value = JSON.parse(data);
          this.localCache.set(key, value);
          return value;
        }
      } catch (err) {
        console.warn(`[REDIS] Failed to get ${this.prefix}:${key}:`, err.message);
      }
    }
    return undefined;
  }

  async has(key) {
    if (this.localCache.has(key)) return true;
    if (this.redis) {
      try {
        const exists = await this.redis.exists(this._key(key));
        return exists === 1;
      } catch (err) {
        console.warn(`[REDIS] Failed to check ${this.prefix}:${key}:`, err.message);
      }
    }
    return false;
  }

  async delete(key) {
    this.localCache.delete(key);
    if (this.redis) {
      try {
        await this.redis.del(this._key(key));
      } catch (err) {
        console.warn(`[REDIS] Failed to delete ${this.prefix}:${key}:`, err.message);
      }
    }
    return true;
  }

  async clear() {
    this.localCache.clear();
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${this.prefix}:*`);
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } catch (err) {
        console.warn(`[REDIS] Failed to clear ${this.prefix}:`, err.message);
      }
    }
  }

  // Get all keys (for iteration)
  keys() {
    return this.localCache.keys();
  }

  // Get all values (for iteration)
  values() {
    return this.localCache.values();
  }

  // Get size
  get size() {
    return this.localCache.size;
  }

  // Iterator for entries
  entries() {
    return this.localCache.entries();
  }
}

// Synchronization helpers for cross-worker communication
const syncHelpers = {
  // Sync match creation across workers
  async syncMatchCreated(matchData) {
    if (!redisClient) return;
    try {
      await redisClient.publish('sync', JSON.stringify({
        type: 'match-created',
        data: matchData
      }));
      console.log(`[SYNC] Published match creation: ${matchData.id}`);
    } catch (err) {
      console.warn('[SYNC] Failed to sync match creation:', err.message);
    }
  },

  // Sync tournament updates across workers
  async syncTournamentUpdated(tournamentData) {
    if (!redisClient) return;
    try {
      await redisClient.publish('sync', JSON.stringify({
        type: 'tournament-updated',
        data: tournamentData
      }));
      console.log(`[SYNC] Published tournament update: ${tournamentData.id}`);
    } catch (err) {
      console.warn('[SYNC] Failed to sync tournament update:', err.message);
    }
  }
};

// Handle synchronization messages from Redis pub/sub
function handleSyncMessage(syncData) {
  try {
    if (syncData.type === 'match-created') {
      // Update local matches cache
      if (syncData.data) {
        matches.set(syncData.data.id, syncData.data);
        console.log(`[SYNC] Match ${syncData.data.id} synchronized from Redis`);
      }
    } else if (syncData.type === 'tournament-updated') {
      // Update local tournaments cache
      if (syncData.data) {
        tournaments.set(syncData.data.id, syncData.data);
        console.log(`[SYNC] Tournament ${syncData.data.id} synchronized from Redis`);
      }
    } else if (syncData.type === 'match-updated') {
      // Update local match data
      if (syncData.data) {
        matches.set(syncData.data.id, syncData.data);
        console.log(`[SYNC] Match ${syncData.data.id} updated from Redis`);
      }
    }
  } catch (err) {
    console.error('[SYNC] Error handling sync message:', err);
  }
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
    await supabase.from('tournaments').insert([tournament]);
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
    await supabase.from('tournament_participants').insert([{
      tournament_id: tournamentId,
      email,
      username
    }]);
  },

  async removeTournamentParticipant(tournamentId, email) {
    if (!supabase) return;
    await supabase
      .from('tournament_participants')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('email', email);
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

  // Wallets
  async getWallet(email) {
    if (!supabase) return { balances: {} };
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('email', email)
      .single();
    return data || { balances: {} };
  },

  async updateWallet(email, balances) {
    if (!supabase) return;
    await supabase.from('wallets').upsert([{
      email,
      balances,
      updated_at: new Date().toISOString()
    }]);
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
  console.log(`[SPA] Serving static frontend from ${staticBase}`)
} else {
  console.warn('[SPA] No built frontend found at ../dist or ../app/dist; "/" will 404 (API+WS OK).')
}

// Simple in-memory users and friendships (demo)
// users: email -> { email, username, status: 'online'|'offline'|'ingame', wsId? }
const users = new Map();
// Login cache: username -> { user, cachedAt }
const loginCache = new Map();

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

    // Check login cache (5 minute TTL)
    if (!user) {
      const cached = loginCache.get(username);
      if (cached && (Date.now() - cached.cachedAt) < 5 * 60 * 1000 && cached.user.password === password) {
        user = cached.user;
      }
    }

    // If not found in memory or cache, check Supabase
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
        // Cache for future logins
        loginCache.set(username, { user, cachedAt: Date.now() });
        // Store in Redis for cross-server session sharing (non-blocking)
        redisHelpers.setUserSession(data.email, {
          ...user,
          status: 'online',
          lastSeen: Date.now()
        }).catch(err => console.warn('[REDIS] Failed to set session:', err.message));
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
      const daysLeft = Math.ceil((exp - now) / (24 * 60 * 60 * 1000))
      const renewalWarning = daysLeft <= 3 ? `Your premium expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. After expiration, continuous payment will be made unless you cancel in settings.` : null
      return res.json({ fullAccess: true, source: 'tournament', expiresAt: exp, renewalWarning })
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
  // Basic readiness: route reachable means HTTP is serving. WS readiness depends on whether wss was initialized.
  try {
    const mem = process.memoryUsage()
    const wsReady = !!(typeof wss !== 'undefined' && wss && wss.clients)
    // If this handler runs, HTTP is up — set ok:true. WS and counts reflect runtime state.
    res.json({ ok: true, ws: wsReady, rooms: (typeof rooms !== 'undefined' ? rooms.size : 0), clients: (typeof clients !== 'undefined' ? clients.size : 0), mem: { rss: mem.rss, heapUsed: mem.heapUsed } })
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

app.post('/api/admins/grant', async (req, res) => {
  const { email, requesterEmail } = req.body || {}
  if ((requesterEmail || '').toLowerCase() !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  adminEmails.add(target)
  // Update DB
  if (supabase) {
    try {
      await supabase.from('users').update({ admin: true }).eq('email', target)
    } catch (error) {
      console.error('[DB] Failed to grant admin in DB:', error)
    }
  }
  res.json({ ok: true, admins: Array.from(adminEmails) })
})

app.post('/api/admins/revoke', async (req, res) => {
  const { email, requesterEmail } = req.body || {}
  if ((requesterEmail || '').toLowerCase() !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const target = String(email || '').toLowerCase()
  if (!target) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' })
  if (target === OWNER_EMAIL) return res.status(400).json({ ok: false, error: 'CANNOT_REVOKE_OWNER' })
  adminEmails.delete(target)
  // Update DB
  if (supabase) {
    try {
      await supabase.from('users').update({ admin: false }).eq('email', target)
    } catch (error) {
      console.error('[DB] Failed to revoke admin in DB:', error)
    }
  }
  res.json({ ok: true, admins: Array.from(adminEmails) })
})

// Admin ops (owner-only; demo ��� not secure)
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

// Admin: System maintenance and monitoring endpoints
app.get('/api/admin/logs', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  
  // For now, return basic system info. In production, you'd read from log files
  const logs = [
    { timestamp: new Date().toISOString(), level: 'info', message: 'System health check completed' },
    { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'info', message: 'Database connection verified' },
    { timestamp: new Date(Date.now() - 120000).toISOString(), level: 'warn', message: 'High memory usage detected' }
  ]
  
  res.json({ ok: true, logs })
})

app.get('/api/admin/system-health', (req, res) => {
  const requesterEmail = String(req.query.requesterEmail || '').toLowerCase()
  if (requesterEmail !== OWNER_EMAIL) return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  
  const memUsage = process.memoryUsage()
  const health = {
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024) // MB
    },
    cpu: process.cpuUsage(),
    nodeVersion: process.version,
    platform: process.platform,
    connections: clients.size,
    rooms: rooms.size,
    matches: matches.size,
    timestamp: new Date().toISOString()
  }
  
  res.json({ ok: true, health })
})

app.post('/api/admin/quick-fix', (req, res) => {
  const { action, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  
  try {
    switch (action) {
      case 'clear-cache':
        // Clear any in-memory caches
        // In a real app, you'd clear Redis cache, file cache, etc.
        console.log('[ADMIN] Clearing application cache')
        // Clear matches cache if needed
        // matches.clear() // Uncomment if you want to clear all matches
        break
        
      case 'gc':
        // Force garbage collection (if --expose-gc flag is used)
        if (global.gc) {
          global.gc()
          console.log('[ADMIN] Forced garbage collection')
        } else {
          return res.status(400).json({ ok: false, error: 'GC_NOT_AVAILABLE' })
        }
        break
        
      case 'cleanup-db':
        // Clean up old/invalid data
        console.log('[ADMIN] Running database cleanup')
        // In a real app, you'd run cleanup queries
        break
        
      case 'restart-services':
        // Restart background services
        console.log('[ADMIN] Restarting background services')
        // In a real app, you'd restart workers, reconnect to services, etc.
        break
        
      default:
        return res.status(400).json({ ok: false, error: 'UNKNOWN_ACTION' })
    }
    
    res.json({ ok: true, action, message: `${action} completed successfully` })
  } catch (error) {
    console.error('[ADMIN] Quick fix error:', error)
    res.status(500).json({ ok: false, error: error.message })
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

// Handle synchronization messages from master process
function handleSyncMessage(syncData) {
  try {
    if (syncData.type === 'match-created') {
      // Update local matches cache
      if (syncData.match) {
        matches.set(syncData.match.id, syncData.match);
        console.log(`[SYNC] Match ${syncData.match.id} synchronized across workers`);
      }
    } else if (syncData.type === 'tournament-updated') {
      // Update local tournaments cache
      if (syncData.tournament) {
        tournaments.set(syncData.tournament.id, syncData.tournament);
        console.log(`[SYNC] Tournament ${syncData.tournament.id} synchronized across workers`);
      }
    } else if (syncData.type === 'cam-session-created') {
      // Update local camSessions cache
      if (syncData.session) {
        camSessions.set(syncData.session.code, syncData.session);
        console.log(`[SYNC] Camera session ${syncData.session.code} synchronized across workers`);
      }
    } else if (syncData.type === 'friendship-added') {
      // Update local friendships cache
      if (syncData.userEmail && syncData.friendEmail) {
        const userFriends = friendships.get(syncData.userEmail) || new Set();
        const friendFriends = friendships.get(syncData.friendEmail) || new Set();
        userFriends.add(syncData.friendEmail);
        friendFriends.add(syncData.userEmail);
        friendships.set(syncData.userEmail, userFriends);
        friendships.set(syncData.friendEmail, friendFriends);
        console.log(`[SYNC] Friendship added between ${syncData.userEmail} and ${syncData.friendEmail}`);
      }
    } else if (syncData.type === 'friendship-removed') {
      // Update local friendships cache
      if (syncData.userEmail && syncData.friendEmail) {
        const userFriends = friendships.get(syncData.userEmail);
        const friendFriends = friendships.get(syncData.friendEmail);
        if (userFriends) userFriends.delete(syncData.friendEmail);
        if (friendFriends) friendFriends.delete(syncData.userEmail);
        console.log(`[SYNC] Friendship removed between ${syncData.userEmail} and ${syncData.friendEmail}`);
      }
    } else if (syncData.type === 'friend-request-updated') {
      // Reload friend requests from file
      loadFriendRequests();
      console.log(`[SYNC] Friend requests updated`);
    }
  } catch (err) {
    console.error('[SYNC] Error handling sync message:', err);
  }
}

// Node.js clustering for horizontal scaling
const cluster = require('cluster');
const numCPUs = Math.min(os.cpus().length, 7); // Limit to 7 workers max

if (cluster.isMaster || cluster.isPrimary) {
  console.log(`[CLUSTER] Master process ${process.pid} starting ${numCPUs} workers...`);

  // Set up Redis pub/sub for cross-worker communication
  if (redisClient) {
    const subscriber = redisClient.duplicate();
    const publisher = redisClient.duplicate();

    subscriber.subscribe('broadcast', (message) => {
      try {
        const data = JSON.parse(message);
        // Broadcast to all workers
        for (const id in cluster.workers) {
          cluster.workers[id].send(data);
        }
      } catch (err) {
        console.error('[REDIS] Error parsing broadcast message:', err);
      }
    });

    subscriber.subscribe('sync', (message) => {
      try {
        const syncData = JSON.parse(message);
        // Forward sync messages to all workers
        for (const id in cluster.workers) {
          cluster.workers[id].send({ type: 'sync', data: syncData });
        }
      } catch (err) {
        console.error('[REDIS] Error parsing sync message:', err);
      }
    });

    subscriber.on('error', (err) => console.error('[REDIS] Subscriber error:', err));
    publisher.on('error', (err) => console.error('[REDIS] Publisher error:', err));

    console.log('[CLUSTER] Redis pub/sub enabled for cross-worker communication and synchronization');
  } else {
    console.warn('[CLUSTER] Redis not configured - workers will not communicate');
  }

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`[CLUSTER] Worker ${worker.process.pid} died with code ${code}, restarting...`);
    cluster.fork();
  });

} else {
  // Worker process - start the server
  console.log(`[CLUSTER] Worker ${process.pid} starting...`);

  // Handle messages from master process (Redis broadcasts and sync)
  process.on('message', (data) => {
    if (data && data.type) {
      if (data.type === 'sync') {
        // Handle synchronization messages
        handleSyncMessage(data.data);
      } else {
        // Handle broadcast messages
        broadcastAll(data);
      }
    }
  });

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
console.log(`[WS] WebSocket server enabled`);
// wsConnections.set(0)

// Simple in-memory diagnostics store for mobile camera reports
const camDiagnostics = [] // { ts, code, ua, msg, details }
function addCamDiagnostic(d) {
  d.ts = Date.now()
  camDiagnostics.push(d)
  // keep last 200
  while (camDiagnostics.length > 200) camDiagnostics.shift()
}
// Admin endpoint to retrieve recent camera diagnostics
app.get('/admin/cam-diagnostics', (req, res) => {
  // Optionally protect via env var secret
  const secret = process.env.NDN_ADMIN_SECRET
  if (secret) {
    const auth = req.headers['x-admin-secret'] || req.query.secret
    if (!auth || String(auth) !== String(secret)) return res.status(401).send('Unauthorized')
  }
  res.json({ ok: true, count: camDiagnostics.length, diagnostics: camDiagnostics.slice(-100).reverse() })
})

// Simple in-memory signal queue for REST fallback (per cam code)
const camSignalQueues = new Map() // code -> [{ ts, type, payload, source }]

function pushSignal(code, msg) {
  try {
    const arr = camSignalQueues.get(code) || []
    arr.push(Object.assign({ ts: Date.now() }, msg))
    // keep last 200
    while (arr.length > 200) arr.shift()
    camSignalQueues.set(code, arr)
  } catch (e) { console.warn('pushSignal error', e) }
}

// POST a signal message: { type, payload, source }
app.post('/cam/signal/:code', express.json(), (req, res) => {
  const code = String(req.params.code || '').toUpperCase()
  const body = req.body || {}
  if (!code) return res.status(400).json({ ok: false, error: 'MISSING_CODE' })
  const msg = { type: body.type, payload: body.payload, source: body.source || 'unknown' }
  pushSignal(code, msg)
  // try to forward to connected WS peer if present
  const sess = camSessions.get(code)
  if (sess) {
    // decide target: if source is desktop, forward to phone and vice-versa
    const targetId = (msg.source === 'desktop') ? sess.phoneId : sess.desktopId
    const target = clients.get(targetId)
    if (target && target.readyState === 1) {
      try { target.send(JSON.stringify({ type: msg.type, code, payload: msg.payload })) } catch (e) { console.warn('forward fail', e) }
    }
  }
  res.json({ ok: true })
})

// GET and clear queued signals for a code
app.get('/cam/signal/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase()
  if (!code) return res.status(400).json({ ok: false, error: 'MISSING_CODE' })
  const arr = camSignalQueues.get(code) || []
  // return and clear
  camSignalQueues.delete(code)
  res.json({ ok: true, messages: arr })
})

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

// Load persistent data from database on startup
async function loadPersistentData() {
  if (!supabase) return;

  try {
    // Load tournaments
    const tournamentsData = await db.getTournaments();
    for (const t of tournamentsData) {
      tournaments.set(t.id, t);
    }
    console.log(`[DB] Loaded ${tournaments.size} tournaments`);

    // Load matches
    // Note: matches are loaded on-demand, not preloaded to avoid memory usage with 1.5k concurrent users

    // Load wallets
    // Note: wallets are loaded on-demand, not preloaded

    // Load wallets
    // Note: wallets are loaded on-demand, not preloaded

    // Load admins
    const { data: adminUsers } = await supabase
      .from('users')
      .select('email')
      .eq('admin', true);
    if (adminUsers) {
      for (const u of adminUsers) {
        adminEmails.add(u.email.toLowerCase());
      }
      console.log(`[DB] Loaded ${adminEmails.size} admins`);
    }

    // Clean up expired camera sessions
    await db.deleteExpiredCameraSessions();

  } catch (error) {
    console.error('[DB] Failed to load persistent data:', error);
  }
}

// Simple in-memory rooms (WebSocket connections - not persisted)
const rooms = new Map(); // roomId -> Set(ws)
// Simple in-memory match lobby (loaded from DB, synced via Redis)
const matches = new RedisMap(redisClient, 'matches'); // matchId -> match data (local cache, synced via pub/sub)
const clients = new Map(); // wsId -> ws (not persisted)
// WebRTC camera pairing sessions (stored in DB)
const camSessions = new RedisMap(redisClient, 'camSessions', 120); // code -> session data, 2min TTL
const CAM_TTL_MS = 2 * 60 * 1000 // 2 minutes
function genCamCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = ''
  for (let i=0;i<4;i++) code += letters[Math.floor(Math.random()*letters.length)]
  if (camSessions.has(code)) return genCamCode()
  return code
}
// Simple in-memory tournaments (loaded from DB)
const tournaments = new RedisMap(redisClient, 'tournaments');
// Simple in-memory users and friendships (demo)
// users: email -> { email, username, status: 'online'|'offline'|'ingame', wsId? }

// Load persistent data on startup
loadPersistentData();

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
        broadcastAll({ type: 'tournament-reminder', tournamentId: t.id, title: t.title, startAt: t.startAt, message: `Only ${t.checkinMinutes} minutes to go until the ${t.title} is live ��� check in ready or lose your spot at 19:45!` })
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
  // Removed ensureOfficialWeekly - only allow manually created tournaments
}, 30 * 1000)

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
// friend requests: Array of { id, fromEmail, fromUsername, toEmail, toUsername, requestedAt }
const friendRequests = [];
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

// Friend requests persistence
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

function broadcastAll(data) {
  if (!wss) return
  const payload = (typeof data === 'string') ? data : JSON.stringify(data)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

// Broadcast friendship updates to all workers via Redis
function broadcastFriendshipUpdate(type, data) {
  if (redisClient) {
    redisClient.publish('sync', JSON.stringify({ type, ...data }))
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
          mode: data.mode === 'firstto' ? 'firstto' : 'bestof',
          value: Number(data.value) || 1,
          startingScore: Number(data.startingScore) || 501,
          creatorAvg: Number(data.creatorAvg) || 0,
          game,
          requireCalibration: !!data.requireCalibration,
          createdAt: Date.now(),
        }
        await db.createMatch(m)
        // Sync match creation across workers
        await syncHelpers.syncMatchCreated(m)
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
      } else if (data.type === 'cam-offer' || data.type === 'cam-answer' || data.type === 'cam-ice') {
        const code = String(data.code || '').toUpperCase()
        const sess = camSessions.get(code)
        if (!sess) return
        let targetId
        if (data.type === 'cam-offer') {
          targetId = sess.phoneId
        } else if (data.type === 'cam-answer') {
          targetId = sess.desktopId
        } else if (data.type === 'cam-ice') {
          targetId = (ws._id === sess.desktopId) ? sess.phoneId : sess.desktopId
        }
        const target = clients.get(targetId)
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ type: data.type, code, payload: data.payload }))
        }
        } else if (data.type === 'cam-diagnostic') {
          // Receive diagnostic messages from mobile clients
          try {
            const diag = {
              code: String(data.code || ''),
              ua: String(ws._ua || ''),
              msg: String(data.msg || ''),
              details: data.details || null
            }
            addCamDiagnostic(diag)
            console.log('[DIAG] cam-diagnostic:', diag.code, diag.msg)
          } catch (e) { console.error('cam-diagnostic parse error', e) }
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
    const allMatches = await db.getMatches()
    for (const m of allMatches) {
      if (m.creatorId === ws._id) await db.deleteMatch(m.id)
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
  console.log('\n[Shutdown] closing servers...')
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
  
  // Check if already friends
  const myFriends = friendships.get(me) || new Set()
  if (myFriends.has(other)) return res.status(400).json({ ok: false, error: 'ALREADY_FRIENDS' })
  
  // Check if request already exists
  const existingRequest = friendRequests.find(r => 
    (r.fromEmail === me && r.toEmail === other) || (r.fromEmail === other && r.toEmail === me)
  )
  if (existingRequest) return res.status(400).json({ ok: false, error: 'REQUEST_EXISTS' })
  
  // Get usernames
  const myUser = users.get(me)
  const otherUser = users.get(other)
  
  // Create friend request
  const request = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    fromEmail: me,
    fromUsername: myUser?.username || me,
    toEmail: other,
    toUsername: otherUser?.username || other,
    requestedAt: Date.now()
  }
  
  friendRequests.push(request)
  saveFriendRequests()
  
  // Broadcast friend request update to all workers
  broadcastFriendshipUpdate('friend-request-updated', {})
  
  res.json({ ok: true })
})

app.post('/api/friends/remove', (req, res) => {
  const { email, friend } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(friend || '').toLowerCase()
  const mySet = friendships.get(me)
  const otherSet = friendships.get(other)
  if (mySet) mySet.delete(other)
  if (otherSet) otherSet.delete(me)
  saveFriendships()
  
  // Broadcast friendship removal to all workers
  broadcastFriendshipUpdate('friendship-removed', { userEmail: me, friendEmail: other })
  
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
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, from, message: msg, ts: Date.now(), read: false }
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

// Mark messages as read
app.post('/api/friends/messages/read', (req, res) => {
  const { email, messageIds } = req.body || {}
  const userEmail = String(email || '').toLowerCase()
  if (!userEmail || !Array.isArray(messageIds)) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  
  const arr = messages.get(userEmail) || []
  let updated = false
  for (const msg of arr) {
    if (messageIds.includes(msg.id)) {
      msg.read = true
      updated = true
    }
  }
  
  if (updated) {
    messages.set(userEmail, arr)
  }
  
  res.json({ ok: true })
})

// Get incoming friend requests
app.get('/api/friends/requests', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const requests = friendRequests.filter(r => r.toEmail === email)
  res.json({ ok: true, requests })
})

// Get outgoing friend requests
app.get('/api/friends/outgoing', (req, res) => {
  const email = String(req.query.email || '').toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  const requests = friendRequests.filter(r => r.fromEmail === email)
  res.json({ ok: true, requests })
})

// Accept friend request
app.post('/api/friends/accept', (req, res) => {
  const { email, requester } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(requester || '').toLowerCase()
  if (!me || !other) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  
  // Find and remove the request
  const reqIndex = friendRequests.findIndex(r => r.fromEmail === other && r.toEmail === me)
  if (reqIndex === -1) return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })
  
  friendRequests.splice(reqIndex, 1)
  
  // Add mutual friendship
  const myFriends = friendships.get(me) || new Set()
  const otherFriends = friendships.get(other) || new Set()
  myFriends.add(other)
  otherFriends.add(me)
  friendships.set(me, myFriends)
  friendships.set(other, otherFriends)
  
  saveFriendships()
  saveFriendRequests()
  
  // Broadcast friendship update to all workers
  broadcastFriendshipUpdate('friendship-added', { userEmail: me, friendEmail: other })
  
  res.json({ ok: true })
})

// Decline friend request
app.post('/api/friends/decline', (req, res) => {
  const { email, requester } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(requester || '').toLowerCase()
  if (!me || !other) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  
  // Find and remove the request
  const reqIndex = friendRequests.findIndex(r => r.fromEmail === other && r.toEmail === me)
  if (reqIndex === -1) return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })
  
  friendRequests.splice(reqIndex, 1)
  saveFriendRequests()
  
  // Broadcast friend request update to all workers
  broadcastFriendshipUpdate('friend-request-updated', {})
  
  res.json({ ok: true })
})

// Cancel outgoing friend request
app.post('/api/friends/cancel', (req, res) => {
  const { email, friend } = req.body || {}
  const me = String(email || '').toLowerCase()
  const other = String(friend || '').toLowerCase()
  if (!me || !other) return res.status(400).json({ ok: false, error: 'BAD_REQUEST' })
  
  // Find and remove the request
  const reqIndex = friendRequests.findIndex(r => r.fromEmail === me && r.toEmail === other)
  if (reqIndex === -1) return res.status(404).json({ ok: false, error: 'REQUEST_NOT_FOUND' })
  
  friendRequests.splice(reqIndex, 1)
  saveFriendRequests()
  
  // Broadcast friend request update to all workers
  broadcastFriendshipUpdate('friend-request-updated', {})
  
  res.json({ ok: true })
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
    const item = { id, email: addr, currency: curr, amountCents: amt, status: 'paid', requestedAt: Date.now(), decidedAt: Date.now(), notes: `Paid to ${method.brand} ������������ ${method.last4}` }
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
app.get('/api/tournaments', async (req, res) => {
  const tournaments = await db.getTournaments()
  res.json({ ok: true, tournaments })
})

app.post('/api/tournaments/create', async (req, res) => {
  const { title, game, mode, value, description, startAt, checkinMinutes, capacity, startingScore, creatorEmail, creatorName, official, prizeType, prizeAmount, currency, prizeNotes, requesterEmail } = req.body || {}
  const id = nanoid(10)
  // Only the owner can create "official" tournaments or set prize metadata
  const isOwner = String(requesterEmail || '').toLowerCase() === OWNER_EMAIL
  const isOfficial = !!official && isOwner
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
    prize: isOfficial ? (pType !== 'none') : false,
    prizeType: pType,
    prizeAmount: amount || undefined,
    currency: curr,
    payoutStatus: pType === 'cash' ? 'none' : 'none',
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
  // Check if user is already joined to any other tournament
  const allTournaments = await db.getTournaments()
  const alreadyInAnother = allTournaments.some(otherT => 
    otherT.id !== t.id && otherT.participants?.some(p => p.email === addr)
  )
  if (alreadyInAnother) {
    return res.status(400).json({ ok: false, error: 'ALREADY_IN_TOURNAMENT', message: 'You can only join one tournament at a time. Please leave your current tournament first.' })
  }
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
  await syncHelpers.syncTournamentUpdated(t)
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
    if (t.prizeType === 'cash') {
      // mark payout required; manual processing for now
      t.payoutStatus = 'pending'
      // credit winner's in-app wallet balance (store in cents)
      if (t.currency && typeof t.prizeAmount === 'number' && t.prizeAmount > 0 && t.winnerEmail) {
        creditWallet(t.winnerEmail, t.currency, Math.round(t.prizeAmount * 100))
      }
    } else {
      // default premium prize - use prizeAmount as months (default 3)
      const months = t.prizeAmount || 3
      const expiryDate = Date.now() + (months * 30 * 24 * 60 * 60 * 1000)
      premiumWinners.set(t.winnerEmail, expiryDate)
      t.payoutStatus = 'none'
      
      // Send congratulatory message to winner
      const winnerExpiry = new Date(expiryDate)
      const expiryStr = winnerExpiry.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      
      // Try to send notification via WS if winner is online
      const winnerUser = users.get(t.winnerEmail)
      if (winnerUser && winnerUser.wsId) {
        const target = clients.get(winnerUser.wsId)
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ 
            type: 'tournament-win', 
            tournamentId: t.id,
            message: `Congratulations! You won the tournament "${t.title}" and have been awarded ${months} month${months > 1 ? 's' : ''} of PREMIUM! Your premium expires on ${expiryStr}.` 
          }))
        }
      }
    }
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
  const allowed = ['title','game','mode','value','description','startAt','checkinMinutes','capacity','status','prizeType','prizeAmount','currency','prizeNotes','startingScore']
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      t[k] = patch[k]
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

// Admin: mark prize paid (for cash prize)
app.post('/api/admin/tournaments/mark-paid', async (req, res) => {
  const { tournamentId, requesterEmail } = req.body || {}
  if ((String(requesterEmail || '').toLowerCase()) !== OWNER_EMAIL) {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' })
  }
  const t = await db.getTournament(String(tournamentId || ''))
  if (!t) return res.status(404).json({ ok: false, error: 'NOT_FOUND' })
  if (t.prizeType !== 'cash') return res.status(400).json({ ok: false, error: 'NOT_CASH_PRIZE' })
  t.payoutStatus = 'paid'
  t.paidAt = Date.now()
  await db.updateTournament(t.id, t)
  await broadcastTournaments()
  res.json({ ok: true, tournament: t })
})

// Removed admin endpoint for reseeding weekly tournaments - only allow manually created tournaments

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

(async () => {
  // Removed ensureOfficialWeekly - only allow manually created tournaments
})();
}
