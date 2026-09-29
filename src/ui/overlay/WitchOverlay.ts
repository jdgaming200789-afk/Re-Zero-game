import { el } from '../dom';
import '../styles/witch.css';

interface Tendril {
  /** Start on the screen edge (px) and unit direction inward. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  length: number;
  width: number;
  phase: number;
  freq: number;
  amp: number;
  delay: number;
}

/**
 * The Witch's shadow, drawn over the scene: black tendrils that creep in
 * from the edges of the screen, and — when Subaru tries to speak of Return
 * by Death — a hand that reaches for his heart and closes. Whispers ("I
 * love you") drift over everything, even the black.
 *
 * Pure 2D canvas + DOM; driven with unscaled time so it keeps moving while
 * the world is frozen.
 */
export class WitchOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly whispers: HTMLElement;
  private tendrils: Tendril[] = [];
  private active = false;
  private t = 0;
  /** 0..1: how far the darkness has closed in. */
  reach = 0;
  private reachTarget = 0;
  private reachRate = 0.5;
  /** Whispers per second. */
  whisperRate = 0;
  private whisperCarry = 0;
  private hand: { t: number; progress: number; squeeze: number } | null = null;
  private words = ['I love you'];

  constructor(overlayLayer: HTMLElement) {
    this.canvas = el('canvas', { class: 'rz-witch' });
    overlayLayer.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.whispers = overlayLayer.appendChild(el('div', { class: 'rz-whispers' }));
  }

  get running(): boolean {
    return this.active;
  }

  start(words: string[] = ['I love you']): void {
    this.words = words;
    this.active = true;
    this.t = 0;
    this.reach = 0;
    this.reachTarget = 0;
    this.whisperRate = 0;
    this.hand = null;
    this.resize();
    this.canvas.classList.add('visible');
    const w = this.canvas.width;
    const h = this.canvas.height;
    const edge = (): [number, number, number, number] => {
      const side = Math.floor(Math.random() * 4);
      const u = Math.random();
      if (side === 0) return [u * w, -10, 0, 1];
      if (side === 1) return [u * w, h + 10, 0, -1];
      if (side === 2) return [-10, u * h, 1, 0];
      return [w + 10, u * h, -1, 0];
    };
    this.tendrils = Array.from({ length: 34 }, () => {
      const [x, y, dx, dy] = edge();
      // Aim loosely at the centre so they converge.
      const cx = w / 2 + (Math.random() - 0.5) * w * 0.3 - x;
      const cy = h / 2 + (Math.random() - 0.5) * h * 0.3 - y;
      const l = Math.hypot(cx, cy);
      const mix = 0.55;
      const ndx = dx * (1 - mix) + (cx / l) * mix;
      const ndy = dy * (1 - mix) + (cy / l) * mix;
      const nl = Math.hypot(ndx, ndy);
      return {
        x,
        y,
        dx: ndx / nl,
        dy: ndy / nl,
        length: (0.35 + Math.random() * 0.35) * Math.hypot(w, h) * 0.5,
        width: 10 + Math.random() * 30,
        phase: Math.random() * 10,
        freq: 2 + Math.random() * 3,
        amp: 10 + Math.random() * 26,
        delay: Math.random() * 0.35,
      };
    });
  }

  /** Close in to `target` (0..1) at `rate` per second. */
  closeIn(target: number, rate = 0.5): void {
    this.reachTarget = target;
    this.reachRate = rate;
  }

  /** A hand reaches for the heart from below. */
  reachForHeart(): void {
    this.hand = { t: 0, progress: 0, squeeze: 0 };
  }

  squeeze(): void {
    if (this.hand) this.hand.squeeze = 0.0001;
  }

  stop(fadeSeconds = 0.8): void {
    this.active = false;
    this.whisperRate = 0;
    this.canvas.style.transition = `opacity ${fadeSeconds}s`;
    this.canvas.classList.remove('visible');
    window.setTimeout(() => {
      if (!this.active) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.style.transition = '';
    }, fadeSeconds * 1000 + 50);
  }

