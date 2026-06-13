import { DEFAULT_PROFILE } from './core/lesspass.js';

const INITIAL_STORAGE = {
  ...DEFAULT_PROFILE,
  savedEntries: [],
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.sync.set(INITIAL_STORAGE);
    chrome.runtime.openOptionsPage();
  }
  if (reason === 'install' || reason === 'update') {
    chrome.alarms.create('sync', { periodInMinutes: 30 });
  }

  chrome.contextMenus.create({
    id: 'statepass-map-username',
    title: 'StatePass — Map as username field',
    contexts: ['editable'],
  });

  chrome.contextMenus.create({
    id: 'statepass-map-password',
    title: 'StatePass — Map as password field',
    contexts: ['editable'],
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'STATEPASS_GET_DEFAULTS') {
    chrome.storage.sync.get(null, data => sendResponse(data));
    return true;
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'sync') {
    performPeriodicSync();
  }
});

async function performPeriodicSync() {
  try {
    const { syncSession } = await chrome.storage.local.get('syncSession');
    if (!syncSession?.refreshToken) return;

    const { StatePassSync } = await import('./services/sync-service.js');
    const client = new StatePassSync();
    await client._loadSession();
    await client.syncBothWays();
  } catch {
    /* silent — will retry on next alarm */
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading' || !changeInfo.url) return;

  chrome.storage.sync.get({ savedEntries: [] }, ({ savedEntries }) => {
    const match = savedEntries.find(e => changeInfo.url.includes(e.site));
    if (match) {
      chrome.tabs.sendMessage(tabId, { type: 'STATEPASS_PROFILE', profile: match })
        .catch(() => {});
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const role = info.menuItemId === 'statepass-map-username' ? 'username' : 'password';
  chrome.tabs.sendMessage(tab.id, {
    type: 'STATEPASS_START_MAPPING',
    role,
  }).catch(() => {});
});
