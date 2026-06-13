// db/pool.js
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'statepass_sync',
  user:     process.env.DB_USER     || 'statepass',
  password: process.env.DB_PASSWORD,
  max:      20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Run a query with automatic connection management.
 * Use `withTransaction` for multi-statement operations.
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const dur  = Date.now() - start;
  if (dur > 500) console.warn(`[DB] Slow query (${dur}ms):`, text.slice(0, 80));
  return res;
}

/**
 * Run multiple queries in a single transaction.
 * fn receives a client; throw to trigger rollback.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, withTransaction, pool };
