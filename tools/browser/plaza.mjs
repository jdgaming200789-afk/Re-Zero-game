// The gate plaza in the story: the jackal pack waiting on the stones, the
// fight waking the Sand Earthworm (its reveal, the plan, the plaza return
// point), dying to it and coming back to the plaza, luring it onto the glass
// with the Carriage Bell so the light takes it, and the gate opening after.
import { launch, waitReady, step, devCommand, stepUntil, shot } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const readThrough = async (pick = () => 0, done = () => !window.__game.dialogue.state, onLine = null) => {
  for (let i = 0; i < 600; i++) {
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
      if (onLine) await onLine(d);
      await page.evaluate(() => window.__game.dialogue.setSkipping(true));
      await step(page, 0.15, false);
    }
  }
};
const over = () => !window.__game.cinematics.playing && !window.__game.dialogue.state;
const optionIndex = (text) => (options) => Math.max(0, options.findIndex((o) => o.includes(text)));
const place = (x, z, yaw) =>
  page.evaluate(
    ([x, z, yaw]) => {
      const g = window.__game;
      const V = g.player.entity.object3D.position.constructor;
      const y = g.physics.groundHeight(x, 40, z, 80) ?? 0;
      g.player.placeAt(new V(x, y, z), yaw);
      g.camera.follow.snapBehind(g.player.followTarget);
    },
    [x, z, yaw],
  );
/** Stand at an area marker (its own height and facing). */
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

