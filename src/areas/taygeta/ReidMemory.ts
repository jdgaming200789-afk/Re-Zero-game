import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  Euler,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/math/MathUtil';

/**
 * What Reid Astrea's Book of the Dead shows while Subaru lives it: a crimson
 * dusk over a field of swords planted in the ground ("I just hit stuff until
 * it stopped hitting back"), and a dragon too big for the sky crossing it.
 * When the pages start turning on their own, the dusk drains to a bruise and
 * the swords go dark — something else is reading too.
 */
export class ReidMemory {
  readonly root = new Group();
  private readonly swords: InstancedMesh;
  private readonly swordMat: MeshStandardMaterial;
  private readonly dusk: Mesh;
  private readonly duskMat: ShaderMaterial;
  private readonly dragon: Mesh;
  private readonly dragonMat: MeshBasicMaterial;
  private t = 0;
  private dark = 0;
  private darkTarget = 0;

  constructor() {
    this.root.name = 'ReidMemory';
    this.root.visible = false;

    // ---- the field of swords
    this.swordMat = new MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.3, emissive: new Color(0x3a0c06), emissiveIntensity: 0.6 });
    const geo = swordGeometry();
    const N = 56;
    this.swords = new InstancedMesh(geo, this.swordMat, N);
    const rng = new Rng(1337);
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    let placed = 0;
    for (let i = 0; i < 400 && placed < N; i++) {
      const z = -rng.range(3, 46);
      const spread = 3 + -z * 0.55;
      const x = rng.range(-spread, spread);
      // Leave a lane up the middle: the eye travels down it to the horizon.
      if (Math.abs(x) < 1.1 + -z * 0.05) continue;
      const s = rng.range(0.9, 1.35);
      e.set(rng.range(-0.2, 0.2), rng.range(0, Math.PI * 2), rng.range(-0.22, 0.22));
      q.setFromEuler(e);
      m.compose(new Vector3(x, -0.28 * s, z), q, new Vector3(s, s, s));
      this.swords.setMatrixAt(placed++, m);
    }
    this.swords.count = placed;
    this.swords.castShadow = false;
    this.swords.receiveShadow = false;
    this.root.add(this.swords);

    // ---- the dusk: a crimson band along the horizon under the stars
    this.duskMat = new ShaderMaterial({
      vertexShader: DUSK_VERT,
      fragmentShader: DUSK_FRAG,
      uniforms: { uDark: { value: 0 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: BackSide,
      toneMapped: false,
    });
    this.dusk = new Mesh(new SphereGeometry(400, 48, 24), this.duskMat);
    this.dusk.renderOrder = -1;
    this.dusk.frustumCulled = false;
    this.root.add(this.dusk);

    // ---- Volcanica: a silhouette crossing the band, far off
    this.dragonMat = new MeshBasicMaterial({ color: new Color(0x090205), side: DoubleSide, fog: false, transparent: true, opacity: 1 });
    this.dragon = new Mesh(dragonGeometry(), this.dragonMat);
    this.dragon.scale.setScalar(46);
    this.dragon.frustumCulled = false;
    this.root.add(this.dragon);
  }

  /** Start (or stop) living the memory. */
  show(on: boolean): void {
    this.root.visible = on;
    this.t = 0;
    this.dark = this.darkTarget = 0;
    this.apply();
  }

  /** The pages turn on their own: the light goes out of it. */
  devour(): void {
    this.darkTarget = 1;
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    this.t += dt;
    this.dark += (this.darkTarget - this.dark) * Math.min(1, dt * 0.9);
    this.apply();
  }

  private apply(): void {
    const t = this.t;
    this.duskMat.uniforms.uDark!.value = this.dark;
    this.duskMat.uniforms.uTime!.value = t;
    // Left to right across the band, slow wingbeats (a bob and a roll).
    const u = Math.min(1, t / 18);
    const x = -170 + 340 * u;
    this.dragon.position.set(x, 52 + Math.sin(t * 0.9) * 2.5, -185 + Math.sin(u * Math.PI) * 15);
    this.dragon.lookAt(0, 1, 4);
    this.dragon.rotateZ(-Math.PI / 2 + Math.sin(t * 0.9) * 0.05);
    const flap = 1 + Math.sin(t * 1.8) * 0.08;
    this.dragon.scale.set(46 * flap, 46, 46);
    this.dragonMat.opacity = 1 - this.dark * 0.85;
    this.swordMat.emissiveIntensity = 0.6 * (1 - this.dark);
    this.swordMat.color.setScalar(1 - this.dark * 0.6);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.swords.geometry.dispose();
    this.swordMat.dispose();
    this.dusk.geometry.dispose();
    this.duskMat.dispose();
    this.dragon.geometry.dispose();
    this.dragonMat.dispose();
  }
}

