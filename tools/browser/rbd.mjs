// Return by Death: the return point at camp, dying to the Heliosphere on
// the Glass Flats, the rewind (world state and quests roll back, knowledge
// and the loop count do not), the Witch's punishment when Subaru tries to
// tell, the second crossing with the detection HUD and cover, the light
// taking the Sand Earthworm, and saving / loading.
import { launch, waitReady, step, devCommand, stepUntil, shot, setYaw, down, up } from './harness.mjs';

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
    const area = g.scenes.current;
    const p = g.player.entity.object3D.position;
    return {
      area: area?.id,
      mode: g.mode,
      loop: g.state.num('meta.loop'),
      pos: [+p.x.toFixed(1), +p.z.toFixed(1)],
      helio: area?.heliosphere ? { state: area.heliosphere.state, exposure: +area.heliosphere.exposure.toFixed(2), dodged: area.heliosphere.dodged } : null,
      dying: g.rbd.dying,
    };
  });
const placeOnFlats = (x, z) =>
  page.evaluate(
    ([x, z]) => {
      const g = window.__game;
      const V = g.player.entity.object3D.position.constructor;
      const y = g.physics.groundHeight(x, 30, z, 60) ?? 0;
      g.player.placeAt(new V(x, y, z), Math.PI);
      g.camera.follow.snapBehind(g.player.followTarget);
    },
    [x, z],
  );
const sprint = async (seconds) => {
  await down(page, 'Key:ShiftLeft');
  await down(page, 'Key:KeyW');
  await step(page, seconds, false);
  await up(page, 'Key:KeyW');
  await up(page, 'Key:ShiftLeft');
};
const readThrough = async (pick) => {
  for (let i = 0; i < 60; i++) {
    const d = await page.evaluate(() => window.__game.dialogue.state);
    if (!d) return;
    if (d.phase === 'choice') {
      await step(page, 0.35, false);
      await page.evaluate((k) => document.querySelectorAll('.rz-dlg-choices .opt')[k].dispatchEvent(new MouseEvent('click', { bubbles: true })), pick(d.options));
      await step(page, 0.2, false);
    } else if (d.phase === 'waiting') await step(page, 0.3, false);
    else {
      await page.evaluate(() => window.__game.dialogue.setSkipping(true));
      await step(page, 0.15, false);
    }
  }
};

