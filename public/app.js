import { DEVICES, BROWSERS, geometryFor } from './devices.js';
import { renderKeyboard, KEYBOARD_KINDS } from './keyboard.js';

const $ = (id) => document.getElementById(id);
const els = {
  target: $('target'), targetForm: $('targetForm'), scan: $('scan'),
  picker: $('picker'), pickerList: $('pickerList'), pickerRefresh: $('pickerRefresh'), pickerForm: $('pickerForm'), pickerUrl: $('pickerUrl'), pickerClose: $('pickerClose'),
  device: $('device'), customSize: $('customSize'), customW: $('customW'), customH: $('customH'),
  browserGroup: $('browserGroup'), browser: $('browser'), theme: $('theme'),
  kbSection: $('kbSection'), kbMode: $('kbMode'), kbBehavior: $('kbBehavior'), zoom: $('zoom'), notes: $('notes'),
  back: $('back'), fwd: $('fwd'), reload: $('reload'), pathForm: $('pathForm'), origin: $('origin'), path: $('path'), openTab: $('openTab'),
  canvas: $('canvas'), scaler: $('scaler'), deviceEl: $('deviceEl'), screen: $('screen'), viewport: $('viewport'), frame: $('frame'),
  chromeTop: $('chromeTop'), chromeBottom: $('chromeBottom'), statusbar: $('statusbar'), cutout: $('cutout'),
  keyboard: $('keyboard'), homeIndicator: $('homeIndicator'), caption: $('caption'),
};

// ---------------------------------------------------------------------------
// Preferences (per browser, localStorage) + runtime state
// ---------------------------------------------------------------------------

const STORE_KEY = 'deview:prefs';
const prefs = {
  deviceId: 'iphone-17',
  browser: { ios: 'safari', android: 'chrome-android', desktop: 'none' },
  theme: 'system',
  kbMode: 'auto',
  lastKbKind: 'text',
  kbBehavior: 'overlay',
  zoom: 'fit',
  path: '/',
  target: '', // the target `path` belongs to
  customW: 768,
  customH: 1024,
};
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(STORE_KEY)));
} catch {}
const save = () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {}
};

let server = { target: '', proxyPort: 0 };
let proxyOrigin = '';
let page = { path: prefs.path, title: '', themeColor: null, bg: null, canvasDark: false, viewport: 'unknown', cover: false };
let focused = null; // { kind, hint, multiline } while an input in the app has focus
let pan = 0;
let lastUa;
let lastKbMsg = '';

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (prefs.theme === 'system' ? systemDark.matches : prefs.theme === 'dark');

function device() {
  const d = DEVICES.find((x) => x.id === prefs.deviceId) || DEVICES[2];
  return d.custom ? { ...d, w: +prefs.customW || 768, h: +prefs.customH || 1024 } : d;
}
function browser() {
  const list = BROWSERS[device().platform];
  return list.find((b) => b.id === prefs.browser[device().platform]) || list[0];
}
function clientConfig() {
  const d = device();
  const b = browser();
  return {
    theme: prefs.theme,
    ua: b.ua(d),
    platform: d.platform,
    mobile: d.platform !== 'desktop',
    insets: geometryFor(d, b, page).insets,
  };
}

// ---------------------------------------------------------------------------
// Server + frame plumbing
// ---------------------------------------------------------------------------

async function pushState(extra = {}) {
  const res = await fetch('/api/state', { method: 'POST', body: JSON.stringify({ config: clientConfig(), ...extra }) });
  server = await res.json();
  prefs.target = server.target;
}

const toFrame = (msg) => els.frame.contentWindow?.postMessage({ __deview: true, ...msg }, '*');

function loadFrame(path = page.path) {
  focused = null;
  pan = 0;
  lastKbMsg = '';
  if (!server.target) return (els.frame.src = 'about:blank');
  els.frame.src = proxyOrigin + (path.startsWith('/') ? path : '/' + path);
}

// Called after any preference change.
async function apply({ reload = false } = {}) {
  save();
  renderControls();
  layout();
  const cfg = clientConfig();
  const uaChanged = cfg.ua !== lastUa;
  lastUa = cfg.ua;
  await pushState();
  if (reload || uaChanged) loadFrame();
  else toFrame({ type: 'config', config: cfg });
}

