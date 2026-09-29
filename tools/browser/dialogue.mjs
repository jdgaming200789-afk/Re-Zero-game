// Dialogue, quests, journal and the opening cinematic: typewriter reveal,
// advance / log / auto / skip, choices (hidden, locked, insight), effects,
// branching on story state, conversation camera, quest auto-start and
// objective tracking, the journal screen, and the camp opening scene with
// its hold-to-skip.
import { launch, waitReady, step, press, down, up, devCommand, stepUntil, shot, hold } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const D = () =>
  page.evaluate(() => {
    const g = window.__game;
    const box = document.querySelector('.rz-dlg-box');
    return {
      mode: g.mode,
      state: g.dialogue.state,
      shown: box ? box.querySelectorAll('.c.on').length : 0,
      total: box ? box.querySelectorAll('.c').length : 0,
      following: g.camera.isFollowing,
      visible: document.querySelector('.rz-dialogue')?.classList.contains('visible') ?? false,
    };
  });
const tap = (code) => press(page, code);

try {
  await waitReady(page);
  await devCommand(page, 'party join emilia beatrice');
  await step(page, 1.5, false);

  // ---------------------------------------------------------------- conversation basics
  await devCommand(page, 'dialogue gym.chat');
  await step(page, 0.35, false);
  let d = await D();
  check('a conversation takes over: dialogue mode, window up, Emilia speaking', d.mode === 'dialogue' && d.visible && d.state?.speaker === 'emilia', `${d.mode}, ${d.state?.speaker}`);
  check('text is revealed letter by letter', d.shown > 0 && d.shown < d.total, `${d.shown}/${d.total}`);
  await step(page, 0.7, false);
  check('the conversation camera frames the speakers', !(await D()).following);
  await tap('Key:Space');
  d = await D();
  check('advance completes the line first', d.shown === d.total && d.state?.speaker === 'emilia');
  await tap('Key:Space');
  await step(page, 0.1, false);
  d = await D();
  check('...then moves to the next line', d.state?.speaker === 'subaru', d.state?.text.slice(0, 30));
  await shot(page, 'dialogue_gym');

  await tap('Key:KeyL');
  const logOpen = await page.evaluate(() => document.querySelector('.rz-dlg-log')?.classList.contains('visible') && document.querySelectorAll('.rz-dlg-log .entry').length >= 2);
  await tap('Key:KeyL');
  const logClosed = await page.evaluate(() => !document.querySelector('.rz-dlg-log')?.classList.contains('visible'));
  check('the log shows what was said and closes again', logOpen && logClosed);

  await tap('Key:KeyA');
  const reachedChoice = await stepUntil(page, () => window.__game.dialogue.state?.phase === 'choice', 20);
  await tap('Key:KeyA');
  d = await D();
  check('auto mode reads on by itself up to the choice', reachedChoice, d.state?.options.join(' | '));
  const opts = d.state?.options ?? [];
  check('choices: unavailable insight hidden, locked option shown with its hint', opts.length === 3 && opts[2].startsWith('[locked]') && !opts.some((o) => o.includes('light')));

  const tonicBefore = await page.evaluate(() => window.__game.state.num('inv.tonic'));
  await step(page, 0.4, false); // reading the options
  await tap('Key:ArrowDown');
  await tap('Key:Enter');
  await step(page, 0.2, false);
  const tonicAfter = await page.evaluate(() => window.__game.state.num('inv.tonic'));
  check('a choice applies its effects (Beatrice hands over a tonic)', tonicAfter === tonicBefore + 1, `${tonicBefore} → ${tonicAfter}`);

  await tap('Key:KeyK');
  const ended = await stepUntil(page, () => window.__game.dialogue.playing === null, 5);
  await step(page, 1.2, false);
  const after = await page.evaluate(() => {
    const g = window.__game;
    return { mode: g.mode, done: g.state.bool('gym.chat_done'), following: g.camera.isFollowing, choice: g.dialogue.history.some((h) => h.choice) };
  });
  check('skip runs to the end; control and the follow camera return', ended && after.mode === 'exploration' && after.following && after.done && after.choice);

  // ---------------------------------------------------------------- quests
  const quest = await page.evaluate(() => ({ st: window.__game.quests.status('gym_training'), tracked: window.__game.quests.tracked }));
  await step(page, 0.3, false);
  const tracker = await page.evaluate(() => document.querySelector('.rz-tracker')?.classList.contains('visible') && document.querySelector('.rz-tracker .qt-title')?.textContent);
  check('a quest starts itself from story state and appears on the tracker', quest.st === 'active' && quest.tracked === 'gym_training' && tracker === 'Practice Makes Perfect', `${quest.st}, ${tracker}`);

  await devCommand(page, 'tp arena');
  await step(page, 0.3, false);
  await hold(page, 'Key:KeyW', 2.2);
  await step(page, 0.5, false);
  const ring = await page.evaluate(() => window.__game.state.bool('quest.gym_training.ring'));
  check('walking into the ring completes the first objective', ring);
  await page.evaluate(() => {
    const g = window.__game;
    for (const h of g.combat.all()) if (h.faction === 'enemy' || h.effectiveFaction === 'enemy') g.combat.damage(h, { amount: 999, type: 'physical', sourceId: g.player.entity.id });
  });
  const won = await stepUntil(page, () => window.__game.quests.status('gym_training') === 'done', 8);
  await step(page, 0.8, false);
  const banner = await page.evaluate(() => document.querySelector('.rz-quest-banner')?.classList.contains('visible') && document.querySelector('.rz-quest-banner .kicker')?.textContent);
  check('winning completes the quest with a banner', won && banner === 'Quest Complete', String(banner));
  await shot(page, 'quest_complete');

  // ---------------------------------------------------------------- insight choice
  await devCommand(page, 'learn heliosphere.movement');
  await devCommand(page, 'flag gym.chat_done false');
  await step(page, 3.5, false);
  await devCommand(page, 'dialogue gym.chat');
  await page.evaluate(() => window.__game.dialogue.setSkipping(true));
  await stepUntil(page, () => window.__game.dialogue.state?.phase === 'choice', 5);
  d = await D();
  const insight = await page.evaluate(() => !!document.querySelector('.rz-dlg-choices .opt.insight'));
  check('knowledge from another loop unlocks an insight option', insight && d.state.options.some((o) => o.includes('light')), d.state?.options.join(' | '));
  await shot(page, 'dialogue_choice');
  await step(page, 0.3, false);
  await page.click('.rz-dlg-choices .opt.insight');
  await step(page, 0.2, false);
  const thought = await page.evaluate(() => document.querySelector('.rz-dlg-box')?.classList.contains('thought'));
  check('clicking an option picks it; Subaru’s thoughts are styled as thoughts', thought);
  await tap('Key:KeyK');
  await stepUntil(page, () => window.__game.dialogue.playing === null, 5);
  await step(page, 1, false);

  // ---------------------------------------------------------------- journal
  await tap('Key:KeyJ');
  await step(page, 0.1, false);
  const j1 = await page.evaluate(() => ({ mode: window.__game.mode, open: document.querySelector('.rz-journal')?.classList.contains('visible'), text: document.querySelector('.rz-journal .body')?.textContent }));
  await shot(page, 'journal_quests');
  await tap('Key:KeyE');
  const j2 = await page.evaluate(() => document.querySelector('.rz-journal .body')?.textContent ?? '');
  await tap('Key:Escape');
  await step(page, 0.1, false);
  const j3 = await page.evaluate(() => ({ mode: window.__game.mode, open: document.querySelector('.rz-journal')?.classList.contains('visible') }));
  check('the journal pauses the game and lists quests', j1.mode === 'menu' && j1.open && j1.text.includes('Practice Makes Perfect') && j1.text.includes('Completed'));
  check('Subaru Remembers lists knowledge; closing resumes play', j2.includes('The light hunts movement') && j3.mode === 'exploration' && !j3.open);

  // ---------------------------------------------------------------- opening cinematic
  await devCommand(page, 'newgame');
  const started = await stepUntil(page, () => window.__game.cinematics.playing === 'tf.opening', 90);
  await step(page, 0.5, false);
  const cine = await page.evaluate(() => {
    const g = window.__game;
    const m = g.scenes.current.spawns.get('camp.emilia').position;
    const e = g.actors.get('emilia');
    return { area: g.scenes.current.id, mode: g.mode, letterbox: g.ui.letterboxed, party: g.party.active.length, emilia: e ? +e.position.distanceTo(m).toFixed(2) : -1 };
  });
  check('a new game opens on the camp scene: letterbox, party staged at the fire', started && cine.area === 'tower_foot' && cine.letterbox && cine.party === 7 && cine.emilia >= 0 && cine.emilia < 0.6, JSON.stringify(cine));
  await step(page, 2.2, false);
  await shot(page, 'opening_title');
  // Subaru's opening thoughts wait for the player like any line.
  let toDialogue = false;
  let thoughtShot = false;
  for (let i = 0; i < 60 && !toDialogue; i++) {
    const playing = await page.evaluate(() => window.__game.dialogue.playing);
    toDialogue = playing === 'camp.opening';
    if (playing === 'inline') {
      if (!thoughtShot) await shot(page, 'opening_thought');
      thoughtShot = true;
      await tap('Key:Space');
      await tap('Key:Space');
    }
    await step(page, 0.5, false);
  }
  check('the scene flows into the camp conversation', toDialogue);
  // Read through, choosing the insight option (Subaru knows about the light).
  let sawInsight = false;
  let shots = 0;
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => window.__game.dialogue.state);
    if (!s) break;
    if (s.phase === 'choice') {
      const idx = s.options.findIndex((o) => o.includes('glass'));
      if (idx >= 0) sawInsight = true;
      await page.evaluate((k) => {
        const box = document.querySelectorAll('.rz-dlg-choices .opt')[k];
        box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, Math.max(0, idx));
    } else {
      if ([2, 5, 8, 12].includes(i)) await shot(page, `opening_talk_${shots++}`);
      await tap('Key:Space');
      await tap('Key:Space');
    }
    await step(page, 0.25, false);
  }
  const done = await stepUntil(page, () => window.__game.cinematics.playing === null, 20);
  await step(page, 2, false);
  const end = await page.evaluate(() => {
    const g = window.__game;
    return { mode: g.mode, quest: g.quests.status('watchtower'), warned: g.state.bool('tf.warned_party'), done: g.state.bool('story.opening_done'), follow: g.camera.isFollowing, letterbox: g.ui.letterboxed, sage: g.state.bool('know.tower.sage') };
  });
  check('the insight choice is offered at the fire and remembered', sawInsight && end.warned);
  check('after the scene: quest started, knowledge learned, control back', done && end.mode === 'exploration' && end.quest === 'active' && end.done && end.follow && !end.letterbox && end.sage, JSON.stringify(end));
  await shot(page, 'opening_after');

  // ---------------------------------------------------------------- talking to the party
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.actors.get('emilia');
    const p = g.player;
    const V = e.position.constructor;
    // Emilia steps up in front of Subaru, facing him.
    const spot = p.entity.object3D.position.clone().add(new V(Math.sin(p.yaw) * 1.9, 0, Math.cos(p.yaw) * 1.9));
    e.placeAt(spot, p.yaw + Math.PI);
    g.camera.follow.snapBehind(p.followTarget);
  });
  await step(page, 0.5, false);
  const focus = await page.evaluate(() => window.__game.interaction.focused?.id ?? null);
  await tap('Key:KeyE');
  const talking = await stepUntil(page, () => window.__game.dialogue.playing === 'camp.talk.emilia', 5);
  check('talking to a companion at camp starts their conversation', focus === 'talk.emilia' && talking, `focus ${focus}`);
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => window.__game.dialogue.state);
    if (!s) break;
    if (s.phase === 'choice') {
      await step(page, 0.3, false);
      await tap('Key:Enter');
    } else await page.evaluate(() => window.__game.dialogue.setSkipping(true));
    await step(page, 0.2, false);
  }
  await step(page, 1.5, false);
  await tap('Key:KeyE');
  await step(page, 1.2, false);
  const againLine = await page.evaluate(() => window.__game.dialogue.state?.text ?? '');
  check('talking again gets the short follow-up line', againLine.startsWith('Get some rest'), againLine.slice(0, 40));
  await page.evaluate(() => window.__game.dialogue.setSkipping(true));
  await stepUntil(page, () => window.__game.dialogue.playing === null, 5);
  await step(page, 1, false);

  // ---------------------------------------------------------------- hold to skip
  await devCommand(page, 'cine tf.opening');
  await step(page, 1.5, false);
  await down(page, 'Key:KeyK');
  await step(page, 1.2, false);
  await up(page, 'Key:KeyK');
  const skipping = await page.evaluate(() => window.__game.cinematics.skipping);
  // Choices still wait for the player during a skip.
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => ({ c: window.__game.cinematics.playing, d: window.__game.dialogue.state }));
    if (!s.c) break;
    if (s.d?.phase === 'choice') await tap('Key:Enter');
    await step(page, 0.25, false);
  }
  await step(page, 1, false);
  const skipEnd = await page.evaluate(() => ({ c: window.__game.cinematics.playing, mode: window.__game.mode, fade: window.__game.ui.fadeLevel, follow: window.__game.camera.isFollowing }));
  check('holding Skip fast-forwards the scene to the same end state', skipping && skipEnd.c === null && skipEnd.mode === 'exploration' && skipEnd.fade < 0.05 && skipEnd.follow, JSON.stringify(skipEnd));

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} dialogue checks passed`);
process.exitCode = failed.length ? 1 : 0;
