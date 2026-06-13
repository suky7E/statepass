// middleware/security.js
const { query } = require('../db/pool');

/**
 * IP-based rate limiter using PostgreSQL sliding windows.
 * maxRequests per windowMs milliseconds.
 */
function rateLimit({ maxRequests = 10, windowMs = 60_000, keyPrefix = 'rl' } = {}) {
  return async (req, res, next) => {
    const ip  = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;

    try {
      const result = await query(
        `INSERT INTO rate_limit (key, count, window_end)
         VALUES ($1, 1, NOW() + $2 * interval '1 millisecond')
         ON CONFLICT (key) DO UPDATE SET
           count      = CASE WHEN rate_limit.window_end < NOW() THEN 1
                             ELSE rate_limit.count + 1 END,
           window_end = CASE WHEN rate_limit.window_end < NOW()
                             THEN NOW() + $2 * interval '1 millisecond'
                             ELSE rate_limit.window_end END
         RETURNING count, window_end`,
        [key, windowMs]
      );

      const { count, window_end } = result.rows[0];
      const resetMs = new Date(window_end) - new Date();

      res.set({
        'X-RateLimit-Limit':     maxRequests,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - count),
        'X-RateLimit-Reset':     Math.ceil(resetMs / 1000),
      });

      if (count > maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(resetMs / 1000)
        });
      }
    } catch (err) {
      // On rate-limit DB failure, let through (fail open) but log
      console.error('[RateLimit] DB error:', err.message);
    }

    next();
  };
}

/**
 * Validate Content-Type for POST/PUT/PATCH requests.
 */
function requireJSON(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
  }
  next();
}

/**
 * Audit logger — writes to DB audit_log table.
 */
async function auditLog(userId, event, req, meta = {}) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, event, ip_address, user_agent, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId || null,
        event,
        req.ip || null,
        req.headers['user-agent'] || null,
        JSON.stringify(meta)
      ]
    );
  } catch (err) {
    console.error('[Audit] Failed to write log:', err.message);
  }
}

/**
 * Global security headers.
 */
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options':    'nosniff',
    'X-Frame-Options':           'DENY',
    'X-XSS-Protection':          '1; mode=block',
    'Referrer-Policy':           'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control':             'no-store',
  });
  next();
}

module.exports = { rateLimit, requireJSON, auditLog, securityHeaders };
