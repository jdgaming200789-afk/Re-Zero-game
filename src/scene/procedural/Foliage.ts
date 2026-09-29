import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three';
import { Rng } from '../../core/math/MathUtil';

type Kind = 'blade' | 'leaf' | 'flower';

interface Instance {
  m: Matrix4;
  c: Color;
}

const UP = new Vector3(0, 1, 0);

/**
 * Hand-placed greenery, built from three instanced shapes — a long blade
 * (ferns, stems), a broad leaf (bushes, vines, ivy) and a small five-petal
 * flower — so a whole overgrown room is a handful of draw calls. Leaves sway
 * in a gentle breeze in the vertex shader, the tip moving more than the
 * base; flowers can glow softly (the Green Room).
 *
 * Every shape grows along its local +Y with its face towards +Z; the
 * generators below only choose where each one sits and which way it points.
 */
export class Foliage {
  readonly root = new Group();
  private readonly items: Record<Kind, Instance[]> = { blade: [], leaf: [], flower: [] };
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly uniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uGlow: { value: 0 } };
  private readonly rng: Rng;

  constructor(seed = 7, opts: { wind?: number; flowerGlow?: number } = {}) {
    this.rng = new Rng(seed);
    this.uniforms.uWind.value = opts.wind ?? 1;
    this.uniforms.uGlow.value = opts.flowerGlow ?? 0;
    this.root.name = 'Foliage';
  }

  get count(): number {
    return this.items.blade.length + this.items.leaf.length + this.items.flower.length;
  }

  /** Add one shape: grows along `dir`, face turned towards `normalHint`. */
  add(kind: Kind, at: Vector3, dir: Vector3, length: number, width: number, color: Color, normalHint: Vector3 = UP): void {
    const y = _y.copy(dir).normalize();
    const x = _x.crossVectors(y, normalHint);
    if (x.lengthSq() < 1e-6) x.crossVectors(y, Math.abs(y.x) < 0.9 ? _ax : _az);
    x.normalize();
    const z = _z.crossVectors(x, y).normalize();
    const m = new Matrix4().makeBasis(x.multiplyScalar(width), y.multiplyScalar(length), z.multiplyScalar(width));
    m.setPosition(at);
    this.items[kind].push({ m, c: color.clone() });
  }

  private jitter(base: Color, hue = 0.03, light = 0.08): Color {
    const c = base.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return c.setHSL((hsl.h + this.rng.range(-hue, hue) + 1) % 1, hsl.s, Math.max(0, Math.min(1, hsl.l + this.rng.range(-light, light))));
  }

  /** A fern: long fronds arching out of a centre and drooping at the tips. */
  fern(center: Vector3, size = 1, color = new Color(0x3f8a45), fronds = 14): this {
    const r = this.rng;
    for (let i = 0; i < fronds; i++) {
      const az = (i / fronds) * Math.PI * 2 + r.range(-0.2, 0.2);
      const el = r.range(0.35, 1.05);
      const d = new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      this.add('blade', center, d, size * r.range(0.65, 1.05), size * r.range(0.16, 0.22), this.jitter(color));
    }
    return this;
  }

  /** A rounded bush: leaves scattered over a squashed dome. */
  bush(center: Vector3, radius = 0.6, color = new Color(0x3d7d3c), density = 1): this {
    const r = this.rng;
    const n = Math.round(radius * radius * 70 * density) + 8;
    for (let i = 0; i < n; i++) {
      const u = r.next() * 2 - 1;
      const t = r.range(0, Math.PI * 2);
      const s = Math.sqrt(1 - u * u);
      const nrm = new Vector3(s * Math.cos(t), Math.abs(u) * 0.9 + 0.1, s * Math.sin(t)).normalize();
      const p = center.clone().addScaledVector(nrm, radius * r.range(0.55, 1)).setY(center.y + nrm.y * radius * 0.8 * r.range(0.55, 1));
      const d = nrm.clone().add(new Vector3(r.range(-0.6, 0.6), r.range(0, 0.6), r.range(-0.6, 0.6))).normalize();
      const size = radius * r.range(0.24, 0.36);
      this.add('leaf', p, d, size, size * 0.62, this.jitter(color), nrm);
    }
    return this;
  }

  /** A strand hanging from `top`: small leaves down a gently swinging line. */
  vine(top: Vector3, length = 2.4, color = new Color(0x3b7a3f), leafSize = 0.14): this {
    const r = this.rng;
    const steps = Math.round(length / 0.09);
    const phase = r.range(0, 6.28);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const p = top.clone().add(new Vector3(Math.sin(t * 5 + phase) * 0.06, -t * length, Math.cos(t * 4 + phase) * 0.05));
      const az = r.range(0, Math.PI * 2);
      const d = new Vector3(Math.sin(az), r.range(-0.9, 0.1), Math.cos(az)).normalize();
      const s = leafSize * r.range(0.7, 1.15) * (1 - t * 0.35);
      this.add('leaf', p, d, s, s * 0.7, this.jitter(color), new Vector3(Math.sin(az), 0.3, Math.cos(az)));
    }
    return this;
  }

  /** Ivy flat against a wall (`normal` points out of the wall). */
  ivy(center: Vector3, normal: Vector3, width: number, height: number, color = new Color(0x2f6a36), density = 1): this {
    const r = this.rng;
    const n = normal.clone().normalize();
    const side = new Vector3().crossVectors(UP, n).normalize();
    const count = Math.round(width * height * 40 * density);
    for (let i = 0; i < count; i++) {
      // Denser towards the bottom and middle: growth that climbed up.
      const v = Math.pow(r.next(), 1.4);
      const u = r.gaussian(0, 0.33);
      if (Math.abs(u) > 0.5) continue;
      const p = center
        .clone()
        .addScaledVector(side, u * width)
        .addScaledVector(UP, (v - 0.5) * height)
        .addScaledVector(n, r.range(0.02, 0.12));
      const a = r.range(-2.4, 2.4);
      const d = new Vector3().addScaledVector(side, Math.sin(a)).addScaledVector(UP, -Math.cos(a) * 0.8).addScaledVector(n, 0.35).normalize();
      const s = r.range(0.1, 0.17);
      this.add('leaf', p, d, s, s * 0.85, this.jitter(color, 0.04, 0.1), n);
    }
    return this;
  }

  /** A patch of flowers on stems over the ground at `center`. */
  flowers(center: Vector3, radius: number, count: number, colors: Color[], stem = new Color(0x4a8a44), height = 0.35): this {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.next()) * radius;
      const base = center.clone().add(new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
      const h = height * r.range(0.6, 1.2);
      const lean = new Vector3(r.range(-0.25, 0.25), 1, r.range(-0.25, 0.25)).normalize();
      this.add('blade', base, lean, h, 0.05, this.jitter(stem));
      const head = base.clone().addScaledVector(lean, h);
      const face = lean.clone().add(new Vector3(r.range(-0.5, 0.5), 0.6, r.range(-0.5, 0.5))).normalize();
      // The flower's local +Z is its face; any in-plane direction will do for +Y.
      const inPlane = new Vector3().crossVectors(face, Math.abs(face.y) < 0.9 ? UP : _ax).normalize();
      const s = r.range(0.07, 0.11);
      this.add('flower', head, inPlane, s, s, this.jitter(r.pick(colors), 0.02, 0.06), face);
    }
    return this;
  }

  /** Grass-like tufts (moss edges, planter rims). */
  tuft(center: Vector3, radius: number, blades: number, color = new Color(0x4d8f45), height = 0.3): this {
    const r = this.rng;
    for (let i = 0; i < blades; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.next()) * radius;
      const p = center.clone().add(new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
      const dir = new Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize();
      this.add('blade', p, dir, height * r.range(0.6, 1.2), 0.06, this.jitter(color), new Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    return this;
  }

  /** Build the instanced meshes (call once after adding everything). */
  build(): Group {
    const geos: Record<Kind, BufferGeometry> = { blade: bladeGeometry(), leaf: leafGeometry(), flower: flowerGeometry() };
    for (const kind of ['blade', 'leaf', 'flower'] as Kind[]) {
      const list = this.items[kind];
      if (!list.length) {
        geos[kind].dispose();
        continue;
      }
      const mat = this.material(kind);
      const mesh = new InstancedMesh(geos[kind], mat, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = kind !== 'flower';
      mesh.receiveShadow = true;
      mesh.name = `Foliage_${kind}`;
      this.root.add(mesh);
    }
    for (const k of Object.keys(this.items) as Kind[]) this.items[k] = [];
    return this.root;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof InstancedMesh) {
        o.geometry.dispose();
        o.dispose();
      }
    });
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }

  private material(kind: Kind): Material {
    const mat = new MeshStandardMaterial({
      color: 0xffffff,
      side: DoubleSide,
      roughness: kind === 'flower' ? 0.55 : 0.7,
      metalness: 0,
      vertexColors: kind === 'flower',
    });
    const u = this.uniforms;
    const glow = kind === 'flower';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uWind = u.uWind;
      shader.uniforms.uGlow = u.uGlow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            vec3 root = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float ph = root.x * 1.7 + root.z * 1.3 + root.y * 0.7;
            float h = clamp(position.y, 0.0, 1.0);
            float bend = h * h * uWind;
            transformed.x += (sin(uTime * 1.35 + ph) * 0.12 + sin(uTime * 3.1 + ph * 2.3) * 0.03) * bend;
            transformed.z += cos(uTime * 1.05 + ph * 1.3) * 0.09 * bend;
          }`,
        );
      if (glow) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uGlow;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\ntotalEmissiveRadiance += vColor.rgb * uGlow;\n#endif');
      }
    };
    mat.customProgramCacheKey = () => `foliage-${kind}`;
    this.materials.push(mat);
    return mat;
  }
}

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _ax = new Vector3(1, 0, 0);
const _az = new Vector3(0, 0, 1);

/** Long, narrow, tapering blade that arches backwards (fern frond, stem). */
function bladeGeometry(): BufferGeometry {
  const seg = 7;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) * (1 - t * 0.55);
    const z = -0.45 * t * t;
    // Three verts across (left edge, raised midrib, right edge).
    pos.push(-w, t, z - w * 0.2, 0, t, z + 0.02, w, t, z - w * 0.2);
    if (i < seg) {
      const a = i * 3;
      const b = a + 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  return finish(pos, idx);
}

/** Broad ovate leaf with a slight fold along the midrib. */
function leafGeometry(): BufferGeometry {
  const seg = 5;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = 0.5 * Math.pow(Math.sin(Math.PI * t), 0.8) * (1 - t * 0.25) + (i === 0 ? 0.05 : 0);
    const z = -0.18 * t * t;
    pos.push(-w, t, z - w * 0.25, 0, t, z, w, t, z - w * 0.25);
    if (i < seg) {
      const a = i * 3;
      const b = a + 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  return finish(pos, idx);
}

/** Five rounded petals around a warm centre (vertex colours), facing +Z. */
function flowerGeometry(): BufferGeometry {
  const pos: number[] = [0, 0, 0.02];
  const col: number[] = [1, 0.86, 0.45];
  const idx: number[] = [];
  const ring = 30;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const petal = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos((a * 5) / 2)), 0.6);
    pos.push(Math.cos(a) * 0.5 * petal, Math.sin(a) * 0.5 * petal, -0.04 * petal);
    col.push(1, 1, 1);
    idx.push(0, 1 + i, 1 + ((i + 1) % ring));
  }
  const g = finish(pos, idx);
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  return g;
}

function finish(pos: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
