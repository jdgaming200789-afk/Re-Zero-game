import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
  type Texture,
} from 'three';
import { CONSTELLATIONS, layoutConstellation, starKey, type ConstellationDef, type StarDef } from '../../data/constellations';
import { clamp, damp } from '../../core/math/MathUtil';
import { polar } from '../../scene/procedural/RoundHall';

export interface TrialStar {
  key: string;
  def: StarDef;
  constellation: ConstellationDef;
  /** Resting place in the room. */
  home: Vector3;
  sprite: Sprite;
  material: SpriteMaterial;
  base: Color;
  size: number;
  phase: number;
  /** 0..1 extra flare (touched / burning). */
  flare: number;
}

const RING_RADIUS = 12.6;
const DEG = Math.PI / 180;

/**
 * Taygeta's sky within reach: every constellation hangs on its own vertical
 * "page" around the room, stars glowing at arm's height with faint lines
 * between them. The player looks at a star to aim (the camera ray, since
 * belt stars sit a hand's width apart) and touches it with one interactable
 * that follows the aim. What a touch means is the area's business.
 */
export class StarTrial {
  readonly root = new Group();
  readonly stars: TrialStar[] = [];
  /** Moves to the aimed star; the interactable's anchor. */
  readonly pointer = new Object3D();
  aimed: TrialStar | null = null;
  /** 0 hidden (white room) .. 1 fully present. */
  presence = 0;
  targetPresence = 0;
  /** Stars only react to aim while the trial is live. */
  live = false;
  private readonly lines: LineSegments[] = [];
  private readonly lineMat: LineBasicMaterial;
  private readonly glyphMat: MeshBasicMaterial;
  private readonly highlight: Sprite;
  private readonly glow: Texture;
  private readonly ringTex: Texture;
  private time = 0;

