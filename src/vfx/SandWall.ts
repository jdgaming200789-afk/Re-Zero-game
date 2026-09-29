import { Color, CylinderGeometry, DoubleSide, Mesh, NormalBlending, ShaderMaterial, type Camera } from 'three';
import type { VfxUpdatable } from './VfxSystem';

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.07 + 13.1; a *= 0.5; }
  return s;
}

void main() {
  vec2 p = vec2(vUv.x * 60.0, vUv.y * 4.0);
  float billow = fbm(p + vec2(uTime * 0.05, -uTime * 0.02));
  float streak = fbm(vec2(p.x * 0.4 + uTime * 0.12, p.y * 3.0));
  // Tall churning front that thins toward the top.
  float top = 0.55 + 0.35 * billow;
  float mask = smoothstep(top, top - 0.35, vUv.y) * smoothstep(0.0, 0.05, vUv.y);
  float density = mask * (0.55 + 0.45 * billow) * (0.8 + 0.4 * streak);
  vec3 col = mix(uColor, uGlow, billow * 0.6 * vUv.y);
  gl_FragColor = vec4(col, density * uOpacity);
}
`;

/**
 * The Sand Time on the horizon: a vast, slowly churning wall of sand
 * around the dunes. A landmark (and a reminder of what the party crossed).
 */
export class SandWall extends Mesh implements VfxUpdatable {
  scope = '';
  private t = 0;

  constructor(radius = 900, height = 260, arcStart = 0, arcLength = Math.PI * 2, color = new Color(0x3a3024), glow = new Color(0x6b5a44)) {
    const geo = new CylinderGeometry(radius, radius, height, 128, 1, true, arcStart, arcLength);
    geo.translate(0, height / 2 - 10, 0);
    const mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: NormalBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: color }, uGlow: { value: glow }, uOpacity: { value: 0.75 } },
    });
    super(geo, mat);
    this.frustumCulled = false;
    this.renderOrder = -500;
  }

  update(dt: number, camera: Camera): void {
    this.t += dt;
    (this.material as ShaderMaterial).uniforms.uTime!.value = this.t;
    this.position.x = camera.position.x;
    this.position.z = camera.position.z;
  }

  override dispose(): void {
    this.geometry.dispose();
    (this.material as ShaderMaterial).dispose();
  }
}
