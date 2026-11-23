#!/usr/bin/env node
/**
 * Canvas Lite 本地服务
 *
 * 作用：
 *   1. 托管 public/ 里的网页（同源，所以没有跨域问题）
 *   2. 把 /api/v1/... 的请求转发到你的 Canvas 实例，并带上你的 API token
 *
 * 用法：
 *   node server/server.mjs                 # 默认 http://127.0.0.1:8787
 *   PORT=9000 node server/server.mjs       # 换端口
 *   CANVAS_HOST=canvas.ubc.ca node ...     # 固定学校域名（不填则用网页里填的地址）
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import dns from 'node:dns';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const FIXED_CANVAS_HOST = (process.env.CANVAS_HOST || '').trim();
const ALLOW_INSECURE_LOCAL = process.env.ALLOW_INSECURE_LOCAL === '1';
const MAX_BODY = 25 * 1024 * 1024; // 25MB

// 复用连接 + 缓存 DNS：手机网络下第一次解析域名偶尔会很慢（十几秒），
// 预解析并缓存能避免登录时「第一次请求超时」。
const dnsCache = new Map();

/** 带缓存的 DNS 查询：手机网络的 DNS 偶尔会卡十几秒，缓存后不再每个请求都查 */
function cachedLookup(hostname, options, callback) {
  const all = options && options.all;
  const hit = dnsCache.get(hostname);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) {
    if (all) callback(null, hit.addrs.map((address) => ({ address, family: 4 })));
    else callback(null, hit.addrs[0], 4);
    return;
  }
  dns.lookup(hostname, { ...options, family: 4, all: true }, (err, addrs) => {
    if (err || !addrs || !addrs.length) {
      callback(err || new Error('DNS 解析失败'), undefined, undefined);
      return;
    }
    const addresses = addrs.map((item) => item.address);
    dnsCache.set(hostname, { at: Date.now(), addrs: addresses });
    if (all) callback(null, addrs.map((item) => ({ address: item.address, family: item.family })));
    else callback(null, addresses[0], 4);
  });
}

const upstreamAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 6,
  maxFreeSockets: 4,
  timeout: 8000,
});

