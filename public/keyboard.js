// Visual-only software keyboards (iOS + Gboard). Layout picked from the focused
// element's type / inputmode, return key from enterkeyhint.

const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

const ICON = {
  shift: svg('<path d="M12 4 4 12h4.5v7h7v-7H20z"/>'),
  del: svg('<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="m11.5 9.5 5 5m0-5-5 5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9S9.5 5.7 12 3z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  emoji: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>'),
  enter: svg('<path d="M19 6v6H6m0 0 4-4m-4 4 4 4"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>'),
  go: svg('<path d="M5 12h14m-5-5 5 5-5 5"/>'),
  send: svg('<path d="M4 20 21 12 4 4l2.5 8zM6.5 12H13"/>'),
  next: svg('<path d="M4 12h12m-4-4 4 4-4 4M20 6v12"/>'),
  done: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  chevUp: svg('<path d="m6 15 6-6 6 6"/>'),
  chevDown: svg('<path d="m6 9 6 6 6-6"/>'),
  space: svg('<path d="M4 10v4h16v-4"/>'),
};

const k = (label, cls = '', flex = 1) => `<span class="k ${cls}" style="flex:${flex}">${label}</span>`;
const gap = (flex) => `<span class="k-gap" style="flex:${flex}"></span>`;
const row = (keys, cls = '') => `<div class="kb-row ${cls}">${keys.join('')}</div>`;
const letters = (s) => [...s].map((c) => k(c));

const PAD = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
];
const padKey = ([d, sub], showLetters, cls = '') =>
  `<span class="k pad ${cls}"><b>${d}</b>${showLetters && sub ? `<small>${sub}</small>` : ''}</span>`;

function iosReturn(kind, hint, multiline) {
  if (multiline) return { label: 'return', blue: false };
  const h = hint || (kind === 'search' ? 'search' : kind === 'url' ? 'go' : '');
  const label = { done: 'done', go: 'go', next: 'next', search: 'search', send: 'send' }[h] || 'return';
  return { label, blue: ['done', 'go', 'search', 'send'].includes(label) };
}

function androidReturn(kind, hint, multiline) {
  if (multiline) return ICON.enter;
  const h = hint || (kind === 'search' ? 'search' : kind === 'url' ? 'go' : '');
  return { done: ICON.done, go: ICON.go, next: ICON.next, search: ICON.search, send: ICON.send }[h] || ICON.enter;
}

function iosKeyboard({ kind, hint, multiline, accessory, home }) {
  const ret = iosReturn(kind, hint, multiline);
  const retKey = k(ret.label, `fn ret ${ret.blue ? 'blue' : ''}`, 2.4);
  const bottomStrip = home ? `<div class="kb-strip"><span>${ICON.globe}</span><span>${ICON.mic}</span></div>` : '';
  const extraFn = home ? [k(ICON.emoji, 'fn', 1.2)] : [k(ICON.globe, 'fn', 1.2)];
  const acc = accessory
    ? `<div class="kb-accessory"><span>${ICON.chevUp}</span><span>${ICON.chevDown}</span><i></i><b>Done</b></div>`
    : '';

  let body;
  if (['numeric', 'decimal', 'tel'].includes(kind)) {
    const corner = kind === 'decimal' ? padKey(['.', ''], false) : kind === 'tel' ? padKey(['+*#', ''], false, 'clear') : '<span class="k pad clear"></span>';
    const zero = padKey(['0', kind === 'tel' ? '+' : ''], true);
    body = `<div class="kb-pad" style="padding-bottom:${home}px">${PAD.map((p) => padKey(p, kind !== 'decimal')).join('')}${corner}${zero}<span class="k pad clear">${ICON.del}</span></div>`;
  } else {
    const suggest = `<div class="kb-suggest"><span>“I”</span><i></i><span>The</span><i></i><span>I'm</span></div>`;
    let rows;
    if (kind === 'number') {
      rows = [
        row(letters('1234567890')),
        row(letters('-/:;()$&@"')),
        row([k('#+=', 'fn', 1.35), gap(0.2), ...[...".,?!'"].map((c) => k(c, '', 1.4)), gap(0.2), k(ICON.del, 'fn', 1.35)]),
        row([k('ABC', 'fn', 1.2), ...extraFn, k('space', 'space', 5), retKey]),
      ];
    } else {
      const last =
        kind === 'email'
          ? [k('123', 'fn', 1.2), ...extraFn, k('space', 'space', 3.2), k('@'), k('.'), retKey]
          : kind === 'url'
            ? [k('123', 'fn', 1.2), ...extraFn, k('.'), k('/'), k('.com', '', 1.6), gap(0.6), retKey]
            : [k('123', 'fn', 1.2), ...extraFn, k('space', 'space', 5), retKey];
      rows = [
        row(letters('qwertyuiop')),
        row([gap(0.5), ...letters('asdfghjkl'), gap(0.5)]),
        row([k(ICON.shift, 'fn', 1.35), gap(0.2), ...letters('zxcvbnm'), gap(0.2), k(ICON.del, 'fn', 1.35)]),
        row(last),
      ];
    }
    body = `${suggest}<div class="kb-keys">${rows.join('')}</div>${bottomStrip}<div style="height:${home ? home - 12 : 0}px"></div>`;
  }
  return `${acc}<div class="kb-body">${body}</div>`;
}

