// Triangle / draw budget: what the camp plaza scene is made of, grouped by
// owner (characters, creatures, kit batches, terrain, effects).
//
//   node tools/browser/tribudget.mjs      (GAME_URL to target a build)
import { launch, waitReady, devCommand, stepUntil } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page } = await launch({ url: `${BASE}?dev=1`, width: 960, height: 540 });
try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await stepUntil(page, () => window.__game.checkpoints.current?.id === 'camp_night', 20);
  const res = await page.evaluate(() => {
    const g = window.__game;
    const scene = g.render.scene;
    const groups = new Map();
    const owner = (o) => {
      let p = o;
      while (p.parent && p.parent !== scene) {
        if (p.userData?.actorId || /character|creature|visual/i.test(p.name)) break;
        p = p.parent;
      }
      return p.name || p.type;
    };
    scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh) return;
      const geo = o.geometry;
      const n = geo.index ? geo.index.count : geo.attributes.position.count;
      const inst = o.isInstancedMesh ? o.count : 1;
      const tris = (n / 3) * inst;
      const k = owner(o);
      const e = groups.get(k) ?? { tris: 0, meshes: 0, outline: 0, shadow: 0 };
      e.tris += tris;
      e.meshes++;
      if (/outline/.test(o.name)) e.outline += tris;
      if (o.castShadow) e.shadow += tris;
      groups.set(k, e);
    });
    return [...groups.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, 40);
  });
  let total = 0;
  for (const [k, v] of res) {
    total += v.tris;
    console.log(`${String(k).slice(0, 34).padEnd(34)} ${(v.tris / 1000).toFixed(1).padStart(7)}k tris ${String(v.meshes).padStart(4)} meshes  outline ${(v.outline / 1000).toFixed(1)}k  shadow ${(v.shadow / 1000).toFixed(1)}k`);
  }
  console.log('total', (total / 1000).toFixed(0) + 'k');
} finally {
  await browser.close();
}
