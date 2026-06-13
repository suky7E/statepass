function fillPasswordField(password) {
  const target = findPasswordField();
  if (!target) return false;

  setNativeValue(target, password);
  dispatchEvents(target);
  return true;
}

function fillUsernameField(username) {
  const target = findUsernameField();
  if (!target) return false;

  setNativeValue(target, username);
  dispatchEvents(target);
  return true;
}

function findPasswordField() {
  return (
    document.querySelector('input[autocomplete="current-password"]') ||
    document.querySelector('input[autocomplete="new-password"]') ||
    document.querySelector('input[type="password"]') ||
    document.querySelector('input[data-statepass]') ||
    document.querySelector('input[name*="pass" i]') ||
    document.querySelector('input[id*="pass" i]') ||
    document.querySelector('input[placeholder*="pass" i]')
  );
}

function findUsernameField() {
  return (
    document.querySelector('input[autocomplete="username"]') ||
    document.querySelector('input[autocomplete="email"]') ||
    document.querySelector('input[type="email"]') ||
    document.querySelector('input[name*="user" i]') ||
    document.querySelector('input[name*="email" i]') ||
    document.querySelector('input[id*="user" i]') ||
    document.querySelector('input[id*="email" i]')
  );
}

function setNativeValue(element, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (nativeSetter?.set) {
    nativeSetter.set.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatchEvents(element) {
  ['input', 'change', 'blur'].forEach(type =>
    element.dispatchEvent(new Event(type, { bubbles: true })),
  );
}

function buildSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
  const cls = Array.from(el.classList).filter(c => !c.startsWith('statepass')).join('.');
  if (cls) return `${el.tagName.toLowerCase()}.${CSS.escape(cls)}`;
  return el.tagName.toLowerCase();
}

async function loadAndApplyMappings(site) {
  const { fieldMappings = {} } = await chrome.storage.sync.get('fieldMappings');
  return !!fieldMappings[site];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STATEPASS_FILL') {
    const success = fillPasswordField(message.password);
    sendResponse({ success });
  }

  if (message.type === 'STATEPASS_PROFILE') {
    if (message.profile?.login) {
      fillUsernameField(message.profile.login);
    }
  }

  if (message.type === 'STATEPASS_START_MAPPING') {
    const clickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener('click', clickHandler, true);

      const target = e.target;
      if (!target.matches('input, textarea, select')) {
        showToast('Click an input field to map it');
        return;
      }

      const site = window.location.hostname;
      const selector = buildSelector(target);
      const role = message.role;

      chrome.storage.sync.get('fieldMappings', ({ fieldMappings = {} }) => {
        if (!fieldMappings[site]) fieldMappings[site] = {};
        fieldMappings[site][role === 'username' ? 'usernameSelector' : 'passwordSelector'] = selector;
        chrome.storage.sync.set({ fieldMappings });
      });

      showToast(`Field mapped as ${role}: ${selector}`);
      target.style.outline = role === 'username' ? '2px solid #5b8dee' : '2px solid #e94560';
      setTimeout(() => target.style.outline = '', 2000);
    };

    setTimeout(() => document.addEventListener('click', clickHandler, true), 100);
    showToast(`Click the ${message.role} field on this page`);
    sendResponse({ success: true });
  }

  if (message.type === 'STATEPASS_DETECT') {
    sendResponse({
      hasPassword: !!findPasswordField(),
      hasUsername: !!findUsernameField(),
    });
  }
});

function showToast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
    background: '#1a1a2e', color: '#eaeaea', padding: '8px 16px',
    borderRadius: '8px', zIndex: '2147483647',
    fontFamily: 'sans-serif', fontSize: '13px',
    border: '1px solid #5b8dee',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'opacity 0.2s',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
}

(async function init() {
  const site = window.location.hostname;
  await loadAndApplyMappings(site);

  if (!findPasswordField() && !findUsernameField()) {
    const { fieldMappings = {} } = await chrome.storage.sync.get('fieldMappings');
    if (fieldMappings[site]) return;

    const banner = document.createElement('div');
    banner.id = 'statepass-hint';
    Object.assign(banner.style, {
      position: 'fixed', bottom: '0', left: '0', right: '0',
      background: '#1a1a2e', color: '#eaeaea',
      padding: '10px 16px', zIndex: '2147483647',
      fontFamily: 'sans-serif', fontSize: '12px',
      borderTop: '2px solid #5b8dee',
      display: 'flex', alignItems: 'center', gap: '10px',
    });

    const textSpan = document.createElement('span');
    textSpan.innerHTML = 'StatePass &mdash; No standard login fields detected on ';
    const siteStrong = document.createElement('strong');
    siteStrong.textContent = site;
    textSpan.appendChild(siteStrong);

    const suffixSpan = document.createElement('span');
    suffixSpan.innerHTML = `. <span style="font-size:11px;color:#8899aa">Right-click a field &rarr; StatePass &rarr; Map as username/password.</span>`;
    textSpan.appendChild(suffixSpan);

    banner.appendChild(textSpan);

    const dismissBtn = document.createElement('button');
    dismissBtn.id = 'sp-dismiss';
    dismissBtn.textContent = 'Dismiss';
    Object.assign(dismissBtn.style, {
      padding: '4px 10px', cursor: 'pointer', background: '#333', color: '#aaa',
      border: 'none', borderRadius: '4px', marginLeft: 'auto'
    });
    banner.appendChild(dismissBtn);

    document.body.appendChild(banner);
    dismissBtn.addEventListener('click', () => banner.remove());
  }
})();
