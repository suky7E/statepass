const SELECTORS = [
  { attr: 'autocomplete',       value: 'username',        role: 'username', confidence: 100 },
  { attr: 'autocomplete',       value: 'email',           role: 'username', confidence: 100 },
  { attr: 'autocomplete',       value: 'current-password', role: 'password', confidence: 100 },
  { attr: 'autocomplete',       value: 'new-password',    role: 'password', confidence: 100 },
  { type: 'email',                                       role: 'username', confidence: 90 },
  { type: 'password',                                    role: 'password', confidence: 90 },
  { name: /^user(name|id)?$/i,                           role: 'username', confidence: 80 },
  { name: /^pass(word|wd)?$/i,                           role: 'password', confidence: 80 },
  { name: /^login$/i,                                    role: 'username', confidence: 70 },
  { id: /user(name|id)?/i,                               role: 'username', confidence: 60 },
  { id: /pass(word|wd)?/i,                               role: 'password', confidence: 60 },
  { placeholder: /user(name|id)?/i,                      role: 'username', confidence: 50 },
  { placeholder: /pass(word|wd)?/i,                      role: 'password', confidence: 50 },
];

function scoreField(input, rule) {
  let score = 0;
  if (rule.attr !== undefined) {
    const attrVal = input.getAttribute(rule.attr);
    if (attrVal && (typeof rule.value === 'string' ? attrVal === rule.value : rule.value.test(attrVal))) {
      score = rule.confidence;
    }
  }
  if (rule.type !== undefined) {
    if (input.type === rule.type) score = Math.max(score, rule.confidence);
  }
  if (rule.name !== undefined) {
    const name = input.name || '';
    if (rule.name.test(name)) score = Math.max(score, rule.confidence);
  }
  if (rule.id !== undefined) {
    const id = input.id || '';
    if (rule.id.test(id)) score = Math.max(score, rule.confidence);
  }
  if (rule.placeholder !== undefined) {
    const placeholder = input.placeholder || '';
    if (rule.placeholder.test(placeholder)) score = Math.max(score, rule.confidence);
  }
  return score;
}

export function detectFields(doc = document) {
  const inputs = doc.querySelectorAll('input, textarea, select');
  const candidates = { username: null, password: null };
  const scores = { username: 0, password: 0 };

  for (const input of inputs) {
    for (const rule of SELECTORS) {
      const s = scoreField(input, rule);
      if (s > scores[rule.role]) {
        scores[rule.role] = s;
        candidates[rule.role] = input;
      }
    }
  }

  return {
    usernameField: candidates.username,
    passwordField: candidates.password,
    confidence: Math.min(scores.username, scores.password),
    detected: !!(candidates.username && candidates.password),
  };
}

export function getStoredMapping(site) {
  return new Promise(resolve => {
    chrome.storage.sync.get('fieldMappings', ({ fieldMappings }) => {
      resolve(fieldMappings?.[site] || null);
    });
  });
}

export function saveMapping(site, mapping) {
  return new Promise(resolve => {
    chrome.storage.sync.get('fieldMappings', ({ fieldMappings = {} }) => {
      fieldMappings[site] = mapping;
      chrome.storage.sync.set({ fieldMappings }, resolve);
    });
  });
}

export function clearMapping(site) {
  return new Promise(resolve => {
    chrome.storage.sync.get('fieldMappings', ({ fieldMappings = {} }) => {
      delete fieldMappings[site];
      chrome.storage.sync.set({ fieldMappings }, resolve);
    });
  });
}

export function injectMappingUI(site, onMap) {
  const banner = document.createElement('div');
  banner.id = 'statepass-map-banner';
  Object.assign(banner.style, {
    position: 'fixed', bottom: '0', left: '0', right: '0',
    background: '#1a1a2e', color: '#eaeaea',
    padding: '12px 16px', zIndex: '2147483647',
    fontFamily: 'sans-serif', fontSize: '13px',
    borderTop: '2px solid #5b8dee',
    display: 'flex', alignItems: 'center', gap: '12px',
    flexWrap: 'wrap',
  });

  const descSpan = document.createElement('span');
  descSpan.style.flex = '1';
  descSpan.innerHTML = '<strong>StatePass</strong> — No standard login fields detected on ';
  const codeEl = document.createElement('code');
  codeEl.textContent = site;
  descSpan.appendChild(codeEl);
  
  const subText = document.createElement('span');
  subText.style.fontSize = '11px';
  subText.style.color = '#8899aa';
  subText.style.marginLeft = '4px';
  subText.textContent = 'Fields can be manually assigned.';
  descSpan.appendChild(subText);
  
  banner.appendChild(descSpan);
  
  const userBtn = document.createElement('button');
  userBtn.id = 'sp-map-user';
  userBtn.textContent = 'Select username field';
  Object.assign(userBtn.style, { padding: '6px 12px', cursor: 'pointer', background: '#5b8dee', color: '#fff', border: 'none', borderRadius: '4px' });
  banner.appendChild(userBtn);

  const passBtn = document.createElement('button');
  passBtn.id = 'sp-map-pass';
  passBtn.textContent = 'Select password field';
  Object.assign(passBtn.style, { padding: '6px 12px', cursor: 'pointer', background: '#5b8dee', color: '#fff', border: 'none', borderRadius: '4px' });
  banner.appendChild(passBtn);

  const dismissBtn = document.createElement('button');
  dismissBtn.id = 'sp-map-dismiss';
  dismissBtn.textContent = 'Dismiss';
  Object.assign(dismissBtn.style, { padding: '6px 12px', cursor: 'pointer', background: '#333', color: '#aaa', border: 'none', borderRadius: '4px' });
  banner.appendChild(dismissBtn);

  document.body.appendChild(banner);

  let selecting = null;

  function stopSelecting() {
    if (selecting) {
      document.removeEventListener('click', selecting);
      selecting = null;
    }
  }

  function startSelecting(role) {
    stopSelecting();
    selecting = function(e) {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        const selector = buildSelector(target);
        onMap({ role, selector });
        stopSelecting();
        banner.remove();
      }
    };
    setTimeout(() => document.addEventListener('click', selecting), 100);
  }

  document.getElementById('sp-map-user')?.addEventListener('click', () => startSelecting('username'));
  document.getElementById('sp-map-pass')?.addEventListener('click', () => startSelecting('password'));
  document.getElementById('sp-map-dismiss')?.addEventListener('click', () => { stopSelecting(); banner.remove(); });
}

function buildSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/).filter(Boolean);
    if (cls.length > 0) return `${el.tagName.toLowerCase()}.${CSS.escape(cls.join('.'))}`;
  }
  return el.tagName.toLowerCase();
}
