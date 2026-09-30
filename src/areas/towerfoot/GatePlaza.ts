import { Vector3 } from 'three';
import { createLogger } from '../../core/Log';
import type { GameContext } from '../../game/GameContext';
import { learn } from '../../story/Effects';

const log = createLogger('GatePlaza');

/** Where the pack waits: a loose knot on the plaza in front of the gate stairs. */
const PACK: Array<[number, number]> = [
  [-5, -106],
  [-1, -109],
  [3, -105],
  [7, -108],
  [1, -112],
];
/** The rest of the pack, coming in off the eastern dunes once the first ones start to fall. */
const SECOND_WAVE: Array<[number, number]> = [
  [25, -99],
  [28, -104],
  [26, -109],
  [30, -107],
];
export const JACKAL_GROUP = 'tf.jackals';
/** Where the Sand Earthworm lives: the dunes west of the plaza. */
export const WORM_HOME = new Vector3(-30, 0, -100);

/**
 * The last stretch before the gate. A pack of dune jackals lies on the
 * plaza; once they're beaten, the noise of the fight wakes the Sand
 * Earthworm, which then lurks between the party and the gate — too tough
 * to fight, deaf to nothing. The answer is out on the Glass Flats: make it
 * surface where the light can see it.
 *
 * The pack comes in two waves: when the first is down to its last two,
 * the rest arrive howling off the eastern dunes.
 *
 * State lives in flags so Return by Death rewinds it:
 *   tf.pack_wave2    — the second wave has come
 *   tf.plaza_cleared — the pack is dead (a return point is set just after)
 *   tf.worm_seen     — the worm has shown itself
 *   tf.worm_dead     — the light (or, improbably, the party) killed it
 */
export class GatePlaza {
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly game: GameContext,
    private readonly scope: string,
  ) {
    const ev = game.events;
    this.offs.push(
      ev.on('combat:ended', ({ encounterId, victory }) => {
        if (encounterId === JACKAL_GROUP && victory && !game.state.bool('tf.plaza_cleared')) {
          log.info('The pack is dead');
          game.state.set('tf.plaza_cleared', true);
        }
      }),
      ev.on('story:event', ({ id }) => {
        if (id === 'tf.worm_rise') void this.raiseWorm();
        if (id === 'heliosphere.worm') this.wormDied('the light');
      }),
      // Across the flats: dying to the pack shouldn't mean crossing the glass again.
      ev.on('flag:changed', ({ key, value }) => {
        if (key !== 'visited.tf.plaza' || !value || !this.inStory || game.state.bool('tf.plaza_cleared')) return;
        if (game.checkpoints.current?.id === 'camp_night') game.checkpoints.reach('plaza_edge');
      }),
      // Dying after the rest of the pack showed up: he remembers there were more.
      ev.on('rbd:deathBegan', () => {
        if (game.state.bool('tf.pack_wave2') && !game.state.bool('tf.plaza_cleared')) learn(game, 'plaza.pack_waves');
      }),
      ev.on('character:died', ({ characterId }) => {
        if (characterId === 'sand_earthworm') this.wormDied('the party');
        if (characterId === 'dune_jackal') this.maybeSecondWave();
      }),
    );
  }

  /** Only in the story (not in developer visits to the area). */
  private get inStory(): boolean {
    return this.game.state.bool('story.opening_done');
  }

  /** Put the plaza into the state the flags describe (area entry, Return by Death). */
  async populate(): Promise<void> {
    const g = this.game;
    if (!this.inStory) return;
    if (!g.state.bool('tf.plaza_cleared') && !g.enemies.group(JACKAL_GROUP)) {
      for (const [x, z] of PACK) {
        const y = g.physics.groundHeight(x, 20, z, 40) ?? 0;
        await g.enemies.spawn('dune_jackal', { position: new Vector3(x, y, z), yaw: Math.random() * Math.PI * 2, group: JACKAL_GROUP, scope: this.scope, arena: 32 });
      }
    }
    if (g.state.bool('tf.worm_seen') && !g.state.bool('tf.worm_dead') && !g.enemies.worm()) await this.spawnWorm();
  }

  private async spawnWorm(): Promise<void> {
    const g = this.game;
    const worm = await g.enemies.spawnWorm(this.home(), { scope: this.scope, arena: 60 });
    // Surfacing starts the elite fight — but not while a scene is showing it off.
    const start = worm.onSurfaced;
    worm.onSurfaced = (at) => {
      if (!g.cinematics.playing) start?.(at);
    };
  }

  private home(): Vector3 {
    const y = this.game.physics.groundHeight(WORM_HOME.x, 30, WORM_HOME.z, 60) ?? 0;
    return WORM_HOME.clone().setY(y);
  }

  private maybeSecondWave(): void {
    const g = this.game;
    if (!this.inStory || g.state.bool('tf.pack_wave2') || g.state.bool('tf.plaza_cleared')) return;
    if (g.combat.encounterId !== JACKAL_GROUP || g.combat.enemies.length > 2) return;
    g.state.set('tf.pack_wave2', true);
    void this.secondWave();
  }

  /** The rest of the pack: a howl from the east, and four more on the run. */
  private async secondWave(): Promise<void> {
    const g = this.game;
    const release = g.combat.holdOpen();
    try {
      g.events.emit('audio:stinger', { id: 'witchbeast_howl' });
      g.events.emit('bark:play', { speakerId: 'ram', text: 'More of them — off the dunes, from the east. Barusu, stay out of the way.', duration: 3.2 });
      const joined = [];
      for (const [x, z] of SECOND_WAVE) {
        const y = g.physics.groundHeight(x, 20, z, 40) ?? 0;
        joined.push(await g.enemies.spawn('dune_jackal', { position: new Vector3(x, y, z), yaw: -Math.PI / 2, group: JACKAL_GROUP, scope: this.scope, arena: 32 }));
      }
      // They join the fight already running (or, if he's slipped away, wait on the plaza).
      if (g.combat.encounterId === JACKAL_GROUP) {
        g.combat.startEncounter(JACKAL_GROUP, { enemies: joined.map((e) => e.health) });
        const subaru = g.combat.get(g.player?.entity.id) ?? null;
        for (const e of joined) e.alert(subaru);
      }
      log.info('The second wave arrives');
    } finally {
      release();
    }
  }

  /** The reveal: it comes up out of the dunes, drawn by the fight. */
  private async raiseWorm(): Promise<void> {
    const g = this.game;
    if (g.enemies.worm()) return;
    await this.spawnWorm();
    // Something loud right above it: it rises and breaches.
    g.enemies.noise(this.home(), 30);
    g.state.set('tf.worm_seen', true);
  }

  private wormDied(by: string): void {
    const g = this.game;
    // Only the worm the story raised (a stray one on the flats isn't the one at the gate).
    if (!this.inStory || !g.state.bool('tf.worm_seen') || g.state.bool('tf.worm_dead')) return;
    log.info(`The Sand Earthworm is dead (${by})`);
    g.state.set('tf.worm_dead', true);
  }

  /** Why the gate won't open yet, or null when it will. */
  gateBlocked(): string | null {
    const g = this.game;
    if (!this.inStory || g.state.bool('tf.worm_dead')) return null;
    if (!g.state.bool('tf.plaza_cleared')) return 'Not with witchbeasts at our backs.';
    return 'That gate won’t open quietly — and the worm would be on us before it moved an inch.';
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }
}
