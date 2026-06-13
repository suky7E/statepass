import {
  generatePassword,
  generatePassphrase,
  estimateStrength,
  DEFAULT_PROFILE,
} from '../core/lesspass.js';
import { sync } from '../services/sync-service.js';

const $  = id => document.getElementById(id);

const site             = $('site');
const login            = $('login');
const masterPassword   = $('masterPassword');
const toggleMaster     = $('toggleMaster');
const length           = $('length');
const counter          = $('counter');
const lowercase        = $('lowercase');
const uppercase        = $('uppercase');
const digits           = $('digits');
const symbols          = $('symbols');
const generateBtn      = $('generateBtn');

const resultArea       = $('resultArea');
const generatedPw      = $('generatedPassword');
const strengthBadge    = $('strengthBadge');
const entropyBits      = $('entropyBits');
const copyBtn          = $('copyBtn');
const regenerateBtn    = $('regenerateBtn');
const fillBtn          = $('fillBtn');
const saveBtn          = $('saveBtn');
const syncBtn          = $('syncBtn');
const passphraseBtn    = $('passphraseBtn');
const clipboardTimer   = $('clipboardTimer');
const countdown        = $('countdown');
const themeToggle      = $('themeToggle');
const syncStatus       = $('syncStatus');

let clipboardTimeout = null;
let clipboardInterval = null;

function getProfile() {
  return {
    site:       site.value.trim(),
    login:      login.value.trim(),
    length:     parseInt(length.value, 10) || DEFAULT_PROFILE.length,
    lowercase:  lowercase.checked,
    uppercase:  uppercase.checked,
    digits:     digits.checked,
    symbols:    symbols.checked,
    counter:    parseInt(counter.value, 10) || 1,
    iterations: DEFAULT_PROFILE.iterations,
  };
}

function displayPassword(password) {
  generatedPw.value = password;

  const { score, label, bits } = estimateStrength(password);
  const classMap = { 0: 'very-weak', 1: 'weak', 2: 'fair', 3: 'strong', 4: 'very-strong' };

  strengthBadge.textContent = label;
  strengthBadge.className   = `badge ${classMap[score]}`;
  entropyBits.textContent   = `~${bits} bits`;

  resultArea.classList.remove('hidden');
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function startClipboardCountdown() {
  clearTimeout(clipboardTimeout);
  clearInterval(clipboardInterval);

  let secs = 30;
  countdown.textContent = secs;
  clipboardTimer.classList.remove('hidden');

  clipboardInterval = setInterval(() => {
    secs -= 1;
    countdown.textContent = secs;
    if (secs <= 0) {
      clearInterval(clipboardInterval);
      clipboardTimer.classList.add('hidden');
    }
  }, 1000);

  clipboardTimeout = setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => {});
    clearInterval(clipboardInterval);
    clipboardTimer.classList.add('hidden');
  }, 30_000);
}

async function copyPassword() {
  const pw = generatedPw.value;
  if (!pw) return;

  try {
    await navigator.clipboard.writeText(pw);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = pw;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  showToast('Copied — clears in 30s');
  startClipboardCountdown();
}

async function handleGenerate(e) {
  if (e) e.preventDefault();

  const master = masterPassword.value;
  if (!master) { masterPassword.focus(); showToast('Enter master password'); return; }

  const profile = getProfile();

  generateBtn.textContent = '…';
  generateBtn.disabled    = true;

  try {
    const password = await generatePassword(master, profile);
    displayPassword(password);
  } catch (err) {
    showToast(err.message || 'Generation failed');
  } finally {
    generateBtn.textContent = 'Generate';
    generateBtn.disabled    = false;
  }
}

async function handlePassphrase() {
  const master = masterPassword.value;
  if (!master) { masterPassword.focus(); showToast('Enter master password'); return; }

  const profile = { ...getProfile(), wordCount: 6, separator: '-' };

  try {
    const passphrase = await generatePassphrase(master, profile);
    displayPassword(passphrase);
  } catch (err) {
    showToast(err.message || 'Generation failed');
  }
}

async function autoFill() {
  try {
    const tab = await getActiveTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type:     'STATEPASS_FILL',
      password: generatedPw.value,
    });
    if (response?.success) {
      window.close();
    } else {
      showToast('No password field found on page');
    }
  } catch {
    showToast('Open a page with a password field first');
  }
}

