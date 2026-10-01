// Presentation screenshots for the README: stages a frame in each part of
// the game and saves JPEGs to docs/screenshots/.
//
//   node tools/browser/screenshots.mjs        (dev server on :5173, or GAME_URL)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, waitReady, step, devCommand, stepUntil } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const OUT = join(process.cwd(), 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch({ url: `${BASE}?dev=1` });

const skipScenes = async (until) => {
  for (let i = 0; i < 700; i++) {
    if (await page.evaluate(until)) return;
    const d = await page.evaluate(() => window.__game.dialogue.state);
    if (d?.phase === 'choice') await page.evaluate(() => document.querySelectorAll('.rz-dlg-choices .opt')[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    else if (d) await page.evaluate(() => window.__game.dialogue.setSkipping(true));
    await step(page, 0.15, false);
  }
};
const goto = async (area, spawn = 'default') => {
  await page.evaluate(([a, s]) => void window.__game.scenes.goto(a, s, { fadeSeconds: 0, reload: true }), [area, spawn]);
  await stepUntil(page, (a) => window.__game.scenes.current?.id === a && !window.__game.scenes.isTransitioning, 120, area);
};
const flags = (keys) => page.evaluate((keys) => keys.forEach((k) => window.__game.state.set(k, true)), keys);
/** Frame: camera from `from` looking at `at` (world), grade settled, HUD hidden. */
const frame = (from, at, fov = 45) =>
  page.evaluate(
    ([from, at, fov]) => {
      const g = window.__game;
      const V = g.render.camera.position.constructor;
      g.camera.cut({ position: new V(...from), lookAt: new V(...at), fov });
      g.scenes.applyAtmosphere(g.scenes.current, 0);
      g.render.exposure = g.render.exposureTarget;
    },
    [from, at, fov],
  );
/** HUD and world prompts off: pictures, not gameplay captures. */
const hud = (visible) =>
  page.evaluate((v) => {
    const l = window.__game.ui.layers;
    for (const k of ['hud', 'world']) l[k].style.visibility = v ? '' : 'hidden';
  }, visible);
const save = async (name) => {
  await step(page, 0.1, true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 84, timeout: 150000 });
  console.log('saved', name);
};

try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await step(page, 2, false);

  // The camp at the tower's foot: everyone round the fire.
  await hud(false);
  const fire = await page.evaluate(() => {
    const g = window.__game;
    const S = g.scenes.current.spawns;
    const f = S.get('camp.fire').position;
    for (const id of ['subaru', 'emilia', 'beatrice', 'meili', 'julius', 'anastasia', 'ram', 'patrasche']) {
      const sp = S.get(`camp.${id}`);
      const yaw = Math.atan2(f.x - sp.position.x, f.z - sp.position.z);
      if (id === 'subaru') g.player.placeAt(sp.position.clone(), yaw);
      else {
        const a = g.party.follower(id);
        a?.placeAt(sp.position.clone(), yaw);
        a?.hold();
      }
    }
    return [f.x, f.y, f.z];
  });
  await step(page, 2, false);
  await frame([fire[0] + 0.8, fire[1] + 1.75, fire[2] - 5.6], [fire[0] + 0.3, fire[1] + 0.8, fire[2] + 1.0], 50);
  await save('camp');
  await page.evaluate(() => window.__game.party.active.forEach((a) => a.release?.()));

  // Celaeno: Shaula.
  await goto('celaeno', 'gate');
  await stepUntil(page, () => window.__game.cinematics.playing === 'cel.shaula', 30);
  await skipScenes(() => !window.__game.cinematics.playing && !window.__game.dialogue.state && window.__game.mode === 'exploration');
  await step(page, 2, false);
  await frame([1.6, 1.7, 10.2], [0, 1.4, 3.7], 42);
  await save('celaeno');

  // Alcyone: carrying Rem in.
  await goto('alcyone', 'stairs');
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'alc.arrive', 60);
  await step(page, 0.5, false);
  await page.evaluate(() => (window.__game.ui.layers.dialogue.style.visibility = 'hidden'));
  await frame([2.2, 1.55, 10.6], [-0.2, 1.25, 13.1], 40);
  await save('alcyone');
  await page.evaluate(() => (window.__game.ui.layers.dialogue.style.visibility = ''));
  await skipScenes(() => !window.__game.cinematics.playing && !window.__game.dialogue.state);

  // Taygeta: the sky within reach.
  await flags(['alc.rem_settled', 'tay.trial_started']);
  await goto('taygeta', 'arrive');
  await stepUntil(page, () => !!window.__game.cinematics.playing, 10);
  await skipScenes(() => !window.__game.cinematics.playing && !window.__game.dialogue.state && window.__game.mode === 'exploration');
  const rigel = await page.evaluate(() => {
    const s = window.__game.scenes.current.trial.star('orion.rigel');
    return [s.home.x, s.home.y, s.home.z];
  });
  const len = Math.hypot(rigel[0], rigel[2]);
  const dir = [rigel[0] / len, rigel[2] / len];
  await page.evaluate(
    ([at, dir]) => {
      const g = window.__game;
      const V = g.player.entity.object3D.position.constructor;
      g.player.placeAt(new V(at[0] - dir[0] * 1.6, 0.05, at[2] - dir[1] * 1.6), Math.atan2(dir[0], dir[1]));
    },
    [rigel, dir],
  );
  await step(page, 1.5, false);
  // Just Subaru and the sky: the others step out of shot.
  await page.evaluate(() => window.__game.party.active.forEach((a) => (a.entity.object3D.visible = false)));
  await frame([rigel[0] - dir[0] * 3.6 + dir[1] * 0.9, 1.35, rigel[2] - dir[1] * 3.6 - dir[0] * 0.9], [rigel[0], rigel[1] + 0.9, rigel[2]], 58);
  await save('taygeta');
  await page.evaluate(() => window.__game.party.active.forEach((a) => (a.entity.object3D.visible = true)));

  // The library, and the chapter card.
  await flags(['tay.trial_cleared', 'story.chapter_done']);
  await goto('taygeta', 'arrive');
  await step(page, 2, false);
  await frame([9, 7.5, 9], [0, 1.2, 0], 60);
  await page.evaluate(() => void window.__game.ui.titleCardShow('The Watchtower in the Sand', 'End of the chapter — the Taygeta Library is open.', 'Re:Zero · Pleiades', 30));
  await step(page, 2.5, false);
  await save('chapter-card');

  // Electra: the Sword Saint. (Dismiss the chapter card first.)
  await page.evaluate(() => document.querySelector('.rz-titlecard')?.classList.remove('visible'));
  await goto('electra', 'arrive');
  await stepUntil(page, () => window.__game.dialogue.state?.id === 'ele.reid', 60);
  await skipScenes(() => !window.__game.cinematics.playing && !window.__game.dialogue.state);
  await stepUntil(page, () => window.__game.combat.encounterId === 'ele.reid', 10);
  await step(page, 6, false);
  // Reid and the swordsman facing him: the others step out of shot.
  await page.evaluate(() => window.__game.party.active.forEach((a) => { if (a.id !== 'julius') a.entity.object3D.visible = false; }));
  const reid = await page.evaluate(() => {
    const a = window.__game.scenes.current.duel.actor;
    return [a.position.x, a.position.y, a.position.z, a.yaw];
  });
  const f = [Math.sin(reid[3]), Math.cos(reid[3])];
  await frame([reid[0] + f[0] * 3.2 + f[1] * 2.2, reid[1] + 1.5, reid[2] + f[1] * 3.2 - f[0] * 2.2], [reid[0], reid[1] + 1.15, reid[2]], 44);
  await save('electra');
  await page.evaluate(() => window.__game.party.active.forEach((a) => (a.entity.object3D.visible = true)));
} catch (err) {
  console.error(err);
} finally {
  const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
  if (relevant.length) console.log('page errors:', relevant.slice(0, 3).join(' | '));
  await browser.close();
}
