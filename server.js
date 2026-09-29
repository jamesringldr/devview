#!/usr/bin/env node
// DeView — device preview shell + injecting proxy for local dev servers.
//
//   shell  http://localhost:4400   the device-frame UI
//   proxy  http://localhost:4401   your dev server, with the DeView client injected into HTML
//
// Usage: node server.js [target] [--port 4400] [--open]
//   target: a port (3000), a local URL (http://localhost:3000), or any site (example.com/pricing).
//   Without a target, the shell opens a picker listing local servers.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const CLIENT_FILE = path.join(ROOT, 'client', 'inject.js');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const SHELL_PORT = Number(flag('--port') || process.env.DEVIEW_PORT || 4400);
const PROXY_PORT = SHELL_PORT + 1;
const OPEN = args.includes('--open') && args.splice(args.indexOf('--open'), 1);
// Fallback when lsof is unavailable.
const SCAN_PORTS = [3000, 3001, 3002, 4173, 4200, 4321, 5000, 5173, 5174, 5175, 6006, 8000, 8080, 8081, 8888, 19006];

// → URL. Without a scheme, local hosts (localhost, IPs, dotless names) get http, anything else https.
function parseTarget(t) {
  t = String(t).trim();
  if (/^\d+$/.test(t)) t = `localhost:${t}`;
  if (!/^https?:\/\//.test(t)) {
    const host = t.split(/[/:?#]/)[0];
    const local = !host.includes('.') || /\.(localhost|local)$/.test(host) || /^[\d.]+$/.test(host);
    t = `${local ? 'http' : 'https'}://${t}`;
  }
  return new URL(t);
}

function setTarget(t) {
  const u = parseTarget(t);
  state.target = u.origin;
  state.path = u.pathname + u.search + u.hash; // where the shell starts the frame
}

// Shared state. The shell POSTs here; the proxy reads it when injecting into HTML
// and when rewriting request headers (user agent).
const state = {
  target: null, // null → shell shows the picker
  path: '/',
  config: {
    theme: 'system', // 'light' | 'dark' | 'system'
    ua: null,
    platform: 'desktop', // 'ios' | 'android' | 'desktop'
    mobile: false,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
};
const START = args[0] || process.env.DEVIEW_TARGET;
if (START) setTarget(START);

// ---------------------------------------------------------------------------
// Shell server
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function probe(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port, path: '/', timeout: 600 }, (res) => {
      const isHtml = /text\/html/.test(res.headers['content-type'] || '');
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        if (body.length < 4096) body += c;
      });
      res.on('end', () => {
        const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
        resolve(isHtml && res.statusCode < 500 ? { url: `http://localhost:${port}`, port, title: title?.trim() || null } : null);
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

const run = (cmd, argv) => promisify(execFile)(cmd, argv).catch((e) => ({ stdout: e.stdout || '' })); // lsof exits 1 on partial results

// Every listening TCP port → { port, pid, command }.
async function listeners() {
  const { stdout } = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']);
  const byPort = new Map();
  let pid, command;
  for (const line of stdout.split('\n')) {
    const val = line.slice(1);
    if (line[0] === 'p') pid = Number(val);
    else if (line[0] === 'c') command = val;
    else if (line[0] === 'n') {
      const port = Number(val.slice(val.lastIndexOf(':') + 1));
      if (port && !byPort.has(port)) byPort.set(port, { port, pid, command });
    }
  }
  if (!byPort.size) throw new Error('lsof unavailable');
  return [...byPort.values()];
}

// pid → working directory (the project folder the dev server was started from)
async function workingDirs(pids) {
  const dirs = new Map();
  if (!pids.length) return dirs;
  const { stdout } = await run('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]);
  let pid;
  for (const line of stdout.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n') dirs.set(pid, line.slice(1));
  }
  return dirs;
}

// Local servers that answer with an HTML page, with the folder they run from.
async function scanServers() {
  const list = (await listeners().catch(() => SCAN_PORTS.map((port) => ({ port })))).filter((l) => l.port !== SHELL_PORT && l.port !== PROXY_PORT);
  const pages = (await Promise.all(list.map(async (l) => ({ ...l, ...(await probe(l.port)) })))).filter((s) => s.url);
  const dirs = await workingDirs([...new Set(pages.map((s) => s.pid).filter(Boolean))]);
  return pages
    .map((s) => {
      const cwd = dirs.get(s.pid) || null;
      let name = cwd ? path.basename(cwd) : null;
      try {
        name = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).name || name;
      } catch {}
      return { url: s.url, port: s.port, title: s.title, command: s.command || null, name, path: cwd && cwd.replace(os.homedir(), '~') };
    })
    .sort((a, b) => a.port - b.port);
}

const shell = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/state') {
    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        if (body.target) setTarget(body.target);
        if (body.config) Object.assign(state.config, body.config);
      } catch (e) {
        return sendJson(res, 400, { error: String(e.message || e) });
      }
    }
    return sendJson(res, 200, { ...state, proxyPort: PROXY_PORT });
  }

  if (url.pathname === '/api/scan') {
    return sendJson(res, 200, await scanServers());
  }

  const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Proxy server
// ---------------------------------------------------------------------------

function targetInfo() {
  const t = new URL(state.target);
  const secure = t.protocol === 'https:';
  return { t, secure, port: Number(t.port) || (secure ? 443 : 80) };
}

function injectClient(html) {
  const config = JSON.stringify(state.config).replace(/</g, '\\u003c');
  const tag = `<script data-deview>window.__DEVIEW__=${config};\n${fs.readFileSync(CLIENT_FILE, 'utf8')}</script>`;
  for (const re of [/<head\b[^>]*>/i, /<html\b[^>]*>/i]) {
    const m = html.match(re);
    if (m) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length);
  }
  return tag + html;
}

