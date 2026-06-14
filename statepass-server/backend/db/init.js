// db/init.js - Run schema.sql on server startup
'use strict';

const fs   = require('fs');
const path = require('path');
const { pool } = require('./pool');

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
}

module.exports = { initDb };
