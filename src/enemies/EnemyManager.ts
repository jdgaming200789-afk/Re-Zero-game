import { Vector3 } from 'three';
import { ActorController, DEFAULT_ACTOR_MOVEMENT } from '../actors/ActorController';
import { CharacterMotor } from '../characters/CharacterMotor';
import { Health } from '../combat/Health';
import { createLogger } from '../core/Log';
import { actorDef } from '../data/actors';
import { EARTHWORM_MODEL, enemyDef } from '../data/enemies';
import { WormVisual } from '../creatures/WormVisual';
import { EarthwormController } from './EarthwormController';
import type { GameContext, GameSystem } from '../game/GameContext';
import { Layer } from '../physics/Physics';
import { EnemyController } from './EnemyController';
import { PackDirector } from './PackDirector';

const log = createLogger('Enemies');

export interface SpawnEnemyOptions {
  position: Vector3;
  yaw?: number;
  /** Enemies in a group alert together and fight as one encounter. */
  group?: string;
  scope?: string;
  /** Radius around the group's home that ends the encounter if left. */
  arena?: number;
}

/** A pack or squad: shared alert, one encounter, a pack director. */
export class EnemyGroup {
  readonly members: EnemyController[] = [];
  readonly director: PackDirector;
  alerted = false;

  constructor(
    private readonly game: GameContext,
    readonly id: string,
    readonly home: Vector3,
    readonly arena: number,
  ) {
    this.director = new PackDirector(this.members);
  }

  /** One member noticed something: the whole group joins (a howl). */
  alert(by: import('../combat/Health').Health | null, caller: EnemyController): void {
    for (const m of this.members) if (m !== caller && m.alive) m.alert(by);
    if (this.alerted) return;
    this.alerted = true;
    void caller.actor.visual.play('howl', { fadeIn: 0.08 });
    this.game.events.emit('audio:stinger', { id: 'witchbeast_howl' });
    this.game.combat.startEncounter(this.id, {
      enemies: this.members.filter((m) => m.alive).map((m) => m.health),
      arena: { center: this.home.clone(), radius: this.arena },
    });
  }
}

/**
 * Spawns enemies, owns their groups and turns the player's movement into
 * noise the witchbeasts can hear (sneaking works; sprinting doesn't).
 */
export class EnemyManager implements GameSystem {
  readonly name = 'enemies';
  private readonly enemies = new Set<EnemyController>();
  private readonly worms = new Set<EarthwormController>();
  private readonly groups = new Map<string, EnemyGroup>();
  private noiseTimer = 0;

  constructor(private readonly game: GameContext) {
    game.events.on('area:unloaded', () => this.prune());
    // Fighting is loud: the worm feels every blow through the sand.
    game.events.on('combat:hit', ({ position }) => this.noise(position, 9));
    game.events.on('combat:ended', ({ encounterId }) => {
      const g = this.groups.get(encounterId);
      if (g) g.alerted = g.members.some((m) => m.alive) ? false : g.alerted;
    });
  }

  async spawn(id: string, opts: SpawnEnemyOptions): Promise<EnemyController> {
    const def = enemyDef(id);
    const ad = actorDef(def.creature);
    const visual = await this.game.characters.create(def.creature);
    const scope = opts.scope ?? this.game.scenes.current?.scope ?? 'persistent';
    const entity = this.game.world.spawn(`enemy:${id}`, scope, { tags: ['enemy', ...def.tags] });
    entity.object3D.position.copy(opts.position);
    const motor = entity.add(
      new CharacterMotor(
        this.game.physics,
        {
          radius: ad.radius ?? 0.3,
          height: Math.max(ad.height * 0.8, (ad.radius ?? 0.3) * 2.2),
          stepHeight: 0.4,
          membership: Layer.Enemy,
          collidesWith: Layer.Environment | Layer.Prop | Layer.CharacterOnly,
        },
        { kind: 'character' },
      ),
    );
    const actor = entity.add(new ActorController(this.game, ad, visual, motor, { ...DEFAULT_ACTOR_MOVEMENT, ...ad.movement }));
    actor.placeAt(opts.position, opts.yaw ?? Math.random() * Math.PI * 2);
    const health = entity.add(
      new Health({ max: def.maxHp, faction: 'enemy', name: def.name, characterId: id, poise: def.poise, resist: def.resist, radius: ad.radius ?? 0.3, height: ad.height, elite: def.elite, tags: def.tags }),
    );
    this.game.combat.register(health);
    const ctrl = entity.add(new EnemyController(this.game, def, actor, health, opts.position.clone()));
    this.enemies.add(ctrl);
    if (opts.group) {
      let g = this.groups.get(opts.group);
      if (!g) {
        g = new EnemyGroup(this.game, opts.group, opts.position.clone(), opts.arena ?? 26);
        this.groups.set(opts.group, g);
      }
      g.members.push(ctrl);
      ctrl.group = g;
    }
    log.info(`Spawned ${id}${opts.group ? ` in ${opts.group}` : ''}`);
    return ctrl;
  }

