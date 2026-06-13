const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../db/pool');

let app;
let server;
let baseUrl;

async function cleanupUser(userId) {
  if (!userId) return;
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

test.before(async () => {
  app = require('../server');
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('register, login, and sync profiles end to end', async (t) => {
  const unique = Date.now();
  const email = `test+${unique}@example.com`;
  const username = `testuser${unique}`;
  const password = 'StrongPassword123!';

  let userId = null;

  t.after(async () => {
    if (userId) await cleanupUser(userId);
  });

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password })
  });

  assert.equal(registerRes.status, 201);
  const registerData = await registerRes.json();
  assert.ok(registerData.userId);
  userId = registerData.userId;

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceName: 'test-device' })
  });

  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.ok(loginData.accessToken);
  assert.ok(loginData.refreshToken);
  assert.equal(loginData.user.username, username);

  const syncRes = await fetch(`${baseUrl}/api/profiles/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginData.accessToken}`
    },
    body: JSON.stringify({
      profiles: [{
        profileName: 'work',
        site: 'example.com',
        login: 'demo-user',
        length: 20,
        counter: 2,
        lowercase: true,
        uppercase: true,
        digits: true,
        symbols: false,
        iterations: 600000
      }]
    })
  });

  assert.equal(syncRes.status, 200);

  const fetchRes = await fetch(`${baseUrl}/api/profiles`, {
    headers: { Authorization: `Bearer ${loginData.accessToken}` }
  });

  assert.equal(fetchRes.status, 200);
  const profilesData = await fetchRes.json();
  assert.equal(profilesData.count, 1);
  assert.equal(profilesData.profiles[0].site, 'example.com');
  assert.equal(profilesData.profiles[0].login, 'demo-user');
  assert.equal(profilesData.profiles[0].length, 20);
  assert.equal(profilesData.profiles[0].counter, 2);
});
