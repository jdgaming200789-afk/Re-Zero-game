import { CHECKPOINTS } from '../data/deaths';
import { KNOWLEDGE } from '../data/knowledge';
import { SAVE_SLOTS, type SaveSlot } from '../save/SaveSystem';
import type { Game } from '../game/Game';
import { learn } from '../story/Effects';
import { startNewGame } from '../story/NewGame';
import type { DevConsole } from './DevConsole';

/** Story tooling: start the story, play any scene, poke quests and knowledge. */
export function registerStoryDevCommands(dev: DevConsole, game: Game): void {
  dev.register({
    name: 'newgame',
    usage: 'newgame [skip]',
    help: 'Start the story at the tower camp (skip: without the opening scene)',
    run: (args) => {
      dev.toggle(false);
      void startNewGame(game, { skipOpening: args[0] === 'skip' });
      return 'Starting a new game';
    },
  });
  dev.register({
    name: 'dialogue',
    usage: 'dialogue [id]',
    help: 'List conversations or play one',
    run: (args) => {
      if (!args[0]) return game.dialogue.all().map((d) => d.id).join(', ');
      if (!game.dialogue.has(args[0])) return `Unknown dialogue "${args[0]}"`;
      dev.toggle(false);
      void game.dialogue.play(args[0]);
      return `Playing ${args[0]}`;
    },
  });
  dev.register({
    name: 'cine',
    usage: 'cine [id]',
    help: 'List cinematics or play one',
    run: (args) => {
      if (!args[0]) return game.cinematics.all().map((c) => c.id).join(', ');
      if (!game.cinematics.has(args[0])) return `Unknown cinematic "${args[0]}"`;
      dev.toggle(false);
      void game.cinematics.play(args[0]);
      return `Playing ${args[0]}`;
    },
  });
  dev.register({
    name: 'quest',
    usage: 'quest [id] [start|complete|fail|track]',
    help: 'List quests or change one',
    run: (args) => {
      const q = game.quests;
      if (!args[0]) return q.all().map((d) => `${d.id} (${q.status(d.id)})${q.tracked === d.id ? ' *' : ''}`).join('\n');
      if (!q.get(args[0])) return `Unknown quest "${args[0]}"`;
      const verb = args[1] ?? 'start';
      if (verb === 'complete') q.complete(args[0]);
      else if (verb === 'fail') q.fail(args[0]);
      else if (verb === 'track') q.track(args[0]);
      else q.start(args[0]);
      return `${args[0]}: ${q.status(args[0])}`;
    },
  });
  dev.register({
    name: 'die',
    usage: 'die [cause]',
    help: 'Return by Death (cause: heliosphere, combat.dune_jackal, fall...)',
    run: (args) => {
      dev.toggle(false);
      game.rbd.die(args[0] ?? 'combat');
      return `Died (${args[0] ?? 'combat'})`;
    },
  });
  dev.register({
    name: 'punish',
    usage: 'punish',
    help: 'Subaru tries to tell someone about Return by Death',
    run: () => {
      dev.toggle(false);
      void game.rbd.punish();
      return 'The Witch is listening';
    },
  });
  dev.register({
    name: 'returnpoint',
    usage: 'returnpoint [id]',
    help: 'Show or set the return point',
    run: (args) => {
      if (!args[0]) return `current: ${game.checkpoints.current?.id ?? '-'}; known: ${Object.keys(CHECKPOINTS).join(', ')}`;
      if (!CHECKPOINTS[args[0]]) return `Unknown return point "${args[0]}"`;
      game.checkpoints.reach(args[0]);
      return `Return point set: ${args[0]}`;
    },
  });
  dev.register({
    name: 'save',
    usage: 'save [slot]',
    help: `Save to a slot (${SAVE_SLOTS.join(', ')})`,
    run: (args) => {
      const slot = (args[0] ?? 'slot1') as SaveSlot;
      if (!SAVE_SLOTS.includes(slot)) return `Unknown slot "${slot}"`;
      const r = game.saves.save(slot);
      return r.ok ? `Saved ${slot}${r.reason ? ` — ${r.reason}` : ''}` : `Not saved: ${r.reason}`;
    },
  });
  dev.register({
    name: 'load',
    usage: 'load [slot]',
    help: 'Load a save slot',
    run: async (args) => {
      const slot = (args[0] ?? 'slot1') as SaveSlot;
      dev.toggle(false);
      return (await game.saves.load(slot)) ? `Loaded ${slot}` : `No valid save in ${slot}`;
    },
  });
  dev.register({
    name: 'saves',
    usage: 'saves',
    help: 'List save slots',
    run: () =>
      game.saves
        .list()
        .map(({ slot, data }) => (data ? `${slot}: ${data.summary.area}, loop ${data.summary.loop}, ${Math.round(data.playtime / 60)} min — ${new Date(data.savedAt).toLocaleString()}` : `${slot}: empty`))
        .join('\n'),
  });
  dev.register({
    name: 'learn',
    usage: 'learn [id|all]',
    help: 'List knowledge or teach Subaru something (survives Return by Death)',
    run: (args) => {
      if (!args[0]) return Object.keys(KNOWLEDGE).map((k) => `${k}${game.state.bool(`know.${k}`) ? ' ✓' : ''}`).join('\n');
      const ids = args[0] === 'all' ? Object.keys(KNOWLEDGE) : [args[0]];
      for (const id of ids) {
        if (!KNOWLEDGE[id]) return `Unknown knowledge "${id}"`;
        learn(game, id);
      }
      return `Learned ${ids.join(', ')}`;
    },
  });
}
