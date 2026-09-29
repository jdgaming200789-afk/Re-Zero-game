import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

/**
 * Artistic color grading applied after tone mapping (LDR):
 * lift/gamma/gain, saturation, contrast, temperature/tint and a
 * "drain" term that pulls the image toward a cold desaturated tone
 * (used for Return by Death and moments of dread).
 */
const fragment = /* glsl */ `
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uContrast;
uniform float uTemperature;
uniform float uTint;
uniform float uDrain;
uniform vec3 uDrainColor;
uniform float uFade;
uniform vec3 uFadeColor;

vec3 applyTemperature(vec3 c, float t, float tint) {
  // Simple white-balance: warm pushes red/yellow, cool pushes blue.
  c *= vec3(1.0 + 0.10 * t, 1.0 + 0.02 * t - 0.06 * tint, 1.0 - 0.10 * t);
  return c;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  c = applyTemperature(c, uTemperature, uTint);
  // Lift / gamma / gain (ASC-CDL-like)
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(max(c, vec3(0.0)), 1.0 / max(uGamma, vec3(0.01)));
  // Contrast around mid grey
  c = (c - 0.5) * uContrast + 0.5;
  // Saturation
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  // Drain toward a cold monochrome
  vec3 drained = uDrainColor * (l * 1.15);
  c = mix(c, drained, uDrain);
  // Full-screen fade (to black/white)
  c = mix(c, uFadeColor, uFade);
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

export interface ColorGrade {
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  contrast: number;
  temperature: number;
  tint: number;
}

export const NEUTRAL_GRADE: ColorGrade = {
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  saturation: 1,
  contrast: 1,
  temperature: 0,
  tint: 0,
};

export class ColorGradeEffect extends Effect {
  constructor() {
    super('ColorGradeEffect', fragment, {
      uniforms: new Map<string, Uniform>([
        ['uLift', new Uniform(new Vector3(0, 0, 0))],
        ['uGamma', new Uniform(new Vector3(1, 1, 1))],
        ['uGain', new Uniform(new Vector3(1, 1, 1))],
        ['uSaturation', new Uniform(1)],
        ['uContrast', new Uniform(1)],
        ['uTemperature', new Uniform(0)],
        ['uTint', new Uniform(0)],
        ['uDrain', new Uniform(0)],
        ['uDrainColor', new Uniform(new Vector3(0.62, 0.66, 0.78))],
        ['uFade', new Uniform(0)],
        ['uFadeColor', new Uniform(new Vector3(0, 0, 0))],
      ]),
    });
  }

  private u<T>(name: string): Uniform<T> {
    return this.uniforms.get(name) as Uniform<T>;
  }

  apply(g: ColorGrade): void {
    this.u<Vector3>('uLift').value.fromArray(g.lift);
    this.u<Vector3>('uGamma').value.fromArray(g.gamma);
    this.u<Vector3>('uGain').value.fromArray(g.gain);
    this.u<number>('uSaturation').value = g.saturation;
    this.u<number>('uContrast').value = g.contrast;
    this.u<number>('uTemperature').value = g.temperature;
    this.u<number>('uTint').value = g.tint;
  }

  set drain(v: number) {
    this.u<number>('uDrain').value = v;
  }
  get drain(): number {
    return this.u<number>('uDrain').value;
  }

  set fade(v: number) {
    this.u<number>('uFade').value = v;
  }
  get fade(): number {
    return this.u<number>('uFade').value;
  }

  setFadeColor(r: number, g: number, b: number): void {
    this.u<Vector3>('uFadeColor').value.set(r, g, b);
  }
}

export function lerpGrade(a: ColorGrade, b: ColorGrade, t: number, out: ColorGrade): ColorGrade {
  const l = (x: number, y: number) => x + (y - x) * t;
  out.lift = [l(a.lift[0], b.lift[0]), l(a.lift[1], b.lift[1]), l(a.lift[2], b.lift[2])];
  out.gamma = [l(a.gamma[0], b.gamma[0]), l(a.gamma[1], b.gamma[1]), l(a.gamma[2], b.gamma[2])];
  out.gain = [l(a.gain[0], b.gain[0]), l(a.gain[1], b.gain[1]), l(a.gain[2], b.gain[2])];
  out.saturation = l(a.saturation, b.saturation);
  out.contrast = l(a.contrast, b.contrast);
  out.temperature = l(a.temperature, b.temperature);
  out.tint = l(a.tint, b.tint);
  return out;
}
