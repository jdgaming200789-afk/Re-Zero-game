import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PointLight,
  Quaternion,
  Vector3,
} from 'three';

/**
 * The stair that comes down from the sky when someone passes Reid's trial:
 * steps of pale light that appear one after another from far overhead,
 * winding down in a slow helix until the last one touches the floor in
 * front of whoever passed. Only she may climb it.
 */
export class LightStair {
  readonly root = new Group();
  private readonly steps: InstancedMesh;
  private readonly glows: InstancedMesh;
  private readonly poses: Array<{ pos: Vector3; quat: Quaternion }> = [];
  private readonly light: PointLight;
  /** 0..1: how far down the stair has come. */
  private progress = 0;
  private target = 0;
  private speed = 0.2;
  private time = 0;
  private readonly onStep: ((i: number, at: Vector3) => void) | null;
  private lastShown = -1;
  readonly count: number;
  readonly foot = new Vector3();

  constructor(center: Vector3, opts: { top?: number; radius?: number; turns?: number; steps?: number; onStep?: (i: number, at: Vector3) => void } = {}) {
    this.root.name = 'LightStair';
    const top = opts.top ?? 62;
    const radius = opts.radius ?? 4.2;
    const turns = opts.turns ?? 1.6;
    const n = (this.count = opts.steps ?? 54);
    this.onStep = opts.onStep ?? null;
    // Steps run from the top (index 0) down to the floor; the last lands at the front.
    const end = Math.PI / 2; // the foot faces +Z (towards the party)
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const a = end + (1 - u) * turns * Math.PI * 2;
      // Ease the descent so the lowest flight is gentle enough to read as stairs.
      const y = 0.18 + (top - 0.18) * Math.pow(1 - u, 1.35);
      const pos = new Vector3(center.x + Math.cos(a) * radius, y, center.z + Math.sin(a) * radius);
      // Long side radial: a fan of treads round the stair's open core.
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2 - a);
      this.poses.push({ pos, quat });
    }
    this.foot.copy(this.poses[n - 1]!.pos);
    const stepGeo = new BoxGeometry(0.95, 0.08, 2.3);
    const stepMat = new MeshBasicMaterial({ color: new Color(1.6, 1.45, 1.15), transparent: true, opacity: 0.92, toneMapped: false });
    this.steps = new InstancedMesh(stepGeo, stepMat, n);
    this.steps.instanceMatrix.setUsage(DynamicDrawUsage);
    this.steps.frustumCulled = false;
    const glowGeo = new BoxGeometry(1.5, 0.02, 2.9);
    const glowMat = new MeshBasicMaterial({ color: new Color(0.9, 0.75, 0.45), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.glows = new InstancedMesh(glowGeo, glowMat, n);
    this.glows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.glows.frustumCulled = false;
    this.root.add(this.steps, this.glows);
    this.light = new PointLight(0xffe2b0, 0, 16, 2);
    this.root.add(this.light);
    this.apply();
  }

  /** Bring the stair down over `seconds` (or show it at once). */
  descend(seconds: number): void {
    this.target = 1;
    this.speed = seconds > 0 ? 1 / seconds : Infinity;
    if (!Number.isFinite(this.speed)) {
      this.progress = 1;
      this.lastShown = this.count - 1;
      this.apply();
    }
  }

  get done(): boolean {
    return this.progress >= 1;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.progress < this.target) {
      this.progress = Math.min(this.target, this.progress + dt * this.speed);
      const shown = Math.floor(this.progress * (this.count - 1) + 1e-6);
      while (this.lastShown < shown) {
        this.lastShown++;
        this.onStep?.(this.lastShown, this.poses[this.lastShown]!.pos);
      }
    }
    this.apply();
  }

  private apply(): void {
    const n = this.count;
    const front = this.progress * (n - 1);
    for (let i = 0; i < n; i++) {
      const { pos, quat } = this.poses[i]!;
      // Each step swells into place as the descent reaches it, then breathes.
      const k = Math.max(0, Math.min(1, front - i + 1));
      const pop = k <= 0 ? 0 : k < 1 ? k * (1 + 0.35 * Math.sin(k * Math.PI)) : 1 + 0.03 * Math.sin(this.time * 2 + i * 0.4);
      _s.setScalar(Math.max(1e-4, pop));
      _m.compose(pos, quat, _s);
      this.steps.setMatrixAt(i, _m);
      _s.set(Math.max(1e-4, pop), 1, Math.max(1e-4, pop));
      _m.compose(_p.copy(pos).setY(pos.y - 0.06), quat, _s);
      this.glows.setMatrixAt(i, _m);
    }
    this.steps.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
    // The light rides the newest step down, and stays at the foot.
    const head = this.poses[Math.min(n - 1, Math.max(0, Math.floor(front)))]!.pos;
    this.light.position.copy(head).add(_up);
    this.light.intensity = this.progress > 0 ? 24 + 4 * Math.sin(this.time * 3) : 0;
  }

  dispose(): void {
    this.steps.geometry.dispose();
    (this.steps.material as MeshBasicMaterial).dispose();
    this.glows.geometry.dispose();
    (this.glows.material as MeshBasicMaterial).dispose();
    this.light.dispose();
    this.root.removeFromParent();
  }
}

const _m = new Matrix4();
const _s = new Vector3();
const _p = new Vector3();
const _up = new Vector3(0, 1.2, 0);