window.addEventListener('message', (e) => {
  if (e.source !== els.frame.contentWindow || !e.data?.__deview) return;
  const { type, ...m } = e.data;
  if (type === 'hello' || type === 'state') {
    const coverChanged = m.cover !== page.cover;
    page = { ...page, ...m };
    prefs.path = page.path;
    save();
    if (type === 'hello') {
      focused = null;
      pan = 0;
      lastKbMsg = '';
    }
    if (type === 'hello' || coverChanged) {
      toFrame({ type: 'config', config: clientConfig() });
      pushState();
    }
    renderAddress();
    renderNotes();
    layout();
  } else if (type === 'focus') {
    focused = { kind: m.kind, hint: m.hint, multiline: m.multiline };
    layout();
  } else if (type === 'blur') {
    focused = null;
    layout();
  } else if (type === 'pan') {
    pan = m.pan;
    layoutFrame();
  }
});

// ---------------------------------------------------------------------------
// Rendering: device, status bar, browser chrome, keyboard
// ---------------------------------------------------------------------------

const colorCtx = document.createElement('canvas').getContext('2d');
function isLightColor(color) {
  colorCtx.fillStyle = '#000';
  colorCtx.fillStyle = color;
  const v = colorCtx.fillStyle;
  const [r, g, b] = v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : v.match(/[\d.]+/g).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}
const inkOn = (bg) => (isLightColor(bg) ? '#000' : '#fff');

const stroke = (d, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  back: stroke('<path d="m15 5-7 7 7 7"/>'),
  fwd: stroke('<path d="m9 5 7 7-7 7"/>'),
  share: stroke('<path d="M12 3v12M8 7l4-4 4 4M7 11H5v10h14V11h-2"/>'),
  book: stroke('<path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5zM12 6v13.5"/>'),
  tabs: stroke('<rect x="7" y="7" width="13" height="13" rx="2.5"/><path d="M4 16V6.5A2.5 2.5 0 0 1 6.5 4H16"/>'),
  reload: stroke('<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>', 17),
  plus: stroke('<path d="M12 5v14M5 12h14"/>'),
  more: stroke('<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>'),
  vmore: stroke('<circle cx="12" cy="5" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="12" cy="19" r=".8"/>'),
  sidebar: stroke('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>'),
  home: stroke('<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>'),
  tune: stroke('<path d="M4 8h10m4 0h2M4 16h2m4 0h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>', 18),
};
const AA = '<span style="font-size:13px;font-weight:600"><small style="font-size:10px">A</small>A</span>';

const SIGNAL = '<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect y="8" width="3" height="4" rx=".8"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8"/><rect x="10" y="3" width="3" height="9" rx=".8"/><rect x="15" width="3" height="12" rx=".8"/></svg>';
const WIFI = '<svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.3c2.3 0 4.4.9 6 2.4l1.3-1.3A10.4 10.4 0 0 0 8 .5 10.4 10.4 0 0 0 .7 3.4L2 4.7a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.7 6.7 0 0 0 8 4.1a6.7 6.7 0 0 0-4.7 1.8l1.3 1.3A4.9 4.9 0 0 1 8 5.9Zm0 3.4c.5 0 .9.2 1.3.5L8 11.5 6.7 9.8c.4-.3.8-.5 1.3-.5Z"/></svg>';
const BATTERY = '<svg width="27" height="13" viewBox="0 0 27 13" fill="currentColor"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.4"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" opacity=".45"/></svg>';
const ANDROID_BATTERY = '<svg width="10" height="15" viewBox="0 0 10 15" fill="currentColor"><rect x="3" width="4" height="2" rx=".5"/><rect y="1.5" width="10" height="13.5" rx="1.8"/></svg>';

function statusBarHTML(d) {
  if (d.platform === 'android') return `<span>9:41</span><span style="gap:6px">${WIFI}${SIGNAL}${ANDROID_BATTERY}</span>`;
  if (d.tablet) return `<span>9:41&nbsp;&nbsp;Tue Sep 23</span><span></span><span>${WIFI}100%&nbsp;${BATTERY}</span>`;
  if (!d.cutout) return `<span>${SIGNAL}${WIFI}</span><span>9:41 AM</span><span>100%&nbsp;${BATTERY}</span>`;
  return `<span>9:41</span><span></span><span>${SIGNAL}${WIFI}${BATTERY}</span>`;
}

