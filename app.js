'use strict';

/* ---------- Configuration ---------- */
const CONFIG = {
  TINYFN_API_KEY: 'tf_live_BTlg7rGFNUJcL_kr968wSRX-grUPOHd9KiS1mAgITIQ',
  ROAST_URL: 'https://evilinsult.com/generate_insult.php?lang=en&type=json',
  // Tried in order if the direct call is blocked (EvilInsult doesn't always send CORS headers)
  ROAST_SOURCES: [
    (u) => u,
    (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  ],
  ROAST_BACKUP_URL: 'https://insult.mattbas.org/api/insult.json', // last resort, different API
  TOAST_URL: 'https://api.tinyfn.io/v1/fun/compliment',
  SHARE_URL: 'https://roast-toast.suvadipchakraborty.workers.dev/',
};

/* ---------- State ---------- */
const MODES = {
  roast: { label: 'Generate Insult', theme: '#0A0406', idle: 'Your target awaits. Hit generate.' },
  toast: { label: 'Generate Compliment', theme: '#FFF8E7', idle: 'Pick a side, then hit generate.' },
};
const state = { mode: 'toast', phrase: '', busy: false };
let deferredInstall = null;

const $ = (s) => document.querySelector(s);
const els = {
  phrase: $('#phrase'), generate: $('#generate'), copy: $('#copy'), share: $('#share'),
  status: $('#status'), install: $('#install'), hint: $('#install-hint'),
};

/* ---------- Helpers ---------- */
const decode = (s) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value.trim(); };
let statusTimer;
function say(msg, el = els.status) {
  el.textContent = msg;
  if (el === els.status) { clearTimeout(statusTimer); statusTimer = setTimeout(() => (el.textContent = ''), 2500); }
}

/* ---------- Mode / theme ---------- */
function setMode(mode) {
  state.mode = mode;
  document.documentElement.dataset.mode = mode;
  document.querySelectorAll('.opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  els.generate.textContent = MODES[mode].label;
  document.querySelector('meta[name="theme-color"]').content = MODES[mode].theme;
  setPhrase('', MODES[mode].idle);
  try { localStorage.setItem('rt-mode', mode); } catch (_) {}
}
function setPhrase(text, fallback) {
  state.phrase = text;
  els.phrase.textContent = text || fallback;
  els.copy.disabled = els.share.disabled = !text;
}

/* ---------- Dual-API fetch engine ---------- */
async function getJSON(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function fetchRoast() {
  for (const wrap of CONFIG.ROAST_SOURCES) {
    try {
      const data = await getJSON(wrap(CONFIG.ROAST_URL));
      if (data && data.insult) return decode(data.insult);
    } catch (_) { /* try next source */ }
  }
  try {
    const data = await getJSON(CONFIG.ROAST_BACKUP_URL);
    if (data && data.insult) return decode(data.insult);
  } catch (_) {}
  throw new Error('Couldn’t reach the insult servers. Try again in a moment.');
}

async function fetchToast() {
  if (!CONFIG.TINYFN_API_KEY || CONFIG.TINYFN_API_KEY.startsWith('YOUR_')) {
    throw new Error('Add your TinyFN API key in app.js to use Toast mode.');
  }
  const res = await fetch(CONFIG.TOAST_URL, { headers: { 'X-API-Key': CONFIG.TINYFN_API_KEY } });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'TinyFN rejected the API key.' : 'TinyFN is down. Try again.');
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  const out = extractText(data);
  if (!out) throw new Error('No compliment came back. Try again.');
  return decode(out);
}

// TinyFN's response shape isn't fixed here, so check common fields, then any string value.
function extractText(d) {
  if (typeof d === 'string') return d;
  if (!d || typeof d !== 'object') return '';
  for (const k of ['compliment', 'result', 'text', 'message', 'data']) {
    if (d[k] != null) { const v = extractText(d[k]); if (v) return v; }
  }
  return Object.values(d).find((v) => typeof v === 'string' && v.length > 3) || '';
}

async function generate() {
  if (state.busy) return;
  state.busy = true;
  els.generate.disabled = true;
  els.phrase.classList.add('loading');
  try {
    setPhrase(state.mode === 'roast' ? await fetchRoast() : await fetchToast());
  } catch (err) {
    setPhrase('', err.message === 'Failed to fetch' ? 'Network error. Check your connection.' : err.message);
  } finally {
    state.busy = false;
    els.generate.disabled = false;
    els.phrase.classList.remove('loading');
  }
}

/* ---------- Copy & share ---------- */
async function copy() {
  if (!state.phrase) return;
  try {
    await navigator.clipboard.writeText(state.phrase);
  } catch (_) {
    const t = Object.assign(document.createElement('textarea'), { value: state.phrase });
    document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
  }
  say('Copied to clipboard');
}

async function share() {
  if (!state.phrase) return;
  const data = { title: 'Roast & Toast', text: state.phrase, url: CONFIG.SHARE_URL };
  if (navigator.share) {
    try { await navigator.share(data); } catch (_) { /* dismissed */ }
  } else {
    await copy();
    say('Sharing isn’t supported here. Copied instead.');
  }
}

/* ---------- Tabs ---------- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  document.querySelectorAll('.nav-item').forEach((n) => {
    const on = n.dataset.tab === name;
    n.classList.toggle('active', on);
    on ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current');
  });
  scrollTo({ top: 0 });
}

/* ---------- PWA install ---------- */
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; say('Installed!', els.hint); });

async function install() {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    return say('Already installed.', els.hint);
  }
  if (deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    say('On iPhone: tap Share, then “Add to Home Screen”.', els.hint);
  } else {
    say('Use your browser menu and choose “Install app” or “Add to Home Screen”.', els.hint);
  }
}

/* ---------- Wire up ---------- */
document.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('.nav-item').forEach((n) => n.addEventListener('click', () => showTab(n.dataset.tab)));
els.generate.addEventListener('click', generate);
els.copy.addEventListener('click', copy);
els.share.addEventListener('click', share);
els.install.addEventListener('click', install);

let saved = 'toast';
try { saved = localStorage.getItem('rt-mode') || 'toast'; } catch (_) {}
setMode(MODES[saved] ? saved : 'toast');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
