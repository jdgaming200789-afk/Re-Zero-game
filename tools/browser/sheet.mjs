// Contact sheet of test screenshots for review:
//   node tools/browser/sheet.mjs <prefix> <out.png> [cols]
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const [prefix, out, colsArg] = process.argv.slice(2);
const dir = join(process.cwd(), 'test-results');
const files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort();
const cols = +(colsArg ?? 3);
const w = 480, h = 270;
const html = `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:2px">${files
  .map((f) => `<div style="position:relative"><img style="width:${w}px;height:${h}px;display:block" src="data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}"><span style="position:absolute;left:4px;top:2px;color:#ff0;font:12px monospace">${f}</span></div>`)
  .join('')}</body>`;
const browser = await chromium.launch({ executablePath: ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => existsSync(p)) });
const page = await browser.newPage({ viewport: { width: cols * (w + 2), height: Math.ceil(files.length / cols) * (h + 2) } });
await page.setContent(html);
await page.screenshot({ path: join(dir, out), fullPage: true });
await browser.close();
console.log(files.length, 'images ->', out);
