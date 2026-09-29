import { Vector3 } from 'three';
import { CHARACTERS } from '../data/characters';
import { CREATURES } from '../data/creatures';
import { PARTY_ORDER } from '../data/party';
import type { Game } from '../game/Game';
import { shotLookingAt } from '../camera/CameraDirector';
import type { DevConsole } from './DevConsole';

/** Developer commands for inspecting the cast (lineups, expressions, clips). */
export function registerCastDevCommands(dev: DevConsole, game: Game): void {
  let lineup: string[] = [];

  dev.register({
    name: 'cast',
    usage: 'cast [all|id...] | cast clear',
    help: 'Spawn characters in a lineup facing the player',
    run: async (args) => {
      const player = game.player;
      if (!player) return 'No player';
      if (args[0] === 'clear') {
        for (const id of lineup) game.actors.despawn(id);
        lineup = [];
        game.camera.release(0.3);
        return 'Lineup cleared';
      }
      const ids = !args.length || args[0] === 'all' ? Object.keys(CHARACTERS).filter((id) => id !== player.characterId) : args;
      const unknown = ids.filter((id) => !CHARACTERS[id] && !CREATURES[id]);
      if (unknown.length) return `Unknown: ${unknown.join(', ')}`;
      const origin = player.entity.object3D.position.clone();
      const yaw = player.yaw;
      const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new Vector3(-fwd.z, 0, fwd.x);
      const spacing = 0.95;
      const center = origin.clone().addScaledVector(fwd, 3.4);
      await Promise.all(
        ids.map((id, i) => {
          const off = (i - (ids.length - 1) / 2) * spacing;
          const p = center.clone().addScaledVector(right, off);
          return game.actors.spawn(id, { position: p, yaw: yaw + Math.PI, physics: false }).then((a) => {
            a.faceTarget = null;
            a.lookAt(null);
          });
        }),
      );
      lineup = Array.from(new Set([...lineup, ...ids]));
      return `Spawned ${ids.join(', ')}`;
    },
  });

  dev.register({
    name: 'castshot',
    usage: 'castshot [id] [distance]',
    help: 'Frame the lineup (or one member\'s face) with a fixed camera',
    run: (args) => {
      const player = game.player;
      if (!player) return 'No player';
      const id = args[0];
      if (!id || id === 'all') {
        const actors = lineup.map((i) => game.actors.get(i)).filter((a) => !!a);
        if (!actors.length) return 'No lineup';
        const c = new Vector3();
        for (const a of actors) c.add(a.position);
        c.divideScalar(actors.length);
        const yaw = player.yaw;
        const dist = Number(args[1] ?? 5.2);
        const from = c.clone().add(new Vector3(-Math.sin(yaw) * dist, 1.05, -Math.cos(yaw) * dist));
        game.camera.cut(shotLookingAt(from, c.clone().setY(c.y + 0.82), 45));
        return 'Framed lineup';
      }
      const a = game.actors.get(id);
      if (!a) return `No actor ${id}`;
      const head = a.visual.socketPosition('head', new Vector3());
      const dist = Number(args[1] ?? 0.9);
      const fwd = new Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
      const from = head.clone().addScaledVector(fwd, dist).add(new Vector3(0, 0.02, 0));
      game.camera.cut(shotLookingAt(from, head.clone().add(new Vector3(0, -0.03 - dist * 0.08, 0)), 30));
      return `Framed ${id}`;
    },
  });

  dev.register({
    name: 'party',
    usage: 'party [join|leave] [all|id...]',
    help: 'Show or change the travelling party',
    run: async (args) => {
      const [verb, ...rest] = args;
      if (verb === 'join' || verb === 'leave') {
        const ids = !rest.length || rest[0] === 'all' ? PARTY_ORDER : rest;
        for (const id of ids) {
          if (verb === 'join') game.party.join(id);
          else game.party.leave(id);
        }
        await game.party.settled();
      }
      const active = game.party.active.map((a) => `${a.id}(${a.position.distanceTo(game.party.leaderPosition).toFixed(1)}m)`);
      return `members: ${game.party.members().join(', ') || '-'}\nactive: ${active.join(', ') || '-'}`;
    },
  });

  dev.register({
    name: 'aexpr',
    usage: 'aexpr <id> <expression> [intensity]',
    help: 'Set an actor\'s facial expression',
    run: (args) => {
      const a = args[0] ? game.actors.get(args[0]) : undefined;
      if (!a) return 'Usage: aexpr id expression';
      a.visual.setExpression(args[1] ?? 'neutral', Number(args[2] ?? 1));
      return `${args[0]}: ${args[1] ?? 'neutral'}`;
    },
  });

  dev.register({
    name: 'aanim',
    usage: 'aanim <id> <clip>',
    help: 'Play an action clip on an actor',
    run: (args) => {
      const a = args[0] ? game.actors.get(args[0]) : undefined;
      if (!a) return 'Usage: aanim id clip';
      void a.visual.play(args[1] ?? 'reachMid');
      return `${args[0]}: ${args[1] ?? 'reachMid'}`;
    },
  });
}
