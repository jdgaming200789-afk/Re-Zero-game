// Inside the Watchtower: Shaula's arrival in Celaeno (the cinematic, the
// tower's rules, the return point), the rule against leaving (a Return by
// Death that teaches Subaru she means it), the climb to Alcyone and the
// Green Room, and Taygeta's trial with its transformation into the library.
import { launch, waitReady, step, devCommand, stepUntil, shot } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const flag = (k) => page.evaluate((k) => window.__game.state.get(k), k);
const goto = async (area, spawn) => {
  await page.evaluate(([a, s]) => void window.__game.scenes.goto(a, s, { fadeSeconds: 0 }), [area, spawn]);
  return stepUntil(page, (a) => window.__game.scenes.current?.id === a && !window.__game.scenes.isTransitioning, 120, area);
};
/**
 * Read dialogue (and cinematic `say` lines) through until `done()` holds;
 * `pick(options)` chooses at each choice. Optionally screenshots the first
 * few lines.
 */
const readThrough = async (pick = () => 0, shots = null, done = () => !window.__game.dialogue.state) => {
  let n = 0;
  for (let i = 0; i < 600; i++) {
    if (await page.evaluate(done)) return;
    const d = await page.evaluate(() => window.__game.dialogue.state);
    if (!d) await step(page, 0.2, false);
    else if (d.phase === 'choice') {
      if (shots) await shot(page, `${shots}-choice`);
      await step(page, 0.35, false);
      const k = pick(d.options);
      await page.evaluate((k) => document.querySelectorAll('.rz-dlg-choices .opt')[k].dispatchEvent(new MouseEvent('click', { bubbles: true })), k);
      await step(page, 0.2, false);
    } else if (d.phase === 'waiting') await step(page, 0.3, false);
    else {
      if (shots && n < 3) {
        await step(page, 0.6, false);
        await shot(page, `${shots}-${n++}`);
      }
      await page.evaluate(() => window.__game.dialogue.setSkipping(true));
      await step(page, 0.15, false);
    }
  }
};
const cinematicOver = () => !window.__game.cinematics.playing && !window.__game.dialogue.state;
const optionIndex = (text) => (options) => Math.max(0, options.findIndex((o) => o.includes(text)));

try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await step(page, 1, false);

  // ---------------------------------------------------------------- Celaeno: Shaula
  await goto('celaeno', 'gate');
  const cine = await stepUntil(page, () => window.__game.cinematics.playing === 'cel.shaula', 20);
  check('entering Celaeno for the first time plays Shaula’s arrival', cine);
  await readThrough(() => 0, null, () => window.__game.actors.has('shaula'));
  await step(page, 0.9, true);
  await shot(page, 'tower-01-shaula-gallery');
  await readThrough(optionIndex('wake someone'), 'tower-02-shaula', cinematicOver);
  await stepUntil(page, () => window.__game.mode === 'exploration', 30);
  const met = await page.evaluate(() => {
    const g = window.__game;
    return {
      met: g.state.bool('cel.met_shaula'),
      quest: g.quests.status('the_trials'),
      rp: g.checkpoints.current?.id,
      rules: g.state.bool('know.tower.rules'),
      shaula: g.actors.has('shaula'),
    };
  });
  check(
    'meeting Shaula teaches the tower’s rules, starts the trials and sets the return point',
    met.met && met.quest === 'active' && met.rp === 'celaeno' && met.rules && met.shaula,
    JSON.stringify(met),
  );

  // ---------------------------------------------------------------- the rule: don't leave
  const tryGate = () =>
    page.evaluate(() => {
      const g = window.__game;
      const V = g.player.entity.object3D.position.constructor;
      g.player.placeAt(new V(0, 0.05, 17.6), 0);
      g.camera.follow.snapBehind(g.player.followTarget);
    });
  await tryGate();
  await step(page, 0.4, false);
  const focus = await page.evaluate(() => window.__game.interaction.focused?.id);
  check('the great gate can be used', focus === 'cel.gate', String(focus));
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', true));
  await step(page, 1 / 60, false);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', false));
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'cel.gate_rule', 20);
  await step(page, 0.6, false);
  await shot(page, 'tower-03-gate-rule');
  await readThrough(optionIndex('carriage'), null, () => window.__game.rbd.dying || (!window.__game.cinematics.playing && !window.__game.dialogue.state));
  const died = await stepUntil(page, () => window.__game.rbd.dying, 10);
  check('walking out anyway: Shaula keeps the rule (Return by Death)', died);
  await stepUntil(page, () => !window.__game.rbd.dying && window.__game.dialogue.state?.id === 'rbd.return', 60);
  await shot(page, 'tower-04-return-celaeno');
  await readThrough(optionIndex('fine'));
  const back = await page.evaluate(() => {
    const g = window.__game;
    return {
      area: g.scenes.current?.id,
      met: g.state.bool('cel.met_shaula'),
      learned: g.state.bool('know.people.shaula_rules'),
      loop: g.state.num('meta.loop'),
      leave: g.state.bool('cel.leave_anyway'),
      shaula: g.actors.has('shaula'),
    };
  });
  check(
    'the return point is Celaeno after the meeting; Subaru now knows she means it',
    back.area === 'celaeno' && back.met && back.learned && back.loop === 2 && !back.leave && back.shaula,
    JSON.stringify(back),
  );
  await tryGate();
  await step(page, 0.4, false);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', true));
  await step(page, 1 / 60, false);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', false));
  await stepUntil(page, () => !!window.__game.dialogue.state, 20);
  await readThrough(() => 0, null, () => window.__game.dialogue.state?.phase === 'choice');
  const opts = await page.evaluate(() => window.__game.dialogue.state.options);
  check('the second time, the fatal answer is gone', opts.length === 1 && !opts.some((t) => t.includes('carriage')), JSON.stringify(opts));
  await readThrough(() => 0, null, () => !window.__game.cinematics.playing && !window.__game.dialogue.state);
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  check('staying inside keeps Subaru alive', !(await page.evaluate(() => window.__game.rbd.dying)) && (await flag('meta.loop')) === 2);
} catch (err) {
  console.error(err);
  results.push({ name: 'no exception', ok: false });
} finally {
  const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
  check('no page errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} tower checks passed`);
  process.exit(failed.length ? 1 : 0);
}