function warmUpHost(host) {
  if (!host) return;
  const started = Date.now();
  dns.lookup(host, { family: 4 }, (err, address) => {
    if (err) {
      log(`DNS 预解析失败 ${host}: ${err.message}`);
      return;
    }
    log(`DNS 预解析 ${host} → ${address} (${Date.now() - started}ms)`);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length',
]);

function log(...args) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${time}]`, ...args);
}

/** 只允许普通域名，禁止 localhost / 内网 / 带路径，避免被当成内网跳板 */
function parseCanvasHost(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  value = value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const m = value.match(/^([a-z0-9.-]+)(?::(\d+))?$/i);
  if (!m) return null;
  const hostname = m[1].toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return ALLOW_INSECURE_LOCAL ? { host: hostname, port: m[2], secure: false } : null;
  }
  if (/^(127\.|10\.|0\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(hostname)) {
    return ALLOW_INSECURE_LOCAL ? { host: hostname, port: m[2], secure: false } : null;
  }
  if (!hostname.includes('.')) return null;
  return { host: hostname, port: m[2], secure: true };
}

function copyRequestHeaders(req) {
  const out = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'x-canvas-host') continue;
    if (key.toLowerCase() === 'origin' || key.toLowerCase() === 'referer') continue;
    out[key] = value;
  }
  return out;
}

const PASS_RESPONSE_HEADERS = new Set([
  'content-type', 'content-encoding', 'content-disposition', 'link', 'location',
  'x-rate-limit-remaining', 'x-rate-limit-absolute', 'retry-after',
  'last-modified', 'etag',
]);

async function proxy(req, res, url, attempt = 0, cachedBody) {
  const target = parseCanvasHost(req.headers['x-canvas-host'] || FIXED_CANVAS_HOST);
  if (!target) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      errors: [{ message: '没有可用的 Canvas 域名，请在网页里填写学校 Canvas 地址（如 https://canvas.ubc.ca）。' }],
    }));
    return;
  }

  let body = cachedBody;
  if (body === undefined) {
    const bodyChunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ errors: [{ message: '请求体过大。' }] }));
        return;
      }
      bodyChunks.push(chunk);
    }
    body = bodyChunks.length ? Buffer.concat(bodyChunks) : undefined;
  }

  const upstreamPath = `${url.pathname}${url.search}`;
  const headers = copyRequestHeaders(req);
  if (body) headers['content-length'] = String(body.length);

  const started = Date.now();
  const transport = target.secure ? https : http;
  const options = {
    hostname: target.host,
    port: target.port || (target.secure ? 443 : 80),
    path: upstreamPath,
    method: req.method,
    headers,
    timeout: attempt === 0 ? 15000 : 30000,
    agent: target.secure && attempt === 0 ? upstreamAgent : false,
    lookup: cachedLookup,
    family: 4,
  };

  let finished = false;
  // 硬超时：即使请求还在连接池里排队也会被放弃，避免一个慢请求把后面全堵住
  const hardTimer = setTimeout(() => {
    upstream.destroy(new Error('上游超时'));
  }, attempt === 0 ? 20000 : 30000);

  const upstream = transport.request(options, (up) => {
    const outHeaders = {};
    for (const [key, value] of Object.entries(up.headers)) {
      if (PASS_RESPONSE_HEADERS.has(key.toLowerCase())) outHeaders[key] = value;
    }
    outHeaders['cache-control'] = 'no-store';
    res.writeHead(up.statusCode || 502, outHeaders);
    up.pipe(res);
    up.on('end', () => {
      finished = true;
      clearTimeout(hardTimer);
      const took = Date.now() - started;
      log(`${req.method} ${url.pathname}${url.search.slice(0, 60)} → ${up.statusCode} (${took}ms)${took > 5000 ? ' ⚠️ 慢' : ''}`);
    });
    // 浏览器先超时断开时，别再让上游请求空转
    res.on('close', () => {
      if (!finished) upstream.destroy();
    });
  });

  upstream.on('timeout', () => {
    upstream.destroy(new Error('上游超时'));
  });
  upstream.on('close', () => clearTimeout(hardTimer));
  upstream.on('error', (err) => {
    // 第一次失败（常见于复用了被服务器关掉的空闲连接）换新连接重试一次
    if (!res.headersSent && !res.destroyed && attempt < 1) {
      clearTimeout(hardTimer);
      log(`代理重试 ${req.method} ${url.pathname}: ${err.message}`);
      proxy(req, res, url, attempt + 1, body);
      return;
    }
    clearTimeout(hardTimer);
    log(`代理失败 ${req.method} ${url.pathname}: ${err.message}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      errors: [{ message: `连接 Canvas 失败：${err.message}` }],
    }));
  });

  if (body) upstream.write(body);
  upstream.end();
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let data;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) throw new Error('is directory');
    data = await fs.readFile(filePath);
  } catch {
    // 单页应用：未知路径回落到 index.html（但不要吞掉资源请求）
    if (path.extname(pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    try {
      data = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      pathname = '/index.html';
    } catch {
      res.writeHead(404).end('Not found');
      return;
    }
  }

  let type = MIME[path.extname(pathname).toLowerCase()] || 'application/octet-stream';
  if (pathname === '/index.html') {
    // 告诉前端：现在跑在本地代理模式，请求走同源 /api；
    // 如果启动时指定了 CANVAS_HOST，顺带把学校地址预填进登录页
    const injected = ['<script>window.__CANVAS_LITE_LOCAL__=1</script>'];
    if (FIXED_CANVAS_HOST) {
      const base = /^https?:\/\//i.test(FIXED_CANVAS_HOST)
        ? FIXED_CANVAS_HOST.replace(/\/+$/, '')
        : `https://${FIXED_CANVAS_HOST}`;
      injected.push(`<script>window.__CANVAS_LITE_BASE__=${JSON.stringify(base).replace(/</g, '\\u003c')}</script>`);
    }
    const html = data.toString('utf8').replace('<!--LOCAL_SERVER-->', injected.join(''));
    data = Buffer.from(html, 'utf8');
  }

  res.writeHead(200, {
    'content-type': type,
    'content-length': data.length,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, canvasHost: FIXED_CANVAS_HOST || null, uptime: process.uptime() }));
    return;
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/svc/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    await proxy(req, res, url);
    return;
  }

  await serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  console.log('');
  console.log('  Canvas Lite 已启动');
  console.log(`  本机打开：http://${shown}:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const item of list || []) {
        if (item.family === 'IPv4' && !item.internal) {
          console.log(`  同一 Wi-Fi 下：http://${item.address}:${PORT}`);
        }
      }
    }
  }
  warmUpHost(FIXED_CANVAS_HOST);
  console.log('');
  if (!FIXED_CANVAS_HOST) {
    console.log('  提示：在网页里填写学校 Canvas 地址即可，无需重启。');
    console.log('');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，换一个：PORT=8788 node server/server.mjs`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