function decode(buf, encoding) {
  switch ((encoding || '').trim()) {
    case 'gzip': return zlib.gunzipSync(buf);
    case 'br': return zlib.brotliDecompressSync(buf);
    case 'deflate': return zlib.inflateSync(buf);
    default: return buf;
  }
}

function rewriteRequestHeaders(headers, proxyOrigin) {
  const { t } = targetInfo();
  const h = { ...headers, host: t.host };
  delete h['accept-encoding']; // keep HTML uncompressed so we can inject
  if (h.origin) h.origin = t.origin;
  if (h.referer) h.referer = h.referer.replace(proxyOrigin, t.origin);
  const { ua, platform } = state.config;
  if (ua) {
    h['user-agent'] = ua;
    if (platform === 'android') {
      h['sec-ch-ua-mobile'] = '?1';
      h['sec-ch-ua-platform'] = '"Android"';
    } else {
      // Safari sends no client hints
      for (const k of Object.keys(h)) if (k.startsWith('sec-ch-ua')) delete h[k];
    }
  }
  return h;
}

function errorPage(target, err) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeView — can't reach ${target}</title>
<style>
  :root{color-scheme:light dark;font:15px/1.45 system-ui,sans-serif}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center;color:#6b7280}
  b{color:CanvasText} code{font-size:13px}
