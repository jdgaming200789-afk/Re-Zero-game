// Combat test in the dev gym practice ring: encounter start, lock-on, whip
// combo damage, dodge i-frames, Beatrice-linked Shamak and E·M·M, tonics,
// leaving the ring ends the fight.
import { launch, waitReady, step, press, hold, shot, devCommand, setYaw, down, up } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const S = () =>
  page.evaluate(() => {
    const g = window.__game;
    const sc = g.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat');
    const dummies = g.combat.all().filter((h) => h.name === 'Practice Dummy');
    return {
      mode: g.mode,
      encounter: g.combat.encounterId,
      lock: sc.lockTarget ? sc.lockTarget.name : null,
      state: sc.state,
      hp: sc.health.hp,
      mana: Math.round(sc.mana),
      invuln: sc.health.invulnerable,
      dummyHp: dummies.map((d) => d.hp),
      blinded: dummies.filter((d) => d.hasStatus('blinded')).length,
      pos: g.player.entity.object3D.position.toArray().map((n) => +n.toFixed(2)),
      tonics: g.state.get('inv.tonic'),
    };
  });

try {
  await waitReady(page);
  await devCommand(page, 'party join beatrice');
  await devCommand(page, 'tp arena');
  await setYaw(page, 0);
  await step(page, 0.5, false);
  // Walk into the ring.
  await hold(page, 'Key:KeyW', 1.3);
  await step(page, 0.3, false);
  let s = await S();
  check('entering the ring starts the practice encounter', s.mode === 'combat' && s.encounter === 'gym.practice', `${s.mode} ${s.encounter}`);

  await press(page, 'Key:KeyQ');
  await step(page, 0.2, false);
  s = await S();
  check('lock-on acquires a dummy', s.lock === 'Practice Dummy', String(s.lock));

  // Close in on the target, then a three-hit combo.
  await hold(page, 'Key:KeyW', 0.7);
  const before = (await S()).dummyHp.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 3; i++) {
    await press(page, 'Mouse:0');
    await step(page, i === 1 ? 0.12 : 0.4, i === 1);
    if (i === 1) await shot(page, 'combat_whip');
  }
  await step(page, 1.2, false);
  s = await S();
  const after = s.dummyHp.reduce((a, b) => a + b, 0);
  check('whip combo damages the dummies', before - after >= 15, `${before} → ${after}`);

  // Dodge: moves and grants i-frames.
  const p0 = s.pos;
  await press(page, 'Key:AltLeft');
  await step(page, 0.05, false);
  const inv = (await S()).invuln;
  await step(page, 0.6, false);
  s = await S();
  const moved = Math.hypot(s.pos[0] - p0[0], s.pos[2] - p0[2]);
  check('dodge dives away with invulnerability frames', inv && moved > 2, `moved ${moved.toFixed(2)} m, invuln ${inv}`);

  // Shamak through Beatrice.
  await step(page, 0.5, false);
  await press(page, 'Key:Digit1');
  await step(page, 1.2, false);
  s = await S();
  check('Shamak blinds dummies in its cloud', s.blinded > 0 && s.mana < 100, `blinded ${s.blinded}, mana ${s.mana}`);
  await shot(page, 'combat_shamak');

  // E·M·M: invulnerable while it holds.
  await step(page, 0.6, false);
  await press(page, 'Key:Digit2');
  await step(page, 0.2, true);
  const blocked = await page.evaluate(() => {
    const g = window.__game;
    const sc = g.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat');
    const dummy = g.combat.all().find((h) => h.name === 'Practice Dummy');
    return g.combat.damage(sc.health, { amount: 30, type: 'physical', sourceId: dummy.entity.id }).ignored;
  });
  await shot(page, 'combat_barrier');
  check('E·M·M barrier nullifies a hit', blocked === true);
  await step(page, 1.4, false);
  const counter = await page.evaluate(() => window.__game.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat').nextCritical);
  check('a blow soaked by the barrier sets up a critical counter', counter === true);

  // Perfect dodge: a blow that passes through a fresh dodge slows time.
  await step(page, 0.6, false);
  await press(page, 'Key:AltLeft');
  await step(page, 0.08, false);
  const perfect = await page.evaluate(() => {
    const g = window.__game;
    const sc = g.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat');
    const dummy = g.combat.all().find((h) => h.name === 'Practice Dummy');
    let fired = false;
    const off = g.events.on('combat:perfectDodge', () => (fired = true));
    const r = g.combat.damage(sc.health, { amount: 20, type: 'physical', sourceId: dummy.entity.id });
    off?.();
    return { fired, ignored: r.ignored, scale: g.time.timeScale };
  });
  check('a blow inside a fresh dodge is a perfect dodge (slow motion)', perfect.fired && perfect.ignored && perfect.scale < 0.5, JSON.stringify(perfect));
  await step(page, 1.0, false);

  // Buffered input: a press during the swing chains the next one.
  const chained = await page.evaluate(async () => {
    const g = window.__game;
    const sc = g.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat');
    const press = (code) => {
      g.input.simulate(code, true);
      g.frame(1 / 60, false);
      g.input.simulate(code, false);
    };
    press('Mouse:0');
    for (let i = 0; i < 6; i++) g.frame(1 / 60, false);
    press('Mouse:0'); // buffered mid-swing
    let maxIndex = 0;
    for (let i = 0; i < 60; i++) {
      g.frame(1 / 60, false);
      maxIndex = Math.max(maxIndex, sc.comboIndex);
    }
    return maxIndex;
  });
  check('a press during a swing is buffered into the next combo hit', chained >= 1, `combo index ${chained}`);

  // Take a real hit, then drink a tonic.
  await step(page, 1.5, false);
  await page.evaluate(() => {
    const g = window.__game;
    const sc = g.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat');
    const dummy = g.combat.all().find((h) => h.name === 'Practice Dummy');
    g.combat.damage(sc.health, { amount: 40, type: 'physical', sourceId: dummy.entity.id });
  });
  await step(page, 1.2, false);
  const hurt = (await S()).hp;
  await press(page, 'Key:KeyR');
  await step(page, 1.5, false);
  s = await S();
  check('a tonic heals Subaru', s.hp > hurt && s.tonics === 2, `${hurt} → ${s.hp}, tonics ${s.tonics}`);

  // Companions fight on their own: every member lands hits.
  await devCommand(page, 'party join emilia julius patrasche');
  await page.evaluate(() => {
    const g = window.__game;
    window.__hits = {};
    g.events.on('combat:hit', ({ attackerId }) => {
      const a = g.actors.all().find((x) => x.entity.id === attackerId);
      const id = a ? a.id : attackerId === g.player.entity.id ? 'subaru' : String(attackerId);
      window.__hits[id] = (window.__hits[id] ?? 0) + 1;
    });
  });
  for (let i = 0; i < 12; i++) {
    await step(page, 0.5, i === 7);
    if (i === 7) await shot(page, 'combat_party');
  }
  const hits = await page.evaluate(() => window.__hits);
  const who = ['emilia', 'beatrice', 'julius', 'patrasche'];
  check('every companion lands hits in the practice fight', who.every((w) => (hits[w] ?? 0) > 0), JSON.stringify(hits));
  const states = await page.evaluate(() => window.__game.party.active.map((a) => a.entity.components.find((c) => c.constructor.name === 'CompanionCombat')?.inCombat));
  check('companions switch to combat brains', states.every(Boolean), JSON.stringify(states));

  // Leave the ring: the encounter ends as an escape.
  await press(page, 'Key:KeyQ');
  await setYaw(page, Math.PI);
  await down(page, 'Key:ShiftLeft');
  await hold(page, 'Key:KeyW', 4.5);
  await up(page, 'Key:ShiftLeft');
  await step(page, 0.5, false);
  s = await S();
  check('leaving the ring ends combat', s.mode === 'exploration' && s.encounter === null, `${s.mode} ${s.encounter}`);
  const back = await page.evaluate(() => window.__game.party.active.map((a) => a.brain?.constructor.name));
  check('companions return to following after combat', back.every((b) => b === 'FollowerBrain'), back.join(','));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} combat checks passed`);
process.exitCode = failed.length ? 1 : 0;
