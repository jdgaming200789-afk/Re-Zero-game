import type { GameContext, GameSystem } from '../../game/GameContext';
import { startNewGame } from '../../story/NewGame';
import { el } from '../dom';
import { MenuList } from './MenuList';

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

/** The Pleiades as seen from the dunes (relative positions, brightest first). */
const PLEIADES: Array<[number, number, number]> = [
  [0, 0, 1.6], // Alcyone
  [-0.9, -0.25, 1.25], // Atlas
  [-0.75, 0.2, 1.0], // Pleione
  [0.55, -0.55, 1.2], // Electra
  [0.95, -0.2, 1.1], // Maia
  [0.7, 0.5, 1.0], // Merope
  [1.35, -0.75, 0.9], // Taygeta
];

/**
 * The title: a night sky over the dunes, the Pleiades overhead, and the
 * silhouette of the Watchtower with the star at its summit glinting now and
 * then. Continue / New Game / Load / Settings.
 */
export class TitleScreen implements GameSystem {
  readonly name = 'title';
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly list = new MenuList();
  private stars: Star[] = [];
  private t = 0;
  private raf = 0;
  private glint = 0;
  private shooting: { x: number; y: number; vx: number; vy: number; life: number } | null = null;

  constructor(private readonly game: GameContext) {
    this.canvas = el('canvas');
    this.root = el('div', { class: 'rz-title interactive' }, [
      this.canvas,
      el('div', { class: 'content' }, [
        el('div', { class: 'logo' }, [
          el('div', { class: 'kicker', text: 'Re:Zero − Starting Life in Another World' }),
          el('div', { class: 'name', text: 'Pleiades' }),
          el('div', { class: 'sub', text: 'The Watchtower in the Sand' }),
        ]),
        this.list.root,
      ]),
      el('div', { class: 'foot', text: 'A fan-made vertical slice of Arc 6. ↑ ↓ to choose · Enter to confirm' }),
    ]);
    game.ui.layers.screens.prepend(this.root);
    game.events.on('area:loadStarted', () => this.hide());
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  private latestSave() {
    return this.game.saves
      .list()
      .filter((s) => s.data)
      .sort((a, b) => b.data!.savedAt - a.data!.savedAt)[0];
  }

  show(): void {
    const g = this.game;
    g.setMode('title');
    // Nothing is loaded behind the title: hold the simulation still.
    g.time.setBaseScale(0);
    const latest = this.latestSave();
    this.list.setRows(
      [
        {
          id: 'continue',
          label: 'Continue',
          hint: latest ? `${latest.data!.summary.area} · Loop ${latest.data!.summary.loop}` : undefined,
          enabled: () => !!this.latestSave(),
          activate: () => {
            const s = this.latestSave();
            if (s) void g.saves.load(s.slot);
          },
        },
        { id: 'new', label: 'New Game', activate: () => this.newGame() },
        { id: 'load', label: 'Load Game', enabled: () => !!this.latestSave(), activate: () => g.screens.show('saves', 'load') },
        { id: 'settings', label: 'Settings', activate: () => g.screens.show('settings') },
      ],
      false,
    );
    this.resize();
    this.root.classList.add('visible');
    g.events.emit('audio:musicState', { state: 'mystery' });
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.draw(dt);
    };
    this.raf = requestAnimationFrame(loop);
    this.draw(0);
  }

  hide(): void {
    if (!this.visible) return;
    this.game.time.setBaseScale(1);
    this.root.classList.remove('visible');
    window.setTimeout(() => cancelAnimationFrame(this.raf), 1300);
  }

  private async newGame(): Promise<void> {
    this.hide();
    await startNewGame(this.game);
  }

  update(): void {
    if (!this.visible || this.game.mode !== 'title' || this.game.screens.open) return;
    this.list.handleInput(this.game.input);
  }

