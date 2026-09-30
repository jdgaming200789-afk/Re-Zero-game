// Taygeta's library after the trial: the Books of the Dead. The lectern
// explains them; Subaru looks for Rem's book (there is none — she's alive)
// and for Hadrian's (the name from the journal page by the ruins), reads
// Hadrian's last morning as a memory, and learns what Shaula's rule about
// the books means.
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
const scenesOver = () => !window.__game.cinematics.playing && !window.__game.dialogue.state && window.__game.mode === 'exploration';
const flag = (k) => page.evaluate((k) => window.__game.state.get(k), k);
const toMarker = (id) =>
  page.evaluate((id) => {
    const g = window.__game;
    const sp = g.scenes.current.spawns.get(id);
    g.player.placeAt(sp.position.clone().setY(sp.position.y + 0.05), sp.yaw);
    g.camera.follow.snapBehind(g.player.followTarget);
  }, id);
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

try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await step(page, 1, false);
  // The story so far: through the gate, Rem settled, Taygeta's trial solved —
  // and the journal page from the pack by the ruins.
  await page.evaluate(() => {
    const g = window.__game;
    for (const k of ['story.opening_done', 'cel.met_shaula', 'alc.rem_settled', 'tay.trial_started', 'tay.trial_cleared', 'story.chapter_done']) g.state.set(k, true);
  });
  await devCommand(page, 'learn flats.hadrian');
  await page.evaluate(() => void window.__game.scenes.goto('taygeta', 'arrive', { fadeSeconds: 0 }));
  await stepUntil(page, () => window.__game.scenes.current?.id === 'taygeta' && !window.__game.scenes.isTransitioning, 120);
  await readThrough(() => 0, scenesOver);
  await devCommand(page, 'returnpoint library');
  await step(page, 1, false);

  // ---------------------------------------------------------------- the lectern
  await toMarker('tay.read');
  await step(page, 0.4, false);
  const focus = await page.evaluate(() => window.__game.interaction.focused?.id);
  await interact();
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'lib.lectern', 10);
  await readThrough(() => 0, () => window.__game.dialogue.state?.phase === 'choice');
  const first = await page.evaluate(() => ({
    books: window.__game.state.bool('know.library.books'),
    quest: window.__game.quests.status('the_library'),
    options: window.__game.dialogue.state?.options ?? [],
  }));
  check(
    'the black book on the lectern: Beatrice names the Books of the Dead, and the side quest starts',
    focus === 'tay.black_book' && first.books && first.quest === 'active' && first.options.some((o) => o.includes('Rem')) && first.options.some((o) => o.includes('Hadrian')),
    JSON.stringify(first),
  );
  await step(page, 0.4, true);
  await shot(page, 'library-01-ask');

  // Rem: there is no book.
  await readThrough(option('Rem'), () => window.__game.dialogue.state?.phase === 'choice' && window.__game.state.bool('lib.searched_rem'));
  const rem = await page.evaluate(() => ({
    alive: window.__game.state.bool('know.library.rem_alive'),
    quest: window.__game.quests.status('the_library'),
    options: window.__game.dialogue.state?.options ?? [],
  }));
  check('looking for Rem’s book finds nothing — she’s alive — and the quest completes', rem.alive && rem.quest === 'done' && !rem.options.some((o) => o.includes('Rem')), JSON.stringify(rem));

  // Hadrian: Julius finds it.
  await readThrough(option('Hadrian'), () => !window.__game.dialogue.state);
  await step(page, 0.5, false);
  const found = await page.evaluate(() => ({
    found: window.__game.state.bool('lib.hadrian_found'),
    book: !!window.__game.scenes.current.root.getObjectByName('HadrianBook'),
  }));
  check('looking for Hadrian (a name only the journal page gave) puts his book on a shelf', found.found && found.book, JSON.stringify(found));

  // ---------------------------------------------------------------- Hadrian's book
  await toMarker('lib.hadrian_read');
  await step(page, 0.4, false);
  await settle();
  await step(page, 0.2, true);
  await shot(page, 'library-02-book');
  const bookFocus = await page.evaluate(() => window.__game.interaction.focused?.id);
  await interact();
  const memory = await stepUntil(page, () => window.__game.cinematics.playing === 'lib.hadrian', 10);
  let dreamt = false;
  let inMemory = null;
  for (let i = 0; i < 700 && (await page.evaluate(() => !!window.__game.cinematics.playing || !!window.__game.dialogue.state)); i++) {
    const d = await page.evaluate(() => window.__game.dialogue.state);
    if (!dreamt && d?.phase === 'line' && (await page.evaluate(() => window.__game.scenes.current.surfaceAt(0, 0) === 'glass'))) {
      dreamt = true;
      inMemory = await page.evaluate(() => ({ lib: window.__game.scenes.current.root.getObjectByName('Library')?.visible, music: window.__game.audio.music?.current ?? null }));
      await settle();
      await step(page, 0.6, true);
      await shot(page, 'library-03-memory');
    }
    if (d?.phase === 'line') await page.evaluate(() => window.__game.dialogue.setSkipping(true));
    await step(page, 0.15, false);
  }
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  const after = await page.evaluate(() => ({
    read: window.__game.state.bool('lib.read_hadrian'),
    knows: window.__game.state.bool('know.library.hadrian'),
    look: window.__game.scenes.current.surfaceAt(0, 0),
    lib: window.__game.scenes.current.root.getObjectByName('Library')?.visible,
  }));
  check(
    'reading it is Hadrian’s last morning: the library dreams away into night, then comes back',
    bookFocus === 'lib.hadrian_book' && memory && dreamt && inMemory?.lib === false && after.read && after.knows && after.look === 'wood' && after.lib === true,
    JSON.stringify({ bookFocus, inMemory, after }),
  );

  // ---------------------------------------------------------------- the rule
  await toMarker('tay.read');
  await step(page, 0.5, false);
  await press(page, 'Mouse:0');
  await step(page, 1.2, false);
  const warned = await page.evaluate(() => ({ warned: window.__game.state.bool('lib.warned'), dying: window.__game.rbd.dying }));
  check('a crack of the whip between the shelves: Beatrice warns him', warned.warned && !warned.dying, JSON.stringify(warned));
  await press(page, 'Mouse:0');
  const died = await stepUntil(page, () => window.__game.rbd.dying, 5);
  await stepUntil(page, () => !window.__game.rbd.dying && window.__game.dialogue.state?.id === 'rbd.return', 90);
  await readThrough(option('fine'));
  const back = await page.evaluate(() => ({
    area: window.__game.scenes.current?.id,
    rule: window.__game.state.bool('know.library.rule'),
    cleared: window.__game.state.bool('tay.trial_cleared'),
    loop: window.__game.state.num('meta.loop'),
    rem: window.__game.state.bool('know.library.rem_alive'),
    searched: window.__game.state.bool('lib.searched_rem'),
  }));
  check(
    'twice is Shaula’s light: he wakes in the library (the trial still solved), knowing the rule — and that Rem is alive',
    died && back.area === 'taygeta' && back.rule && back.cleared && back.loop === 2 && back.rem && !back.searched,
    JSON.stringify(back),
  );
} catch (err) {
  console.error(err);
  results.push({ name: 'no exception', ok: false });
} finally {
  const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
  check('no page errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} library checks passed`);
  process.exit(failed.length ? 1 : 0);
}
