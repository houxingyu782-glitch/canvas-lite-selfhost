/**
 * 生成 PWA 图标（需要 Playwright 的 Chromium）
 * 用法：npm run icons
 *
 * icon.svg 是唯一的源文件（圆角方块，透明圆角），其余都从这里派生：
 *   - icon-32 / 192 / 512：浏览器标签页、桌面安装用，保留圆角
 *   - maskable-512：安卓自适应图标，背景铺满，图形缩进 80% 安全区
 *   - apple-touch-icon：iOS 主屏幕，背景铺满（iOS 会把透明圆角填成黑色）
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'icons');

const svg = await fs.readFile(path.join(OUT, 'icon.svg'), 'utf8');

/** 背景铺满（去掉圆角），图形按比例缩放到中心 */
function fullBleed(scale) {
  return svg
    .replace(/ rx="114"/g, '')
    .replace('<g filter="url(#sh)">', `<g filter="url(#sh)" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function render(markup, size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
  );
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
  await page.close();
  console.log('wrote', file);
}

await render(svg, 32, 'icon-32.png');
await render(svg, 192, 'icon-192.png');
await render(svg, 512, 'icon-512.png');
await render(fullBleed(0.74), 512, 'maskable-512.png');
await render(fullBleed(0.9), 180, 'apple-touch-icon.png');

await browser.close();
