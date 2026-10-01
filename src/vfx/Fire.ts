import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';
import { noise1D } from '../core/math/MathUtil';
import { ParticleEmitter, ParticlePresets } from './ParticleEmitter';
import type { VfxUpdatable } from './VfxSystem';

const flameVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const flameFragment = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uIntensity;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; }
  return s;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 1.6 + uSeed;
  // Rising turbulence distorts the teardrop.
  float n = fbm(vec2(uv.x * 3.0, uv.y * 2.2 - t * 1.4));
  float n2 = fbm(vec2(uv.x * 6.0 + 3.0, uv.y * 4.0 - t * 2.3));
  float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.55 * uv.y;
  float y = uv.y;
  float width = mix(0.9, 0.05, pow(y, 0.85)) * (0.85 + 0.3 * n2);
  float body = 1.0 - smoothstep(width * 0.55, width, abs(x));
  body *= smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.55, 1.0, y + (n - 0.5) * 0.4));
  float core = (1.0 - smoothstep(0.0, width * 0.55, abs(x))) * (1.0 - smoothstep(0.1, 0.55, y));
  vec3 col = mix(uEdge, uCore, clamp(core * 1.4 + (1.0 - y) * 0.2, 0.0, 1.0));
  float a = clamp(body * (0.6 + 0.6 * n2), 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * uIntensity * a, a);
}
`;

export interface FireOptions {
  scale?: number;
  lightIntensity?: number;
  lightDistance?: number;
  lightColor?: number;
  embers?: boolean;
  /** Stronger, colder, magical flame. */
  color?: 'warm' | 'blue' | 'green';
}

/**
 * A complete fire: two camera-facing procedural flame cards, a flickering
 * point light (the dominant light for nearby surfaces) and rising embers.
 */
export class Fire extends Group implements VfxUpdatable {
  readonly light: PointLight;
  private readonly flames: Mesh[] = [];
  private readonly materials: ShaderMaterial[] = [];
  readonly embers: ParticleEmitter | null;
  private readonly baseIntensity: number;
  private readonly seed = Math.random() * 100;
  scope = '';
  private t = 0;

  constructor(opts: FireOptions = {}) {
    super();
    const scale = opts.scale ?? 1;
    const palette =
      opts.color === 'blue'
        ? { core: new Color(0.8, 0.95, 1.0), edge: new Color(0.15, 0.4, 1.0), light: 0x7fb4ff }
        : opts.color === 'green'
          ? { core: new Color(0.85, 1.0, 0.8), edge: new Color(0.2, 0.8, 0.4), light: 0x8cffb0 }
          : { core: new Color(1.0, 0.85, 0.55), edge: new Color(1.0, 0.32, 0.06), light: 0xff9a4a };
    for (let i = 0; i < 2; i++) {
      const mat = new ShaderMaterial({
        vertexShader: flameVertex,
        fragmentShader: flameFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: this.seed + i * 13.7 },
          uCore: { value: palette.core },
          uEdge: { value: palette.edge },
          uIntensity: { value: 3.2 },
        },
      });
      const m = new Mesh(new PlaneGeometry(0.5 * scale * (i ? 0.75 : 1), 0.9 * scale * (i ? 0.8 : 1)), mat);
      m.position.y = 0.42 * scale * (i ? 0.8 : 1);
      m.renderOrder = 11;
      this.flames.push(m);
      this.materials.push(mat);
      this.add(m);
    }
    this.baseIntensity = opts.lightIntensity ?? 14 * scale;
    this.light = new PointLight(opts.lightColor ?? palette.light, this.baseIntensity, opts.lightDistance ?? 9 * Math.sqrt(scale), 2);
    this.light.position.y = 0.5 * scale;
    // No cube shadows: a point-light shadow redraws the scene six more times
    // a frame, and three's frozen cube maps rendered every lit material
    // black on some GPUs (the "black flash" mid-fight at the camp).
    this.light.castShadow = false;
    this.add(this.light);
    if (opts.embers !== false) {
      this.embers = new ParticleEmitter(ParticlePresets.embers());
      this.embers.anchor.set(0, 0.3 * scale, 0);
      this.add(this.embers);
    } else {
      this.embers = null;
    }
  }

  update(dt: number, camera: Camera): void {
    this.t += dt;
    for (const m of this.materials) m.uniforms.uTime!.value = this.t;
    // Face the camera around the vertical axis only.
    const wp = this.getWorldPosition(_v);
    const angle = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z);
    for (const f of this.flames) f.rotation.y = angle - (this.rotation.y ?? 0);
    // Organic flicker: two noise bands plus rare gutters.
    const n = noise1D(this.t * 7 + this.seed, 5) * 0.12 + noise1D(this.t * 19 + this.seed, 9) * 0.06;
    this.light.intensity = this.baseIntensity * (0.92 + n);
    this.light.position.x = noise1D(this.t * 3 + this.seed, 2) * 0.03;
    this.light.position.z = noise1D(this.t * 3 + this.seed, 3) * 0.03;
    this.embers?.update(dt, camera.position);
  }

  override dispose(): void {
    for (const f of this.flames) f.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.embers?.dispose();
    this.light.dispose();
  }
}

const _v = new Vector3();
