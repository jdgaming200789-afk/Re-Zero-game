import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';

/**
 * The stair that comes down from the sky when someone passes Reid's trial:
 * treads of pale light that appear one after another from far overhead,
 * winding down in a slow helix inside a shaft of light until the last one
 * touches the floor in front of whoever passed. Only she may climb it.
 *
 * Built to be watched: each tread flares as it forms, motes of light trail
 * the descent, the shaft follows the leading tread down, and the landing
 * sends a ring of light across the floor.
 */
export class LightStair {
  readonly root = new Group();
  private readonly steps: InstancedMesh;
  private readonly halos: InstancedMesh;
  private readonly shaft: Mesh;
  private readonly motes: Points;
  private readonly ring: Mesh;
  private readonly poses: Array<{ pos: Vector3; quat: Quaternion }> = [];
  private readonly light: PointLight;
  private readonly stepMat: ShaderMaterial;
  private readonly haloMat: ShaderMaterial;
  private readonly shaftMat: ShaderMaterial;
  private readonly moteMat: ShaderMaterial;
  private readonly ringMat: MeshBasicMaterial;
  /** 0..1: how far down the stair has come. */
  private progress = 0;
  private target = 0;
  private speed = 0.2;
  private time = 0;
  /** Seconds since the last tread touched the floor (-1 = not yet). */
  private landed = -1;
  private readonly onStep: ((i: number, at: Vector3) => void) | null;
  private readonly onLand: (() => void) | null;
  private lastShown = -1;
  readonly count: number;
  readonly foot = new Vector3();
  /** Where the newest tread is (the leading edge of the descent). */
  readonly head = new Vector3();

