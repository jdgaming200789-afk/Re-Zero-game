// Menus: the title screen (settings from the title, new game), the pause
// menu, inventory (ringing the Carriage Bell), the map, saving to a slot,
// settings changes (a volume, a key rebinding) and closing back to play.
import { launch, waitReady, step, press, stepUntil, shot } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?dev=1` });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const tap = async (code, settle = 0.1) => {
  await press(page, code);
  await step(page, settle, false);
};
const M = () =>
  page.evaluate(() => ({
    mode: window.__game.mode,
    screen: window.__game.screens.open,
    scale: window.__game.time.timeScale,
    title: document.querySelector('.rz-title')?.classList.contains('visible') ?? false,
  }));

try {
  await waitReady(page);
  await step(page, 1.8, false);
  let m = await M();
  const cont = await page.evaluate(() => document.querySelector('.rz-title .row.disabled .txt')?.textContent);
  check('the game opens on the title, time held still, Continue disabled without saves', m.title && m.mode === 'title' && m.scale === 0 && cont === 'Continue', JSON.stringify(m));
  await shot(page, 'menu_title');

  // Title → Settings → Audio → master volume up → back.
  await tap('Key:ArrowDown'); // New Game → (Load disabled) → Settings
  await tap('Key:Enter', 0.2);
  m = await M();
  const before = await page.evaluate(() => window.__game.settings.audio.master);
  await tap('Key:KeyE'); // → Audio tab
  await tap('Key:ArrowRight');
  const after = await page.evaluate(() => window.__game.settings.audio.master);
  await shot(page, 'menu_settings');
  check('Settings opens from the title; the audio tab changes a volume live', m.screen === 'settings' && Math.abs(after - before - 0.05) < 1e-6, `${before} → ${after}`);
  await tap('Key:Escape', 0.2);
  m = await M();
  check('Back returns to the title', m.screen === null && m.mode === 'title' && m.title, JSON.stringify(m));

  // New game.
  await tap('Key:ArrowUp'); // back to New Game
  await tap('Key:Enter', 0.2);
  const opening = await stepUntil(page, () => window.__game.cinematics.playing === 'tf.opening', 120);
  m = await M();
  check('New Game hides the title and starts the story', opening && !m.title && m.scale > 0, JSON.stringify(m));
  await page.evaluate(() => window.__game.cinematics.skip());
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => ({ c: window.__game.cinematics.playing, d: window.__game.dialogue.state }));
    if (!s.c) break;
    if (s.d?.phase === 'choice') {
      await step(page, 0.3, false);
      await tap('Key:Enter');
    }
    await step(page, 0.25, false);
  }
  await stepUntil(page, () => window.__game.mode === 'exploration', 20);
  await step(page, 1, false);

  // Pause.
  await tap('Key:Escape', 0.2);
  m = await M();
  const status = await page.evaluate(() => document.querySelector('.rz-pause .status')?.textContent ?? '');
  await shot(page, 'menu_pause');
  check('Escape pauses: the pause menu shows where Subaru is and what he is doing', m.screen === 'pause' && m.mode === 'menu' && m.scale === 0 && status.includes('Tower') && status.includes('Scout'), status.slice(0, 80));

  // Inventory → ring the bell.
  await tap('Key:ArrowDown');
  await tap('Key:ArrowDown');
  await tap('Key:Enter', 0.2);
  const inv = await page.evaluate(() => Array.from(document.querySelectorAll('.rz-inventory .row .txt')).map((e) => e.textContent));
  await shot(page, 'menu_inventory');
  check('Inventory lists tonics and the Carriage Bell', inv.includes('Healing Tonic') && inv.includes('Carriage Bell'), inv.join(', '));
  await page.evaluate(() => {
    window.__rung = false;
    window.__game.events.on('story:event', ({ id }) => {
      if (id === 'bell.rung') window.__rung = true;
    });
  });
  // Select the bell row and use it.
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.rz-inventory .row')).map((e) => e.classList.contains('header') ? 'h' : e.querySelector('.txt')?.textContent));
  const target = rows.indexOf('Carriage Bell');
  let sel = await page.evaluate(() => Array.from(document.querySelectorAll('.rz-inventory .row')).findIndex((e) => e.classList.contains('selected')));
  for (let i = 0; i < 6 && sel !== target; i++) {
    await tap('Key:ArrowDown');
    sel = await page.evaluate(() => Array.from(document.querySelectorAll('.rz-inventory .row')).findIndex((e) => e.classList.contains('selected')));
  }
  await tap('Key:Enter', 0.4);
  m = await M();
  const rung = await page.evaluate(() => window.__rung);
  check('Using the bell closes the menus and rings it (a lure the worm can hear)', rung && m.screen === null && m.mode === 'exploration', JSON.stringify(m));

  // Map.
  await tap('Key:KeyM', 0.4);
  await step(page, 0.3, false);
  const lit = await page.evaluate(() => {
    const c = document.querySelector('.rz-map canvas');
    const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < x.length; i += 400) n += x[i] + x[i + 1] + x[i + 2];
    return n;
  });
  await shot(page, 'menu_map');
  m = await M();
  check('The map opens with the tower foot drawn', m.screen === 'map' && lit > 10000, `ink ${lit}`);
  await tap('Key:Escape', 0.2);

  // Save from the pause menu.
  await tap('Key:Escape', 0.2);
  for (let i = 0; i < 4; i++) await tap('Key:ArrowDown'); // Resume → Journal → Inventory → Map → Save
  await tap('Key:Enter', 0.2);
  m = await M();
  await tap('Key:ArrowDown'); // Autosave (disabled) is skipped: Slot 1 is first
  const slotSel = await page.evaluate(() => document.querySelector('.rz-saves .row.selected .txt')?.textContent);
  await tap('Key:Enter', 0.2);
  const saved = await page.evaluate(() => !!window.__game.saves.read('slot1') || !!window.__game.saves.read('slot2'));
  await shot(page, 'menu_save');
  check('Saving to a slot from the pause menu', m.screen === 'saves' && saved, `${slotSel}`);
  await tap('Key:Escape', 0.2);
  m = await M();
  check('Back from saves returns to the pause menu', m.screen === 'pause');

  // Settings → Controls → rebind Interact to G.
  for (let i = 0; i < 6; i++) await tap('Key:ArrowDown'); // … → Settings
  await tap('Key:Enter', 0.2);
  // The screen remembers its last tab; step to Controls.
  for (let i = 0; i < 4; i++) {
    if ((await page.evaluate(() => document.querySelector('.rz-settings .tab.on')?.textContent)) === 'Controls') break;
    await tap('Key:KeyE');
  }
  for (let i = 0; i < 20; i++) {
    const cur = await page.evaluate(() => document.querySelector('.rz-settings .row.selected .txt')?.textContent);
    if (cur === 'Interact') break;
    await tap('Key:ArrowDown');
  }
  await tap('Key:Enter', 0.3);
  await page.waitForTimeout(250); // the capture arms after a moment (ignores key repeat)
  const capturing = await page.evaluate(() => document.querySelector('.rz-settings .row.selected .v')?.textContent);
  await shot(page, 'menu_rebind');
  await page.keyboard.press('g');
  await step(page, 0.2, false);
  const binds = await page.evaluate(() => window.__game.input.bindingsFor('interact'));
  check('Controls can be rebound (Interact → G)', capturing === 'Press a key…' && binds.includes('Key:KeyG'), binds.join(', '));
  await page.evaluate(() => window.__game.settings.resetBindings());

  // Button prompts follow the device in hand (and the style setting).
  const foot = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.rz-settings .foot .rz-key')).map((k) => ({ cls: k.className, text: k.textContent })),
    );
  const kb = await foot();
  await page.evaluate(() => window.__game.input.simulateDevice('gamepad', 'xbox'));
  await step(page, 0.1, false);
  const xb = await foot();
  await shot(page, 'menu_glyphs_xbox');
  await page.evaluate(() => window.__game.input.simulateDevice('gamepad', 'playstation'));
  await step(page, 0.1, false);
  const ps = await foot();
  const psInteract = await page.evaluate(() => window.__game.ui.actionGlyph('interact'));
  await page.evaluate(() => window.__game.settings.set('gameplay', 'buttonPrompts', 'keyboard'));
  await step(page, 0.1, false);
  const forced = await foot();
  await page.evaluate(() => {
    window.__game.settings.set('gameplay', 'buttonPrompts', 'auto');
    window.__game.input.simulateDevice('kbm');
  });
  await step(page, 0.1, false);
  const back = await foot();
  check(
    'Button prompts switch live: keycaps, Xbox buttons, PlayStation symbols, and the style setting wins',
    kb.every((k) => k.cls.includes('kbm')) &&
      xb.every((k) => k.cls.includes('pad xbox')) &&
      ps.every((k) => k.cls.includes('pad playstation')) &&
      psInteract === '✕' &&
      forced.every((k) => k.cls.includes('kbm')) &&
      back.every((k) => k.cls.includes('kbm')) &&
      kb.length > 0,
    `${kb.map((k) => k.text).join(' ')} | ${xb.map((k) => k.text).join(' ')} | ${ps.map((k) => k.text).join(' ')} | ${psInteract}`,
  );

  // Close everything.
  await tap('Key:Escape', 0.2);
  await tap('Key:Escape', 0.2);
  m = await M();
  check('Escape closes the menus and play resumes', m.screen === null && m.mode === 'exploration' && m.scale === 1, JSON.stringify(m));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} menu checks passed`);
process.exitCode = failed.length ? 1 : 0;
