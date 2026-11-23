/* Canvas Lite v2 · 界面与交互
 * 纯原生 JS，无构建步骤。数据全部来自 Canvas 官方 REST API。
 *
 * 结构：
 *   - 「底层页面」（今天 / 课程 / 课程详情 / 公告 / 成绩 / 设置）渲染在 #app
 *   - 「详情」（作业 / 页面 / 公告 / 课程主页）渲染在右侧面板 #panel，
 *     底层页面保持不动，关闭面板就回到原来的滚动位置
 *   - 桌面：左侧栏 + 主区域 + 可停靠的详情面板；手机：底部导航 + 全屏详情
 */
(function () {
  'use strict';

  const API = window.CanvasAPI;
  const config = API.loadConfig();
  const VERSION = '2.1.2';

  const root = document.documentElement;
  const app = document.getElementById('app');
  const sidebar = document.getElementById('sidebar');
  const tabbar = document.getElementById('tabbar');
  const panel = document.getElementById('panel');
  const panelBody = document.getElementById('panel-body');
  const scrim = document.getElementById('panel-scrim');
  const sheet = document.getElementById('sheet');
  const palette = document.getElementById('palette');
  const toastEl = document.getElementById('toast');

  const dockQuery = window.matchMedia ? window.matchMedia('(min-width: 1100px)') : { matches: false };

  const PREFS_KEY = 'canvas-lite.prefs.v2';
  const SEEN_KEY = 'canvas-lite.seen.v1';

  const state = {
    baseSeq: 0,
    panelSeq: 0,
    baseHash: null,
    baseNav: null,
    baseCourse: null,
    renderedUrl: null,
    profile: null,
    courses: null,
    needRefresh: false,
    prefill: null,
    keepScroll: false,
    usedKeys: new Set(),
    prefs: loadPrefs(),
    seen: loadSeen(),
  };

  /* ============================ 小工具 ============================ */

  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function loadPrefs() {
    try {
      return { hideDone: false, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}) };
    } catch (e) {
      return { hideDone: false };
    }
  }

  function savePrefs(patch) {
    Object.assign(state.prefs, patch);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch (e) { /* ignore */ }
  }

  function loadSeen() {
    try {
      return new Set((JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') || []).map(String));
    } catch (e) {
      return new Set();
    }
  }

  function markSeen(ids) {
    ids.forEach((id) => state.seen.add(String(id)));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(state.seen).slice(-800))); } catch (e) { /* ignore */ }
  }

  function icon(name, cls) {
    return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  const ICONS = {
    today: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M8.5 14.5h3v3h-3z"/>',
    book: '<path d="M2 4h5.5A3.5 3.5 0 0 1 11 7.5V21a3 3 0 0 0-3-3H2z"/><path d="M22 4h-5.5A3.5 3.5 0 0 0 13 7.5V21a3 3 0 0 1 3-3h6z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-5.2"/>',
    tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.1 5.4"/><path d="M20 4v7h-7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    megaphone: '<path d="M4 10v4l12 5V5L4 10Z"/><path d="M16 8.5a3.5 3.5 0 0 1 0 7"/><path d="M7 15v4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13M12 16.6v.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    page: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a5 5 0 0 1 0 10h-2"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8v.01"/>',
    event: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5h4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  };

  const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e', '#3b82f6', '#84cc16'];

  function courseColor(course) {
    const key = String((course && (course.id || course.course_code)) || '');
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 997;
    return COLORS[hash % COLORS.length];
  }

  function colorById(id) {
    return courseColor(findCourse(id) || { id });
  }

  function splitCourseTitle(course) {
    const name = (course && course.name) || '未命名课程';
    const code = (course && course.course_code) || '';
    if (code && name.startsWith(code)) {
      const rest = name.slice(code.length).replace(/^[\s:：·\-–—]+/, '');
      return { code, name: rest || name };
    }
    const m = name.match(/^([A-Z]{2,}[A-Z0-9 ]{0,8}\d{2,4}[A-Z]?)\s*[:：·\-–—]\s*(.+)$/);
    if (m) return { code: m[1].trim(), name: m[2].trim() };

    // 形如 "AMME2262 AMME9262 Introduction to Thermal Engineering"
    const prefix = name.match(/^((?:[A-Z]{2,}\d{3,4}[A-Z]?)(?:\s+[A-Z]{2,}\d{3,4}[A-Z]?)*)\s+/);
    if (prefix && name.length - prefix[0].length > 4) {
      return { code: (code || prefix[1]).trim(), name: name.slice(prefix[0].length).trim() };
    }
    return { code: code || '', name };
  }

  /** 简短课程代码：「CS 101」「AMME2262」 */
  function courseCode(course) {
    if (!course) return '';
    const title = splitCourseTitle(course);
    const code = String(title.code || '').trim();
    if (code) {
      const first = code.split(/_|\s{2,}|\s(?=[A-Z]{2,}\d)/)[0];
      return (first || code).slice(0, 14);
    }
    const m = String(title.name || '').match(/^[A-Z]{2,}\s?\d{3,4}[A-Z]?/);
    return m ? m[0] : String(title.name || '').slice(0, 10);
  }

  function courseGrade(course) {
    const enrollments = (course && course.enrollments) || [];
    const e = enrollments.find((x) => x.type === 'student' || x.role === 'StudentEnrollment') || enrollments[0];
    if (!e) return { score: null, grade: null };
    const score = e.computed_current_score != null ? e.computed_current_score : (e.grades ? e.grades.current_score : null);
    const grade = e.computed_current_grade != null ? e.computed_current_grade : (e.grades ? e.grades.current_grade : null);
    const num = score == null ? null : Number(score);
    return { score: Number.isFinite(num) ? num : null, grade: grade || null };
  }

  function fullName(profile) {
    if (!profile) return '同学';
    return profile.short_name || profile.name || profile.display_name || '同学';
  }

  function avatarHtml(profile, size) {
    const px = size || 36;
    if (profile && profile.avatar_url && !/avatar-50\.png/.test(profile.avatar_url)) {
      return `<img class="avatar-img" src="${esc(profile.avatar_url)}" alt="" width="${px}" height="${px}" loading="lazy" referrerpolicy="no-referrer">`;
    }
    const text = fullName(profile).trim().slice(0, 1).toUpperCase() || 'C';
    return `<span class="avatar-fallback" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.42)}px">${esc(text)}</span>`;
  }

  function formatScore(score) {
    if (score == null) return '—';
    return Number(score) % 1 === 0 ? String(Number(score)) : Number(score).toFixed(1);
  }

  function pointsText(points) {
    if (points == null) return '不计分';
    return `${Number(points) % 1 === 0 ? Number(points) : Number(points).toFixed(1)} 分`;
  }

  /* ---------- 时间 ---------- */

  const DATE_FMT = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
  const TIME_FMT = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const WEEK_FMT = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' });
  const DAY = 86400000;

  function parseDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function dayDiff(d, from) {
    return Math.round((startOfDay(d) - startOfDay(from || new Date())) / DAY);
  }

  function dayKey(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function isoDay(offset) {
    const d = new Date(Date.now() + offset * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fmtDateTime(value) {
    const d = parseDate(value);
    if (!d) return '';
    const year = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}年` : '';
    return `${year}${DATE_FMT.format(d)} ${WEEK_FMT.format(d)} ${TIME_FMT.format(d)}`;
  }

  function fmtRelative(value) {
    const d = parseDate(value);
    if (!d) return '';
    const diff = d.getTime() - Date.now();
    const mins = Math.round(Math.abs(diff) / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return diff > 0 ? `${mins} 分钟后` : `${mins} 分钟前`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return diff > 0 ? `${hours} 小时后` : `${hours} 小时前`;
    const days = Math.round(hours / 24);
    if (days < 30) return diff > 0 ? `${days} 天后` : `${days} 天前`;
    return DATE_FMT.format(d);
  }

  function dayTitle(d) {
    const gap = dayDiff(d);
    const date = DATE_FMT.format(d);
    if (gap === 0) return { main: '今天', sub: `${date} ${WEEK_FMT.format(d)}` };
    if (gap === 1) return { main: '明天', sub: `${date} ${WEEK_FMT.format(d)}` };
    if (gap === 2) return { main: '后天', sub: `${date} ${WEEK_FMT.format(d)}` };
    return { main: WEEK_FMT.format(d), sub: date };
  }

  /** 截止时间的紧凑展示 + 颜色语义 */
  function dueMeta(value, done) {
    const d = parseDate(value);
    if (!d) return { label: '无截止时间', short: '—', tone: 'muted', overdue: false, date: null };
    const now = new Date();
    const time = TIME_FMT.format(d);
    const gap = dayDiff(d, now);
    const full = fmtDateTime(d);
    if (d < now) {
      let label;
      if (gap === 0) label = `今天 ${time} 已截止`;
      else if (gap === -1) label = `昨天 ${time} 已截止`;
      else if (gap > -7) label = `已截止 ${-gap} 天`;
      else label = `${DATE_FMT.format(d)} 已截止`;
      return { label, short: time, tone: done ? 'muted' : 'danger', overdue: true, date: d, full };
    }
    const hours = (d - now) / 3600000;
    const tone = done ? 'muted' : hours < 24 ? 'danger' : gap <= 1 ? 'warn' : 'normal';
    if (gap === 0) return { label: `今天 ${time}`, short: time, tone, overdue: false, date: d, full, soon: hours < 24 };
    if (gap === 1) return { label: `明天 ${time}`, short: time, tone, overdue: false, date: d, full };
    if (gap < 7) return { label: `${WEEK_FMT.format(d)} ${time}`, short: time, tone, overdue: false, date: d, full };
    return { label: `${DATE_FMT.format(d)} ${time}`, short: DATE_FMT.format(d), tone, overdue: false, date: d, full };
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 13) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  function submissionState(sub) {
    if (!sub) return { label: '未提交', tone: 'muted', done: false };
    if (sub.excused) return { label: '已免交', tone: 'muted', done: true };
    if (sub.graded === true || sub.workflow_state === 'graded' || sub.score != null) return { label: '已评分', tone: 'ok', done: true };
    if (sub.submitted === true || sub.workflow_state === 'submitted' || sub.workflow_state === 'pending_review' || sub.submitted_at) {
      return { label: '已提交', tone: 'info', done: true };
    }
    if (sub.missing) return { label: '缺交', tone: 'danger', done: false };
    return { label: '未提交', tone: 'muted', done: false };
  }

  function htmlToText(html, max) {
    if (!html) return '';
    let text = '';
    try {
      text = new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
    } catch (e) {
      text = String(html).replace(/<[^>]+>/g, ' ');
    }
    text = text.replace(/\s+/g, ' ').trim();
    return max && text.length > max ? text.slice(0, max) + '…' : text;
  }

  /* ---------- Canvas 链接 / 富文本 ---------- */

  function canvasHref(path) {
    if (!path) return '#';
    if (/^https?:\/\//i.test(path)) return path;
    return API.canvasOrigin() + (path.startsWith('/') ? path : '/' + path);
  }

  /** 把 Canvas 站内链接识别成可站内打开的目标 */
  function internalTargetFromUrl(rawUrl) {
    if (!rawUrl) return null;
    let parsed;
    try {
      parsed = new URL(rawUrl, API.canvasOrigin() || location.origin);
    } catch (e) {
      return null;
    }
    const origin = API.canvasOrigin();
    if (!origin || parsed.origin !== origin) return null;
    const path = parsed.pathname;
    let m;
    if ((m = path.match(/^\/courses\/(\d+)\/pages\/([^/]+)/))) return { kind: 'page', courseId: m[1], slug: decodeURIComponent(m[2]) };
    if ((m = path.match(/^\/courses\/(\d+)\/assignments\/(\d+)/))) return { kind: 'assignment', courseId: m[1], id: m[2] };
    if ((m = path.match(/^\/courses\/(\d+)\/(?:discussion_topics|announcements)\/(\d+)/))) return { kind: 'announcement', courseId: m[1], id: m[2] };
    if ((m = path.match(/^\/courses\/(\d+)\/files\/(\d+)/))) return { kind: 'file', courseId: m[1], id: m[2] };
    if ((m = path.match(/^\/files\/(\d+)/))) return { kind: 'file', id: m[1] };
    if ((m = path.match(/^\/courses\/(\d+)\/modules\/(\d+)/))) return { kind: 'course', courseId: m[1], tab: 'modules', moduleId: m[2] };
    if ((m = path.match(/^\/courses\/(\d+)\/modules/))) return { kind: 'course', courseId: m[1], tab: 'modules' };
    if ((m = path.match(/^\/courses\/(\d+)\/announcements\/?$/))) return { kind: 'course', courseId: m[1], tab: 'announcements' };
    if ((m = path.match(/^\/courses\/(\d+)\/assignments\/?$/))) return { kind: 'course', courseId: m[1], tab: 'assignments' };
    if ((m = path.match(/^\/courses\/(\d+)\/grades\/?$/))) return { kind: 'course', courseId: m[1], tab: 'grades' };
    if ((m = path.match(/^\/courses\/(\d+)\/?$/))) return { kind: 'course', courseId: m[1] };
    return null;
  }

  function sanitizeHtml(html) {
    if (!html) return '';
    let doc;
    try {
      doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
    } catch (e) {
      return esc(html);
    }
    const rootEl = doc.getElementById('__root');
    if (!rootEl) return '';
    const allowed = new Set([
      'A', 'P', 'DIV', 'SPAN', 'BR', 'HR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'INS', 'MARK', 'SMALL',
      'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'SUB', 'SUP',
      'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP', 'COL',
      'IMG', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'ABBR', 'CITE', 'Q', 'TIME', 'VIDEO', 'AUDIO', 'SOURCE',
    ]);
    const drop = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META', 'BASE']);

    const walk = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) continue;
        if (child.nodeType !== 1) {
          child.remove();
          continue;
        }
        const tag = child.tagName;
        if (drop.has(tag)) {
          child.remove();
          continue;
        }
        if (!allowed.has(tag)) {
          walk(child);
          child.replaceWith(...Array.from(child.childNodes));
          continue;
        }
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value || '';
          if (name.startsWith('on') || name === 'style' || name === 'srcdoc' || name === 'formaction') {
            child.removeAttribute(attr.name);
            continue;
          }
          if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*(javascript|data|vbscript):/i.test(value)) {
            child.removeAttribute(attr.name);
          }
        }
        // Canvas 富文本里的图片/链接常是相对路径，补上学校域名
        for (const attr of ['href', 'src']) {
          const value = child.getAttribute(attr);
          if (!value) continue;
          if (value.startsWith('//')) child.setAttribute(attr, 'https:' + value);
          else if (value.startsWith('/')) child.setAttribute(attr, API.canvasOrigin() + value);
        }
        if (tag === 'A') {
          const target = internalTargetFromUrl(child.getAttribute('href'));
          if (target) {
            child.setAttribute('data-internal', '1');
            child.setAttribute('data-kind', target.kind);
            child.setAttribute('data-course', target.courseId || '');
            if (target.slug) child.setAttribute('data-slug', target.slug);
            if (target.id) child.setAttribute('data-id', target.id);
            if (target.tab) child.setAttribute('data-tab', target.tab);
            if (target.moduleId) child.setAttribute('data-module', target.moduleId);
            child.removeAttribute('target');
            child.removeAttribute('rel');
          } else {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
        }
        if (tag === 'IMG') {
          child.setAttribute('loading', 'lazy');
          child.setAttribute('referrerpolicy', 'no-referrer');
          if (!child.getAttribute('alt')) child.setAttribute('alt', '');
        }
        if (tag === 'TABLE') {
          const wrap = doc.createElement('div');
          wrap.className = 'table-wrap';
          child.replaceWith(wrap);
          wrap.appendChild(child);
        }
        walk(child);
      }
    };
    walk(rootEl);
    return rootEl.innerHTML;
  }

  function toast(message, tone) {
    toastEl.textContent = message;
    toastEl.className = `toast show${tone ? ' toast-' + tone : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { toastEl.className = 'toast'; }, 2600);
  }

  async function downloadCanvasFile(fileId, name, fallback) {
    toast('正在准备下载…');
    try {
      const file = await API.file(fileId);
      const url = file && file.url;
      if (!url) throw new Error('没有下载地址');
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename || name || 'file';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`开始下载：${file.filename || name || '文件'}`, 'ok');
    } catch (err) {
      if (handleAuthError(err)) return;
      toast('下载失败，正在用 Canvas 打开', 'danger');
      if (fallback) window.open(fallback, '_blank', 'noopener');
    }
  }

  /* ============================ 缓存 ============================ */

  const memCache = new Map();
  const CACHE_KEY = 'canvas-lite.cache.v3';
  const CACHE_LIMIT = 3 * 1024 * 1024;
  const refreshing = new Set();
  const inflight = new Map();
  let persistTimer = null;

  // 启动时恢复上次的数据：先秒开，再在后台悄悄更新
  (function hydrateCache() {
    try {
      ['canvas-lite.cache.v2', 'canvas-lite.snapshot.v1'].forEach((key) => localStorage.removeItem(key));
      const obj = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      for (const [key, value] of Object.entries(obj || {})) {
        if (value && value.at && Object.prototype.hasOwnProperty.call(value, 'data')) memCache.set(key, value);
      }
    } catch (e) { /* 缓存损坏就忽略 */ }
  })();

  function persistCacheSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        const entries = Array.from(memCache.entries()).sort((a, b) => b[1].at - a[1].at);
        const out = {};
        let size = 0;
        for (const [key, value] of entries) {
          const json = JSON.stringify(value);
          if (size + json.length > CACHE_LIMIT) continue;
          out[key] = value;
          size += json.length;
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(out));
      } catch (e) {
        try { localStorage.removeItem(CACHE_KEY); } catch (err) { /* ignore */ }
      }
    }, 400);
  }

  function peek(key) {
    const hit = memCache.get(key);
    return hit ? hit.data : undefined;
  }

  /** 有缓存就先返回（哪怕过期），同时后台刷新 —— 打开页面不再等网络 */
  async function cached(key, ttl, loader, force) {
    state.usedKeys.add(key);
    if (!force) {
      const hit = memCache.get(key);
      if (hit) {
        if (Date.now() - hit.at > ttl) scheduleRefresh(key, loader);
        return hit.data;
      }
    }
    return fetchInto(key, loader);
  }

  /** 同一个 key 的并发请求只发一次；预取和页面加载共用 */
  function fetchInto(key, loader) {
    if (inflight.has(key)) return inflight.get(key);
    const promise = loader()
      .then((data) => {
        memCache.set(key, { at: Date.now(), data });
        persistCacheSoon();
        return data;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  async function prefetchKey(key, loader) {
    const hit = memCache.get(key);
    if (hit && Date.now() - hit.at < 120000) return;
    try {
      await fetchInto(key, loader);
    } catch (e) { /* 预取失败不影响使用 */ }
  }

  function scheduleRefresh(key, loader) {
    if (refreshing.has(key)) return;
    refreshing.add(key);
    setTimeout(async () => {
      const before = JSON.stringify(peek(key));
      try {
        const data = await fetchInto(key, loader);
        // 后台拿到新数据：底层页面正在用这份数据就原位重绘（保持滚动位置）
        if (JSON.stringify(data) !== before && state.usedKeys.has(key) && !palette.classList.contains('open')) {
          if (key === 'courses') state.courses = sortCourses(data);
          rerenderBase();
        }
      } catch (err) {
        handleAuthError(err);
      } finally {
        refreshing.delete(key);
      }
    }, 50);
  }

  function clearCache() {
    memCache.clear();
    refreshing.clear();
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
  }

  function prefetchCourses(courses) {
    if (!courses || !courses.length) return;
    const conn = navigator.connection || {};
    if (conn.saveData) return;
    const slow = /(^|-)2g$|(^|-)3g$/.test(conn.effectiveType || '');
    const list = courses.slice(0, slow ? 2 : courses.length);
    // 一次只预取一个，避免把连接池占满、拖慢你正在看的页面
    const run = async () => {
      for (let i = 0; i < list.length; i += 1) {
        const course = list[i];
        await prefetchKey(`assignments:${course.id}`, () => API.assignments(course.id));
        if (i < 3) await prefetchKey(`modules:${course.id}`, () => API.modules(course.id));
        if (i < 4) await prefetchKey(`groups:${course.id}`, () => API.assignmentGroups(course.id));
      }
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1000);
  }

  async function settle(promise) {
    try {
      return { ok: true, data: await promise };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function isAuthError(err) {
    return !!err && (err.kind === 'auth' || err.status === 401);
  }

  function handleAuthError(err) {
    if (!isAuthError(err)) return false;
    API.setConfig({ token: '' });
    toast('令牌已失效，请重新填写', 'danger');
    go('#/setup', { replace: true, reset: true });
    return true;
  }

  /* ============================ 数据 ============================ */

  function sortCourses(courses) {
    const list = (courses || []).slice();
    list.sort((a, b) => {
      const fa = a.is_favorite ? 0 : 1;
      const fb = b.is_favorite ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });
    return list;
  }

  async function loadCourses(force) {
    const list = await cached('courses', 120000, () => API.courses(), force);
    const sorted = sortCourses(list);
    if (list && list.truncated) Object.defineProperty(sorted, 'truncated', { value: true });
    state.courses = sorted;
    return state.courses;
  }

  function findCourse(id) {
    const key = String(id);
    return (state.courses || []).find((c) => String(c.id) === key) || null;
  }

  async function ensureProfile(force) {
    if (state.profile && !force) return state.profile;
    state.profile = await cached('profile', 600000, () => API.profile(), force);
    return state.profile;
  }

  function loadPlanner(force) {
    return cached('planner', 60000, () => API.planner(isoDay(-14), isoDay(28)), force);
  }

  function loadTodo(force) {
    return cached('todo', 60000, () => API.todo(), force);
  }

  function loadFeed(courses, force) {
    const ids = (courses || []).map((c) => c.id);
    if (!ids.length) return Promise.resolve([]);
    return cached('feed', 120000, () => API.allAnnouncements(ids, isoDay(-45)), force);
  }

  function plannerTypeLabel(type, p) {
    if (type === 'quiz') return '测验';
    if (type === 'discussion_topic') return '讨论';
    if (type === 'calendar_event') return '日程';
    if (type === 'announcement') return '公告';
    if (type === 'wiki_page') return '页面';
    if (type === 'planner_note') return '备忘';
    if (type === 'assignment') return p && p.submission_types && p.submission_types.includes('online_quiz') ? '测验' : '作业';
    return '事项';
  }

  const TYPE_ICON = { 作业: 'pen', 测验: 'quiz', 讨论: 'chat', 日程: 'event', 公告: 'megaphone', 页面: 'page', 备忘: 'pen', 事项: 'pen' };

  /** 把 Planner + To-do 合成一条时间线 */
  function buildAgenda(planner, todo) {
    const map = new Map();
    const add = (item) => {
      if (!item || !item.title) return;
      const key = `${item.courseId || ''}:${item.assignmentId || item.title}`;
      if (map.has(key)) return;
      map.set(key, item);
    };

    (planner || []).forEach((entry) => {
      const p = entry.plannable || {};
      const type = entry.plannable_type || '';
      if (type === 'announcement') return; // 公告单独在「公告」里看
      const dueAt = p.due_at || p.todo_date || p.start_at || entry.plannable_date || null;
      const courseId = entry.course_id != null ? entry.course_id : p.course_id;
      const sub = entry.submissions || p.submission || null;
      const typeLabel = plannerTypeLabel(type, p);
      const assignmentId = type === 'assignment' ? p.id : p.assignment_id;
      const actionable = type !== 'calendar_event' && type !== 'wiki_page';
      const st = actionable ? submissionState(sub || null) : null;
      const done = !!(entry.planner_override && entry.planner_override.marked_complete) || (st ? st.done : false);
      add({
        title: p.title || p.name || '未命名事项',
        courseId,
        assignmentId,
        dueAt,
        type,
        typeLabel,
        points: p.points_possible,
        actionable,
        done,
        state: st,
        href: courseId && assignmentId ? `#/course/${courseId}/a/${assignmentId}` : null,
        external: entry.html_url ? canvasHref(entry.html_url) : null,
      });
    });

    (todo || []).forEach((entry) => {
      const a = entry.assignment || {};
      if (!a.name || entry.type === 'grading') return;
      const courseId = entry.course_id || a.course_id;
      add({
        title: a.name,
        courseId,
        assignmentId: a.id,
        dueAt: a.due_at || null,
        type: 'assignment',
        typeLabel: a.submission_types && a.submission_types.includes('online_quiz') ? '测验' : '作业',
        points: a.points_possible,
        actionable: true,
        done: false,
        state: { label: '待提交', tone: 'muted', done: false },
        href: courseId && a.id ? `#/course/${courseId}/a/${a.id}` : null,
        external: entry.html_url ? canvasHref(entry.html_url) : null,
      });
    });

    const now = Date.now();
    const list = Array.from(map.values()).filter((item) => {
      const t = item.dueAt ? new Date(item.dueAt).getTime() : null;
      if (t == null) return !item.done;
      if (t < now) return item.actionable && !item.done && now - t < 14 * DAY;
      return true;
    });
    list.forEach((item) => {
      item.due = dueMeta(item.dueAt, item.done);
      item.overdue = item.due.overdue && item.actionable && !item.done;
    });
    list.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt) - new Date(b.dueAt);
    });
    return list;
  }

  function agendaFromCache() {
    const planner = peek('planner');
    const todo = peek('todo');
    if (planner === undefined && todo === undefined) return null;
    return buildAgenda(planner || [], todo || []);
  }

  function feedFromCache() {
    const feed = peek('feed');
    return Array.isArray(feed) ? feed.map(normalizeAnnouncement) : null;
  }

  function normalizeAnnouncement(a, courseId) {
    const cid = courseId || a.course_id || String(a.context_code || '').replace(/^course_/, '') || '';
    return {
      id: a.id,
      courseId: cid,
      title: a.title || '无标题',
      message: a.message || '',
      postedAt: a.posted_at || a.delayed_post_at || a.created_at,
      author: (a.author && a.author.display_name) || a.user_name || '',
      readState: a.read_state,
      htmlUrl: a.html_url,
      raw: a,
    };
  }

  function isUnread(item) {
    if (state.seen.has(String(item.id))) return false;
    if (item.readState) return item.readState === 'unread';
    const d = parseDate(item.postedAt);
    return !!d && Date.now() - d.getTime() < 7 * DAY;
  }

  function badges() {
    const agenda = agendaFromCache() || [];
    const urgent = agenda.filter((i) => !i.done && (i.overdue || (i.due.date && dayDiff(i.due.date) === 0))).length;
    const feed = feedFromCache() || [];
    return { home: urgent, feed: feed.filter(isUnread).length };
  }

  /* ============================ 路由 ============================ */

  function parseHash(hash) {
    const raw = String(hash || '').replace(/^#/, '') || '/home';
    const [path, queryPart] = raw.split('?');
    return { path: path || '/home', query: new URLSearchParams(queryPart || ''), hash: '#' + raw };
  }

  function go(hash, { replace = false, reset = false } = {}) {
    if (hash === location.hash) {
      render();
      return;
    }
    const from = replace ? (history.state && history.state.canvasLiteFrom) : (location.hash || '#/home');
    const entry = { canvasLiteFrom: reset ? null : from };
    if (replace) history.replaceState(entry, '', hash);
    else history.pushState(entry, '', hash);
    render();
  }

  const COURSE_TABS = [['overview', '概览'], ['assignments', '作业'], ['announcements', '公告'], ['modules', '模块'], ['grades', '成绩']];
  const COURSE_TAB_KEYS = COURSE_TABS.map(([k]) => k);

  function courseTab(query) {
    const tab = query.get('tab');
    if (tab === 'home') return 'overview';
    return COURSE_TAB_KEYS.includes(tab) ? tab : 'overview';
  }

  const BASE_ROUTES = [
    { re: /^\/setup\/?$/, view: setupView, nav: null, chrome: false },
    { re: /^\/home\/?$/, view: todayView, nav: 'home' },
    { re: /^\/courses\/?$/, view: coursesView, nav: 'courses' },
    { re: /^\/course\/(\d+)\/?$/, view: courseView, nav: 'courses' },
    { re: /^\/feed\/?$/, view: feedView, nav: 'feed' },
    { re: /^\/grades\/?$/, view: gradesView, nav: 'grades' },
    { re: /^\/me\/?$/, view: meView, nav: 'me' },
  ];

  const DETAIL_ROUTES = [
    { re: /^\/course\/(\d+)\/a\/(\d+)\/?$/, view: assignmentDetail, kind: 'a' },
    { re: /^\/course\/(\d+)\/page\/([^/]+)\/?$/, view: pageDetail, kind: 'page' },
    { re: /^\/course\/(\d+)\/ann\/(\d+)\/?$/, view: announcementDetail, kind: 'ann' },
    { re: /^\/course\/(\d+)\/front\/?$/, view: frontDetail, kind: 'front' },
  ];

  const LEGACY = [
    [/^\/todo\/?$/, () => '#/home'],
    [/^\/courses\/?$/, (q) => (q.get('tab') === 'grades' ? '#/grades' : null)],
  ];

  function matchRoute(list, path) {
    for (const item of list) {
      const m = path.match(item.re);
      if (m) return { ...item, params: m.slice(1) };
    }
    return null;
  }

  function isDetailHash(hash) {
    return !!(hash && matchRoute(DETAIL_ROUTES, parseHash(hash).path));
  }

  /** 冷启动直接打开详情时，底下垫一个合理的页面 */
  function baseForDetail(detail, query) {
    const courseId = detail.params[0];
    const from = query.get('from');
    if (from === 'today') return '#/home';
    if (from === 'feed') return '#/feed';
    let tab = COURSE_TAB_KEYS.includes(from) ? from : null;
    if (!tab) tab = { a: 'assignments', page: 'modules', ann: 'announcements', front: 'overview' }[detail.kind] || 'overview';
    return `#/course/${courseId}${tab === 'overview' ? '' : '?tab=' + tab}`;
  }

  async function render() {
    const route = parseHash(location.hash);
    state.renderedUrl = location.href;
    closeOverlays();

    if (!API.isConfigured() && route.path !== '/setup') {
      go('#/setup', { replace: true, reset: true });
      return;
    }
    if (API.isConfigured() && route.path === '/setup') {
      go('#/home', { replace: true, reset: true });
      return;
    }
    for (const [re, to] of LEGACY) {
      if (re.test(route.path)) {
        const target = to(route.query);
        if (target) {
          go(target, { replace: true });
          return;
        }
      }
    }

    const detail = matchRoute(DETAIL_ROUTES, route.path);
    if (detail) {
      if (!state.baseHash || isDetailHash(state.baseHash)) renderBase(baseForDetail(detail, route.query));
      openPanel();
      renderDetail(detail, route);
      return;
    }

    closePanel();
    if (route.hash === state.baseHash && !state.needRefresh) {
      updateChrome();
      return;
    }
    renderBase(route.hash);
  }

  function rerenderBase() {
    if (!state.baseHash) return;
    state.keepScroll = true;
    renderBase(state.baseHash);
  }

  async function renderBase(hash) {
    const route = parseHash(hash);
    const matched = matchRoute(BASE_ROUTES, route.path);
    const seq = ++state.baseSeq;
    const keepScroll = state.keepScroll;
    state.keepScroll = false;
    state.baseHash = route.hash;
    state.usedKeys = new Set();
    if (!keepScroll) window.scrollTo({ top: 0 });

    if (!matched) {
      state.baseNav = null;
      updateChrome();
      app.innerHTML = `<div class="page">${emptyState('alert', '页面不存在', '', '<a class="btn" href="#/home">回到今天</a>')}</div>`;
      return;
    }
    state.baseNav = matched.nav;
    state.baseCourse = route.path.match(/^\/course\/(\d+)/)?.[1] || null;
    root.classList.toggle('no-chrome', matched.chrome === false);
    updateChrome();

    const force = state.needRefresh;
    state.needRefresh = false;
    try {
      await matched.view({ params: matched.params, query: route.query, seq, force, keepScroll });
    } catch (err) {
      if (seq !== state.baseSeq) return;
      if (handleAuthError(err)) return;
      console.error(err);
      app.innerHTML = `<div class="page">${errorBox(err)}</div>`;
    }
    if (seq === state.baseSeq) updateChrome();
  }

  function stale(seq) {
    return seq !== state.baseSeq;
  }

  /* ============================ 外框：侧栏 / 底栏 ============================ */

  const NAV = [
    ['home', '今天', 'today', '#/home'],
    ['courses', '课程', 'book', '#/courses'],
    ['feed', '公告', 'megaphone', '#/feed'],
    ['grades', '成绩', 'chart', '#/grades'],
  ];

  function updateChrome() {
    const configured = API.isConfigured() && !root.classList.contains('no-chrome');
    sidebar.hidden = !configured;
    tabbar.hidden = !configured;
    document.body.classList.toggle('has-chrome', configured);
    if (!configured) return;

    const b = badges();
    const active = state.baseNav;
    const badge = (key) => (b[key] ? `<span class="badge" aria-label="${b[key]} 项">${b[key] > 99 ? '99+' : b[key]}</span>` : '');

    tabbar.innerHTML = NAV.map(([key, label, ic, href]) => `
      <a href="${href}" data-nav="${key}" class="${active === key ? 'active' : ''}" ${active === key ? 'aria-current="page"' : ''}>
        <span class="tab-ico">${icon(ic)}${badge(key)}</span><span>${label}</span>
      </a>`).join('');

    const courses = state.courses || [];
    const currentTab = state.baseCourse ? courseTab(parseHash(state.baseHash).query) : 'overview';
    const tabSuffix = currentTab === 'overview' ? '' : `?tab=${currentTab}`;
    const profile = state.profile;
    const themeIcon = { auto: 'monitor', light: 'sun', dark: 'moon' }[config.theme || 'auto'];

    sidebar.innerHTML = `
      <div class="sb-top">
        <a class="sb-brand" href="#/home">${logoSvg()}<span>Canvas Lite</span></a>
        <button class="sb-search" data-action="search" type="button">${icon('search')}<span>搜索</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></button>
      </div>
      <nav class="sb-nav" aria-label="主导航">
        ${NAV.map(([key, label, ic, href]) => `
          <a href="${href}" data-nav="${key}" class="${active === key && !(key === 'courses' && state.baseCourse) ? 'active' : ''}">
            ${icon(ic)}<span>${label}</span>${badge(key)}
          </a>`).join('')}
      </nav>
      ${courses.length ? `<div class="sb-label">我的课程</div>
      <nav class="sb-courses" id="course-links" aria-label="切换课程">
        ${courses.map((c) => `
          <a href="#/course/${esc(c.id)}${tabSuffix}" data-course="${esc(c.id)}" ${String(c.id) === state.baseCourse ? 'aria-current="true"' : ''} title="${esc(c.name)}">
            <span class="dot" style="--c:${courseColor(c)}"></span>
            <span class="sb-course-text"><b>${esc(courseCode(c))}</b><small>${esc(splitCourseTitle(c).name)}</small></span>
          </a>`).join('')}
      </nav>` : '<div class="sb-courses"></div>'}
      <div class="sb-foot">
        <a class="sb-user ${active === 'me' ? 'active' : ''}" href="#/me">
          ${avatarHtml(profile, 30)}<span>${esc(profile ? fullName(profile) : '我的')}</span>
          ${icon('settings', 'sb-user-ico')}
        </a>
        <button class="icon-btn" data-action="cycle-theme" type="button" aria-label="切换外观" title="切换外观">${icon(themeIcon)}</button>
      </div>`;
  }

  function logoSvg() {
    return `<span class="logo" aria-hidden="true"><svg viewBox="0 0 512 512" fill="none"><path d="M340 182a112 112 0 1 0 0 148" stroke="#fff" stroke-width="56" stroke-linecap="round"/><circle cx="352" cy="256" r="26" fill="#fff"/></svg></span>`;
  }

  /** 页面顶部：大标题 + 操作按钮（手机上还有搜索和头像） */
  function pageHeader(title, { sub = '', actions = '' } = {}) {
    return `<header class="page-header">
      <div class="ph-text">
        <h1>${esc(title)}</h1>
        ${sub ? `<p class="ph-sub">${sub}</p>` : ''}
      </div>
      <div class="ph-actions">
        ${actions}
        <button class="icon-btn only-mobile" data-action="search" type="button" aria-label="搜索">${icon('search')}</button>
        <button class="icon-btn" data-action="refresh" type="button" aria-label="刷新数据" title="刷新">${icon('refresh')}</button>
        <a class="avatar-btn only-mobile" href="#/me" aria-label="我的与设置">${avatarHtml(state.profile, 32)}</a>
      </div>
    </header>`;
  }

  /* ============================ 通用片段 ============================ */

  function chip(tone, label) {
    return `<span class="chip chip-${tone}">${esc(label)}</span>`;
  }

  function emptyState(iconName, title, hint, extra) {
    return `<div class="empty">
      <div class="empty-icon">${icon(iconName)}</div>
      <p class="empty-title">${esc(title)}</p>
      ${hint ? `<p class="empty-hint">${esc(hint)}</p>` : ''}
      ${extra || ''}
    </div>`;
  }

  function errorBox(err) {
    const message = (err && err.message) || '出了点问题';
    const hint = err && err.kind === 'network'
      ? '检查网络后再试。请通过本地服务或已配置 CANVAS_ORIGIN 的 Cloudflare Pages 访问。'
      : err && err.kind === 'rate'
        ? 'Canvas 对每个账号每 10 分钟有请求上限，等几分钟再刷新即可。'
        : '';
    return `<div class="error-box">
      <div class="error-icon">${icon('alert')}</div>
      <p class="error-title">${esc(message)}</p>
      ${hint ? `<p class="error-hint">${esc(hint)}</p>` : ''}
      <button class="btn" data-action="retry" type="button">${icon('refresh')} 重试</button>
    </div>`;
  }

  function skeleton(kind) {
    if (kind === 'panel') {
      return `<div class="panel-pad"><div class="sk sk-line" style="width:30%"></div><div class="sk sk-title"></div>
        <div class="sk sk-line" style="width:55%"></div><div class="sk sk-block"></div></div>`;
    }
    if (kind === 'list') {
      return `<div class="sk-list">${'<div class="sk sk-row"></div>'.repeat(4)}</div>`;
    }
    return `<div class="page"><div class="sk sk-title" style="width:40%"></div><div class="sk sk-line" style="width:25%"></div>
      <div class="sk sk-hero"></div>${'<div class="sk sk-row"></div>'.repeat(4)}</div>`;
  }

  function courseTag(courseId, fallback) {
    const course = findCourse(courseId);
    const code = course ? courseCode(course) : (fallback || '');
    if (!code) return '';
    return `<span class="ctag" style="--c:${colorById(courseId)}">${esc(code)}</span>`;
  }

  /* ============================ 页面：首次设置 ============================ */

  function setupView({ query } = {}) {
    const local = API.isLocalServer();
    const params = new URLSearchParams(location.search || '');
    (query || new URLSearchParams()).forEach((v, k) => params.set(k, v));
    if (params.get('base') || params.get('proxy')) {
      state.prefill = {
        base: API.normalizeBaseUrl(params.get('base') || ''),
        proxy: API.normalizeProxyUrl(params.get('proxy') || ''),
      };
      try {
        history.replaceState(history.state, '', location.pathname + '#/setup');
        state.renderedUrl = location.href;
      } catch (e) { /* 老浏览器忽略 */ }
    }
    const serverBase = API.normalizeBaseUrl(window.__CANVAS_LITE_BASE__ || '');
    const prefillBase = (state.prefill && state.prefill.base) || config.baseUrl || serverBase || '';
    const prefillProxy = (state.prefill && state.prefill.proxy) || config.proxyUrl || '';

    app.innerHTML = `
      <div class="setup">
        <section class="setup-intro">
          <div class="setup-brand">${logoSvg()}<span>Canvas Lite</span></div>
          <h1>一个更顺手的<br>Canvas。</h1>
          <p>用个人 API 令牌登录，不用反复过 SSO 验证，也不会一周就掉线。</p>
          <ul class="setup-points">
            <li>${icon('today')}<span><b>今天</b>所有课的截止时间排成一条时间线</span></li>
            <li>${icon('megaphone')}<span><b>公告</b>所有课的公告集中看，未读一目了然</span></li>
            <li>${icon('search')}<span><b>搜索</b>课程、作业、公告、资料随手找到</span></li>
          </ul>
        </section>

        <section class="setup-form-wrap">
          <form class="card setup-form" id="setup-form" novalidate>
            <h2>连接你的 Canvas</h2>
            ${local ? `<div class="note note-ok">${icon('check')}<span>本地代理模式：请求经由本机转发，不受跨域限制。</span></div>` : ''}
            <label class="field">
              <span class="field-label">学校 Canvas 地址</span>
              <input class="input" id="f-base" type="url" inputmode="url" autocomplete="url" spellcheck="false"
                placeholder="https://canvas.yourschool.edu" value="${esc(prefillBase)}" required>
            </label>
            <label class="field">
              <span class="field-label">个人访问令牌（API Token）</span>
              <span class="input-wrap">
                <input class="input" id="f-token" type="password" autocomplete="off" spellcheck="false" placeholder="例如 10716~aBcDeF..." required>
                <button type="button" class="icon-btn input-eye" data-action="toggle-token" aria-label="显示令牌">${icon('eye')}</button>
              </span>
              <span class="field-hint">令牌保存在此浏览器。读取数据时，部署的代理会把令牌转发给 Canvas。</span>
            </label>
            <details class="advanced">
              <summary>代理地址（可选）</summary>
              <input class="input" id="f-proxy" type="url" inputmode="url" spellcheck="false"
                placeholder="https://canvas-proxy.xxx.workers.dev" value="${esc(prefillProxy)}">
              <p class="field-hint">使用本地服务或本项目的 Cloudflare Pages 部署时留空。</p>
            </details>
            <div class="form-error" id="setup-error" hidden></div>
            <button class="btn btn-primary btn-block" type="submit" id="setup-submit">连接 Canvas</button>
          </form>

          <details class="card help-card">
            <summary>怎么拿 API 令牌？</summary>
            <ol class="steps">
              <li>浏览器登录学校 Canvas，左上角 <b>Account（账户）</b> → <b>Settings（设置）</b>。</li>
              <li>找到 <b>Approved Integrations（已批准的集成）</b>，点 <b>+ New Access Token</b>。</li>
              <li>用途随便填（如 <code>Canvas Lite</code>），<b>Expires（过期时间）留空</b>，令牌就不会过期。</li>
              <li>点 <b>Generate Token</b>，复制那一长串字符，粘贴到上面。</li>
            </ol>
            <p class="field-hint">令牌等同于密码，别发给别人。想撤销时回到同一页面点 <b>Delete</b>。</p>
          </details>
        </section>
      </div>`;

    $('#setup-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const baseInput = $('#f-base');
      const tokenInput = $('#f-token');
      const proxyInput = $('#f-proxy');
      const errorEl = $('#setup-error');
      const submit = $('#setup-submit');
      const base = API.normalizeBaseUrl(baseInput.value);
      const token = tokenInput.value.trim();
      const proxy = API.normalizeProxyUrl(proxyInput ? proxyInput.value : '');

      const fail = (message, input) => {
        errorEl.hidden = false;
        errorEl.textContent = message;
        if (input) input.focus();
      };
      errorEl.hidden = true;
      if (!base) return fail('请填写学校 Canvas 地址。', baseInput);
      try {
        const parsed = new URL(base);
        if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error('bad');
      } catch (e) {
        return fail('地址看起来不对，应该形如 https://canvas.yourschool.edu。', baseInput);
      }
      if (!token) return fail('请粘贴 API 令牌。', tokenInput);
      if (token.length < 20) return fail('令牌好像太短了，请确认复制完整。', tokenInput);

      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span> 正在验证…';
      API.setConfig({ baseUrl: base, token, proxyUrl: proxy });
      try {
        const profile = await API.testConnection();
        clearCache();
        state.profile = profile;
        state.courses = null;
        state.prefill = null;
        state.baseHash = null;
        toast(`欢迎，${fullName(profile)}`, 'ok');
        go('#/home', { replace: true, reset: true });
      } catch (err) {
        API.setConfig({ token: '' });
        fail(err.message || '连接失败，请检查地址和令牌。', tokenInput);
        submit.disabled = false;
        submit.textContent = '连接 Canvas';
      }
    });

    $('#f-token').focus();
  }

  /* ============================ 页面：今天 ============================ */

  async function todayView({ seq, force, keepScroll }) {
    if (!keepScroll) app.innerHTML = skeleton('page');

    const [profileRes, coursesRes, plannerRes, todoRes] = await Promise.all([
      settle(ensureProfile(force)),
      settle(loadCourses(force)),
      settle(loadPlanner(force)),
      settle(loadTodo(force)),
    ]);
    if (stale(seq)) return;
    const authErr = [profileRes, coursesRes, plannerRes, todoRes].find((r) => !r.ok && isAuthError(r.error));
    if (authErr) {
      handleAuthError(authErr.error);
      return;
    }
    if (!coursesRes.ok && !todoRes.ok && !plannerRes.ok) {
      app.innerHTML = `<div class="page">${pageHeader('今天')}${errorBox(coursesRes.error)}</div>`;
      return;
    }

    const courses = state.courses || [];
    const feedRes = await settle(loadFeed(courses, force));
    if (stale(seq)) return;

    const profile = profileRes.ok ? profileRes.data : state.profile;
    // Planner 在部分学校是关闭的：失败不算错误，静静退回 To-do 数据
    const agenda = buildAgenda(plannerRes.ok ? plannerRes.data : [], todoRes.ok ? todoRes.data : []);
    const feed = feedRes.ok ? feedRes.data.map((a) => normalizeAnnouncement(a)) : [];
    const failed = !coursesRes.ok || !todoRes.ok;

    const pending = agenda.filter((i) => !i.done && i.actionable);
    const overdue = agenda.filter((i) => i.overdue);
    const today = pending.filter((i) => i.due.date && !i.overdue && dayDiff(i.due.date) === 0);
    const week = pending.filter((i) => i.due.date && !i.overdue && dayDiff(i.due.date) < 7);
    const unread = feed.filter(isUnread);
    const firstName = fullName(profile).split(/\s+/)[0] || '同学';
    const term = (courses[0] && courses[0].term && courses[0].term.name) || '';
    const now = new Date();

    let summary;
    if (overdue.length) summary = `有 <b class="t-danger">${overdue.length} 项已逾期</b>，先处理它们。`;
    else if (today.length) summary = `今天有 <b>${today.length} 项</b>要交，本周共 ${week.length} 项。`;
    else if (week.length) summary = `今天没有要交的，本周还有 <b>${week.length} 项</b>。`;
    else summary = '未来一周没有要交的东西，可以松口气。';

    app.innerHTML = `
      <div class="page page-today">
        ${pageHeader(`${greeting()}，${firstName}`, { sub: `${now.getMonth() + 1} 月 ${now.getDate()} 日 ${WEEK_FMT.format(now)}${term ? ' · ' + esc(term) : ''}` })}
        <p class="today-summary">${summary}</p>
        ${failed ? `<div class="note note-warn">${icon('alert')}<span>${navigator.onLine ? '部分数据没能刷新，显示的是上次缓存的内容。' : '当前离线，显示的是上次缓存的数据。'}</span></div>` : ''}

        <div class="today-grid">
          <div class="today-main">
            <div class="stat-row">
              ${statCard('逾期', overdue.length, 'danger', '#agenda-overdue')}
              ${statCard('今天截止', today.length, 'warn', `#day-${dayKey(now)}`)}
              ${statCard('7 天内', week.length, 'accent', '#agenda')}
              ${statCard('未读公告', unread.length, 'info', '#/feed')}
            </div>
            ${weekStrip(agenda)}
            <section class="section" id="agenda">
              <div class="section-head">
                <h2>日程</h2>
                <label class="switch"><input type="checkbox" data-action="toggle-done" ${state.prefs.hideDone ? 'checked' : ''}><span>隐藏已完成</span></label>
              </div>
              ${agendaHtml(agenda)}
            </section>
          </div>

          <aside class="today-side">
            <section class="card side-card">
              <div class="section-head"><h2>最新公告</h2><a class="section-link" href="#/feed">全部 ${icon('right')}</a></div>
              ${feed.length ? `<div class="mini-list">${feed.slice(0, 4).map((a) => miniAnnouncement(a, 'today')).join('')}</div>`
                : `<p class="empty-inline">${feedRes.ok ? '最近 45 天没有公告' : '公告暂时没加载出来'}</p>`}
            </section>
            <section class="card side-card">
              <div class="section-head"><h2>课程</h2><a class="section-link" href="#/courses">全部 ${icon('right')}</a></div>
              ${courses.length ? `<div class="mini-list">${courses.map((c) => miniCourse(c, agenda)).join('')}</div>`
                : '<p class="empty-inline">还没有进行中的课程</p>'}
            </section>
          </aside>
        </div>
        <p class="page-foot">数据来自 Canvas · ${TIME_FMT.format(new Date())} 更新</p>
      </div>`;

    prefetchCourses(courses);
  }

  function statCard(label, value, tone, target) {
    const isRoute = target.startsWith('#/');
    return `<a class="stat stat-${tone} ${value ? '' : 'is-zero'}" href="${target}" ${isRoute ? '' : 'data-action="scroll-to"'}>
      <b>${value}</b><span>${label}</span>
    </a>`;
  }

  function weekStrip(agenda) {
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(Date.now() + i * DAY);
      const items = agenda.filter((x) => x.due.date && !x.overdue && dayDiff(x.due.date) === i);
      const open = items.filter((x) => !x.done);
      days.push(`<a class="wd ${i === 0 ? 'is-today' : ''} ${items.length ? 'has-items' : ''}" href="#day-${dayKey(d)}" data-action="scroll-to">
        <span class="wd-week">${i === 0 ? '今天' : WEEK_FMT.format(d)}</span>
        <span class="wd-date">${d.getDate()}</span>
        <span class="wd-dots">${items.slice(0, 4).map((x) => `<i style="--c:${colorById(x.courseId)}" class="${x.done ? 'done' : ''}"></i>`).join('')}</span>
        <span class="sr-only">${open.length} 项待完成</span>
      </a>`);
    }
    return `<nav class="week-strip" aria-label="未来 7 天">${days.join('')}</nav>`;
  }

  function agendaHtml(agenda) {
    const hideDone = state.prefs.hideDone;
    const visible = agenda.filter((i) => !(hideDone && i.done));
    if (!visible.length) {
      return emptyState('check', hideDone && agenda.length ? '没有未完成的事项' : '接下来没有要交的东西', '新的作业发布后会出现在这里');
    }
    const groups = [];
    const overdue = visible.filter((i) => i.overdue);
    if (overdue.length) groups.push({ id: 'agenda-overdue', main: '已逾期', sub: `${overdue.length} 项`, tone: 'danger', items: overdue });

    const byDay = new Map();
    const later = [];
    const undated = [];
    visible.filter((i) => !i.overdue).forEach((item) => {
      if (!item.due.date) {
        undated.push(item);
        return;
      }
      const gap = dayDiff(item.due.date);
      if (gap < 0) return;
      if (gap > 6) {
        later.push(item);
        return;
      }
      const key = dayKey(item.due.date);
      if (!byDay.has(key)) byDay.set(key, { date: item.due.date, items: [] });
      byDay.get(key).items.push(item);
    });
    byDay.forEach((value, key) => {
      const title = dayTitle(value.date);
      groups.push({ id: `day-${key}`, main: title.main, sub: title.sub, tone: dayDiff(value.date) === 0 ? 'accent' : '', items: value.items });
    });
    if (later.length) groups.push({ id: 'agenda-later', main: '之后', sub: '7 天以后', tone: '', items: later });
    if (undated.length) groups.push({ id: 'agenda-undated', main: '无截止时间', sub: '', tone: '', items: undated });

    return `<div class="agenda">${groups.map((g) => `
      <div class="agenda-group" id="${g.id}">
        <div class="ag-head ${g.tone ? 'tone-' + g.tone : ''}"><b>${esc(g.main)}</b><span>${esc(g.sub)}</span></div>
        <div class="card list">${g.items.map(agendaRow).join('')}</div>
      </div>`).join('')}</div>`;
  }

  function agendaRow(item) {
    const color = colorById(item.courseId);
    let time;
    if (item.overdue) time = `<span class="t-danger">${esc(item.due.label.replace(/ 已截止$/, '').replace(/^已截止 /, ''))}</span>`;
    else if (!item.due.date) time = '—';
    else if (dayDiff(item.due.date) > 6) time = esc(DATE_FMT.format(item.due.date));
    else time = esc(item.due.short);
    const status = item.state
      ? (item.done ? chip(item.state.tone, item.state.label) : item.overdue ? chip('danger', '逾期') : item.due.soon ? chip('danger', '24 小时内') : '')
      : chip('muted', item.typeLabel);
    const attrs = item.href ? `href="${esc(item.href)}?from=today"` : item.external ? `href="${esc(item.external)}" target="_blank" rel="noopener"` : '';
    const tag = attrs ? 'a' : 'div';
    return `<${tag} class="row agenda-row ${item.done ? 'is-done' : ''}" ${attrs} style="--c:${color}">
      <span class="ar-time">${time}</span>
      <span class="ar-bar"></span>
      <span class="row-main">
        <span class="row-title">${item.done ? `<span class="done-tick">${icon('tick')}</span>` : ''}${esc(item.title)}</span>
        <span class="row-meta">${courseTag(item.courseId)}<span>${icon(TYPE_ICON[item.typeLabel] || 'pen', 'meta-ico')}${esc(item.typeLabel)}</span>${item.points ? `<span>${esc(pointsText(item.points))}</span>` : ''}</span>
      </span>
      ${status}
    </${tag}>`;
  }

  function miniAnnouncement(a, from) {
    return `<a class="mini-row" href="#/course/${esc(a.courseId)}/ann/${esc(a.id)}?from=${from}">
      <span class="mini-dot ${isUnread(a) ? 'unread' : ''}"></span>
      <span class="row-main">
        <span class="row-title">${esc(a.title)}</span>
        <span class="row-meta">${courseTag(a.courseId)}<span>${esc(fmtRelative(a.postedAt))}</span></span>
      </span>
    </a>`;
  }

  function miniCourse(course, agenda) {
    const grade = courseGrade(course);
    const open = (agenda || []).filter((i) => String(i.courseId) === String(course.id) && !i.done && i.actionable).length;
    return `<a class="mini-row" href="#/course/${esc(course.id)}">
      <span class="dot" style="--c:${courseColor(course)}"></span>
      <span class="row-main">
        <span class="row-title">${esc(splitCourseTitle(course).name)}</span>
        <span class="row-meta"><span>${esc(courseCode(course))}</span>${open ? `<span>${open} 项待完成</span>` : ''}</span>
      </span>
      <span class="mini-grade">${grade.score != null ? esc(formatScore(grade.score)) : ''}</span>
    </a>`;
  }

  /* ============================ 页面：课程列表 ============================ */

  async function coursesView({ seq, force, keepScroll }) {
    if (!keepScroll) app.innerHTML = skeleton('page');
    const res = await settle(loadCourses(force));
    if (stale(seq)) return;
    if (!res.ok) {
      if (handleAuthError(res.error)) return;
      app.innerHTML = `<div class="page">${pageHeader('课程')}${errorBox(res.error)}</div>`;
      return;
    }
    const courses = state.courses || [];
    const agenda = agendaFromCache() || [];
    const term = (courses[0] && courses[0].term && courses[0].term.name) || '';

    app.innerHTML = `
      <div class="page">
        ${pageHeader('课程', { sub: `${courses.length} 门进行中${term ? ' · ' + esc(term) : ''}` })}
        ${courses.length ? `
          <label class="search-box">${icon('search')}<input id="course-search" type="search" placeholder="筛选课程" autocomplete="off" spellcheck="false"></label>
          <div class="course-grid" id="course-list">${courses.map((c) => courseTile(c, agenda)).join('')}</div>
          ${courses.truncated ? '<p class="empty-inline">课程较多，只显示了前一部分</p>' : ''}`
          : emptyState('book', '还没有进行中的课程', '如果刚开学，可能课程还没发布')}
      </div>`;

    const search = $('#course-search');
    if (search) {
      search.addEventListener('input', () => {
        const value = search.value.trim().toLowerCase();
        const filtered = courses.filter((c) => `${c.name} ${c.course_code || ''}`.toLowerCase().includes(value));
        $('#course-list').innerHTML = filtered.length ? filtered.map((c) => courseTile(c, agenda)).join('') : '<p class="empty-inline">没有匹配的课程</p>';
      });
    }
    prefetchCourses(courses);
  }

  function nextForCourse(course, agenda) {
    const now = new Date();
    const map = new Map();
    (peek(`assignments:${course.id}`) || []).forEach((a) => {
      if (a.due_at && new Date(a.due_at) > now && !submissionState(a.submission).done) map.set(String(a.id), { title: a.name, dueAt: a.due_at });
    });
    (agenda || []).forEach((i) => {
      if (String(i.courseId) !== String(course.id) || i.done || !i.actionable || i.overdue || !i.dueAt) return;
      const key = String(i.assignmentId || i.title);
      if (!map.has(key)) map.set(key, { title: i.title, dueAt: i.dueAt });
    });
    const list = Array.from(map.values()).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    return { next: list[0] || null, count: list.length };
  }

  function courseTile(course, agenda) {
    const color = courseColor(course);
    const title = splitCourseTitle(course);
    const grade = courseGrade(course);
    const teacher = (course.teachers || [])[0];
    const { next, count } = nextForCourse(course, agenda);
    const due = next ? dueMeta(next.dueAt) : null;
    return `<a class="course-tile" href="#/course/${esc(course.id)}" style="--c:${color}">
      <span class="ct-top">
        <span class="ct-code">${esc(courseCode(course) || '课程')}</span>
        ${course.is_favorite ? '<span class="ct-star" title="已收藏">★</span>' : ''}
        <span class="ct-grade">${grade.score != null ? `${esc(formatScore(grade.score))}<small>%${grade.grade ? ' · ' + esc(grade.grade) : ''}</small>` : '<small>暂无成绩</small>'}</span>
      </span>
      <span class="ct-name">${esc(title.name)}</span>
      <span class="ct-meta">${esc([teacher && teacher.display_name, course.term && course.term.name].filter(Boolean).join(' · '))}</span>
      <span class="ct-next">${next
        ? `${icon('clock')}<span class="ct-next-title">${esc(next.title)}</span><span class="due due-${due.tone}">${esc(due.label)}</span>${count > 1 ? `<span class="ct-more">+${count - 1}</span>` : ''}`
        : `${icon('check')}<span class="muted">近期没有要交的</span>`}</span>
    </a>`;
  }

  /* ============================ 页面：课程详情 ============================ */

  async function courseView({ params, query, seq, force, keepScroll }) {
    const courseId = params[0];
    const tab = courseTab(query);
    if (!keepScroll) app.innerHTML = skeleton('page');

    if (!findCourse(courseId) || force) {
      const res = await settle(loadCourses(force));
      if (stale(seq)) return;
      if (!res.ok && !findCourse(courseId)) {
        if (handleAuthError(res.error)) return;
        app.innerHTML = `<div class="page">${errorBox(res.error)}</div>`;
        return;
      }
    }
    const course = findCourse(courseId);
    if (!course) {
      app.innerHTML = `<div class="page">${emptyState('book', '找不到这门课', '可能已经结课，或者你不在这门课里', '<a class="btn" href="#/courses">返回课程</a>')}</div>`;
      return;
    }
    updateChrome();

    const color = courseColor(course);
    const title = splitCourseTitle(course);
    const grade = courseGrade(course);
    const teacher = (course.teachers || [])[0];

    app.innerHTML = `
      <div class="page course-page" style="--c:${color}">
        <header class="course-head">
          <div class="ch-bar">
            <button class="icon-btn" data-action="back" data-fallback="#/courses" type="button" aria-label="返回" title="返回">${icon('left')}</button>
            <button class="ch-switch" data-action="switch-course" type="button" aria-haspopup="dialog">
              <span class="dot" style="--c:${color}"></span><span>${esc(courseCode(course) || '课程')}</span>${icon('down')}
            </button>
            <span class="ph-actions">
              <button class="icon-btn" data-action="refresh" type="button" aria-label="刷新" title="刷新">${icon('refresh')}</button>
              <a class="icon-btn" href="${esc(canvasHref(`/courses/${course.id}`))}" target="_blank" rel="noopener" aria-label="在 Canvas 中打开" title="在 Canvas 中打开">${icon('external')}</a>
            </span>
          </div>
          <div class="ch-main">
            <div class="ch-text">
              <p class="ch-code">${esc(title.code || course.course_code || '')}</p>
              <h1>${esc(title.name)}</h1>
              <p class="ch-meta">${esc([teacher && teacher.display_name, course.term && course.term.name].filter(Boolean).join(' · '))}</p>
            </div>
            ${grade.score != null ? `<a class="ch-grade" href="#/course/${course.id}?tab=grades" data-replace-route>
              <b>${esc(formatScore(grade.score))}<small>%</small></b><span>当前成绩${grade.grade ? ' · ' + esc(grade.grade) : ''}</span></a>` : ''}
          </div>
          <nav class="tabs" role="tablist" aria-label="课程栏目">
            ${COURSE_TABS.map(([key, label]) => `<a role="tab" aria-selected="${tab === key}" data-replace-route class="${tab === key ? 'on' : ''}"
              href="#/course/${course.id}${key === 'overview' ? '' : '?tab=' + key}">${label}</a>`).join('')}
          </nav>
        </header>
        <div id="course-body" class="course-body">${keepScroll ? '' : skeleton('list')}</div>
      </div>`;

    const body = $('#course-body');
    const load = (key, ttl, loader) => settle(cached(key, ttl, loader, force));
    let html;
    if (tab === 'overview') {
      const [aRes, nRes] = await Promise.all([
        load(`assignments:${course.id}`, 60000, () => API.assignments(course.id)),
        load(`announcements:${course.id}`, 120000, () => API.announcements(course.id)),
      ]);
      if (stale(seq)) return;
      if (!aRes.ok && isAuthError(aRes.error)) return void handleAuthError(aRes.error);
      html = overviewHtml(course, aRes, nRes);
    } else if (tab === 'assignments') {
      const res = await load(`assignments:${course.id}`, 60000, () => API.assignments(course.id));
      if (stale(seq)) return;
      html = res.ok ? assignmentsHtml(res.data, course, query.get('filter')) : errorBox(res.error);
      if (!res.ok && handleAuthError(res.error)) return;
    } else if (tab === 'announcements') {
      const res = await load(`announcements:${course.id}`, 120000, () => API.announcements(course.id));
      if (stale(seq)) return;
      html = res.ok ? courseAnnouncementsHtml(res.data, course) : errorBox(res.error);
      if (!res.ok && handleAuthError(res.error)) return;
    } else if (tab === 'modules') {
      const res = await load(`modules:${course.id}`, 120000, () => API.modules(course.id));
      if (stale(seq)) return;
      html = res.ok ? modulesHtml(res.data, course, query.get('module')) : errorBox(res.error);
      if (!res.ok && handleAuthError(res.error)) return;
    } else {
      // 优先用作业分组算占比；拿不到分组（学校关了接口等）就退回只列已评分作业
      const res = await load(`groups:${course.id}`, 60000, () => API.assignmentGroups(course.id));
      if (stale(seq)) return;
      if (!res.ok && handleAuthError(res.error)) return;
      if (res.ok && window.CanvasGrades) {
        html = gradeBreakdownHtml(res.data, course);
      } else {
        const fallback = await load(`assignments:${course.id}`, 60000, () => API.assignments(course.id));
        if (stale(seq)) return;
        if (!fallback.ok && handleAuthError(fallback.error)) return;
        html = fallback.ok ? courseGradesHtml(fallback.data, course) : errorBox(fallback.error);
      }
    }
    body.innerHTML = html;

    if (tab === 'modules' && query.get('module')) {
      const el = document.getElementById(`module-${query.get('module')}`);
      if (el) {
        el.classList.add('module-focus');
        setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
      }
    }
    // 顺手把这门课的其他栏目预取好，切标签时秒开
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
    idle(() => {
      prefetchKey(`modules:${course.id}`, () => API.modules(course.id));
      prefetchKey(`announcements:${course.id}`, () => API.announcements(course.id));
      prefetchKey(`assignments:${course.id}`, () => API.assignments(course.id));
    });
  }

  function overviewHtml(course, aRes, nRes) {
    const assignments = aRes.ok ? aRes.data || [] : [];
    const now = new Date();
    const upcoming = assignments.filter((a) => a.due_at && new Date(a.due_at) > now && !submissionState(a.submission).done)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
    const missing = assignments.filter((a) => {
      const st = submissionState(a.submission);
      return !st.done && (a.submission && a.submission.missing || (a.due_at && new Date(a.due_at) < now && a.submission_types && !a.submission_types.includes('none')));
    });
    const graded = assignments.filter((a) => a.submission && a.submission.score != null);
    const anns = nRes.ok ? (nRes.data || []).map((a) => normalizeAnnouncement(a, course.id)) : [];
    const grade = courseGrade(course);

    return `
      <div class="overview-grid">
        <div class="ov-stats">
          <a class="stat stat-accent" href="#/course/${course.id}?tab=assignments&filter=todo" data-replace-route><b>${upcoming.length}</b><span>待完成</span></a>
          <a class="stat stat-danger ${missing.length ? '' : 'is-zero'}" href="#/course/${course.id}?tab=assignments&filter=todo" data-replace-route><b>${missing.length}</b><span>逾期 / 缺交</span></a>
          <a class="stat stat-ok" href="#/course/${course.id}?tab=grades" data-replace-route><b>${grade.score != null ? esc(formatScore(grade.score)) : '—'}</b><span>当前成绩</span></a>
          <a class="stat stat-info" href="#/course/${course.id}?tab=grades" data-replace-route><b>${graded.length}</b><span>已出分</span></a>
        </div>

        <section class="section">
          <div class="section-head"><h2>接下来</h2><a class="section-link" href="#/course/${course.id}?tab=assignments" data-replace-route>全部作业 ${icon('right')}</a></div>
          ${!aRes.ok ? errorBox(aRes.error) : upcoming.length
            ? `<div class="card list">${upcoming.slice(0, 4).map((a) => assignmentRow(a, course, 'overview')).join('')}</div>`
            : emptyState('check', '这门课近期没有要交的', '')}
        </section>

        <section class="section">
          <div class="section-head"><h2>最新公告</h2><a class="section-link" href="#/course/${course.id}?tab=announcements" data-replace-route>全部 ${icon('right')}</a></div>
          ${anns.length ? `<div class="card list">${anns.slice(0, 3).map((a) => announcementRow(a, 'overview', false)).join('')}</div>`
            : `<p class="empty-inline">${nRes.ok ? '还没有公告' : '公告暂时没加载出来'}</p>`}
        </section>

        <section class="section">
          <div class="section-head"><h2>课程资料</h2></div>
          <div class="quick-links">
            <a class="quick" href="#/course/${course.id}/front?from=overview">${icon('home')}<span><b>课程主页</b><small>老师写的课程说明</small></span>${icon('right', 'row-arrow')}</a>
            <a class="quick" href="#/course/${course.id}?tab=modules" data-replace-route>${icon('layers')}<span><b>模块</b><small>讲义、页面、文件</small></span>${icon('right', 'row-arrow')}</a>
          </div>
        </section>
      </div>`;
  }

  function assignmentsHtml(assignments, course, filter) {
    const all = (assignments || []).slice().sort((a, b) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return da - db;
    });
    if (!all.length) return emptyState('check', '这门课还没有作业', '老师发布后会出现在这里');
    const mode = ['todo', 'done'].includes(filter) ? filter : 'all';
    const list = all.filter((a) => {
      const done = submissionState(a.submission).done;
      return mode === 'all' || (mode === 'todo' ? !done : done);
    });
    const counts = {
      all: all.length,
      todo: all.filter((a) => !submissionState(a.submission).done).length,
      done: all.filter((a) => submissionState(a.submission).done).length,
    };

    const now = Date.now();
    const groups = [
      { label: '已截止', items: [] },
      { label: '未来 7 天', items: [] },
      { label: '更晚', items: [] },
      { label: '无截止时间', items: [] },
    ];
    list.forEach((a) => {
      if (!a.due_at) groups[3].items.push(a);
      else {
        const diff = new Date(a.due_at).getTime() - now;
        if (diff < 0) groups[0].items.push(a);
        else if (diff < 7 * DAY) groups[1].items.push(a);
        else groups[2].items.push(a);
      }
    });
    // 已截止的倒序：最近截止的在上面
    groups[0].items.reverse();
    const order = [groups[1], groups[2], groups[0], groups[3]];

    return `
      <div class="filter-row" role="group" aria-label="筛选作业">
        ${[['all', '全部'], ['todo', '待完成'], ['done', '已完成']].map(([key, label]) => `
          <a class="filter ${mode === key ? 'on' : ''}" data-replace-route href="#/course/${course.id}?tab=assignments${key === 'all' ? '' : '&filter=' + key}">${label}<span>${counts[key]}</span></a>`).join('')}
      </div>
      ${list.length ? order.filter((g) => g.items.length).map((group) => `
        <section class="section">
          <div class="section-head"><h2>${group.label}</h2><span class="section-count">${group.items.length}</span></div>
          <div class="card list">${group.items.map((a) => assignmentRow(a, course, 'assignments')).join('')}</div>
        </section>`).join('') : emptyState('check', mode === 'todo' ? '全部完成了' : '还没有完成的作业', '')}
      ${all.truncated ? '<p class="empty-inline">作业较多，只显示了前一部分</p>' : ''}`;
  }

  function assignmentRow(assignment, course, from) {
    const st = submissionState(assignment.submission);
    const due = dueMeta(assignment.due_at, st.done);
    const quiz = assignment.submission_types && assignment.submission_types.includes('online_quiz');
    const score = assignment.submission && assignment.submission.score != null
      ? `<span class="row-score">${esc(formatScore(assignment.submission.score))}<small>/${esc(formatScore(assignment.points_possible))}</small></span>` : '';
    return `<a class="row assignment-row ${st.done ? 'is-done' : ''}" href="#/course/${course.id}/a/${assignment.id}?from=${from}">
      <span class="row-ico ${st.done ? 'tone-ok' : due.tone === 'danger' ? 'tone-danger' : ''}">${st.done ? icon('check') : icon(quiz ? 'quiz' : 'pen')}</span>
      <span class="row-main">
        <span class="row-title">${esc(assignment.name || '未命名作业')}</span>
        <span class="row-meta"><span class="due due-${due.tone}">${esc(due.label)}</span><span>${esc(pointsText(assignment.points_possible))}</span></span>
      </span>
      ${score || chip(st.tone, st.label)}
    </a>`;
  }

  function announcementRow(a, from, showCourse) {
    return `<a class="row ann-row" href="#/course/${esc(a.courseId)}/ann/${esc(a.id)}?from=${from}">
      <span class="mini-dot ${isUnread(a) ? 'unread' : ''}"></span>
      <span class="row-main">
        <span class="row-title">${esc(a.title)}</span>
        <span class="row-excerpt">${esc(htmlToText(a.message, 120))}</span>
        <span class="row-meta">${showCourse ? courseTag(a.courseId) : ''}${a.author ? `<span>${esc(a.author)}</span>` : ''}<span>${esc(fmtRelative(a.postedAt))}</span></span>
      </span>
    </a>`;
  }

  function courseAnnouncementsHtml(list, course) {
    const items = (list || []).map((a) => normalizeAnnouncement(a, course.id))
      .sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));
    if (!items.length) return emptyState('megaphone', '还没有公告', '');
    return `<div class="card list">${items.map((a) => announcementRow(a, 'announcements', false)).join('')}</div>`;
  }

  function modulesHtml(modules, course, focusId) {
    const list = (modules || []).filter(Boolean);
    if (!list.length) return emptyState('layers', '还没有课程模块', '老师整理好资料后会出现在这里');
    return `
      <div class="module-tools"><button class="btn btn-ghost btn-sm" data-action="modules-toggle" type="button">全部展开 / 收起</button></div>
      <div class="stack">${list.map((m, index) => `
      <details class="card module" id="module-${esc(m.id)}" ${index === 0 || String(m.id) === String(focusId) ? 'open' : ''}>
        <summary>
          <span class="module-name">${esc(m.name || `模块 ${index + 1}`)}</span>
          <span class="module-count">${(m.items || []).filter((i) => String(i.type).toLowerCase() !== 'subheader').length} 项</span>
          ${icon('down', 'module-caret')}
        </summary>
        <div class="module-items">
          ${(m.items || []).map((item) => moduleItemRow(item, course)).join('') || '<p class="empty-inline">这个模块还没有内容</p>'}
        </div>
      </details>`).join('')}</div>`;
  }

  function moduleItemRow(item, course) {
    const type = String(item.type || '').toLowerCase();
    const title = esc(item.title || '');
    const indent = item.indent ? ` style="--indent:${Math.min(4, item.indent)}"` : '';
    if (type === 'subheader') return `<div class="module-sub">${title}</div>`;

    const fileButton = (id, href) => `<button class="module-item" data-action="download-file" type="button"
        data-file="${esc(id)}" data-name="${esc(item.title || '文件')}" data-href="${esc(href || '')}"${indent}>
        <span class="mi-ico">${icon('file')}</span><span class="mi-title">${title}</span><span class="mi-type">文件</span>${icon('download', 'row-arrow')}
      </button>`;
    const pageLink = (courseId, slug) => `<a class="module-item" href="#/course/${courseId}/page/${encodeURIComponent(slug)}?from=modules"${indent}>
        <span class="mi-ico">${icon('page')}</span><span class="mi-title">${title}</span><span class="mi-type">页面</span>${icon('right', 'row-arrow')}
      </a>`;

    // 文件：站内直接下载（拿 Canvas 的签名链接）
    if (type === 'file' && item.content_id) return fileButton(item.content_id, item.html_url);
    // 页面 / 作业：站内打开
    const pageSlug = item.page_url || (item.url || '').split('/pages/')[1];
    if (type === 'page' && pageSlug && course) return pageLink(course.id, pageSlug);
    if (type === 'assignment' && item.content_id && course) {
      return `<a class="module-item" href="#/course/${course.id}/a/${esc(item.content_id)}?from=modules"${indent}>
        <span class="mi-ico">${icon('pen')}</span><span class="mi-title">${title}</span><span class="mi-type">作业</span>${icon('right', 'row-arrow')}
      </a>`;
    }
    if (type === 'externalurl' && (item.external_url || item.url)) {
      const target = internalTargetFromUrl(item.external_url || item.url);
      if (target && target.kind === 'page') return pageLink(target.courseId, target.slug);
      if (target && target.kind === 'file') return fileButton(target.id, item.external_url || item.url);
    }

    const label = { assignment: '作业', quiz: '测验', file: '文件', page: '页面', discussion: '讨论', externaltool: '工具', externalurl: '链接' }[type] || '内容';
    const ic = { quiz: 'quiz', discussion: 'chat', assignment: 'pen' }[type] || 'external';
    const href = item.external_url || (item.html_url ? canvasHref(item.html_url) : '');
    if (!href) return `<div class="module-item"${indent}><span class="mi-ico">${icon(ic)}</span><span class="mi-title">${title}</span><span class="mi-type">${label}</span></div>`;
    return `<a class="module-item" href="${esc(href)}" target="_blank" rel="noopener"${indent}>
      <span class="mi-ico">${icon(ic)}</span><span class="mi-title">${title}</span><span class="mi-type">${label}</span>${icon('external', 'row-arrow')}
    </a>`;
  }

  /* ---------- 成绩构成：每项占比 + 已得分 ---------- */

  function fmtPct(value) {
    if (value == null || !Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    const text = abs >= 10 ? value.toFixed(1) : value.toFixed(2);
    return text.replace(/\.?0+$/, '') || '0';
  }

  const GRADE_TARGETS = [50, 65, 75, 85];

  function gradeBreakdownHtml(groups, course) {
    const r = window.CanvasGrades.computeCourseGrade(groups, { weighted: !!course.apply_assignment_group_weights });
    const canvas = courseGrade(course);
    const counting = r.groups.some((g) => g.items.some((x) => x.state === 'graded' || x.state === 'pending'));
    if (!counting) {
      return `${canvas.score != null ? `<div class="grade-hero card"><div><p class="muted">Canvas 当前成绩</p><p class="big-score">${esc(formatScore(canvas.score))}<small>%</small></p></div></div>` : ''}
        ${emptyState('chart', '这门课还没有计分的作业', '老师发布带分值的作业后，这里会算出每项占比')}`;
    }
    const color = courseColor(course);
    const differs = canvas.score != null && r.current != null && Math.abs(canvas.score - r.current) >= 0.1;
    const w = (x) => Math.max(0, Math.min(100, x));

    const targets = GRADE_TARGETS.map((t) => {
      const need = r.needed(t);
      let text;
      let tone;
      if (need === 0) { text = '已稳拿'; tone = 'ok'; }
      else if (need > 100) { text = '已无法达到'; tone = 'muted'; }
      else { text = `剩余平均需 ${fmtPct(need)}%`; tone = need > 85 ? 'danger' : need > 65 ? 'warn' : 'normal'; }
      return `<div class="target tone-${tone}"><b>${t}</b><span>${esc(text)}</span></div>`;
    }).join('');

    const summary = `<div class="card grade-calc" style="--c:${color}">
      <div class="gc-top">
        <div>
          <p class="muted">当前得分 <small>（只按已评分作业）</small></p>
          <p class="big-score">${r.current != null ? esc(fmtPct(r.current)) + '<small>%</small>' : '—'}</p>
          ${canvas.score != null ? `<p class="muted gc-canvas">Canvas 显示 ${esc(formatScore(canvas.score))}%${canvas.grade ? ' · ' + esc(canvas.grade) : ''}${differs ? '（Canvas 可能还用了这里拿不到的规则，以 Canvas 为准）' : ''}</p>` : ''}
        </div>
        <div class="gh-side">
          <p>${r.weighted ? '按分组加权' : '按分值合计'}</p>
          <p>已评分 <b>${esc(fmtPct(r.gradedWeight))}%</b> / 100%</p>
        </div>
      </div>
      <div class="gc-bar" role="img" aria-label="总评构成：已拿到 ${esc(fmtPct(r.earned))}%，已扣 ${esc(fmtPct(r.lost))}%，未评分 ${esc(fmtPct(r.remaining))}%">
        <span class="gc-earned" style="width:${w(r.earned)}%"></span><span class="gc-lost" style="width:${w(r.lost)}%"></span>
      </div>
      <div class="gc-legend">
        <span><i class="gc-earned"></i>已拿到 <b>${esc(fmtPct(r.earned))}%</b></span>
        <span><i class="gc-lost"></i>已扣 <b>${esc(fmtPct(r.lost))}%</b></span>
        <span><i class="gc-rest"></i>未评分 <b>${esc(fmtPct(r.remaining))}%</b></span>
      </div>
      ${r.remaining > 0 || r.earned < GRADE_TARGETS[GRADE_TARGETS.length - 1] ? `<p class="gc-sub">总评要达到…</p><div class="targets">${targets}</div>` : ''}
    </div>`;

    const STATE = {
      graded: null, pending: ['muted', '未评分'], excused: ['muted', '免交'], excluded: ['muted', '不计入'], dropped: ['warn', '已丢弃'],
    };
    const groupsHtml = r.groups.filter((g) => g.items.length).map((g) => {
      const rules = [];
      if (g.rules && g.rules.drop_lowest) rules.push(`去掉最低 ${g.rules.drop_lowest} 次`);
      if (g.rules && g.rules.drop_highest) rules.push(`去掉最高 ${g.rules.drop_highest} 次`);
      return `<section class="section grade-group">
        <div class="section-head">
          <h2>${esc(g.name)}</h2>
          <span class="gg-meta">占总评 <b>${esc(fmtPct(g.weight))}%</b>${g.pct != null ? ` · 组内 ${esc(fmtPct(g.pct))}%` : ''}</span>
        </div>
        <div class="gg-bar"><span style="width:${g.weight > 0 ? w((g.earned / g.weight) * 100) : 0}%"></span></div>
        <p class="gg-note">已拿到 ${esc(fmtPct(g.earned))}% / ${esc(fmtPct(g.weight))}%${rules.length ? ' · ' + esc(rules.join('，')) : ''}</p>
        <div class="card list">${g.items.map((x) => {
          const st = STATE[x.state];
          const counts = x.state === 'graded' || x.state === 'pending';
          return `<a class="row grade-item ${counts ? '' : 'is-done'}" href="#/course/${course.id}/a/${esc(x.id)}?from=grades">
            <span class="row-main">
              <span class="row-title">${esc(x.name)}</span>
              <span class="row-meta">
                <span>占总评 <b>${counts ? esc(fmtPct(x.weight)) + '%' : '—'}</b></span>
                ${x.state === 'graded' ? `<span>已得 <b class="t-ok">${esc(fmtPct(x.earned))}%</b></span>` : ''}
                ${st ? chip(st[0], st[1]) : ''}
              </span>
            </span>
            <span class="gr-num">${x.score != null
              ? `<b>${esc(formatScore(x.score))}</b><small>/ ${esc(formatScore(x.possible))}</small>${x.pct != null ? `<em>${esc(fmtPct(x.pct))}%</em>` : ''}`
              : `<small>满分 ${esc(formatScore(x.possible))}</small>`}</span>
          </a>`;
        }).join('')}</div>
      </section>`;
    }).join('');

    return summary + groupsHtml + `<p class="page-foot">占比按 Canvas 里的作业分组${r.weighted ? '权重' : '分值'}计算；去分规则只按已评分作业估算。最终成绩以 Canvas 为准。</p>`;
  }

  function courseGradesHtml(assignments, course) {
    const list = (assignments || []).filter((a) => a.submission && (a.submission.score != null || a.submission.grade != null))
      .sort((a, b) => new Date(b.submission.graded_at || b.due_at || 0) - new Date(a.submission.graded_at || a.due_at || 0));
    const grade = courseGrade(course);
    const pcts = list.filter((a) => a.points_possible > 0 && a.submission.score != null).map((a) => (a.submission.score / a.points_possible) * 100);
    const avg = pcts.length ? pcts.reduce((s, x) => s + x, 0) / pcts.length : null;
    const summary = `<div class="grade-hero card">
      <div><p class="muted">当前成绩</p><p class="big-score">${grade.score != null ? esc(formatScore(grade.score)) + '<small>%</small>' : '—'}</p>${grade.grade ? `<p class="muted">等级 ${esc(grade.grade)}</p>` : ''}</div>
      <div class="gh-side"><p><b>${list.length}</b> 次已评分</p>${avg != null ? `<p>作业平均 <b>${avg.toFixed(1)}%</b></p>` : ''}</div>
    </div>`;
    if (!list.length) return summary + emptyState('chart', '还没有已评分的作业明细', '老师评分后会出现在这里');
    return summary + `<div class="card list">${list.map((a) => {
      const score = a.submission.score;
      const possible = a.points_possible || 0;
      const pct = possible > 0 && score != null ? Math.max(0, Math.min(100, (score / possible) * 100)) : null;
      return `<a class="row grade-row" href="#/course/${course.id}/a/${a.id}?from=grades">
        <span class="row-main">
          <span class="row-title">${esc(a.name)}</span>
          <span class="bar"><span style="width:${pct == null ? 0 : pct}%"></span></span>
        </span>
        <span class="gr-num"><b>${score != null ? esc(formatScore(score)) : esc(a.submission.grade || '—')}</b><small>/ ${esc(formatScore(possible))}</small>${pct != null ? `<em>${pct.toFixed(0)}%</em>` : ''}</span>
      </a>`;
    }).join('')}</div>`;
  }

  /* ============================ 页面：公告 ============================ */

  async function feedView({ query, seq, force, keepScroll }) {
    if (!keepScroll) app.innerHTML = skeleton('page');
    const cRes = await settle(loadCourses(force));
    if (stale(seq)) return;
    if (!cRes.ok) {
      if (handleAuthError(cRes.error)) return;
      app.innerHTML = `<div class="page">${pageHeader('公告')}${errorBox(cRes.error)}</div>`;
      return;
    }
    const courses = state.courses || [];
    const res = await settle(loadFeed(courses, force));
    if (stale(seq)) return;
    if (!res.ok && handleAuthError(res.error)) return;

    const filter = query.get('course') || '';
    const all = res.ok ? res.data.map((a) => normalizeAnnouncement(a)).sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0)) : [];
    const list = filter ? all.filter((a) => String(a.courseId) === filter) : all;
    const unread = all.filter(isUnread).length;

    app.innerHTML = `
      <div class="page page-feed">
        ${pageHeader('公告', {
          sub: res.ok ? `最近 45 天 · ${unread ? `<b class="t-accent">${unread} 条未读</b> · <button class="link-btn" data-action="mark-all-read" type="button">全部标为已读</button>` : '全部已读'}` : '',
        })}
        <div class="chip-scroll" role="group" aria-label="按课程筛选">
          <a class="filter ${filter ? '' : 'on'}" href="#/feed" data-replace-route>全部<span>${all.length}</span></a>
          ${courses.map((c) => {
            const n = all.filter((a) => String(a.courseId) === String(c.id)).length;
            return `<a class="filter ${filter === String(c.id) ? 'on' : ''}" href="#/feed?course=${c.id}" data-replace-route>
              <i class="dot" style="--c:${courseColor(c)}"></i>${esc(courseCode(c))}<span>${n}</span></a>`;
          }).join('')}
        </div>
        ${!res.ok ? errorBox(res.error) : list.length
          ? `<div class="card list feed-list">${list.map((a) => announcementRow(a, 'feed', true)).join('')}</div>`
          : emptyState('megaphone', '没有公告', filter ? '这门课最近 45 天没有发公告' : '最近 45 天各门课都没有发公告')}
      </div>`;
  }

  /* ============================ 页面：成绩 ============================ */

  async function gradesView({ seq, force, keepScroll }) {
    if (!keepScroll) app.innerHTML = skeleton('page');
    const res = await settle(loadCourses(force));
    if (stale(seq)) return;
    if (!res.ok) {
      if (handleAuthError(res.error)) return;
      app.innerHTML = `<div class="page">${pageHeader('成绩')}${errorBox(res.error)}</div>`;
      return;
    }
    const courses = state.courses || [];

    // 成绩构成估算：和课程成绩页同一套算法，主分数仍用 Canvas 官方成绩
    const estimates = new Map();
    await Promise.all(courses.map(async (c) => {
      try {
        const groups = await cached(`groups:${c.id}`, 300000, () => API.assignmentGroups(c.id), force);
        const r = window.CanvasGrades.computeCourseGrade(groups, { weighted: !!c.apply_assignment_group_weights });
        if (r && r.current != null) estimates.set(String(c.id), r.current);
      } catch (e) { /* 拿不到作业分组就不显示估算 */ }
    }));
    if (stale(seq)) return;

    // 主分数：Canvas 官方分优先，没有官方分时用构成估算补位
    const effective = new Map();
    courses.forEach((c) => {
      const official = courseGrade(c).score;
      const est = estimates.has(String(c.id)) ? estimates.get(String(c.id)) : null;
      effective.set(String(c.id), { score: official != null ? official : est, official, est });
    });
    const graded = courses.filter((c) => effective.get(String(c.id)).score != null);
    const avg = graded.length ? graded.reduce((s, c) => s + effective.get(String(c.id)).score, 0) / graded.length : null;
    const best = graded.slice().sort((a, b) => effective.get(String(b.id)).score - effective.get(String(a.id)).score)[0];
    const estimatedCount = graded.filter((c) => effective.get(String(c.id)).official == null).length;

    // 最近出分：用已经缓存的各课作业数据，不额外发请求
    const recent = [];
    courses.forEach((c) => {
      (peek(`assignments:${c.id}`) || []).forEach((a) => {
        if (a.submission && a.submission.score != null) recent.push({ a, c, at: a.submission.graded_at || a.submission.submitted_at || a.due_at });
      });
    });
    recent.sort((x, y) => new Date(y.at || 0) - new Date(x.at || 0));

    app.innerHTML = `
      <div class="page">
        ${pageHeader('成绩', { sub: `${graded.length} / ${courses.length} 门已出分` })}
        ${!courses.length ? emptyState('chart', '还没有课程', '') : `
        <div class="grade-overview">
          <div class="card grade-hero">
            <div><p class="muted">平均分${estimatedCount ? '（含构成估算）' : '（已出分课程）'}</p><p class="big-score">${avg != null ? avg.toFixed(1) + '<small>%</small>' : '—'}</p></div>
            ${best ? `<div class="gh-side"><p>最高</p><p><b>${esc(courseCode(best))}</b> · ${esc(formatScore(effective.get(String(best.id)).score))}%</p></div>` : ''}
          </div>
          <div class="card list grade-courses">
            ${courses.map((c) => {
              const g = courseGrade(c);
              const e = effective.get(String(c.id));
              const score = e.score;
              const showsEstimate = e.official == null && e.est != null;
              return `<a class="row grade-row" href="#/course/${c.id}?tab=grades" style="--c:${courseColor(c)}">
                <span class="dot" style="--c:${courseColor(c)}"></span>
                <span class="row-main">
                  <span class="row-title">${esc(splitCourseTitle(c).name)}</span>
                  <span class="bar"><span style="width:${score != null ? Math.max(2, Math.min(100, score)) : 0}%"></span></span>
                  <span class="row-meta">
                    <span>${esc(courseCode(c))}</span>
                    ${g.grade ? `<span>${esc(g.grade)}</span>` : ''}
                    ${showsEstimate ? '<span>Canvas 暂无分数 · 按构成估算</span>' : (e.est != null ? `<span>构成估算 ${esc(fmtPct(e.est))}%</span>` : '')}
                  </span>
                </span>
                <span class="gr-num">${showsEstimate ? '<em class="est-tag">估算</em>' : ''}<b>${score != null ? esc(formatScore(score)) : '—'}</b>${score != null ? '<small>%</small>' : ''}</span>
              </a>`;
            }).join('')}
          </div>
          <p class="page-foot">主分数优先用 Canvas 官方成绩；官方没有分数时用「构成估算」补位（按作业分组权重与已评分作业计算）。</p>
        </div>
        ${recent.length ? `<section class="section">
          <div class="section-head"><h2>最近出分</h2></div>
          <div class="card list">${recent.slice(0, 8).map(({ a, c }) => {
            const pct = a.points_possible > 0 ? (a.submission.score / a.points_possible) * 100 : null;
            return `<a class="row" href="#/course/${c.id}/a/${a.id}?from=grades">
              <span class="row-main"><span class="row-title">${esc(a.name)}</span><span class="row-meta">${courseTag(c.id)}${a.submission.graded_at ? `<span>${esc(fmtRelative(a.submission.graded_at))}</span>` : ''}</span></span>
              <span class="row-score">${esc(formatScore(a.submission.score))}<small>/${esc(formatScore(a.points_possible))}</small>${pct != null ? `<em>${pct.toFixed(0)}%</em>` : ''}</span>
            </a>`;
          }).join('')}</div>
        </section>` : ''}`}
      </div>`;
    prefetchCourses(courses);
  }

  /* ============================ 页面：设置 ============================ */

  async function meView({ seq }) {
    const res = await settle(ensureProfile(false));
    if (stale(seq)) return;
    if (!res.ok && handleAuthError(res.error)) return;
    const profile = res.ok ? res.data : state.profile;
    const local = API.isLocalServer();
    const theme = config.theme || 'auto';

    app.innerHTML = `
      <div class="page page-me">
        ${pageHeader('设置')}
        <section class="card profile-card">
          <span class="avatar">${avatarHtml(profile, 56)}</span>
          <div class="profile-main">
            <p class="profile-name">${esc(fullName(profile))}</p>
            <p class="profile-sub">${esc((profile && (profile.login_id || profile.email)) || '')}</p>
          </div>
        </section>

        <section class="section">
          <div class="section-head"><h2>偏好</h2></div>
          <div class="card list">
            <div class="setting-row">
              <span class="setting-label">外观</span>
              <div class="seg" role="group" aria-label="外观">
                ${[['auto', '跟随系统', 'monitor'], ['light', '浅色', 'sun'], ['dark', '深色', 'moon']].map(([key, label, ic]) => `
                  <button class="seg-btn ${theme === key ? 'on' : ''}" data-action="theme" data-value="${key}" type="button">${icon(ic)}<span>${label}</span></button>`).join('')}
              </div>
            </div>
            <label class="setting-row">
              <span class="setting-label">「今天」里隐藏已完成的事项</span>
              <span class="switch"><input type="checkbox" data-action="toggle-done" ${state.prefs.hideDone ? 'checked' : ''}><span></span></span>
            </label>
            <button class="setting-row as-button" data-action="clear-cache" type="button">
              <span class="setting-label">清除本地缓存</span><span class="setting-value">${icon('refresh')}</span>
            </button>
            <button class="setting-row as-button" data-action="hard-reload" type="button">
              <span class="setting-label">强制更新到最新版</span><span class="setting-value">v${VERSION} ${icon('refresh')}</span>
            </button>
          </div>
        </section>

        <section class="section">
          <div class="section-head"><h2>连接</h2></div>
          <div class="card list">
            <div class="setting-row"><span class="setting-label">Canvas 地址</span><span class="setting-value mono">${esc(config.baseUrl || '未设置')}</span></div>
            <div class="setting-row"><span class="setting-label">令牌</span><span class="setting-value mono">••••${esc((config.token || '').slice(-4))}</span></div>
            <div class="setting-row"><span class="setting-label">连接方式</span><span class="setting-value">${local && !config.proxyUrl ? '本机代理' : config.proxyUrl ? '云端代理' : '直连'}</span></div>
            ${config.proxyUrl ? `<div class="setting-row"><span class="setting-label">代理地址</span><span class="setting-value mono">${esc(config.proxyUrl)}</span></div>` : ''}
          </div>
        </section>

        <section class="section">
          <div class="section-head"><h2>帮助</h2></div>
          <div class="card list">
            <details class="help-row"><summary>快捷键</summary><div class="help-body">
              <p><kbd>/</kbd> 或 <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> 搜索；<kbd>Esc</kbd> 关闭详情面板或弹窗。</p></div></details>
            <details class="help-row"><summary>令牌会过期吗？怎么换？</summary><div class="help-body">
              <p>在 Canvas 生成令牌时把 <b>Expires</b> 留空，令牌就长期有效。要换令牌：Canvas → Account → Settings → 删除旧令牌 → 新建，然后回这里重新登录。</p></div></details>
            <details class="help-row"><summary>为什么网页版需要代理？</summary><div class="help-body">
              <p>Canvas 的 API 默认不允许别的网站直接读取（CORS 限制）。本地运行时由 <code>server/server.mjs</code> 转发；在线版由同源的 Cloudflare 代理转发。</p></div></details>
            <details class="help-row"><summary>数据安全吗？</summary><div class="help-body">
              <p>令牌保存在此浏览器。代理读取数据时会将令牌转发给 Canvas。请使用自己管理或信任的部署，公共电脑上用完请退出登录。</p></div></details>
            <details class="help-row"><summary>装到手机桌面</summary><div class="help-body">
              <p>Chrome 菜单 → <b>添加到主屏幕</b>；Safari → 分享 → <b>添加到主屏幕</b>。装好后像 App 一样全屏打开，离线也能看到上次的数据。</p></div></details>
          </div>
        </section>

        <button class="btn btn-danger btn-block" data-action="logout" type="button">${icon('logout')} 退出登录 / 换账号</button>
        <p class="page-foot">Canvas Lite v${VERSION} · 非官方客户端，只读取你自己的 Canvas 数据</p>
      </div>`;
  }

  /* ============================ 详情面板 ============================ */

  function openPanel() {
    const dock = dockQuery.matches;
    root.classList.toggle('panel-dock', dock);
    if (!panel.hidden) return;
    panel.hidden = false;
    scrim.hidden = dock;
    root.classList.add('panel-open');
    requestAnimationFrame(() => panel.classList.add('in'));
  }

  function closePanel() {
    if (panel.hidden) return;
    ++state.panelSeq;
    panel.classList.remove('in');
    panel.hidden = true;
    scrim.hidden = true;
    root.classList.remove('panel-open', 'panel-dock');
    panelBody.innerHTML = '';
    $$('.row.is-active').forEach((el) => el.classList.remove('is-active'));
  }

  function highlightActiveRow() {
    $$('#app .is-active').forEach((el) => el.classList.remove('is-active'));
    const path = location.hash.split('?')[0];
    $$('#app a[href^="#/course/"]').forEach((a) => {
      if (a.getAttribute('href').split('?')[0] === path) a.classList.add('is-active');
    });
  }

  async function renderDetail(detail, route) {
    const seq = ++state.panelSeq;
    panelBody.innerHTML = panelBar(detail.params[0]) + skeleton('panel');
    panelBody.scrollTop = 0;
    highlightActiveRow();
    try {
      if (!state.courses) await settle(loadCourses(false));
      if (seq !== state.panelSeq) return;
      await detail.view({ params: detail.params, query: route.query, seq });
    } catch (err) {
      if (seq !== state.panelSeq) return;
      if (handleAuthError(err)) return;
      panelBody.innerHTML = panelBar(detail.params[0]) + `<div class="panel-pad">${errorBox(err)}</div>`;
    }
    if (seq === state.panelSeq) {
      const heading = $('#panel-body h1');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  function panelBar(courseId, externalHref) {
    const course = findCourse(courseId);
    const prev = history.state && history.state.canvasLiteFrom;
    const canStepBack = isDetailHash(prev);
    return `<div class="panel-bar">
      <button class="icon-btn panel-back ${canStepBack ? 'can-step' : ''}" data-action="panel-back" type="button" aria-label="返回" title="返回">${icon('left')}</button>
      ${course ? `<a class="panel-course" href="#/course/${esc(course.id)}" style="--c:${courseColor(course)}"><span class="dot"></span>${esc(courseCode(course))}<span class="pc-name">${esc(splitCourseTitle(course).name)}</span></a>` : '<span></span>'}
      <span class="panel-actions">
        ${externalHref ? `<a class="icon-btn" href="${esc(externalHref)}" target="_blank" rel="noopener" aria-label="在 Canvas 中打开" title="在 Canvas 中打开">${icon('external')}</a>` : ''}
        <button class="icon-btn panel-close" data-action="panel-close" type="button" aria-label="关闭" title="关闭 (Esc)">${icon('close')}</button>
      </span>
    </div>`;
  }

  function panelStale(seq) {
    return seq !== state.panelSeq;
  }

  function panelError(courseId, err, href) {
    if (handleAuthError(err)) return;
    panelBody.innerHTML = panelBar(courseId, href) + `<div class="panel-pad">${errorBox(err)}</div>`;
  }

  async function assignmentDetail({ params, seq }) {
    const [courseId, assignmentId] = params;
    const fallback = canvasHref(`/courses/${courseId}/assignments/${assignmentId}`);
    // 课程作业列表里已经有这条：先秒开，再拿完整版
    const list = peek(`assignments:${courseId}`);
    const quick = Array.isArray(list) ? list.find((a) => String(a.id) === String(assignmentId)) : null;
    if (quick) panelBody.innerHTML = assignmentHtml(quick, courseId);
    const res = await settle(cached(`assignment:${courseId}:${assignmentId}`, 30000, () => API.assignment(courseId, assignmentId), true));
    if (panelStale(seq)) return;
    if (!res.ok) {
      if (quick && !isAuthError(res.error)) return;
      panelError(courseId, res.error, fallback);
      return;
    }
    const top = panelBody.scrollTop;
    panelBody.innerHTML = assignmentHtml(res.data, courseId);
    panelBody.scrollTop = top;
  }

  function assignmentHtml(a, courseId) {
    const st = submissionState(a.submission);
    const due = dueMeta(a.due_at, st.done);
    const href = canvasHref(a.html_url || `/courses/${courseId}/assignments/${a.id}`);
    const sub = a.submission || {};
    const attachments = a.attachments || [];
    const pct = sub.score != null && a.points_possible > 0 ? (sub.score / a.points_possible) * 100 : null;
    const types = (a.submission_types || []).map((t) => ({
      online_upload: '上传文件', online_text_entry: '在线文本', online_url: '网址', online_quiz: '在线测验',
      discussion_topic: '讨论', media_recording: '音视频', external_tool: '外部工具', on_paper: '纸质', none: '无需提交',
    }[t] || t)).join('、');

    return panelBar(courseId, href) + `
      <article class="panel-pad detail">
        <div class="chips">${chip(st.tone, st.label)}${sub.late ? chip('warn', '迟交') : ''}${chip('muted', pointsText(a.points_possible))}</div>
        <h1 tabindex="-1">${esc(a.name)}</h1>
        <dl class="facts">
          <div><dt>${icon('clock')} 截止</dt><dd class="${due.tone === 'danger' ? 't-danger' : ''}">${due.date ? esc(due.full) : '无截止时间'}${due.date ? `<small>${esc(fmtRelative(due.date))}</small>` : ''}</dd></div>
          ${a.lock_at ? `<div><dt>${icon('clock')} 关闭</dt><dd>${esc(fmtDateTime(a.lock_at))}</dd></div>` : ''}
          ${types ? `<div><dt>${icon('pen')} 提交方式</dt><dd>${esc(types)}</dd></div>` : ''}
          ${sub.submitted_at ? `<div><dt>${icon('check')} 已提交</dt><dd>${esc(fmtDateTime(sub.submitted_at))}</dd></div>` : ''}
          ${sub.score != null ? `<div><dt>${icon('chart')} 得分</dt><dd><b>${esc(formatScore(sub.score))}</b> / ${esc(formatScore(a.points_possible))}${pct != null ? ` <small>${pct.toFixed(0)}%</small>` : ''}</dd></div>` : ''}
        </dl>
        ${attachments.length ? `<div class="card list attach-list">
          ${attachments.map((f) => `<a class="row" href="${esc(f.url)}" target="_blank" rel="noopener">
            <span class="row-ico">${icon('file')}</span>
            <span class="row-main"><span class="row-title">${esc(f.filename || f.display_name || '附件')}</span><span class="row-meta"><span>${esc(f.content_type || '')}</span></span></span>
            ${icon('download', 'row-arrow')}</a>`).join('')}
        </div>` : ''}
        <div class="rich-text detail-desc">${a.description ? sanitizeHtml(a.description) : '<p class="muted">老师没有写作业说明。</p>'}</div>
        <div class="panel-cta">
          <a class="btn btn-primary btn-block" href="${esc(href)}" target="_blank" rel="noopener">在 Canvas 中提交 / 查看 ${icon('external')}</a>
          <p class="page-foot">Canvas Lite 只读：交作业、测验仍在 Canvas 完成。</p>
        </div>
      </article>`;
  }

  async function pageDetail({ params, seq }) {
    const courseId = params[0];
    let slug = params[1] || '';
    try { slug = decodeURIComponent(slug); } catch (e) { /* 保持原样 */ }
    const fallback = canvasHref(`/courses/${courseId}/pages/${slug}`);
    const res = await settle(cached(`page:${courseId}:${slug}`, 300000, () => API.page(courseId, slug)));
    if (panelStale(seq)) return;
    if (!res.ok) return void panelError(courseId, res.error, fallback);
    const page = res.data || {};
    panelBody.innerHTML = panelBar(courseId, canvasHref(page.html_url || fallback)) + `
      <article class="panel-pad detail">
        <p class="eyebrow">${icon('page')} 课程页面</p>
        <h1 tabindex="-1">${esc(page.title || '课程页面')}</h1>
        ${page.updated_at ? `<p class="detail-meta">${icon('clock')} 更新于 ${esc(fmtDateTime(page.updated_at))}</p>` : ''}
        <div class="rich-text detail-desc">${page.body ? sanitizeHtml(page.body) : '<p class="muted">这一页还没有内容。</p>'}</div>
      </article>`;
  }

  async function frontDetail({ params, seq }) {
    const courseId = params[0];
    const res = await settle(cached(`front:${courseId}`, 300000, () => API.frontPage(courseId)));
    if (panelStale(seq)) return;
    const href = canvasHref(`/courses/${courseId}`);
    if (!res.ok && isAuthError(res.error)) return void handleAuthError(res.error);
    const page = res.ok ? res.data || {} : {};
    panelBody.innerHTML = panelBar(courseId, href) + `
      <article class="panel-pad detail">
        <p class="eyebrow">${icon('home')} 课程主页</p>
        <h1 tabindex="-1">${esc(page.title || (findCourse(courseId) ? splitCourseTitle(findCourse(courseId)).name : '课程主页'))}</h1>
        ${page.body
          ? `${page.updated_at ? `<p class="detail-meta">${icon('clock')} 更新于 ${esc(fmtDateTime(page.updated_at))}</p>` : ''}<div class="rich-text detail-desc">${sanitizeHtml(page.body)}</div>`
          : emptyState('home', '这门课没有主页内容', '老师可能把内容放在模块里', `<a class="btn" href="#/course/${esc(courseId)}?tab=modules">去看模块</a>`)}
      </article>`;
  }

  async function announcementDetail({ params, seq }) {
    const [courseId, topicId] = params;
    const fallback = canvasHref(`/courses/${courseId}/discussion_topics/${topicId}`);
    const fromList = [...(peek('feed') || []), ...(peek(`announcements:${courseId}`) || [])]
      .find((a) => String(a.id) === String(topicId));
    let data = fromList;
    if (!data) {
      const res = await settle(cached(`ann:${courseId}:${topicId}`, 300000, () => API.announcement(courseId, topicId)));
      if (panelStale(seq)) return;
      if (!res.ok) return void panelError(courseId, res.error, fallback);
      data = res.data;
    }
    const a = normalizeAnnouncement(data || {}, courseId);
    markSeen([topicId]);
    updateChrome();
    $$(`#app a[href^="#/course/${courseId}/ann/${topicId}"] .mini-dot`).forEach((el) => el.classList.remove('unread'));
    panelBody.innerHTML = panelBar(courseId, canvasHref(a.htmlUrl || fallback)) + `
      <article class="panel-pad detail">
        <p class="eyebrow">${icon('megaphone')} 公告</p>
        <h1 tabindex="-1">${esc(a.title)}</h1>
        <p class="detail-meta">${a.author ? `${icon('user')} ${esc(a.author)} · ` : ''}${esc(fmtDateTime(a.postedAt))}</p>
        <div class="rich-text detail-desc">${a.message ? sanitizeHtml(a.message) : '<p class="muted">没有正文。</p>'}</div>
      </article>`;
  }

  /* ============================ 搜索面板 ============================ */

  let paletteState = { items: [], index: 0 };

  function searchIndex() {
    const out = [];
    const courses = state.courses || [];
    NAV.forEach(([, label, ic, href]) => out.push({ group: '跳转', title: label, sub: '', icon: ic, href }));
    out.push({ group: '跳转', title: '设置', sub: '外观、缓存、退出登录', icon: 'settings', href: '#/me' });
    courses.forEach((c) => out.push({ group: '课程', title: splitCourseTitle(c).name, sub: courseCode(c), icon: 'book', href: `#/course/${c.id}`, color: courseColor(c), keywords: c.name }));
    const seen = new Set();
    courses.forEach((c) => {
      (peek(`assignments:${c.id}`) || []).forEach((a) => {
        seen.add(`${c.id}:${a.id}`);
        const due = dueMeta(a.due_at, submissionState(a.submission).done);
        out.push({ group: '作业', title: a.name, sub: `${courseCode(c)} · ${due.label}`, icon: 'pen', href: `#/course/${c.id}/a/${a.id}`, color: courseColor(c) });
      });
      (peek(`modules:${c.id}`) || []).forEach((m) => (m.items || []).forEach((item) => {
        const type = String(item.type || '').toLowerCase();
        const slug = item.page_url || (item.url || '').split('/pages/')[1];
        if (type === 'page' && slug) out.push({ group: '资料', title: item.title, sub: `${courseCode(c)} · ${m.name}`, icon: 'page', href: `#/course/${c.id}/page/${encodeURIComponent(slug)}?from=modules`, color: courseColor(c) });
        else if (type === 'file' && item.content_id) out.push({ group: '资料', title: item.title, sub: `${courseCode(c)} · ${m.name}`, icon: 'file', file: item.content_id, fileHref: item.html_url, color: courseColor(c) });
      }));
      (peek(`announcements:${c.id}`) || []).forEach((a) => {
        seen.add(`ann:${a.id}`);
        out.push({ group: '公告', title: a.title, sub: `${courseCode(c)} · ${fmtRelative(a.posted_at)}`, icon: 'megaphone', href: `#/course/${c.id}/ann/${a.id}`, color: courseColor(c) });
      });
    });
    (agendaFromCache() || []).forEach((i) => {
      if (!i.href || seen.has(`${i.courseId}:${i.assignmentId}`)) return;
      const c = findCourse(i.courseId);
      out.push({ group: '作业', title: i.title, sub: `${c ? courseCode(c) + ' · ' : ''}${i.due.label}`, icon: 'pen', href: i.href, color: colorById(i.courseId) });
    });
    (feedFromCache() || []).forEach((a) => {
      if (seen.has(`ann:${a.id}`)) return;
      const c = findCourse(a.courseId);
      out.push({ group: '公告', title: a.title, sub: `${c ? courseCode(c) + ' · ' : ''}${fmtRelative(a.postedAt)}`, icon: 'megaphone', href: `#/course/${a.courseId}/ann/${a.id}`, color: colorById(a.courseId) });
    });
    return out;
  }

  function openPalette() {
    if (!API.isConfigured()) return;
    closeSheet();
    palette.hidden = false;
    palette.innerHTML = `
      <div class="palette-scrim" data-action="palette-close"></div>
      <div class="palette-box" role="dialog" aria-modal="true" aria-label="搜索">
        <label class="palette-input">${icon('search')}
          <input id="palette-input" type="search" placeholder="搜索课程、作业、公告、资料…" autocomplete="off" spellcheck="false" aria-controls="palette-results">
          <button class="icon-btn" data-action="palette-close" type="button" aria-label="关闭">${icon('close')}</button>
        </label>
        <div class="palette-results" id="palette-results" role="listbox"></div>
        <p class="palette-foot">只搜索已经加载过的数据 · <kbd>↑</kbd><kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 打开</p>
      </div>`;
    requestAnimationFrame(() => palette.classList.add('open'));
    const input = $('#palette-input');
    const index = searchIndex();
    const run = () => {
      const q = input.value.trim().toLowerCase();
      let items;
      if (!q) {
        items = index.filter((x) => x.group === '跳转' || x.group === '课程');
      } else {
        const terms = q.split(/\s+/);
        items = index
          .map((x) => {
            const hay = `${x.title} ${x.sub} ${x.keywords || ''}`.toLowerCase();
            if (!terms.every((t) => hay.includes(t))) return null;
            const t = String(x.title).toLowerCase();
            const score = (t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2) + ({ 跳转: 0, 课程: 0.1, 作业: 0.2, 公告: 0.3, 资料: 0.4 }[x.group] || 0);
            return { x, score };
          })
          .filter(Boolean)
          .sort((a, b) => a.score - b.score)
          .slice(0, 40)
          .map((r) => r.x);
      }
      paletteState = { items, index: 0 };
      paintPalette(q);
    };
    input.addEventListener('input', run);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const n = paletteState.items.length;
        if (!n) return;
        paletteState.index = (paletteState.index + (event.key === 'ArrowDown' ? 1 : -1) + n) % n;
        paintPalette(input.value.trim());
      } else if (event.key === 'Enter') {
        event.preventDefault();
        choosePalette(paletteState.index);
      }
    });
    run();
    input.focus();
  }

  function paintPalette(q) {
    const box = $('#palette-results');
    if (!box) return;
    const { items, index } = paletteState;
    if (!items.length) {
      box.innerHTML = `<p class="empty-inline">没有找到「${esc(q)}」。打开过的课程数据才能被搜到。</p>`;
      return;
    }
    let group = '';
    box.innerHTML = items.map((x, i) => {
      const head = x.group !== group ? `<p class="pr-group">${esc((group = x.group))}</p>` : '';
      return `${head}<button class="pr-item ${i === index ? 'on' : ''}" role="option" aria-selected="${i === index}" data-action="palette-pick" data-index="${i}" type="button" ${x.color ? `style="--c:${x.color}"` : ''}>
        <span class="pr-ico ${x.color ? 'tinted' : ''}">${icon(x.icon)}</span>
        <span class="row-main"><span class="row-title">${esc(x.title)}</span>${x.sub ? `<span class="row-meta"><span>${esc(x.sub)}</span></span>` : ''}</span>
      </button>`;
    }).join('');
    const on = box.querySelector('.pr-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function choosePalette(i) {
    const x = paletteState.items[i];
    if (!x) return;
    closePalette();
    if (x.file) downloadCanvasFile(x.file, x.title, x.fileHref ? canvasHref(x.fileHref) : '');
    else if (x.href) go(x.href);
  }

  function closePalette() {
    if (palette.hidden) return;
    palette.classList.remove('open');
    palette.hidden = true;
    palette.innerHTML = '';
  }

  /* ============================ 底部弹层：切换课程 ============================ */

  function openCourseSheet() {
    const courses = state.courses || [];
    const current = state.baseCourse;
    const tab = current ? courseTab(parseHash(state.baseHash).query) : 'overview';
    sheet.hidden = false;
    sheet.innerHTML = `
      <div class="sheet-scrim" data-action="sheet-close"></div>
      <div class="sheet-box" role="dialog" aria-modal="true" aria-label="切换课程">
        <div class="sheet-grip"></div>
        <div class="sheet-head"><h2>切换课程</h2><button class="icon-btn" data-action="sheet-close" type="button" aria-label="关闭">${icon('close')}</button></div>
        <div class="sheet-list" id="sheet-courses">
          ${courses.map((c) => `<a class="row" data-course="${esc(c.id)}" href="#/course/${esc(c.id)}${tab === 'overview' ? '' : '?tab=' + tab}" ${String(c.id) === current ? 'aria-current="true"' : ''}>
            <span class="dot" style="--c:${courseColor(c)}"></span>
            <span class="row-main"><span class="row-title">${esc(splitCourseTitle(c).name)}</span><span class="row-meta"><span>${esc(courseCode(c))}</span></span></span>
            ${String(c.id) === current ? icon('tick', 'row-arrow') : ''}
          </a>`).join('')}
        </div>
      </div>`;
    requestAnimationFrame(() => sheet.classList.add('open'));
    const currentLink = sheet.querySelector('[aria-current="true"]') || sheet.querySelector('a');
    if (currentLink) currentLink.focus();
  }

  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove('open');
    sheet.hidden = true;
    sheet.innerHTML = '';
  }

  function closeOverlays() {
    closePalette();
    closeSheet();
  }

  /* ============================ 全局事件 ============================ */

  function panelBack() {
    const prev = history.state && history.state.canvasLiteFrom;
    if (prev) history.back();
    else go(state.baseHash || '#/home', { replace: true });
  }

  function panelClose() {
    const prev = history.state && history.state.canvasLiteFrom;
    if (prev && prev === state.baseHash) history.back();
    else go(state.baseHash || '#/home');
  }

  document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      case 'back': {
        if (event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        const prev = history.state && history.state.canvasLiteFrom;
        if (prev && !isDetailHash(prev)) history.back();
        else go(target.dataset.fallback || '#/home', { replace: true });
        return;
      }
      case 'panel-back':
        event.preventDefault();
        panelBack();
        return;
      case 'panel-close':
        event.preventDefault();
        panelClose();
        return;
      case 'retry':
      case 'refresh':
        event.preventDefault();
        if (panel.contains(target)) {
          render();
          return;
        }
        state.needRefresh = true;
        if (action === 'refresh') toast('正在刷新…');
        state.keepScroll = action === 'refresh';
        renderBase(state.baseHash || '#/home');
        return;
      case 'scroll-to': {
        const id = (target.getAttribute('href') || '').replace(/^#/, '');
        const el = id && document.getElementById(id);
        event.preventDefault();
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else toast('这一天没有要交的');
        return;
      }
      case 'search':
        event.preventDefault();
        openPalette();
        return;
      case 'palette-close':
        event.preventDefault();
        closePalette();
        return;
      case 'palette-pick':
        event.preventDefault();
        choosePalette(Number(target.dataset.index));
        return;
      case 'switch-course':
        event.preventDefault();
        openCourseSheet();
        return;
      case 'sheet-close':
        event.preventDefault();
        closeSheet();
        return;
      case 'toggle-token': {
        event.preventDefault();
        const input = $('#f-token');
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        input.focus();
        return;
      }
      case 'theme':
        event.preventDefault();
        API.setConfig({ theme: target.dataset.value });
        applyTheme();
        $$('.seg-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.value === target.dataset.value));
        updateChrome();
        return;
      case 'cycle-theme': {
        event.preventDefault();
        const order = ['auto', 'light', 'dark'];
        const next = order[(order.indexOf(config.theme || 'auto') + 1) % order.length];
        API.setConfig({ theme: next });
        applyTheme();
        updateChrome();
        toast({ auto: '外观：跟随系统', light: '外观：浅色', dark: '外观：深色' }[next]);
        return;
      }
      case 'mark-all-read': {
        event.preventDefault();
        markSeen((feedFromCache() || []).map((a) => a.id));
        toast('已全部标为已读', 'ok');
        rerenderBase();
        return;
      }
      case 'modules-toggle': {
        event.preventDefault();
        const modules = $$('#course-body details.module');
        const open = modules.some((d) => !d.open);
        modules.forEach((d) => { d.open = open; });
        return;
      }
      case 'download-file':
        event.preventDefault();
        if (!target.dataset.file) return;
        target.disabled = true;
        await downloadCanvasFile(target.dataset.file, target.dataset.name || '文件', target.dataset.href ? canvasHref(target.dataset.href) : '');
        target.disabled = false;
        return;
      case 'hard-reload':
        event.preventDefault();
        try {
          if (window.caches) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
          if (navigator.serviceWorker) await Promise.all((await navigator.serviceWorker.getRegistrations()).map((reg) => reg.unregister()));
        } catch (e) { /* 忽略 */ }
        location.reload();
        return;
      case 'clear-cache':
        event.preventDefault();
        clearCache();
        toast('本地缓存已清除', 'ok');
        return;
      case 'logout':
        event.preventDefault();
        API.clearConfig();
        clearCache();
        state.profile = null;
        state.courses = null;
        state.baseHash = null;
        toast('已退出登录');
        go('#/setup', { replace: true, reset: true });
        return;
      default:
    }
  });

  document.addEventListener('change', (event) => {
    const input = event.target.closest('[data-action="toggle-done"]');
    if (!input) return;
    savePrefs({ hideDone: input.checked });
    if (state.baseNav === 'home') rerenderBase();
  });

  // 站内路由链接：统一走 pushState，保证「返回」逻辑一致
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const routeLink = event.target.closest('a[href^="#/"]');
    if (routeLink && !routeLink.target) {
      event.preventDefault();
      const href = routeLink.getAttribute('href');
      if (sheet.contains(routeLink)) closeSheet();
      go(href, { replace: routeLink.hasAttribute('data-replace-route') });
      return;
    }

    const link = event.target.closest('a[data-internal]');
    if (!link) return;
    event.preventDefault();
    const kind = link.dataset.kind;
    const courseId = link.dataset.course;
    if (kind === 'page') go(`#/course/${courseId}/page/${encodeURIComponent(link.dataset.slug || '')}`);
    else if (kind === 'assignment') go(`#/course/${courseId}/a/${link.dataset.id}`);
    else if (kind === 'announcement') go(`#/course/${courseId}/ann/${link.dataset.id}`);
    else if (kind === 'file') downloadCanvasFile(link.dataset.id, link.textContent.trim(), link.getAttribute('href'));
    else if (kind === 'course') {
      const tab = link.dataset.tab;
      const moduleId = link.dataset.module;
      go(`#/course/${courseId}${tab ? '?tab=' + tab : ''}${moduleId ? '&module=' + moduleId : ''}`);
    }
  });

  // 按下课程链接时就开始拿作业，松手时数据多半已经到了
  document.addEventListener('pointerdown', (event) => {
    const link = event.target.closest('a[href^="#/course/"]');
    if (!link || !API.isConfigured()) return;
    const m = link.getAttribute('href').match(/#\/course\/(\d+)/);
    if (m) prefetchKey(`assignments:${m[1]}`, () => API.assignments(m[1]));
  }, { passive: true });

  scrim.addEventListener('click', panelClose);

  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
    if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (palette.hidden) openPalette();
      else closePalette();
      return;
    }
    if (event.key === '/' && !typing && palette.hidden) {
      event.preventDefault();
      openPalette();
      return;
    }
    if (event.key === 'Escape') {
      if (!palette.hidden) return void closePalette();
      if (!sheet.hidden) return void closeSheet();
      if (!panel.hidden) {
        event.preventDefault();
        panelClose();
      }
    }
  });

  if (dockQuery.addEventListener) {
    dockQuery.addEventListener('change', () => {
      if (panel.hidden) return;
      root.classList.toggle('panel-dock', dockQuery.matches);
      scrim.hidden = dockQuery.matches;
    });
  }

  $('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    app.focus();
  });

  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', () => {
    if (state.renderedUrl !== location.href) render();
  });

  /* ============================ 主题 / 启动 ============================ */

  function applyTheme() {
    const theme = config.theme || 'auto';
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0d1017' : '#f4f5f8');
  }

  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((config.theme || 'auto') === 'auto') applyTheme();
      });
    } catch (e) { /* 老浏览器忽略 */ }
  }

  window.addEventListener('online', () => {
    toast('网络已恢复', 'ok');
    root.classList.remove('is-offline');
  });
  window.addEventListener('offline', () => {
    toast('当前离线，显示缓存数据');
    root.classList.add('is-offline');
  });

  applyTheme();
  // 有缓存就先把侧栏的课程列表画出来
  if (API.isConfigured()) {
    const cachedCourses = peek('courses');
    if (Array.isArray(cachedCourses)) state.courses = sortCourses(cachedCourses);
    const cachedProfile = peek('profile');
    if (cachedProfile) state.profile = cachedProfile;
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => { /* 离线能力可选 */ });
    });
  }

  render();
})();
