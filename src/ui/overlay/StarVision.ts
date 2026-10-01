import { CONSTELLATIONS, type ConstellationDef, type StarDef } from '../../data/constellations';
import type { EventBus } from '../../core/events/EventBus';
import type { GameEvents } from '../../core/events/GameEvents';
import { el } from '../dom';

/**
 * Subaru's mind's eye: the night sky of his own world, drawn over the scene
 * while he thinks a riddle through. Constellations ink themselves in line
 * by line, stars he names are ringed and labelled, and the sky can turn —
 * the scorpion rising in the east as the hunter sinks in the west.
 *
 * Driven by story events (`vision.*`) so cinematics can pace it beat by
 * beat alongside his thoughts; it sits under the dialogue box.
 */

interface Figure {
  def: ConstellationDef;
  /** Centre on screen in units of the sky scale (sky degrees), relative to the canvas centre. */
  cx: number;
  cy: number;
  /** 0..1 lines drawn. */
  draw: number;
  drawTarget: number;
  alpha: number;
  alphaTarget: number;
  /** Vertical drift for the rising/setting beat (sky degrees). */
  lift: number;
  liftTarget: number;
  label: string | null;
}

interface Mark {
  figure: string;
  star: string;
  text: string;
  sub: string;
  color: string;
  t: number;
  /** Struck through (the wrong answer). */
  struck: boolean;
  strike: number;
}

const FIELD = 260;

export class StarVision {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private alpha = 0;
  private alphaTarget = 0;
  private time = 0;
  private readonly figures = new Map<string, Figure>();
  private readonly marks: Mark[] = [];
  private arc = 0;
  private arcTarget = 0;
  private horizon = 0;
  private horizonTarget = 0;
  private readonly field: Array<[number, number, number, number]> = [];