// Returns { top, bottom, statusBg } — HTML for the chrome regions and the color behind the status bar.
function chromeFor(d, b, g, dark, pageBg) {
  const host = server.target ? new URL(server.target).hostname : 'localhost';
  const tint = page.themeColor || pageBg;
  const status = `height:${d.status}px`;

  if (b.id === 'safari') {
    const pillBg = (bg) => (isLightColor(bg) ? 'rgba(118,118,128,.14)' : 'rgba(118,118,128,.3)');
    if (d.tablet) {
      return {
        statusBg: tint,
        top: `<div style="${status}"></div><div class="safari-top" style="height:${g.top - d.status}px;color:${inkOn(tint)}">
          ${ICON.sidebar}${ICON.back}${ICON.fwd}
          <div class="pill" style="background:${pillBg(tint)}">${AA}<span class="url">${host}</span>${ICON.reload}</div>
          ${ICON.share}${ICON.plus}${ICON.tabs}</div>`,
        bottom: '',
      };
    }
    const barBg = dark ? 'rgba(28,28,30,.94)' : 'rgba(249,249,251,.94)';
    return {
      statusBg: tint,
      top: '',
      bottom: `<div class="safari-bottom" style="background:${barBg};color:${dark ? '#fff' : '#000'};padding-bottom:${d.home}px;border-top:.5px solid ${dark ? '#ffffff14' : '#0000001f'}">
        <div class="pill" style="background:${dark ? '#3a3a3c' : '#fff'};box-shadow:0 1px 3px #0000001a">${AA}<span class="url">${host}</span>${ICON.reload}</div>
        <div class="bar" style="color:#0a84ff">${ICON.back}${ICON.fwd}${ICON.share}${ICON.book}${ICON.tabs}</div></div>`,
    };
  }

  if (b.id === 'chrome-ios') {
    const bar = dark ? '#1c1c1e' : '#f7f7f8';
    const ink = dark ? '#fff' : '#000';
    return {
      statusBg: bar,
      top: `<div style="${status}"></div><div class="chrome-ios-top" style="height:${g.top - d.status}px;color:${ink}">
        <div class="pill" style="background:${dark ? '#2c2c2e' : '#e9e9ec'}"><span class="url">${host}</span></div></div>`,
      bottom: g.bottom
        ? `<div style="height:100%;background:${bar};color:${ink};padding-bottom:${d.home}px;border-top:.5px solid ${dark ? '#ffffff14' : '#0000001f'}">
            <div class="bar">${ICON.back}${ICON.fwd}${ICON.plus}<span class="tabs-count">1</span>${ICON.more}</div></div>`
        : '',
    };
  }

  if (b.id === 'chrome-android') {
    const bar = page.themeColor || (dark ? '#1f1f1f' : '#ffffff');
    const ink = inkOn(bar);
    return {
      statusBg: bar,
      top: `<div style="${status}"></div><div class="chrome-android-top" style="height:${g.top - d.status}px;color:${ink}">
        ${ICON.home}<div class="pill" style="background:${ink === '#000' ? '#0000000d' : '#ffffff1a'}">${ICON.tune}<span class="url">${host}</span></div>
        <span class="tabs-count">1</span>${ICON.vmore}</div>`,
      bottom: `<div style="height:100%;background:${pageBg}"></div>`,
    };
  }

  if (b.id === 'pwa') {
    return {
      statusBg: g.statusOverlay ? null : tint,
      top: g.statusOverlay ? '' : `<div style="${status}"></div>`,
      bottom: g.bottom ? `<div style="height:100%;background:${pageBg}"></div>` : '',
    };
  }
  return { statusBg: null, top: '', bottom: '' };
}