async function handleSave() {
  const profile = getProfile();
  if (!profile.site) { showToast('Enter a site first'); return; }

  const { savedEntries = [] } = await chrome.storage.sync.get('savedEntries');
  const idx = savedEntries.findIndex(e => e.site === profile.site && e.login === profile.login);
  if (idx >= 0) {
    savedEntries[idx] = profile;
    showToast('Profile updated');
  } else {
    savedEntries.push(profile);
    showToast('Profile saved');
  }
  await chrome.storage.sync.set({ savedEntries });
}

toggleMaster.addEventListener('click', () => {
  const isHidden = masterPassword.type === 'password';
  masterPassword.type    = isHidden ? 'text' : 'password';
  toggleMaster.textContent = isHidden ? '\u{1F648}' : '\u{1F441}';
});

async function init() {
  try {
    const tab = await getActiveTab();
    if (tab?.url) {
      const url = new URL(tab.url);
      site.value = url.hostname;
    }
  } catch { /* non-http tabs */ }

  const defaults = await chrome.storage.sync.get(DEFAULT_PROFILE);
  if (!site.value && defaults.site) site.value = defaults.site;
  if (defaults.login)    login.value    = defaults.login;
  if (defaults.length)   length.value   = defaults.length;
  if (defaults.counter)  counter.value  = defaults.counter;

  if (defaults.lowercase !== undefined) lowercase.checked = defaults.lowercase;
  if (defaults.uppercase !== undefined) uppercase.checked = defaults.uppercase;
  if (defaults.digits    !== undefined) digits.checked    = defaults.digits;
  if (defaults.symbols   !== undefined) symbols.checked   = defaults.symbols;

  initTheme();
  updateSyncStatus();
}

const tabGenerator = $('tabGenerator');
const tabSync      = $('tabSync');
const generatorView= $('generatorView');
const syncView     = $('syncView');

tabGenerator.addEventListener('click', () => {
  tabGenerator.classList.add('active');
  tabSync.classList.remove('active');
  generatorView.classList.remove('hidden');
  syncView.classList.add('hidden');
});

tabSync.addEventListener('click', () => {
  tabSync.classList.add('active');
  tabGenerator.classList.remove('active');
  syncView.classList.remove('hidden');
  generatorView.classList.add('hidden');
});

$('passwordForm').addEventListener('submit', handleGenerate);
regenerateBtn.addEventListener('click', handleGenerate);
copyBtn.addEventListener('click', copyPassword);
fillBtn.addEventListener('click', autoFill);
saveBtn.addEventListener('click', handleSave);
syncBtn.addEventListener('click', () => tabSync.click());
passphraseBtn.addEventListener('click', handlePassphrase);
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Sync Action Handlers
$('syncLoginForm').addEventListener('submit', handleSyncLogin);
$('logoutBtn').addEventListener('click', handleSyncLogout);
$('syncPushBtn').addEventListener('click', handleSyncPush);
$('syncPullBtn').addEventListener('click', handleSyncPull);
$('syncMergeBtn').addEventListener('click', handleSyncMerge);

async function handleSyncLogin(e) {
  if (e) e.preventDefault();
  
  const url = $('syncServerUrlInput').value.trim();
  const email = $('syncEmailInput').value.trim();
  const password = $('syncPasswordInput').value;
  const loginSubmitBtn = $('loginSubmitBtn');
  
  if (!url || !email || !password) {
    showToast('Please fill in all fields');
    return;
  }
  
  loginSubmitBtn.textContent = 'Logging in...';
  loginSubmitBtn.disabled = true;
  
  try {
    await sync.setServerUrl(url);
    await sync.login(email, password, 'StatePass Extension');
    showToast('Logged in successfully!');
    await updateSyncStatus();
  } catch (err) {
    showToast(`Login failed: ${err.message}`);
  } finally {
    loginSubmitBtn.textContent = 'Login';
    loginSubmitBtn.disabled = false;
  }
}

