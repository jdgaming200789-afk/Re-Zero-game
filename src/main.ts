import { Physics } from './physics/Physics';
import { Game } from './game/Game';
import { registerAreas } from './areas';
import { spawnPlayer } from './player/spawnPlayer';
import { createLogger } from './core/Log';
import { TitleScreen } from './ui/screens/TitleScreen';

const log = createLogger('Boot');

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Missing #game-canvas');

  await Physics.init();
  const game = new Game(canvas);
  registerAreas(game.scenes);
  const visual = await game.characters.create('subaru', game.settings.gameplay.subaruCostume);
  spawnPlayer(game, visual);
  game.ui.registerSpeakerName('subaru', 'Subaru', '#f0a060');

  // Automation / debugging hook (tests drive the game through this).
  (window as unknown as { __game: Game }).__game = game;

  await game.ui.fade(1, 0);
  game.start();

  const params = new URLSearchParams(location.search);
  const area = params.get('area');
  if (area) {
    // Developer / test entry: straight into an area.
    await game.scenes.goto(area, params.get('spawn') ?? 'default', { loadingScreen: true, fadeSeconds: 0.01 });
  } else {
    const title = new TitleScreen(game);
    game.addSystem(title);
    title.show();
    await game.ui.fade(0, 1.6);
  }
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
