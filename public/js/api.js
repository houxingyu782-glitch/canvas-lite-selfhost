/* Canvas Lite · Canvas REST API 封装
 * 只用官方公开接口：https://canvas.instructure.com/doc/api/
 * 认证方式：Authorization: Bearer <个人访问令牌>
 */
(function (global) {
  'use strict';

  const CONFIG_KEY = 'canvas-lite.config.v1';
  const REQUEST_TIMEOUT = 45000;

  const config = {
    baseUrl: '',
    token: '',
    proxyUrl: '',
    theme: 'auto',
  };

  class ApiError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = options.status || 0;
      this.kind = options.kind || 'http';
      this.detail = options.detail || '';
    }
  }

  function normalizeBaseUrl(input) {
    let value = String(input || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    value = value.replace(/\/+$/, '');
    // 去掉用户从浏览器地址栏复制进来的路径
    value = value.replace(/\/(login|dashboard|calendar|grades|courses|assignments|files|pages|modules|conversations)(\/.*)?$/i, '');
    return value;
  }

  function normalizeProxyUrl(input) {
    let value = String(input || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    return value.replace(/\/+$/, '');
  }

  function isLocalServer() {
    // 本地代理，或部署在带同源 /api 代理的静态站点（Cloudflare Pages）
    return !!global.__CANVAS_LITE_LOCAL__ || !!global.__CANVAS_LITE_SAME_ORIGIN__;
  }

  function loadConfig() {
    try {
      const raw = global.localStorage.getItem(CONFIG_KEY);
      if (raw) Object.assign(config, JSON.parse(raw));
    } catch (e) {
      /* 忽略损坏的本地数据 */
    }
    config.baseUrl = normalizeBaseUrl(config.baseUrl);
    config.proxyUrl = normalizeProxyUrl(config.proxyUrl);
    setConfig(config);
    return config;
  }

  function setConfig(patch) {
    Object.assign(config, patch);
    try {
      global.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      /* 隐私模式下可能写不进去 */
    }
    return config;
  }

  function clearConfig() {
    config.baseUrl = '';
    config.token = '';
    config.proxyUrl = '';
    try {
      global.localStorage.removeItem(CONFIG_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function isConfigured() {
    return !!(config.baseUrl && config.token);
  }

  function apiBase() {
    if (config.proxyUrl) return config.proxyUrl;
    return '';
  }

  function canvasOrigin() {
    try {
      return new URL(config.baseUrl).origin;
    } catch (e) {
      return '';
    }
  }

  function buildUrl(path) {
    const clean = path.startsWith('/') ? path : '/' + path;
    if (config.proxyUrl) return apiBase() + clean;
    if (isLocalServer()) return clean; // 同源，由本地服务转发
    return canvasOrigin() + clean;
  }

  function parseNextLink(linkHeader) {
    if (!linkHeader) return null;
    for (const part of String(linkHeader).split(',')) {
      if (/rel="?next"?/.test(part)) {
        const m = part.match(/<([^>]+)>/);
        if (m) return m[1];
      }
    }
    return null;
  }

  async function request(path, options = {}) {
    const { method = 'GET', body, query, signal, rawResponse = false } = options;
    let url = /^https?:\/\//i.test(path) ? path : buildUrl(path);

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
        else params.append(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const headers = {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (isLocalServer() && !config.proxyUrl) headers['X-Canvas-Host'] = config.baseUrl;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
        signal: controller.signal,
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-store',
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new ApiError('Canvas 响应超时，可能是网络较慢，请再点一次重试。', { kind: 'network' });
      }
      throw new ApiError(
        '连接失败。可能是网络问题，或 Canvas 不允许网页跨域访问（需要开启本地代理或云端代理）。',
        { kind: 'network', detail: String(err && err.message ? err.message : err) }
      );
    }
    clearTimeout(timer);

    const rateRemaining = res.headers.get('X-Rate-Limit-Remaining');
    if (res.status === 401) {
      throw new ApiError('Canvas 令牌无效或已过期，请重新生成。', { status: 401, kind: 'auth' });
    }
    if (res.status === 403 && String(rateRemaining) === '0') {
      throw new ApiError('请求太频繁，触发了 Canvas 限流，请稍等几分钟再试。', { status: 403, kind: 'rate' });
    }

    if (rawResponse) return res;

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = null;
      }
    }

    if (!res.ok) {
      let message = `Canvas 返回 ${res.status}`;
      if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
        message = data.errors[0].message;
      } else if (typeof data === 'string') {
        message = data;
      }
      const kind = res.status === 403 ? 'forbidden' : res.status >= 500 ? 'server' : 'http';
      throw new ApiError(message, { status: res.status, kind, detail: text.slice(0, 300) });
    }

    return {
      data,
      status: res.status,
      link: res.headers.get('Link'),
      next: parseNextLink(res.headers.get('Link')),
    };
  }

  async function getAll(path, options = {}) {
    const { maxPages = 8, perPage = 100, query = {} } = options;
    let next = path;
    let pages = 0;
    const collected = [];
    let truncated = false;
    const viaProxy = !!config.proxyUrl || isLocalServer();
    while (next && pages < maxPages) {
      let pagePath = next;
      if (viaProxy && /^https?:\/\//i.test(pagePath)) {
        // 代理返回的 Link 是 Canvas 的绝对地址，改回走代理的相对路径
        try {
          const parsed = new URL(pagePath);
          pagePath = parsed.pathname + parsed.search;
        } catch (e) {
          /* 保持原样 */
        }
      }
      const res = await request(pagePath, {
        query: pages === 0 ? { per_page: perPage, ...query } : undefined,
      });
      if (Array.isArray(res.data)) collected.push(...res.data);
      else if (res.data) return res.data;
      next = res.next;
      pages += 1;
    }
    if (next) truncated = true;
    Object.defineProperty(collected, 'truncated', { value: truncated, enumerable: false });
    return collected;
  }

  /* ---------------- 具体接口 ---------------- */

  const api = {
    config,
    ApiError,
    isConfigured,
    isLocalServer,
    canvasOrigin,
    normalizeBaseUrl,
    normalizeProxyUrl,
    loadConfig,
    setConfig,
    clearConfig,
    request,
    getAll,
    // 这些接口直接返回资源对象，页面层不关心分页/响应包装
    testConnection: () => request('/api/v1/users/self/profile').then((res) => res.data),

    profile: () => request('/api/v1/users/self/profile').then((res) => res.data),

    courses: () =>
      getAll('/api/v1/courses', {
        query: {
          enrollment_state: 'active',
          // 不带 teachers：课程列表请求从 40KB/620ms 降到 12KB/300ms
          'include[]': ['term', 'total_scores', 'favorites'],
        },
      }),

    todo: () => getAll('/api/v1/users/self/todo', { perPage: 50 }),

    planner: (startDate, endDate) =>
      getAll('/api/v1/planner/items', {
        query: { start_date: startDate, end_date: endDate },
      }),

    assignments: (courseId, signal) =>
      getAll(`/api/v1/courses/${courseId}/assignments`, {
        query: { 'include[]': 'submission', order_by: 'due_at' },
      }),

    // 作业分组：含每组权重、去分规则、组内作业和自己的提交得分，用来算每项占比
    assignmentGroups: (courseId) =>
      getAll(`/api/v1/courses/${courseId}/assignment_groups`, {
        perPage: 50,
        query: { 'include[]': ['assignments', 'submission'] },
      }),

    assignment: (courseId, assignmentId) =>
      request(`/api/v1/courses/${courseId}/assignments/${assignmentId}`, {
        query: { 'include[]': 'submission' },
      }).then((res) => res.data),

    // 公告只取最近一页：之前跟着 Link 翻 8 页，一门课要 10 秒
    announcements: (courseId) =>
      request(`/api/v1/courses/${courseId}/discussion_topics`, {
        query: { only_announcements: 'true', per_page: 15 },
      }).then((res) => (Array.isArray(res.data) ? res.data : [])),

    // 所有课程的公告一次取回：一个请求代替 N 门课 × 1 个请求
    allAnnouncements: (courseIds, startDate) =>
      request('/api/v1/announcements', {
        query: {
          'context_codes[]': (courseIds || []).map((id) => `course_${id}`),
          start_date: startDate,
          per_page: 50,
        },
      }).then((res) => (Array.isArray(res.data) ? res.data : [])),

    announcement: (courseId, topicId) =>
      request(`/api/v1/courses/${courseId}/discussion_topics/${topicId}`).then((res) => res.data),

    // 文件元数据里带一个签名下载地址，浏览器可直接下载，不用再登 Canvas
    file: (fileId) => request(`/api/v1/files/${fileId}`).then((res) => res.data),

    frontPage: (courseId) =>
      request(`/api/v1/courses/${courseId}/front_page`).then((res) => res.data),

    page: (courseId, slug) =>
      request(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(slug)}`).then((res) => res.data),

    // 课程左侧导航（含 Ed Discussion 等外部工具）；学生看不到被隐藏的栏目
    tabs: (courseId) =>
      request(`/api/v1/courses/${courseId}/tabs`).then((res) => (Array.isArray(res.data) ? res.data : [])),

    modules: (courseId) =>
      request(`/api/v1/courses/${courseId}/modules`, {
        query: { 'include[]': 'items', per_page: 100 },
      }).then((res) => res.data),
  };

  global.CanvasAPI = api;
})(window);
