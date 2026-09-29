// Sand Earthworm test: hunts by vibration (running draws it, standing still
// hides you), telegraphs its eruption, is invulnerable underground and
// hurtable when surfaced, starts an elite encounter, and dies to the
// Heliosphere's light.
import { launch, waitReady, step, hold, devCommand, setYaw, down, up, shot } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const W = () =>
  page.evaluate(() => {
    const g = window.__game;
    const w = g.enemies.worm();
    const p = g.player.entity.object3D.position;
    return w
      ? { state: w.state, dist: +Math.hypot(w.head.x - p.x, w.head.z - p.z).toFixed(1), hp: w.health.hp, mode: g.mode, elite: document.querySelector('.rz-boss')?.classList.contains('visible') ?? false }
      : null;
  });

try {
  await waitReady(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.placeAt(new g.player.entity.object3D.position.constructor(-12, 0, -2), Math.PI);
    window.__tele = 0;
    const orig = g.combat.telegraph.bind(g.combat);
    g.combat.telegraph = (...a) => {
      window.__tele++;
      return orig(...a);
    };
  });
  await setYaw(page, Math.PI);
  await devCommand(page, 'spawn sand_earthworm 1 18');
  await step(page, 0.5, false);

  // Invulnerable while burrowed.
  const ignored = await page.evaluate(() => {
    const g = window.__game;
    return g.combat.damage(g.enemies.worm().health, { amount: 50, type: 'physical', sourceId: g.player.entity.id }).ignored;
  });
  check('the worm cannot be hurt underground', ignored === true);

  // Stand still: it wanders, it does not come for Subaru.
  await step(page, 6, false);
  let w = await W();
  const stillTele = await page.evaluate(() => window.__tele);
  check('standing still keeps Subaru hidden from it', stillTele === 0 && w.dist > 3, `dist ${w.dist}, telegraphs ${stillTele}`);

  // Run: the vibration draws it in and it telegraphs an eruption.
  await down(page, 'Key:ShiftLeft');
  await hold(page, 'Key:KeyW', 1.2);
  await up(page, 'Key:ShiftLeft');
  let rose = false;
  for (let i = 0; i < 50 && !rose; i++) {
    await step(page, 0.2, false);
    w = await W();
    rose = w.state === 'rising';
    if (i % 8 === 0 && !rose) {
      await down(page, 'Key:ShiftLeft');
      await hold(page, 'Key:KeyA', 0.4);
      await up(page, 'Key:ShiftLeft');
    }
  }
  check('running draws it in and it telegraphs an eruption', rose && (await page.evaluate(() => window.__tele)) > 0, `${w.state} at ${w.dist} m`);
  await step(page, 1.5, true);
  await shot(page, 'earthworm_erupt');
  w = await W();
  check('surfacing starts an elite encounter with the boss bar', w.mode === 'combat' && w.elite, `${w.mode}, elite bar ${w.elite}`);

  // Hurt it while it's up.
  let hurt = false;
  for (let i = 0; i < 40 && !hurt; i++) {
    await step(page, 0.2, false);
    hurt = await page.evaluate(() => {
      const g = window.__game;
      const wm = g.enemies.worm();
      if (!['breach', 'rear', 'slam'].includes(wm.state)) return false;
      return !g.combat.damage(wm.health, { amount: 40, type: 'physical', sourceId: g.player.entity.id }).ignored;
    });
  }
  w = await W();
  check('it can be hurt while surfaced (resistant)', hurt && w.hp < 1400 && w.hp > 1350, `hp ${w.hp}`);

  // The Heliosphere: light from the tower ends it.
  let dead = false;
  for (let i = 0; i < 60 && !dead; i++) {
    await step(page, 0.2, false);
    dead = await page.evaluate(() => {
      const g = window.__game;
      const wm = g.enemies.worm();
      if (!wm || !['breach', 'rear', 'slam'].includes(wm.state)) return false;
      g.combat.damage(wm.health, { amount: 99999, type: 'light', sourceId: null, tags: ['heliosphere'] });
      return wm.state === 'dead';
    });
    if (!dead && i % 10 === 0) {
      await down(page, 'Key:ShiftLeft');
      await hold(page, 'Key:KeyW', 0.5);
      await up(page, 'Key:ShiftLeft');
    }
  }
  check('the Heliosphere kills it', dead);
  await step(page, 6, false);
  const gone = await page.evaluate(() => window.__game.enemies.worm() === undefined && window.__game.mode === 'exploration');
  check('it sinks away and the encounter ends', gone);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} earthworm checks passed`);
process.exitCode = failed.length ? 1 : 0;
