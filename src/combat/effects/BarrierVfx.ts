import { AdditiveBlending, Color, IcosahedronGeometry, Mesh, ShaderMaterial, type Object3D, type Vector3 } from 'three';

/**
 * Fresnel-rim bubble (E·M·M, Beatrice's wards): bright at the silhouette,
 * nearly clear in the middle, rippling while it holds.
 */
export class BarrierVfx {
  readonly mesh: Mesh;
  private t = 0;
  private strength = 0;
  private target = 0;
  private flash = 0;

  constructor(parent: Object3D, color: Color, radius = 1.1) {
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: color }, uStrength: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec3 p = position * (1.0 + 0.015 * sin(uTime * 9.0 + position.y * 6.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uStrength;
        uniform float uFlash;
        uniform float uTime;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float rim = pow(1.0 - abs(dot(vN, vV)), 3.4);
          float bands = 0.5 + 0.5 * sin(uTime * 4.0 + vN.y * 14.0);
          float hex = step(0.92, fract(vN.x * 9.0 + uTime * 0.3)) + step(0.92, fract(vN.y * 9.0 - uTime * 0.2));
          float a = (rim * (0.7 + 0.3 * bands) + hex * 0.05 + 0.012) * uStrength + uFlash * rim;
          gl_FragColor = vec4(uColor * (1.2 + uFlash * 2.0), a);
        }`,
    });
    this.mesh = new Mesh(new IcosahedronGeometry(radius, 3), mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 12;
    parent.add(this.mesh);
  }

  show(on: boolean): void {
    this.target = on ? 1 : 0;
    if (on) this.mesh.visible = true;
  }

  /** Brief brightening when it absorbs a blow. */
  pulse(): void {
    this.flash = 1;
  }

  update(dt: number, at: Vector3): void {
    this.t += dt;
    this.strength += (this.target - this.strength) * Math.min(1, dt * 12);
    this.flash = Math.max(0, this.flash - dt * 4);
    const u = (this.mesh.material as ShaderMaterial).uniforms;
    u.uStrength!.value = this.strength;
    u.uTime!.value = this.t;
    u.uFlash!.value = this.flash;
    this.mesh.position.copy(at);
    if (this.target === 0 && this.strength < 0.02) this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
