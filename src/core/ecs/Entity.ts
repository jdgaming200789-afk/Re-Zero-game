import { Object3D } from 'three';
import type { Component, ComponentCtor } from './Component';
import type { World } from './World';

let nextEntityId = 1;

/**
 * A thing in the world: a transform (Three.js Object3D) plus components.
 * Entities belong to an owner scope (usually an area id) so unloading an area
 * destroys exactly the entities it spawned.
 */
export class Entity {
  readonly id = nextEntityId++;
  readonly object3D: Object3D;
  readonly tags = new Set<string>();
  readonly components: Component[] = [];
  active = true;
  destroyed = false;

  constructor(
    readonly world: World,
    public name: string,
    readonly scope: string,
    object3D?: Object3D,
  ) {
    this.object3D = object3D ?? new Object3D();
    this.object3D.name = name;
    this.object3D.userData.entityId = this.id;
  }

  get position() {
    return this.object3D.position;
  }
  get quaternion() {
    return this.object3D.quaternion;
  }

  add<T extends Component>(component: T): T {
    component.entity = this;
    this.components.push(component);
    component.onAttach?.();
    this.world.registerComponent(component);
    return component;
  }

  get<T extends Component>(ctor: ComponentCtor<T>): T | undefined {
    for (const c of this.components) if (c instanceof ctor) return c as T;
    return undefined;
  }

  require<T extends Component>(ctor: ComponentCtor<T>): T {
    const c = this.get(ctor);
    if (!c) throw new Error(`Entity "${this.name}" is missing required component ${ctor.name}`);
    return c;
  }

  getAll<T extends Component>(ctor: ComponentCtor<T>): T[] {
    return this.components.filter((c): c is T => c instanceof ctor);
  }

  remove(component: Component): void {
    const i = this.components.indexOf(component);
    if (i < 0) return;
    this.components.splice(i, 1);
    this.world.unregisterComponent(component);
    component.onDetach?.();
  }

  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  destroy(): void {
    this.world.destroy(this);
  }
}
