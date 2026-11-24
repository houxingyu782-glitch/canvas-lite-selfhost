/**
 * 真实账号功能巡检
 *
 * 只读：只打开页面、读取数据，不提交、不修改任何东西。
 *
 * 用法（令牌只放在环境变量里，不落盘）：
 *   CANVAS_TOKEN='xxxx' node test/real-account.mjs           # 快速模式，约 1 分钟，抽查首尾两门课
 *   CANVAS_TOKEN='xxxx' node test/real-account.mjs --full    # 逐门课 × 全部栏目，十几分钟
 *
 * 前提：本地服务已在 http://127.0.0.1:8787 运行（npm start）。
 * 登录页已经预填学校地址时（CANVAS_HOST 启动或 Pages 设了 CANVAS_ORIGIN）可以不传 CANVAS_BASE。
 * 用 APP_URL 可以换成别的地址，例如自己的 Pages 站点。
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const APP = process.env.APP_URL || 'http://127.0.0.1:8787';
const TOKEN = process.env.CANVAS_TOKEN || '';
const BASE = process.env.CANVAS_BASE || '';
const SHOTS = '/tmp/real-account-shots';
// 默认只抽查首尾两门课：每次发版都跑，得够快。要逐门查就加 --full。
const FULL = process.argv.includes('--full');
const startedAt = Date.now();

if (!TOKEN) {
  console.error('缺少 CANVAS_TOKEN');
  process.exit(2);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(120);
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|Failed to load resource/i.test(msg.text())) errors.push(msg.text());
  });

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  if (await page.$('#f-token')) {
    if (BASE && !(await page.inputValue('#f-base'))) await page.fill('#f-base', BASE);
    await page.fill('#f-token', TOKEN);
    await page.click('#setup-submit');
  }
  await page.waitForSelector('.page-today', { timeout: 60000 });
  await page.waitForTimeout(1500);

  const version = await page.$eval('.page-foot', (el) => el.textContent.trim()).catch(() => '');
  record('「今天」加载', true, version.slice(0, 40));
  const headText = await page.textContent('.page-header h1');
  record('显示用户名', /早上好|中午好|下午好|晚上好|夜深了/.test(headText) && !headText.includes('同学'), headText.trim());
  const agendaRows = await page.$$eval('.agenda-row', (els) => els.length).catch(() => 0);
  record('时间线', agendaRows > 0 || (await page.$('#agenda .empty')) !== null, `${agendaRows} 项`);
  await page.screenshot({ path: `${SHOTS}/today.png`, fullPage: true });

  // 课程列表
  await go(page, '#/courses');
  await page.waitForSelector('.course-tile', { timeout: 20000 });
  const rows = await page.$$eval('.course-tile', (els) => els.length);
  record('课程列表', rows > 0, `${rows} 门`);
  const firstCode = (await page.textContent('.course-tile .ct-code')).trim().slice(0, 4);
  await page.fill('#course-search', firstCode);
  await page.waitForTimeout(300);
  const filtered = await page.$$eval('.course-tile', (els) => els.length);
  await page.fill('#course-search', '');
  record('课程筛选', filtered > 0 && filtered <= rows, `${firstCode} → ${filtered} 门`);

  // 公告汇总
  await go(page, '#/feed');
  await page.waitForSelector('.feed-list, .page-feed .empty', { timeout: 20000 });
  const feedCount = await page.$$eval('.feed-list .ann-row', (els) => els.length).catch(() => 0);
  record('公告汇总', true, `${feedCount} 条`);
  if (feedCount) {
    await page.click('.feed-list .ann-row');
    await page.waitForSelector('#panel:not([hidden]) .detail-desc', { timeout: 20000 });
    const annBody = (await page.textContent('#panel .detail-desc')).replace(/\s+/g, ' ').trim();
    record('公告在面板打开', annBody.length > 5, annBody.slice(0, 40));
    await page.click('#panel [data-action="panel-back"]');
    await page.waitForSelector('#panel', { state: 'hidden' });
  }

  // 成绩总览
  await go(page, '#/grades');
  await page.waitForSelector('.grade-hero', { timeout: 20000 });
  record('成绩总览', true, (await page.textContent('.grade-courses')).replace(/\s+/g, ' ').slice(0, 60));

  // 逐个课程巡检全部栏目
  const allIds = Array.from(new Set(await page.$$eval('.grade-courses a', (els) => els.map((a) => a.getAttribute('href').match(/\d+/)[0]))));
  // 快速模式只查首尾两门课，--full 才逐门查
  const ids = FULL || allIds.length <= 2 ? allIds : [allIds[0], allIds[allIds.length - 1]];
  console.log(`（${FULL ? '完整模式' : '快速模式'}：${ids.length}/${allIds.length} 门课程 × 五个栏目；加 --full 可逐门全查）`);
  let moduleCourse = null;
  for (const id of ids) {
    for (const tab of ['overview', 'assignments', 'modules', 'announcements', 'grades']) {
      await go(page, `#/course/${id}${tab === 'overview' ? '' : '?tab=' + tab}`);
      await page.waitForFunction(() => {
        const el = document.querySelector('#course-body');
        return el && !el.querySelector('.sk') && el.textContent.trim().length > 4;
      }, { timeout: 15000 }).catch(() => {});
      const text = (await page.textContent('#course-body')).replace(/\s+/g, ' ').trim();
      const selector = { overview: '.ov-stats', assignments: '.assignment-row', modules: '.module', announcements: '.ann-row', grades: '.grade-calc, .grade-hero' }[tab];
      const count = await page.$$eval(selector, (els) => els.length).catch(() => 0);
      if (tab === 'modules' && count && !moduleCourse) moduleCourse = id;
      const ok = text.length > 0 && !text.includes('出了点问题') && (count > 0 || /还没有|没有|暂无|全部完成/.test(text));
      record(`课程 ${id} · ${tab}`, ok, `${count} 项 / ${text.slice(0, 40)}`);
      if (!ok) await page.screenshot({ path: `${SHOTS}/fail-${id}-${tab}.png`, fullPage: true });
    }
  }

  // 课程主页
  let frontOk = false;
  for (const id of ids) {
    await go(page, `#/course/${id}/front`);
    await page.waitForSelector('#panel:not([hidden]) article', { timeout: 20000 });
    await page.waitForTimeout(300);
    if (await page.$('#panel .detail-desc')) {
      const len = (await page.textContent('#panel .detail-desc')).trim().length;
      record('课程主页', len > 20, `课程 ${id} · ${len} 字`);
      frontOk = true;
      break;
    }
  }
  if (!frontOk) record('课程主页', true, '所有课程都没有主页（空状态正常显示）');

  // 模块：文件下载 + 页面站内打开
  if (moduleCourse) {
    await go(page, `#/course/${moduleCourse}?tab=modules`);
    await page.waitForSelector('.module', { timeout: 20000 });
    await page.evaluate(() => document.querySelectorAll('details.module').forEach((d) => { d.open = true; }));
    const fileBtn = page.locator('button.module-item[data-action="download-file"]').first();
    if (await fileBtn.count()) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
        fileBtn.click(),
      ]);
      record('模块文件直接下载', !!download, download ? download.suggestedFilename() : '未触发下载');
    } else {
      record('模块文件直接下载', true, '没有文件项，跳过');
    }
    const pageLink = page.locator('a.module-item[href*="/page/"]').first();
    if (await pageLink.count()) {
      await pageLink.click();
      await page.waitForSelector('#panel:not([hidden]) .detail-desc', { timeout: 20000 });
      record('课程页面在面板打开', (await page.textContent('#panel .detail-desc')).trim().length > 20);
      await page.click('#panel [data-action="panel-back"]');
      await page.waitForSelector('#panel', { state: 'hidden' });
      record('返回后回到模块列表', (await page.evaluate(() => location.hash)).includes('tab=modules'));
    }
  } else {
    record('模块', true, '没有课程有模块，跳过');
  }

  // 作业详情
  for (const id of ids) {
    await go(page, `#/course/${id}?tab=assignments`);
    await page.waitForSelector('#course-body .assignment-row, #course-body .empty', { timeout: 20000 });
    if (await page.$('#course-body .assignment-row')) {
      await page.click('#course-body .assignment-row');
      await page.waitForSelector('#panel:not([hidden]) h1', { timeout: 20000 });
      record('作业详情', (await page.textContent('#panel h1')).trim().length > 0, (await page.textContent('#panel h1')).trim());
      await page.screenshot({ path: `${SHOTS}/assignment.png` });
      await page.keyboard.press('Escape');
      break;
    }
  }

  // 搜索
  await go(page, '#/home');
  await page.waitForSelector('.page-today', { timeout: 20000 });
  await page.click('.page-header [data-action="search"]');
  await page.waitForSelector('#palette-input');
  await page.fill('#palette-input', firstCode);
  await page.waitForTimeout(300);
  const hits = await page.$$eval('.pr-item', (els) => els.length);
  record('搜索', hits > 0, `${firstCode} → ${hits} 条`);
  await page.keyboard.press('Escape');

  // 设置 / 深色模式
  await go(page, '#/me');
  await page.waitForSelector('.profile-card', { timeout: 20000 });
  record('设置页', true, (await page.textContent('.profile-name')).trim());

  // 日历订阅：真实账号的 profile 里应当带 calendar.ics。
  // 这个地址等于日历的钥匙，只判断有没有、不打印内容。
  const meText = await page.textContent('#app');
  const hasFeed = /feeds\/calendars\/\S+\.ics/.test(meText);
  if (hasFeed) {
    const webcalHref = await page.$$eval('a[href^="webcal://"]', (els) => els[0]?.getAttribute('href') || '').catch(() => '');
    const copyBtn = await page.$$eval('button[data-action="copy-ics"]', (els) => els.length).catch(() => 0);
    record('日历订阅', webcalHref.startsWith('webcal://') && copyBtn === 1,
      `${webcalHref ? 'webcal 链接正常' : '缺 webcal 链接'} / ${copyBtn ? '复制按钮正常' : '缺复制按钮'}`);
  } else {
    record('日历订阅', true, '这个账号没有返回 calendar.ics，页面降级成「学校没有提供」（正常）');
  }

  await page.click('button[data-value="dark"]');
  await page.waitForTimeout(300);
  record('深色模式', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await page.click('button[data-value="auto"]');

  // 刷新按钮
  await go(page, '#/home');
  await page.waitForSelector('.page-today', { timeout: 20000 });
  await page.click('.page-header button[data-action="refresh"]');
  await page.waitForSelector('.page-today .agenda', { timeout: 30000 });
  record('刷新按钮', true);

  // PWA 资源
  const manifest = await page.evaluate(async () => {
    const res = await fetch('manifest.webmanifest');
    return { status: res.status, json: await res.json().catch(() => null) };
  });
  record('PWA manifest', manifest.status === 200 && Array.isArray(manifest.json?.icons) && manifest.json.icons.length >= 3,
    `${manifest.json?.icons?.length || 0} 个图标`);
  const iconStatus = await page.evaluate(() => fetch('icons/icon-192.png').then((r) => r.status));
  record('桌面图标', iconStatus === 200, `icon-192 ${iconStatus}`);

  // 缓存后的再次打开速度
  const t = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.page-today .agenda', { timeout: 20000 });
  const ms = Date.now() - t;
  record('二次打开速度', ms < 1500, `${ms}ms`);

  record('控制台无报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  // 退出登录
  await go(page, '#/me');
  await page.waitForSelector('.profile-card', { timeout: 20000 });
  await page.click('button[data-action="logout"]');
  await page.waitForSelector('#setup-form', { timeout: 20000 });
  record('退出登录', true);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n共 ${results.length} 项，失败 ${failed.length} 项，用时 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`);
  if (failed.length) {
    console.log('失败项：' + failed.map((f) => f.name).join('、'));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('巡检崩溃：', err);
  process.exitCode = 1;
});
