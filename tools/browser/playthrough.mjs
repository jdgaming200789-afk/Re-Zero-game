// The whole vertical slice, "The Watchtower in the Sand", start to finish:
// title → New Game (the camp opening) → the ruins → the Glass Flats (the
// light kills Subaru; Return by Death) → across the flats to the gate plaza
// → the jackal pack → the Sand Earthworm lured into the light with the bell
// → the gate → Shaula in Celaeno → up to Alcyone with Rem in his arms → the
// Green Room → Taygeta's trial → Rigel → the library and the chapter card.
//
// Travel between beats is by teleport; every beat itself is played through
// the real triggers, zones, interactables, cinematics and dialogue.
import { launch, waitReady, step, press, stepUntil, shot, down, up } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?dev=1` });
const results = [];
const t0 = Date.now();
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  const at = ((Date.now() - t0) / 1000).toFixed(0).padStart(4);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${at}s  ${name}${detail ? `  (${detail})` : ''}`);
};
const readThrough = async (pick = () => 0, done = () => !window.__game.dialogue.state) => {
  for (let i = 0; i < 900; i++) {
    if (await page.evaluate(done)) return;
    const d = await page.evaluate(() => window.__game.dialogue.state);
    if (!d) await step(page, 0.2, false);
    else if (d.phase === 'choice') {
      await step(page, 0.35, false);
      const k = pick(d.options);
      await page.evaluate((k) => document.querySelectorAll('.rz-dlg-choices .opt')[k].dispatchEvent(new MouseEvent('click', { bubbles: true })), k);
      await step(page, 0.2, false);
    } else if (d.phase === 'waiting') await step(page, 0.3, false);
    else {
      await page.evaluate(() => window.__game.dialogue.setSkipping(true));
      await step(page, 0.15, false);
    }
  }
};
const scenesOver = () => !window.__game.cinematics.playing && !window.__game.dialogue.state && window.__game.mode === 'exploration';
const option = (text) => (options) => Math.max(0, options.findIndex((o) => o.includes(text)));
const flag = (k) => page.evaluate((k) => window.__game.state.get(k), k);
const place = (x, z, yaw, y = null) =>
  page.evaluate(
    ([x, z, yaw, y]) => {
      const g = window.__game;
      const V = g.player.entity.object3D.position.constructor;
      const h = y ?? g.physics.groundHeight(x, 40, z, 80) ?? 0;
      g.player.placeAt(new V(x, h, z), yaw);
      g.camera.follow.snapBehind(g.player.followTarget);
    },
    [x, z, yaw, y],
  );
const toMarker = (id) =>
  page.evaluate((id) => {
    const g = window.__game;
    const sp = g.scenes.current.spawns.get(id);
    g.player.placeAt(sp.position.clone(), sp.yaw);
    g.camera.follow.snapBehind(g.player.followTarget);
  }, id);
const interact = async () => {
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', true));
  await step(page, 1 / 60, false);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', false));
};
const inArea = (id, s = 120) => stepUntil(page, (id) => window.__game.scenes.current?.id === id && !window.__game.scenes.isTransitioning, s, id);
const settle = () =>
  page.evaluate(() => {
    const g = window.__game;
    g.scenes.applyAtmosphere(g.scenes.current, 0);
    g.render.exposure = g.render.exposureTarget;
  });
const snap = async (name) => {
  await settle();
  await step(page, 0.2, true);
  await shot(page, `slice-${name}`);
};

