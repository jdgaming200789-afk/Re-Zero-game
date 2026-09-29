import { Effect } from 'postprocessing';
import { Uniform } from 'three';

/** HDR exposure multiplier applied before tone mapping (eye adaptation, flashes). */
export class ExposureEffect extends Effect {
  constructor() {
    super(
      'ExposureEffect',
      /* glsl */ `
      uniform float uExposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        // Clamp below half-float range: one blown-out flash must never turn into
        // Inf/NaN that the blur passes would smear across the whole frame.
        vec3 c = inputColor.rgb * uExposure;
        c = clamp(c, vec3(0.0), vec3(3.0e4));
        outputColor = vec4(c, inputColor.a);
      }`,
      { uniforms: new Map([['uExposure', new Uniform(1)]]) },
    );
  }
  set exposure(v: number) {
    (this.uniforms.get('uExposure') as Uniform<number>).value = v;
  }
  get exposure(): number {
    return (this.uniforms.get('uExposure') as Uniform<number>).value;
  }
}
