import { Physics } from './physics/Physics';
import { Game } from './game/Game';
import { registerAreas } from './areas';
import { spawnPlayer } from './player/spawnPlayer';
import { PlaceholderVisual } from './characters/PlaceholderVisual';
import { AnimeCharacter } from './characters/AnimeCharacter';
import { characterDef } from './data/characters';
import { createLogger } from './core/Log';
import { Masks } from './physics/Physics';
import { Vector3 } from 'three';
import type { CharacterVisual } from './characters/CharacterVisual';

const log = createLogger('Boot');

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Missing #game-canvas');

  await Physics.init();
  const game = new Game(canvas);
  registerAreas(game.scenes);
  let visual: CharacterVisual;
  try {
    const subaru = await AnimeCharacter.create(characterDef('subaru'), game.scheduler);
    const down = new Vector3(0, -1, 0);
    const from = new Vector3();
    subaru.groundQuery = (x, y, z) => {
      const hit = game.physics.raycast(from.set(x, y, z), down, 1.4, Masks.ground);
      return hit ? { y: hit.point.y, normal: hit.normal } : null;
    };
    visual = subaru;
  } catch (err) {
    log.error('Character model failed to load; using the placeholder body.', err);
    visual = new PlaceholderVisual(game.scheduler);
  }
  spawnPlayer(game, visual);
  game.ui.registerSpeakerName('subaru', 'Subaru');

  // Automation / debugging hook (tests drive the game through this).
  (window as unknown as { __game: Game }).__game = game;

  await game.ui.fade(1, 0);
  game.start();

  const params = new URLSearchParams(location.search);
  const area = params.get('area') ?? 'dev_gym';
  await game.scenes.goto(area, params.get('spawn') ?? 'default', { loadingScreen: true, fadeSeconds: 0.01 });
  game.events.emit('game:ready', { firstBoot: true });
  document.body.dataset.ready = '1';
  log.info('Ready');
}

boot().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;color:#f88;background:#100;z-index:1000;white-space:pre-wrap;font:13px monospace';
  pre.textContent = `Failed to start Re:Zero - Pleiades\n\n${(err as Error)?.stack ?? err}`;
  document.body.appendChild(pre);
});
