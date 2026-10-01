// Model sheet: one character (or creature) turned round in the dev gym —
// front, three-quarter, side and back full-body views plus a face close-up —
// composed into a single image, test-results/sheet_<id>.png.
//
//   node tools/browser/modelsheet.mjs <id> [id ...] [--expr=smug] [--face=0.7]
import { launch, waitReady, step, devCommand } from './harness.mjs';
import { join } from 'node:path';
import { OUT_DIR } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
if (!ids.length) {
  console.log('usage: node tools/browser/modelsheet.mjs <id> [id ...] [--expr=name] [--face=distance]');
  process.exit(1);
}

const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1`, width: 640, height: 820 });
try {
  await waitReady(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.placeAt(new g.player.entity.object3D.position.constructor(-14, 0, 6), Math.PI);
  });
  await step(page, 0.2, false);
  await devCommand(page, 'camfade off');
  // Hide the player's whip coil (it hangs in the scene at the hip).
  await page.evaluate(() => window.__game.render.scene.traverse((o) => { if (o.geometry?.type === 'TorusGeometry') o.visible = false; }));
  if (opt.gfx) {
    // e.g. --gfx=ambientOcclusion:false,postProcessing:high
    const patch = Object.fromEntries(opt.gfx.split(',').map((kv) => { const [k, v] = kv.split(':'); return [k, v === 'true' ? true : v === 'false' ? false : v]; }));
    await page.evaluate((p) => window.__game.render.applySettings({ ...window.__game.render.graphics, ...p }), patch);
  }
  // The player as subject (`player`): its costume can be chosen.
  await page.evaluate(() => {
    const g = window.__game;
    g.actors.get = ((orig) => (id) => {
      if (id !== 'player') return orig(id);
      const p = g.player;
      return { position: p.entity.object3D.position, get yaw() { return p.yaw; }, visual: p.visual, def: { height: 1.73 } };
    })(g.actors.get.bind(g.actors));
  });
  if (opt.costume) {
    await page.evaluate((c) => window.__game.settings.set('gameplay', 'subaruCostume', c), opt.costume);
    await step(page, 0.1, false);
    await page.waitForFunction(() => window.__game.player.visual.root.parent !== null, null, { timeout: 60000 });
    for (let i = 0; i < 30; i++) {
      await step(page, 0.1, false);
      const done = await page.evaluate(() => !window.__game.costumePending && !window.__game.costumeLoading);
      if (done) break;
    }
  }
  for (const id of ids) {
    await devCommand(page, 'cast clear');
    if (id !== 'player') {
      console.log(await devCommand(page, `cast ${id}`));
      await page.evaluate(() => (window.__game.player.visual.root.visible = false));
    }
    if (opt.expr) await devCommand(page, `aexpr ${id} ${opt.expr}`);
    await step(page, 1.2, false);
    const info = await page.evaluate((id) => {
      const a = window.__game.actors.get(id);
      return { h: a.def?.height ?? 1.7, creature: !a.visual.face };
    }, id);
    const shots = [];
    const views = info.creature
      ? [['side', 90], ['front ¾', 35], ['back ¾', 150], ['front', 0]]
      : [['front', 0], ['¾', 38], ['side', 90], ['back', 180]];
    for (const [label, deg] of views) {
      await page.evaluate(
        ([id, deg, creature]) => {
          const g = window.__game;
          const a = g.actors.get(id);
          const V = a.position.constructor;
          const box = new (g.render.camera.position.constructor)();
          void box;
          const h = creature ? a.visual.socketPosition('head', new V()).y - a.position.y + 0.25 : a.visual.socketPosition('head', new V()).y - a.position.y + 0.2;
          const yaw = a.yaw + (deg * Math.PI) / 180;
          const dist = creature ? Math.max(2.6, (a.def?.height ?? 1.5) * 2.3) : h * 1.75;
          const at = new V(a.position.x, a.position.y + h * 0.5, a.position.z);
          const from = new V(at.x + Math.sin(yaw) * dist, at.y + h * 0.08, at.z + Math.cos(yaw) * dist);
          g.camera.cut({ position: from, lookAt: at, fov: creature ? 44 : 34 });
        },
        [id, deg, info.creature],
      );
      await step(page, 0.05, true);
      await page.waitForTimeout(100);
      shots.push([label, (await page.screenshot({ timeout: 150000 })).toString('base64')]);
    }
    if (info.creature) {
      await page.evaluate((id) => {
        const g = window.__game;
        const a = g.actors.get(id);
        const V = a.position.constructor;
        const head = a.visual.socketPosition('head', new V());
        const fwd = new V(Math.sin(a.yaw + 0.9), 0, Math.cos(a.yaw + 0.9));
        const s = (a.def?.height ?? 1.5) / 2;
        g.camera.cut({ position: head.clone().addScaledVector(fwd, 0.5 + 0.55 * s).add(new V(0, 0.15 * s, 0)), lookAt: head.clone().add(new V(Math.sin(a.yaw) * 0.25 * s, 0, Math.cos(a.yaw) * 0.25 * s)), fov: 40 });
      }, id);
      await step(page, 0.05, true);
      await page.waitForTimeout(100);
      shots.push(['head', (await page.screenshot({ timeout: 150000 })).toString('base64')]);
    }
    if (!info.creature) {
      await page.setViewportSize({ width: 640, height: 820 });
      await page.evaluate(
        ([id, dist]) => {
          const g = window.__game;
          const a = g.actors.get(id);
          const V = a.position.constructor;
          const s = (a.def?.height ?? 1.7) / 1.7;
          const head = a.visual.socketPosition('head', new V()).add(new V(0, 0.085 * s, 0));
          const fwd = new V(Math.sin(a.yaw + 0.35), 0, Math.cos(a.yaw + 0.35));
          g.camera.cut({ position: head.clone().addScaledVector(fwd, dist).add(new V(0, 0.01, 0)), lookAt: head.clone().add(new V(0, -0.035 * s, 0)), fov: 30 });
        },
        [id, Number(opt.face ?? 0.62)],
      );
      await step(page, 0.05, true);
      await page.waitForTimeout(100);
      shots.push(['face', (await page.screenshot({ timeout: 150000 })).toString('base64')]);
      if (opt.torso) {
        await page.evaluate((id) => {
          const g = window.__game;
          const a = g.actors.get(id);
          const V = a.position.constructor;
          const chest = a.visual.socketPosition('chest', new V());
          const fwd = new V(Math.sin(a.yaw - 0.3), 0, Math.cos(a.yaw - 0.3));
          g.camera.cut({ position: chest.clone().addScaledVector(fwd, 1.25).add(new V(0, 0.05, 0)), lookAt: chest.clone().add(new V(0, -0.08, 0)), fov: 34 });
        }, id);
        await step(page, 0.05, true);
        await page.waitForTimeout(100);
        shots.push(['torso', (await page.screenshot({ timeout: 150000 })).toString('base64')]);
      }
    }
    if (id === 'player') await page.evaluate(() => (window.__game.player.visual.root.visible = true));
    const sheet = await browser.newPage({ viewport: { width: 640 * shots.length / 2, height: 820 / 2 + 24 } });
    await sheet.setContent(
      `<body style="margin:0;background:#222;display:flex;font:13px sans-serif;color:#ddd">${shots
        .map(([l, b]) => `<figure style="margin:0;width:320px"><img style="width:320px;height:410px;display:block" src="data:image/png;base64,${b}"><figcaption style="text-align:center;height:24px;line-height:24px">${id} · ${l}</figcaption></figure>`)
        .join('')}</body>`,
    );
    const out = join(OUT_DIR, `sheet_${id}.png`);
    await sheet.screenshot({ path: out });
    await sheet.close();
    console.log('sheet', out);
  }
  if (errors.length) {
    console.log('Console errors:');
    for (const e of errors.slice(0, 5)) console.log('  ', e);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