  // ------------------------------------------------------------------ sky
  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.stars = Array.from({ length: 420 }, () => ({
      x: Math.random() * w,
      y: Math.pow(Math.random(), 1.3) * h * 0.85,
      r: (Math.random() < 0.08 ? 1.4 : 0.6 + Math.random() * 0.7) * dpr,
      phase: Math.random() * 10,
      speed: 0.6 + Math.random() * 2,
    }));
  }

  private draw(dt: number): void {
    this.t += dt;
    const c = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#03050c');
    sky.addColorStop(0.6, '#0a1024');
    sky.addColorStop(1, '#1a1a2e');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // A faint band of the galaxy.
    const band = c.createLinearGradient(w * 0.2, 0, w * 0.9, h * 0.8);
    band.addColorStop(0, 'rgba(120,140,255,0)');
    band.addColorStop(0.5, 'rgba(140,150,230,0.07)');
    band.addColorStop(1, 'rgba(120,140,255,0)');
    c.fillStyle = band;
    c.fillRect(0, 0, w, h);
    // Stars
    for (const s of this.stars) {
      const a = 0.45 + 0.55 * Math.max(0, Math.sin(this.t * s.speed + s.phase));
      c.fillStyle = `rgba(230,236,255,${a})`;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.fill();
    }
    // The Pleiades, overhead.
    const px = w * 0.72;
    const py = h * 0.2;
    const sc = Math.min(w, h) * 0.055;
    for (const [x, y, m] of PLEIADES) {
      const sx = px + x * sc;
      const sy = py + y * sc;
      const r = m * 2.2 * (w / 1600);
      const g = c.createRadialGradient(sx, sy, 0, sx, sy, r * 6);
      g.addColorStop(0, 'rgba(210,225,255,0.95)');
      g.addColorStop(0.2, 'rgba(170,195,255,0.35)');
      g.addColorStop(1, 'rgba(150,180,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(sx, sy, r * 6, 0, Math.PI * 2);
      c.fill();
    }
    // A shooting star now and then.
    if (!this.shooting && Math.random() < dt * 0.12) this.shooting = { x: Math.random() * w * 0.6, y: Math.random() * h * 0.3, vx: w * 0.5, vy: h * 0.18, life: 0.9 };
    if (this.shooting) {
      const s = this.shooting;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const g = c.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      g.addColorStop(0, `rgba(255,255,255,${Math.max(0, s.life)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = g;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      c.stroke();
      if (s.life <= 0) this.shooting = null;
    }
    // The dunes and the tower's silhouette.
    const base = h * 0.86;
    c.fillStyle = '#05060b';
    const tx = w * 0.66;
    const unit = h * 0.0016;
    const tiers: Array<[number, number, number]> = [
      [42, 0, 72],
      [35, 76, 158],
      [29, 162, 246],
      [23, 250, 330],
    ];
    for (const [r, z0, z1] of tiers) c.fillRect(tx - r * unit, base - z1 * unit, r * 2 * unit, (z1 - z0 + 4) * unit);
    // Maia: the colonnade crown and its bronze dome.
    c.fillRect(tx - 19 * unit, base - 358 * unit, 38 * unit, 26 * unit);
    for (let i = -3; i <= 3; i++) c.fillRect(tx + i * 5.2 * unit - 0.8 * unit, base - 360 * unit, 1.6 * unit, 4 * unit);
    c.beginPath();
    c.ellipse(tx, base - 358 * unit, 18 * unit, 16 * unit, 0, Math.PI, 0);
    c.fill();
    c.beginPath();
    c.moveTo(tx - 2 * unit, base - 376 * unit);
    c.lineTo(tx, base - 412 * unit);
    c.lineTo(tx + 2 * unit, base - 376 * unit);
    c.fill();
    // The star at the summit, glinting.
    this.glint = Math.max(0, this.glint - dt * 0.6);
    if (Math.random() < dt * 0.15) this.glint = 1;
    const lx = tx;
    const ly = base - 380 * unit;
    const lr = (6 + this.glint * 26) * (w / 1600);
    const lg = c.createRadialGradient(lx, ly, 0, lx, ly, lr * 5);
    lg.addColorStop(0, 'rgba(255,250,235,1)');
    lg.addColorStop(0.25, `rgba(255,240,210,${0.35 + this.glint * 0.4})`);
    lg.addColorStop(1, 'rgba(255,230,200,0)');
    c.fillStyle = lg;
    c.beginPath();
    c.arc(lx, ly, lr * 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#05060b';
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 40) c.lineTo(x, base + Math.sin(x / w * 7 + 1.3) * h * 0.03 + Math.sin(x / w * 17) * h * 0.012);
    c.lineTo(w, h);
    c.fill();
  }
}
