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
const place = (x, y, z, yaw) =>
  page.evaluate(
    ([x, y, z, yaw]) => {
      const g = window.__game;
      const V = g.player.entity.object3D.position.constructor;
      g.player.placeAt(new V(x, y, z), yaw);
      g.camera.follow.snapBehind(g.player.followTarget);
    },
    [x, y, z, yaw],
  );
const interact = async () => {
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', true));
  await step(page, 1 / 60, false);
  await page.evaluate(() => window.__game.input.simulate('Key:KeyE', false));
};
/** The harness renders one frame per step; settle grade and eye adaptation for screenshots. */
const settleLook = () =>
  page.evaluate(() => {
    const g = window.__game;
    g.scenes.applyAtmosphere(g.scenes.current, 0);
    g.render.exposure = g.render.exposureTarget;
  });
/** Stand at a Taygeta constellation and look straight at one of its stars. */
const aimAt = async (key) => {
  const at = await page.evaluate((key) => {
    const s = window.__game.scenes.current.trial.star(key);
    return [s.home.x, s.home.y, s.home.z];
  }, key);
  const len = Math.hypot(at[0], at[2]);
  const dir = [at[0] / len, at[2] / len];
  await place(at[0] - dir[0] * 1.4, 0.05, at[2] - dir[1] * 1.4, Math.atan2(dir[0], dir[1]));
  await page.evaluate(
    ([at, dir]) => {
      const g = window.__game;
      const V = g.render.camera.position.constructor;
      g.camera.cut({ position: new V(at[0] - dir[0] * 3.2, 1.9, at[2] - dir[1] * 3.2), lookAt: new V(...at), fov: 50 });
    },
    [at, dir],
  );
  await step(page, 0.3, false);
  return page.evaluate(() => ({ aimed: window.__game.scenes.current.trial.aimed?.key ?? null, focused: window.__game.interaction.focused?.id ?? null }));
};
const hp = () => page.evaluate(() => window.__game.combat.get(window.__game.player.entity.id)?.hp ?? -1);

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

  // ---------------------------------------------------------------- Alcyone: the Green Room
  // Up the stair on Celaeno's gallery.
  await place(0, 12.05, 18.9, 0);
  await step(page, 0.4, false);
  const upFocus = await page.evaluate(() => window.__game.interaction.focused?.id);
  await interact();
  const inAlcyone = await stepUntil(page, () => window.__game.scenes.current?.id === 'alcyone' && !window.__game.scenes.isTransitioning, 120);
  check('the gallery stair leads up to Alcyone', upFocus === 'cel.to_alcyone' && inAlcyone, String(upFocus));
  await step(page, 1, false);
  const party = await page.evaluate(() => window.__game.party.active.length);
  // Into the Green Room: Rem is laid down.
  await place(Math.sin((120 * Math.PI) / 180) * 13.4, 0.05, Math.cos((120 * Math.PI) / 180) * 13.4, (120 * Math.PI) / 180);
  const remScene = await stepUntil(page, () => window.__game.cinematics.playing === 'alc.rem', 10);
  check('stepping into the Green Room starts Rem’s scene', remScene && party >= 6, `party ${party}`);
  await readThrough(optionIndex('important'), null, () => window.__game.dialogue.state?.id === 'alc.rem_alone');
  await settleLook();
  await step(page, 0.4, true);
  await shot(page, 'tower-05-vigil');
  await readThrough(() => 0, null, cinematicOver);
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  const settled = await page.evaluate(() => {
    const g = window.__game;
    const rem = g.actors.get('rem');
    return {
      settled: g.state.bool('alc.rem_settled'),
      rp: g.checkpoints.current?.id,
      lying: rem?.lying ?? false,
      promised: g.state.bool('alc.promised'),
      ramTold: g.state.bool('alc.ram_told'),
      objective: g.quests.status('the_trials'),
      pose: g.player.visual.root.position.y,
    };
  });
  check(
    'Rem sleeps in the Green Room; the return point moves to her side',
    settled.settled && settled.rp === 'alcyone' && settled.lying && settled.promised && settled.ramTold && settled.objective === 'active',
    JSON.stringify(settled),
  );
  await settleLook();
  await page.evaluate(() => {
    const g = window.__game;
    const V = g.render.camera.position.constructor;
    const s = g.scenes.current.spawns.get('alc.cam_bed').position;
    const h = g.scenes.current.spawns.get('alc.rem_head').position;
    g.camera.cut({ position: new V(s.x, s.y, s.z), lookAt: new V(h.x, h.y, h.z), fov: 40 });
  });
  await step(page, 0.3, true);
  await shot(page, 'tower-06-rem');
  await page.evaluate(() => window.__game.camera.release(0, window.__game.player.followTarget));

  // ---------------------------------------------------------------- Taygeta: the trial
  const up = await page.evaluate(() => {
    const a = (18 / 32) * Math.PI * 2;
    return [Math.sin(a) * 19.2, Math.cos(a) * 19.2, a];
  });
  await place(up[0], 0.05, up[1], up[2]);
  await step(page, 0.4, false);
  await interact();
  const inTaygeta = await stepUntil(page, () => window.__game.scenes.current?.id === 'taygeta' && !window.__game.scenes.isTransitioning, 120);
  check('the way up from Alcyone reaches Taygeta once Rem is settled', inTaygeta);
  await stepUntil(page, () => window.__game.cinematics.playing === 'tay.arrive', 10);
  await readThrough(() => 0, null, cinematicOver);
  await settleLook();
  await step(page, 0.3, true);
  await shot(page, 'tower-07-white-room');
  // Read the question.
  await place(0, 0.05, 1.7, Math.PI);
  await step(page, 0.4, false);
  const monoFocus = await page.evaluate(() => window.__game.interaction.focused?.id);
  await interact();
  await stepUntil(page, () => window.__game.cinematics.playing === 'tay.monolith', 10);
  await readThrough(() => 0, null, cinematicOver);
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  await step(page, 3, false);
  const live = await page.evaluate(() => ({ started: window.__game.state.bool('tay.trial_started'), live: window.__game.scenes.current.trial.live, insight: window.__game.state.bool('know.sky.shaula_star') }));
  check('reading the monolith turns Taygeta into the sky and starts the trial', monoFocus === 'tay.monolith' && live.started && live.live && !live.insight, JSON.stringify(live));
  // A wrong star: Betelgeuse, the red giant at Orion's shoulder.
  const aimB = await aimAt('orion.betelgeuse');
  await settleLook();
  await shot(page, 'tower-08-orion');
  const hp0 = await hp();
  await interact();
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'tay.fail', 10);
  const hp1 = await hp();
  check('looking at a star aims at it; a wrong one burns', aimB.aimed === 'orion.betelgeuse' && aimB.focused === 'tay.star' && hp1 < hp0 && (await flag('tay.fails')) === 1, `${JSON.stringify(aimB)} hp ${hp0}→${hp1}`);
  await readThrough(() => 0, null, cinematicOver);
  await page.evaluate(() => window.__game.camera.release(0, window.__game.player.followTarget));
  // Two more wrong guesses: the hints sharpen until Subaru remembers on his own.
  for (const key of ['scorpius.shaula', 'dipper.dubhe']) {
    await page.evaluate((key) => {
      const a = window.__game.scenes.current;
      void a.touch(a.trial.star(key));
    }, key);
    await stepUntil(page, () => window.__game.dialogue.state?.id === 'tay.fail', 10);
    await readThrough(() => 0, null, cinematicOver);
  }
  const knows = await page.evaluate(() => window.__game.state.bool('know.sky.shaula_star') && window.__game.state.bool('know.sky.orion_myth'));
  check('after the third burn Subaru remembers what Shaula is', knows && (await flag('tay.fails')) === 3 && (await hp()) > 0);
  // The fourth guess kills him: Return by Death to the Green Room.
  await page.evaluate(() => {
    const a = window.__game.scenes.current;
    void a.touch(a.trial.star('cassiopeia.navi'));
  });
  const burnDeath = await stepUntil(page, () => window.__game.rbd.dying, 10);
  await stepUntil(page, () => !window.__game.rbd.dying && window.__game.dialogue.state?.id === 'rbd.return', 60);
  await readThrough(optionIndex('fine'));
  const woke = await page.evaluate(() => {
    const g = window.__game;
    return {
      area: g.scenes.current?.id,
      burns: g.state.bool('know.tower.taygeta_burns'),
      star: g.state.bool('know.sky.shaula_star'),
      started: g.state.bool('tay.trial_started'),
      fails: g.state.num('tay.fails'),
      rem: g.actors.has('rem'),
      loop: g.state.num('meta.loop'),
    };
  });
  check(
    'the fourth wrong star is death; he wakes beside Rem, remembering',
    burnDeath && woke.area === 'alcyone' && woke.burns && woke.star && !woke.started && !woke.fails && woke.rem && woke.loop === 3,
    JSON.stringify(woke),
  );

  // ---------------------------------------------------------------- the second climb: Rigel
  await goto('taygeta', 'arrive');
  await step(page, 1, false);
  await readThrough(() => 0, null, cinematicOver);
  await place(0, 0.05, 1.7, Math.PI);
  await step(page, 0.4, false);
  await interact();
  await stepUntil(page, () => window.__game.cinematics.playing === 'tay.monolith', 10);
  await readThrough(() => 0, null, cinematicOver);
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  const insight = await page.evaluate(() => ({ insight: window.__game.state.bool('dlg.tay.monolith.insight'), puzzled: window.__game.state.bool('dlg.tay.monolith.puzzled') }));
  check('what he learned by dying answers the riddle at once', insight.insight && !insight.puzzled, JSON.stringify(insight));
  await step(page, 3, false);
  const aimR = await aimAt('orion.rigel');
  await interact();
  const solving = await stepUntil(page, () => window.__game.cinematics.playing === 'tay.solved', 10);
  await readThrough(() => 0, null, () => window.__game.dialogue.state?.id === 'tay.solved');
  await settleLook();
  await step(page, 0.3, true);
  await shot(page, 'tower-09-library');
  await readThrough(() => 0, null, cinematicOver);
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  const solved = await page.evaluate(() => {
    const g = window.__game;
    const a = g.scenes.current;
    return { cleared: g.state.bool('tay.trial_cleared'), quest: g.quests.status('the_trials'), library: !!a.library, look: a.look, live: a.trial.live };
  });
  check(
    'touching Rigel clears the trial: the library rises and the quest completes',
    aimR.aimed === 'orion.rigel' && solving && solved.cleared && solved.quest === 'done' && solved.library && solved.look === 'library' && !solved.live,
    JSON.stringify({ aimR, ...solved }),
  );
  // Leaving is allowed now.
  await goto('celaeno', 'gate');
  await step(page, 0.5, false);
  await place(0, 0.05, 17.6, 0);
  await step(page, 0.4, false);
  await interact();
  const outside = await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && !window.__game.scenes.isTransitioning, 60);
  check('with the trial cleared, the gate opens without Shaula stopping him', outside && !(await page.evaluate(() => window.__game.rbd.dying)));

  // ---------------------------------------------------------------- the balcony
  await goto('alcyone', 'default');
  await step(page, 1, false);
  await place(0, 0.05, -23.6, Math.PI);
  const balcony = await stepUntil(page, () => window.__game.cinematics.playing === 'alc.balcony', 10);
  await readThrough(optionIndex('What do you see'), null, () => window.__game.dialogue.state?.phase === 'choice');
  await settleLook();
  await step(page, 0.3, true);
  await shot(page, 'tower-10-balcony');
  await readThrough(optionIndex('What do you see'), null, cinematicOver);
  check('the balcony: Emilia, the stars, and a promise', balcony && (await flag('bond.emilia')) === 1);
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
