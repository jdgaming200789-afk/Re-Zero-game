import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { noise1D } from '../core/math/MathUtil';

export type ParticleShape =
  | { type: 'point' }
  | { type: 'sphere'; radius: number }
  | { type: 'box'; size: Vector3 }
  | { type: 'disc'; radius: number };

export interface ParticleConfig {
  maxParticles: number;
  /** Particles per second while emitting. */
  rate: number;
  lifetime: [number, number];
  size: [number, number];
  /** Size multiplier at [birth, end]. */
  sizeOverLife: [number, number];
  colorA: Color;
  colorB: Color;
  /** Peak opacity and fraction of life spent fading in/out. */
  alpha: number;
  fadeIn: number;
  fadeOut: number;
  velocityMin: Vector3;
  velocityMax: Vector3;
  gravity: Vector3;
  drag: number;
  /** Smooth random drift (m/s). */
  turbulence: number;
  wind: Vector3;
  shape: ParticleShape;
  additive: boolean;
  /** 0 round soft sprite .. 1 elongated streak (wind-blown sand). */
  streak: number;
  /** Keep the emission volume centred on the camera (ambient weather/dust). */
  followCamera: boolean;
  /** Particles live in world space (true) or move with the emitter (false). */
  worldSpace: boolean;
  /** Brightness multiplier (HDR, drives bloom). */
  intensity: number;
}

const DEFAULTS: ParticleConfig = {
  maxParticles: 200,
  rate: 20,
  lifetime: [2, 4],
  size: [0.05, 0.1],
  sizeOverLife: [1, 1],
  colorA: new Color(1, 1, 1),
  colorB: new Color(1, 1, 1),
  alpha: 1,
  fadeIn: 0.2,
  fadeOut: 0.4,
  velocityMin: new Vector3(-0.1, 0, -0.1),
  velocityMax: new Vector3(0.1, 0.2, 0.1),
  gravity: new Vector3(0, 0, 0),
  drag: 0,
  turbulence: 0,
  wind: new Vector3(0, 0, 0),
  shape: { type: 'point' },
  additive: true,
  streak: 0,
  followCamera: false,
  worldSpace: true,
  intensity: 1,
};

