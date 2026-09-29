import type { ButtonAction } from '../../input/Actions';
import type { GameContext, GameSystem } from '../../game/GameContext';
import { el } from '../dom';

/**
 * A full-screen menu (journal, inventory, map, settings, saves). Screens
 * pause the game while open and read navigation actions; the manager makes
 * sure only one is open at a time.
 */
export abstract class Screen {
  abstract readonly id: string;
  /** Action that toggles this screen from gameplay (if any). */
  readonly hotkey: ButtonAction | null = null;
  readonly root: HTMLElement;

  constructor(protected readonly game: GameContext) {
    this.root = game.ui.layers.screens.appendChild(el('div', { class: 'rz-screen interactive' }));
  }

  get isOpen(): boolean {
    return this.root.classList.contains('visible');
  }

  open(): void {
    this.onOpen();
    this.root.classList.add('visible');
  }

  close(): void {
    this.root.classList.remove('visible');
    this.onClose?.();
  }

  protected abstract onOpen(): void;
  protected onClose?(): void;
  /** Per-frame input while open (unscaled time). Return true to close. */
  abstract handleInput(dt: number): boolean;
}

export class ScreenManager implements GameSystem {
  readonly name = 'screens';
  private readonly screens = new Map<string, Screen>();
  private current: Screen | null = null;

  constructor(private readonly game: GameContext & { setPaused(p: boolean, reason?: string): void }) {}

  register(s: Screen): void {
    this.screens.set(s.id, s);
  }

  get open(): string | null {
    return this.current?.id ?? null;
  }

  show(id: string): void {
    const s = this.screens.get(id);
    if (!s || this.current === s) return;
    if (this.current) this.current.close();
    else this.game.setPaused(true, id);
    this.current = s;
    s.open();
    this.game.events.emit('ui:screenOpened', { screen: id });
  }

  hide(): void {
    const s = this.current;
    if (!s) return;
    this.current = null;
    s.close();
    this.game.setPaused(false);
    this.game.events.emit('ui:screenClosed', { screen: s.id });
  }

  update(): void {
    const g = this.game;
    const input = g.input;
    if (this.current) {
      const s = this.current;
      if (s.hotkey && input.pressed(s.hotkey)) {
        input.consume(s.hotkey);
        this.hide();
        return;
      }
      if (input.pressed('cancel') || input.pressed('pause')) {
        input.consume('cancel');
        input.consume('pause');
        this.hide();
        return;
      }
      if (s.handleInput(g.time.unscaledDt)) this.hide();
      return;
    }
    if (g.mode !== 'exploration') return;
    for (const s of this.screens.values()) {
      if (s.hotkey && input.pressed(s.hotkey)) {
        input.consume(s.hotkey);
        this.show(s.id);
        return;
      }
    }
  }
}
