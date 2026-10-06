// Orthographic GLB review using the game's real character shader, rig and face.
// GAME_URL=http://127.0.0.1:5173/ CHROMIUM_PATH=... \
//   node tools/browser/emilia-review.mjs --glb=/assets/models/characters/emilia.glb --out=test-results/emilia/game
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from './harness.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const base = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const out = resolve(opt.out ?? 'test-results/emilia/game');
mkdirSync(out, { recursive: true });
const url = new URL('tools/browser/emilia-review.html', base);
if (opt.glb) url.searchParams.set('glb', opt.glb);
// Optional in-process server also works in isolated execution environments.
let server;
if ('serve' in opt) {
  const { createServer } = await import('vite');
  server = await createServer({ server: { host: url.hostname, port: Number(url.port || 5173), strictPort: true } });
  await server.listen();
}
let browser;
try {
  const opened = await launch({ url: url.href, width: 600, height: 720 });
  browser = opened.browser;
  const { page, errors } = opened;
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
  for (const view of ['front', 'three_quarter', 'side', 'low_front', 'full_front', 'full_side']) {
    await page.evaluate(v => window.emiliaReview.render(v), view);
    await page.screenshot({ path: join(out, `${view}.png`), timeout: 120000 });
  }
  for (const pose of ['standing', 'run', 'bend']) {
    await page.evaluate(p => { window.emiliaReview.pose(p); window.emiliaReview.render('three_quarter'); }, pose);
    await page.screenshot({ path: join(out, `${pose}_three_quarter.png`), timeout: 120000 });
    await page.evaluate(() => window.emiliaReview.render('side'));
    await page.screenshot({ path: join(out, `${pose}_side.png`), timeout: 120000 });
  }
  const info = await page.evaluate(() => {
    const r = window.emiliaReview;
    let meshes = 0;
    r.character.root.traverse(o => { if (o.isSkinnedMesh) meshes++; });
    return { loadedModel: r.character.def.model, projection: 'orthographic', rigBones: r.character.rig.bones.size, skinnedMeshes: meshes, face: !!r.character.face, renderer: r.renderer.info.render };
  });
  writeFileSync(join(out, 'runtime.json'), JSON.stringify({ glb: opt.glb, ...info, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ ...info, errors, out }));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