</style>
<div><b>Can't reach <code>${target}</code></b><p>${String(err).replace(/</g, '&lt;')}</p><p>Retrying…</p></div>
<script>setTimeout(()=>location.reload(),1500)</script>`;
}

const proxy = http.createServer((req, res) => {
  if (!state.target) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('DeView: nothing selected yet. Pick a server or enter a URL in the DeView window.');
  }
  const { t, secure, port } = targetInfo();
  const proxyOrigin = `http://${req.headers.host}`;
  const upstream = (secure ? https : http).request(
    {
      hostname: t.hostname,
      port,
      method: req.method,
      path: req.url,
      headers: rewriteRequestHeaders(req.headers, proxyOrigin),
      rejectUnauthorized: false, // dev servers commonly use self-signed certs
    },
    (up) => {
      const h = { ...up.headers };
      delete h['x-frame-options'];
      delete h['content-security-policy'];
      delete h['content-security-policy-report-only'];
      // Cookies scoped to the real domain would be rejected on localhost.
      if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].map((c) => c.replace(/;\s*domain=[^;]*/i, ''));

      const dest = req.headers['sec-fetch-dest'];
      const isDocument = !dest || dest === 'document' || dest === 'iframe';
      if (h.location) {
        const loc = new URL(h.location, t.origin);
        // Follow http→https and apex↔www redirects by switching target, so the frame stays on the proxy.
        const site = (u) => u.hostname.replace(/^www\./, '');
        if (isDocument && loc.origin !== t.origin && /^https?:$/.test(loc.protocol) && site(loc) === site(t)) state.target = loc.origin;
        if (loc.origin === state.target) h.location = proxyOrigin + loc.pathname + loc.search + loc.hash;
      }
      const isHtml = /text\/html/.test(h['content-type'] || '');
      if (!isHtml || !isDocument || req.method === 'HEAD' || up.statusCode === 204 || up.statusCode === 304) {
        res.writeHead(up.statusCode, h);
        return up.pipe(res);
      }

      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        let html;
        try {
          html = decode(Buffer.concat(chunks), h['content-encoding']).toString('utf8');
        } catch {
          res.writeHead(up.statusCode, h);
          return res.end(Buffer.concat(chunks));
        }
        // Absolute links to the site itself would navigate the frame off the proxy.
        const body = Buffer.from(injectClient(html.replaceAll(t.origin, proxyOrigin)), 'utf8');
        delete h['content-encoding'];
        delete h['transfer-encoding'];
        delete h['etag'];
        h['content-length'] = body.length;
        h['cache-control'] = 'no-store';
        res.writeHead(up.statusCode, h);
        res.end(body);
      });
    },
  );
  upstream.on('error', (err) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(errorPage(state.target, err.code || err.message));
  });
  req.pipe(upstream);
});

// WebSockets (Vite / Next / webpack HMR): raw TCP pipe with Host + Origin rewritten.
proxy.on('upgrade', (req, socket, head) => {
  if (!state.target) return socket.destroy();
  const { t, secure, port } = targetInfo();
  const conn = secure
    ? tls.connect({ host: t.hostname, port, servername: t.hostname, rejectUnauthorized: false })
    : net.connect({ host: t.hostname, port });

  conn.once(secure ? 'secureConnect' : 'connect', () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i];
      let value = req.rawHeaders[i + 1];
      if (/^host$/i.test(name)) value = t.host;
      else if (/^origin$/i.test(name)) value = t.origin;
      raw += `${name}: ${value}\r\n`;
    }
    conn.write(raw + '\r\n');
    if (head?.length) conn.write(head);
    socket.pipe(conn).pipe(socket);
  });
  const close = () => {
    socket.destroy();
    conn.destroy();
  };
  conn.on('error', close);
  socket.on('error', close);
});

const SHELL_URL = `http://localhost:${SHELL_PORT}`;
const openShell = () => OPEN && spawn('open', [SHELL_URL], { stdio: 'ignore', detached: true }).unref();

// Port taken: if it's another DeView, reuse it (switching target if one was given) instead of crashing.
async function onListenError(err) {
  if (err.code !== 'EADDRINUSE') throw err;
  try {
    const running = await fetch(`${SHELL_URL}/api/state`, START ? { method: 'POST', body: JSON.stringify({ target: START }) } : {}).then((r) => r.json());
    if (!running.proxyPort) throw new Error();
    console.log(`\n  DeView is already running at ${SHELL_URL}${state.target ? ` — switched to ${state.target}` : ''}\n`);
    openShell();
    process.exit(0);
  } catch {
    console.error(`\n  Port ${err.port} is in use by another app. Try: node server.js --port ${SHELL_PORT + 10}\n`);
    process.exit(1);
  }
}
shell.on('error', onListenError);
proxy.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\n  Proxy port ${PROXY_PORT} is in use by another app. Try: node server.js --port ${SHELL_PORT + 10}\n`);
  process.exit(1);
});

shell.listen(SHELL_PORT, () => {
  proxy.listen(PROXY_PORT, () => {
    console.log(`\n  DeView  ${SHELL_URL}\n  proxy   http://localhost:${PROXY_PORT} → ${state.target || '(pick a server in the browser)'}\n`);
    openShell();
  });
});
