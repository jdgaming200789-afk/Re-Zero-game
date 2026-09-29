// Cast review: spawns every character in a lineup in the dev gym and takes
// a full-body shot plus a face close-up of each (test-results/cast_*.png).
//
//   node tools/browser/cast.mjs [id ...]
import { launch, waitReady, step, shot, devCommand } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const only = process.argv.slice(2);

const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1`, width: 1280, height: 720 });
try {
  await waitReady(page);
  // Stand somewhere open, facing away from the sun so the lineup is lit.
  await page.evaluate(() => {
    const g = window.__game;
    g.player.placeAt(new g.player.entity.object3D.position.constructor(-14, 0, 6), Math.PI);
  });
  await step(page, 0.2, false);
  const res = await devCommand(page, `cast ${only.length ? only.join(' ') : 'all'}`);
  console.log(res);
  await step(page, 1.5, false);
  // Hide the player so the lineup is unobstructed.
  await page.evaluate(() => (window.__game.player.visual.root.visible = false));
  console.log(await devCommand(page, 'castshot all 6.2'));
  await step(page, 0.3, false);
  console.log('lineup', await shot(page, 'cast_lineup'));
  const ids = await page.evaluate(() => window.__game.actors.all().map((a) => a.id));
  for (const id of ids) {
    await devCommand(page, `castshot ${id} 0.85`);
    await step(page, 0.1, false);
    console.log(id, await shot(page, `cast_face_${id}`));
  }
  if (errors.length) {
    console.log('Console errors:');
    for (const e of errors) console.log('  ', e);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
