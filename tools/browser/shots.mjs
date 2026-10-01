// Conversation camera review: plays the camp conversations with each
// companion and measures every shot — where the speaker's head sits in
// frame, how large it is, how far the camera is, and whether anything
// blocks the view. Flags off-frame heads, extreme close-ups and occlusion,
// and saves a contact sheet of shots per conversation.
//
//   node tools/browser/shots.mjs [companion ...]     (GAME_URL to target a build)
import { launch, waitReady, step, devCommand, stepUntil, shot } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const WHO = process.argv.slice(2).length ? process.argv.slice(2) : ['emilia', 'julius', 'ram', 'beatrice', 'anastasia', 'meili'];
const { browser, page, errors } = await launch({ url: `${BASE}?dev=1`, width: 960, height: 540 });

const measure = () =>
  page.evaluate(() => {
    const g = window.__game;
    const st = g.dialogue.state;
    if (!st) return null;
    const cam = g.render.camera;
    cam.updateMatrixWorld();
    const V = cam.position.constructor;
    const vis = (id) => (g.player?.characterId === id ? g.player.visual : g.actors.get(id)?.visual);
    const v = st.speaker ? vis(st.speaker) : null;
    const out = { speaker: st.speaker, kind: g.camera.currentShot?.kind ?? (g.camera.isFollowing ? 'follow' : 'shot'), text: (st.text ?? '').slice(0, 40) };
    if (!v) return out;
    const head = v.socketPosition('head', new V());
    const top = head.clone().add(new V(0, 0.13, 0));
    const chin = head.clone().add(new V(0, -0.12, 0));
    const p = head.clone().project(cam);
    const behind = head.clone().applyMatrix4(cam.matrixWorldInverse).z > 0;
    const hTop = top.project(cam).y;
    const hChin = chin.project(cam).y;
    out.dist = +cam.position.distanceTo(head).toFixed(2);
    out.ndc = [+p.x.toFixed(2), +p.y.toFixed(2)];
    out.headFrac = +(Math.abs(hTop - hChin) / 2).toFixed(3);
    out.fov = +cam.fov.toFixed(1);
    out.offFrame = behind || Math.abs(p.x) > 0.92 || Math.abs(p.y) > 0.92;
    out.blocked = !g.physics.lineOfSight(cam.position, head);
    return out;
  });

try {
  await waitReady(page);
  await devCommand(page, 'newgame skip');
  await stepUntil(page, () => window.__game.scenes.current?.id === 'tower_foot' && window.__game.mode === 'exploration', 120);
  await stepUntil(page, () => window.__game.checkpoints.current?.id === 'camp_night', 20);
  await page.evaluate(() => window.__game.ui.layers.hud && (window.__game.ui.layers.hud.style.visibility = 'hidden'));
  const all = [];
  for (const who of WHO) {
    const started = await page.evaluate((who) => {
      const g = window.__game;
      const e = g.actors.get(who);
      if (!e) return false;
      const p = g.player;
      const V = e.position.constructor;
      const spot = p.entity.object3D.position.clone().add(new V(Math.sin(p.yaw) * 1.9, 0, Math.cos(p.yaw) * 1.9));
      e.placeAt(spot, p.yaw + Math.PI);
      g.camera.follow.snapBehind(p.followTarget);
      return true;
    }, who);
    if (!started) continue;
    await step(page, 0.4, false);
    await devCommand(page, `dialogue camp.talk.${who}`);
    const lines = [];
    for (let i = 0; i < 40; i++) {
      await step(page, 0.9, i % 3 === 0);
      const m = await measure();
      if (!m) break;
      lines.push(m);
      if (i % 3 === 0) await shot(page, `shots_${who}_${i}`);
      const phase = await page.evaluate(() => window.__game.dialogue.state?.phase);
      const key = phase === 'choice' ? 'Key:Enter' : 'Key:Space';
      for (let k = 0; k < 2; k++) {
        await page.evaluate((key) => {
          const g = window.__game;
          g.input.simulate(key, true);
          g.frame(1 / 60, false);
          g.input.simulate(key, false);
          g.frame(1 / 60, false);
        }, key);
      }
      if (!(await page.evaluate(() => window.__game.dialogue.playing))) break;
    }
    await stepUntil(page, () => window.__game.dialogue.playing === null, 5);
    await step(page, 1, false);
    console.log(`\n=== ${who}: ${lines.length} lines`);
    for (const l of lines) {
      const flag = [l.offFrame && 'OFF-FRAME', l.blocked && 'BLOCKED', l.headFrac > 0.3 && 'TOO-CLOSE', l.headFrac !== undefined && l.headFrac < 0.03 && 'TINY'].filter(Boolean).join(' ');
      console.log(`  ${String(l.speaker).padEnd(10)} ${String(l.kind).padEnd(7)} d=${String(l.dist).padEnd(5)} ndc=${JSON.stringify(l.ndc)} head=${l.headFrac} fov=${l.fov} ${flag}`);
    }
    all.push(...lines);
  }
  const bad = all.filter((l) => l.offFrame || l.blocked || l.headFrac > 0.3);
  console.log(`\n${all.length} shots, ${bad.length} flagged; head size ${Math.min(...all.map((l) => l.headFrac ?? 1)).toFixed(3)}..${Math.max(...all.map((l) => l.headFrac ?? 0)).toFixed(3)}; closest ${Math.min(...all.map((l) => l.dist ?? 99))} m`);
  const e = errors.filter((x) => !/favicon/.test(x));
  if (e.length) console.log('errors:', e.slice(0, 3));
} finally {
  await browser.close();
}