  /** The Sand Earthworm: hunts by vibration, fights as a solitary elite. */
  async spawnWorm(position: Vector3, opts: { scope?: string; arena?: number } = {}): Promise<EarthwormController> {
    const def = enemyDef('sand_earthworm');
    const visual = await WormVisual.create(EARTHWORM_MODEL, '#2a1d14', 1.15);
    const scope = opts.scope ?? this.game.scenes.current?.scope ?? 'persistent';
    const entity = this.game.world.spawn('enemy:sand_earthworm', scope, { tags: ['enemy', 'elite', ...def.tags] });
    // Bones are laid out in world space along the trail; the mesh must not
    // ride on the moving entity (skinning would apply the motion twice).
    this.game.render.scene.add(visual.root);
    const health = entity.add(new Health({ max: def.maxHp, faction: 'enemy', name: def.name, characterId: def.id, poise: def.poise, resist: def.resist, radius: 1.2, height: 2.2, elite: true, tags: def.tags }));
    this.game.combat.register(health);
    const worm = entity.add(new EarthwormController(this.game, visual, health, position.clone()));
    this.worms.add(worm);
    const arena = opts.arena ?? 45;
    worm.onSurfaced = (at) => {
      if (!this.game.combat.inCombat || this.game.combat.encounterId !== 'earthworm') this.game.combat.startEncounter('earthworm', { enemies: [health], arena: { center: at, radius: arena } });
    };
    log.info('Spawned the Sand Earthworm');
    return worm;
  }

  worm(): EarthwormController | undefined {
    for (const w of this.worms) if (!w.entity.destroyed) return w;
    return undefined;
  }

  all(): EnemyController[] {
    this.prune();
    return Array.from(this.enemies);
  }

  group(id: string): EnemyGroup | undefined {
    return this.groups.get(id);
  }

  private prune(): void {
    for (const e of this.enemies) if (e.entity.destroyed) this.enemies.delete(e);
    for (const w of this.worms) if (w.entity.destroyed) this.worms.delete(w);
    for (const [id, g] of this.groups) {
      const alive = g.members.filter((m) => !m.entity.destroyed);
      if (!alive.length) this.groups.delete(id);
    }
  }

  /** A sound at `at` that carries `loudness` metres (bells, explosions). */
  noise(at: Vector3, loudness: number): void {
    for (const e of this.enemies) if (!e.entity.destroyed) e.hear(at, loudness);
    for (const w of this.worms) if (!w.entity.destroyed) w.hear(at, loudness);
  }

  update(dt: number): void {
    this.noiseTimer -= dt;
    if (this.noiseTimer > 0) return;
    this.noiseTimer = 0.25;
    this.prune();
    const p = this.game.player;
    if (!p || (!this.enemies.size && !this.worms.size)) return;
    // Movement noise: walking is quiet, running carries, sprinting is loud.
    const speed = p.followTarget.speed;
    const loud = speed < 0.3 ? 0 : speed < 2 ? 3 : p.loco.sprinting ? 13 : 7.5;
    if (loud > 0) this.noise(p.entity.object3D.position, loud);
  }
}