const vertex = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute vec3 aVel;
uniform float uScale;
uniform float uStreak;
varying vec4 vColor;
varying float vStreak;
varying vec2 vVelDir;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  vColor = aColor;
  vStreak = uStreak;
  vec3 vv = (viewMatrix * vec4(aVel, 0.0)).xyz;
  vVelDir = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(1.0, 0.0);
}
`;

const fragment = /* glsl */ `
uniform float uIntensity;
varying vec4 vColor;
varying float vStreak;
varying vec2 vVelDir;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  if (vStreak > 0.0) {
    // Stretch along screen-space velocity for wind-blown streaks.
    vec2 along = vVelDir;
    vec2 across = vec2(-along.y, along.x);
    p = vec2(dot(p, along) * (1.0 - 0.75 * vStreak), dot(p, across) / (1.0 - 0.6 * vStreak));
  }
  float d = dot(p, p);
  float a = exp(-d * 4.0) * (1.0 - smoothstep(0.7, 1.0, d));
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb * uIntensity, vColor.a * a);
}
`;

/**
 * CPU-simulated, GPU-drawn particle emitter (THREE.Points). Handles a few
 * thousand particles per emitter comfortably; particle counts scale with
 * the effects-quality setting via `densityScale`.
 */
export class ParticleEmitter extends Points {
  readonly config: ParticleConfig;
  emitting = true;
  /** Multiplier from the effects-quality setting. */
  densityScale = 1;
  scope = '';
  private readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly seed: Float32Array;
  private readonly sizeAttr: BufferAttribute;
  private readonly colorAttr: BufferAttribute;
  private readonly velAttr: BufferAttribute;
  private readonly posAttr: BufferAttribute;
  private readonly colors: Float32Array;
  private accumulator = 0;
  private alive = 0;
  private time = 0;
  private readonly origin = new Vector3();

  constructor(config: Partial<ParticleConfig>) {
    const cfg: ParticleConfig = { ...DEFAULTS, ...config };
    const n = cfg.maxParticles;
    const geo = new BufferGeometry();
    const pos = new Float32Array(n * 3);
    const posAttr = new BufferAttribute(pos, 3);
    const sizeAttr = new BufferAttribute(new Float32Array(n), 1);
    const colors = new Float32Array(n * 4);
    const colorAttr = new BufferAttribute(colors, 4);
    const velAttr = new BufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aSize', sizeAttr);
    geo.setAttribute('aColor', colorAttr);
    geo.setAttribute('aVel', velAttr);
    const mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: cfg.additive ? AdditiveBlending : NormalBlending,
      uniforms: {
        uScale: { value: 600 },
        uStreak: { value: cfg.streak },
        uIntensity: { value: cfg.intensity },
      },
    });
    super(geo, mat);
    this.config = cfg;
    this.capacity = n;
    this.pos = pos;
    this.posAttr = posAttr;
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.sizeAttr = sizeAttr;
    this.colorAttr = colorAttr;
    this.velAttr = velAttr;
    this.colors = colors;
    this.frustumCulled = false;
    this.renderOrder = 10;
    geo.setDrawRange(0, 0);
    if (cfg.worldSpace) {
      // Simulated positions are world-space: never apply the scene-graph transform.
      this.matrixAutoUpdate = false;
      this.matrixWorldAutoUpdate = false;
    }
  }

  /** Emission point in the parent's space (use instead of `position` for world-space emitters). */
  readonly anchor = new Vector3();

  /** Pixel scale for size attenuation (set from viewport height and FOV). */
  setViewportScale(heightPx: number, fovDeg: number): void {
    (this.material as ShaderMaterial).uniforms.uScale!.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  setIntensity(v: number): void {
    (this.material as ShaderMaterial).uniforms.uIntensity!.value = v;
  }

  burst(n: number): void {
    for (let i = 0; i < n; i++) this.spawn();
  }

  private spawn(): void {
    if (this.alive >= this.capacity) return;
    const c = this.config;
    const i = this.alive++;
    const o = this.origin;
    let x = 0;
    let y = 0;
    let z = 0;
    const s = c.shape;
    if (s.type === 'sphere') {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = s.radius * Math.cbrt(Math.random());
      const q = Math.sqrt(1 - u * u);
      x = r * q * Math.cos(a);
      y = r * u;
      z = r * q * Math.sin(a);
    } else if (s.type === 'box') {
      x = (Math.random() - 0.5) * s.size.x;
      y = (Math.random() - 0.5) * s.size.y;
      z = (Math.random() - 0.5) * s.size.z;
    } else if (s.type === 'disc') {
      const a = Math.random() * Math.PI * 2;
      const r = s.radius * Math.sqrt(Math.random());
      x = r * Math.cos(a);
      z = r * Math.sin(a);
    }
    this.pos[i * 3] = o.x + x;
    this.pos[i * 3 + 1] = o.y + y;
    this.pos[i * 3 + 2] = o.z + z;
    const vmin = c.velocityMin;
    const vmax = c.velocityMax;
    this.vel[i * 3] = vmin.x + Math.random() * (vmax.x - vmin.x);
    this.vel[i * 3 + 1] = vmin.y + Math.random() * (vmax.y - vmin.y);
    this.vel[i * 3 + 2] = vmin.z + Math.random() * (vmax.z - vmin.z);
    this.age[i] = 0;
    this.life[i] = c.lifetime[0] + Math.random() * (c.lifetime[1] - c.lifetime[0]);
    this.baseSize[i] = c.size[0] + Math.random() * (c.size[1] - c.size[0]);
    this.seed[i] = Math.random() * 100;
    const t = Math.random();
    this.colors[i * 4] = c.colorA.r + (c.colorB.r - c.colorA.r) * t;
    this.colors[i * 4 + 1] = c.colorA.g + (c.colorB.g - c.colorA.g) * t;
    this.colors[i * 4 + 2] = c.colorA.b + (c.colorB.b - c.colorA.b) * t;
    this.colors[i * 4 + 3] = 0;
  }

  private kill(i: number): void {
    const last = --this.alive;
    if (i === last) return;
    // swap-remove
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[last * 3 + k]!;
      this.vel[i * 3 + k] = this.vel[last * 3 + k]!;
    }
    for (let k = 0; k < 4; k++) this.colors[i * 4 + k] = this.colors[last * 4 + k]!;
    this.age[i] = this.age[last]!;
    this.life[i] = this.life[last]!;
    this.baseSize[i] = this.baseSize[last]!;
    this.seed[i] = this.seed[last]!;
  }

  update(dt: number, cameraPos: Vector3): void {
    const c = this.config;
    this.time += dt;
    if (c.followCamera) {
      this.origin.copy(cameraPos);
    } else if (c.worldSpace) {
      // The emitter's anchor is its local position under its parent; the
      // particles themselves are drawn with an identity world matrix.
      this.origin.copy(this.anchor);
      if (this.parent) this.origin.applyMatrix4(this.parent.matrixWorld);
    } else {
      this.origin.set(0, 0, 0);
    }

    if (this.emitting) {
      this.accumulator += dt * c.rate * this.densityScale;
      while (this.accumulator >= 1) {
        this.accumulator -= 1;
        this.spawn();
      }
    }

    const drag = Math.exp(-c.drag * dt);
    const g = c.gravity;
    const w = c.wind;
    const tb = c.turbulence;
    const sizeAttr = this.sizeAttr.array as Float32Array;
    const velAttr = this.velAttr.array as Float32Array;
    for (let i = 0; i < this.alive; i++) {
      this.age[i]! += dt;
      const life = this.life[i]!;
      const age = this.age[i]!;
      if (age >= life) {
        this.kill(i);
        i--;
        continue;
      }
      const i3 = i * 3;
      let vx = this.vel[i3]! * drag + g.x * dt;
      let vy = this.vel[i3 + 1]! * drag + g.y * dt;
      let vz = this.vel[i3 + 2]! * drag + g.z * dt;
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      if (tb > 0) {
        const sd = this.seed[i]!;
        vx += noise1D(this.time * 0.7 + sd, 1) * tb;
        vy += noise1D(this.time * 0.6 + sd, 2) * tb * 0.6;
        vz += noise1D(this.time * 0.7 + sd, 3) * tb;
      }
      vx += w.x;
      vy += w.y;
      vz += w.z;
      this.pos[i3]! += vx * dt;
      this.pos[i3 + 1]! += vy * dt;
      this.pos[i3 + 2]! += vz * dt;
      velAttr[i3] = vx;
      velAttr[i3 + 1] = vy;
      velAttr[i3 + 2] = vz;
      const t = age / life;
      const fade = Math.min(1, t / Math.max(c.fadeIn, 1e-3), (1 - t) / Math.max(c.fadeOut, 1e-3));
      this.colors[i * 4 + 3] = c.alpha * Math.max(0, fade);
      sizeAttr[i] = this.baseSize[i]! * (c.sizeOverLife[0] + (c.sizeOverLife[1] - c.sizeOverLife[0]) * t);
    }
    // Keep follow-camera volumes wrapped around the viewer so ambient
    // particles never "run out" when the player moves.
    if (c.followCamera && c.shape.type === 'box') {
      const hx = c.shape.size.x / 2;
      const hy = c.shape.size.y / 2;
      const hz = c.shape.size.z / 2;
      for (let i = 0; i < this.alive; i++) {
        const i3 = i * 3;
        this.pos[i3] = wrap(this.pos[i3]!, cameraPos.x - hx, cameraPos.x + hx);
        this.pos[i3 + 1] = wrap(this.pos[i3 + 1]!, cameraPos.y - hy, cameraPos.y + hy);
        this.pos[i3 + 2] = wrap(this.pos[i3 + 2]!, cameraPos.z - hz, cameraPos.z + hz);
      }
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.velAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, this.alive);
  }

  get aliveCount(): number {
    return this.alive;
  }

  override dispose(): void {
    this.geometry.dispose();
    (this.material as ShaderMaterial).dispose();
  }
}

function wrap(v: number, min: number, max: number): number {
  const span = max - min;
  if (v < min) return v + span * Math.ceil((min - v) / span);
  if (v > max) return v - span * Math.ceil((v - max) / span);
  return v;
}

/** Ready-made configurations. */
export const ParticlePresets = {
  /** Slow floating dust in still interior air, lit by shafts. */
  dustMotes: (volume: Vector3, count = 400): Partial<ParticleConfig> => ({
    maxParticles: count,
    rate: count / 8,
    lifetime: [6, 10],
    size: [0.012, 0.03],
    colorA: new Color(1.0, 0.92, 0.78),
    colorB: new Color(0.85, 0.85, 1.0),
    alpha: 0.55,
    fadeIn: 0.25,
    fadeOut: 0.35,
    velocityMin: new Vector3(-0.03, -0.02, -0.03),
    velocityMax: new Vector3(0.03, 0.03, 0.03),
    turbulence: 0.05,
    shape: { type: 'box', size: volume },
    additive: true,
    intensity: 1.2,
  }),
  /** Wind-blown sand hissing over the dunes (follows the camera). */
  sandDrift: (wind: Vector3, count = 900): Partial<ParticleConfig> => ({
    maxParticles: count,
    rate: count / 2.2,
    lifetime: [1.6, 2.8],
    size: [0.02, 0.06],
    colorA: new Color(0.85, 0.72, 0.52),
    colorB: new Color(0.6, 0.55, 0.5),
    alpha: 0.45,
    fadeIn: 0.15,
    fadeOut: 0.3,
    velocityMin: new Vector3(-0.3, -0.1, -0.3),
    velocityMax: new Vector3(0.3, 0.35, 0.3),
    wind,
    turbulence: 0.5,
    gravity: new Vector3(0, -0.4, 0),
    shape: { type: 'box', size: new Vector3(36, 3, 36) },
    followCamera: true,
    additive: false,
    streak: 0.7,
    intensity: 0.9,
  }),
  /** Rising sparks from a fire. */
  embers: (): Partial<ParticleConfig> => ({
    maxParticles: 60,
    rate: 14,
    lifetime: [0.8, 2.0],
    size: [0.015, 0.035],
    sizeOverLife: [1, 0.3],
    colorA: new Color(1.0, 0.55, 0.15),
    colorB: new Color(1.0, 0.8, 0.35),
    alpha: 1,
    fadeIn: 0.05,
    fadeOut: 0.5,
    velocityMin: new Vector3(-0.25, 0.6, -0.25),
    velocityMax: new Vector3(0.25, 1.6, 0.25),
    turbulence: 0.6,
    drag: 0.4,
    shape: { type: 'disc', radius: 0.25 },
    additive: true,
    intensity: 4,
  }),
  /** One-shot impact sparks (use `burst`). */
  sparks: (color = new Color(1, 0.8, 0.5)): Partial<ParticleConfig> => ({
    maxParticles: 80,
    rate: 0,
    lifetime: [0.25, 0.6],
    size: [0.02, 0.05],
    sizeOverLife: [1, 0.2],
    colorA: color,
    colorB: color.clone().multiplyScalar(0.7),
    alpha: 1,
    fadeIn: 0.01,
    fadeOut: 0.6,
    velocityMin: new Vector3(-4, -1, -4),
    velocityMax: new Vector3(4, 5, 4),
    gravity: new Vector3(0, -9, 0),
    drag: 1.5,
    shape: { type: 'sphere', radius: 0.1 },
    additive: true,
    streak: 0.6,
    intensity: 5,
  }),
  /** Soft glowing motes (magic, the Green Room spirit, star pillars). */
  motes: (color: Color, radius = 2, count = 80): Partial<ParticleConfig> => ({
    maxParticles: count,
    rate: count / 4,
    lifetime: [2.5, 4.5],
    size: [0.03, 0.08],
    colorA: color,
    colorB: color.clone().lerp(new Color(1, 1, 1), 0.4),
    alpha: 0.9,
    fadeIn: 0.3,
    fadeOut: 0.4,
    velocityMin: new Vector3(-0.08, 0.05, -0.08),
    velocityMax: new Vector3(0.08, 0.3, 0.08),
    turbulence: 0.12,
    shape: { type: 'sphere', radius },
    additive: true,
    intensity: 3,
  }),
};
