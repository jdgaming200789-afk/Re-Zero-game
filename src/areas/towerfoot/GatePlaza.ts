import { Vector3 } from 'three';
import { createLogger } from '../../core/Log';
import type { GameContext } from '../../game/GameContext';

const log = createLogger('GatePlaza');

/** Where the pack waits: a loose knot on the plaza in front of the gate stairs. */
const PACK: Array<[number, number]> = [
  [-5, -106],
  [-1, -109],
  [3, -105],
  [7, -108],
  [1, -112],
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
 * State lives in flags so Return by Death rewinds it:
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
      ev.on('character:died', ({ characterId }) => {
        if (characterId === 'sand_earthworm') this.wormDied('the party');
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
    if (!this.inStory || g.state.bool('tf.worm_dead')) return;
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
