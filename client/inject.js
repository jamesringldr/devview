// DeView client — injected by the proxy into every HTML document of the app under preview.
// Talks to the DeView shell (window.parent) over postMessage.
(() => {
  if (window.__DEVIEW_CLIENT__) return;
  window.__DEVIEW_CLIENT__ = true;

  let config = window.__DEVIEW__ || {};
  const post = (type, data = {}) => {
    if (window.parent !== window) window.parent.postMessage({ __deview: true, type, ...data }, '*');
  };

  // -------------------------------------------------------------------------
  // Media feature overrides: prefers-color-scheme, hover, pointer
  // -------------------------------------------------------------------------

  const TRUE_Q = '(min-width: 0px)';
  const FALSE_Q = '(max-width: 0px)';
  const FEATURE = /\(\s*(prefers-color-scheme|any-hover|hover|any-pointer|pointer)\s*(?::\s*([a-z-]+)\s*)?\)/gi;
  const HAS_FEATURE = /\(\s*(prefers-color-scheme|any-hover|hover|any-pointer|pointer)\b/i;

  function featureValue(name) {
    if (name === 'prefers-color-scheme') return config.theme === 'light' || config.theme === 'dark' ? config.theme : null;
    if (!config.mobile) return null;
    return name.endsWith('hover') ? 'none' : 'coarse';
  }

  function rewriteMedia(text) {
    return text.replace(FEATURE, (m, name, value) => {
      const v = featureValue(name.toLowerCase());
      if (v == null) return m;
      const matches = value ? value.toLowerCase() === v : v !== 'none';
      return matches ? TRUE_Q : FALSE_Q;
    });
  }

  const nativeMatchMedia = window.matchMedia.bind(window);
  const prefersDark = () => nativeMatchMedia(rewriteMedia('(prefers-color-scheme: dark)')).matches;

  // -------------------------------------------------------------------------
  // Declaration rewrites: env(safe-area-inset-*) and `color-scheme: light dark`
  // -------------------------------------------------------------------------

  function replaceSafeArea(css) {
    const re = /env\(\s*safe-area-inset-(top|right|bottom|left)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(css))) {
      let depth = 0;
      let j = m.index + 3; // at "("
      for (; j < css.length; j++) {
        if (css[j] === '(') depth++;
        else if (css[j] === ')' && --depth === 0) break;
      }
      out += css.slice(last, m.index) + ((config.insets && config.insets[m[1]]) || 0) + 'px';
      last = j + 1;
      re.lastIndex = last;
    }
    return out + css.slice(last);
  }

  function replaceColorScheme(value) {
    const forced = featureValue('prefers-color-scheme');
    if (!forced || /\bonly\b/.test(value) || !/\blight\b/.test(value) || !/\bdark\b/.test(value)) return value;
    return forced;
  }

  function rewriteDecls(css) {
    css = replaceSafeArea(css);
    return css.replace(/(^|[;{\s])color-scheme\s*:\s*([^;!}]+)/g, (m, pre, v) => {
      const next = replaceColorScheme(v.trim());
      return next === v.trim() ? m : pre + 'color-scheme: ' + next + ' ';
    });
  }

  // -------------------------------------------------------------------------
  // Stylesheet walker. Originals are remembered so every pass rewrites from source.
  // -------------------------------------------------------------------------

  const mediaRecs = new WeakMap(); // MediaList -> { orig, applied } | false
  const styleRecs = new WeakMap(); // CSSStyleDeclaration -> { orig, applied } | false

  function applyMediaList(list) {
    let rec = mediaRecs.get(list);
    if (rec === undefined) {
      const orig = list.mediaText;
      rec = HAS_FEATURE.test(orig) ? { orig, applied: orig } : false;
      mediaRecs.set(list, rec);
    }
    if (!rec) return;
    const next = rewriteMedia(rec.orig);
    if (next !== rec.applied) {
      list.mediaText = next;
      rec.applied = next;
    }
  }

  function applyStyle(style) {
    let rec = styleRecs.get(style);
    if (rec === undefined) {
      const orig = style.cssText;
      rec = /safe-area-inset|color-scheme/.test(orig) ? { orig, applied: orig } : false;
      styleRecs.set(style, rec);
    }
    if (!rec) return;
    const next = rewriteDecls(rec.orig);
    if (next !== rec.applied) {
      style.cssText = next;
      rec.applied = next;
    }
  }

  function walkRules(rules) {
    for (const r of rules) {
      if (r.media) applyMediaList(r.media);
      if (r.style) applyStyle(r.style);
      if (r.styleSheet) processSheet(r.styleSheet);
      if (r.cssRules) walkRules(r.cssRules);
    }
  }

  function processSheet(sheet) {
    try {
      if (sheet.media) applyMediaList(sheet.media);
      walkRules(sheet.cssRules);
    } catch {
      // cross-origin stylesheet — can't read it
    }
  }

  function rewriteAttr(el, attr, fn) {
    const key = 'deviewOrig' + attr[0].toUpperCase() + attr.slice(1);
    if (el.dataset[key] === undefined) el.dataset[key] = el.getAttribute(attr) || '';
    const next = fn(el.dataset[key]);
    if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
  }

  function processAll() {
    for (const s of document.styleSheets) processSheet(s);
    for (const s of document.adoptedStyleSheets || []) processSheet(s);
    document.querySelectorAll('source[media]').forEach((el) => rewriteAttr(el, 'media', rewriteMedia));
    document.querySelectorAll('meta[name="color-scheme"]').forEach((el) => rewriteAttr(el, 'content', replaceColorScheme));
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      processAll();
      reportSoon();
    });
  }

  new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target;
      if (r.type === 'characterData' ? t.parentNode?.nodeName === 'STYLE' : t.nodeName === 'STYLE' || [...r.addedNodes].some((n) => /^(STYLE|LINK|SOURCE|META)$/.test(n.nodeName))) {
        return schedule();
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('load', (e) => e.target.nodeName === 'LINK' && schedule(), true);
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);

  // -------------------------------------------------------------------------
  // matchMedia override — so JS theme libraries (next-themes etc.) follow too
  // -------------------------------------------------------------------------

  const fakeLists = new Set();
  class DeviewMediaQueryList extends EventTarget {
    constructor(q) {
      super();
      this._q = q;
      this.onchange = null;
      this._last = this.matches;
      fakeLists.add(this);
    }
    get media() {
      return nativeMatchMedia(this._q).media;
    }
    get matches() {
      return nativeMatchMedia(rewriteMedia(this._q)).matches;
    }
    addListener(fn) {
      this.addEventListener('change', fn);
    }
    removeListener(fn) {
      this.removeEventListener('change', fn);
    }
    _check() {
      const matches = this.matches;
      if (matches === this._last) return;
      this._last = matches;
      const ev = new MediaQueryListEvent('change', { matches, media: this.media });
      if (typeof this.onchange === 'function') this.onchange.call(this, ev);
      this.dispatchEvent(ev);
    }
  }
  window.matchMedia = function matchMedia(q) {
    q = String(q);
    return HAS_FEATURE.test(q) ? new DeviewMediaQueryList(q) : nativeMatchMedia(q);
  };
  const checkLists = () => fakeLists.forEach((l) => l._check());
  window.addEventListener('resize', checkLists);
  nativeMatchMedia('(prefers-color-scheme: dark)').addEventListener('change', checkLists);

  // -------------------------------------------------------------------------
  // Navigator overrides (UA, touch). A UA change reloads the frame, so this runs once.
  // -------------------------------------------------------------------------

  if (config.ua) {
    const def = (obj, k, v) => {
      try {
        Object.defineProperty(obj, k, { get: () => v, configurable: true });
      } catch {}
    };
    const ios = config.platform === 'ios';
    def(navigator, 'userAgent', config.ua);
    def(navigator, 'appVersion', config.ua.replace(/^Mozilla\//, ''));
    def(navigator, 'vendor', ios ? 'Apple Computer, Inc.' : 'Google Inc.');
    def(navigator, 'platform', ios ? (/iPhone/.test(config.ua) ? 'iPhone' : 'MacIntel') : 'Linux armv81');
    def(navigator, 'maxTouchPoints', config.mobile ? 5 : 0);
    if ('userAgentData' in navigator) {
      def(
        navigator,
        'userAgentData',
        ios
          ? undefined
          : {
              brands: [{ brand: 'Chromium', version: '140' }, { brand: 'Google Chrome', version: '140' }],
              mobile: true,
              platform: 'Android',
              getHighEntropyValues: async () => ({ mobile: true, platform: 'Android', model: '' }),
              toJSON() {
                return { brands: this.brands, mobile: true, platform: 'Android' };
              },
            },
      );
    }
  }

  // Phones don't show persistent scrollbars.
  const scrollbarStyle = document.createElement('style');
  scrollbarStyle.setAttribute('data-deview', '');
  const applyScrollbars = () => {
    scrollbarStyle.textContent = config.mobile ? '*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}' : '';
    if (!scrollbarStyle.isConnected) document.documentElement.appendChild(scrollbarStyle);
  };
  applyScrollbars();

  // -------------------------------------------------------------------------
  // Keyboard: focus detection, visualViewport shim, iOS-style panning
  // -------------------------------------------------------------------------

  const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'number', 'password']);
  const INPUT_MODES = new Set(['text', 'search', 'email', 'url', 'tel', 'numeric', 'decimal']);

  function keyboardKind(el) {
    if (!el || el.disabled || el.readOnly) return null;
    const mode = (el.getAttribute('inputmode') || '').toLowerCase();
    if (mode === 'none') return null;
    let kind;
    if (el.isContentEditable || el.nodeName === 'TEXTAREA') kind = 'text';
    else if (el.nodeName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (!TEXT_TYPES.has(type)) return null;
      kind = type === 'password' ? 'text' : type;
    } else return null;
    return INPUT_MODES.has(mode) ? mode : kind;
  }

  let kbShown = false;
  let kbOverlap = 0; // px of the layout viewport covered by the keyboard
  let panY = 0; // iOS pans the whole page up when it can't scroll the input into view

  const vv = window.visualViewport;
  if (vv) {
    const proto = Object.getPrototypeOf(vv);
    const nativeGet = (k) => Object.getOwnPropertyDescriptor(proto, k).get;
    const height = nativeGet('height');
    const offsetTop = nativeGet('offsetTop');
    const pageTop = nativeGet('pageTop');
    Object.defineProperty(vv, 'height', { get: () => height.call(vv) - kbOverlap, configurable: true });
    Object.defineProperty(vv, 'offsetTop', { get: () => offsetTop.call(vv) + panY, configurable: true });
    Object.defineProperty(vv, 'pageTop', { get: () => pageTop.call(vv) + panY, configurable: true });
  }
  const fireViewport = () => {
    vv?.dispatchEvent(new Event('resize'));
    vv?.dispatchEvent(new Event('scroll'));
  };

  function setPan(p) {
    if (p === panY) return;
    panY = p;
    post('pan', { pan: p });
  }

  function ensureVisible() {
    const el = document.activeElement;
    if (!kbShown || !keyboardKind(el)) return setPan(0);
    const visibleBottom = window.innerHeight - kbOverlap;
    let need = el.getBoundingClientRect().bottom + 16 - visibleBottom;
    for (let p = el.parentElement; p && need > 0 && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
        const before = p.scrollTop;
        p.scrollTop += need;
        need -= p.scrollTop - before;
      }
    }
    if (need > 0) {
      const before = window.scrollY;
      window.scrollTo({ top: before + need, behavior: 'instant' });
      need -= window.scrollY - before;
    }
    setPan(Math.round(Math.max(0, Math.min(need, kbOverlap))));
  }

  let blurTimer;
  document.addEventListener('focusin', (e) => {
    const kind = keyboardKind(e.target);
    if (!kind) return;
    clearTimeout(blurTimer);
    post('focus', {
      kind,
      hint: (e.target.getAttribute('enterkeyhint') || '').toLowerCase(),
      multiline: e.target.nodeName === 'TEXTAREA' || e.target.isContentEditable,
    });
  });
  document.addEventListener('focusout', () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (!keyboardKind(document.activeElement)) post('blur');
    }, 60);
  });
  window.addEventListener('resize', () => kbShown && ensureVisible());

  // -------------------------------------------------------------------------
  // Reporting to the shell: path, title, colors for browser-chrome tinting
  // -------------------------------------------------------------------------

  const isTransparent = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);

  function snapshot() {
    let themeColor = null;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      const media = m.getAttribute('media');
      if (!media || window.matchMedia(media).matches) {
        themeColor = m.getAttribute('content');
        break;
      }
    }
    let bg = document.body ? getComputedStyle(document.body).backgroundColor : null;
    if (isTransparent(bg)) bg = getComputedStyle(document.documentElement).backgroundColor;
    const scheme = getComputedStyle(document.documentElement).colorScheme || '';
    const canvasDark = /\bdark\b/.test(scheme) && (!/\blight\b/.test(scheme) || prefersDark());
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null;
    return {
      path: location.pathname + location.search + location.hash,
      title: document.title,
      themeColor,
      bg: isTransparent(bg) ? null : bg,
      canvasDark,
      viewport,
      cover: /viewport-fit\s*=\s*cover/i.test(viewport || ''),
    };
  }

  let reportTimer;
  function reportSoon() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => post('state', snapshot()), 30);
  }
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k];
    history[k] = function (...a) {
      const r = orig.apply(this, a);
      reportSoon();
      return r;
    };
  }
  window.addEventListener('popstate', reportSoon);
  window.addEventListener('hashchange', reportSoon);
  window.addEventListener('load', reportSoon);
  document.addEventListener('DOMContentLoaded', () => {
    reportSoon();
    // theme toggles are usually a class/attribute on <html> or <body>
    const mo = new MutationObserver(reportSoon);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    const title = document.querySelector('title');
    if (title) mo.observe(title, { childList: true, characterData: true, subtree: true });
  });

  // -------------------------------------------------------------------------
  // Messages from the shell
  // -------------------------------------------------------------------------

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || !e.data.__deview) return;
    const msg = e.data;
    if (msg.type === 'config') {
      config = { ...config, ...msg.config };
      processAll();
      checkLists();
      applyScrollbars();
      reportSoon();
    } else if (msg.type === 'history') {
      history.go(msg.delta);
    } else if (msg.type === 'keyboard') {
      kbShown = msg.shown;
      kbOverlap = msg.shown ? msg.overlap : 0;
      requestAnimationFrame(() => {
        ensureVisible();
        fireViewport();
      });
    }
  });

  processAll();
  post('hello', snapshot());
})();
