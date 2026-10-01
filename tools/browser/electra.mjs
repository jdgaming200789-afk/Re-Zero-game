// Electra, the second trial: up the library's new stair, Reid Astrea eating
// on the open floor, a duel against a man who parries everything with a pair
// of chopsticks. Head-on he flicks Subaru to death (Return by Death, and a
// lesson); from behind, while he's busy with Julius, the whip snare makes
// him drop a chopstick — and the trial is passed.
import { launch, waitReady, step, devCommand, stepUntil, shot, press } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const readThrough = async (pick = () => 0, done = () => !window.__game.dialogue.state) => {
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
      await page.evaluate(() => window.__game.dialogue.setSkipping(true));
      await step(page, 0.15, false);
    }
  }
};
const option = (text) => (options) => Math.max(0, options.findIndex((o) => o.includes(text)));
const scenesOver = () => !window.__game.cinematics.playing && !window.__game.dialogue.state && (window.__game.mode === 'exploration' || window.__game.mode === 'combat');
const interact = async () => {
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', true));
  await step(page, 1 / 60, false);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', false));
};
const settle = () =>
  page.evaluate(() => {
    const g = window.__game;
    g.scenes.applyAtmosphere(g.scenes.current, 0);
    g.render.exposure = g.render.exposureTarget;
  });
const reid = () =>
  page.evaluate(() => {
    const d = window.__game.scenes.current.duel;
    const a = d?.actor;
    return a ? { state: d.state, parries: d.parries, hp: d.health?.hp ?? null, pos: [a.position.x, a.position.z], yaw: a.yaw, focus: d.focusTarget()?.name ?? null } : null;
  });
/** Stand `dist` metres from Reid at `angle` off his facing (0 = in front), facing him. */
const aroundReid = (angle, dist) =>
  page.evaluate(
    ([angle, dist]) => {
      const g = window.__game;
      const a = g.scenes.current.duel.actor;
      const yaw = a.yaw + angle;
      const V = a.position.constructor;
      const at = new V(a.position.x + Math.sin(yaw) * dist, a.position.y + 0.05, a.position.z + Math.cos(yaw) * dist);
      g.player.placeAt(at, Math.atan2(a.position.x - at.x, a.position.z - at.z));
    },
    [angle, dist],
  );

