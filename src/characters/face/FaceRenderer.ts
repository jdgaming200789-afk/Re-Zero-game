import { CanvasTexture, SRGBColorSpace } from 'three';
import { clamp, damp } from '../../core/math/MathUtil';

export type PupilShape = 'round' | 'butterfly' | 'dots' | 'slit';
export type MouthShape = 'line' | 'smile' | 'openSmile' | 'frown' | 'o' | 'oSmall' | 'grit' | 'smirk' | 'wavy' | 'open' | 'fangGrin' | 'A' | 'I' | 'U' | 'E' | 'O';

export interface FaceStyle {
  skin: string;
  iris: string;
  irisLight: string;
  pupil?: string;
  pupilShape?: PupilShape;
  brow: string;
  lash: string;
  /** Eye size multiplier. */
  eyeSize?: number;
  /** Outer-corner tilt: >0 upturned (tsurime), <0 droopy (tareme). */
  tilt?: number;
  /** Subaru's small-irised "three-white" eyes. */
  sanpaku?: boolean;
  /** 'sharp': flatter, angular lids (Subaru, Reid); default rounded. */
  eyeShape?: 'round' | 'sharp';
  /** Eye opening height multiplier (narrower < 1). */
  eyeHeight?: number;
  /** Eyebrow thickness multiplier. */
  browWeight?: number;
  /** An eyepatch over one eye (+1 the character's left, -1 right). */
  eyepatch?: 1 | -1;
  lashWeight?: number;
  eyeLine?: number;
  /** Horizontal distance of each eye from centre (UV units). */
  eyeSpread?: number;
  mouthColor?: string;
  blushColor?: string;
  /** Eye closed and at rest (Rem asleep). */
  sleeping?: boolean;
}

export interface ExpressionParams {
  open: number; // upper lid openness 0 closed .. 1 normal .. 1.2 wide
  lower: number; // lower lid raise 0..1 (smiling eyes)
  happyClose: number; // 0..1 closed-eye arcs (^ ^)
  browRaise: number; // -1 lowered .. 1 raised
  browInner: number; // -1 angry (inner down) .. 1 worried (inner up)
  irisScale: number;
  mouth: MouthShape;
  blush: number;
  sweat: number;
  tears: number;
  squint: number; // > < pain squeeze
  asym: number; // one brow up (smug / skeptical)
}

export const EXPRESSIONS: Record<string, ExpressionParams> = {
  neutral: { open: 1, lower: 0, happyClose: 0, browRaise: 0, browInner: 0, irisScale: 1, mouth: 'line', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0 },
  happy: { open: 0.92, lower: 0.35, happyClose: 0, browRaise: 0.25, browInner: 0.1, irisScale: 1, mouth: 'smile', blush: 0.1, sweat: 0, tears: 0, squint: 0, asym: 0 },
  joy: { open: 0.9, lower: 0.2, happyClose: 1, browRaise: 0.4, browInner: 0, irisScale: 1, mouth: 'openSmile', blush: 0.3, sweat: 0, tears: 0, squint: 0, asym: 0 },
  sad: { open: 0.78, lower: 0.1, happyClose: 0, browRaise: 0.1, browInner: 0.9, irisScale: 1, mouth: 'frown', blush: 0, sweat: 0, tears: 0.2, squint: 0, asym: 0 },
  angry: { open: 0.88, lower: 0.2, happyClose: 0, browRaise: -0.4, browInner: -1, irisScale: 0.9, mouth: 'grit', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0 },
  annoyed: { open: 0.7, lower: 0.15, happyClose: 0, browRaise: -0.2, browInner: -0.5, irisScale: 1, mouth: 'frown', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0.3 },
  surprised: { open: 1.18, lower: 0, happyClose: 0, browRaise: 1, browInner: 0.2, irisScale: 0.82, mouth: 'o', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0 },
  fear: { open: 1.14, lower: 0, happyClose: 0, browRaise: 0.7, browInner: 1, irisScale: 0.62, mouth: 'oSmall', blush: 0, sweat: 1, tears: 0, squint: 0, asym: 0 },
  embarrassed: { open: 0.85, lower: 0.25, happyClose: 0, browRaise: 0.3, browInner: 0.6, irisScale: 1, mouth: 'wavy', blush: 1, sweat: 0.6, tears: 0, squint: 0, asym: 0 },
  cocky: { open: 0.8, lower: 0.25, happyClose: 0, browRaise: 0.15, browInner: -0.35, irisScale: 0.95, mouth: 'fangGrin', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0.45 },
  smug: { open: 0.62, lower: 0.2, happyClose: 0, browRaise: 0.1, browInner: -0.2, irisScale: 1, mouth: 'smirk', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0.6 },
  determined: { open: 0.92, lower: 0.15, happyClose: 0, browRaise: -0.25, browInner: -0.45, irisScale: 1, mouth: 'line', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0 },
  pain: { open: 0.3, lower: 0.4, happyClose: 0, browRaise: -0.2, browInner: 0.8, irisScale: 0.9, mouth: 'grit', blush: 0, sweat: 0.7, tears: 0.3, squint: 1, asym: 0 },
  thinking: { open: 0.82, lower: 0.1, happyClose: 0, browRaise: 0.1, browInner: 0.2, irisScale: 1, mouth: 'line', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0.4 },
  despair: { open: 1.05, lower: 0, happyClose: 0, browRaise: 0.5, browInner: 1, irisScale: 0.5, mouth: 'open', blush: 0, sweat: 0.8, tears: 0.8, squint: 0, asym: 0 },
  sleeping: { open: 0, lower: 0, happyClose: 0, browRaise: 0, browInner: 0.1, irisScale: 1, mouth: 'line', blush: 0, sweat: 0, tears: 0, squint: 0, asym: 0 },
};

