#!/usr/bin/env node
// DeView — device preview shell + injecting proxy for local dev servers.
//
//   shell  http://localhost:4400   the device-frame UI
//   proxy  http://localhost:4401   your dev server, with the DeView client injected into HTML
//
// Usage: node server.js [target] [--port 4400] [--open]
//   target: a URL (http://localhost:3000) or just a port (3000). Default http://localhost:5173.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
const SCAN_PORTS = [3000, 3001, 3002, 4173, 4200, 4321, 5000, 5173, 5174, 5175, 6006, 8000, 8080, 8081, 8888, 19006];

function normalizeTarget(t) {
  if (!t) return null;
  t = String(t).trim();
  if (/^\d+$/.test(t)) return `http://localhost:${t}`;
  if (!/^https?:\/\//.test(t)) t = `http://${t}`;
  return new URL(t).origin;
}

// Shared state. The shell POSTs here; the proxy reads it when injecting into HTML
// and when rewriting request headers (user agent).
const state = {
  target: normalizeTarget(args[0] || process.env.DEVIEW_TARGET) || 'http://localhost:5173',
  config: {
    theme: 'system', // 'light' | 'dark' | 'system'
    ua: null,
    platform: 'desktop', // 'ios' | 'android' | 'desktop'
    mobile: false,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
};

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

const shell = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/state') {
    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        if (body.target) state.target = normalizeTarget(body.target);
        if (body.config) Object.assign(state.config, body.config);
      } catch (e) {
        return sendJson(res, 400, { error: String(e.message || e) });
      }
    }
    return sendJson(res, 200, { ...state, proxyPort: PROXY_PORT });
  }

  if (url.pathname === '/api/scan') {
    const found = (await Promise.all(SCAN_PORTS.filter((p) => p !== SHELL_PORT && p !== PROXY_PORT).map(probe))).filter(Boolean);
    return sendJson(res, 200, found);
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
      if (h.location) h.location = h.location.replace(t.origin, proxyOrigin);

      const dest = req.headers['sec-fetch-dest'];
      const isDocument = !dest || dest === 'document' || dest === 'iframe';
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
        const body = Buffer.from(injectClient(html), 'utf8');
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

shell.listen(SHELL_PORT, () => {
  proxy.listen(PROXY_PORT, () => {
    const url = `http://localhost:${SHELL_PORT}`;
    console.log(`\n  DeView  ${url}\n  proxy   http://localhost:${PROXY_PORT} → ${state.target}\n`);
    if (OPEN) spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  });
});
