<<<<<<< HEAD
// db/init.js - Run schema.sql on server startup
=======
// db/init.js — Schema initialisation with timeout, logging, and retry logic
>>>>>>> 7cb803f731379c7e472057aafd6eae6b0a50232c
'use strict';

const fs   = require('fs');
const path = require('path');
const { pool } = require('./pool');

<<<<<<< HEAD
/**
 * Execute schema.sql against the connected database.
 * Every statement in the schema uses "IF NOT EXISTS", so this is
 * safe to call on every startup — it will not overwrite existing data.
 */
async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('[DB] Running schema initialisation…');
    await client.query(sql);
    console.log('[DB] Schema ready.');
  } finally {
    client.release();
  }
=======
const SCHEMA_PATH    = path.join(__dirname, 'schema.sql');
const QUERY_TIMEOUT  = 10_000; // 10 s per attempt
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000; // base delay; doubles each attempt (exponential backoff)

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute the schema SQL against a single checked-out client.
 * Rejects with a timeout error if the query takes longer than QUERY_TIMEOUT.
 */
async function runSchema(client) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Release the client so the pool can reclaim it, then surface the error.
      try { client.release(true); } catch (_) { /* already released */ }
      reject(new Error(`[DB] Schema query timed out after ${QUERY_TIMEOUT / 1000}s`));
    }, QUERY_TIMEOUT);

    client.query(sql)
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Initialise the database schema.
 *
 * Tries up to RETRY_ATTEMPTS times with exponential backoff between attempts.
 * Throws if all attempts fail.
 */
async function initDb() {
  console.log('[DB] Starting schema initialisation…');

  let lastError;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    console.log(`[DB] Attempt ${attempt}/${RETRY_ATTEMPTS} — acquiring connection…`);

    let client;
    try {
      // pool.connect() itself respects connectionTimeoutMillis (5 s) set in pool.js
      client = await pool.connect();
      console.log('[DB] Connection acquired — executing schema…');

      await runSchema(client);

      // runSchema releases the client on timeout; only release here on success.
      try { client.release(); } catch (_) { /* already released */ }

      console.log('[DB] Schema ready ✓');
      return; // success — exit
    } catch (err) {
      lastError = err;
      console.error(`[DB] Attempt ${attempt} failed: ${err.message}`);

      // Ensure the client is returned to the pool if it was acquired but
      // runSchema didn't release it (non-timeout error path).
      if (client) {
        try { client.release(true); } catch (_) { /* already released */ }
      }

      if (attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // 2 s, 4 s
        console.log(`[DB] Retrying in ${delay / 1000}s…`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
>>>>>>> 7cb803f731379c7e472057aafd6eae6b0a50232c
}

module.exports = { initDb };
