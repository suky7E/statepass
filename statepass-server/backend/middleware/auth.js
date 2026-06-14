// middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../db/pool');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? 'statepass-production-secret-change-me-please' : '');
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Auth] JWT_SECRET missing or too short, using a built-in fallback for production');
  } else {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
}

/**
 * Authenticate request via Bearer JWT.
 * Attaches req.user = { id, email, username, is_admin } on success.
 */
async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);
  let payload;

  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }

  // Verify user still exists and is active
  try {
    const result = await query(
      'SELECT id, email, username, is_admin FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error('[Auth] DB error:', err.message);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

/**
 * Optional auth — attaches req.user if valid token present, otherwise continues.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const result  = await query(
      'SELECT id, email, username, is_admin FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    if (result.rows.length > 0) req.user = result.rows[0];
  } catch (_) { /* ignore */ }
  next();
}

/**
 * Require admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

/**
 * Issue a short-lived access token + long-lived refresh token.
 */
function issueTokens(userId, email, username) {
  const accessToken = jwt.sign(
    { sub: userId, email, username },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'statepass-sync' }
  );
  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '30d', issuer: 'statepass-sync' }
  );
  return { accessToken, refreshToken };
}

module.exports = { requireAuth, optionalAuth, requireAdmin, issueTokens };