/** A plain sword stood point-down: blade, crossguard, grip and pommel (vertex-coloured). */
function swordGeometry(): BufferGeometry {
  const parts: Array<[BufferGeometry, Color]> = [];
  const steel = new Color(0xb8bec8);
  const gold = new Color(0x9a7a3a);
  const grip = new Color(0x3a1410);
  const blade = new BoxGeometry(0.06, 0.95, 0.012);
  blade.translate(0, 0.475, 0);
  parts.push([blade, steel]);
  const fuller = new BoxGeometry(0.016, 0.8, 0.014);
  fuller.translate(0, 0.5, 0);
  parts.push([fuller, new Color(0x8e95a0)]);
  const guard = new BoxGeometry(0.28, 0.035, 0.045);
  guard.translate(0, 0.97, 0);
  parts.push([guard, gold]);
  const g = new CylinderGeometry(0.017, 0.019, 0.2, 8);
  g.translate(0, 1.087, 0);
  parts.push([g, grip]);
  const pommel = new SphereGeometry(0.03, 10, 8);
  pommel.translate(0, 1.2, 0);
  parts.push([pommel, gold]);
  const geos = parts.map(([geo, col]) => {
    const ni = geo.toNonIndexed();
    geo.dispose();
    const n = ni.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
    ni.setAttribute('color', new BufferAttribute(c, 3));
    ni.deleteAttribute('uv');
    return ni;
  });
  const merged = mergeGeometries(geos)!;
  geos.forEach((x) => x.dispose());
  return merged;
}

/** A dragon seen from below, wings spread: head up (+Y), span about 2 units. */
function dragonGeometry(): ShapeGeometry {
  // The right half as a polyline (sampled curves), mirrored for the left.
  const pts: Array<[number, number]> = [];
  const quad = (p0: [number, number], c: [number, number], p1: [number, number], n = 8) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
    }
  };
  const at = (): [number, number] => pts[pts.length - 1]!;
  pts.push([0, 1.22]);
  // Head: snout, cheek, a swept-back horn.
  quad(at(), [0.05, 1.18], [0.075, 1.06], 4);
  pts.push([0.15, 1.13], [0.085, 0.99]);
  // Neck down to the shoulder.
  quad(at(), [0.1, 0.8], [0.065, 0.62], 6);
  quad(at(), [0.08, 0.45], [0.14, 0.38], 4);
  // Leading edge: out to the wrist, then the long last finger to the tip.
  const wrist: [number, number] = [0.6, 0.64];
  quad(at(), [0.36, 0.6], wrist, 8);
  quad(at(), [0.85, 0.7], [1.06, 0.5], 8);
  // Trailing edge: a membrane between each pair of finger bones, sagging
  // in towards the wrist.
  const fingers: Array<[number, number]> = [
    [0.9, 0.06],
    [0.66, -0.12],
    [0.42, -0.18],
    [0.17, -0.3],
  ];
  for (const f of fingers) {
    const p0 = at();
    const mid: [number, number] = [(p0[0] + f[0]) / 2, (p0[1] + f[1]) / 2];
    const c: [number, number] = [mid[0] + (wrist[0] - mid[0]) * 0.32, mid[1] + (wrist[1] - mid[1]) * 0.32];
    quad(p0, c, f, 8);
  }
  // Hind leg, then the long tail to a spade.
  pts.push([0.2, -0.44], [0.12, -0.46]);
  quad(at(), [0.08, -0.7], [0.045, -0.95], 6);
  quad(at(), [0.02, -1.22], [0.03, -1.45], 6);
  pts.push([0.09, -1.5], [0, -1.68]);
  const s = new Shape();
  s.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i]![0], pts[i]![1]);
  for (let i = pts.length - 2; i >= 1; i--) s.lineTo(-pts[i]![0], pts[i]![1]);
  s.closePath();
  return new ShapeGeometry(s);
}

const DUSK_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const DUSK_FRAG = /* glsl */ `
uniform float uDark;
uniform float uTime;
varying vec3 vDir;
void main() {
  float e = vDir.y;
  // A deep band hugging the horizon, a soft bloom of it higher up.
  float band = exp(-max(e + 0.02, 0.0) * 9.0) * step(-0.25, e);
  float haze = exp(-max(e, 0.0) * 2.6) * 0.35;
  vec3 dusk = vec3(1.0, 0.22, 0.08) * band * 1.25 + vec3(0.6, 0.12, 0.08) * haze;
  vec3 bruise = vec3(0.22, 0.05, 0.3) * (band * 0.8 + haze * 0.5);
  // When the pages turn: the light goes, and it shivers as it goes.
  float shiver = 1.0 + uDark * 0.12 * sin(uTime * 23.0 + vDir.x * 40.0);
  vec3 col = mix(dusk, bruise, uDark) * shiver;
  gl_FragColor = vec4(col, 1.0);
}`;