try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  // (The camp's return point is set once the party has settled.)
  await stepUntil(page, () => window.__game.checkpoints.current?.id === 'camp_night', 20);
  // As if he has already died once on the glass.
  await page.evaluate(() => {
    for (const k of ['movement', 'glint']) window.__game.state.set(`know.heliosphere.${k}`, true);
    window.__game.state.set('visited.tf.ruins', true); // the ruins were scouted on the way
  });
  await stepUntil(page, () => (window.__game.enemies.group('tf.jackals')?.members.length ?? 0) === 5, 20);
  const pack = await page.evaluate(() => window.__game.enemies.group('tf.jackals')?.members.length ?? 0);
  check('in the story, a jackal pack waits on the gate plaza', pack === 5, String(pack));

  // The gate won't open with them there.
  await toMarker('gate');
  await step(page, 0.4, false);
  const lock1 = await page.evaluate(() => {
    const f = window.__game.interaction.focused;
    return f ? { id: f.id, open: f.isAvailable(window.__game), why: f.lockedMessage(window.__game) } : null;
  });
  check('the gate is closed while the witchbeasts are there', lock1?.id === 'tf.gate' && !lock1.open, JSON.stringify(lock1));

  // Onto the plaza: they notice.
  await place(0, -96, Math.PI);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyW', true));
  const fight = await stepUntil(page, () => window.__game.combat.encounterId === 'tf.jackals', 12);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyW', false));
  await step(page, 1.5, true);
  await shot(page, 'plaza-01-pack');
  const edge = await page.evaluate(() => window.__game.checkpoints.current?.id);
  check('walking onto the plaza starts the fight with the pack (and the return point moves off the flats)', fight && edge === 'plaza_edge', String(edge));
  // (The combat itself is covered elsewhere; end it quickly.)
  const killPack = () =>
    page.evaluate(() => {
      const g = window.__game;
      for (const m of g.enemies.group('tf.jackals').members) if (m.alive) g.combat.damage(m.health, { amount: 9999, type: 'physical', sourceId: g.player.entity.id });
    });
  await killPack();
  const wave2 = await stepUntil(page, () => window.__game.state.bool('tf.pack_wave2') && window.__game.enemies.group('tf.jackals').members.length === 9, 10);
  const held = await page.evaluate(() => window.__game.combat.encounterId === 'tf.jackals' && !window.__game.state.bool('tf.plaza_cleared'));
  const w2 = await page.evaluate(() => {
    const g = window.__game;
    const m = g.enemies.group('tf.jackals')?.members ?? [];
    return { flag: g.state.bool('tf.pack_wave2'), members: m.length, alive: m.filter((x) => x.alive).length, enc: g.combat.encounterId, hostile: g.combat.enemies.length, cleared: g.state.bool('tf.plaza_cleared') };
  });
  await step(page, 1.2, true);
  await shot(page, 'plaza-01b-wave2');
  check('as the first jackals fall, the rest of the pack comes off the dunes — the fight holds until they arrive', wave2 && held, JSON.stringify(w2));
  await killPack();
  const cleared = await stepUntil(page, () => window.__game.state.bool('tf.plaza_cleared'), 10);
  const reveal = await stepUntil(page, () => window.__game.cinematics.playing === 'tf.worm', 10);
  check('beating the pack clears the plaza, and the noise wakes something bigger', cleared && reveal);
  let sawWorm = false;
  await readThrough(optionIndex('The light'), over, async (d) => {
    if (!sawWorm && d.text.includes('train')) {
      sawWorm = true;
      await step(page, 0.2, true);
      await shot(page, 'plaza-02-worm');
    }
  });
  await stepUntil(page, () => window.__game.mode !== 'cinematic' && window.__game.mode !== 'dialogue', 20);
  const after = await page.evaluate(() => {
    const g = window.__game;
    return {
      seen: g.state.bool('tf.worm_seen'),
      plan: g.state.bool('tf.worm_plan'),
      insight: g.state.bool('dlg.tf.worm.light'),
      rp: g.checkpoints.current?.id,
      worm: !!g.enemies.worm(),
      objective: g.quests.status('watchtower'),
      vibration: g.state.bool('know.earthworm.vibration'),
    };
  });
  check(
    'the worm shows itself; knowing the light, Subaru has the plan; the return point moves to the plaza',
    after.seen && after.plan && after.insight && after.rp === 'plaza' && after.worm && after.vibration,
    JSON.stringify(after),
  );

  // Dying to it brings him back to the plaza, worm and all — not to camp.
  await page.evaluate(() => window.__game.rbd.die('combat.sand_earthworm'));
  await stepUntil(page, () => !window.__game.rbd.dying && window.__game.dialogue.state?.id === 'rbd.return', 60);
  await readThrough(optionIndex('fine'));
  await stepUntil(page, () => !!window.__game.enemies.worm(), 20);
  const back = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player.entity.object3D.position;
    return {
      area: g.scenes.current?.id,
      pos: [+p.x.toFixed(1), +p.z.toFixed(1)],
      worm: !!g.enemies.worm(),
      pack: g.enemies.group('tf.jackals')?.members.filter((m) => m.alive).length ?? 0,
      cleared: g.state.bool('tf.plaza_cleared'),
      loop: g.state.num('meta.loop'),
    };
  });
  check(
    'dying to the worm returns him to the plaza: the pack stays dead, the worm is still down there',
    back.area === 'tower_foot' && Math.hypot(back.pos[0] - 1, back.pos[1] + 104) < 3 && back.worm && back.pack === 0 && back.cleared && back.loop === 2,
    JSON.stringify(back),
  );

  // The lure: ring the bell out on the glass, then get behind stone and keep still.
  const ringAt = [0, -42];
  const glass = await page.evaluate(([x, z]) => window.__game.scenes.current.surfaceAt(x, z), ringAt);
  await place(ringAt[0], ringAt[1], Math.PI);
  await step(page, 0.2, false);
  await devCommand(page, 'bell');
  await place(-6, -31, Math.PI);
  await page.evaluate(() => {
    const g = window.__game;
    const V = g.render.camera.position.constructor;
    g.camera.cut({ position: new V(-9, 3.5, -26), lookAt: new V(0, 1, -44), fov: 55 });
  });
  let struck = false;
  for (let i = 0; i < 400 && !(await page.evaluate(() => window.__game.state.bool('tf.worm_dead'))); i++) {
    await step(page, 0.1, false);
    if (!struck && (await page.evaluate(() => window.__game.scenes.current.heliosphere.state === 'strike'))) {
      struck = true;
      await step(page, 0.15, true);
      await shot(page, 'plaza-03-light');
    }
  }
  const dead = await page.evaluate(() => ({
    dead: window.__game.state.bool('tf.worm_dead'),
    lure: window.__game.state.bool('know.earthworm.lure'),
    alive: window.__game.rbd.dying ? 'dying' : 'fine',
  }));
  check('the bell on the glass draws the worm up into the light, which kills it', glass === 'glass' && dead.dead && dead.lure && dead.alive === 'fine', `${glass} ${JSON.stringify(dead)}`);
  await page.evaluate(() => window.__game.camera.release(0, window.__game.player.followTarget));
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'tf.worm_dead', 10);
  await readThrough();

  // The gate opens now.
  await toMarker('gate');
  await step(page, 0.4, false);
  const open = await page.evaluate(() => {
    const f = window.__game.interaction.focused;
    return f ? { id: f.id, open: f.isAvailable(window.__game) } : null;
  });
  await interact();
  const inside = await stepUntil(page, () => window.__game.scenes.current?.id === 'celaeno' && !window.__game.scenes.isTransitioning, 120);
  const quest = await page.evaluate(() => window.__game.quests.status('watchtower'));
  check('with the worm gone the gate opens; entering the tower completes the first quest', open?.open && inside && quest === 'done', `${JSON.stringify(open)} ${quest}`);
} catch (err) {
  console.error(err);
  results.push({ name: 'no exception', ok: false });
} finally {
  const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
  check('no page errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} plaza checks passed`);
  process.exit(failed.length ? 1 : 0);
}