function layout() {
  const d = device();
  const b = browser();
  const g = geometryFor(d, b, page);
  const dark = isDark();
  const hardware = d.platform !== 'desktop' && b.id !== 'none';
  const pageBg = page.bg || (page.canvasDark ? '#121212' : '#ffffff');

  els.deviceEl.className = `device ${hardware && d.frame ? 'frame-' + d.frame : 'bare'}`;
  els.deviceEl.style.setProperty('--r', `${d.radius}px`);
  // Page color goes behind the app only; the screen stays black so nothing bleeds at its anti-aliased edges.
  Object.assign(els.screen.style, { width: `${d.w}px`, height: `${d.h}px`, background: hardware ? '#000' : pageBg });
  els.viewport.style.background = pageBg;

  // browser chrome + status bar
  const chrome = hardware ? chromeFor(d, b, g, dark, pageBg) : { top: '', bottom: '', statusBg: null };
  Object.assign(els.chromeTop.style, { height: `${g.top}px`, background: chrome.statusBg || 'transparent' });
  els.chromeTop.innerHTML = chrome.top;
  els.chromeBottom.style.height = `${g.bottom}px`;
  els.chromeBottom.innerHTML = chrome.bottom;

  els.statusbar.hidden = !hardware;
  if (hardware) {
    els.statusbar.className = `statusbar ${d.platform} cutout-${d.cutout || 'none'}${d.tablet ? ' tablet' : ''}${!d.cutout && !d.tablet && d.platform === 'ios' ? ' compact' : ''}`;
    Object.assign(els.statusbar.style, { height: `${d.status}px`, color: inkOn(chrome.statusBg || pageBg) });
    els.statusbar.innerHTML = statusBarHTML(d);
  }
  els.cutout.className = `cutout ${hardware && d.cutout ? d.cutout : ''}`;
  els.cutout.hidden = !hardware || !d.cutout;

  // keyboard
  const kbKind = d.platform === 'desktop' ? null : prefs.kbMode === 'off' ? null : prefs.kbMode === 'auto' ? focused?.kind : prefs.kbMode;
  if (kbKind) {
    renderKeyboard(els.keyboard, {
      platform: d.platform,
      kind: kbKind,
      hint: focused?.hint,
      multiline: focused?.multiline,
      accessory: d.platform === 'ios' && !!focused,
      dark,
      tablet: d.tablet,
      home: hardware ? d.home : 0,
    });
  }
  els.keyboard.classList.toggle('show', !!kbKind);
  const kbHeight = kbKind ? els.keyboard.offsetHeight : 0;
  const overlap = Math.max(0, kbHeight - g.bottom);

  // home indicator: contrast against whatever is under it
  els.homeIndicator.hidden = !hardware || !d.home;
  if (hardware && d.home) {
    const under = kbKind ? (dark ? '#000' : '#fff') : g.bottom && b.id !== 'chrome-android' && b.id !== 'pwa' ? (dark ? '#000' : '#fff') : pageBg;
    els.homeIndicator.className = `home-indicator ${d.platform}${d.tablet ? ' tablet' : ''}`;
    els.homeIndicator.style.background = inkOn(under);
  }

  // viewport
  const vpHeight = d.h - g.top - g.bottom;
  Object.assign(els.viewport.style, { top: `${g.top}px`, height: `${vpHeight}px` });
  layout.frameHeight = vpHeight - (prefs.kbBehavior === 'resize' ? overlap : 0);
  layoutFrame();

  const kbMsg = JSON.stringify({ shown: !!kbKind, overlap: prefs.kbBehavior === 'overlay' ? overlap : 0 });
  if (kbMsg !== lastKbMsg) {
    lastKbMsg = kbMsg;
    toFrame({ type: 'keyboard', ...JSON.parse(kbMsg) });
  }

  els.caption.textContent = [
    `${d.name} · ${d.w}×${d.h}`,
    b.id !== 'none' ? b.name : null,
    `viewport ${d.w}×${vpHeight}`,
    kbKind ? `keyboard ${kbHeight}px (covers ${overlap}px)` : null,
    dark ? 'dark' : 'light',
  ]
    .filter(Boolean)
    .join('  ·  ');

  fit();
}

function layoutFrame() {
  const overlay = prefs.kbBehavior === 'overlay';
  Object.assign(els.frame.style, {
    height: `${layout.frameHeight}px`,
    transform: overlay && pan ? `translateY(${-pan}px)` : '',
  });
}

