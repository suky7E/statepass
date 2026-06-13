// routes/devices.js
const express  = require('express');
const { query }             = require('../db/pool');
const { requireAuth }       = require('../middleware/auth');
const { auditLog }          = require('../middleware/security');

const router = express.Router();
router.use(requireAuth);

// GET /devices — list trusted devices
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, device_id, device_name, created_at, expires_at, last_used_at
       FROM sync_tokens
       WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
       ORDER BY last_used_at DESC NULLS LAST`,
      [req.user.id]
    );

    // Mask device IDs
    const devices = result.rows.map(d => ({
      id:          d.id,
      deviceId:    d.device_id ? d.device_id.slice(0, 8) + '…' : null,
      deviceName:  d.device_name || 'Unknown device',
      createdAt:   d.created_at,
      expiresAt:   d.expires_at,
      lastUsedAt:  d.last_used_at,
    }));

    res.json({ devices });
  } catch (err) {
    console.error('[Devices] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// DELETE /devices/:id — revoke a specific device
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      `UPDATE sync_tokens SET revoked = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, device_name`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Device not found' });

    await auditLog(req.user.id, 'device.revoke', req, { deviceName: result.rows[0].device_name });
    res.json({ message: 'Device revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Revoke failed' });
  }
});

// DELETE /devices — revoke all devices (except current)
router.delete('/', async (req, res) => {
  try {
    const result = await query(
      `UPDATE sync_tokens SET revoked = true
       WHERE user_id = $1 AND revoked = false`,
      [req.user.id]
    );
    await auditLog(req.user.id, 'device.revoke_all', req);
    res.json({ message: 'All devices revoked', count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Revoke failed' });
  }
});

// GET /devices/audit — recent account activity
router.get('/audit', async (req, res) => {
  try {
    const result = await query(
      `SELECT event, ip_address, user_agent, meta, created_at
       FROM audit_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ events: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
