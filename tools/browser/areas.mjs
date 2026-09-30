// Area smoke test: loads every vertical-slice area, checks the player lands
// on solid ground, walks a little, takes a screenshot, and exercises the
// tower gate transition (exterior → Celaeno → exterior).
//   node tools/browser/areas.mjs [baseUrl]
import { launch, waitReady, hold, press, shot, state, step, setYaw } from './harness.mjs';

const base = process.argv[2] ?? process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const failures = [];
const log = (...a) => console.log(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
  log(cond ? '  PASS' : '  FAIL', msg);
};

const { browser, page, errors, logs } = await launch({ url: `${base}?area=tower_foot&dev=1` });
try {
  await waitReady(page, 240000);
  await step(page, 0.6);
  let s = await state(page);
  const baseline = await page.evaluate(() => window.__game.vfx.stats.emitters);
  log('tower_foot', s);
  expect(s.area === 'tower_foot' && s.grounded, 'tower_foot loads with the player grounded at camp');
  await hold(page, 'Key:KeyW', 2);
  s = await state(page);
  expect(s.grounded && s.pos[1] > -1, 'walking the dunes keeps the player on the terrain');
  await shot(page, 'areas-01-towerfoot');

  // Gate → Celaeno
  await page.evaluate(() => {
    const g = window.__game;
    const sp = g.scenes.current.spawns.get('gate');
    g.player.placeAt(sp.position, sp.yaw);
    g.camera.follow.snapBehind(g.player.followTarget);
  });
  await step(page, 0.4);
  s = await state(page);
  log('at gate', s);
  expect(s.focused === 'tf.gate', 'the tower gate is interactable');
  await press(page, 'Key:KeyE');
  for (let i = 0; i < 40 && (await state(page)).area !== 'celaeno'; i++) await step(page, 0.25, false);
  await step(page, 2.5);
  s = await state(page);
  log('after gate', s);
  expect(s.area === 'celaeno' && s.grounded, 'entering the gate loads Celaeno');
  await shot(page, 'areas-02-celaeno');

  // Back out through the great gate
  await setYaw(page, 0);
  await step(page, 0.4);
  s = await state(page);
  expect(s.focused === 'cel.gate', 'Celaeno gate is interactable from inside');
  await press(page, 'Key:KeyE');
  for (let i = 0; i < 40 && (await state(page)).area !== 'tower_foot'; i++) await step(page, 0.25, false);
  await step(page, 2.5);
  s = await state(page);
  expect(s.area === 'tower_foot' && s.grounded, 'leaving returns to the tower foot');
  const leaked = await page.evaluate(() => window.__game.vfx.stats);
  log('vfx after round trip', leaked);
  expect(leaked.emitters <= baseline, `area effects are released on unload (no emitter leaks: ${leaked.emitters} vs ${baseline} on first load)`);

  log(`console errors: ${errors.length}`);
  for (const e of errors) log('  ERR', e);
} catch (err) {
  log('SCENARIO FAILED', err.stack ?? String(err));
  for (const l of logs.slice(-30)) log(l);
  failures.push('exception');
} finally {
  await browser.close();
}
log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join('; ')}` : '\nALL CHECKS PASSED');
if (failures.length || errors.length) process.exitCode = 1;
