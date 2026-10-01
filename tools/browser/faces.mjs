// Face sheet: paints every character's face texture (FaceRenderer, no 3D)
// in a few expressions and saves a grid to test-results/faces.png.
// Needs the dev server (it imports the TypeScript modules directly).
//
//   node tools/browser/faces.mjs [id ...] [--expr=neutral,happy,angry,surprised]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const exprs = (opt.expr ?? 'neutral,happy,angry,surprised').split(',');
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}?faces=1`, { waitUntil: 'domcontentloaded' });
const n = await page.evaluate(
  async ([ids, exprs]) => {
    const { FaceRenderer } = await import('/src/characters/face/FaceRenderer.ts');
    const { CHARACTERS } = await import('/src/data/characters.ts');
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;background:#2a2a30;font:12px sans-serif;color:#ddd';
    const list = ids.length ? ids : Object.keys(CHARACTERS);
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${exprs.length},auto);gap:4px;padding:4px`;
    document.body.appendChild(grid);
    for (const id of list) {
      const def = CHARACTERS[id];
      for (const ex of exprs) {
        const f = new FaceRenderer({ ...def.face, sleeping: false });
        f.setExpression(ex);
        for (let i = 0; i < 120; i++) f.update(1 / 30);
        const src = f.texture.image;
        const c = document.createElement('canvas');
        c.width = 300;
        c.height = 230;
        // The face occupies the middle of the canvas: crop to eyes + mouth.
        c.getContext('2d').drawImage(src, 70, 150, 372, 285, 0, 0, 300, 230);
        const fig = document.createElement('figure');
        fig.style.margin = '0';
        fig.appendChild(c);
        const cap = document.createElement('figcaption');
        cap.textContent = `${id} · ${ex}`;
        fig.appendChild(cap);
        grid.appendChild(fig);
      }
    }
    return list.length;
  },
  [ids, exprs],
);
await page.setViewportSize({ width: exprs.length * 304 + 8, height: n * 252 + 8 });
await page.screenshot({ path: join(process.cwd(), 'test-results', 'faces.png'), fullPage: true });
console.log('faces', n);
await browser.close();