function fit() {
  const w = els.deviceEl.offsetWidth;
  const h = els.deviceEl.offsetHeight;
  const avail = { w: els.canvas.clientWidth - 48, h: els.canvas.clientHeight - 48 };
  const scale = prefs.zoom === 'fit' ? Math.min(1, avail.w / w, avail.h / h) : Number(prefs.zoom);
  els.deviceEl.style.transform = `scale(${scale})`;
  Object.assign(els.scaler.style, { width: `${w * scale}px`, height: `${h * scale}px` });
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function segment(el, value, onPick) {
  el.querySelectorAll('button').forEach((btn) => btn.classList.toggle('on', btn.dataset.v === String(value)));
  el.onclick = (e) => {
    const btn = e.target.closest('button');
    if (btn && !btn.disabled) onPick(btn.dataset.v);
  };
}

function renderControls() {
  const d = device();
  els.device.value = prefs.deviceId;
  els.customSize.hidden = !d.custom;
  els.customW.value = prefs.customW;
  els.customH.value = prefs.customH;

  const list = BROWSERS[d.platform];
  els.browserGroup.hidden = list.length < 2;
  els.browser.innerHTML = list.map((b) => `<button data-v="${b.id}">${b.name}</button>`).join('');
  segment(els.browser, browser().id, (v) => {
    prefs.browser[d.platform] = v;
    apply();
  });

  segment(els.theme, prefs.theme, (v) => {
    prefs.theme = v;
    apply();
  });

  els.kbSection.hidden = d.platform === 'desktop';
  els.kbMode.value = prefs.kbMode;
  segment(els.kbBehavior, prefs.kbBehavior, (v) => {
    prefs.kbBehavior = v;
    apply();
  });
  segment(els.zoom, prefs.zoom, (v) => {
    prefs.zoom = v;
    apply();
  });
  renderNotes();
}

function renderAddress() {
  els.origin.textContent = server.target || 'No server selected';
  if (document.activeElement !== els.path) els.path.value = page.path;
  els.openTab.href = server.target ? server.target + page.path : '#';
  document.title = page.title ? `${page.title} — DeView` : 'DeView';
}

const ENGINE = (() => {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'gecko';
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'blink';
  if (/Safari\//.test(ua)) return 'webkit';
  return 'unknown';
})();

function renderNotes() {
  const d = device();
  const notes = [];
  if (d.platform === 'ios' && ENGINE !== 'webkit')
    notes.push(['Rendering with your browser’s engine (not WebKit). Open DeView in Safari for rendering that matches iOS.', '']);
  if (d.platform === 'android' && ENGINE !== 'blink')
    notes.push(['Open DeView in Chrome for Blink rendering that matches Android.', '']);
  if (d.platform !== 'desktop' && page.viewport === null)
    notes.push(['This page has no <meta name="viewport">. Real phones would lay it out at 980px wide and zoom out.', 'warn']);
  if (browser().id === 'pwa' && d.platform === 'ios' && !page.cover)
    notes.push(['No viewport-fit=cover, so the app sits below the status bar and safe-area insets are 0.', '']);
  els.notes.innerHTML = notes.map(([t, cls]) => `<p class="${cls}"></p>`).join('');
  els.notes.querySelectorAll('p').forEach((p, i) => (p.textContent = notes[i][0]));
}

function initControls() {
  const groups = { ios: 'iPhone & iPad', android: 'Android', desktop: 'Desktop' };
  els.device.innerHTML = Object.entries(groups)
    .map(([platform, label]) => `<optgroup label="${label}">${DEVICES.filter((d) => d.platform === platform).map((d) => `<option value="${d.id}">${d.name}</option>`).join('')}</optgroup>`)
    .join('');
  els.device.onchange = () => {
    prefs.deviceId = els.device.value;
    apply();
  };
  const onCustom = () => {
    prefs.customW = +els.customW.value || 768;
    prefs.customH = +els.customH.value || 1024;
    apply();
  };
  els.customW.onchange = onCustom;
  els.customH.onchange = onCustom;

  els.kbMode.innerHTML =
    '<option value="auto">Show when an input is focused</option><option value="off">Never show</option>' +
    `<optgroup label="Always show">${KEYBOARD_KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</optgroup>`;
  els.kbMode.onchange = () => {
    prefs.kbMode = els.kbMode.value;
    if (!['auto', 'off'].includes(prefs.kbMode)) prefs.lastKbKind = prefs.kbMode;
    apply();
  };
  els.keyboard.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the app
  els.keyboard.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="done"]')) return;
    toFrame({ type: 'dismiss' });
    if (prefs.kbMode !== 'auto') {
      prefs.kbMode = 'auto'; // a forced keyboard would otherwise stay up
      apply();
    }
  });

  els.targetForm.onsubmit = (e) => {
    e.preventDefault();
    if (els.target.value.trim()) connect(els.target.value);
  };
  els.pickerForm.onsubmit = (e) => {
    e.preventDefault();
    if (els.pickerUrl.value.trim()) connect(els.pickerUrl.value);
  };
  els.scan.onclick = openPicker;
  els.pickerRefresh.onclick = openPicker;
  els.pickerClose.onclick = closePicker;

  els.pathForm.onsubmit = (e) => {
    e.preventDefault();
    page.path = els.path.value.trim() || '/';
    loadFrame();
    els.path.blur();
  };
  els.reload.onclick = () => loadFrame();
  els.back.onclick = () => toFrame({ type: 'history', delta: -1 });
  els.fwd.onclick = () => toFrame({ type: 'history', delta: 1 });

  new ResizeObserver(fit).observe(els.canvas);
  systemDark.addEventListener('change', () => apply());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.picker.hidden) return closePicker();
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.nodeName)) return;
    const key = e.key.toLowerCase();
    if (key === 'd') {
      prefs.theme = isDark() ? 'light' : 'dark';
      apply();
    } else if (key === 'k' && device().platform !== 'desktop') {
      prefs.kbMode = ['auto', 'off'].includes(prefs.kbMode) ? prefs.lastKbKind : 'auto';
      apply();
    } else if (key === 'r') {
      loadFrame();
    } else if (key === '[' || key === ']') {
      const i = DEVICES.findIndex((x) => x.id === prefs.deviceId);
      prefs.deviceId = DEVICES[(i + (key === ']' ? 1 : -1) + DEVICES.length) % DEVICES.length].id;
      apply();
    } else return;
    e.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Server picker
