import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial, Vector3, type Camera } from 'three';
import type { VfxUpdatable } from './VfxSystem';

const vertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vAlong;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vAlong = uv.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uCamPos;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vAlong;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  vec3 viewDir = normalize(uCamPos - vPosW);
  // Soft edges: faces seen edge-on fade out (reads as a volume, not a cone).
  float edge = pow(abs(dot(normalize(vNormalW), viewDir)), 1.6);
  // Fade at both ends; brightest near the source.
  float ends = smoothstep(0.0, 0.18, vAlong) * smoothstep(1.0, 0.75, vAlong);
  float src = mix(0.55, 1.0, vAlong);
  // Slowly drifting dust inside the beam.
  float d = noise(vPosW * 1.6 + vec3(0.0, uTime * 0.15, uTime * 0.05)) * 0.6 + noise(vPosW * 4.0 - uTime * 0.1) * 0.4;
  float a = edge * ends * src * (0.55 + 0.45 * d) * uIntensity;
  // Nearby: fade so the camera passing through doesn't flash white.
  float camDist = length(uCamPos - vPosW);
  a *= smoothstep(0.4, 2.5, camDist);
  gl_FragColor = vec4(uColor * a, a);
}
`;

/**
 * Fake volumetric light beam (window shafts, moonlight through breaches).
 * A tapered open cylinder with view-dependent soft edges and drifting dust.
 * Oriented from `from` (the aperture) toward `to` (where it lands).
 */
export class LightShaft extends Mesh implements VfxUpdatable {
  scope = '';
  private t = 0;

  constructor(from: Vector3, to: Vector3, radiusTop: number, radiusBottom: number, color = new Color(1, 0.9, 0.75), intensity = 0.12) {
    const length = from.distanceTo(to);
    const geo = new CylinderGeometry(radiusTop, radiusBottom, length, 24, 1, true);
    geo.translate(0, -length / 2, 0);
    const mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: {
        uColor: { value: color },
        uIntensity: { value: intensity },
        uTime: { value: 0 },
        uCamPos: { value: new Vector3() },
      },
    });
    super(geo, mat);
    this.position.copy(from);
    // Cylinder axis is +Y; point it from `from` to `to` (geometry hangs down -Y).
    const dir = new Vector3().subVectors(from, to).normalize();
    this.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    this.renderOrder = 12;
    this.frustumCulled = true;
  }

  setIntensity(v: number): void {
    (this.material as ShaderMaterial).uniforms.uIntensity!.value = v;
  }

  update(dt: number, camera: Camera): void {
    this.t += dt;
    const u = (this.material as ShaderMaterial).uniforms;
    u.uTime!.value = this.t;
    (u.uCamPos!.value as Vector3).copy(camera.position);
  }

  override dispose(): void {
    this.geometry.dispose();
    (this.material as ShaderMaterial).dispose();
  }
}
