import type RAPIER from '@dimforge/rapier3d-compat';
import { Group, Vector3, type Color, type Texture } from 'three';
import type { HeightFogParams } from '../render/effects/HeightFogEffect';
import type { GameContext } from '../game/GameContext';
import type { ColorGrade } from '../render/effects/ColorGradeEffect';
import { disposeObject } from '../assets/AssetManager';
import type { MusicState } from '../core/events/GameEvents';

export interface AreaSpawn {
  position: Vector3;
  yaw: number;
}

/** Look & sound of an area (or a zone within it). */
export interface AtmosphereProfile {
  background: Color | Texture | null;
  environment: Texture | null;
  environmentIntensity: number;
  /** Atmospheric height fog (density 0 disables). */
  fog: Partial<HeightFogParams>;
  grade: ColorGrade;
  exposure: number;
  music?: MusicState;
  /** Player posture tension 0..1 (fear makes Subaru hunch and move cautiously). */
  tension?: number;
}

/**
 * A loadable section of the world (the Unity-scene analogue).
 *
 * `build` creates geometry, lights, colliders and entities. Every entity is
 * spawned under the area's scope and every collider is tracked, so
 * `dispose` returns the world to exactly its prior state.
 */
export abstract class Area {
  abstract readonly id: string;
  abstract readonly displayName: string;
  /** Loading-screen line. */
  abstract readonly subtitle: string;
  readonly root = new Group();
  readonly spawns = new Map<string, AreaSpawn>();
  protected readonly colliders: RAPIER.Collider[] = [];
  protected readonly bodies: RAPIER.RigidBody[] = [];
  /** Shared assets (kit meshes, textures) that must not be disposed with this area. */
  protected readonly sharedObjects = new Set<object>();

  constructor(protected readonly game: GameContext) {}

  abstract build(onProgress: (p: number) => void): Promise<void>;
  abstract atmosphere(): AtmosphereProfile;

  onEnter?(spawnId: string): void;
  onExit?(): void;
  update?(dt: number): void;

  get scope(): string {
    return `area:${this.id}`;
  }

  protected trackCollider(c: RAPIER.Collider | null | RAPIER.Collider[]): void {
    if (!c) return;
    if (Array.isArray(c)) this.colliders.push(...c);
    else this.colliders.push(c);
  }

  protected addSpawn(id: string, x: number, y: number, z: number, yawDeg: number): void {
    this.spawns.set(id, { position: new Vector3(x, y, z), yaw: (yawDeg * Math.PI) / 180 });
  }

  dispose(): void {
    this.onExit?.();
    this.game.world.destroyScope(this.scope);
    this.game.vfx.clearScope(this.scope);
    for (const c of this.colliders) this.game.physics.removeCollider(c);
    for (const b of this.bodies) this.game.physics.removeBody(b);
    this.colliders.length = 0;
    this.bodies.length = 0;
    this.root.removeFromParent();
    disposeObject(this.root);
  }
}

export type AreaFactory = (game: GameContext) => Area;
