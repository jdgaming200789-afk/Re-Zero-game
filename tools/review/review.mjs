// Review sheet for a character GLB: labelled views composed into one PNG.
//   node tools/review/review.mjs <out.png> <title> <glb-url> <views.json> [hide=a,b] [flat=1]
// Needs the Vite dev server (npm run dev) on GAME_URL (default http://127.0.0.1:5173/).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [out, title, glb, viewsFile, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.split('=')));
const views = JSON.parse(readFileSync(viewsFile, 'utf8'));
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/home/ubuntu/.local/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 520, height: 640 } });
page.on('pageerror', (e) => console.error(e));
await page.goto(`${BASE}tools/review/review.html?glb=${encodeURIComponent(glb)}&hide=${opt.hide ?? ''}${opt.flat ? '&flat=1' : ''}${opt.arms ? `&arms=${opt.arms}` : ''}${opt.down ? `&down=${opt.down}` : ''}`);
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
const shots = [];
for (const v of views) {
  await page.evaluate((v) => window.__render(v.az, v.el ?? 0, v.cy, v.size, v.persp, v.clipx), v);
  const b64 = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png').split(',')[1]);
  shots.push([v.label, b64]);
}
const cols = Math.min(shots.length, +(opt.cols ?? 5));
const sheet = await browser.newPage({ viewport: { width: cols * 262, height: 40 + Math.ceil(shots.length / cols) * 346 } });
await sheet.setContent(`<body style="margin:0;background:#1d1e24;color:#ddd;font:14px sans-serif"><div style="padding:8px 10px">${title}</div><div style="display:grid;grid-template-columns:repeat(${cols},260px);gap:2px">${shots.map(([l, b]) => `<figure style="margin:0"><img style="width:260px;height:320px;display:block" src="data:image/png;base64,${b}"><figcaption style="height:24px;line-height:24px;text-align:center">${l}</figcaption></figure>`).join('')}</div></body>`);
await sheet.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('->', out);
