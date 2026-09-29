import { Vector3 } from 'three';
import type { DevConsole } from './DevConsole';
import type { Game } from '../game/Game';
import type { QualityPreset } from '../settings/Settings';

/** Engine-level developer commands. Gameplay systems register their own. */
export function registerCoreDevCommands(dev: DevConsole, game: Game): void {
  dev.register({
    name: 'tp',
    usage: 'tp <x> <y> <z> | tp <spawnId>',
    help: 'Teleport the player',
    run: (args) => {
      const p = game.player;
      if (!p) return 'No player';
      if (args.length === 1) {
        const spawn = game.scenes.current?.spawns.get(args[0]!);
        if (!spawn) return `No spawn "${args[0]}". Spawns: ${Array.from(game.scenes.current?.spawns.keys() ?? []).join(', ')}`;
        p.placeAt(spawn.position, spawn.yaw);
        game.camera.follow.snapBehind(p.followTarget);
        return `Teleported to ${args[0]}`;
      }
      const [x, y, z] = args.map(Number);
      if ([x, y, z].some((n) => n === undefined || Number.isNaN(n))) return 'Usage: tp x y z';
      p.placeAt(new Vector3(x, y, z), p.yaw);
      return `Teleported to ${x} ${y} ${z}`;
    },
  });
  dev.register({
    name: 'area',
    usage: 'area [id] [spawn]',
    help: 'List areas or load one',
    run: async (args) => {
      if (!args[0]) return `Areas: ${game.scenes.knownAreas().join(', ')}  (current: ${game.scenes.current?.id ?? '-'})`;
      dev.toggle(false);
      await game.scenes.goto(args[0], args[1] ?? 'default', { loadingScreen: true });
      return `Loaded ${args[0]}`;
    },
  });
  dev.register({
    name: 'flag',
    usage: 'flag <key> [value]',
    help: 'Get or set a story flag (true/false/number/string)',
    run: (args) => {
      const [key, raw] = args;
      if (!key) return 'Usage: flag key [value]';
      if (raw === undefined) return `${key} = ${JSON.stringify(game.state.get(key))}`;
      const value = raw === 'true' ? true : raw === 'false' ? false : Number.isNaN(Number(raw)) ? raw : Number(raw);
      game.state.set(key, value);
      return `${key} = ${JSON.stringify(value)}`;
    },
  });
  dev.register({
    name: 'flags',
    usage: 'flags [prefix]',
    help: 'List story flags',
    run: (args) =>
      game.state
        .entries()
        .filter(([k]) => !args[0] || k.startsWith(args[0]))
        .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
        .join('\n') || '(none)',
  });
  dev.register({
    name: 'fps',
    usage: 'fps',
    help: 'Toggle the performance overlay',
    run: () => {
      game.settings.set('graphics', 'showFps', !game.settings.graphics.showFps);
      return `fps overlay ${game.settings.graphics.showFps ? 'on' : 'off'}`;
    },
  });
  let physicsDebug = false;
  dev.register({
    name: 'physics',
    usage: 'physics',
    help: 'Toggle collider debug rendering',
    run: () => {
      physicsDebug = !physicsDebug;
      game.physics.setDebugVisible(game.render.scene, physicsDebug);
      return `physics debug ${physicsDebug ? 'on' : 'off'}`;
    },
  });
  dev.register({
    name: 'timescale',
    usage: 'timescale <n>',
    help: 'Set game speed (1 = normal)',
    run: (args) => {
      const n = Number(args[0] ?? 1);
      game.time.setBaseScale(n);
      return `timescale ${n}`;
    },
  });
  dev.register({
    name: 'quality',
    usage: 'quality <low|medium|high|ultra>',
    help: 'Apply a graphics preset',
    run: (args) => {
      const q = args[0] as QualityPreset;
      if (!['low', 'medium', 'high', 'ultra'].includes(q)) return 'Usage: quality low|medium|high|ultra';
      game.settings.applyPreset(q);
      return `quality ${q}`;
    },
  });
  dev.register({
    name: 'pos',
    usage: 'pos',
    help: 'Print player position and facing',
    run: () => {
      const p = game.player;
      if (!p) return 'No player';
      const v = p.entity.object3D.position;
      return `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)} yaw ${((p.yaw * 180) / Math.PI).toFixed(0)}°`;
    },
  });
}
