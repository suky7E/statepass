// server.js - StatePass Sync Server
'use strict';

const path = require('path');
const dotenvPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
];
for (const dotenvPath of dotenvPaths) {
  require('dotenv').config({ path: dotenvPath });
}

const express = require('express');
const cors    = require('cors');
const { securityHeaders, requireJSON } = require('./middleware/security');
const { initDb } = require('./db/init');

const app  = express();
const PORT = Number(process.env.PORT || process.env.RAILWAY_PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

// ─── Trust proxy (for correct req.ip behind Nginx/Docker) ────────────────────
app.set('trust proxy', 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(securityHeaders);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Helper function to match patterns with wildcards (*)
function matchOrigin(origin, allowedOrigins) {
  return allowedOrigins.some(pattern => {
    if (pattern === '*') return true;
    // Escape regex characters, but convert '*' to '.*'
    const escapedPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escapedPattern}$`, 'i');
    return regex.test(origin);
  });
}

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin (no Origin header) or extension origins
    if (!origin) return cb(null, true);
    if (matchOrigin(origin, ALLOWED_ORIGINS)) return cb(null, true);
    if (origin.startsWith('chrome-extension://')) return cb(null, true);
    if (origin.startsWith('moz-extension://'))    return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '512kb' }));
app.use(requireJSON);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/profiles', require('./routes/profiles'));
app.use('/api/devices',  require('./routes/devices'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const { pool } = require('./db/pool');
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const { initDb } = require('./db/init');

  const INIT_TIMEOUT_MS = 15_000;

  function initDbWithTimeout() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[DB] initDb() did not complete within ${INIT_TIMEOUT_MS / 1000}s`));
      }, INIT_TIMEOUT_MS);

      initDb()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  console.log('[Server] Initialising database schema…');

  initDbWithTimeout()
    .then(() => {
      console.log('[Server] Database ready — starting HTTP listener…');
      app.listen(PORT, HOST, () => {
        console.log(`\n StatePass Sync Server`);
        console.log(`   API: http://${HOST}:${PORT}/api`);
        console.log(`   Env: ${process.env.NODE_ENV || 'development'}\n`);
      });
    })
    .catch(err => {
      console.error('[Server] Fatal: database initialisation failed —', err.message);
      process.exit(1);
    });
}

module.exports = app;