try {
  await waitReady(page);
  await step(page, 1.5, false);

  // ------------------------------------------------------------ 1. the camp
  const onTitle = await page.evaluate(() => window.__game.mode === 'title');
  await press(page, 'Key:Enter'); // New Game
  const opening = await stepUntil(page, () => window.__game.cinematics.playing === 'tf.opening', 120);
  await readThrough(() => 0, () => !window.__game.cinematics.playing && !window.__game.dialogue.state);
  await stepUntil(page, () => window.__game.mode === 'exploration', 30);
  const camp = await page.evaluate(() => ({ quest: window.__game.quests.status('watchtower'), rp: window.__game.checkpoints.current?.id, party: window.__game.party.active.length }));
  check('1. title → New Game → the camp opening; the quest and the first return point', onTitle && opening && camp.quest === 'active' && camp.rp === 'camp_night' && camp.party === 7, JSON.stringify(camp));

  // ------------------------------------------------------------ 2. the ruins
  await toMarker('ruins');
  await stepUntil(page, () => window.__game.state.bool('visited.tf.ruins'), 5);
  check('2. the outer ruins are scouted', await flag('visited.tf.ruins'));

  // ------------------------------------------------------------ 3. the Glass Flats, loop 1
  await place(-30, -27, Math.PI);
  await step(page, 0.3, false);
  await down(page, 'Key:ShiftLeft');
  await down(page, 'Key:KeyW');
  const died = await stepUntil(page, () => window.__game.rbd.dying, 8);
  await up(page, 'Key:KeyW');
  await up(page, 'Key:ShiftLeft');
  await stepUntil(page, () => !window.__game.rbd.dying && window.__game.dialogue.state?.id === 'rbd.return', 90);
  await readThrough(option('fine'));
  const loop2 = await page.evaluate(() => ({ loop: window.__game.state.num('meta.loop'), knows: window.__game.state.bool('know.heliosphere.movement'), ruins: window.__game.state.bool('visited.tf.ruins') }));
  check('3. running on the glass: the light, Return by Death to the camp, knowledge kept', died && loop2.loop === 2 && loop2.knows && !loop2.ruins, JSON.stringify(loop2));

  // Loop 2: scout again, then cross (the careful crossing is covered by rbd.mjs).
  await toMarker('ruins');
  await stepUntil(page, () => window.__game.state.bool('visited.tf.ruins'), 5);
  await toMarker('plaza');
  await stepUntil(page, () => window.__game.state.bool('visited.tf.plaza'), 5);

  // ------------------------------------------------------------ 4. the gate plaza: the pack
  await place(0, -97, Math.PI);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyW', true));
  const fight = await stepUntil(page, () => window.__game.combat.encounterId === 'tf.jackals', 12);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyW', false));
  // Let the party fight for a while, then finish it.
  await step(page, 6, false);
  await snap('04-plaza-fight');
  const killPack = () =>
    page.evaluate(() => {
      const g = window.__game;
      for (const m of g.enemies.group('tf.jackals')?.members ?? []) if (m.alive) g.combat.damage(m.health, { amount: 9999, type: 'physical', sourceId: g.player.entity.id });
    });
  await killPack();
  const wave2 = await stepUntil(page, () => window.__game.state.bool('tf.pack_wave2'), 10);
  await step(page, 3, false);
  await killPack();
  const won = await stepUntil(page, () => window.__game.state.bool('tf.plaza_cleared'), 15);
  check('4. the jackal pack on the plaza: a fight in two waves, won', fight && wave2 && won);

  // ------------------------------------------------------------ 5. the Sand Earthworm
  await stepUntil(page, () => window.__game.cinematics.playing === 'tf.worm', 10);
  await readThrough(option('The light'), scenesOver);
  const plan = await page.evaluate(() => ({ plan: window.__game.state.bool('tf.worm_plan'), rp: window.__game.checkpoints.current?.id }));
  await place(0, -42, Math.PI);
  await step(page, 0.2, false);
  await page.evaluate(() => window.__game.dev.exec('bell'));
  await place(-6, -31, Math.PI);
  const wormDead = await stepUntil(page, () => window.__game.state.bool('tf.worm_dead'), 40);
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'tf.worm_dead', 10);
  await readThrough();
  check('5. the worm: the plan (from dying to the light), the bell on the glass, the light takes it', plan.plan && plan.rp === 'plaza' && wormDead, JSON.stringify(plan));

  // ------------------------------------------------------------ 6. the gate, Celaeno, Shaula
  await toMarker('gate');
  await step(page, 0.3, false);
  await interact();
  await inArea('celaeno');
  await stepUntil(page, () => window.__game.cinematics.playing === 'cel.shaula', 20);
  await readThrough(option('That light'), scenesOver);
  const c = await page.evaluate(() => ({ q1: window.__game.quests.status('watchtower'), q2: window.__game.quests.status('the_trials'), rp: window.__game.checkpoints.current?.id, insight: window.__game.state.bool('dlg.cel.shaula.light') }));
  await snap('06-celaeno');
  check('6. through the gate: the first quest done; Shaula, her rules, the trials; the Heliosphere insight', c.q1 === 'done' && c.q2 === 'active' && c.rp === 'celaeno' && c.insight, JSON.stringify(c));

  // ------------------------------------------------------------ 7. Alcyone and the Green Room
  await place(0, 18.9, 0, 12.05);
  await step(page, 0.3, false);
  await interact();
  await inArea('alcyone');
  await stepUntil(page, () => window.__game.cinematics.playing === 'alc.arrive', 10);
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'alc.arrive', 20);
  await snap('07-carry');
  await readThrough(() => 0, scenesOver);
  await place(Math.sin((120 * Math.PI) / 180) * 13.4, Math.cos((120 * Math.PI) / 180) * 13.4, (120 * Math.PI) / 180, 0.05);
  await stepUntil(page, () => window.__game.cinematics.playing === 'alc.rem', 10);
  await readThrough(option('important'), scenesOver);
  const a = await page.evaluate(() => ({ settled: window.__game.state.bool('alc.rem_settled'), rp: window.__game.checkpoints.current?.id, rem: window.__game.actors.get('rem')?.lying ?? false }));
  check('7. up to Alcyone carrying Rem; the Green Room; the return point at her side', a.settled && a.rp === 'alcyone' && a.rem, JSON.stringify(a));

  // ------------------------------------------------------------ 8. Taygeta
  const upStair = await page.evaluate(() => {
    const ang = (18 / 32) * Math.PI * 2;
    return [Math.sin(ang) * 19.2, Math.cos(ang) * 19.2, ang];
  });
  await place(upStair[0], upStair[1], upStair[2], 0.05);
  await step(page, 0.3, false);
  await interact();
  await inArea('taygeta');
  await readThrough(() => 0, scenesOver);
  await place(0, 1.7, Math.PI, 0.05);
  await step(page, 0.3, false);
  await interact();
  await stepUntil(page, () => window.__game.cinematics.playing === 'tay.monolith', 10);
  await readThrough(() => 0, scenesOver);
  await step(page, 3, false);
  const at = await page.evaluate(() => {
    const s = window.__game.scenes.current.trial.star('orion.rigel');
    return [s.home.x, s.home.y, s.home.z];
  });
  const len = Math.hypot(at[0], at[2]);
  const dir = [at[0] / len, at[2] / len];
  await place(at[0] - dir[0] * 1.4, at[2] - dir[1] * 1.4, Math.atan2(dir[0], dir[1]), 0.05);
  await page.evaluate(
    ([at, dir]) => {
      const g = window.__game;
      const V = g.render.camera.position.constructor;
      g.camera.cut({ position: new V(at[0] - dir[0] * 3.2, 1.9, at[2] - dir[1] * 3.2), lookAt: new V(...at), fov: 50 });
    },
    [at, dir],
  );
  await step(page, 0.3, false);
  await snap('08-orion');
  await interact();
  const solving = await stepUntil(page, () => window.__game.cinematics.playing === 'tay.solved', 10);
  let card = false;
  for (let i = 0; i < 700 && (await page.evaluate(() => !!window.__game.cinematics.playing)); i++) {
    const d = await page.evaluate(() => window.__game.dialogue.state);
    if (d?.phase === 'line') await page.evaluate(() => window.__game.dialogue.setSkipping(true));
    if (!card && (await page.evaluate(() => document.querySelector('.rz-titlecard')?.classList.contains('visible')))) {
      card = true;
      await snap('09-chapter-card');
    }
    await step(page, 0.15, false);
  }
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  const end = await page.evaluate(() => ({
    cleared: window.__game.state.bool('tay.trial_cleared'),
    chapter: window.__game.state.bool('story.chapter_done'),
    quest: window.__game.quests.status('the_trials'),
    loop: window.__game.state.num('meta.loop'),
  }));
  check('8. Taygeta: the monolith, the sky, Rigel — the library, the chapter card', solving && card && end.cleared && end.chapter && end.quest === 'done', JSON.stringify(end));
} catch (err) {
  console.error(err);
  results.push({ name: 'no exception', ok: false });
} finally {
  const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
  check('no page errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} playthrough checks passed`);
  process.exit(failed.length ? 1 : 0);
}
