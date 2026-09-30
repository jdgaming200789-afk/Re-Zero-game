import type { GameContext, GameSystem } from '../../game/GameContext';
import { el } from '../dom';

/** The region line above each area's name. */
const REGIONS: Record<string, string> = {
  tower_foot: 'Augria Sand Dunes',
  celaeno: 'The Pleiades Watchtower',
  alcyone: 'The Pleiades Watchtower',
  taygeta: 'The Pleiades Watchtower',
  electra: 'The Pleiades Watchtower',
};

/**
 * The place's name, drifting in at the top of the screen a moment after
 * arriving — unless a scene starts instead (the scene introduces the place
 * better than a caption can). Development areas stay unannounced.
 */
export class LocationBanner implements GameSystem {
  readonly name = 'locationBanner';
  private readonly root: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private pending: { areaId: string; t: number; waited?: number } | null = null;
  private showing = 0;
  /** Last area announced (tests). */
  lastShown: string | null = null;

  constructor(private readonly game: GameContext) {
    this.kicker = el('div', { class: 'kicker' });
    this.title = el('div', { class: 'title' });
    this.sub = el('div', { class: 'sub' });
    this.root = game.ui.layers.hud.appendChild(el('div', { class: 'rz-location' }, [this.kicker, this.title, el('div', { class: 'rz-rule' }), this.sub]));
    game.events.on('area:entered', ({ areaId }) => {
      this.pending = REGIONS[areaId] ? { areaId, t: 1.1 } : null;
    });
    game.events.on('cinematic:started', () => this.hide());
    game.events.on('dialogue:started', () => this.hide());
    game.events.on('rbd:deathBegan', () => this.hide());
  }

  update(dt: number): void {
    const g = this.game;
    // Quest banners share the top of the screen, and they matter more.
    const questUp = (this.pending || this.showing > 0) && !!g.ui.layers.hud.querySelector('.rz-quest-banner.visible');
    if (questUp && this.showing > 0) this.hide();
    if (this.pending) {
      this.pending.t -= dt;
      if (questUp) {
        // Wait for it to clear — but not forever.
        this.pending.waited = (this.pending.waited ?? 0) + dt;
        this.pending.t = Math.max(this.pending.t, 0.4);
        if (this.pending.waited > 8) this.pending = null;
      } else if (this.pending.t <= 0) {
        const { areaId } = this.pending;
        this.pending = null;
        const area = g.scenes.current;
        const quiet = g.mode === 'exploration' && !g.cinematics.playing && !g.dialogue.state;
        if (area && area.id === areaId && quiet) this.show(REGIONS[areaId]!, area.displayName, area.subtitle);
      }
    }
    if (this.showing > 0) {
      this.showing -= dt;
      if (this.showing <= 0) this.hide();
    }
  }

  private show(kicker: string, title: string, sub: string): void {
    this.kicker.textContent = kicker;
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.root.classList.add('visible');
    this.showing = 4.2;
    this.lastShown = title;
  }

  hide(): void {
    this.pending = null;
    this.showing = 0;
    this.root.classList.remove('visible');
  }
}
