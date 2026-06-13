// routes/auth.js
const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { query, withTransaction } = require('../db/pool');
const { issueTokens, requireAuth } = require('../middleware/auth');
const { rateLimit, auditLog }      = require('../middleware/security');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const EMAIL_RE      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE   = /^[a-zA-Z0-9_-]{3,30}$/;

// ─── Register ────────────────────────────────────────────────────────────────

router.post('/register',
  rateLimit({ maxRequests: 5, windowMs: 15 * 60_000, keyPrefix: 'reg' }),
  async (req, res) => {
    const { email, username, password } = req.body;

    // Validate inputs
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'email, username, and password are required' });
    }
    if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email, username, and password must be strings' });
    }
    if (email.length > 255) {
      return res.status(400).json({ error: 'Email must be at most 255 characters' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–30 chars, letters/numbers/_/-' });
    }
    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 12 and 128 characters' });
    }

    try {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const result = await query(
        `INSERT INTO users (email, username, password_hash)
         VALUES ($1, $2, $3) RETURNING id, email, username`,
        [email.toLowerCase().trim(), username.trim(), passwordHash]
      );

      const user = result.rows[0];
      await auditLog(user.id, 'user.register', req);

      res.status(201).json({ message: 'Account created', userId: user.id });
    } catch (err) {
      if (err.code === '23505') {
        // Determine which field is duplicate without leaking which
        const detail = err.detail || '';
        if (detail.includes('email')) return res.status(409).json({ error: 'Email already registered' });
        if (detail.includes('username')) return res.status(409).json({ error: 'Username already taken' });
        return res.status(409).json({ error: 'Account already exists' });
      }
      console.error('[Auth] Register error:', err.message);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// ─── Login ───────────────────────────────────────────────────────────────────

router.post('/login',
  rateLimit({ maxRequests: 10, windowMs: 15 * 60_000, keyPrefix: 'login' }),
  async (req, res) => {
    const { email, password, deviceId, deviceName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password must be strings' });
    }
    if (email.length > 255 || password.length > 128) {
      return res.status(400).json({ error: 'Invalid input length' });
    }
    if (deviceId !== undefined && typeof deviceId !== 'string') {
      return res.status(400).json({ error: 'deviceId must be a string' });
    }
    if (deviceName !== undefined && typeof deviceName !== 'string') {
      return res.status(400).json({ error: 'deviceName must be a string' });
    }

    try {
      // Accept email or username as identifier
      const field  = email.includes('@') ? 'email' : 'username';
      const result = await query(
        `SELECT id, email, username, password_hash, is_admin
         FROM users WHERE ${field} = $1 AND is_active = true`,
        [email.toLowerCase().trim()]
      );

      // Always run bcrypt to prevent timing attacks (even on no-user case)
      const DUMMY_HASH = '$2b$12$invalidhashfortimingnormalization000000000000000000000';
      const hash = result.rows[0]?.password_hash || DUMMY_HASH;
      const valid = await bcrypt.compare(password, hash);

      if (result.rows.length === 0 || !valid) {
        await auditLog(null, 'auth.failed', req, { identifier: email });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Update last login
      await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

      // Issue JWT pair
      const { accessToken, refreshToken } = issueTokens(user.id, user.email, user.username);

      // Store hashed refresh token
      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiry      = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, device_id, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [user.id, refreshHash, deviceId || null, expiry]
      );

      await auditLog(user.id, 'auth.login', req, { deviceName });

      res.json({
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 min in seconds
        user: {
          id:       user.id,
          email:    user.email,
          username: user.username,
          isAdmin:  user.is_admin
        }
      });
    } catch (err) {
      console.error('[Auth] Login error:', err.message);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// ─── Refresh token ────────────────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  if (payload.type !== 'refresh') {
    return res.status(401).json({ error: 'Not a refresh token' });
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  try {
    const result = await query(
      `SELECT rt.id, u.id as user_id, u.email, u.username
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked = false
         AND rt.expires_at > NOW()
         AND u.is_active = true`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Token revoked or expired' });
    }

    const row = result.rows[0];

    // Rotate: revoke old, issue new
    await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [row.id]);

    const { accessToken, refreshToken: newRefresh } = issueTokens(row.user_id, row.email, row.username);
    const newHash  = crypto.createHash('sha256').update(newRefresh).digest('hex');
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO UPDATE SET revoked = false`,
      [row.user_id, newHash, newExpiry]
    );

    res.json({ accessToken, refreshToken: newRefresh, expiresIn: 900 });
  } catch (err) {
    console.error('[Auth] Refresh error:', err.message);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query(
      'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1 AND user_id = $2',
      [tokenHash, req.user.id]
    );
  }

  await auditLog(req.user.id, 'auth.logout', req);
  res.json({ message: 'Logged out' });
});

// ─── Current user ────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT id, email, username, created_at, last_login, is_admin
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0]);
});

module.exports = router;
