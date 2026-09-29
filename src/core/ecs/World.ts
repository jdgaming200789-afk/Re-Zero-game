import type { Object3D, Scene } from 'three';
import type { Component } from './Component';
import { Entity } from './Entity';

/**
 * Owns all entities and schedules component lifecycle hooks.
 *
 * Update lists are built lazily from which hooks a component implements, so
 * adding a component with no `update` never costs a per-frame call.
 */
export class World {
  private readonly entities = new Map<number, Entity>();
  private readonly byTag = new Map<string, Set<Entity>>();
  private readonly fixedList: Component[] = [];
  private readonly updateList: Component[] = [];
  private readonly lateList: Component[] = [];
  private readonly startQueue: Component[] = [];
  private readonly destroyQueue: Entity[] = [];

  constructor(readonly scene: Scene) {}

  spawn(name: string, scope: string, opts: { object3D?: Object3D; parent?: Object3D | null; tags?: string[] } = {}): Entity {
    const entity = new Entity(this, name, scope, opts.object3D);
    this.entities.set(entity.id, entity);
    if (opts.parent !== null) (opts.parent ?? this.scene).add(entity.object3D);
    for (const t of opts.tags ?? []) this.tag(entity, t);
    return entity;
  }

  tag(entity: Entity, tag: string): void {
    entity.tags.add(tag);
    let set = this.byTag.get(tag);
    if (!set) this.byTag.set(tag, (set = new Set()));
    set.add(entity);
  }

  untag(entity: Entity, tag: string): void {
    entity.tags.delete(tag);
    this.byTag.get(tag)?.delete(entity);
  }

  findByTag(tag: string): Entity[] {
    return Array.from(this.byTag.get(tag) ?? []);
  }

  firstByTag(tag: string): Entity | undefined {
    const set = this.byTag.get(tag);
    if (!set) return undefined;
    for (const e of set) return e;
    return undefined;
  }

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  all(): IterableIterator<Entity> {
    return this.entities.values();
  }

  registerComponent(c: Component): void {
    this.startQueue.push(c);
    if (c.fixedUpdate) this.fixedList.push(c);
    if (c.update) this.updateList.push(c);
    if (c.lateUpdate) this.lateList.push(c);
  }

  unregisterComponent(c: Component): void {
    remove(this.fixedList, c);
    remove(this.updateList, c);
    remove(this.lateList, c);
    remove(this.startQueue, c);
  }

  destroy(entity: Entity): void {
    if (entity.destroyed) return;
    entity.destroyed = true;
    entity.active = false;
    this.destroyQueue.push(entity);
  }

  /** Destroys every entity spawned under a scope (e.g. an unloading area). */
  destroyScope(scope: string): void {
    for (const e of this.entities.values()) if (e.scope === scope) this.destroy(e);
    this.flushDestroyed();
  }

  private runStarts(): void {
    if (this.startQueue.length === 0) return;
    const queue = this.startQueue.splice(0);
    for (const c of queue) {
      if (c.entity.destroyed) continue;
      c.started = true;
      c.onStart?.();
    }
  }

  fixedUpdate(dt: number): void {
    this.runStarts();
    for (let i = 0; i < this.fixedList.length; i++) {
      const c = this.fixedList[i]!;
      if (c.enabled && c.started) c.fixedUpdate!(dt);
    }
  }

  update(dt: number): void {
    this.runStarts();
    for (let i = 0; i < this.updateList.length; i++) {
      const c = this.updateList[i]!;
      if (c.enabled && c.started) c.update!(dt);
    }
  }

  lateUpdate(dt: number): void {
    for (let i = 0; i < this.lateList.length; i++) {
      const c = this.lateList[i]!;
      if (c.enabled && c.started) c.lateUpdate!(dt);
    }
    this.flushDestroyed();
  }

  private flushDestroyed(): void {
    if (this.destroyQueue.length === 0) return;
    for (const e of this.destroyQueue.splice(0)) {
      for (const c of [...e.components]) e.remove(c);
      for (const t of e.tags) this.byTag.get(t)?.delete(e);
      e.object3D.removeFromParent();
      this.entities.delete(e.id);
    }
  }
}

function remove<T>(arr: T[], item: T): void {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
}
