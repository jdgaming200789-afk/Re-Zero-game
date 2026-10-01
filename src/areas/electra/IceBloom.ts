import { CanvasTexture, CircleGeometry, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { Rng } from '../../core/math/MathUtil';

/**
 * Emilia's ice in Reid's trial: a sheet of frost races out across the
 * floor from her, and a crown of crystal shards bursts up round his feet —
 * low enough to see the sandals they've frozen in, and open on the side the
 * camera watches from.
 */
export class IceBloom {
  readonly root = new Group();
  private readonly sheet: Mesh;
  private readonly sheetMat: MeshStandardMaterial;
  private readonly shardMat: MeshStandardMaterial;
  private readonly shards: Array<{ mesh: Mesh; h: number; delay: number; scale: Vector3 }> = [];
  private readonly texture: CanvasTexture;
  private t = 0;
  private clear = -1;
  /** Radius the frost sheet runs out to (m). */
  private readonly reach = 8.5;

  constructor(
    /** Where the frost starts (between her and him). */
    origin: Vector3,
    /** His feet. */
    feet: Vector3,
    /** Leave the crown open towards this point (the camera on his feet). */
    openTowards: Vector3 | null,
  ) {
    this.root.name = 'IceBloom';
    this.texture = frostTexture();
    this.sheetMat = new MeshStandardMaterial({
      map: this.texture,
      transparent: true,
      roughness: 0.08,
      metalness: 0.05,
      emissive: 0x3a6aa8,
      emissiveMap: this.texture,
      emissiveIntensity: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.sheet = new Mesh(new CircleGeometry(1, 72), this.sheetMat);
    this.sheet.rotation.x = -Math.PI / 2;
    this.sheet.position.copy(origin).setY(origin.y + 0.012);
    this.sheet.scale.setScalar(0.01);
    this.sheet.receiveShadow = true;
    this.sheet.renderOrder = 1;
    this.root.add(this.sheet);

    this.shardMat = new MeshStandardMaterial({
      color: 0xcfe9ff,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.86,
      emissive: 0x3d7cc9,
      emissiveIntensity: 0.55,
      flatShading: true,
    });
    const rng = new Rng(31);
    const gap = openTowards ? Math.atan2(openTowards.z - feet.z, openTowards.x - feet.x) : null;
    const geo = new OctahedronGeometry(1, 0);
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rng.range(-0.12, 0.12);
      if (gap !== null && Math.abs(angleDiff(a, gap)) < 0.62) continue;
      const big = i % 3 === 0;
      const h = big ? rng.range(0.5, 0.78) : rng.range(0.22, 0.45);
      const w = h * rng.range(0.22, 0.3);
      const r = big ? rng.range(0.62, 0.85) : rng.range(0.42, 0.7);
      const m = new Mesh(geo, this.shardMat);
      m.position.set(feet.x + Math.cos(a) * r, feet.y - h, feet.z + Math.sin(a) * r);
      // Leaning out from his feet, each one turned its own way.
      const out = new Vector3(Math.cos(a), 0, Math.sin(a));
      const axis = new Vector3().crossVectors(up, out).normalize();
      m.quaternion.setFromAxisAngle(axis, rng.range(0.2, 0.55)).multiply(new Quaternion().setFromAxisAngle(up, rng.range(0, Math.PI)));
      const scale = new Vector3(w, h, w * rng.range(0.7, 1));
      m.scale.copy(scale).multiplyScalar(0.01);
      m.castShadow = true;
      m.userData.base = m.position.y;
      this.root.add(m);
      this.shards.push({ mesh: m, h, delay: 0.45 + (r - 0.42) * 0.6 + rng.range(0, 0.35), scale });
    }
  }

  /** Start melting (it fades out over a couple of seconds). */
  thaw(): void {
    if (this.clear < 0) this.clear = 0;
  }

  get gone(): boolean {
    return this.clear >= 2.5;
  }

  /** Advance; `glint` is called for frost sparkle along the advancing edge. */
  update(dt: number, glint: (at: Vector3) => void): void {
    this.t += dt;
    const grow = Math.min(1, this.t / 1.3);
    const r = 0.01 + this.reach * (1 - Math.pow(1 - grow, 3));
    this.sheet.scale.setScalar(r);
    if (grow < 1 && Math.floor(this.t * 12) !== Math.floor((this.t - dt) * 12)) {
      const a = Math.random() * Math.PI * 2;
      const o = this.sheet.position;
      glint(_v.set(o.x + Math.cos(a) * r * 0.95, o.y + 0.1, o.z + Math.sin(a) * r * 0.95));
    }
    for (const s of this.shards) {
      const k = Math.max(0, Math.min(1, (this.t - s.delay) / 0.22));
      // Burst up with a little overshoot, then settle.
      const e = k <= 0 ? 0 : 1 + 0.18 * Math.sin(Math.min(1, k) * Math.PI) * (1 - k * 0.5);
      s.mesh.scale.copy(s.scale).multiplyScalar(Math.max(0.01, e * k));
      s.mesh.position.y = (s.mesh.userData.base as number) + s.h * 0.95 * k;
    }
    if (this.clear >= 0) {
      this.clear += dt;
      const fade = Math.max(0, 1 - this.clear / 2.5);
      this.sheetMat.opacity = fade;
      this.shardMat.opacity = 0.86 * fade;
      for (const s of this.shards) s.mesh.position.y -= dt * 0.08;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.sheet.geometry.dispose();
    this.shards[0]?.mesh.geometry.dispose();
    this.sheetMat.dispose();
    this.shardMat.dispose();
    this.texture.dispose();
  }
}

const _v = new Vector3();

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Hoarfrost seen from above: a ragged-edged sheet, denser at the heart,
 * shot through with feathered crystal veins that branch as they run out.
 */
function frostTexture(): CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rng = new Rng(77);
  const cx = S / 2;
  // The sheet: an irregular edge, fading towards it.
  const edge: number[] = [];
  for (let i = 0; i < 96; i++) edge.push(0.86 + rng.range(-0.06, 0.08) + 0.04 * Math.sin(i * 0.7));
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, 'rgba(232,244,255,0.88)');
  grad.addColorStop(0.55, 'rgba(214,236,255,0.72)');
  grad.addColorStop(0.85, 'rgba(200,228,255,0.38)');
  grad.addColorStop(1, 'rgba(200,228,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = edge[i % 96]! * cx;
    if (i === 0) g.moveTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    else g.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  // Feathered veins running out from the heart, branching.
  const vein = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let px = x;
    let py = y;
    const steps = Math.max(3, Math.floor(len / 9));
    g.lineCap = 'round';
    for (let s = 0; s < steps; s++) {
      a += rng.range(-0.18, 0.18);
      const nx = px + Math.cos(a) * (len / steps);
      const ny = py + Math.sin(a) * (len / steps);
      const fade = 1 - s / steps;
      g.strokeStyle = `rgba(255,255,255,${(0.35 + 0.45 * fade).toFixed(3)})`;
      g.lineWidth = Math.max(0.6, w * fade);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(nx, ny);
      g.stroke();
      // Feathers: short barbs to either side.
      if (s % 2 === 0) {
        for (const side of [-1, 1]) {
          const ba = a + side * rng.range(0.6, 1.0);
          const bl = rng.range(3, 9) * fade + 1;
          g.lineWidth = Math.max(0.5, w * 0.45 * fade);
          g.beginPath();
          g.moveTo(nx, ny);
          g.lineTo(nx + Math.cos(ba) * bl, ny + Math.sin(ba) * bl);
          g.stroke();
        }
      }
      if (depth > 0 && rng.next() < 0.18) vein(nx, ny, a + (rng.next() < 0.5 ? -1 : 1) * rng.range(0.4, 0.8), len * fade * 0.55, w * 0.7, depth - 1);
      px = nx;
      py = ny;
    }
  };
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const start = rng.range(4, 30);
    vein(cx + Math.cos(a) * start, cx + Math.sin(a) * start, a, cx * rng.range(0.55, 0.86), rng.range(1.6, 2.8), 2);
  }
  // Glints.
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * cx * 0.85;
    g.fillStyle = `rgba(255,255,255,${rng.range(0.4, 0.95).toFixed(3)})`;
    g.fillRect(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 1.5, 1.5);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
