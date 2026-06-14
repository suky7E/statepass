// db/init.js — Schema initialisation with timeout, logging, and retry logic
'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const QUERY_TIMEOUT = 10_000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSchema(client) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { client.release(true); } catch (_) {}
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

async function initDb() {
  console.log('[DB] Starting schema initialisation…');

  let lastError;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    console.log(`[DB] Attempt ${attempt}/${RETRY_ATTEMPTS} — acquiring connection…`);

    let client;
    try {
      client = await pool.connect();
      console.log('[DB] Connection acquired — executing schema…');

      await runSchema(client);

      try { client.release(); } catch (_) {}

      console.log('[DB] Schema ready ✓');
      return;
    } catch (err) {
      lastError = err;
      console.error(`[DB] Attempt ${attempt} failed: ${err.message}`);

      if (client) {
        try { client.release(true); } catch (_) {}
      }

      if (attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[DB] Retrying in ${delay / 1000}s…`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

module.exports = { initDb };