try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await step(page, 1, false);
  await page.evaluate(() => {
    const g = window.__game;
    for (const k of ['story.opening_done', 'cel.met_shaula', 'alc.rem_settled', 'tay.trial_started', 'tay.trial_cleared', 'story.chapter_done']) g.state.set(k, true);
    g.quests.start('the_sword_saint');
  });
  await page.evaluate(() => void window.__game.scenes.goto('taygeta', 'arrive', { fadeSeconds: 0 }));
  await stepUntil(page, () => window.__game.scenes.current?.id === 'taygeta' && !window.__game.scenes.isTransitioning, 120);
  await readThrough(() => 0, scenesOver);

  // ---------------------------------------------------------------- up from the library
  await page.evaluate(() => {
    const g = window.__game;
    const V = g.player.entity.object3D.position.constructor;
    g.player.placeAt(new V(0, 0.05, -17.6), Math.PI);
    g.camera.follow.snapBehind(g.player.followTarget);
  });
  await step(page, 0.5, false);
  const upFocus = await page.evaluate(() => window.__game.interaction.focused?.id);
  await interact();
  const arrived = await stepUntil(page, () => window.__game.scenes.current?.id === 'electra' && !window.__game.scenes.isTransitioning, 120);
  const intro = await stepUntil(page, () => window.__game.cinematics.playing === 'ele.arrive', 15);
  check('the library’s far wall opens onto a stair up to Electra, and Reid is waiting', upFocus === 'tay.to_electra' && arrived && intro, String(upFocus));
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'ele.reid', 30);
  await step(page, 0.6, false);
  await settle();
  await step(page, 0.2, true);
  await shot(page, 'electra-01-reid');
  await readThrough(() => 0, scenesOver);
  const duel = await stepUntil(page, () => window.__game.combat.encounterId === 'ele.reid', 10);
  const met = await page.evaluate(() => ({
    met: window.__game.state.bool('ele.met_reid'),
    knows: window.__game.state.bool('know.people.reid'),
    rp: window.__game.checkpoints.current?.id,
    music: window.__game.audio.music?.current ?? null,
  }));
  check('meeting him: the trial begins as a duel, and the return point is Electra', duel && met.met && met.knows && met.rp === 'electra', JSON.stringify(met));

  // ---------------------------------------------------------------- nothing touches him
  await step(page, 8, false);
  await settle();
  await step(page, 0.2, true);
  await shot(page, 'electra-02-duel');
  const r1 = await reid();
  check('the party attacks and every blow is parried with a clack of wood', r1.parries >= 3 && r1.hp === 999 && r1.state === 'duel', JSON.stringify(r1));

  // Head-on: Subaru's snare is parried and draws his eye. (A flick already
  // winding up can stagger him off the snare: then wait out the cooldown
  // and try again — that's the fight, not a failure.)
  let r2 = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await aroundReid(0, 2.2);
    await step(page, 0.1, false);
    await stepUntil(page, () => window.__game.player.entity.components.find((c) => c.constructor.name === 'SubaruCombat')?.state === 'free', 3);
    const before = (await reid()).parries;
    await press(page, 'Mouse:2');
    await step(page, 0.8, false);
    r2 = await reid();
    if (r2.parries > before && r2.focus === 'Subaru') break;
    await step(page, 3.2, false);
  }
  check('a snare from the front is turned aside — and now he’s looking at Subaru', r2.state === 'duel' && r2.parries > r1.parries && r2.focus === 'Subaru', JSON.stringify(r2));

  // ---------------------------------------------------------------- dying to chopsticks
  await page.evaluate(() => {
    const g = window.__game;
    const h = g.combat.get(g.player.entity.id);
    h.hp = 12;
  });
  let died = false;
  for (let i = 0; i < 60 && !died; i++) {
    await aroundReid(0, 1.6);
    await step(page, 0.25, false);
    died = await page.evaluate(() => window.__game.rbd.dying);
  }
  await stepUntil(page, () => !window.__game.rbd.dying && window.__game.dialogue.state?.id === 'rbd.return', 90);
  await readThrough(option('fine'));
  const back = await page.evaluate(() => ({
    area: window.__game.scenes.current?.id,
    lesson: window.__game.state.bool('know.reid.attention'),
    cause: window.__game.state.get('meta.last_death'),
    inCombat: window.__game.combat.inCombat,
    reid: window.__game.scenes.current.duel?.state,
  }));
  check('standing in front of him is death by chopstick; he wakes in Electra knowing Reid only watches one of them', died && back.area === 'electra' && back.lesson && back.cause === 'combat.reid' && !back.inCombat, JSON.stringify(back));

  // ---------------------------------------------------------------- the rematch, and the chopstick
  await stepUntil(page, () => window.__game.scenes.current.duel?.state === 'seated', 20);
  await aroundReid(0, 2);
  await step(page, 0.4, false);
  const talkFocus = await page.evaluate(() => window.__game.interaction.focused?.id);
  await interact();
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'ele.rematch', 10);
  await readThrough(option('Again'));
  const again = await stepUntil(page, () => window.__game.combat.encounterId === 'ele.reid', 10);
  check('talking to him again starts a rematch', talkFocus === 'ele.reid' && again, String(talkFocus));
  // Let Julius engage him; then come at him from behind.
  await step(page, 5, false);
  let snared = false;
  for (let i = 0; i < 12 && !snared; i++) {
    const f = await reid();
    if (f.focus === 'Subaru') {
      await step(page, 1, false);
      continue;
    }
    await aroundReid(Math.PI, 2.4);
    await step(page, 0.05, false);
    await press(page, 'Mouse:2');
    snared = await stepUntil(page, () => window.__game.cinematics.playing === 'ele.cleared' || window.__game.scenes.current.duel?.state === 'yielded', 2);
    if (!snared) await step(page, 1.2, false);
  }
  await step(page, 1, false);
  await settle();
  await step(page, 0.3, true);
  await shot(page, 'electra-03-chopstick');
  await readThrough(() => 0, scenesOver);
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  const won = await page.evaluate(() => ({
    cleared: window.__game.state.bool('ele.trial_cleared'),
    how: window.__game.state.get('ele.snared_how'),
    quest: window.__game.quests.status('the_sword_saint'),
    reid: window.__game.scenes.current.duel?.state,
    inCombat: window.__game.combat.inCombat,
  }));
  check('from behind, while he duels Julius, the snare makes him drop a chopstick: the trial is passed', snared && won.cleared && won.how === 'behind' && won.quest === 'done' && won.reid === 'seated' && !won.inCombat, JSON.stringify(won));
} catch (err) {
  console.error(err);
  results.push({ name: 'no exception', ok: false });
} finally {
  const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
  check('no page errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} electra checks passed`);
  process.exit(failed.length ? 1 : 0);
}