  constructor(
    center: Vector3,
    opts: { top?: number; radius?: number; turns?: number; steps?: number; onStep?: (i: number, at: Vector3) => void; onLand?: () => void } = {},
  ) {
    this.root.name = 'LightStair';
    const top = opts.top ?? 62;
    const radius = opts.radius ?? 4.2;
    const turns = opts.turns ?? 1.6;
    const n = (this.count = opts.steps ?? 54);
    this.onStep = opts.onStep ?? null;
    this.onLand = opts.onLand ?? null;
    // Steps run from the top (index 0) down to the floor; the last lands at the front.
    const end = Math.PI / 2; // the foot faces +Z (towards the party)
    const helix = (u: number, out: Vector3) => {
      const a = end + (1 - u) * turns * Math.PI * 2;
      // Ease the descent so the lowest flight is gentle enough to read as stairs.
      const y = 0.18 + (top - 0.18) * Math.pow(1 - u, 1.35);
      return out.set(center.x + Math.cos(a) * radius, y, center.z + Math.sin(a) * radius);
    };
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const a = end + (1 - u) * turns * Math.PI * 2;
      const pos = helix(u, new Vector3());
      // Long side radial: a fan of treads round the stair's open core.
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2 - a);
      this.poses.push({ pos, quat });
    }
    this.foot.copy(this.poses[n - 1]!.pos);
    this.head.copy(this.poses[0]!.pos);

    // Treads: panes of light, bright at the rims, a faint lattice inside.
    this.stepMat = new ShaderMaterial({
      vertexShader: STEP_VERT,
      fragmentShader: STEP_FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      toneMapped: false,
    });
    this.steps = new InstancedMesh(new BoxGeometry(0.95, 0.08, 2.3), this.stepMat, n);
    this.steps.instanceMatrix.setUsage(DynamicDrawUsage);
    this.steps.setColorAt(0, new Color(1, 1, 1));
    this.steps.frustumCulled = false;
    this.steps.renderOrder = 2;

    // A soft halo under each tread (rounded, not a box of light).
    const haloGeo = new PlaneGeometry(1.9, 3.3);
    haloGeo.rotateX(-Math.PI / 2);
    this.haloMat = new ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    this.halos = new InstancedMesh(haloGeo, this.haloMat, n);
    this.halos.instanceMatrix.setUsage(DynamicDrawUsage);
    this.halos.setColorAt(0, new Color(1, 1, 1));
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 3;

    // The shaft of light the stair winds down inside, revealed from the top
    // down as the leading tread descends.
    const shaftGeo = new CylinderGeometry(radius + 1.6, radius + 1.6, top + 6, 48, 1, true);
    shaftGeo.translate(center.x, (top + 6) / 2, center.z);
    this.shaftMat = new ShaderMaterial({
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      uniforms: { uHeadY: { value: top + 10 }, uTop: { value: top + 6 }, uStrength: { value: 0 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    this.shaft = new Mesh(shaftGeo, this.shaftMat);
    this.shaft.frustumCulled = false;
    this.shaft.renderOrder = 1;

    // Motes of light strung along the helix: they gather where the stair
    // has formed and sparkle hardest at the leading edge.
    const M = 520;
    const pos = new Float32Array(M * 3);
    const uAttr = new Float32Array(M);
    const seed = new Float32Array(M);
    const tmp = new Vector3();
    for (let i = 0; i < M; i++) {
      const u = Math.random();
      helix(u, tmp);
      const r = 0.4 + Math.random() * 1.8;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = tmp.x + Math.cos(a) * r;
      pos[i * 3 + 1] = tmp.y + (Math.random() - 0.3) * 1.6;
      pos[i * 3 + 2] = tmp.z + Math.sin(a) * r;
      uAttr[i] = u;
      seed[i] = Math.random();
    }
    const moteGeo = new BufferGeometry();
    moteGeo.setAttribute('position', new BufferAttribute(pos, 3));
    moteGeo.setAttribute('aU', new BufferAttribute(uAttr, 1));
    moteGeo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    this.moteMat = new ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uLanded: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.motes = new Points(moteGeo, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 4;

    // The landing: a ring of light running out across the floor.
    const ringGeo = new RingGeometry(0.86, 1, 96);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new MeshBasicMaterial({ color: new Color(1.4, 1.2, 0.9), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.ring = new Mesh(ringGeo, this.ringMat);
    this.ring.position.copy(this.foot).setY(0.03);
    this.ring.visible = false;

    this.root.add(this.shaft, this.steps, this.halos, this.motes, this.ring);
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
      this.landed = 10;
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
      if (this.progress >= 1 && this.landed < 0) {
        this.landed = 0;
        this.onLand?.();
      }
    } else if (this.landed >= 0) this.landed += dt;
    this.apply();
  }

  private apply(): void {
    const n = this.count;
    const front = this.progress * (n - 1);
    const t = this.time;
    for (let i = 0; i < n; i++) {
      const { pos, quat } = this.poses[i]!;
      // Each step swells into place as the descent reaches it, then breathes.
      const k = Math.max(0, Math.min(1, front - i + 1));
      const pop = k <= 0 ? 0 : k < 1 ? k * (1 + 0.35 * Math.sin(k * Math.PI)) : 1 + 0.03 * Math.sin(t * 2 + i * 0.4);
      _s.setScalar(Math.max(1e-4, pop));
      _m.compose(pos, quat, _s);
      this.steps.setMatrixAt(i, _m);
      _m.compose(_p.copy(pos).setY(pos.y - 0.05), quat, _s.set(Math.max(1e-4, pop), 1, Math.max(1e-4, pop)));
      this.halos.setMatrixAt(i, _m);
      // A fresh tread flares white-hot, then settles to a warm glow.
      const age = front - i;
      const flare = age < 0 ? 0 : Math.exp(-age * 0.45) * 1.4;
      const shimmer = 0.92 + 0.08 * Math.sin(t * 2.4 + i * 0.7);
      _c.setRGB((1 + flare) * shimmer, (0.97 + flare * 0.95) * shimmer, (0.9 + flare * 0.8) * shimmer);
      this.steps.setColorAt(i, _c);
      this.halos.setColorAt(i, _c);
    }
    this.steps.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
    if (this.steps.instanceColor) this.steps.instanceColor.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;

    const lead = Math.min(n - 1, Math.max(0, Math.floor(front)));
    this.head.copy(this.poses[lead]!.pos);
    const on = this.progress > 0 ? 1 : 0;
    this.stepMat.uniforms.uTime!.value = t;
    this.shaftMat.uniforms.uTime!.value = t;
    this.shaftMat.uniforms.uHeadY!.value = this.progress > 0 ? this.head.y : 1e4;
    this.shaftMat.uniforms.uStrength!.value = on * Math.min(1, this.progress * 6);
    this.moteMat.uniforms.uTime!.value = t;
    this.moteMat.uniforms.uProgress!.value = this.progress;
    this.moteMat.uniforms.uLanded!.value = this.landed < 0 ? 0 : Math.min(1, this.landed / 1.2);
    this.shaft.visible = this.motes.visible = this.steps.visible = this.halos.visible = on > 0;

    // The landing ring runs out once; the light settles at the foot.
    const L = this.landed;
    const ringT = L < 0 ? -1 : L / 1.6;
    this.ring.visible = ringT >= 0 && ringT < 1;
    if (this.ring.visible) {
      this.ring.scale.setScalar(0.6 + 9 * (1 - Math.pow(1 - ringT, 3)));
      this.ringMat.opacity = Math.pow(1 - ringT, 1.6) * 0.9;
    }
    // The light rides the newest step down, and stays at the foot.
    this.light.position.copy(this.head).add(_up);
    const burst = L >= 0 && L < 1.5 ? (1 - L / 1.5) * 30 : 0;
    this.light.intensity = this.progress > 0 ? 24 + 4 * Math.sin(t * 3) + burst : 0;
  }

  dispose(): void {
    for (const m of [this.steps, this.halos, this.shaft, this.motes, this.ring]) m.geometry.dispose();
    for (const m of [this.stepMat, this.haloMat, this.shaftMat, this.moteMat, this.ringMat]) m.dispose();
    this.light.dispose();
    this.root.removeFromParent();
  }
}

const _m = new Matrix4();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();
const _up = new Vector3(0, 1.2, 0);

const STEP_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = uv;
  vTint = vec3(1.0);
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

const STEP_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec2 d = abs(vUv - 0.5) * 2.0;
  float edge = max(d.x, d.y);
  float rim = smoothstep(0.7, 0.97, edge);
  // A faint lattice across the tread, drifting like light on water.
  float lattice = smoothstep(0.86, 1.0, abs(sin((vUv.y + uTime * 0.05) * 3.14159 * 5.0)));
  float sparkle = 0.5 + 0.5 * sin(uTime * 3.0 + vUv.x * 11.0 + vUv.y * 7.0);
  vec3 core = vec3(1.0, 0.9, 0.7);
  vec3 col = core * (0.6 + lattice * 0.35 + sparkle * 0.1) + vec3(1.0, 0.97, 0.9) * rim * 1.5;
  gl_FragColor = vec4(col * vTint, 0.5 + rim * 0.5);
}`;

const HALO_VERT = STEP_VERT;

const HALO_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  // Soft rounded-rectangle falloff around the tread.
  vec2 q = abs(vUv - 0.5) * 2.0;
  vec2 r = max(q - vec2(0.45, 0.6), 0.0) / vec2(0.55, 0.4);
  float f = 1.0 - clamp(length(r), 0.0, 1.0);
  f = f * f;
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * vTint * f * 0.3, 1.0);
}`;

const SHAFT_VERT = /* glsl */ `
varying float vY;
varying float vFacing;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 v = normalize(cameraPosition - wp.xyz);
  // Brightest down the middle of the column, fading to nothing at its
  // silhouette: a volume of light with no edge, not a glass tube.
  vFacing = abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SHAFT_FRAG = /* glsl */ `
uniform float uHeadY;
uniform float uTop;
uniform float uStrength;
uniform float uTime;
varying float vY;
varying float vFacing;
void main() {
  float reveal = smoothstep(uHeadY - 2.0, uHeadY + 14.0, vY);
  float ends = smoothstep(0.0, 4.0, vY) * (1.0 - smoothstep(uTop * 0.45, uTop, vY));
  float body = pow(vFacing, 2.5);
  float ripple = 0.8 + 0.2 * sin(vY * 0.3 - uTime * 1.4);
  float a = reveal * ends * body * ripple * uStrength;
  gl_FragColor = vec4(vec3(1.0, 0.88, 0.66) * a * 0.14, 1.0);
}`;

const MOTE_VERT = /* glsl */ `
attribute float aU;
attribute float aSeed;
uniform float uProgress;
uniform float uTime;
uniform float uLanded;
varying float vA;
void main() {
  vec3 p = position;
  // Lazy drift: a slow fall and a little wander.
  float ph = aSeed * 6.2831 + uTime * (0.4 + aSeed * 0.6);
  p += vec3(sin(ph) * 0.25, -mod(uTime * (0.2 + aSeed * 0.3) + aSeed * 3.0, 3.0) + 1.5, cos(ph * 0.8) * 0.25);
  float formed = smoothstep(aU - 0.02, aU + 0.01, uProgress);
  float leading = exp(-abs(uProgress - aU) * 40.0);
  float twinkle = 0.55 + 0.45 * sin(uTime * (3.0 + aSeed * 5.0) + aSeed * 40.0);
  vA = formed * (0.35 + leading * 2.0) * twinkle * (1.0 - uLanded * 0.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // A few centimetres of light each, sized in the world and capped on
  // screen (a mote passing the lens is a glint, not a disc).
  float worldSize = 0.05 + aSeed * 0.07 + leading * 0.08;
  float px = worldSize * 400.0 * projectionMatrix[1][1] / max(0.5, -mv.z);
  gl_PointSize = clamp(px, 1.0, 22.0);
  vA *= smoothstep(0.6, 2.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float f = 1.0 - smoothstep(0.0, 0.5, length(c));
  gl_FragColor = vec4(vec3(1.0, 0.88, 0.62) * f * f * vA, 1.0);
}`;