const SIZE = 512;

/**
 * Paints an anime face into a texture mapped over the head's front UV
 * projection. Expressions blend continuously; blinks, gaze and lip-sync
 * are layered on top. Only redraws when something visible changed.
 */
export class FaceRenderer {
  readonly texture: CanvasTexture;
  readonly glow: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly gctx: CanvasRenderingContext2D;
  private readonly current: ExpressionParams = { ...EXPRESSIONS.neutral! };
  private target: ExpressionParams = { ...EXPRESSIONS.neutral! };
  private mouth: MouthShape = 'line';
  private viseme: MouthShape | null = null;
  private blinkT = -1;
  private nextBlink = 2 + Math.random() * 3;
  private readonly gaze = { x: 0, y: 0, tx: 0, ty: 0 };
  private dirty = true;
  private redrawCooldown = 0;
  private lastKey = '';
  /** Line-weight multiplier for distant faces (see setDetail). */
  private boost = 1;

  constructor(readonly style: FaceStyle) {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    this.ctx = c.getContext('2d')!;
    const g = document.createElement('canvas');
    g.width = g.height = SIZE / 2;
    this.gctx = g.getContext('2d')!;
    // glTF UVs have a top-left origin: canvas row 0 is the top of the face.
    this.texture = new CanvasTexture(c);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.flipY = false;
    this.glow = new CanvasTexture(g);
    this.glow.colorSpace = SRGBColorSpace;
    this.glow.flipY = false;
    if (style.sleeping) {
      this.target = { ...EXPRESSIONS.sleeping! };
      Object.assign(this.current, this.target);
    }
    this.draw();
  }

  setExpression(name: string, intensity = 1): void {
    const e = EXPRESSIONS[name] ?? EXPRESSIONS.neutral!;
    const n = EXPRESSIONS.neutral!;
    const t: ExpressionParams = { ...e };
    for (const k of Object.keys(t) as Array<keyof ExpressionParams>) {
      if (k === 'mouth') continue;
      (t[k] as number) = (n[k] as number) + ((e[k] as number) - (n[k] as number)) * intensity;
    }
    this.target = t;
    this.mouth = intensity > 0.3 ? e.mouth : 'line';
    this.dirty = true;
  }

  /** Current mouth for lip-sync (null = expression mouth). */
  setViseme(v: MouthShape | null): void {
    if (v !== this.viseme) {
      this.viseme = v;
      this.dirty = true;
    }
  }

  /** Gaze in eye-space units (-1..1, x = character's left). */
  setGaze(x: number, y: number): void {
    this.gaze.tx = clamp(x, -1, 1);
    this.gaze.ty = clamp(y, -1, 1);
  }

  /** Thicken painted lines for distant viewing (1 = close-up). */
  setDetail(boost: number): void {
    if (boost === this.boost) return;
    this.boost = boost;
    this.dirty = true;
    this.lastKey = '';
  }

  blink(): void {
    if (this.blinkT < 0) this.blinkT = 0;
  }

