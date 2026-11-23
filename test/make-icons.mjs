/**
 * 生成 PWA 图标（需要 Playwright 的 Chromium）
 * 用法：node test/make-icons.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'icons');

const svg = await fs.readFile(path.join(OUT, 'icon.svg'), 'utf8');

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/><stop offset="0.55" stop-color="#6d4bf0"/><stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(256 256) scale(0.62) translate(-256 -256)">
    <path d="M340 182a112 112 0 1 0 0 148" fill="none" stroke="#fff" stroke-width="52" stroke-linecap="round"/>
    <circle cx="352" cy="256" r="24" fill="#fff"/>
  </g>
</svg>`;

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

await render(svg, 192, 'icon-192.png');
await render(svg, 512, 'icon-512.png');
await render(maskable, 512, 'maskable-512.png');
await render(maskable, 180, 'apple-touch-icon.png');

await browser.close();
