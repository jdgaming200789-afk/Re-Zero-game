import {
  BackSide,
  Color,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Uniform,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from 'three';

export interface NightSkyParams {
  zenith: Color;
  horizon: Color;
  groundGlow: Color;
  moonDir: Vector3;
  moonColor: Color;
  moonSize: number;
  starBrightness: number;
  milkyWay: number;
  /** Direction of the hand-placed Pleiades cluster. */
  clusterDir: Vector3;
}

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}
`;

const fragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGroundGlow;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonSize;
uniform float uStars;
uniform float uMilky;
uniform vec3 uClusterDir;
uniform float uTime;
uniform float uEnvOnly;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise3(p); p *= 2.03; a *= 0.5; }
  return s;
}

// One layer of stars: a jittered point per 3D grid cell on the view sphere.
vec3 starLayer(vec3 dir, float scale, float density, float sharp) {
  vec3 p = dir * scale;
  vec3 cell = floor(p);
  vec3 r = hash33(cell);
  if (r.x > density) return vec3(0.0);
  vec3 starPos = cell + 0.15 + 0.7 * hash33(cell + 17.0);
  float d = length(p - starPos);
  float b = pow(max(0.0, 1.0 - d * sharp), 6.0);
  float temp = r.y;
  vec3 col = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), smoothstep(0.55, 1.0, temp));
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + r.z * 3.0) + r.x * 40.0);
  return col * b * (0.35 + 1.4 * r.z * r.z) * tw;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  // Sky gradient with a warm-sand glow at the horizon (desert night).
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  col += uGroundGlow * pow(1.0 - clamp(abs(h), 0.0, 1.0), 8.0);
  if (h < 0.0) col = mix(uHorizon, uGroundGlow * 0.4, clamp(-h * 4.0, 0.0, 1.0));

  // Moon
  float md = dot(dir, normalize(uMoonDir));
  float disc = smoothstep(cos(uMoonSize), cos(uMoonSize * 0.92), md);
  float halo = pow(max(md, 0.0), 900.0) * 0.8 + pow(max(md, 0.0), 90.0) * 0.12 + pow(max(md, 0.0), 14.0) * 0.015;
  col += uMoonColor * halo;

  if (uEnvOnly < 0.5 && h > -0.02) {
    float fade = smoothstep(-0.02, 0.18, h);
    // Milky Way: a noisy band around a tilted great circle.
    vec3 bandN = normalize(vec3(0.35, 0.5, -0.8));
    float band = 1.0 - abs(dot(dir, bandN));
    float mw = pow(band, 10.0) * (0.35 + 0.9 * fbm3(dir * 6.0)) * (0.6 + 0.4 * fbm3(dir * 22.0));
    col += vec3(0.55, 0.6, 0.85) * mw * uMilky * 0.22 * fade;
    float dust = fbm3(dir * 9.0 + 3.0);
    col *= 1.0 - 0.25 * smoothstep(0.55, 0.8, dust) * pow(band, 8.0);

    vec3 stars = starLayer(dir, 90.0, 0.12, 3.2) * 1.3 + starLayer(dir, 220.0, 0.3, 4.5) * 0.8 + starLayer(dir, 520.0, 0.5, 5.5) * (0.3 + mw * 3.0);
    // The Pleiades: a tight cluster of bright blue-white stars.
    float cd = dot(dir, normalize(uClusterDir));
    if (cd > 0.995) {
      vec3 local = (dir - normalize(uClusterDir)) * 300.0;
      for (int i = 0; i < 7; i++) {
        vec3 o = (hash33(vec3(float(i) * 7.1, 3.3, 9.9)) - 0.5) * 7.0;
        float d = length(local - o);
        stars += vec3(0.75, 0.85, 1.0) * pow(max(0.0, 1.0 - d * 0.9), 4.0) * 2.2;
      }
      stars += vec3(0.4, 0.5, 0.9) * pow(max(0.0, (cd - 0.995) / 0.005), 2.0) * 0.015;
    }
    col += stars * uStars * fade * (1.0 - disc);
    col = mix(col, uMoonColor * 1.6, disc);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Procedural desert night sky. Also renders a star-less copy into a PMREM
 * environment map so materials reflect the same sky.
 */
export class NightSky {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(params: Partial<NightSkyParams> = {}, radius = 1000) {
    const p: NightSkyParams = {
      zenith: new Color(0x02040c),
      horizon: new Color(0x1b2640),
      groundGlow: new Color(0x3a2c24),
      moonDir: new Vector3(-0.35, 0.55, -0.6),
      moonColor: new Color(0xdfe8ff),
      moonSize: 0.03,
      starBrightness: 2.4,
      milkyWay: 1,
      clusterDir: new Vector3(0.15, 0.85, -0.5),
      ...params,
    };
    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: new Uniform(p.zenith),
        uHorizon: new Uniform(p.horizon),
        uGroundGlow: new Uniform(p.groundGlow),
        uMoonDir: new Uniform(p.moonDir.clone().normalize()),
        uMoonColor: new Uniform(p.moonColor),
        uMoonSize: new Uniform(p.moonSize),
        uStars: new Uniform(p.starBrightness),
        uMilky: new Uniform(p.milkyWay),
        uClusterDir: new Uniform(p.clusterDir.clone().normalize()),
        uTime: new Uniform(0),
        uEnvOnly: new Uniform(0),
      },
    });
    this.mesh = new Mesh(new SphereGeometry(radius, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'NightSky';
  }

  get moonDirection(): Vector3 {
    return (this.material.uniforms.uMoonDir!.value as Vector3).clone();
  }

  update(elapsed: number, cameraPos: Vector3): void {
    this.material.uniforms.uTime!.value = elapsed;
    this.mesh.position.copy(cameraPos);
  }

  /** Environment map (no stars) for image-based lighting. */
  buildEnvironment(renderer: WebGLRenderer): Texture {
    const scene = new Scene();
    const envMat = this.material.clone();
    envMat.uniforms.uEnvOnly!.value = 1;
    // Brighten so night IBL isn't pure black (reads as moonlit bounce).
    (envMat.uniforms.uHorizon!.value as Color).multiplyScalar(2.2);
    (envMat.uniforms.uZenith!.value as Color).multiplyScalar(3.0);
    scene.add(new Mesh(new SphereGeometry(10, 32, 16), envMat));
    const pmrem = new PMREMGenerator(renderer);
    const tex = pmrem.fromScene(scene, 0).texture;
    pmrem.dispose();
    envMat.dispose();
    return tex;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
