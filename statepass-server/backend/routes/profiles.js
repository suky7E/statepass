// routes/profiles.js
const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { requireAuth }            = require('../middleware/auth');
const { rateLimit, auditLog }    = require('../middleware/security');

const router = express.Router();

// All profile routes require authentication
router.use(requireAuth);

function validateProfile(p, index) {
  const errors = [];
  const label  = `profiles[${index}]`;

  if (p.profileName !== undefined) {
    if (typeof p.profileName !== 'string' || p.profileName.length > 100) {
      errors.push(`${label}.profileName must be a string (max 100 chars)`);
    }
  }
  if (!p.site || typeof p.site !== 'string' || p.site.length > 255) {
    errors.push(`${label}.site is required (max 255 chars)`);
  }
  if (!p.login || typeof p.login !== 'string' || p.login.length > 255) {
    errors.push(`${label}.login is required (max 255 chars)`);
  }
  if (p.length !== undefined) {
    const l = parseInt(p.length);
    if (isNaN(l) || l < 4 || l > 64) errors.push(`${label}.length must be 4–64`);
  }
  if (p.counter !== undefined) {
    const c = parseInt(p.counter);
    if (isNaN(c) || c < 1) errors.push(`${label}.counter must be ≥ 1`);
  }
  if (p.iterations !== undefined) {
    const i = parseInt(p.iterations);
    if (isNaN(i) || i < 100000) errors.push(`${label}.iterations must be ≥ 100,000`);
  }

  return errors;
}

// ─── GET /profiles — fetch all profiles ──────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         id,
         profile_name  AS "profileName",
         site, login,
         default_length  AS "length",
         default_counter AS "counter",
         lowercase, uppercase, digits, symbols,
         iterations,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM user_profiles
       WHERE user_id = $1
       ORDER BY site, login`,
      [req.user.id]
    );
    res.json({ profiles: result.rows, count: result.rowCount });
  } catch (err) {
    console.error('[Profiles] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// ─── POST /profiles/sync — full sync (upload all) ────────────────────────────

router.post('/sync',
  rateLimit({ maxRequests: 30, windowMs: 60_000, keyPrefix: 'sync' }),
  async (req, res) => {
    const { profiles } = req.body;

    if (!Array.isArray(profiles)) {
      return res.status(400).json({ error: 'profiles must be an array' });
    }
    if (profiles.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 profiles per sync' });
    }

    // Validate all profiles before any writes
    const allErrors = profiles.flatMap((p, i) => validateProfile(p, i));
    if (allErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: allErrors });
    }

    try {
      await withTransaction(async (client) => {
        // Delete existing profiles for this user
        await client.query('DELETE FROM user_profiles WHERE user_id = $1', [req.user.id]);

        // Bulk insert
        for (const p of profiles) {
          const profileName = p.profileName || `${p.site}_${p.login}`.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
          await client.query(
            `INSERT INTO user_profiles
               (user_id, profile_name, site, login,
                default_length, default_counter,
                lowercase, uppercase, digits, symbols,
                iterations)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (user_id, profile_name) DO UPDATE SET
               site            = EXCLUDED.site,
               login           = EXCLUDED.login,
               default_length  = EXCLUDED.default_length,
               default_counter = EXCLUDED.default_counter,
               lowercase       = EXCLUDED.lowercase,
               uppercase       = EXCLUDED.uppercase,
               digits          = EXCLUDED.digits,
               symbols         = EXCLUDED.symbols,
               iterations      = EXCLUDED.iterations,
               updated_at      = NOW()`,
            [
              req.user.id,
              profileName,
              p.site,
              p.login,
              p.length   || 16,
              p.counter  || 1,
              p.lowercase !== false,
              p.uppercase !== false,
              p.digits    !== false,
              p.symbols   !== false,
              p.iterations || 600000
            ]
          );
        }
      });

      await auditLog(req.user.id, 'profiles.sync', req, { count: profiles.length });
      res.json({ message: 'Sync successful', count: profiles.length });
    } catch (err) {
      console.error('[Profiles] Sync error:', err.message);
      res.status(500).json({ error: 'Sync failed' });
    }
  }
);

// ─── PUT /profiles/:id — update single profile ───────────────────────────────

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const p       = req.body;
  const errors  = validateProfile(p, 0);
  if (errors.length > 0) return res.status(400).json({ error: 'Validation failed', details: errors });

  try {
    const result = await query(
      `UPDATE user_profiles SET
         site = $1, login = $2,
         default_length = $3, default_counter = $4,
         lowercase = $5, uppercase = $6, digits = $7, symbols = $8,
         iterations = $9, updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING id`,
      [
        p.site, p.login,
        p.length || 16, p.counter || 1,
        p.lowercase !== false, p.uppercase !== false,
        p.digits !== false, p.symbols !== false,
        p.iterations || 600000,
        id, req.user.id
      ]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Profile not found' });
    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error('[Profiles] Update error:', err.message);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─── DELETE /profiles/:id ─────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM user_profiles WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Profile not found' });
    res.json({ message: 'Profile deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── DELETE /profiles — delete all ──────────────────────────────────────────

router.delete('/', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ message: 'All profiles deleted', count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
