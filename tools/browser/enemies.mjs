// Witchbeast test: a jackal pack notices Subaru, alerts together, fights
// with telegraphed attacks (at most two at once), reacts to Shamak and
// Meili's charm, and is beaten by the party; the encounter ends in victory.
import { launch, waitReady, step, press, hold, shot, devCommand, setYaw } from './harness.mjs';

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
    const es = g.enemies.all();
    return {
      mode: g.mode,
      encounter: g.combat.encounterId,
      states: es.map((e) => e.state),
      alive: es.filter((e) => e.alive).length,
      aware: es.map((e) => +e.awareness.toFixed(2)),
      // Blinded beasts thrash without waiting for the pack's go-ahead.
      tokens: es.filter((e) => (e.state === 'windup' || e.state === 'recover') && !e.health.hasStatus('blinded') && !e.health.hasStatus('charmed')).length,
      telegraphs: g.combat.telegraphs.list?.length ?? 0,
    };
  });

try {
  await waitReady(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.placeAt(new g.player.entity.object3D.position.constructor(-12, 0, -2), Math.PI);
    window.__log = { telegraphs: 0, maxAttackers: 0, hitsOnParty: 0, blinded: 0, charmed: 0, victory: null };
    g.events.on('combat:ended', ({ victory }) => (window.__log.victory = victory));
    g.events.on('combat:hit', ({ targetId }) => {
      const h = g.combat.get(targetId);
      if (h && h.faction === 'party') window.__log.hitsOnParty++;
    });
    const orig = g.combat.telegraph.bind(g.combat);
    g.combat.telegraph = (...a) => {
      window.__log.telegraphs++;
      return orig(...a);
    };
  });
  await setYaw(page, Math.PI);
  await devCommand(page, 'party join beatrice emilia julius meili patrasche');
  await step(page, 0.8, false);
  console.log(await devCommand(page, 'spawn dune_jackal 4 16'));
  await step(page, 1.0, false);
  let s = await S();
  check('jackals start unaware', s.mode === 'exploration' && s.states.every((x) => x === 'idle' || x === 'suspicious'), JSON.stringify(s.states));

  // Walk towards them quietly, then run: they notice and the pack alerts.
  await hold(page, 'Key:KeyW', 2.0);
  let alerted = false;
  for (let i = 0; i < 20 && !alerted; i++) {
    await step(page, 0.25, false);
    s = await S();
    alerted = s.mode === 'combat';
  }
  check('the pack notices Subaru and alerts together', alerted && s.states.filter((x) => x !== 'idle' && x !== 'suspicious').length === 4, `${s.mode} ${JSON.stringify(s.states)} aware ${s.aware}`);
  await page.evaluate(() => window.__game.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat').tryDodge?.());

  // Let the fight play out; sample pack discipline and effects.
  let maxAtk = 0;
  // Companions support rather than carry a fight, so give it time to play out.
  for (let i = 0; i < 180; i++) {
    await step(page, 0.25, i === 10 || i === 30);
    if (i === 10) await shot(page, 'enemies_pack');
    if (i === 30) await shot(page, 'enemies_fight');
    s = await S();
    maxAtk = Math.max(maxAtk, s.tokens);
    if (i === 5) await press(page, 'Key:KeyQ'); // lock on
    if (i === 6) await press(page, 'Key:Digit1'); // Shamak on the locked jackal
    const b = await page.evaluate(() => window.__game.enemies.all().filter((e) => e.health.hasStatus('blinded')).length);
    if (b) await page.evaluate((n) => (window.__log.blinded = Math.max(window.__log.blinded, n)), b);
    const c = await page.evaluate(() => window.__game.enemies.all().filter((e) => e.health.hasStatus('charmed')).length);
    if (c) await page.evaluate((n) => (window.__log.charmed = Math.max(window.__log.charmed, n)), c);
    if (s.alive === 0 || (log0 => log0)(false)) break;
    if (s.mode === 'exploration' && i > 12) break;
  }
  const log = await page.evaluate(() => window.__log);
  check('attacks are telegraphed on the ground', log.telegraphs > 0, `${log.telegraphs} telegraphs`);
  check('no more than two jackals attack at once', maxAtk <= 2, `max ${maxAtk}`);
  check('Shamak blinds jackals', log.blinded > 0, `blinded ${log.blinded}`);
  check("Meili charms a witchbeast", log.charmed > 0, `charmed ${log.charmed}`);
  check('the jackals press their attacks', log.telegraphs >= 3, `${log.telegraphs} attacks, ${log.hitsOnParty} landed`);
  s = await S();
  const hostileLeft = await page.evaluate(() => window.__game.enemies.all().filter((e) => e.alive && !e.health.hasStatus('charmed')).length);
  check('the party wins and the encounter ends', hostileLeft === 0 && log.victory === true && s.mode === 'exploration', `hostile ${hostileLeft}, victory ${log.victory}, ${s.mode}`);
  await step(page, 5, false);
  const left = await page.evaluate(() => window.__game.enemies.all().length);
  check('fallen jackals are cleaned up', left === 0, `${left} left`);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} enemy checks passed`);
process.exitCode = failed.length ? 1 : 0;
