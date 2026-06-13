import { DEFAULT_PROFILE } from '../core/lesspass.js';

const $ = id => document.getElementById(id);

const DEFAULTS = { ...DEFAULT_PROFILE };

const FIELD_KEYS = Object.keys(DEFAULTS);

function validateImportData(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Expected a JSON object at the top level.');
  }

  if (data.counter !== undefined && (typeof data.counter !== 'number' || data.counter < 1)) {
    throw new Error('counter must be a positive number.');
  }
  if (data.length !== undefined && (typeof data.length !== 'number' || data.length < 4)) {
    throw new Error('length must be a number ≥ 4.');
  }
  if (data.iterations !== undefined && (typeof data.iterations !== 'number' || data.iterations < 10_000)) {
    throw new Error('iterations must be a number ≥ 10,000.');
  }
  if (data.savedEntries !== undefined && !Array.isArray(data.savedEntries)) {
    throw new Error('savedEntries must be an array.');
  }
  if (Array.isArray(data.savedEntries)) {
    data.savedEntries.forEach((e, i) => {
      if (typeof e !== 'object' || !e.site) {
        throw new Error(`savedEntries[${i}] must be an object with a "site" property.`);
      }
    });
  }

  return true;
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  FIELD_KEYS.forEach(key => {
    const el = $(key);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = data[key];
    else el.value = data[key];
  });
  renderSavedEntries(data.savedEntries || []);
  renderFieldMappings();
}

async function saveSettings() {
  const data = {};
  FIELD_KEYS.forEach(key => {
    const el = $(key);
    if (!el) return;
    if (el.type === 'checkbox') {
      data[key] = el.checked;
    } else if (el.type === 'number') {
      data[key] = parseInt(el.value, 10) || DEFAULTS[key];
    } else {
      data[key] = el.value;
    }
  });

  const existing = await chrome.storage.sync.get('savedEntries');
  data.savedEntries = existing.savedEntries || [];
  await chrome.storage.sync.set(data);
  showStatus('Settings saved', 'success');
}

async function exportSettings() {
  const data = await chrome.storage.sync.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: 'statepass-settings.json',
  });
  a.click();
  URL.revokeObjectURL(url);
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    validateImportData(data);
    await chrome.storage.sync.set(data);
    showStatus('Settings imported successfully', 'success');
    loadSettings();
  } catch (err) {
    showStatus(`Import failed: ${err.message}`, 'error');
  }

  e.target.value = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderSavedEntries(entries) {
  const container = $('savedEntries');
  if (!entries || entries.length === 0) {
    container.innerHTML = '<p class="empty-state">No saved entries yet.</p>';
    return;
  }

  container.innerHTML = entries.map((e, i) => `
    <div class="entry-item">
      <div>
        <span class="entry-site">${escapeHtml(e.site || '?')}</span>
        <span class="entry-login"> — ${escapeHtml(e.login || '')}</span>
      </div>
      <button class="entry-delete" data-index="${i}" title="Remove">×</button>
    </div>
  `).join('');

  container.querySelectorAll('.entry-delete').forEach(el => {
    el.addEventListener('click', async () => {
      const idx  = parseInt(el.dataset.index, 10);
      const data = await chrome.storage.sync.get('savedEntries');
      const list = data.savedEntries || [];
      list.splice(idx, 1);
      await chrome.storage.sync.set({ savedEntries: list });
      renderSavedEntries(list);
      showStatus('Entry removed', 'success');
    });
  });
}

function renderFieldMappings() {
  const container = $('fieldMappings');
  chrome.storage.sync.get('fieldMappings', ({ fieldMappings }) => {
    if (!fieldMappings || Object.keys(fieldMappings).length === 0) {
      container.innerHTML = '<p class="empty-state">No manual field mappings configured.</p>';
      return;
    }
    let html = '';
    for (const [site, mapping] of Object.entries(fieldMappings)) {
      html += `<div class="entry-item">
        <div>
          <span class="entry-site">${escapeHtml(site)}</span>
          <span class="entry-login"> — user: ${escapeHtml(mapping.usernameSelector || '?')}, pass: ${escapeHtml(mapping.passwordSelector || '?')}</span>
        </div>
      </div>`;
    }
    container.innerHTML = html;
  });
}