  /** Remove any whispers still on screen. */
  hush(): void {
    this.whispers.textContent = '';
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const d = this.reachTarget - this.reach;
    this.reach += Math.sign(d) * Math.min(Math.abs(d), this.reachRate * dt);
    if (this.hand) {
      this.hand.t += dt;
      this.hand.progress = Math.min(1, this.hand.progress + dt / 2.2);
      if (this.hand.squeeze > 0) this.hand.squeeze = Math.min(1, this.hand.squeeze + dt / 0.35);
    }
    this.whisperCarry += dt * this.whisperRate;
    while (this.whisperCarry >= 1) {
      this.whisperCarry -= 1;
      this.whisper();
    }
    this.draw();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
  }

  private whisper(): void {
    const word = this.words[Math.floor(Math.random() * this.words.length)]!;
    const node = el('span', { class: 'w', text: word });
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 30;
    node.style.left = `${50 + Math.cos(a) * r}%`;
    node.style.top = `${50 + Math.sin(a) * r * 0.8}%`;
    node.style.fontSize = `${1 + Math.random() * 0.9}em`;
    node.style.setProperty('--rot', `${(Math.random() - 0.5) * 16}deg`);
    this.whispers.appendChild(node);
    while (this.whispers.children.length > 40) this.whispers.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 2600);
  }

  private draw(): void {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    // Edge darkness that deepens as the shadow closes.
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * (0.55 - this.reach * 0.45), w / 2, h / 2, Math.hypot(w, h) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(4,0,8,${Math.min(1, 0.35 + this.reach * 0.8)})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    c.save();
    c.shadowColor = 'rgba(90, 30, 140, 0.55)';
    c.shadowBlur = 14;
    c.fillStyle = '#030006';
    for (const td of this.tendrils) {
      const grow = Math.max(0, Math.min(1, (this.reach - td.delay) / (1 - td.delay)));
      if (grow <= 0) continue;
      this.drawTendril(td, grow);
    }
    if (this.hand) this.drawHand();
    c.restore();
  }

  private drawTendril(td: Tendril, grow: number): void {
    const c = this.ctx;
    const steps = 22;
    const len = td.length * grow;
    const px = -td.dy;
    const py = td.dx;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const along = len * k;
      const wob = Math.sin(k * td.freq * 3 + this.t * 1.7 + td.phase) * td.amp * k + Math.sin(this.t * 3.1 + td.phase * 2 + k * 9) * 3 * k;
      const x = td.x + td.dx * along + px * wob;
      const y = td.y + td.dy * along + py * wob;
      const half = td.width * 0.5 * Math.pow(1 - k, 0.8) + 0.8;
      left.push([x + px * half, y + py * half]);
      right.push([x - px * half, y - py * half]);
    }
    c.beginPath();
    c.moveTo(left[0]![0], left[0]![1]);
    for (const [x, y] of left) c.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i]![0], right[i]![1]);
    c.closePath();
    c.fill();
  }

  /**
   * Hands of shadow: one rises from below towards the heart, two smaller
   * ones reach in from the sides. Long, thin fingers that close on the squeeze.
   */
  private drawHand(): void {
    const hd = this.hand!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const e = 1 - Math.pow(1 - hd.progress, 3);
    const s = Math.min(w, h) / 900;
    const curl = hd.squeeze;
    // His heart, faintly, under the hand: a slow beat that stutters on the squeeze.
    const c = this.ctx;
    const beat = Math.pow(Math.max(0, Math.sin(hd.t * (curl > 0 ? 11 : 5.5))), 6);
    const hr = (60 + beat * 25) * s * (1 - curl * 0.4);
    const hg = c.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, hr * 2.4);
    hg.addColorStop(0, `rgba(200, 30, 60, ${0.25 + beat * 0.35})`);
    hg.addColorStop(1, 'rgba(120, 0, 40, 0)');
    c.save();
    c.shadowBlur = 0;
    c.fillStyle = hg;
    c.fillRect(0, 0, w, h);
    c.restore();
    this.oneHand(w * 0.5 + Math.sin(hd.t * 1.3) * 8 * s, h * (1.34 - e * 0.6), 0, s * 0.82 * (1 - curl * 0.12), curl, 1);
    const side = Math.max(0, (hd.progress - 0.25) / 0.75);
    const es = 1 - Math.pow(1 - side, 3);
    this.oneHand(w * (-0.2 + es * 0.42), h * 0.62 + Math.sin(hd.t * 1.1) * 6 * s, 1.15, s * 0.72, curl, 0.8);
    this.oneHand(w * (1.2 - es * 0.42), h * 0.58 + Math.sin(hd.t * 1.4 + 1) * 6 * s, -1.15, s * 0.72, curl, 0.8);
  }

  private oneHand(x: number, y: number, rot: number, scale: number, curl: number, alpha: number): void {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(scale, scale);
    c.globalAlpha = alpha;
    c.shadowBlur = 26;
    c.shadowColor = 'rgba(110, 40, 170, 0.75)';
    // The arm dissolves into smoke towards the edge of the screen.
    const g = c.createLinearGradient(0, 0, 0, 900);
    g.addColorStop(0, '#040008');
    g.addColorStop(0.55, 'rgba(4,0,8,0.9)');
    g.addColorStop(1, 'rgba(4,0,8,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-46, 40);
    c.bezierCurveTo(-52, 260, -40, 520, -70 + Math.sin(this.t * 2) * 6, 900);
    c.lineTo(70 + Math.sin(this.t * 2.3) * 6, 900);
    c.bezierCurveTo(40, 520, 52, 260, 46, 40);
    c.closePath();
    c.fill();
    c.fillStyle = '#040008';
    // Palm: long and narrow.
    c.beginPath();
    c.ellipse(0, -10, 62 * (1 - curl * 0.15), 88, 0, 0, Math.PI * 2);
    c.fill();
    // Four long fingers and a thumb, with a slight tremor.
    const fingers: Array<[number, number, number]> = [
      [-44, 215, -0.26],
      [-15, 245, -0.08],
      [15, 238, 0.08],
      [42, 200, 0.24],
    ];
    for (const [fx, len, spread] of fingers) this.finger(fx, -80, len * (1 - curl * 0.5), spread * (1 - curl * 0.8), curl, 21);
    this.finger(-58, 0, 200 * (1 - curl * 0.35), -0.95 + curl * 0.6, curl, 24);
    c.restore();
  }

  private finger(x: number, y: number, len: number, angle: number, curl: number, width: number): void {
    const c = this.ctx;
    const segs = 10;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    let px = x;
    let py = y;
    let a = angle - Math.PI / 2;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      // Knuckles swell slightly; tips come to a point.
      const knuckle = 1 + 0.12 * Math.max(0, Math.cos(k * Math.PI * 3));
      const half = width * 0.5 * (1 - Math.pow(k, 1.6) * 0.92) * knuckle;
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      left.push([px + nx * half, py + ny * half]);
      right.push([px - nx * half, py - ny * half]);
      px += Math.cos(a) * (len / segs);
      py += Math.sin(a) * (len / segs);
      // Joints bend inward as the hand closes, with a faint tremor.
      // Joints bend inward as the hand closes, with a faint tremor.
      a += (curl * 0.3 + 0.012) * (angle < 0 ? 1 : -1) + Math.sin(this.t * 9 + x + k * 4) * 0.012;
    }
    c.beginPath();
    c.moveTo(left[0]![0], left[0]![1]);
    for (const [lx, ly] of left) c.lineTo(lx, ly);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i]![0], right[i]![1]);
    c.closePath();
    c.fill();
  }
}
