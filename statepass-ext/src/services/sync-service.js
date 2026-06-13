const STORAGE_KEY = 'syncSession';

export class StatePassSync {
  constructor() {
    this._access  = null;
    this._refresh = null;
    this._userId  = null;
    this._serverUrl = null;
  }

  async getServerUrl() {
    if (this._serverUrl) return this._serverUrl;
    const { syncServerUrl } = await chrome.storage.local.get('syncServerUrl');
    if (!syncServerUrl) throw new Error('No sync server configured');
    this._serverUrl = syncServerUrl.replace(/\/$/, '');
    return this._serverUrl;
  }

  async setServerUrl(url) {
    this._serverUrl = url.replace(/\/$/, '');
    await chrome.storage.local.set({ syncServerUrl: this._serverUrl });
  }

  async login(email, password, deviceName = 'Browser Extension') {
    const url = await this.getServerUrl();
    const { device_id: deviceId } = await chrome.storage.local.get('device_id');

    const res  = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, deviceId, deviceName })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    await this._saveSession(data.accessToken, data.refreshToken, data.user);
    return data.user;
  }

  async logout() {
    try {
      const url = await this.getServerUrl();
      await this._fetch(`${url}/api/auth/logout`, {
        method: 'POST',
        body: JSON.stringify({ refreshToken: this._refresh })
      });
    } catch {}
    await this._clearSession();
  }

  async isLoggedIn() {
    const session = await this._loadSession();
    return !!session;
  }

  async getUser() {
    const session = await this._loadSession();
    return session?.user || null;
  }

  async pushProfiles() {
    const url     = await this.getServerUrl();
    const { savedEntries = [] } = await chrome.storage.sync.get('savedEntries');

    const profiles = savedEntries.map(entry => ({
      profileName: this._safeName(entry.site, entry.login),
      site:        entry.site,
      login:       entry.login,
      length:      entry.length   || 16,
      counter:     entry.counter  || 1,
      lowercase:   entry.lowercase !== false,
      uppercase:   entry.uppercase !== false,
      digits:      entry.digits    !== false,
      symbols:     entry.symbols   !== false,
      iterations:  entry.iterations || 600_000,
    }));

    const res  = await this._fetch(`${url}/api/profiles/sync`, {
      method: 'POST',
      body: JSON.stringify({ profiles })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sync failed');

    await chrome.storage.local.set({ lastSyncAt: Date.now() });
    return data;
  }

  async pullProfiles() {
    const url  = await this.getServerUrl();
    const res  = await this._fetch(`${url}/api/profiles`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fetch failed');

    const cloudEntries = data.profiles.map(p => ({
      site:       p.site,
      login:      p.login,
      length:     p.length,
      counter:    p.counter,
      lowercase:  p.lowercase,
      uppercase:  p.uppercase,
      digits:     p.digits,
      symbols:    p.symbols,
      iterations: p.iterations,
    }));

    await chrome.storage.sync.set({ savedEntries: cloudEntries });
    await chrome.storage.local.set({ lastSyncAt: Date.now() });
    return cloudEntries;
  }

  async syncBothWays() {
    const url  = await this.getServerUrl();

    const res  = await this._fetch(`${url}/api/profiles`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fetch failed');

    const { savedEntries: local = [] } = await chrome.storage.sync.get('savedEntries');

    const map = new Map();
    for (const entry of local)          map.set(`${entry.site}::${entry.login}`, entry);
    for (const entry of data.profiles)  map.set(`${entry.site}::${entry.login}`, entry);

    const merged = Array.from(map.values());

    await chrome.storage.sync.set({ savedEntries: merged });

    const profiles = merged.map(entry => ({
      profileName: this._safeName(entry.site, entry.login),
      site:        entry.site,
      login:       entry.login,
      length:      entry.length   || 16,
      counter:     entry.counter  || 1,
      lowercase:   entry.lowercase !== false,
      uppercase:   entry.uppercase !== false,
      digits:      entry.digits    !== false,
      symbols:     entry.symbols   !== false,
      iterations:  entry.iterations || 600_000,
    }));

    const pushRes = await this._fetch(`${url}/api/profiles/sync`, {
      method: 'POST',
      body: JSON.stringify({ profiles })
    });
    if (!pushRes.ok) throw new Error('Push after merge failed');

    await chrome.storage.local.set({ lastSyncAt: Date.now() });
    return merged;
  }

  async _fetch(url, options = {}) {
    await this._ensureToken();

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this._access}`,
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      const refreshed = await this._refreshToken();
      if (!refreshed) throw new Error('Session expired. Please log in again.');
      headers['Authorization'] = `Bearer ${this._access}`;
      return fetch(url, { ...options, headers });
    }

    return res;
  }

  async _ensureToken() {
    if (this._access) return;
    await this._loadSession();
    if (!this._access) throw new Error('Not logged in');
  }

  async _refreshToken() {
    if (!this._refresh) return false;
    try {
      const url = await this.getServerUrl();
      const res = await fetch(`${url}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this._refresh })
      });
      if (!res.ok) { await this._clearSession(); return false; }
      const data = await res.json();
      this._access  = data.accessToken;
      this._refresh = data.refreshToken;
      await this._persistTokens();
      return true;
    } catch {
      await this._clearSession();
      return false;
    }
  }

  async _saveSession(accessToken, refreshToken, user) {
    this._access  = accessToken;
    this._refresh = refreshToken;
    this._userId  = user?.id;
    await chrome.storage.local.set({
      [STORAGE_KEY]: { refreshToken, user }
    });
  }

  async _persistTokens() {
    const { [STORAGE_KEY]: session = {} } = await chrome.storage.local.get(STORAGE_KEY);
    session.refreshToken = this._refresh;
    await chrome.storage.local.set({ [STORAGE_KEY]: session });
  }

  async _loadSession() {
    const { [STORAGE_KEY]: session } = await chrome.storage.local.get(STORAGE_KEY);
    if (!session?.refreshToken) return null;
    this._refresh = session.refreshToken;
    if (!this._access) {
      await this._refreshToken();
    }
    return session;
  }

  async _clearSession() {
    this._access = this._refresh = this._userId = null;
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  _safeName(site, login) {
    return `${site}_${login}`.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
  }
}

export const sync = new StatePassSync();