  constructor(layer: HTMLElement, events: EventBus<GameEvents>) {
    this.canvas = el('canvas', { class: 'rz-vision' });
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0' });
    layer.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    // A seeded field of faint background stars.
    let seed = 1234;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < FIELD; i++) this.field.push([rnd(), rnd(), 0.3 + rnd() * 1.2, rnd() * 6.28]);
    events.on('story:event', ({ id }) => {
      if (id.startsWith('vision.')) this.command(id.slice(7));
    });
  }

  get visible(): boolean {
    return this.alpha > 0.01;
  }

  /** One beat of the vision (see the switch for the vocabulary). */
  command(cmd: string): void {
    switch (cmd) {
      case 'open':
        this.figures.clear();
        this.marks.length = 0;
        this.arc = this.arcTarget = 0;
        this.horizon = this.horizonTarget = 0;
        this.alphaTarget = 1;
        break;
      case 'close':
        this.alphaTarget = 0;
        break;
      case 'scorpius':
        this.show('scorpius', -9, 4.5, 'Scorpius');
        this.mark('scorpius', 'antares', 'Antares', 'the scorpion’s heart', '#ff9a72');
        break;
      case 'shaula':
        this.mark('scorpius', 'shaula', 'Shaula', 'λ Scorpii · the stinger', '#bcd4ff');
        break;
      case 'orion':
        this.show('orion', 13, 1, 'Orion');
        break;
      case 'myth':
        // The scorpion chases the hunter round the sky: one rises as the other sets.
        this.arcTarget = 1;
        this.horizonTarget = 1;
        this.lift('scorpius', 2.5);
        this.lift('orion', -11);
        break;
      case 'myth_end':
        this.arcTarget = 0;
        this.horizonTarget = 0;
        this.lift('scorpius', 0);
        this.lift('orion', 0);
        break;
      case 'betelgeuse':
        this.mark('orion', 'betelgeuse', 'Betelgeuse', 'α Orionis · the red shoulder', '#ff8a6a');
        break;
      case 'not_betelgeuse': {
        const m = this.marks.find((x) => x.star === 'betelgeuse');
        if (m) m.struck = true;
        break;
      }
      case 'rigel':
        this.mark('orion', 'rigel', 'Rigel', 'β Orionis · his brightest', '#d8e6ff');
        break;
      case 'focus_orion':
        for (const f of this.figures.values()) f.alphaTarget = f.def.id === 'orion' ? 1 : 0.25;
        break;
      default:
        break;
    }
  }

  private show(id: string, cx: number, cy: number, label: string): void {
    const def = CONSTELLATIONS.find((c) => c.id === id);
    if (!def) return;
    const f: Figure = this.figures.get(id) ?? { def, cx, cy, draw: 0, drawTarget: 1, alpha: 0, alphaTarget: 1, lift: 0, liftTarget: 0, label };
    f.drawTarget = 1;
    f.alphaTarget = 1;
    this.figures.set(id, f);
  }

  private lift(id: string, to: number): void {
    const f = this.figures.get(id);
    if (f) f.liftTarget = to;
  }

  private mark(figure: string, star: string, text: string, sub: string, color: string): void {
    if (this.marks.some((m) => m.star === star)) return;
    this.marks.push({ figure, star, text, sub, color, t: 0, struck: false, strike: 0 });
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.1);
    this.time += step;
    const ease = (cur: number, tgt: number, rate: number) => cur + (tgt - cur) * (1 - Math.exp(-step * rate));
    this.alpha = ease(this.alpha, this.alphaTarget, this.alphaTarget > this.alpha ? 3 : 2.4);
    if (this.alpha < 0.005 && this.alphaTarget === 0) {
      if (this.canvas.style.opacity !== '0') this.canvas.style.opacity = '0';
      return;
    }
    this.arc = ease(this.arc, this.arcTarget, 1.2);
    this.horizon = ease(this.horizon, this.horizonTarget, 1.5);
    for (const f of this.figures.values()) {
      // Lines ink in at a steady pace, not an ease (it reads as drawing).
      f.draw = Math.min(f.drawTarget, f.draw + step / 2.2);
      f.alpha = ease(f.alpha, f.alphaTarget, 2.5);
      f.lift = ease(f.lift, f.liftTarget, 0.9);
    }
    for (const m of this.marks) {
      m.t += step;
      if (m.struck) m.strike = Math.min(1, m.strike + step / 0.5);
    }
    this.canvas.style.opacity = String(this.alpha);
    this.draw();
  }

  // ------------------------------------------------------------------ drawing
  private draw(): void {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = this.ctx;
    // Deep night, a little lighter towards the horizon.
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(3, 5, 16, 0.94)');
    bg.addColorStop(1, 'rgba(10, 16, 38, 0.94)');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    for (const [x, y, r, ph] of this.field) {
      const tw = 0.55 + 0.45 * Math.sin(this.time * 1.3 + ph * 3);
      g.fillStyle = `rgba(200, 215, 255, ${0.25 * tw})`;
      g.beginPath();
      g.arc(x * w, y * h, r * dpr * 0.7, 0, Math.PI * 2);
      g.fill();
    }
    const unit = Math.min(w, h) / 34; // px per sky degree
    const ox = w / 2;
    const oy = h * 0.46;
    const pos = (f: Figure, s: StarDef): [number, number] => [ox + (f.cx + s.x) * unit, oy - (f.cy + s.y + f.lift) * unit];

    // The horizon the hunter sinks below while the scorpion rises.
    if (this.horizon > 0.01) {
      const y = oy + 13 * unit;
      const grd = g.createLinearGradient(0, y - 2 * unit, 0, h);
      grd.addColorStop(0, 'rgba(10, 14, 30, 0)');
      grd.addColorStop(0.3, `rgba(6, 8, 18, ${0.9 * this.horizon})`);
      grd.addColorStop(1, `rgba(4, 5, 12, ${0.98 * this.horizon})`);
      g.fillStyle = grd;
      g.fillRect(0, y - 2 * unit, w, h - y + 2 * unit);
      g.strokeStyle = `rgba(150, 170, 230, ${0.35 * this.horizon})`;
      g.lineWidth = 1.2 * dpr;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      this.caption('east', ox - 15 * unit, y + 1.6 * unit, 0.6 * this.horizon, unit, dpr);
      this.caption('west', ox + 15 * unit, y + 1.6 * unit, 0.6 * this.horizon, unit, dpr);
    }

    // The chase: an arc from the scorpion's tail over to the hunter.
    if (this.arc > 0.01) {
      const sc = this.figures.get('scorpius');
      const or = this.figures.get('orion');
      if (sc && or) {
        const a = pos(sc, sc.def.stars.find((s) => s.id === 'shaula')!);
        const b = pos(or, or.def.stars.find((s) => s.id === 'alnilam')!);
        const mx = (a[0] + b[0]) / 2;
        const my = Math.min(a[1], b[1]) - 9 * unit;
        g.strokeStyle = `rgba(255, 200, 150, ${0.55 * this.arc})`;
        g.lineWidth = 1.6 * dpr;
        g.setLineDash([6 * dpr, 7 * dpr]);
        g.beginPath();
        const steps = 40;
        const upto = Math.floor(steps * this.arc);
        for (let i = 0; i <= upto; i++) {
          const t = i / steps;
          const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * mx + t * t * b[0];
          const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * my + t * t * b[1];
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.setLineDash([]);
      }
    }

    for (const f of this.figures.values()) {
      if (f.alpha < 0.01) continue;
      const byId = new Map(f.def.stars.map((s) => [s.id, s]));
      // Lines, inked in order.
      const total = f.def.lines.length;
      const drawn = f.draw * total;
      g.lineWidth = 1.4 * dpr;
      g.strokeStyle = `rgba(150, 180, 255, ${0.55 * f.alpha})`;
      for (let i = 0; i < total; i++) {
        const part = Math.min(1, drawn - i);
        if (part <= 0) break;
        const [p, q] = f.def.lines[i]!;
        const A = pos(f, byId.get(p)!);
        const B = pos(f, byId.get(q)!);
        g.beginPath();
        g.moveTo(A[0], A[1]);
        g.lineTo(A[0] + (B[0] - A[0]) * part, A[1] + (B[1] - A[1]) * part);
        g.stroke();
      }
      // Stars (brighter = bigger, coloured by spectral type).
      for (const s of f.def.stars) {
        const [x, y] = pos(f, s);
        const r = (0.9 + Math.max(0, 3.2 - s.mag) * 0.9) * dpr * 1.6;
        const [cr, cg, cb] = s.color.map((v) => Math.round(Math.min(1, v) * 255));
        const tw = 0.85 + 0.15 * Math.sin(this.time * 2 + s.x);
        const halo = g.createRadialGradient(x, y, 0, x, y, r * 4);
        halo.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.55 * f.alpha * tw})`);
        halo.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        g.fillStyle = halo;
        g.beginPath();
        g.arc(x, y, r * 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgba(255, 255, 255, ${f.alpha})`;
        g.beginPath();
        g.arc(x, y, r * 0.55, 0, Math.PI * 2);
        g.fill();
      }
      if (f.label && f.draw > 0.3) {
        const top = Math.min(...f.def.stars.map((s) => pos(f, s)[1]));
        const cx = f.def.stars.reduce((acc, s) => acc + pos(f, s)[0], 0) / f.def.stars.length;
        this.caption(f.label, cx, top - 2.4 * unit, Math.min(1, (f.draw - 0.3) * 2) * f.alpha, unit, dpr, true);
      }
    }

    // Rings and names on the stars Subaru picks out.
    for (const m of this.marks) {
      const f = this.figures.get(m.figure);
      const s = f?.def.stars.find((x) => x.id === m.star);
      if (!f || !s || f.alpha < 0.05) continue;
      const [x, y] = pos(f, s);
      const appear = Math.min(1, m.t / 0.6);
      const pulse = 1 + 0.08 * Math.sin(m.t * 4);
      const R = (1.6 * unit * (1.6 - 0.6 * appear)) * pulse;
      g.strokeStyle = hexA(m.color, 0.9 * appear * f.alpha);
      g.lineWidth = 1.8 * dpr;
      g.beginPath();
      g.arc(x, y, R, 0, Math.PI * 2 * appear);
      g.stroke();
      const right = x < w * 0.7;
      const tx = x + (right ? 1 : -1) * (R + 0.8 * unit);
      g.textAlign = right ? 'left' : 'right';
      g.textBaseline = 'middle';
      g.font = `italic 600 ${Math.round(1.25 * unit)}px 'Cormorant Garamond', Georgia, serif`;
      g.fillStyle = hexA(m.color, appear * f.alpha);
      g.fillText(m.text, tx, y - 0.45 * unit);
      g.font = `500 ${Math.round(0.72 * unit)}px 'Cormorant Garamond', Georgia, serif`;
      g.fillStyle = `rgba(210, 220, 255, ${0.8 * appear * f.alpha})`;
      g.fillText(m.sub, tx, y + 0.65 * unit);
      if (m.strike > 0) {
        const tw = g.measureText(m.sub).width;
        g.font = `italic 600 ${Math.round(1.25 * unit)}px 'Cormorant Garamond', Georgia, serif`;
        const nw = Math.max(tw, g.measureText(m.text).width);
        g.strokeStyle = `rgba(255, 120, 100, ${0.9 * f.alpha})`;
        g.lineWidth = 2.2 * dpr;
        g.beginPath();
        const sx = right ? tx : tx - nw;
        g.moveTo(sx - 0.2 * unit, y - 0.45 * unit);
        g.lineTo(sx - 0.2 * unit + (nw + 0.4 * unit) * m.strike, y - 0.45 * unit);
        g.stroke();
      }
    }
  }

  private caption(text: string, x: number, y: number, a: number, unit: number, dpr: number, display = false): void {
    if (a <= 0.01) return;
    const g = this.ctx;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = display ? `600 ${Math.round(1.05 * unit)}px Cinzel, 'Cormorant Garamond', serif` : `italic 500 ${Math.round(0.8 * unit)}px 'Cormorant Garamond', Georgia, serif`;
    g.fillStyle = `rgba(200, 214, 255, ${a})`;
    g.shadowColor = 'rgba(90, 120, 255, 0.6)';
    g.shadowBlur = 8 * dpr;
    g.fillText(display ? text.toUpperCase().split('').join(' ') : text, x, y);
    g.shadowBlur = 0;
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}
