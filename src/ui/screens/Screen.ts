import type { ButtonAction } from '../../input/Actions';
import type { GameContext, GameSystem } from '../../game/GameContext';
import { el } from '../dom';

/**
 * A full-screen menu (pause, journal, inventory, map, settings, saves).
 * Screens pause the game while open and read navigation actions; the
 * manager makes sure only one is open at a time and that "back" returns to
 * the screen that opened it.
 */
export abstract class Screen {
  abstract readonly id: string;
  /** Action that toggles this screen from gameplay (if any). */
  readonly hotkey: ButtonAction | null = null;
  /** Can the hotkey open it during combat too? */
  readonly inCombat: boolean = false;
  readonly root: HTMLElement;

  constructor(protected readonly game: GameContext) {
    this.root = game.ui.layers.screens.appendChild(el('div', { class: 'rz-screen interactive' }));
  }

  get isOpen(): boolean {
    return this.root.classList.contains('visible');
  }

  open(arg?: string): void {
    this.onOpen(arg);
    this.root.classList.add('visible');
  }

  close(): void {
    this.root.classList.remove('visible');
    this.onClose?.();
  }

  protected abstract onOpen(arg?: string): void;
  protected onClose?(): void;
  /** Per-frame input while open (unscaled time). Return true to go back. */
  abstract handleInput(dt: number): boolean;
}

export class ScreenManager implements GameSystem {
  readonly name = 'screens';
  private readonly screens = new Map<string, Screen>();
  private current: Screen | null = null;
  private readonly stack: Array<{ id: string; arg?: string }> = [];
  private currentArg: string | undefined;
  /** Frames to ignore input after a screen change (one key press, one action). */
  private settle = 0;

  constructor(private readonly game: GameContext & { setPaused(p: boolean, reason?: string): void }) {}

  register(s: Screen): void {
    this.screens.set(s.id, s);
  }

  get open(): string | null {
    return this.current?.id ?? null;
  }

  /** Open a screen; from another screen, "back" returns there. */
  show(id: string, arg?: string): void {
    const s = this.screens.get(id);
    if (!s) return;
    if (this.current === s && this.currentArg === arg) return;
    if (this.current) {
      this.stack.push({ id: this.current.id, arg: this.currentArg });
      this.current.close();
    } else this.game.setPaused(true, id);
    this.current = s;
    this.currentArg = arg;
    s.open(arg);
    this.settle = 2;
    this.game.events.emit('ui:screenOpened', { screen: id });
  }

  /** Go back one screen, or close the menus entirely. */
  back(): void {
    const s = this.current;
    if (!s) return;
    const prev = this.stack.pop();
    s.close();
    this.game.events.emit('ui:screenClosed', { screen: s.id });
    if (prev) {
      const p = this.screens.get(prev.id)!;
      this.current = p;
      this.currentArg = prev.arg;
      p.open(prev.arg);
      this.settle = 2;
      return;
    }
    this.current = null;
    this.game.setPaused(false);
  }

  /** Close every screen and resume. */
  hide(): void {
    this.stack.length = 0;
    while (this.current) this.back();
  }

  update(): void {
    const g = this.game;
    const input = g.input;
    if (this.settle > 0) {
      this.settle--;
      for (const a of ['confirm', 'cancel', 'pause', 'navUp', 'navDown', 'navLeft', 'navRight'] as const) input.consume(a);
      return;
    }
    if (this.current) {
      const s = this.current;
      if (s.hotkey && s.hotkey !== 'pause' && input.pressed(s.hotkey)) {
        input.consume(s.hotkey);
        this.hide();
        return;
      }
      if (input.pressed('pause') && this.stack.length === 0 && s.hotkey === 'pause') {
        input.consume('pause');
        this.hide();
        return;
      }
      if (input.pressed('cancel')) {
        input.consume('cancel');
        input.consume('pause');
        this.back();
        return;
      }
      if (s.handleInput(g.time.unscaledDt)) this.back();
      return;
    }
    const combat = g.mode === 'combat';
    if (g.mode !== 'exploration' && !combat) return;
    for (const s of this.screens.values()) {
      if (s.hotkey && input.pressed(s.hotkey) && (!combat || s.inCombat)) {
        input.consume(s.hotkey);
        this.show(s.id);
        return;
      }
    }
  }
}