  constructor() {
    this.root.name = 'StarTrial';
    this.glow = starTexture();
    this.ringTex = ringTexture();
    this.lineMat = new LineBasicMaterial({ color: new Color(0.55, 0.68, 1.0), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    this.glyphMat = new MeshBasicMaterial({ color: new Color(0.45, 0.58, 1.0), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    for (const c of CONSTELLATIONS) this.buildConstellation(c);
    this.highlight = new Sprite(new SpriteMaterial({ map: this.ringTex, color: new Color(1.4, 1.35, 1.1), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.highlight.scale.setScalar(0.34);
    this.root.add(this.highlight, this.pointer);
  }

  private buildConstellation(c: ConstellationDef): void {
    const a = c.at * DEG;
    const center = polar(RING_RADIUS, a);
    // Plane faces the room's centre; +x is the viewer's right.
    const right = new Vector3(-Math.cos(a), 0, Math.sin(a));
    const layout = layoutConstellation(c);
    const byId = new Map<string, Vector3>();
    for (const s of c.stars) {
      const p = layout.get(s.id)!;
      const home = center.clone().addScaledVector(right, p.x).setY(p.y);
      byId.set(s.id, home);
      const brightness = clamp((3.6 - s.mag) / 3.6, 0.08, 1);
      const base = new Color(...s.color).multiplyScalar(1.1 + brightness * 2.6);
      const material = new SpriteMaterial({ map: this.glow, color: base.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 });
      const sprite = new Sprite(material);
      const size = 0.16 + brightness * 0.3;
      sprite.scale.setScalar(size);
      sprite.position.copy(home);
      sprite.name = `star:${starKey(c, s)}`;
      this.root.add(sprite);
      this.stars.push({ key: starKey(c, s), def: s, constellation: c, home, sprite, material, base, size, phase: Math.random() * 6.28, flare: 0 });
    }
    const pts: number[] = [];
    for (const [x, y] of c.lines) {
      const p = byId.get(x)!;
      const q = byId.get(y)!;
      pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const lines = new LineSegments(geo, this.lineMat);
    this.lines.push(lines);
    this.root.add(lines);
    // A faint circle on the floor where each constellation can be read.
    const glyph = new Mesh(new RingGeometry(1.7, 1.78, 64), this.glyphMat);
    glyph.rotation.x = -Math.PI / 2;
    glyph.position.copy(polar(RING_RADIUS - 1.6, a, 0.015));
    this.root.add(glyph);
  }

  star(key: string): TrialStar | undefined {
    return this.stars.find((s) => s.key === key);
  }

  /** Flare a star (touch feedback); `burn` makes it flicker hot. */
  flareStar(s: TrialStar, amount = 1): void {
    s.flare = Math.max(s.flare, amount);
  }

  update(dt: number, camera: Camera, player: { position: Vector3 } | null): void {
    this.time += dt;
    this.presence = damp(this.presence, this.targetPresence, 0.45, dt);
    if (Math.abs(this.presence - this.targetPresence) < 0.002) this.presence = this.targetPresence;
    const pres = this.presence;
    this.root.visible = pres > 0.001;
    if (!this.root.visible) {
      this.aimed = null;
      return;
    }
    // Aim: the star nearest the centre of the view, within arm's reach.
    let best: TrialStar | null = null;
    if (this.live && player && pres > 0.95) {
      const camPos = camera.getWorldPosition(_cam);
      const fwd = camera.getWorldDirection(_fwd);
      let bestDot = Math.cos(9 * DEG);
      for (const s of this.stars) {
        const dx = s.home.x - player.position.x;
        const dz = s.home.z - player.position.z;
        if (dx * dx + dz * dz > 2.7 * 2.7 || Math.abs(s.home.y - (player.position.y + 1.2)) > 1.7) continue;
        const d = _d.subVectors(s.home, camPos);
        const dot = fwd.dot(d) / Math.max(1e-4, d.length());
        if (dot > bestDot) {
          bestDot = dot;
          best = s;
        }
      }
    }
    this.aimed = best;
    if (best) this.pointer.position.copy(best.home);

    // Stars drift down into place as they appear, then breathe.
    const drop = (1 - pres) * 3.5;
    for (const s of this.stars) {
      s.flare = Math.max(0, s.flare - dt * 0.9);
      const tw = 0.86 + 0.14 * Math.sin(this.time * (1.3 + (s.phase % 1.7)) + s.phase);
      const aim = s === best ? 1.45 : 1;
      s.sprite.position.set(s.home.x, s.home.y + drop + Math.sin(this.time * 0.7 + s.phase) * 0.012, s.home.z);
      s.sprite.scale.setScalar(s.size * aim * tw * (1 + s.flare * 2.2));
      s.material.opacity = pres;
      s.material.color.copy(s.base).multiplyScalar(1 + s.flare * 2.5);
    }
    this.lineMat.opacity = pres * 0.22;
    this.glyphMat.opacity = pres * 0.18;
    const hm = this.highlight.material as SpriteMaterial;
    hm.opacity = damp(hm.opacity, best ? 0.9 : 0, 0.06, dt);
    if (best) this.highlight.position.copy(best.sprite.position);
    this.highlight.scale.setScalar(0.34 + Math.sin(this.time * 4) * 0.02);
  }

  dispose(): void {
    for (const s of this.stars) s.material.dispose();
    for (const l of this.lines) l.geometry.dispose();
    this.root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.lineMat.dispose();
    this.glyphMat.dispose();
    (this.highlight.material as SpriteMaterial).dispose();
    this.glow.dispose();
    this.ringTex.dispose();
    this.root.removeFromParent();
  }
}

const _cam = new Vector3();
const _fwd = new Vector3();
const _d = new Vector3();

/** A soft star: bright pin-point core, wide falloff, faint cross spikes. */
function starTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.08, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [
    [128, 3],
    [3, 128],
  ]) {
    const sg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    sg.addColorStop(0, 'rgba(255,255,255,0.5)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg;
    g.fillRect(64 - w! / 2, 64 - h! / 2, w!, h!);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function ringTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,240,200,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,240,200,0.35)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
