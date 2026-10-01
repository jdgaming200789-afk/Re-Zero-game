// Fight profiler: plays the camp plaza fight (five jackals, the whole party)
// and times every game system, physics, camera, effects and the render
// submit per frame; also reports draw calls / triangles. Compare against
// the same spot with no fight to see what combat costs.
//
//   node tools/browser/fightperf.mjs [seconds]      (GAME_URL to target a build)
import { launch, waitReady, devCommand, stepUntil } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const SECONDS = Number(process.argv[2] ?? 8);
const { browser, page, errors } = await launch({ url: `${BASE}?dev=1`, width: 960, height: 540 });
try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await stepUntil(page, () => window.__game.checkpoints.current?.id === 'camp_night', 20);
  await page.evaluate(() => {
    const g = window.__game;
    for (const k of ['movement', 'glint']) g.state.set(`know.heliosphere.${k}`, true);
    g.state.set('visited.tf.ruins', true);
    // Instrument.
    const T = (window.__perf = new Map());
    const wrap = (obj, key, label) => {
      const f = obj[key];
      if (typeof f !== 'function') return;
      obj[key] = function (...a) {
        const t0 = performance.now();
        const r = f.apply(this, a);
        T.set(label, (T.get(label) ?? 0) + performance.now() - t0);
        return r;
      };
    };
    for (const s of g.systems) for (const k of ['fixedUpdate', 'update', 'lateUpdate']) wrap(s, k, `${s.name}.${k}`);
    wrap(g.world, 'fixedUpdate', 'world.fixedUpdate');
    wrap(g.world, 'update', 'world.update');
    wrap(g.world, 'lateUpdate', 'world.lateUpdate');
    wrap(g.physics, 'step', 'physics.step');
    wrap(g.camera, 'update', 'camera.update');
    wrap(g.vfx, 'update', 'vfx.update');
    wrap(g.ui, 'update', 'ui.update');
    wrap(g.ui, 'updatePrompt', 'ui.updatePrompt');
    if (g.combatHud) wrap(g.combatHud, 'update', 'combatHud.update');
    wrap(g.render, 'render', 'render');
    wrap(g, 'frame', 'FRAME');
  });
  await stepUntil(page, () => (window.__game.enemies.group('tf.jackals')?.members.length ?? 0) === 5, 20);
  const run = (fight, seconds) =>
    page.evaluate(
      async ({ fight, seconds }) => {
        const g = window.__game;
        const V = g.player.entity.object3D.position.constructor;
        if (fight) {
          const y = g.physics.groundHeight(0, 40, -96, 80) ?? 0;
          g.player.placeAt(new V(0, y, -96), Math.PI);
          g.camera.follow.snapBehind(g.player.followTarget);
          for (let i = 0; i < 600 && g.combat.encounterId !== 'tf.jackals'; i++) g.frame(1 / 60, false);
        }
        // Warm-up, then measure.
        for (let i = 0; i < 60; i++) g.frame(1 / 60, i % 6 === 0);
        window.__perf.clear();
        const inputs = ['Mouse:0', 'Mouse:0', 'Mouse:0', 'Key:Space', 'Mouse:2', 'Key:KeyW', 'Key:KeyA', 'Key:KeyD'];
        const frames = Math.round(seconds * 60);
        let calls = 0;
        let tris = 0;
        let renders = 0;
        const frameTimes = [];
        for (let i = 0; i < frames; i++) {
          if (fight) {
            const k = inputs[(i >> 3) % inputs.length];
            if (i % 8 === 0) g.input.simulate(k, true);
            if (i % 8 === 3) g.input.simulate(k, false);
            if (i % 90 === 0) for (const m of g.enemies.group('tf.jackals')?.members ?? []) if (m.alive && m.health) m.health.hp = m.health.max;
            const me = g.combat.get(g.player.entity.id);
            if (me) me.hp = me.max ?? 100;
          }
          const render = i % 4 === 0;
          const t0 = performance.now();
          g.frame(1 / 60, render);
          frameTimes.push(performance.now() - t0);
          if (render) {
            renders++;
            calls += g.render.renderer.info.render.calls;
            tris += g.render.renderer.info.render.triangles;
          }
        }
        for (const k of inputs) g.input.simulate(k, false);
        const per = {};
        for (const [k, v] of window.__perf) per[k] = +(v / frames).toFixed(3);
        // Render is only every 4th frame: report its per-render cost.
        if (per.render) per.render = +((window.__perf.get('render') ?? 0) / renders).toFixed(2);
        const sorted = Object.entries(per).sort((a, b) => b[1] - a[1]);
        return {
          encounter: g.combat.encounterId,
          enemies: (g.enemies.group('tf.jackals')?.members ?? []).filter((m) => m.alive).length,
          calls: Math.round(calls / renders),
          tris: Math.round(tris / renders),
          programs: g.render.renderer.info.programs?.length,
          top: sorted.slice(0, 22),
        };
      },
      { fight, seconds },
    );
  const calm = await run(false, SECONDS / 2);
  const fight = await run(true, SECONDS);
  for (const [name, r] of [['calm', calm], ['fight', fight]]) {
    console.log(`\n== ${name}: encounter=${r.encounter} enemies=${r.enemies} calls=${r.calls} tris=${(r.tris / 1000).toFixed(0)}k programs=${r.programs}`);
    for (const [k, v] of r.top) console.log(`  ${k.padEnd(28)} ${v} ms`);
  }
  const e = errors.filter((x) => !/favicon/.test(x));
  if (e.length) console.log('errors:', e.slice(0, 3));
} finally {
  await browser.close();
}
