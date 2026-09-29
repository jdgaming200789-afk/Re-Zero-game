/**
 * Minimal hierarchical-friendly finite state machine. States are plain
 * objects so gameplay code can define them inline next to the owner.
 */
export interface State<TOwner, TId extends string = string> {
  readonly id: TId;
  enter?(owner: TOwner, from: TId | null): void;
  update?(owner: TOwner, dt: number): TId | void;
  exit?(owner: TOwner, to: TId): void;
}

export class StateMachine<TOwner, TId extends string = string> {
  private readonly states = new Map<TId, State<TOwner, TId>>();
  private _current: State<TOwner, TId> | null = null;
  private _timeInState = 0;
  private _previous: TId | null = null;
  onChange?: (from: TId | null, to: TId) => void;

  constructor(private readonly owner: TOwner) {}

  add(state: State<TOwner, TId>): this {
    this.states.set(state.id, state);
    return this;
  }

  get current(): TId | null {
    return this._current?.id ?? null;
  }
  get previous(): TId | null {
    return this._previous;
  }
  get timeInState(): number {
    return this._timeInState;
  }

  is(...ids: TId[]): boolean {
    return this._current !== null && ids.includes(this._current.id);
  }

  set(id: TId, force = false): void {
    if (!force && this._current?.id === id) return;
    const next = this.states.get(id);
    if (!next) throw new Error(`Unknown state "${id}"`);
    const from = this._current?.id ?? null;
    this._current?.exit?.(this.owner, id);
    this._previous = from;
    this._current = next;
    this._timeInState = 0;
    next.enter?.(this.owner, from);
    this.onChange?.(from, id);
  }

  update(dt: number): void {
    if (!this._current) return;
    this._timeInState += dt;
    const next = this._current.update?.(this.owner, dt);
    if (next && next !== this._current.id) this.set(next);
  }
}