async function handleSyncLogout() {
  const logoutBtn = $('logoutBtn');
  logoutBtn.textContent = 'Logging out...';
  logoutBtn.disabled = true;
  try {
    await sync.logout();
    showToast('Logged out');
    await updateSyncStatus();
  } catch (err) {
    showToast(`Logout failed: ${err.message}`);
  } finally {
    logoutBtn.textContent = 'Logout';
    logoutBtn.disabled = false;
  }
}

async function handleSyncPush() {
  const pushBtn = $('syncPushBtn');
  pushBtn.textContent = 'Pushing...';
  pushBtn.disabled = true;
  try {
    await sync.pushProfiles();
    showToast('Profiles pushed to server');
  } catch (err) {
    showToast(`Push failed: ${err.message}`);
  } finally {
    pushBtn.textContent = 'Push Profiles to Server';
    pushBtn.disabled = false;
  }
}

async function handleSyncPull() {
  const pullBtn = $('syncPullBtn');
  pullBtn.textContent = 'Pulling...';
  pullBtn.disabled = true;
  try {
    await sync.pullProfiles();
    showToast('Profiles pulled from server');
  } catch (err) {
    showToast(`Pull failed: ${err.message}`);
  } finally {
    pullBtn.textContent = 'Pull Profiles from Server';
    pullBtn.disabled = false;
  }
}

async function handleSyncMerge() {
  const mergeBtn = $('syncMergeBtn');
  mergeBtn.textContent = 'Syncing...';
  mergeBtn.disabled = true;
  try {
    await sync.syncBothWays();
    showToast('Two-way sync complete');
  } catch (err) {
    showToast(`Sync failed: ${err.message}`);
  } finally {
    mergeBtn.textContent = 'Two-Way Sync';
    mergeBtn.disabled = false;
  }
}

function initTheme() {
  chrome.storage.sync.get('theme', ({ theme }) => {
    const t = theme || 'dark';
    document.documentElement.dataset.theme = t;
    themeToggle.textContent = t === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  });
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  themeToggle.textContent = next === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  chrome.storage.sync.set({ theme: next });
});

async function updateSyncStatus() {
  try {
    const { syncServerUrl, syncSession } = await chrome.storage.local.get(['syncServerUrl', 'syncSession']);
    const syncLoginForm = $('syncLoginForm');
    const syncConnectedPanel = $('syncConnectedPanel');
    const connectedUser = $('connectedUser');
    const connectedServer = $('connectedServer');
    
    if (syncSession?.user) {
      const emailOrUsername = syncSession.user.email || syncSession.user.username || '...';
      syncStatus.textContent = `Connected: ${emailOrUsername}`;
      
      // Update Sync View Panel
      connectedUser.textContent = emailOrUsername;
      connectedServer.textContent = syncServerUrl || 'http://localhost:4000';
      
      syncLoginForm.classList.add('hidden');
      syncConnectedPanel.classList.remove('hidden');
    } else {
      syncStatus.textContent = 'Not connected';
      
      // Update Sync View Panel
      syncLoginForm.classList.remove('hidden');
      syncConnectedPanel.classList.add('hidden');
      
      // Prefill server URL from storage if available
      if (syncServerUrl) {
        $('syncServerUrlInput').value = syncServerUrl;
      } else {
        $('syncServerUrlInput').value = 'http://localhost:4000';
      }
    }
  } catch (err) {
    console.error('Error updating sync status:', err);
    syncStatus.textContent = 'Not connected';
    $('syncLoginForm').classList.remove('hidden');
    $('syncConnectedPanel').classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);
