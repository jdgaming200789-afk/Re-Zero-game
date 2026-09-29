import { DirectionalLight, Object3D, Vector3, type ColorRepresentation } from 'three';

/**
 * Directional light (sun/moon) whose shadow frustum follows a focus point,
 * so a huge exterior gets crisp shadows where the player actually is. The
 * frustum centre is snapped to shadow-map texels to stop edges crawling as
 * the player moves.
 */
export class FollowShadowLight {
  readonly light: DirectionalLight;
  readonly target = new Object3D();
  private readonly dir: Vector3;
  private readonly half: number;
  private readonly distance: number;

  constructor(color: ColorRepresentation, intensity: number, direction: Vector3, halfExtent = 40, mapSize = 2048, distance = 150) {
    this.light = new DirectionalLight(color, intensity);
    this.dir = direction.clone().normalize();
    this.half = halfExtent;
    this.distance = distance;
    this.light.target = this.target;
    const l = this.light;
    l.castShadow = mapSize > 0;
    l.shadow.mapSize.set(Math.max(mapSize, 512), Math.max(mapSize, 512));
    const cam = l.shadow.camera;
    cam.left = -halfExtent;
    cam.right = halfExtent;
    cam.top = halfExtent;
    cam.bottom = -halfExtent;
    cam.near = 1;
    cam.far = distance * 2.2;
    cam.updateProjectionMatrix();
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.05;
  }

  addTo(parent: Object3D): void {
    parent.add(this.light, this.target);
  }

  update(focus: Vector3): void {
    // Snap to texel size in light space (approximate with world XZ snapping
    // along the light's right/up axes).
    const texel = (this.half * 2) / this.light.shadow.mapSize.x;
    const up = Math.abs(this.dir.y) > 0.99 ? _x.set(1, 0, 0) : _y.set(0, 1, 0);
    const right = _r.crossVectors(up, this.dir).normalize();
    const lup = _u.crossVectors(this.dir, right).normalize();
    const px = Math.round(focus.dot(right) / texel) * texel;
    const py = Math.round(focus.dot(lup) / texel) * texel;
    const pz = focus.dot(this.dir);
    const snapped = _c.copy(right).multiplyScalar(px).addScaledVector(lup, py).addScaledVector(this.dir, pz);
    this.target.position.copy(snapped);
    this.light.position.copy(snapped).addScaledVector(this.dir, this.distance);
    this.target.updateMatrixWorld();
  }
}

const _x = new Vector3();
const _y = new Vector3();
const _r = new Vector3();
const _u = new Vector3();
const _c = new Vector3();
