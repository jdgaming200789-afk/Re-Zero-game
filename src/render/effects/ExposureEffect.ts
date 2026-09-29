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
        outputColor = vec4(inputColor.rgb * uExposure, inputColor.a);
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