// ---------------------------------------------------------------------------

async function connect(target) {
  await pushState({ target });
  page.path = prefs.path = server.path;
  els.target.value = server.target;
  renderAddress();
  closePicker();
  loadFrame();
}

function closePicker() {
  if (server.target) els.picker.hidden = true; // nothing to show behind it otherwise
}

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text ?? '' });

async function openPicker() {
  els.picker.hidden = false;
  els.pickerClose.hidden = !server.target;
  els.pickerList.replaceChildren(el('div', 'muted', 'Scanning local ports…'));
  const found = await fetch('/api/scan').then((r) => r.json());
  if (!found.length) return els.pickerList.replaceChildren(el('div', 'muted', 'No local servers serving a web page. Start your dev server and hit Refresh.'));
  els.pickerList.replaceChildren(
    ...found.map((s) => {
      const row = el('button', `server-row${s.url === server.target ? ' current' : ''}`);
      row.type = 'button';
      const info = el('div');
      info.append(el('div', 'name', s.title || s.name || s.url), el('div', 'path', `\u200e${s.path || s.url}\u200e`));
      if (s.path) info.lastChild.title = s.path;
      row.append(el('span', 'port', `:${s.port}`), info, el('span', 'cmd', s.command || ''));
      row.onclick = () => connect(s.url);
      return row;
    }),
  );
  els.pickerList.querySelector('.server-row')?.focus();
}

// ---------------------------------------------------------------------------

(async function boot() {
  initControls();
  server = await fetch('/api/state').then((r) => r.json());
  proxyOrigin = `${location.protocol}//${location.hostname}:${server.proxyPort}`;
  els.target.value = server.target || '';
  if (server.target && server.target !== prefs.target) page.path = prefs.path = server.path; // new target from the CLI
  renderAddress();
  apply({ reload: true });
  if (!server.target) openPicker();
})();
