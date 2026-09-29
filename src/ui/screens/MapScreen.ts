import { CHARACTERS } from '../../data/characters';
import type { GameContext } from '../../game/GameContext';
import type { AreaMap } from '../../scene/Area';
import { el } from '../dom';
import { Screen } from './Screen';

/**
 * The map of the current area: its ground, landmarks, Subaru and the
 * party, and diamonds for the tracked quest's open objectives.
 */
export class MapScreen extends Screen {
  readonly id = 'map';
  override readonly hotkey = 'map' as const;
  private readonly canvas: HTMLCanvasElement;
  private readonly title: HTMLElement;
  private readonly empty: HTMLElement;
  private map: AreaMap | null = null;
  private t = 0;

  constructor(game: GameContext) {
    super(game);
    this.root.classList.add('rz-map');
    this.canvas = el('canvas');
    this.title = el('h2', { class: 'rz-heading' });
    this.empty = el('div', { class: 'empty', text: 'Subaru never thought to draw a map of this place.' });
    const legend = el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { style: { background: '#f3e2b0', transform: 'rotate(45deg)' } }), 'Subaru']),
      el('span', {}, [el('i', { style: { background: '#8cc2ff', transform: 'rotate(45deg)' } }), 'Objective']),
      el('span', {}, [el('i', { style: { background: '#223050' } }), 'Glass']),
      el('span', {}, [el('i', { style: { background: 'rgba(120,190,150,0.5)', borderRadius: '50%' } }), 'Cover from the light']),
    ]);
    this.root.append(
      el('div', { class: 'rz-panel rz-sframe frame' }, [
        this.title,
        el('div', { class: 'rz-rule' }),
        this.canvas,
        this.empty,
        legend,
        el('div', { class: 'foot' }, [game.ui.key('cancel'), 'Back']),
      ]),
    );
  }

  protected onOpen(): void {
    const area = this.game.scenes.current;
    this.title.textContent = area?.displayName ?? 'Map';
    this.map = area?.map?.() ?? null;
    this.canvas.style.display = this.map ? '' : 'none';
    this.empty.style.display = this.map ? 'none' : '';
    this.t = 0;
    // Wait a frame for layout, then draw at the real size.
    requestAnimationFrame(() => this.draw());
  }

  handleInput(dt: number): boolean {
    this.t += dt;
    if (this.map && Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) this.draw();
    return false;
  }

  private draw(): void {
    const m = this.map;
    if (!m) return;
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = c.getContext('2d')!;
    const b = m.bounds;
    const bw = b.maxX - b.minX;
    const bh = b.maxZ - b.minZ;
    const scale = Math.min(c.width / bw, c.height / bh) * 0.96;
    const ox = (c.width - bw * scale) / 2 - b.minX * scale;
    const oy = (c.height - bh * scale) / 2 - b.minZ * scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    m.paint(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const px = (x: number, z: number): [number, number] => [x * scale + ox, z * scale + oy];

    // Labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of m.labels ?? []) {
      const [x, y] = px(l.x, l.z);
      ctx.font = `600 ${Math.round(13 * dpr * (l.size ?? 1))}px 'Cormorant Garamond', Georgia, serif`;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(4,6,12,0.85)';
      ctx.strokeText(l.text, x, y);
      ctx.fillStyle = '#f3e2b0';
      ctx.fillText(l.text, x, y);
    }

    const g = this.game;
    const area = g.scenes.current?.id;
    // Objectives of the tracked quest in this area.
    const q = g.quests.tracked;
    if (q) {
      const pulse = 1 + Math.sin(this.t * 4) * 0.2;
      for (const o of g.quests.objectives(q)) {
        const mk = o.def.marker;
        if (!o.visible || o.done || !mk || mk.area !== area) continue;
        const [x, y] = px(mk.at[0], mk.at[2]);
        const r = 7 * dpr * pulse;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(140,194,255,0.25)';
        ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
        ctx.fillStyle = '#8cc2ff';
        ctx.fillRect(-r / 2, -r / 2, r, r);
        ctx.restore();
      }
    }
    // The party.
    for (const a of g.party.active) {
      const [x, y] = px(a.position.x, a.position.z);
      ctx.fillStyle = CHARACTERS[a.id]?.nameColor ?? '#9ab';
      ctx.beginPath();
      ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Subaru: an arrow in the direction he faces.
    const p = g.player;
    if (p) {
      const [x, y] = px(p.entity.object3D.position.x, p.entity.object3D.position.z);
      const yaw = p.yaw;
      // World forward (sin yaw, cos yaw) in x/z maps to canvas (dx, dy).
      const fx = Math.sin(yaw);
      const fy = Math.cos(yaw);
      const s = 9 * dpr;
      ctx.fillStyle = '#f3e2b0';
      ctx.strokeStyle = '#070a12';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + fx * s, y + fy * s);
      ctx.lineTo(x - fx * s * 0.6 + fy * s * 0.6, y - fy * s * 0.6 - fx * s * 0.6);
      ctx.lineTo(x - fx * s * 0.25, y - fy * s * 0.25);
      ctx.lineTo(x - fx * s * 0.6 - fy * s * 0.6, y - fy * s * 0.6 + fx * s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