function androidKeyboard({ kind, hint, multiline, home }) {
  const retKey = k(androidReturn(kind, hint, multiline), 'fn accent', 1.5);
  const nav = `<div class="kb-nav" style="height:${home}px"><span>${ICON.chevDown}</span></div>`;

  if (['number', 'numeric', 'decimal', 'tel'].includes(kind)) {
    const tel = kind === 'tel';
    const cell = (d, sub) => `<span class="k pad"><b>${d}</b>${tel && sub ? `<small>${sub}</small>` : ''}</span>`;
    const fn = (label) => `<span class="k fn pad">${label}</span>`;
    const keys = [
      cell('1'), cell('2', 'ABC'), cell('3', 'DEF'), fn('−'),
      cell('4', 'GHI'), cell('5', 'JKL'), cell('6', 'MNO'), fn(ICON.space),
      cell('7', 'PQRS'), cell('8', 'TUV'), cell('9', 'WXYZ'), fn(ICON.del),
      tel ? fn('* #') : fn(','), cell('0', '+'), fn('.'), `<span class="k fn accent pad">${androidReturn(kind, hint, multiline)}</span>`,
    ];
    return `<div class="kb-body"><div class="kb-pad four">${keys.join('')}</div></div>${nav}`;
  }

  const sym = kind === 'email' ? '@' : kind === 'url' ? '/' : ',';
  const rows = [
    row(letters('qwertyuiop')),
    row([gap(0.5), ...letters('asdfghjkl'), gap(0.5)]),
    row([k(ICON.shift, 'fn', 1.5), ...letters('zxcvbnm'), k(ICON.del, 'fn', 1.5)]),
    row([k('?123', 'fn', 1.5), k(sym, 'fn'), k(ICON.emoji, 'fn'), k('', 'space', 4), k('.', 'fn'), retKey]),
  ];
  const suggest = `<div class="kb-suggest"><span></span><i></i><span></span><i></i><span></span></div>`;
  return `<div class="kb-body">${suggest}<div class="kb-keys">${rows.join('')}</div></div>${nav}`;
}

export function renderKeyboard(el, opts) {
  el.className = `kb kb-${opts.platform}${opts.dark ? ' dark' : ''}${opts.tablet ? ' tablet' : ''}`;
  el.innerHTML = opts.platform === 'android' ? androidKeyboard(opts) : iosKeyboard(opts);
}

export const KEYBOARD_KINDS = [
  ['text', 'Text'],
  ['email', 'Email'],
  ['url', 'URL'],
  ['search', 'Search'],
  ['number', 'type=number'],
  ['numeric', 'Numeric pad'],
  ['decimal', 'Decimal pad'],
  ['tel', 'Phone pad'],
];
