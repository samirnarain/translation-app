const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));



// Create HTTP server
const server = http.createServer(app);

// Create Socket.io instance with CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const crypto = require('crypto');

// Redis & adapter (Phase A)
let redisClient = null;
let pubClient = null;
let subClient = null;
async function setupRedis() {
  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    pubClient = createClient({ url: REDIS_URL });
    subClient = pubClient.duplicate();
    redisClient = createClient({ url: REDIS_URL });
    await Promise.all([pubClient.connect(), subClient.connect(), redisClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Redis connected and Socket.io adapter configured');
  } catch (err) {
    console.warn('⚠️ Redis not available, running in single-instance mode:', err.message);
  }
}

// Store connected clients
const clients = new Map();

// Sessions with Redis backing where available (Phase A)
const sessions = new Map(); // fallback cache (non-authoritative)
function randomToken(len = 32) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

async function storeResumeToken(code, token, ttlMs) {
  try {
    if (redisClient) {
      const key = `sess:${code}:resume:${token}`;
      await redisClient.set(key, '1', { PX: ttlMs });
    }
  } catch {}
}

async function validateResumeToken(code, token) {
  try {
    if (redisClient) {
      const key = `sess:${code}:resume:${token}`;
      const v = await redisClient.get(key);
      if (v) {
        await redisClient.del(key);
        return true;
      }
      return false;
    }
  } catch {}
  // fallback: allow if no redis
  return true;
}
const socketToSession = new Map(); // ephemeral mapping

const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes (hard TTL)
const IDLE_TTL_MS = 30 * 60 * 1000;    // 30 minutes when no control/co-host
const STALE_GRACE_MS = 5 * 60 * 1000;  // 5 minutes to allow control resume
const EXPIRING_NOTICE_MS = 5 * 60 * 1000; // emit expiring event 5m before expiry

function generateSessionCode() {
  // 9-digit numeric, zero-padded
  let code;
  do {
    const n = Math.floor(Math.random() * 1_000_000_000); // 0..999,999,999
    code = String(n).padStart(9, '0');
  } while (sessions.has(code));
  return code;
}

function updateSessionExpiry(code, ttlMs) {
  const s = sessions.get(code);
  if (!s) return;
  // clear existing timers
  if (s.expireTimer) clearTimeout(s.expireTimer);
  if (s.expiringTimer) clearTimeout(s.expiringTimer);
  const now = Date.now();
  s.createdAt = s.createdAt || now;
  s.ttlMs = ttlMs;
  s.stale = false;
  // schedule expiring notice
  if (ttlMs > EXPIRING_NOTICE_MS) {
    s.expiringTimer = setTimeout(() => {
      io.to(`sess:${code}`).emit('session-expiring', { code, inMs: EXPIRING_NOTICE_MS });
    }, ttlMs - EXPIRING_NOTICE_MS);
  }
  // schedule expiry
  s.expireTimer = setTimeout(() => expireSession(code), ttlMs);
  try {
    if (redisClient) {
      const key = `sess:${code}`;
      redisClient.expire(key, Math.ceil(ttlMs / 1000));
      redisClient.hSet(key, { status: 'active' });
    }
  } catch {}
}

function createSession(controlSocketId) {
  const code = generateSessionCode();
  const session = {
    code,
    controlSocketId,
    createdAt: Date.now(),
    ttlMs: SESSION_TTL_MS,
    stale: false,
    expireTimer: null,
    expiringTimer: null
  };
  sessions.set(code, session);
  updateSessionExpiry(code, SESSION_TTL_MS);
  // persist to Redis
  try {
    if (redisClient) {
      const key = `sess:${code}`;
      redisClient.hSet(key, {
        code,
        controlSocketId,
        createdAt: String(session.createdAt),
        ttlMs: String(session.ttlMs),
        status: 'active'
      });
      redisClient.expire(key, Math.ceil(SESSION_TTL_MS / 1000));
      // add presence
      redisClient.sAdd(`sess:${code}:presence`, controlSocketId);
    }
  } catch {}
  // create a resume token for control
  const token = randomToken(24);
  storeResumeToken(code, token, STALE_GRACE_MS);
  session.controlResumeToken = token;
  return session;
}

function expireSession(code) {
  const s = sessions.get(code);
  if (!s) return;
  sessions.delete(code);
  // notify room if needed
  io.to(`sess:${code}`).emit('session-closed', { code });
  try { if (redisClient) redisClient.del(`sess:${code}`); } catch {}
}

function markSessionStale(code) {
  const s = sessions.get(code);
  if (!s || s.stale) return;
  s.stale = true;
  io.to(`sess:${code}`).emit('session-stale', { code });
  // keep existing TTL; optionally set an earlier grace expiry
  try {
    if (redisClient) {
      redisClient.hSet(`sess:${code}`, { status: 'stale' });
    }
  } catch {}
}

// Translation cache
const translationCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// LibreTranslate configuration
const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://127.0.0.1:5000';
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || '';

// Translation statistics
let translationStats = {
  totalRequests: 0,
  successfulTranslations: 0,
  failedTranslations: 0,
  cacheHits: 0,
  averageResponseTime: 0
};

// Translation endpoint
app.post('/translate', async (req, res) => {
  try {
    const { text, source = 'en', target, format = 'text', alternatives = 3 } = req.body;
    
    if (!text || !target) {
      return res.status(400).json({ error: 'Missing required parameters: text and target' });
    }

    // Create cache key
    const cacheKey = `${text}-${source}-${target}-${format}-${alternatives}`;
    
    // Check cache first
    if (translationCache.has(cacheKey)) {
      const cached = translationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        translationStats.cacheHits++;
        console.log(`Cache hit for: "${text}" -> ${target}`);
        return res.json(cached.data);
      } else {
        translationCache.delete(cacheKey);
      }
    }

    // Prepare request body
    const requestBody = {
      q: text,
      source: source,
      target: target,
      format: format,
      alternatives: alternatives
    };

    // Add API key if provided
    if (LIBRETRANSLATE_API_KEY) {
      requestBody.api_key = LIBRETRANSLATE_API_KEY;
    }

    console.log(`Translating: "${text}" from ${source} to ${target}`);
    console.log('Request body:', requestBody);
    const startTime = Date.now();

    // Call LibreTranslate API
    const response = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(requestBody).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LibreTranslate error response:', errorText);
      throw new Error(`LibreTranslate API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    // Update statistics
    translationStats.totalRequests++;
    translationStats.successfulTranslations++;
    translationStats.averageResponseTime = 
      (translationStats.averageResponseTime * (translationStats.successfulTranslations - 1) + responseTime) / 
      translationStats.successfulTranslations;

    // Cache the result
    translationCache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });

    console.log(`Translation successful: "${text}" -> "${data.translatedText}" (${responseTime}ms)`);
    res.json(data);

  } catch (error) {
    console.error('Translation error:', error);
    translationStats.totalRequests++;
    translationStats.failedTranslations++;
    
    res.status(500).json({ 
      error: 'Translation failed', 
      message: error.message,
      fallback: req.body.text 
    });
  }
});

// Translation statistics endpoint
app.get('/translation-stats', (req, res) => {
  res.json({
    ...translationStats,
    cacheSize: translationCache.size,
    successRate: translationStats.totalRequests > 0 ? 
      (translationStats.successfulTranslations / translationStats.totalRequests * 100).toFixed(2) + '%' : '0%'
  });
});

// Clear cache endpoint
app.post('/clear-cache', (req, res) => {
  const beforeSize = translationCache.size;
  translationCache.clear();
  res.json({ 
    message: 'Cache cleared', 
    clearedEntries: beforeSize 
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Store client info
  clients.set(socket.id, { 
    type: 'unknown',
    connectedAt: Date.now()
  });
  
  // Stage 1: Session lifecycle
  socket.on('session-create', (_, ack) => {
    try {
      const session = createSession(socket.id);
      const room = `sess:${session.code}`;
      socket.join(room);
      socketToSession.set(socket.id, { code: session.code, role: 'control' });
      clients.set(socket.id, { type: 'control', connectedAt: Date.now() });
      const payload = { code: session.code, ttlMs: session.ttlMs, expiresAt: session.createdAt + session.ttlMs, resumeToken: session.controlResumeToken };
      if (typeof ack === 'function') ack({ ok: true, ...payload });
      socket.emit('session-created', payload);
    } catch (e) {
      if (typeof ack === 'function') ack({ ok: false, error: 'create_failed' });
    }
  });

  socket.on('session-resume', async (data = {}, ack) => {
    const { code, token } = data;
    const session = code ? sessions.get(code) : null;
    if (!session) return ack && ack({ ok: false, error: 'not_found' });
    if (Date.now() > session.createdAt + session.ttlMs) return ack && ack({ ok: false, error: 'expired' });
    // allow resume only if no active control
    if (session.controlSocketId && session.controlSocketId !== socket.id) {
      return ack && ack({ ok: false, error: 'already_has_control' });
    }
    // if redis present, require valid resume token
    if (redisClient) {
      const valid = await validateResumeToken(code, token);
      if (!valid) return ack && ack({ ok: false, error: 'invalid_token' });
    }
    session.controlSocketId = socket.id;
    session.stale = false;
    socket.join(`sess:${code}`);
    socketToSession.set(socket.id, { code, role: 'control' });
    clients.set(socket.id, { type: 'control', connectedAt: Date.now() });
    updateSessionExpiry(code, SESSION_TTL_MS);
    try { if (redisClient) redisClient.sAdd(`sess:${code}:presence`, socket.id); } catch {}
    // issue a new resume token on successful resume
    const newToken = randomToken(24);
    storeResumeToken(code, newToken, STALE_GRACE_MS);
    ack && ack({ ok: true, code, ttlMs: session.ttlMs, expiresAt: session.createdAt + session.ttlMs, resumeToken: newToken });
    io.to(`sess:${code}`).emit('session-resumed', { code });
  });

  socket.on('session-join', (data = {}, ack) => {
    const { code } = data;
    const session = code ? sessions.get(code) : null;
    if (!session) return ack && ack({ ok: false, error: 'not_found' });
    if (Date.now() > session.createdAt + session.ttlMs) return ack && ack({ ok: false, error: 'expired' });
    // If already in a display session, leave previous room first
    const existing = socketToSession.get(socket.id);
    if (existing && existing.role === 'display' && existing.code && existing.code !== code) {
      try { socket.leave(`sess:${existing.code}`); } catch {}
    }
    socket.join(`sess:${code}`);
    socketToSession.set(socket.id, { code, role: 'display' });
    clients.set(socket.id, { type: 'display', connectedAt: Date.now() });
    try { if (redisClient) redisClient.sAdd(`sess:${code}:displays`, socket.id); } catch {}
    ack && ack({ ok: true, code });
    if (session.controlSocketId) io.to(session.controlSocketId).emit('display-joined', { socketId: socket.id });
  });

  // Create a brand new session for this control (leave old room and expire old session)
  socket.on('session-new', (_, ack) => {
    const map = socketToSession.get(socket.id);
    if (map && map.role === 'control') {
      const oldRoom = `sess:${map.code}`;
      try { socket.leave(oldRoom); } catch {}
      const old = sessions.get(map.code);
      if (old) expireSession(map.code);
    }
    try {
      const session = createSession(socket.id);
      const room = `sess:${session.code}`;
      socket.join(room);
      socketToSession.set(socket.id, { code: session.code, role: 'control' });
      clients.set(socket.id, { type: 'control', connectedAt: Date.now() });
      const payload = { code: session.code, ttlMs: session.ttlMs, expiresAt: session.createdAt + session.ttlMs };
      if (typeof ack === 'function') ack({ ok: true, ...payload });
      socket.emit('session-created', payload);
    } catch (e) {
      if (typeof ack === 'function') ack({ ok: false, error: 'create_failed' });
    }
  });

  // Handle streaming text from control page (now scoped to session room)
  socket.on('streaming-text', (data) => {
    const map = socketToSession.get(socket.id);
    if (!map) return;
    const { code, role } = map;
    if (role !== 'control') return; // Stage 2: enforce role
    // Broadcast within the session room
    socket.to(`sess:${code}`).emit('streaming-text', {
      ...data,
      code,
      receivedAt: Date.now()
    });
    
    // Send acknowledgment back to sender
    socket.emit('text-received', {
      message: 'Streaming text received',
      timestamp: Date.now()
    });
  });
  
  // Handle final translation from control page
  socket.on('final-translation', (data) => {
    const map = socketToSession.get(socket.id);
    if (!map) return;
    const { code, role } = map;
    if (role !== 'control') return; // Stage 2: enforce role
    console.log('Final translation received:', data.translated);
    // Broadcast to displays in the same session
    socket.to(`sess:${code}`).emit('final-translation', {
      ...data,
      code,
      receivedAt: Date.now()
    });
    
    // Send acknowledgment back to sender
    socket.emit('translation-received', {
      message: 'Final translation received',
      timestamp: Date.now()
    });
  });
  
  // Handle client type identification
  socket.on('client-type', (type) => {
    console.log(`Client ${socket.id} identified as: ${type}`);
    clients.set(socket.id, { 
      type,
      connectedAt: Date.now()
    });
    
    // Send current client count
    const clientCount = clients.size;
    io.emit('client-count', { count: clientCount });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const map = socketToSession.get(socket.id);
    if (map) {
      const { code, role } = map;
      socketToSession.delete(socket.id);
      if (role === 'control') {
        const s = sessions.get(code);
        if (s) {
          s.controlSocketId = null;
          markSessionStale(code);
          // switch to idle TTL for displays-only window
          updateSessionExpiry(code, IDLE_TTL_MS);
        }
        // Redis presence update
        try { if (redisClient) redisClient.sRem(`sess:${code}:presence`, socket.id); } catch {}
      }
      if (role === 'display') {
        try { if (redisClient) redisClient.sRem(`sess:${code}:displays`, socket.id); } catch {}
      }
    }
    clients.delete(socket.id);
    
    // Update client count
    const clientCount = clients.size;
    io.emit('client-count', { count: clientCount });
  });
  
  // Send welcome message
  socket.emit('welcome', {
    message: 'Connected to translation server',
    clientId: socket.id,
    timestamp: Date.now()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    uptime: process.uptime(),
    translationStats: translationStats
  });
});

// Debug session endpoint (limited info; expand behind auth in production)
app.get('/session/:code', async (req, res) => {
  const code = (req.params.code || '').replace(/\D/g, '');
  const local = sessions.get(code);
  let redisData = null;
  try {
    if (redisClient) {
      const key = `sess:${code}`;
      const h = await redisClient.hGetAll(key);
      const presence = await redisClient.sCard(`sess:${code}:presence`);
      const displays = await redisClient.sCard(`sess:${code}:displays`);
      redisData = { ...h, presence, displays };
    }
  } catch {}
  res.json({
    code,
    local: local ? { code: local.code, stale: local.stale, ttlMs: local.ttlMs, createdAt: local.createdAt } : null,
    redis: redisData
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = "localhost"; // Simplified for ngrok
server.listen(PORT, HOST, () => {
  console.log(`🚀 Socket.io translation server running on ${HOST}:${PORT}`);
  console.log(`📱 Control page: http://localhost:${PORT}/control.html`);
  console.log(`📺 Display page: http://localhost:${PORT}/display.html`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Translation stats: http://localhost:${PORT}/translation-stats`);
  console.log(`🔧 LibreTranslate URL: ${LIBRETRANSLATE_URL}`);
  console.log(`🔑 API Key configured: ${LIBRETRANSLATE_API_KEY ? 'Yes' : 'No'}`);
  setupRedis();
});