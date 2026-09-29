import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Color, Matrix4, Uniform, Vector3, type PerspectiveCamera } from 'three';

/**
 * Screen-space atmospheric fog: exponential distance fog that thickens
 * toward the ground (height falloff), with forward in-scattering around a
 * light direction (moon/sun glow through haze). Reconstructs world
 * position from the depth buffer so it applies uniformly to every object,
 * including instanced and custom-shaded geometry. The sky (far plane)
 * receives only a horizon haze band.
 */
const fragment = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uGlowColor;
uniform vec3 uLightDir;
uniform float uDensity;
uniform float uHeightFalloff;
uniform float uBaseHeight;
uniform float uGlowPower;
uniform float uSkyHaze;
uniform float uMaxOpacity;
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform vec3 uCameraPos;

vec3 worldFromDepth(vec2 uv, float depth) {
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInvProjection * ndc;
  view /= view.w;
  return (uCameraWorld * view).xyz;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec3 world = worldFromDepth(uv, depth);
  vec3 ray = world - uCameraPos;
  float dist = length(ray);
  vec3 dir = ray / max(dist, 1e-4);
  bool sky = depth >= 0.99999;

  // Height-integrated exponential fog along the view ray (analytic).
  float h0 = uCameraPos.y - uBaseHeight;
  float k = uHeightFalloff;
  float dy = dir.y * dist;
  float integral;
  if (abs(dy) > 1e-3) {
    integral = exp(-k * h0) * (1.0 - exp(-k * dy)) / (k * dir.y);
  } else {
    integral = exp(-k * h0) * dist;
  }
  float amount = 1.0 - exp(-uDensity * max(integral, 0.0));

  if (sky) {
    // Horizon haze only.
    amount = uSkyHaze * pow(1.0 - clamp(abs(dir.y) * 2.2, 0.0, 1.0), 3.0);
  }
  amount = clamp(amount, 0.0, uMaxOpacity);

  float glow = pow(max(dot(dir, uLightDir), 0.0), uGlowPower);
  vec3 fogCol = uFogColor + uGlowColor * glow;
  outputColor = vec4(mix(inputColor.rgb, fogCol, amount), inputColor.a);
}
`;

export interface HeightFogParams {
  color: Color;
  glowColor: Color;
  lightDir: Vector3;
  density: number;
  heightFalloff: number;
  baseHeight: number;
  glowPower: number;
  skyHaze: number;
  maxOpacity: number;
}

export class HeightFogEffect extends Effect {
  constructor(private readonly camera: PerspectiveCamera) {
    super('HeightFogEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uFogColor', new Uniform(new Color(0.1, 0.12, 0.18))],
        ['uGlowColor', new Uniform(new Color(0, 0, 0))],
        ['uLightDir', new Uniform(new Vector3(0, 1, 0))],
        ['uDensity', new Uniform(0)],
        ['uHeightFalloff', new Uniform(0.08)],
        ['uBaseHeight', new Uniform(0)],
        ['uGlowPower', new Uniform(8)],
        ['uSkyHaze', new Uniform(0)],
        ['uMaxOpacity', new Uniform(1)],
        ['uInvProjection', new Uniform(new Matrix4())],
        ['uCameraWorld', new Uniform(new Matrix4())],
        ['uCameraPos', new Uniform(new Vector3())],
      ]),
    });
  }

  private u<T>(n: string): Uniform<T> {
    return this.uniforms.get(n) as Uniform<T>;
  }

  apply(p: Partial<HeightFogParams>): void {
    if (p.color) this.u<Color>('uFogColor').value.copy(p.color);
    if (p.glowColor) this.u<Color>('uGlowColor').value.copy(p.glowColor);
    if (p.lightDir) this.u<Vector3>('uLightDir').value.copy(p.lightDir).normalize();
    if (p.density !== undefined) this.u<number>('uDensity').value = p.density;
    if (p.heightFalloff !== undefined) this.u<number>('uHeightFalloff').value = Math.max(1e-4, p.heightFalloff);
    if (p.baseHeight !== undefined) this.u<number>('uBaseHeight').value = p.baseHeight;
    if (p.glowPower !== undefined) this.u<number>('uGlowPower').value = p.glowPower;
    if (p.skyHaze !== undefined) this.u<number>('uSkyHaze').value = p.skyHaze;
    if (p.maxOpacity !== undefined) this.u<number>('uMaxOpacity').value = p.maxOpacity;
  }

  get density(): number {
    return this.u<number>('uDensity').value;
  }
  set density(v: number) {
    this.u<number>('uDensity').value = v;
  }

  override update(): void {
    this.camera.updateMatrixWorld();
    this.u<Matrix4>('uInvProjection').value.copy(this.camera.projectionMatrixInverse);
    this.u<Matrix4>('uCameraWorld').value.copy(this.camera.matrixWorld);
    this.u<Vector3>('uCameraPos').value.setFromMatrixPosition(this.camera.matrixWorld);
  }
}