function showStatus(msg, type) {
  const el = $('status');
  if (!el) return;
  el.textContent  = msg;
  el.className    = `status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// Sync functions
let syncClient = null;

async function getSyncClient() {
  if (syncClient) return syncClient;
  try {
    const { syncServerUrl, syncSession } = await chrome.storage.local.get(['syncServerUrl', 'syncSession']);
    if (!syncServerUrl || !syncSession?.refreshToken) return null;

    const { StatePassSync } = await import('../services/sync-service.js');
    const instance = new StatePassSync();
    await instance.setServerUrl(syncServerUrl);
    instance._refresh = syncSession.refreshToken;
    if (syncSession.user) instance._userId = syncSession.user.id;
    syncClient = instance;
    return instance;
  } catch {
    return null;
  }
}

async function handleSyncLogin() {
  const url = $('syncServerUrl').value.trim();
  const email = $('syncEmail').value.trim();
  const password = $('syncPassword').value;

  if (!url || !email || !password) {
    showStatus('Fill in server URL, email, and password', 'error');
    return;
  }

  try {
    const { StatePassSync } = await import('../services/sync-service.js');
    const client = new StatePassSync();
    await client.setServerUrl(url);
    await client.login(email, password, 'StatePass Extension');
    syncClient = client;

    $('syncStatus').textContent = 'Connected!';
    $('syncStatus').className = 'status success';
    $('syncStatus').classList.remove('hidden');
    $('syncActions').style.display = 'flex';
    $('syncStatus').textContent = `Connected: ${email}`;
    showStatus('Sync login successful', 'success');
  } catch (err) {
    showStatus(`Login failed: ${err.message}`, 'error');
  }
}

async function handleSyncLogout() {
  const client = await getSyncClient();
  if (client) {
    try { await client.logout(); } catch {}
  }
  syncClient = null;
  $('syncActions').style.display = 'none';
  $('syncStatus').classList.add('hidden');
  showStatus('Logged out', 'success');
}

async function handleSyncPush() {
  const client = await getSyncClient();
  if (!client) { showStatus('Not connected to sync server', 'error'); return; }
  try {
    await client.pushProfiles();
    showStatus('Profiles pushed to server', 'success');
  } catch (err) {
    showStatus(`Push failed: ${err.message}`, 'error');
  }
}

async function handleSyncPull() {
  const client = await getSyncClient();
  if (!client) { showStatus('Not connected to sync server', 'error'); return; }
  try {
    await client.pullProfiles();
    showStatus('Profiles pulled from server', 'success');
    loadSettings();
  } catch (err) {
    showStatus(`Pull failed: ${err.message}`, 'error');
  }
}

async function handleSyncMerge() {
  const client = await getSyncClient();
  if (!client) { showStatus('Not connected to sync server', 'error'); return; }
  try {
    await client.syncBothWays();
    showStatus('Two-way sync complete', 'success');
    loadSettings();
  } catch (err) {
    showStatus(`Merge failed: ${err.message}`, 'error');
  }
}

function initTheme() {
  chrome.storage.sync.get('theme', ({ theme }) => {
    const t = theme || 'dark';
    document.documentElement.dataset.theme = t;
    $('themeToggle').textContent = t === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  });
}

$('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  $('themeToggle').textContent = next === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  chrome.storage.sync.set({ theme: next });
});

$('saveBtn')       ?.addEventListener('click', saveSettings);
$('exportBtn')     ?.addEventListener('click', exportSettings);
$('importBtn')     ?.addEventListener('click', () => $('importFile')?.click());
$('importFile')    ?.addEventListener('change', handleImportFile);
$('syncLoginBtn')  ?.addEventListener('click', handleSyncLogin);
$('syncLogoutBtn') ?.addEventListener('click', handleSyncLogout);
$('syncTestBtn')   ?.addEventListener('click', handleSyncLogin);
$('syncPushBtn')   ?.addEventListener('click', handleSyncPush);
$('syncPullBtn')   ?.addEventListener('click', handleSyncPull);
$('syncMergeBtn')  ?.addEventListener('click', handleSyncMerge);

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadSettings();
});