  update(dt: number): void {
    // Ease expression parameters.
    for (const k of Object.keys(this.current) as Array<keyof ExpressionParams>) {
      if (k === 'mouth') continue;
      const cur = this.current[k] as number;
      const tgt = this.target[k] as number;
      if (Math.abs(cur - tgt) > 0.002) {
        (this.current[k] as number) = damp(cur, tgt, 0.07, dt);
        this.dirty = true;
      }
    }
    // Blinks: natural interval with occasional doubles.
    if (!this.style.sleeping && this.current.open > 0.25) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blink();
        this.nextBlink = Math.random() < 0.15 ? 0.25 : 2.2 + Math.random() * 3.8;
      }
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.16) this.blinkT = -1;
      this.dirty = true;
    }
    const gx = damp(this.gaze.x, this.gaze.tx, 0.05, dt);
    const gy = damp(this.gaze.y, this.gaze.ty, 0.05, dt);
    if (Math.abs(gx - this.gaze.x) > 0.01 || Math.abs(gy - this.gaze.y) > 0.01) {
      this.gaze.x = gx;
      this.gaze.y = gy;
      this.dirty = true;
    }
    this.redrawCooldown -= dt;
    if (this.dirty && this.redrawCooldown <= 0) {
      this.draw();
      this.redrawCooldown = 1 / 30;
    }
  }

  private blinkAmount(): number {
    if (this.blinkT < 0) return 0;
    const t = this.blinkT / 0.16;
    return t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
  }

  // ------------------------------------------------------------------ drawing
  private draw(): void {
    this.dirty = false;
    const s = this.style;
    const e = this.current;
    const mouth = this.viseme ?? this.mouth;
    const key = `${JSON.stringify(e)}|${mouth}|${this.gaze.x.toFixed(2)},${this.gaze.y.toFixed(2)}|${this.blinkT.toFixed(2)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.ctx;
    g.fillStyle = s.skin;
    g.fillRect(0, 0, SIZE, SIZE);
    this.gctx.fillStyle = '#000';
    this.gctx.fillRect(0, 0, SIZE / 2, SIZE / 2);
    const eyeLine = s.eyeLine ?? 0.44;
    const spread = s.eyeSpread ?? 0.2;
    const open = clamp(e.open * (1 - this.blinkAmount()), 0, 1.3);
    for (const side of [1, -1]) {
      const cx = (0.5 + side * spread) * SIZE;
      const cy = (1 - eyeLine) * SIZE;
      if (s.eyepatch === side) this.drawEyepatch(cx, cy, side);
      else this.drawEye(cx, cy, side, open, e);
      this.drawBrow(cx, cy, side, e);
    }
    // Nose hint (a tiny shadow tick)
    g.strokeStyle = 'rgba(160,90,80,0.45)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(SIZE * 0.506, SIZE * (1 - 0.325));
    g.lineTo(SIZE * 0.498, SIZE * (1 - 0.312));
    g.stroke();
    this.drawMouth(mouth, e);
    if (e.blush > 0.02) this.drawBlush(e.blush);
    if (e.sweat > 0.05) this.drawSweat(e.sweat);
    if (e.tears > 0.05) this.drawTears(e.tears, eyeLine, spread);
    this.texture.needsUpdate = true;
    this.glow.needsUpdate = true;
  }

  /** Upper lid sampled from the inner to the outer corner. */
  private lidPoints(cx: number, cy: number, side: number, w: number, h: number, open: number): Array<[number, number]> {
    const tilt = (this.style.tilt ?? 0) * h * 0.35;
    const inner = cx - side * w * 0.5;
    const outer = cx + side * w * 0.5;
    let p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number];
    if (this.style.eyeShape === 'sharp') {
      // Flat, hard lid: a short rise from the inner corner, a long level
      // sweep and a sudden drop into the outer corner.
      const topY = cy - h * 0.5 * open;
      p0 = [inner, cy + h * 0.08];
      p1 = [inner + side * w * 0.06, topY + h * 0.02];
      p2 = [outer - side * w * 0.3, topY - h * 0.06 - tilt];
      p3 = [outer, cy - h * 0.02 - tilt];
    } else {
      const topY = cy - h * 0.55 * open;
      p0 = [inner, cy + h * 0.05];
      p1 = [inner + side * w * 0.12, topY - h * 0.02];
      p2 = [outer - side * w * 0.2, topY - tilt];
      p3 = [outer, cy - h * 0.1 - tilt];
    }
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    return pts;
  }

  private lowerLidY(cy: number, h: number, lower: number): number {
    return cy + h * (this.style.eyeShape === 'sharp' ? 0.36 : 0.45) - lower * h * 0.3;
  }

  private eyePath(g: CanvasRenderingContext2D, cx: number, cy: number, side: number, w: number, h: number, open: number, lower: number): void {
    const inner = cx - side * w * 0.5;
    const outer = cx + side * w * 0.5;
    const botY = this.lowerLidY(cy, h, lower);
    const pts = this.lidPoints(cx, cy, side, w, h, open);
    g.beginPath();
    g.moveTo(pts[0]![0], pts[0]![1]);
    for (const [x, y] of pts) g.lineTo(x, y);
    const end = pts[pts.length - 1]!;
    if (this.style.eyeShape === 'sharp') g.quadraticCurveTo(cx + side * w * 0.12, botY + h * 0.04, pts[0]![0], pts[0]![1]);
    else g.bezierCurveTo(outer - side * w * 0.05, botY - h * 0.1, inner + side * w * 0.25, botY + h * 0.05, pts[0]![0], pts[0]![1]);
    g.closePath();
    void end;
  }

  /**
   * The upper lash line as a filled, tapered band along the lid: hairline
   * at the inner corner, heaviest towards the outer corner, ending in a
   * flick (round eyes) or a hard point (sharp eyes).
   */
  private drawLash(g: CanvasRenderingContext2D, pts: Array<[number, number]>, side: number, w: number, h: number, weight: number): void {
    const sharp = this.style.eyeShape === 'sharp';
    const n = pts.length;
    const top: Array<[number, number]> = [];
    const bot: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(n - 1, i + 1)]!;
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      // Thickness profile along the lid.
      const prof = sharp ? 0.25 + 0.95 * Math.min(1, t * 1.6) * (t > 0.9 ? 1 - (t - 0.9) * 4 : 1) : 0.2 + 1.0 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.55) * (t > 0.92 ? 1 - (t - 0.92) * 5 : 1);
      const th = weight * Math.max(0.12, prof);
      top.push([pts[i]![0] + nx * th * 0.75, pts[i]![1] + ny * th * 0.75]);
      bot.push([pts[i]![0] - nx * th * 0.25, pts[i]![1] - ny * th * 0.25]);
    }
    g.beginPath();
    g.moveTo(top[0]![0], top[0]![1]);
    for (const [x, y] of top) g.lineTo(x, y);
    const end = pts[n - 1]!;
    if (sharp) {
      g.lineTo(end[0] + side * w * 0.07, end[1] + h * 0.05);
    } else {
      // Outer flick, swept up and out.
      g.quadraticCurveTo(end[0] + side * w * 0.08, end[1] - h * 0.02, end[0] + side * w * 0.13, end[1] - h * 0.14);
      g.lineTo(end[0] + side * w * 0.02, end[1] + h * 0.02);
    }
    for (let i = n - 1; i >= 0; i--) g.lineTo(bot[i]![0], bot[i]![1]);
    g.closePath();
    g.fill();
  }

  private drawEye(cx: number, cy: number, side: number, open: number, e: ExpressionParams): void {
    const s = this.style;
    const g = this.ctx;
    const size = (s.eyeSize ?? 1) * SIZE;
    const w = 0.2 * size;
    const h = 0.17 * size * (s.eyeHeight ?? 1);
    const lashW = (s.lashWeight ?? 1) * 8 * this.boost;
    const sharp = s.eyeShape === 'sharp';

    // Closed-eye arcs (happy ^ ^) or sleeping lines.
    if (e.happyClose > 0.5 || open < 0.08 || e.squint > 0.5) {
      g.strokeStyle = s.lash;
      g.lineWidth = lashW * 0.8;
      g.lineCap = 'round';
      g.beginPath();
      if (e.squint > 0.5) {
        // > <
        g.moveTo(cx - side * w * 0.45, cy - h * 0.25);
        g.lineTo(cx + side * w * 0.3, cy);
        g.lineTo(cx - side * w * 0.45, cy + h * 0.25);
      } else if (e.happyClose > 0.5) {
        g.moveTo(cx - w * 0.45, cy + h * 0.1);
        g.quadraticCurveTo(cx, cy - h * 0.45, cx + w * 0.45, cy + h * 0.1);
      } else {
        g.moveTo(cx - w * 0.48, cy);
        g.quadraticCurveTo(cx, cy + h * 0.22, cx + w * 0.48, cy);
        // lashes on a closed lid
        g.moveTo(cx + side * w * 0.44, cy + h * 0.02);
        g.lineTo(cx + side * w * 0.58, cy - h * 0.06);
      }
      g.stroke();
      return;
    }

    // Sclera
    g.save();
    this.eyePath(g, cx, cy, side, w, h, open, e.lower);
    g.fillStyle = '#fbfbfd';
    g.fill();
    g.clip();
    // Upper-lid shadow on the white
    const shade = g.createLinearGradient(0, cy - h * 0.6, 0, cy);
    shade.addColorStop(0, 'rgba(120,130,170,0.55)');
    shade.addColorStop(1, 'rgba(120,130,170,0)');
    g.fillStyle = shade;
    g.fillRect(cx - w, cy - h, w * 2, h);

    // Iris
    const irisScale = e.irisScale * (s.sanpaku ? 0.7 : 1);
    const ir = w * 0.3 * irisScale * (sharp && !s.sanpaku ? 0.94 : 1);
    const irY = h * 0.44 * irisScale * (sharp ? 1.18 : 1);
    const gazeX = this.gaze.x * w * 0.22;
    const irisCx = cx + gazeX;
    const irisCy = cy + h * 0.02 - this.gaze.y * h * 0.14 + (s.sanpaku ? -h * 0.06 : 0);
    const grad = g.createLinearGradient(0, irisCy - irY, 0, irisCy + irY);
    grad.addColorStop(0, shadeColor(s.iris, -0.55));
    grad.addColorStop(0.3, shadeColor(s.iris, -0.2));
    grad.addColorStop(0.6, s.iris);
    grad.addColorStop(1, s.irisLight);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(irisCx, irisCy, ir, irY, 0, 0, Math.PI * 2);
    g.fill();
    // Radial streaks, lighter towards the bottom of the iris.
    g.save();
    g.beginPath();
    g.ellipse(irisCx, irisCy, ir, irY, 0, 0, Math.PI * 2);
    g.clip();
    g.lineWidth = Math.max(1, ir * 0.06);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.17;
      const lower = Math.sin(a) > 0;
      g.strokeStyle = withAlpha(lower ? s.irisLight : shadeColor2hex(s.iris, -0.5), lower ? 0.35 : 0.3);
      g.beginPath();
      g.moveTo(irisCx + Math.cos(a) * ir * 0.42, irisCy + Math.sin(a) * irY * 0.42);
      g.lineTo(irisCx + Math.cos(a) * ir * 0.95, irisCy + Math.sin(a) * irY * 0.95);
      g.stroke();
    }
    // The lid's shadow across the top of the iris.
    const lidShade = g.createLinearGradient(0, irisCy - irY, 0, irisCy - irY * 0.2);
    lidShade.addColorStop(0, withAlpha(shadeColor2hex(s.iris, -0.7), 0.7));
    lidShade.addColorStop(1, withAlpha(shadeColor2hex(s.iris, -0.7), 0));
    g.fillStyle = lidShade;
    g.fillRect(irisCx - ir, irisCy - irY, ir * 2, irY * 0.8);
    g.restore();
    g.strokeStyle = shadeColor(s.iris, -0.6);
    g.lineWidth = 2.4 * this.boost;
    g.beginPath();
    g.ellipse(irisCx, irisCy, ir, irY, 0, 0, Math.PI * 2);
    g.stroke();
    // Pupil
    g.fillStyle = s.pupil ?? shadeColor(s.iris, -0.65);
    const shape = s.pupilShape ?? 'round';
    if (shape === 'butterfly') {
      drawButterfly(g, irisCx, irisCy + irY * 0.05, ir * 0.62, s.pupil ?? '#f08cc0');
    } else if (shape === 'slit') {
      g.beginPath();
      g.ellipse(irisCx, irisCy, ir * 0.18, irY * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      g.beginPath();
      g.ellipse(irisCx, irisCy + irY * 0.05, ir * (s.sanpaku ? 0.36 : 0.42), irY * (s.sanpaku ? 0.4 : 0.46), 0, 0, Math.PI * 2);
      g.fill();
      if (shape === 'dots') {
        g.fillStyle = '#e02a3a';
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i - 1) * 1.9;
          g.beginPath();
          g.arc(irisCx + Math.cos(a) * ir * 0.62, irisCy + Math.sin(a) * irY * 0.62, ir * 0.12, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // Lower iris glow
    const glow = g.createRadialGradient(irisCx, irisCy + irY * 0.6, 0, irisCx, irisCy + irY * 0.6, ir * 1.1);
    glow.addColorStop(0, withAlpha(s.irisLight, 0.75));
    glow.addColorStop(1, withAlpha(s.irisLight, 0));
    g.fillStyle = glow;
    g.fillRect(irisCx - ir * 1.2, irisCy, ir * 2.4, irY * 1.3);
    // Highlights (fixed light from upper outer)
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(irisCx - side * ir * 0.35, irisCy - irY * 0.42, ir * 0.3, irY * 0.2, -0.4 * side, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(irisCx + side * ir * 0.38, irisCy + irY * 0.38, ir * 0.12, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Upper lash line: a tapered band with an outer flick; lower lash thin, partial.
    const tilt = (s.tilt ?? 0) * h * 0.35;
    const inner = cx - side * w * 0.5;
    const outer = cx + side * w * 0.5;
    const topY = cy - h * (sharp ? 0.5 : 0.55) * open;
    g.fillStyle = s.lash;
    g.strokeStyle = s.lash;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    this.drawLash(g, this.lidPoints(cx, cy, side, w, h, open), side, w, h, lashW * 1.25);
    g.lineWidth = lashW * 0.35;
    g.beginPath();
    const botY = this.lowerLidY(cy, h, e.lower);
    g.moveTo(outer - side * w * 0.02, cy - h * 0.02 - tilt * 0.5);
    g.quadraticCurveTo(cx + side * w * 0.15, botY + h * 0.02, cx - side * w * 0.1, botY + h * 0.03);
    g.stroke();
    // Double-eyelid crease
    g.strokeStyle = withAlpha(s.lash, 0.35);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(inner + side * w * 0.2, topY - h * 0.18);
    g.quadraticCurveTo(cx, topY - h * (sharp ? 0.24 : 0.3), outer - side * w * 0.12, topY - h * 0.12 - tilt);
    g.stroke();

    // Emissive mask: sclera softly, highlights brightly.
    const gg = this.gctx;
    gg.save();
    gg.scale(0.5, 0.5);
    this.eyePath(gg, cx, cy, side, w, h, open, e.lower);
    gg.fillStyle = 'rgb(70,70,78)';
    gg.fill();
    gg.fillStyle = '#ffffff';
    gg.beginPath();
    gg.ellipse(irisCx - side * ir * 0.35, irisCy - irY * 0.42, ir * 0.3, irY * 0.2, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = withAlpha(this.style.irisLight, 0.6);
    gg.beginPath();
    gg.ellipse(irisCx, irisCy + irY * 0.4, ir * 0.7, irY * 0.4, 0, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  /** A round black patch with a white spiral, its strap running to the temple and up over the brow. */
  private drawEyepatch(cx: number, cy: number, side: number): void {
    const g = this.ctx;
    const r = 0.105 * (this.style.eyeSize ?? 1) * SIZE;
    const py = cy - r * 0.08;
    g.strokeStyle = '#141216';
    g.lineCap = 'round';
    g.lineWidth = 0.022 * SIZE;
    g.beginPath();
    g.moveTo(cx + side * r * 0.7, py - r * 0.6);
    g.quadraticCurveTo(cx + side * r * 1.6, py - r * 1.2, cx + side * SIZE * 0.36, py - r * 1.5);
    g.moveTo(cx - side * r * 0.6, py - r * 0.75);
    g.quadraticCurveTo(cx - side * r * 1.5, py - r * 2.0, cx - side * SIZE * 0.3, py - r * 3.2);
    g.stroke();
    g.fillStyle = '#141216';
    g.beginPath();
    g.ellipse(cx, py, r, r * 0.92, 0, 0, Math.PI * 2);
    g.fill();
    // Rim highlight and the spiral.
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, py, r * 0.9, r * 0.82, 0, Math.PI * 1.1, Math.PI * 1.6);
    g.stroke();
    g.strokeStyle = '#f4f1ea';
    g.lineWidth = r * 0.085;
    g.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const a = t * Math.PI * 2 * 2.6 * side;
      const rr = r * 0.08 + r * 0.66 * t;
      const x = cx + Math.cos(a) * rr;
      const y = py + Math.sin(a) * rr * 0.92;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  private drawBrow(cx: number, cy: number, side: number, e: ExpressionParams): void {
    const g = this.ctx;
    const size = (this.style.eyeSize ?? 1) * SIZE;
    const w = 0.19 * size;
    const raise = (e.browRaise + (side > 0 ? e.asym : -e.asym * 0.3)) * 0.035 * SIZE;
    const baseY = cy - 0.16 * SIZE - raise;
    const innerDrop = -e.browInner * 0.025 * SIZE;
    const innerX = cx - side * w * 0.55;
    const outerX = cx + side * w * 0.55;
    g.strokeStyle = this.style.brow;
    g.lineCap = 'round';
    g.lineWidth = 6 * (this.style.browWeight ?? 1) * Math.min(this.boost, 1.6);
    if (this.style.eyeShape === 'sharp') {
      // Straight, tapered brows that sit low over the eyes.
      g.fillStyle = this.style.brow;
      const t = 6 * (this.style.browWeight ?? 1) * Math.min(this.boost, 1.6);
      const by = baseY + 0.018 * SIZE;
      g.beginPath();
      g.moveTo(innerX, by + innerDrop - t * 0.6);
      g.lineTo(outerX, by + 0.006 * SIZE - t * 0.25);
      g.lineTo(outerX - side * w * 0.04, by + 0.006 * SIZE + t * 0.35);
      g.lineTo(innerX, by + innerDrop + t * 0.6);
      g.closePath();
      g.fill();
      return;
    }
    g.beginPath();
    g.moveTo(innerX, baseY + innerDrop);
    g.quadraticCurveTo(cx, baseY - 0.012 * SIZE + innerDrop * 0.3, outerX, baseY + 0.008 * SIZE);
    g.stroke();
  }

  private drawMouth(shape: MouthShape, e: ExpressionParams): void {
    const g = this.ctx;
    const mx = SIZE * 0.5;
    const my = SIZE * (1 - 0.235);
    const w = SIZE * 0.055;
    const line = this.style.mouthColor ?? '#9a4a48';
    g.strokeStyle = line;
    g.lineWidth = 4 * Math.min(this.boost, 1.8);
    g.lineCap = 'round';
    const fillOpen = (rx: number, ry: number, dy = 0) => {
      g.fillStyle = '#6e2a2e';
      g.beginPath();
      g.ellipse(mx, my + dy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d97a82';
      g.beginPath();
      g.ellipse(mx, my + dy + ry * 0.45, rx * 0.6, ry * 0.4, 0, 0, Math.PI * 2);
      g.fill();
    };
    switch (shape) {
      case 'line':
        g.beginPath();
        g.moveTo(mx - w * 0.5, my);
        g.quadraticCurveTo(mx, my + 2, mx + w * 0.5, my);
        g.stroke();
        break;
      case 'smile':
        g.beginPath();
        g.moveTo(mx - w * 0.65, my - 4);
        g.quadraticCurveTo(mx, my + w * 0.45, mx + w * 0.65, my - 4);
        g.stroke();
        break;
      case 'openSmile':
      case 'A':
        g.fillStyle = '#6e2a2e';
        g.beginPath();
        g.moveTo(mx - w * 0.7, my - 4);
        g.quadraticCurveTo(mx, my + w * (shape === 'A' ? 1.1 : 0.9), mx + w * 0.7, my - 4);
        g.closePath();
        g.fill();
        g.fillStyle = '#d97a82';
        g.beginPath();
        g.ellipse(mx, my + w * 0.35, w * 0.35, w * 0.16, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'frown':
        g.beginPath();
        g.moveTo(mx - w * 0.5, my + 4);
        g.quadraticCurveTo(mx, my - w * 0.25, mx + w * 0.5, my + 4);
        g.stroke();
        break;
      case 'o':
      case 'O':
        fillOpen(w * 0.32, w * 0.42);
        break;
      case 'oSmall':
      case 'U':
        fillOpen(w * 0.2, w * 0.26);
        break;
      case 'open':
        fillOpen(w * 0.45, w * 0.5, 4);
        break;
      case 'E':
        fillOpen(w * 0.55, w * 0.22);
        break;
      case 'I':
        fillOpen(w * 0.5, w * 0.12);
        break;
      case 'grit': {
        // Clenched teeth: a wide, flat-topped open mouth, corners pulled down.
        g.fillStyle = '#5a2226';
        g.beginPath();
        g.moveTo(mx - w * 0.62, my + w * 0.02);
        g.quadraticCurveTo(mx, my - w * 0.16, mx + w * 0.62, my + w * 0.02);
        g.quadraticCurveTo(mx + w * 0.42, my + w * 0.32, mx, my + w * 0.3);
        g.quadraticCurveTo(mx - w * 0.42, my + w * 0.32, mx - w * 0.62, my + w * 0.02);
        g.closePath();
        g.fill();
        g.save();
        g.clip();
        g.fillStyle = '#fbf8f4';
        g.fillRect(mx - w, my - w * 0.3, w * 2, w * 0.3);
        g.fillRect(mx - w, my + w * 0.18, w * 2, w * 0.2);
        g.restore();
        g.lineWidth = 3 * Math.min(this.boost, 1.8);
        g.stroke();
        break;
      }
      case 'fangGrin': {
        const w = SIZE * 0.085;
        // A wide, cocky grin full of sharp teeth (Reid).
        g.fillStyle = '#5a2226';
        g.beginPath();
        g.moveTo(mx - w * 0.85, my - w * 0.12);
        g.quadraticCurveTo(mx, my - w * 0.02, mx + w * 0.85, my - w * 0.18);
        g.quadraticCurveTo(mx + w * 0.5, my + w * 0.55, mx - w * 0.05, my + w * 0.48);
        g.quadraticCurveTo(mx - w * 0.6, my + w * 0.4, mx - w * 0.85, my - w * 0.12);
        g.closePath();
        g.fill();
        g.save();
        g.clip();
        g.fillStyle = '#fbf8f4';
        // Upper row: a band with pointed teeth hanging from it.
        g.beginPath();
        g.moveTo(mx - w, my - w * 0.3);
        g.lineTo(mx + w, my - w * 0.3);
        const n = 9;
        for (let i = n; i >= 0; i--) {
          const x = mx - w * 0.85 + (w * 1.7 * i) / n;
          const y = my - w * 0.06 - (i / n) * w * 0.06;
          g.lineTo(x, y + (i % 2 ? w * 0.14 : 0));
        }
        g.closePath();
        g.fill();
        // A few lower fangs.
        for (const fx of [-0.42, 0.38]) {
          g.beginPath();
          g.moveTo(mx + w * (fx - 0.1), my + w * 0.5);
          g.lineTo(mx + w * fx, my + w * 0.26);
          g.lineTo(mx + w * (fx + 0.1), my + w * 0.5);
          g.fill();
        }
        g.restore();
        g.lineWidth = 3.2 * Math.min(this.boost, 1.8);
        g.stroke();
        break;
      }
      case 'smirk':
        g.beginPath();
        g.moveTo(mx - w * 0.5, my + 2);
        g.quadraticCurveTo(mx + w * 0.1, my + 4, mx + w * 0.55, my - 6);
        g.stroke();
        break;
      case 'wavy':
        g.beginPath();
        g.moveTo(mx - w * 0.6, my);
        g.bezierCurveTo(mx - w * 0.3, my - 8, mx - w * 0.1, my + 8, mx + w * 0.1, my);
        g.bezierCurveTo(mx + w * 0.3, my - 8, mx + w * 0.5, my + 6, mx + w * 0.6, my);
        g.stroke();
        break;
    }
    void e;
  }

  private drawBlush(amount: number): void {
    const g = this.ctx;
    const c = this.style.blushColor ?? '#ff8a8a';
    for (const side of [1, -1]) {
      const x = SIZE * (0.5 + side * 0.2);
      const y = SIZE * (1 - 0.33);
      const grad = g.createRadialGradient(x, y, 0, x, y, SIZE * 0.07);
      grad.addColorStop(0, withAlpha(c, 0.55 * amount));
      grad.addColorStop(1, withAlpha(c, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, SIZE * 0.08, SIZE * 0.04, 0, 0, Math.PI * 2);
      g.fill();
      // hatch lines
      g.strokeStyle = withAlpha('#e05a6a', 0.6 * amount);
      g.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(x + i * 10 - 4, y + 6);
        g.lineTo(x + i * 10 + 4, y - 6);
        g.stroke();
      }
    }
  }

  private drawSweat(amount: number): void {
    const g = this.ctx;
    const x = SIZE * 0.78;
    const y = SIZE * (1 - 0.6);
    g.fillStyle = withAlpha('#bfe4ff', 0.9 * amount);
    g.strokeStyle = withAlpha('#5b8fc0', amount);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y - 18);
    g.quadraticCurveTo(x + 12, y + 4, x, y + 10);
    g.quadraticCurveTo(x - 12, y + 4, x, y - 18);
    g.fill();
    g.stroke();
  }

  private drawTears(amount: number, eyeLine: number, spread: number): void {
    const g = this.ctx;
    for (const side of [1, -1]) {
      const x = SIZE * (0.5 + side * (spread - 0.02));
      const y = SIZE * (1 - eyeLine) + 0.06 * SIZE;
      const grad = g.createLinearGradient(x, y, x, y + 70 * amount);
      grad.addColorStop(0, withAlpha('#d8f0ff', 0.9));
      grad.addColorStop(1, withAlpha('#d8f0ff', 0));
      g.strokeStyle = grad;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + side * 3, y + 70 * amount);
      g.stroke();
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.glow.dispose();
  }
}

function drawButterfly(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  for (const s of [1, -1]) {
    g.beginPath();
    g.ellipse(s * r * 0.45, -r * 0.25, r * 0.5, r * 0.38, s * -0.5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(s * r * 0.35, r * 0.35, r * 0.34, r * 0.26, s * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = shadeColor(color, -0.5);
  g.fillRect(-r * 0.06, -r * 0.5, r * 0.12, r * 1.0);
  g.restore();
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function shadeColor(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex);
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function shadeColor2hex(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function withAlpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
}
