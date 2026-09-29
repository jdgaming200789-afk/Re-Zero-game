import { Object3D, Vector3 } from 'three';
import { Component } from '../core/ecs/Component';
import type { GameContext } from '../game/GameContext';

/**
 * What kind of thing this is. Drives the prompt icon, the default verb and
 * which contextual animation the player performs.
 */
export type InteractionKind =
  | 'door'
  | 'read'
  | 'inspect'
  | 'pickup'
  | 'talk'
  | 'mechanism'
  | 'lore'
  | 'clue'
  | 'treasure'
  | 'use'
  | 'rest';

/** Contextual animation the interactor plays. */
export type InteractionAnim =
  | 'none'
  | 'reachLow'
  | 'reachMid'
  | 'reachHigh'
  | 'pickupGround'
  | 'pushDoor'
  | 'pullLever'
  | 'readBook'
  | 'kneelInspect'
  | 'touch'
  | 'talk';

export interface InteractionContext {
  game: GameContext;
  interactable: Interactable;
  /** Resolves when the contextual animation reaches its contact frame. */
  contact: Promise<void>;
}

export interface InteractableOptions {
  id: string;
  kind: InteractionKind;
  verb?: string;
  label?: string;
  range?: number;
  /** Max angle (degrees) between the player's view/facing and the object. */
  angle?: number;
  anchor?: Object3D | Vector3;
  /** Where the player stands to interact, in the anchor's local space. */
  approach?: { offset: Vector3; face?: boolean } | null;
  animation?: InteractionAnim;
  /** Seconds the button must be held (heavy mechanisms). */
  hold?: number;
  once?: boolean;
  requiresLineOfSight?: boolean;
  condition?: (game: GameContext) => boolean;
  /** Shown when the condition fails but the object is still focusable (locked doors). */
  lockedText?: (game: GameContext) => string | null;
  handler: (ctx: InteractionContext) => Promise<void> | void;
  priority?: number;
}

const DEFAULT_VERBS: Record<InteractionKind, string> = {
  door: 'Open',
  read: 'Read',
  inspect: 'Examine',
  pickup: 'Take',
  talk: 'Talk',
  mechanism: 'Use',
  lore: 'Read',
  clue: 'Investigate',
  treasure: 'Open',
  use: 'Use',
  rest: 'Rest',
};

const DEFAULT_ANIMS: Record<InteractionKind, InteractionAnim> = {
  door: 'pushDoor',
  read: 'readBook',
  inspect: 'reachMid',
  pickup: 'pickupGround',
  talk: 'talk',
  mechanism: 'pullLever',
  lore: 'readBook',
  clue: 'kneelInspect',
  treasure: 'kneelInspect',
  use: 'reachMid',
  rest: 'none',
};

export class Interactable extends Component {
  readonly id: string;
  kind: InteractionKind;
  verb: string;
  label: string;
  range: number;
  angle: number;
  approach: InteractableOptions['approach'];
  animation: InteractionAnim;
  hold: number;
  once: boolean;
  requiresLineOfSight: boolean;
  priority: number;
  used = false;
  busy = false;
  private readonly anchorObj: Object3D | null;
  private readonly anchorPoint: Vector3 | null;
  private readonly opts: InteractableOptions;

  constructor(opts: InteractableOptions) {
    super();
    this.opts = opts;
    this.id = opts.id;
    this.kind = opts.kind;
    this.verb = opts.verb ?? DEFAULT_VERBS[opts.kind];
    this.label = opts.label ?? '';
    this.range = opts.range ?? 2.2;
    this.angle = opts.angle ?? 75;
    this.approach = opts.approach ?? null;
    this.animation = opts.animation ?? DEFAULT_ANIMS[opts.kind];
    this.hold = opts.hold ?? 0;
    this.once = opts.once ?? false;
    this.requiresLineOfSight = opts.requiresLineOfSight ?? true;
    this.priority = opts.priority ?? 0;
    this.anchorObj = opts.anchor instanceof Object3D ? opts.anchor : null;
    this.anchorPoint = opts.anchor instanceof Vector3 ? opts.anchor.clone() : null;
  }

  /** World-space point the prompt attaches to and range is measured from. */
  worldAnchor(out: Vector3): Vector3 {
    if (this.anchorPoint) return out.copy(this.anchorPoint);
    const o = this.anchorObj ?? this.entity.object3D;
    return o.getWorldPosition(out);
  }

  anchorObject(): Object3D {
    return this.anchorObj ?? this.entity.object3D;
  }

  isAvailable(game: GameContext): boolean {
    if (this.busy || (this.once && this.used)) return false;
    return this.opts.condition ? this.opts.condition(game) : true;
  }

  /** Focusable but refuses with a message (e.g. locked). */
  lockedMessage(game: GameContext): string | null {
    if (this.busy || (this.once && this.used)) return null;
    if (this.opts.condition && !this.opts.condition(game)) return this.opts.lockedText?.(game) ?? null;
    return null;
  }

  run(ctx: InteractionContext): Promise<void> | void {
    return this.opts.handler(ctx);
  }

  override onAttach(): void {
    Interactable.registry.add(this);
  }
  override onDetach(): void {
    Interactable.registry.delete(this);
  }

  static readonly registry = new Set<Interactable>();
}
