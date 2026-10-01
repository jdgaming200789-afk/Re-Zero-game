// Party follow test: companions join, keep up while Subaru runs, route
// around obstacles, settle without crowding him when he stops, are placed
// with him on teleports, and leave cleanly.
import { launch, waitReady, step, stepUntil, hold, shot, devCommand, setYaw, down, up } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const partyState = () =>
  page.evaluate(() => {
    const g = window.__game;
    const p = g.player.entity.object3D.position;
    return g.party.active.map((a) => ({
      id: a.id,
      dist: +a.position.distanceTo(p).toFixed(2),
      speed: +a.velocity.length().toFixed(2),
      y: +(a.position.y - p.y).toFixed(2),
      state: a.brain?.state,
    }));
  });

try {
  await waitReady(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.placeAt(new g.player.entity.object3D.position.constructor(-14, 0, 12), Math.PI);
  });
  await step(page, 0.1, false);
  console.log(await devCommand(page, 'party join emilia beatrice julius patrasche'));
  await step(page, 0.5, false);
  let s = await partyState();
  check('four companions spawned (incl. Patrasche)', s.length === 4, s.map((x) => x.id).join(','));
  check('spawned near the player', s.every((x) => x.dist < 5), s.map((x) => x.dist).join(' '));

  // Run forward (towards -Z) for 4 s.
  await setYaw(page, Math.PI);
  await down(page, 'Key:ShiftLeft');
  await hold(page, 'Key:KeyW', 4);
  await up(page, 'Key:ShiftLeft');
  s = await partyState();
  check('companions keep up while sprinting', s.every((x) => x.dist < 7), s.map((x) => `${x.id}:${x.dist}`).join(' '));
  await shot(page, 'party_running');

  // Stop and wait: they settle, give Subaru room and stand still.
  await step(page, 4, false);
  s = await partyState();
  check('companions settle when the player stops', s.every((x) => x.speed < 0.2), s.map((x) => `${x.id}:${x.speed}/${x.state}`).join(' '));
  check('companions give the player room', s.every((x) => x.dist > 0.6), s.map((x) => x.dist).join(' '));
  check('companions stay grounded', s.every((x) => Math.abs(x.y) < 0.6), s.map((x) => x.y).join(' '));
  await page.evaluate(() => window.__game.camera.follow.snapBehind(window.__game.player.followTarget));
  await step(page, 0.2, false);
  await shot(page, 'party_settled');

  // Climb the stairs to the platform; companions follow the path up.
  await page.evaluate(() => {
    const g = window.__game;
    g.player.placeAt(new g.player.entity.object3D.position.constructor(-8, 0, 0), 0);
  });
  await setYaw(page, 0); // movement is camera-relative
  await step(page, 0.5, false);
  await hold(page, 'Key:KeyW', 2.3);
  await step(page, 3, false);
  s = await partyState();
  const py = await page.evaluate(() => window.__game.player.entity.object3D.position.y);
  check('player reached the platform', py > 1.2, `y=${py.toFixed(2)}`);
  check('companions followed up the stairs', s.every((x) => Math.abs(x.y) < 1.0 && x.dist < 6), s.map((x) => `${x.id}:${x.dist}/${x.y}`).join(' '));
  // Drop off the far edge: companions come down to Subaru's level.
  await hold(page, 'Key:KeyW', 1.6);
  await step(page, 5, false);
  s = await partyState();
  check('companions follow the player down a ledge', s.every((x) => Math.abs(x.y) < 0.6 && x.dist < 6 && x.dist > 0.6), s.map((x) => `${x.id}:${x.dist}/${x.y}`).join(' '));

  // Teleport: companions are placed with the player.
  await devCommand(page, 'tp 10 0 10');
  await step(page, 0.3, false);
  s = await partyState();
  check('companions are placed with the player on teleport', s.every((x) => x.dist < 6), s.map((x) => x.dist).join(' '));

  // Chatter: an interaction triggers an exchange between Beatrice and Subaru.
  await step(page, 1, false);
  await page.evaluate(() => window.__game.events.emit('interaction:completed', { interactableId: 'gym.book', kind: 'inspect' }));
  await step(page, 0.3, false);
  const bark1 = await page.evaluate(() => [...document.querySelectorAll('.rz-bark')].map((n) => n.dataset.speaker + ':' + n.textContent));
  const speaking = await page.evaluate(() => window.__game.chatter.current);
  check('interaction chatter starts with Beatrice', bark1.some((b) => b.startsWith('beatrice:')) && speaking === 'gym.book', bark1.join(' | '));
  await page.evaluate(() => window.__game.camera.follow.snapBehind(window.__game.player.followTarget));
  await shot(page, 'party_chatter');
  await step(page, 5, false);
  const bark2 = await page.evaluate(() => [...document.querySelectorAll('.rz-bark')].map((n) => n.dataset.speaker));
  check('Subaru answers', bark2.includes('subaru'), bark2.join(','));
  await step(page, 4, false);
  const flag = await page.evaluate(() => window.__game.state.get('chatter.gym.book'));
  const after = await page.evaluate(() => window.__game.chatter.current);
  check('exchange finishes and is remembered for this loop', flag === true && after === null, `flag=${flag} current=${after}`);
  await page.evaluate(() => window.__game.events.emit('interaction:completed', { interactableId: 'gym.book', kind: 'inspect' }));
  await step(page, 0.2, false);
  check('a played exchange does not repeat', (await page.evaluate(() => window.__game.chatter.current)) === null);

  // Party outfits: changing the setting re-dresses Emilia at once, and only her.
  const dress = () =>
    page.evaluate(() => ({ model: window.__game.actors.get('emilia')?.visual.def?.model ?? null, bea: window.__game.actors.get('beatrice')?.entity.id ?? null }));
  const before = await dress();
  await page.evaluate(() => {
    const g = window.__game;
    g.settings.set('gameplay', 'partyOutfits', g.settings.gameplay.partyOutfits === 'classic' ? 'arc6' : 'classic');
  });
  await stepUntil(page, (m) => { const a = window.__game.actors.get('emilia'); return !!a && a.visual.def?.model !== m; }, 30, before.model);
  const redressed = await dress();
  check('changing Party outfits re-dresses Emilia right away (Beatrice untouched)', !!redressed.model && redressed.model !== before.model && redressed.bea === before.bea, `${before.model} → ${redressed.model}`);
  await page.evaluate(() => {
    const g = window.__game;
    g.settings.set('gameplay', 'partyOutfits', g.settings.gameplay.partyOutfits === 'classic' ? 'arc6' : 'classic');
  });

  console.log(await devCommand(page, 'party leave all'));
  await step(page, 0.2, false);
  s = await partyState();
  const actors = await page.evaluate(() => window.__game.actors.all().length);
  check('leaving despawns companions', s.length === 0 && actors === 0, `active=${s.length} actors=${actors}`);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} party checks passed`);
process.exitCode = failed.length ? 1 : 0;
