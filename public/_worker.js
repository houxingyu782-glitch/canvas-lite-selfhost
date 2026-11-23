/**
 * Cloudflare Pages 同源代理：/api/* 转发到学校 Canvas，其余交给静态资源。
 * 这样浏览器不需要跨域，也不需要单独的 Worker 域名。
 */
function httpsOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol === 'https:' && url.hostname.includes('.') && url.pathname === '/' &&
        !url.username && !url.password && !url.port && !url.search && !url.hash) return url.origin;
  } catch {
    // 缺少地址或格式无效。
  }
  return null;
}

function error(message, status, headers = {}) {
  return Response.json({ errors: [{ message }] }, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/svc/')) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return error('此代理仅支持读取。', 405, { Allow: 'GET, HEAD' });
    }

    const canvasOrigin = httpsOrigin(env.CANVAS_ORIGIN);
    if (!canvasOrigin) return error('请在 Cloudflare Pages 设置中配置 CANVAS_ORIGIN。', 503);
    if (httpsOrigin(request.headers.get('X-Canvas-Host')) !== canvasOrigin) {
      return error('登录页的 Canvas 地址必须与站点配置的 CANVAS_ORIGIN 一致。', 400);
    }

    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return error('需要 Canvas 个人访问令牌。', 401);

    const target = canvasOrigin + url.pathname + url.search;

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers: { Authorization: authorization, Accept: 'application/json' },
        redirect: 'error',
      });
    } catch {
      return error('代理无法连接 Canvas。请检查 CANVAS_ORIGIN 是否为学校的最终 HTTPS 地址。', 502);
    }

    const out = new Headers();
    for (const key of ['content-type', 'content-disposition', 'link', 'x-rate-limit-remaining', 'retry-after']) {
      const value = upstream.headers.get(key);
      if (value) out.set(key, value);
    }
    out.set('cache-control', 'no-store');
    out.set('x-content-type-options', 'nosniff');
    out.set('content-security-policy', 'sandbox');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
