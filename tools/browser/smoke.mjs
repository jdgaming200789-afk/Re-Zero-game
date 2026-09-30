// Phase 1 smoke test: boots the dev gym, walks, sprints, climbs stairs,
// jumps, looks around, interacts with objects; reports errors + screenshots.
//   node tools/browser/smoke.mjs [baseUrl]
import { launch, waitReady, hold, press, look, shot, state, devCommand, step, down, up, setYaw, stepUntil } from './harness.mjs';

const base = process.argv[2] ?? process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const { browser, page, errors, logs } = await launch({ url: `${base}?area=dev_gym&dev=1` });
const failures = [];
const log = (...a) => console.log(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
  log(cond ? '  PASS' : '  FAIL', msg);
};

try {
  await waitReady(page);
  await step(page, 0.5);
  let s = await state(page);
  log('boot', s);
  await shot(page, 'gym-01-boot');

  // Walk forward: spawn faces -Z
  await hold(page, 'Key:KeyW', 1.5);
  s = await state(page);
  log('after walk', s);
  expect(s.pos[2] < 0, 'running 1.5 s moves the player several metres');

  // Sprint drains stamina
  await down(page, 'Key:ShiftLeft');
  await hold(page, 'Key:KeyW', 1.5);
  await up(page, 'Key:ShiftLeft');
  s = await state(page);
  log('after sprint', s);
  expect(s.stamina < 100, 'sprinting drains stamina');

  await look(page, 500, -80);
  await shot(page, 'gym-02-look');

  // Stairs: platform top is 1.44 m
  await devCommand(page, 'tp stairs');
  await hold(page, 'Key:KeyW', 2.2);
  s = await state(page);
  log('after stairs', s);
  expect(s.pos[1] > 1.3, 'climbed the staircase onto the platform');
  await shot(page, 'gym-03-stairs');

  // Jump
  await press(page, 'Key:Space');
  await step(page, 0.2, false);
  const y0 = s.pos[1];
  s = await state(page);
  log('mid jump', s);
  expect(s.pos[1] > y0 + 0.2 && !s.grounded, 'jump leaves the ground');
  await step(page, 1.0, false);
  s = await state(page);
  expect(s.grounded, 'lands after jump');

  // Steep ramp must not be climbable
  await devCommand(page, 'tp 4.5 0 3.5');
  await setYaw(page, 0);
  await hold(page, 'Key:KeyW', 2.5);
  s = await state(page);
  log('steep ramp', s);
  expect(s.pos[1] < 1.2, 'cannot walk up a 58° slope');

  // Corridor camera
  await devCommand(page, 'tp corridor');
  await hold(page, 'Key:KeyW', 1.2);
  await shot(page, 'gym-04-corridor');

  // Interaction: book on lectern at (5, 1.03, -1)
  await devCommand(page, 'tp 5 0 0.8');
  await setYaw(page, Math.PI);
  await step(page, 0.3);
  s = await state(page);
  log('near book', s);
  expect(s.focused === 'gym.book', 'book gets interaction focus');
  await shot(page, 'gym-05-prompt');
  await press(page, 'Key:KeyE');
  const inspectVisible = await stepUntil(page, () => document.querySelector('.rz-inspect')?.classList.contains('visible'), 8);
  await step(page, 0.5);
  await shot(page, 'gym-06-inspect');
  expect(inspectVisible, 'examine card opens');
  await press(page, 'Key:KeyE');
  const done = await stepUntil(page, () => !window.__game.interaction.busy, 6);
  expect(done, 'interaction completes after dismissing the card');

  // Hold-to-use lever at (-4, 1, -4)
  await devCommand(page, 'tp -4 0 -2.9');
  await setYaw(page, Math.PI);
  await step(page, 0.3);
  s = await state(page);
  log('near lever', s);
  expect(s.focused === 'gym.lever', 'lever gets focus');
  await hold(page, 'Key:KeyE', 1.2);
  await step(page, 3.0);
  const gate = await devCommand(page, 'flag gym.gate_open');
  log(gate);
  expect(gate.includes('true'), 'holding the lever opens the gate');
  await shot(page, 'gym-07-lever');

  // Door opens
  await devCommand(page, 'tp 0 0 -8.2');
  await setYaw(page, Math.PI);
  await step(page, 0.3);
  s = await state(page);
  expect(s.focused === 'gym.door', 'door gets focus');
  await press(page, 'Key:KeyE');
  await step(page, 3);
  expect((await devCommand(page, 'flag gym.door_open')).includes('true'), 'door opens');
  await hold(page, 'Key:KeyW', 1.5);
  s = await state(page);
  expect(s.pos[2] < -10.5, 'can walk through the open door');
  await shot(page, 'gym-08-door');

  log(`console errors: ${errors.length}`);
  for (const e of errors) log('  ERR', e);
} catch (err) {
  log('SCENARIO FAILED', err.stack ?? String(err));
  await shot(page, 'gym-failure').catch(() => {});
  for (const l of logs.slice(-40)) log(l);
  failures.push('exception');
} finally {
  await browser.close();
}
log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join('; ')}` : '\nALL CHECKS PASSED');
if (failures.length || errors.length) process.exitCode = 1;
