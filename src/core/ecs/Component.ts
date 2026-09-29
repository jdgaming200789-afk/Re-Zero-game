import type { Entity } from './Entity';

/**
 * Base class for behaviours attached to an Entity (the Unity MonoBehaviour
 * analogue). Lifecycle hooks are all optional; the World only schedules a
 * component into an update list if it actually implements that hook, so
 * components that are pure data or event-driven cost nothing per frame.
 */
export abstract class Component {
  entity!: Entity;
  private _enabled = true;
  /** Set by the World once onStart has run. */
  started = false;

  get enabled(): boolean {
    return this._enabled && this.entity?.active !== false;
  }
  set enabled(v: boolean) {
    if (v === this._enabled) return;
    this._enabled = v;
    if (v) this.onEnable?.();
    else this.onDisable?.();
  }

  /** Called immediately when added to an entity. */
  onAttach?(): void;
  /** Called before the first update the component receives. */
  onStart?(): void;
  /** Fixed-rate simulation step (physics rate). */
  fixedUpdate?(dt: number): void;
  /** Per-frame update. */
  update?(dt: number): void;
  /** Per-frame update after all `update`s (camera, IK, UI anchors). */
  lateUpdate?(dt: number): void;
  onEnable?(): void;
  onDisable?(): void;
  /** Called when removed or when the entity is destroyed. */
  onDetach?(): void;
}

export type ComponentCtor<T extends Component = Component> = abstract new (...args: never[]) => T;
