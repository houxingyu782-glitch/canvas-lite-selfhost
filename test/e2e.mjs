/**
 * 端到端测试：真浏览器 + 假 Canvas + 本地代理
 * 用法：node test/e2e.mjs [--headed]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots');
const APP_PORT = 8787;
const MOCK_PORT = 9911;
const TOKEN = 'test-token-0123456789abcdef';
const BASE = `http://127.0.0.1:${MOCK_PORT}`;

const failures = [];
const passes = [];

function ok(condition, label) {
  if (condition) {
    passes.push(label);
    console.log('  ✓', label);
  } else {
    failures.push(label);
    console.log('  ✗', label);
  }
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function shot(page, file, fullPage = true) {
  const style = await page.addStyleTag({ content: '.tabbar,.toast{visibility:hidden!important}' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, file), fullPage });
  await style.evaluate((node) => node.remove());
}

const children = [];
function start(cmd, args, env, label) {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'pipe' });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[${label}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  children.push(child);
  return child;
}


const APP = `http://127.0.0.1:${APP_PORT}`;
const hashOf = (page) => page.evaluate(() => location.hash);

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });

  start(process.execPath, ['test/mock-canvas.mjs', String(MOCK_PORT)], {}, 'mock');
  start(process.execPath, ['server/server.mjs'], { PORT: String(APP_PORT), ALLOW_INSECURE_LOCAL: '1' }, 'server');

  const mockUp = await waitFor(`${BASE}/healthz`);
  const appUp = await waitFor(`${APP}/healthz`);
  if (!mockUp || !appUp) throw new Error('服务没有启动');

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const watch = (p) => {
    p.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    p.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  };
  watch(page);

  console.log('\n[0] ?base= 预填学校地址');
  const prefillPage = await context.newPage();
  await prefillPage.goto(`${APP}/?base=${encodeURIComponent(BASE)}`);
  await prefillPage.waitForSelector('#setup-form');
  ok((await prefillPage.inputValue('#f-base')) === BASE, '登录链接可预填学校地址');
  await prefillPage.close();

  console.log('\n[1] 首次打开应进入登录页');
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#setup-form');
  ok((await hashOf(page)) === '#/setup', '未登录时跳到 #/setup');
  ok(await page.locator('#tabbar').isHidden(), '登录页不显示底部导航');
  await shot(page, '01-setup.png');

  console.log('\n[2] 错误令牌应提示');
  await page.fill('#f-base', BASE);
  await page.fill('#f-token', 'wrong-token-000000000000');
  await page.click('#setup-submit');
  await page.waitForSelector('#setup-error:not([hidden])', { timeout: 8000 });
  const errText = await page.textContent('#setup-error');
  ok(/令牌|401|无效/i.test(errText), `错误令牌有提示：${errText.trim().slice(0, 40)}`);

  console.log('\n[3] 正确令牌进入「今天」');
  await page.fill('#f-token', TOKEN);
  await page.click('#setup-submit');
  await page.waitForSelector('.page-today .agenda', { timeout: 10000 });
  let body = await page.textContent('#app');
  ok(body.includes('Alex'), '显示用户名');
  ok(body.includes('Problem Set 4: Recursion') && body.includes('Response Paper 2'), '时间线合并了 Planner 和待办');
  ok(body.includes('Lab Session'), '时间线包含日程');
  ok(await page.locator('.week-strip .wd').count() === 7, '显示未来 7 天');
  ok((await page.locator('.today-side').textContent()).includes('周四的课改到线上'), '侧栏显示最新公告');
  ok(await page.locator('#tabbar a[data-nav="home"].active').count() === 1, '底部导航高亮「今天」');
  await page.waitForSelector('#tabbar a[data-nav="feed"] .badge');
  ok((await page.textContent('#tabbar a[data-nav="feed"] .badge')).trim() === '2', '公告标签显示 2 条未读');
  await shot(page, '02-today.png');

  console.log('\n[4] 隐藏已完成');
  ok((await page.locator('.agenda-row.is-done').count()) >= 1, '已提交的事项标为已完成');
  await page.locator('#agenda .switch input').check();
  await page.waitForFunction(() => !document.querySelector('.agenda-row.is-done'));
  ok(!(await page.textContent('#agenda')).includes('Homework 8'), '打开开关后隐藏已完成');
  await page.reload();
  await page.waitForSelector('.page-today .agenda');
  ok(await page.locator('#agenda .switch input').isChecked(), '开关状态刷新后保留');
  await page.locator('#agenda .switch input').uncheck();
  await page.waitForSelector('.agenda-row.is-done');

  console.log('\n[5] 公告');
  await page.click('#tabbar a[data-nav="feed"]');
  await page.waitForSelector('.feed-list');
  ok(await page.locator('.feed-list .ann-row').count() === 3, '汇总所有课程的 3 条公告');
  ok(await page.locator('.feed-list .mini-dot.unread').count() === 2, '2 条未读');
  await page.locator('.chip-scroll a', { hasText: 'MATH 201' }).click();
  await page.waitForURL('**/#/feed?course=102');
  ok(await page.locator('.feed-list .ann-row').count() === 1, '按课程筛选');
  await page.locator('.chip-scroll a', { hasText: '全部' }).click();
  await page.waitForURL('**/#/feed');
  await shot(page, '03-feed.png');
  await page.locator('.ann-row', { hasText: '周四的课改到线上' }).click();
  await page.waitForSelector('#panel:not([hidden]) .detail-desc');
  ok((await page.textContent('#panel .detail-desc')).includes('Zoom'), '公告在详情面板打开');
  await shot(page, '04-announcement.png', false);
  await page.click('#panel [data-action="panel-back"]');
  await page.waitForURL('**/#/feed');
  ok(await page.locator('#panel').isHidden(), '返回后关闭面板');
  ok(await page.locator('.feed-list .mini-dot.unread').count() === 1, '看过的公告变为已读');
  await page.click('[data-action="mark-all-read"]');
  await page.waitForFunction(() => !document.querySelector('.feed-list .mini-dot.unread'));
  ok(await page.locator('#tabbar a[data-nav="feed"] .badge').count() === 0, '全部标为已读后角标消失');

  console.log('\n[6] 课程列表');
  await page.click('#tabbar a[data-nav="courses"]');
  await page.waitForSelector('.course-tile');
  ok(await page.locator('.course-tile').count() === 4, '显示 4 门课程');
  ok((await page.locator('.course-tile').first().textContent()).includes('Problem Set 4'), '课程卡片显示下一项作业');
  await shot(page, '05-courses.png');
  await page.fill('#course-search', 'linear');
  await page.waitForTimeout(150);
  ok(await page.locator('.course-tile').count() === 1, '课程筛选正常');
  await page.fill('#course-search', '');

  console.log('\n[7] 成绩');
  await page.click('#tabbar a[data-nav="grades"]');
  await page.waitForSelector('.grade-hero');
  body = await page.textContent('#app');
  ok(body.includes('84.3'), '已出分课程平均分 84.3');
  ok(body.includes('Reading Response: Clean Code'), '最近出分列出已评分作业');
  await shot(page, '06-grades.png');
  await page.locator('.grade-courses .grade-row', { hasText: 'Introduction to Programming' }).click();
  await page.waitForURL('**/#/course/101?tab=grades');
  await page.waitForSelector('#course-body .grade-calc');
  const calc = (await page.textContent('#course-body .grade-calc')).replace(/\s+/g, ' ');
  ok(calc.includes('86%') && calc.includes('按分组加权'), '按分组权重算出当前得分 86%');
  ok(calc.includes('已拿到 23.2%') && calc.includes('未评分 73.3%'), '显示已拿到 / 未评分占比');
  ok(calc.includes('剩余平均需 57%'), '算出达到 65 分需要的剩余平均分');
  const lab = (await page.locator('.grade-item', { hasText: 'Lab 3 Report' }).textContent()).replace(/\s+/g, ' ');
  ok(lab.includes('占总评 13.3%') && lab.includes('已得 11.2%'), '每项作业显示占比和已得分');
  ok((await page.textContent('#course-body')).includes('去掉最低 1 次'), '显示分组去分规则');
  await shot(page, '06b-course-grades.png');

  console.log('\n[8] 课程概览与作业');
  await page.locator('.tabs a', { hasText: '概览' }).click();
  await page.waitForURL('**/#/course/101');
  await page.waitForSelector('.ov-stats');
  body = await page.textContent('#course-body');
  ok(body.includes('Problem Set 4') && body.includes('周四的课改到线上'), '概览显示接下来和最新公告');
  await shot(page, '07-course.png');
  await page.locator('.tabs a', { hasText: '作业' }).click();
  await page.waitForURL('**/#/course/101?tab=assignments');
  await page.waitForSelector('.assignment-row');
  ok(await page.locator('.assignment-row').count() === 5, '翻页拿全 5 个作业');
  body = await page.textContent('#course-body');
  ok(body.includes('已截止') && body.includes('无截止时间'), '按截止时间分组');
  ok(body.includes('缺交'), '显示缺交状态');
  await page.locator('.filter', { hasText: '待完成' }).click();
  await page.waitForURL('**/#/course/101?tab=assignments&filter=todo');
  ok(await page.locator('.assignment-row').count() === 3, '「待完成」筛选');
  await page.locator('.filter', { hasText: '全部' }).click();
  await page.waitForURL('**/#/course/101?tab=assignments');

  console.log('\n[9] 详情面板：作业与 XSS 清理');
  await page.evaluate(() => window.scrollTo(0, 400));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.locator('.assignment-row', { hasText: 'Reading Response' }).click();
  await page.waitForSelector('#panel:not([hidden]) .detail-desc');
  ok((await page.textContent('#panel .detail-desc')).includes('300 字'), '作业说明在面板中显示');
  ok((await page.locator('#panel .detail-desc script').count()) === 0, 'script 标签被移除');
  ok((await page.locator('#panel .detail-desc [onclick]').count()) === 0, 'onclick 属性被移除');
  ok((await page.textContent('#panel .facts')).includes('18'), '显示得分');
  await shot(page, '08-assignment.png', false);
  await page.click('#panel [data-action="panel-back"]');
  await page.waitForURL('**/#/course/101?tab=assignments');
  ok(await page.locator('.assignment-row').count() === 5, '关闭面板后列表还在');
  ok(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore) < 5, '关闭面板后保持滚动位置');

  console.log('\n[10] 模块、页面与站内链接');
  await page.locator('.tabs a', { hasText: '模块' }).click();
  await page.waitForSelector('.module');
  ok((await page.textContent('#course-body')).includes('Week 10'), '模块列表正常');
  await shot(page, '09-modules.png');
  await page.click('.module-item[href*="/a/5001"]');
  await page.waitForSelector('#panel:not([hidden]) h1');
  ok((await page.textContent('#panel h1')).includes('Problem Set 4'), '模块里的作业在面板打开');
  await page.click('#panel [data-action="panel-back"]');
  await page.waitForURL('**/#/course/101?tab=modules');
  await page.click('a.module-item[href*="/page/recursion"]');
  await page.waitForSelector('#panel:not([hidden]) .detail-desc');
  ok((await page.textContent('#panel .detail-desc')).includes('递归本质上是函数调用栈'), '课程页面在面板打开');
  const imgSrc = await page.$eval('#panel .detail-desc img', (img) => img.getAttribute('src')).catch(() => '');
  ok(/^https?:\/\//.test(imgSrc), '页面相对图片补全为绝对地址');
  await page.click('#panel .detail-desc a[data-internal]');
  await page.waitForURL('**/#/course/101/page/linked-page');
  await page.locator('#panel .detail-desc', { hasText: '这是被链接的页面' }).waitFor();
  ok(true, '页面内链接站内打开');
  await page.click('#panel [data-action="panel-back"]');
  await page.waitForURL('**/#/course/101/page/recursion?from=modules');
  await page.locator('#panel .detail-desc', { hasText: '递归本质上是函数调用栈' }).waitFor();
  ok(true, '返回键回到被链接前页面');

  console.log('\n[11] 课程主页与模块深链接');
  await page.goto(`${APP}/#/course/101/front`);
  await page.waitForSelector('#panel:not([hidden]) .detail-desc');
  ok((await page.textContent('#panel .detail-desc')).includes('课程说明'), '直接打开课程主页');
  ok(await page.locator('.course-head').count() === 1, '冷启动详情时底下垫着课程页');
  await page.click('#panel .detail-desc a[data-module="301"]');
  await page.waitForURL('**/#/course/101?tab=modules&module=301');
  await page.waitForSelector('#module-301.module-focus');
  ok(await page.locator('#module-301').evaluate((el) => el.open), '目标模块自动展开');
  ok(await page.locator('#panel').isHidden(), '跳到课程栏目时关闭面板');

  console.log('\n[12] 手机切换课程');
  await page.locator('.tabs a', { hasText: '公告' }).click();
  await page.waitForURL('**/#/course/101?tab=announcements');
  await page.click('[data-action="switch-course"]');
  await page.waitForSelector('#sheet:not([hidden]) .sheet-list');
  ok((await page.getAttribute('#sheet a[aria-current="true"]', 'data-course')) === '101', '弹层标出当前课程');
  await page.keyboard.press('Escape');
  ok(await page.locator('#sheet').isHidden(), 'Escape 关闭弹层');
  await page.click('[data-action="switch-course"]');
  await page.locator('#sheet a[data-course="102"]').click();
  await page.waitForURL('**/#/course/102?tab=announcements');
  ok(await page.locator('#course-body .ann-row', { hasText: 'Homework 8 截止时间提醒' }).waitFor({ timeout: 8000 }).then(() => true, () => false), '切课后保留当前栏目');
  ok(await page.locator('#sheet').isHidden(), '切课后弹层收起');

  console.log('\n[13] 搜索');
  await page.goto(`${APP}/#/home`);
  await page.waitForSelector('.page-today .agenda');
  await page.click('.page-header [data-action="search"]');
  await page.waitForSelector('#palette:not([hidden]) #palette-input');
  await page.fill('#palette-input', 'recursion');
  await page.waitForSelector('.pr-item');
  ok((await page.textContent('#palette-results')).includes('Problem Set 4: Recursion'), '搜到作业');
  ok((await page.textContent('#palette-results')).includes('补充阅读'), '搜到模块里的页面');
  await shot(page, '10-search.png', false);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#panel:not([hidden]) h1');
  ok(await page.locator('#palette').isHidden(), '回车打开结果并关闭搜索');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('panel').hidden);

  console.log('\n[14] 设置 / 深色模式');
  await page.goto(`${APP}/#/me`);
  await page.waitForSelector('.profile-card');
  body = await page.textContent('#app');
  ok(body.includes('alex.chen@example.edu'), '显示账号信息');
  ok(body.includes('本机代理'), '显示本地代理连接方式');
  await page.click('[data-action="theme"][data-value="dark"]');
  ok((await page.getAttribute('html', 'data-theme')) === 'dark', '切换到深色模式');
  await page.goto(`${APP}/#/home`);
  await page.waitForSelector('.page-today .agenda');
  ok((await page.getAttribute('html', 'data-theme')) === 'dark', '刷新后保持主题');
  await shot(page, '11-today-dark.png');
  await page.goto(`${APP}/#/me`);
  await page.click('[data-action="theme"][data-value="light"]');

  console.log('\n[15] 旧链接兼容');
  await page.goto(`${APP}/#/todo`);
  await page.waitForURL('**/#/home');
  ok(true, '#/todo 跳到今天');
  await page.goto(`${APP}/#/courses?tab=grades`);
  await page.waitForURL('**/#/grades');
  ok(true, '#/courses?tab=grades 跳到成绩');

  console.log('\n[16] 桌面布局');
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', serviceWorkers: 'block', reducedMotion: 'reduce', storageState: await context.storageState() });
  const dp = await desk.newPage();
  watch(dp);
  await dp.goto(`${APP}/#/home`);
  await dp.waitForSelector('.page-today .agenda');
  ok(await dp.locator('#sidebar').isVisible(), '桌面显示侧栏');
  ok(await dp.locator('#tabbar').isHidden(), '桌面隐藏底部导航');
  ok(await dp.locator('.today-side').isVisible(), '桌面今天页有右侧栏');
  await shot(dp, '12-desktop-today.png', false);
  await dp.locator('#course-links a[data-course="101"]').click();
  await dp.waitForURL('**/#/course/101');
  await dp.locator('.tabs a', { hasText: '作业' }).click();
  await dp.waitForURL('**/#/course/101?tab=assignments');
  await dp.locator('#course-links a[data-course="102"]').click();
  await dp.waitForURL('**/#/course/102?tab=assignments');
  ok((await dp.getAttribute('#course-links a[aria-current="true"]', 'data-course')) === '102', '侧栏切课保留栏目并更新高亮');
  await dp.locator('#course-links a[data-course="101"]').click();
  await dp.waitForSelector('.assignment-row');
  await dp.locator('.assignment-row', { hasText: 'Problem Set 4' }).click();
  await dp.waitForSelector('#panel:not([hidden]) .detail-desc');
  ok(await dp.locator('#panel-scrim').isHidden(), '宽屏详情面板停靠在右侧，不遮挡列表');
  ok(await dp.locator('.assignment-row.is-active').count() === 1, '列表高亮当前打开的作业');
  await shot(dp, '13-desktop-panel.png', false);
  await dp.locator('.assignment-row', { hasText: 'Lab 3 Report' }).click();
  await dp.locator('#panel h1', { hasText: 'Lab 3 Report' }).waitFor();
  ok(true, '面板打开时可以直接点列表里的下一项');
  await dp.keyboard.press('Escape');
  await dp.waitForFunction(() => document.getElementById('panel').hidden);
  ok((await hashOf(dp)) === '#/course/101?tab=assignments', 'Esc 关闭面板回到列表');
  await dp.goBack();
  await dp.waitForURL('**/#/course/101/a/5002?from=assignments');
  await dp.waitForSelector('#panel:not([hidden])');
  ok(true, '浏览器后退重新打开面板');
  await dp.goBack();
  await dp.goBack();
  await dp.waitForURL('**/#/course/101?tab=assignments');
  ok(await dp.locator('#panel').isHidden(), '浏览器前进后退与页面同步');
  await dp.keyboard.press('Control+k');
  await dp.waitForSelector('#palette:not([hidden]) #palette-input');
  await dp.keyboard.type('linear');
  await dp.keyboard.press('Enter');
  await dp.waitForURL('**/#/course/102');
  ok(true, '快捷键搜索并跳转课程');
  await dp.goto(`${APP}/#/grades`);
  await dp.waitForSelector('.grade-hero');
  await shot(dp, '14-desktop-grades.png', false);
  await desk.close();

  console.log('\n[17] Planner 关闭时静默降级');
  const MOCK2_PORT = 9912;
  const APP2_PORT = 8788;
  const BASE2 = `http://127.0.0.1:${MOCK2_PORT}`;
  start(process.execPath, ['test/mock-canvas.mjs', String(MOCK2_PORT)], { MOCK_NO_PLANNER: '1' }, 'mock-off');
  start(process.execPath, ['server/server.mjs'], { PORT: String(APP2_PORT), ALLOW_INSECURE_LOCAL: '1' }, 'server2');
  const up2 = (await waitFor(`${BASE2}/healthz`)) && (await waitFor(`http://127.0.0.1:${APP2_PORT}/healthz`));
  if (!up2) throw new Error('降级测试服务没起来');
  const ctxOff = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const pageOff = await ctxOff.newPage();
  await pageOff.goto(`http://127.0.0.1:${APP2_PORT}/`, { waitUntil: 'networkidle' });
  await pageOff.fill('#f-base', BASE2);
  await pageOff.fill('#f-token', TOKEN);
  await pageOff.click('#setup-submit');
  await pageOff.waitForSelector('.page-today .agenda', { timeout: 10000 });
  const offBody = await pageOff.textContent('#app');
  ok(offBody.includes('Problem Set 4'), 'Planner 关闭时仍显示待办');
  ok(!offBody.includes('没能刷新') && !offBody.includes('出了点问题'), 'Planner 关闭时不显示错误提示');
  await ctxOff.close();

  const realErrors = consoleErrors.filter((text) => !/favicon|Failed to load resource/i.test(text));
  ok(realErrors.length === 0, `控制台无报错${realErrors.length ? '：' + realErrors.slice(0, 3).join(' | ') : ''}`);

  await browser.close();

  console.log(`\n通过 ${passes.length} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    console.log('失败项：\n - ' + failures.join('\n - '));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('\n测试崩溃：', err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children) child.kill('SIGTERM');
  });
