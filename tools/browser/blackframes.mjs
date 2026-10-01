// Black-frame hunt: plays the plaza fight (lock-on, whip combos, dodges,
// camera swings) and reads back each rendered frame, reporting frames where
// most of the screen is near-black and what was in front of the camera.
//
//   node tools/browser/blackframes.mjs [seconds]      (GAME_URL to target a build)
import { launch, waitReady, step, devCommand, stepUntil } from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const SECONDS = Number(process.argv[2] ?? 30);
const { browser, page, errors } = await launch({ url: `${BASE}?dev=1`, width: 640, height: 360 });
// Keep the drawing buffer readable after compositing.
await page.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl2' || type === 'webgl') attrs = { ...(attrs || {}), preserveDrawingBuffer: true };
    return orig.call(this, type, attrs);
  };
});
await page.reload();
try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await stepUntil(page, () => window.__game.checkpoints.current?.id === 'camp_night', 20);
  await page.evaluate(() => {
    for (const k of ['movement', 'glint']) window.__game.state.set(`know.heliosphere.${k}`, true);
    window.__game.state.set('visited.tf.ruins', true);
  });
  await stepUntil(page, () => (window.__game.enemies.group('tf.jackals')?.members.length ?? 0) === 5, 20);
  await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.entity.object3D.position.constructor;
    const y = g.physics.groundHeight(0, 40, -96, 80) ?? 0;
    g.player.placeAt(new V(0, y, -96), Math.PI);
    g.camera.follow.snapBehind(g.player.followTarget);
  });
  await stepUntil(page, () => window.__game.combat.encounterId === 'tf.jackals', 12);
  const res = await page.evaluate(async (seconds) => {
    const g = window.__game;
    const gl = g.render.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    const out = [];
    const frames = Math.round(seconds * 30);
    const inputs = ['Mouse:0', 'Mouse:0', 'Mouse:0', 'Key:Space', 'Mouse:2', 'Key:KeyW', 'Key:KeyA', 'Key:KeyD', 'Key:Digit1'];
    g.input.simulate('Key:KeyQ', true);
    g.frame(1 / 60, false);
    g.input.simulate('Key:KeyQ', false);
    for (let i = 0; i < frames; i++) {
      // Play: a press every few frames, some strafing, camera swings.
      const k = inputs[(i >> 3) % inputs.length];
      if (i % 8 === 0) g.input.simulate(k, true);
      if (i % 8 === 3) g.input.simulate(k, false);
      if (i % 40 < 20) g.input.simulateLook(i % 80 < 40 ? 14 : -14, (i % 120 < 60 ? 2 : -2));
      // Keep the fight going: revive the pack when it runs low.
      if (i % 90 === 0) for (const m of g.enemies.group('tf.jackals')?.members ?? []) if (m.alive && m.health) m.health.hp = m.health.max;
      if (g.combat.get(g.player.entity.id)) g.combat.get(g.player.entity.id).hp = 100;
      g.frame(1 / 60, false);
      g.frame(1 / 60, true);
      g.render.renderer.setRenderTarget(null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      if (i === 0) {
        let s = 0;
        for (let q = 0; q < buf.length; q += 4) s += buf[q] + buf[q + 1] + buf[q + 2];
        out.push({ probeMean: s / (buf.length / 4) / 3 });
      }
      let dark = 0;
      let n = 0;
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const o = (y * w + x) * 4;
          const l = 0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2];
          if (l < 14) dark++;
          n++;
        }
      }
      const frac = dark / n;
      if (frac > 0.35) {
        // What's near the camera?
        const cam = g.render.camera.position;
        const near = [];
        for (const a of [...g.party.active, ...(g.enemies.group('tf.jackals')?.members ?? []).map((m) => m.actor).filter(Boolean)]) {
          const p = a.position ?? a.entity?.object3D.position;
          if (p) near.push([a.id ?? a.def?.id, +p.distanceTo(cam).toFixed(2)]);
        }
        near.sort((x, y) => x[1] - y[1]);
        out.push({ frame: i, dark: +frac.toFixed(2), cam: [cam.x, cam.y, cam.z].map((v) => +v.toFixed(2)), player: +g.player.entity.object3D.position.distanceTo(cam).toFixed(2), near: near.slice(0, 3), vfx: g.vfx?.debugActive?.() ?? null });
      }
    }
    for (const k of inputs) g.input.simulate(k, false);
    return { frames, flagged: out };
  }, SECONDS);
  console.log(`frames ${res.frames}, dark frames ${res.flagged.length}`);
  for (const f of res.flagged.slice(0, 25)) console.log(JSON.stringify(f));
  writeFileSync(join(OUT_DIR, 'blackframes.json'), JSON.stringify(res, null, 1));
  if (errors.length) console.log('errors', errors.slice(0, 3));
} finally {
  await browser.close();
}