try {
  await waitReady(page);
  await page.evaluate(() => {
    window.__events = [];
    window.__game.events.on('story:event', ({ id }) => window.__events.push(id));
  });
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await step(page, 1.5, false);
  const start = await page.evaluate(() => ({ rp: window.__game.checkpoints.current?.id, auto: !!window.__game.saves.read('auto'), loop: window.__game.state.num('meta.loop') }));
  check('the story starts with a return point at the camp (and an autosave)', start.rp === 'camp_night' && start.auto && start.loop === 1, JSON.stringify(start));

  // ---------------------------------------------------------------- loop 1: the light
  // Scout the ruins first (world state that the rewind must undo).
  await devCommand(page, 'tp ruins');
  await step(page, 1, false);
  await placeOnFlats(-30, -27);
  await setYaw(page, Math.PI);
  await step(page, 0.5, false);
  const ruins = await page.evaluate(() => window.__game.state.bool('visited.tf.ruins'));
  let s = await S();
  check('no warning HUD before Subaru knows what the light is', !(await page.evaluate(() => document.querySelector('.rz-helio')?.classList.contains('visible'))), `on flats at ${s.pos}`);
  await sprint(2.8);
  const glinted = await page.evaluate(() => window.__events.includes('heliosphere.glint'));
  const died = await stepUntil(page, () => window.__game.rbd.dying, 4);
  check('running across the open glass draws the glint, then the light kills Subaru', glinted && died);
  await step(page, 0.3, false);
  await shot(page, 'helio_strike');
  const returned = await stepUntil(page, () => window.__game.state.num('meta.loop') === 2 && !window.__game.rbd.dying, 90);
  s = await S();
  const after = await page.evaluate(() => {
    const g = window.__game;
    return {
      movement: g.state.bool('know.heliosphere.movement'),
      glint: g.state.bool('know.heliosphere.glint'),
      ruins: g.state.bool('visited.tf.ruins'),
      objective: g.state.bool('quest.watchtower.ruins'),
      quest: g.quests.status('watchtower'),
      party: g.party.active.length,
      cause: g.state.str('meta.last_death'),
    };
  });
  check('Return by Death: loop 2, back at the camp', returned && s.area === 'tower_foot' && Math.hypot(s.pos[0] - 5, s.pos[1] - 50) < 6, JSON.stringify(s.pos));
  check('the world rewound: places visited and objectives done since the camp are undone', ruins && !after.ruins && !after.objective && after.quest === 'active', JSON.stringify(after));
  check('knowledge survives: Subaru knows the light hunts movement and glints first', after.movement && after.glint && after.cause === 'heliosphere');
  check('the party is back, whole', after.party === 7);

  // ---------------------------------------------------------------- the taboo
  const inReturn = await stepUntil(page, () => window.__game.dialogue.playing === 'rbd.return', 10);
  await shot(page, 'rbd_return');
  await readThrough((opts) => opts.findIndex((o) => o.startsWith('Listen')));
  const punished = await page.evaluate(() => ({ n: window.__game.state.num('meta.punishments'), scale: window.__game.time.timeScale, mode: window.__game.mode }));
  check('trying to tell someone brings the Witch; time starts again after', inReturn && punished.n === 1 && punished.scale === 1 && punished.mode === 'exploration', JSON.stringify(punished));

  // ---------------------------------------------------------------- loop 2: cover
  await placeOnFlats(-14, -33.5);
  await setYaw(page, Math.PI);
  await step(page, 0.4, false);
  const hud = await page.evaluate(() => document.querySelector('.rz-helio')?.classList.contains('visible'));
  check('with that knowledge the detection meter appears on the flats', hud);
  await down(page, 'Key:ShiftLeft');
  await down(page, 'Key:KeyW');
  let alarm = false;
  for (let i = 0; i < 20; i++) {
    await step(page, 0.1, false);
    alarm = alarm || (await page.evaluate(() => document.querySelector('.rz-helio')?.classList.contains('alarm')));
    if (await page.evaluate(() => window.__game.player.entity.object3D.position.z < -42.5)) break;
  }
  await up(page, 'Key:KeyW');
  await up(page, 'Key:ShiftLeft');
  await shot(page, 'helio_hidden');
  await step(page, 2.5, false);
  s = await S();
  const cover = await page.evaluate(() => window.__game.state.bool('know.heliosphere.cover'));
  check('the glint is readable now, and hiding behind the ruins makes the light miss', alarm && s.helio.dodged === 1 && !s.dying && s.loop === 2 && cover, JSON.stringify(s.helio));

  // ---------------------------------------------------------------- the worm in the light
  await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player.entity.object3D.position.clone();
    await g.enemies.spawnWorm(p.clone().add(new p.constructor(-18, 0, -6)));
  });
  let wormDead = false;
  for (let i = 0; i < 90 && !wormDead; i++) {
    await page.evaluate(() => window.__game.enemies.noise(window.__game.player.entity.object3D.position, 40));
    await step(page, 0.25, false);
    wormDead = await page.evaluate(() => window.__events.includes('heliosphere.worm'));
  }
  await step(page, 0.3, false);
  await shot(page, 'helio_worm');
  const lure = await page.evaluate(() => window.__game.state.bool('know.earthworm.lure'));
  check('the worm surfacing on the glass is struck down by the light', wormDead && lure);
  await step(page, 6, false);

  // ---------------------------------------------------------------- saves
  await placeOnFlats(0, -10);
  await step(page, 0.5, false);
  const saved = await devCommand(page, 'save slot2');
  await devCommand(page, 'flag tf.test_marker true');
  await devCommand(page, 'flag meta.loop 9');
  await placeOnFlats(20, 20);
  // The harness steps frames itself, so start the load without awaiting it.
  await page.evaluate(() => void window.__game.saves.load('slot2'));
  const loaded = await stepUntil(page, () => window.__game.mode === 'exploration' && !window.__game.scenes.isTransitioning && window.__game.state.num('meta.loop') === 2, 120);
  s = await S();
  const flags = await page.evaluate(() => ({ marker: window.__game.state.bool('tf.test_marker'), cover: window.__game.state.bool('know.heliosphere.cover'), rp: window.__game.checkpoints.current?.id }));
  check('saving and loading restores flags, knowledge, return point and position', /Saved/.test(saved) && loaded && !flags.marker && flags.cover && flags.rp === 'camp_night' && Math.hypot(s.pos[0], s.pos[1] + 10) < 1.5, `${saved} | ${JSON.stringify(s.pos)} ${JSON.stringify(flags)}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} return-by-death checks passed`);
process.exitCode = failed.length ? 1 : 0;
