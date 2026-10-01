// Jitter probe: the party follows a sprinting Subaru across open ground at
// uneven frame times (a mix of 144 Hz and 30 Hz frames); measures how
// jerkily each follower's heading, body lean and spring bones (hair,
// skirt, cape) move. Lower is smoother.
//
//   node tools/browser/jitter.mjs            (GAME_URL to target a build)
import { launch, waitReady, step, devCommand } from './harness.mjs';

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors } = await launch({ url: `${BASE}?area=dev_gym&dev=1` });
try {
  await waitReady(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.placeAt(new g.player.entity.object3D.position.constructor(-20, 0, -20), 0);
  });
  console.log(await devCommand(page, 'party join emilia beatrice julius ram meili anastasia'));
  await step(page, 2, false);
  const res = await page.evaluate(async () => {
    const g = window.__game;
    const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)));
    const tracks = new Map();
    for (const a of g.party.active) {
      const extra = a.visual.rig?.extra;
      const spring = extra ? [...extra.entries()].filter(([n]) => /^(hair|skirt|cape|coat|apron)/.test(n) && /_1$/.test(n)).map(([, b]) => b) : [];
      tracks.set(a.id, { a, spring, prevQ: spring.map((b) => b.quaternion.clone()), prevW: spring.map(() => 0), hipsPrev: a.visual.rig ? a.visual.rig.bone('spine').quaternion.clone() : null, hipsW: 0, yawPrev: a.yaw, yawW: 0, jerkSpring: [], jerkBody: [], jerkYaw: [], speed: [] });
    }
    g.input.simulate('Key:KeyW', true);
    g.input.simulate('Key:ShiftLeft', true);
    const pattern = [1 / 144, 1 / 144, 1 / 144, 1 / 30, 1 / 144, 1 / 60, 1 / 144, 1 / 30, 1 / 45];
    for (let i = 0; i < 700; i++) {
      const dt = pattern[i % pattern.length];
      // Weave a little so the party has to steer.
      if (i % 140 === 70) g.input.simulateLook(160, 0);
      if (i % 140 === 0 && i) g.input.simulateLook(-160, 0);
      g.frame(dt, false);
      if (i < 120) continue;
      for (const t of tracks.values()) {
        const a = t.a;
        t.speed.push(a.velocity.length());
        t.spring.forEach((b, k) => {
          const w = angle(b.quaternion, t.prevQ[k]) / dt;
          t.jerkSpring.push(Math.abs(w - t.prevW[k]));
          t.prevW[k] = w;
          t.prevQ[k].copy(b.quaternion);
        });
        if (t.hipsPrev) {
          const q = a.visual.rig.bone('spine').quaternion;
          const w = angle(q, t.hipsPrev) / dt;
          t.jerkBody.push(Math.abs(w - t.hipsW));
          t.hipsW = w;
          t.hipsPrev.copy(q);
        }
        let dy = a.yaw - t.yawPrev;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const wy = dy / dt;
        t.jerkYaw.push(Math.abs(wy - t.yawW));
        t.yawW = wy;
        t.yawPrev = a.yaw;
      }
    }
    g.input.simulate('Key:KeyW', false);
    g.input.simulate('Key:ShiftLeft', false);
    const stat = (xs) => {
      if (!xs.length) return null;
      const s = [...xs].sort((x, y) => x - y);
      return { mean: +(xs.reduce((p, c) => p + c, 0) / xs.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) };
    };
    const out = {};
    for (const [id, t] of tracks) out[id] = { speed: stat(t.speed)?.mean, spring: stat(t.jerkSpring), body: stat(t.jerkBody), yaw: stat(t.jerkYaw) };
    out.player = +g.player.motor.planarSpeed.toFixed(2);
    return out;
  });
  for (const [k, v] of Object.entries(res)) console.log(k.padEnd(10), JSON.stringify(v));
  const e = errors.filter((x) => !/favicon/.test(x));
  if (e.length) console.log('errors:', e.slice(0, 3));
} finally {
  await browser.close();
}
