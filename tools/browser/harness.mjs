// Browser test harness: launches Chromium (software WebGL), opens the game,
// collects console errors and exposes helpers for scripted scenarios.
//
// Rendering in this container is CPU-only (SwiftShader), so scenarios stop
// the real-time loop and step the simulation deterministically at 60 Hz via
// `game.advanceAsync`, rendering only when a screenshot is taken.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);

export const OUT_DIR = join(process.cwd(), 'test-results');

export async function launch({ url, width = 1280, height = 720 } = {}) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error('No Chromium found; set CHROMIUM_PATH');
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.stack ?? err.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { browser, page, errors, logs };
}

/** Wait for boot, then take manual control of time. */
export async function waitReady(page, timeout = 180000) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout });
  await page.evaluate(() => window.__game.stop());
}

export async function step(page, seconds, render = true) {
  await page.evaluate(([s, r]) => window.__game.advanceAsync(s, r), [seconds, render]);
}

export async function down(page, code) {
  await page.evaluate((c) => window.__game.input.simulate(c, true), code);
}
export async function up(page, code) {
  await page.evaluate((c) => window.__game.input.simulate(c, false), code);
}

/** Hold a raw input code (e.g. 'Key:KeyW') for `seconds` of game time. */
export async function hold(page, code, seconds) {
  await down(page, code);
  await step(page, seconds, false);
  await up(page, code);
  await step(page, 1 / 60, false);
}

export async function press(page, code) {
  await down(page, code);
  await step(page, 1 / 60, false);
  await up(page, code);
  await step(page, 1 / 60, false);
}

/** Inject mouse-look pixels spread over a few frames. */
export async function look(page, dx, dy, frames = 10) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(([x, y]) => window.__game.input.simulateLook(x, y), [dx / frames, dy / frames]);
    await step(page, 1 / 60, false);
  }
}

export async function shot(page, name) {
  await step(page, 1 / 60, true);
  // Give the compositor a moment to present the software-rendered frame.
  await page.waitForTimeout(150);
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path });
  return path;
}

export async function state(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    const pos = p?.entity.object3D.position;
    return {
      mode: g.mode,
      area: g.scenes.current?.id,
      pos: pos ? [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] : null,
      yaw: p ? +p.yaw.toFixed(2) : null,
      grounded: p?.motor.grounded,
      stamina: p ? +p.stamina.toFixed(1) : null,
      focused: g.interaction.focused?.id ?? null,
      calls: g.render.stats().drawCalls,
      tris: g.render.stats().triangles,
    };
  });
}

export async function devCommand(page, line) {
  return page.evaluate((l) => window.__game.dev?.exec(l), line);
}

export async function setYaw(page, yaw) {
  await page.evaluate((y) => {
    const g = window.__game;
    g.player.yaw = y;
    g.player.entity.object3D.rotation.set(0, y, 0);
    g.camera.follow.snapBehind(g.player.followTarget);
  }, yaw);
}
