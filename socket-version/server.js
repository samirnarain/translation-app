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

// Store connected clients
const clients = new Map();

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
  
  // Handle streaming text from control page
  socket.on('streaming-text', (data) => {
    console.log('Streaming text received:', data.text);
    
    // Broadcast to all other clients (display pages)
    socket.broadcast.emit('streaming-text', {
      ...data,
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
    console.log('Final translation received:', data.translated);
    
    // Broadcast to all other clients (display pages)
    socket.broadcast.emit('final-translation', {
      ...data,
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

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Socket.io translation server running on port ${PORT}`);
  console.log(`📱 Control page: http://localhost:${PORT}/control.html`);
  console.log(`📺 Display page: http://localhost:${PORT}/display.html`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Translation stats: http://localhost:${PORT}/translation-stats`);
  console.log(`🔧 LibreTranslate URL: ${LIBRETRANSLATE_URL}`);
  console.log(`🔑 API Key configured: ${LIBRETRANSLATE_API_KEY ? 'Yes' : 'No'}`);
}); 