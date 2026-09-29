import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { createLogger } from '../../core/Log';
import type { GameContext } from '../../game/GameContext';
import { learn } from '../../story/Effects';
import { el } from '../../ui/dom';
import { ParticleEmitter, ParticlePresets } from '../../vfx/ParticleEmitter';
import { LANTERN, flatsMask, inFlatsCover } from './TowerFootLayout';

const log = createLogger('Heliosphere');

/** Seconds of warning between the glint and the strike. */
export const GLINT_SECONDS = 1.5;
const WORM_GLINT_SECONDS = 1.1;
const HIT_RADIUS = 2.6;

type State = 'idle' | 'glint' | 'strike' | 'cooldown';

/**
 * The white light from the top of the tower. Anything that moves out in
 * the open on the Glass Flats is noticed; exposure builds with speed, the
 * star at the summit glints, and a heartbeat and a half later the light
 * comes down where it last saw you. Ruins on the flats hide you; standing
 * still in the open lets its attention drift away.
 *
 * Subaru only learns the rules by dying to them. Once he knows, the
 * detection meter and the glint warning appear on screen.
 */
export class Heliosphere {
  exposure = 0;
  state: State = 'idle';
  private timer = 0;
  private targetKind: 'player' | 'worm' = 'player';
  readonly target = new Vector3();
  private targetHidden = false;
  private readonly root = new Group();
  private readonly star: Sprite;
  private readonly beamCore: Mesh;
  private readonly beamHalo: Mesh;
  private readonly beamMat: ShaderMaterial;
  private readonly haloMat: ShaderMaterial;
  private readonly ring: Mesh;
  private readonly scorch: Mesh;
  private readonly flash: PointLight;
  private readonly sparks: ParticleEmitter;
  private beamT = 0;
  private scorchT = 0;
  private starPulse = 0;
  private readonly hud: HTMLElement;
  private readonly hudFill: SVGCircleElement;
  private readonly edgeFlash: HTMLElement;
  /** Strikes survived by hiding (the lesson of cover). */
  dodged = 0;

  constructor(
    private readonly game: GameContext,
    parent: Object3D,
    scope: string,
  ) {
    parent.add(this.root);
    // The star at the summit: always faintly there; flares on the glint.
    this.star = new Sprite(new SpriteMaterial({ map: starTexture(), color: new Color(1, 0.97, 0.9), blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, sizeAttenuation: false }));
    this.star.position.copy(LANTERN);
    this.star.scale.setScalar(0.02);
    this.star.renderOrder = 10;
    this.root.add(this.star);

    // The beam: a bright core and a wide soft halo, scrolling with energy.
    this.beamMat = beamMaterial(1.0, new Color(1, 0.98, 0.92));
    this.haloMat = beamMaterial(0.35, new Color(1, 0.92, 0.75));
    this.beamCore = new Mesh(new CylinderGeometry(1, 1, 1, 24, 1, true), this.beamMat);
    this.beamHalo = new Mesh(new CylinderGeometry(1, 1, 1, 24, 1, true), this.haloMat);
    for (const m of [this.beamCore, this.beamHalo]) {
      m.visible = false;
      m.frustumCulled = false;
      this.root.add(m);
    }
    this.ring = new Mesh(new RingGeometry(0.8, 1, 48), new MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.root.add(this.ring);
    this.scorch = new Mesh(new CircleGeometry(3.2, 40), new MeshBasicMaterial({ map: scorchTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.scorch.rotation.x = -Math.PI / 2;
    this.root.add(this.scorch);
    // Present from the start (intensity 0) so the light count never changes mid-game.
    this.flash = new PointLight(0xfff4de, 0, 55, 2);
    this.root.add(this.flash);
    this.sparks = game.vfx.addEmitter(new ParticleEmitter({ ...ParticlePresets.sparks(new Color(1, 0.95, 0.8)), maxParticles: 220 }), scope);
    this.root.add(this.sparks);

    // HUD (only once Subaru understands what he's looking at).
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(ns, 'svg');
    svgEl.setAttribute('viewBox', '0 0 40 40');
    const track = document.createElementNS(ns, 'circle');
    this.hudFill = document.createElementNS(ns, 'circle');
    for (const c of [track, this.hudFill]) {
      c.setAttribute('cx', '20');
      c.setAttribute('cy', '20');
      c.setAttribute('r', '16');
      c.setAttribute('pathLength', '100');
      svgEl.appendChild(c);
    }
    track.setAttribute('class', 'track');
    this.hudFill.setAttribute('class', 'fill');
    this.hud = game.ui.layers.hud.appendChild(
      el('div', { class: 'rz-helio' }, [el('div', { class: 'eye' }, [svgEl as unknown as HTMLElement, el('i', { class: 'star' })]), el('div', { class: 'lbl' })]),
    );
    this.edgeFlash = game.ui.layers.hud.appendChild(el('div', { class: 'rz-helio-flash' }));
  }

  dispose(): void {
    this.root.removeFromParent();
    // Only what this owns: sprites share one geometry, and the emitter belongs to the VFX system.
    for (const m of [this.beamCore, this.beamHalo, this.ring, this.scorch]) {
      m.geometry.dispose();
      const mat = m.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    const sm = this.star.material as SpriteMaterial;
    sm.map?.dispose();
    sm.dispose();
    this.hud.remove();
    this.edgeFlash.remove();
  }

  private get knowsMovement(): boolean {
    return this.game.state.bool('know.heliosphere.movement');
  }
  private get knowsGlint(): boolean {
    return this.game.state.bool('know.heliosphere.glint');
  }

  update(dt: number): void {
    const g = this.game;
    this.animate(dt);
    const player = g.player;
    const active = !!player && (g.mode === 'exploration' || g.mode === 'combat') && !g.rbd.dying;
    if (!active) {
      this.hud.classList.remove('visible');
      return;
    }
    const p = player.entity.object3D.position;
    const onFlats = flatsMask(p.x, p.z) > 0.5;
    const hidden = !onFlats || inFlatsCover(p.x, p.z);
    const speed = player.followTarget.speed;

    // The worm breaching on the glass is the biggest movement there is.
    const worm = g.enemies.worm();
    if (worm && this.state === 'idle' && ['breach', 'rear', 'slam'].includes(worm.state) && flatsMask(worm.head.x, worm.head.z) > 0.4) {
      this.beginGlint('worm', worm.head, WORM_GLINT_SECONDS);
    }

    switch (this.state) {
      case 'idle': {
        if (onFlats && !hidden && speed > 0.45) {
          const rate = speed > 5.5 ? 1.5 : speed > 3 ? 0.95 : 0.5;
          this.exposure = Math.min(1, this.exposure + rate * dt);
        } else this.exposure = Math.max(0, this.exposure - dt * (hidden ? 0.6 : 0.3));
        if (this.exposure >= 1) this.beginGlint('player', p, GLINT_SECONDS);
        break;
      }
      case 'glint': {
        this.timer -= dt;
        if (this.targetKind === 'player') {
          // It follows what it can see; hiding leaves it staring at where you were.
          this.targetHidden = hidden;
          if (!hidden) this.target.copy(p);
        } else if (worm && !worm.entity.destroyed) this.target.copy(worm.head);
        if (this.timer <= 0) this.strike();
        break;
      }
      case 'strike':
      case 'cooldown':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.exposure = 0.25;
        }
        this.exposure = Math.max(0, this.exposure - dt * 0.4);
        break;
    }
    this.updateHud(onFlats, hidden);
  }

  private beginGlint(kind: 'player' | 'worm', at: Vector3, seconds: number): void {
    this.state = 'glint';
    this.targetKind = kind;
    this.target.copy(at);
    this.timer = seconds;
    this.starPulse = 1;
    this.game.events.emit('audio:stinger', { id: 'heliosphere_glint' });
    this.game.events.emit('story:event', { id: 'heliosphere.glint' });
    log.info(`Glint (${kind})`);
    if (kind === 'player' && this.knowsGlint) {
      this.edgeFlash.classList.remove('on');
      void this.edgeFlash.offsetWidth;
      this.edgeFlash.classList.add('on');
    }
  }

  private strike(): void {
    const g = this.game;
    this.state = 'strike';
    this.timer = 2.8;
    this.exposure = 0;
    const ground = g.physics.groundHeight(this.target.x, this.target.y + 6, this.target.z, 20);
    if (ground !== null && this.targetKind === 'player') this.target.y = ground;
    this.showBeam();
    g.events.emit('audio:stinger', { id: 'heliosphere_strike' });
    const player = g.player;
    const dist = player ? player.entity.object3D.position.distanceTo(this.target) : Infinity;
    g.camera.shake.add(dist < 40 ? 1.2 : 0.4);
    if (this.targetKind === 'worm') {
      const worm = g.enemies.worm();
      if (worm) g.combat.damage(worm.health, { amount: 99999, type: 'light', sourceId: null, tags: ['heliosphere'] });
      learn(g, 'earthworm.lure');
      g.events.emit('story:event', { id: 'heliosphere.worm' });
      log.info('The light takes the worm');
      return;
    }
    if (player && !this.targetHidden && dist < HIT_RADIUS) {
      log.info('The light takes Subaru');
      g.rbd.die('heliosphere');
      return;
    }
    // Missed: it burned the place he was standing a moment ago.
    this.dodged++;
    if (this.targetHidden) learn(g, 'heliosphere.cover');
    g.events.emit('story:event', { id: 'heliosphere.missed' });
  }

  // ------------------------------------------------------------------ visuals
  private showBeam(): void {
    const from = LANTERN;
    const to = this.target;
    const dir = _d.subVectors(to, from);
    const len = dir.length();
    dir.divideScalar(len);
    const q = _q.setFromUnitVectors(_up, dir);
    for (const [m, r] of [
      [this.beamCore, 1.1],
      [this.beamHalo, 3.4],
    ] as const) {
      m.visible = true;
      m.position.copy(from).addScaledVector(dir, len / 2);
      m.quaternion.copy(q);
      m.scale.set(r, len, r);
    }
    this.beamT = 0;
    this.scorchT = 0;
    this.ring.position.copy(to).add(_v.set(0, 0.08, 0));
    this.scorch.position.copy(to).add(_v.set(0, 0.05, 0));
    this.flash.position.copy(to).add(_v.set(0, 3, 0));
    this.sparks.anchor.copy(to).add(_v.set(0, 0.3, 0));
    this.sparks.burst(120);
  }

  private animate(dt: number): void {
    // The summit star: a faint twinkle, flaring on the glint.
    this.starPulse = Math.max(0, this.starPulse - dt * 0.7);
    const t = this.game.time.elapsed;
    const twinkle = 0.018 + Math.sin(t * 2.3) * 0.002 + Math.sin(t * 7.1) * 0.0015;
    const glint = this.state === 'glint' ? 0.06 + Math.sin(t * 30) * 0.012 : this.starPulse * 0.05;
    this.star.scale.setScalar(twinkle + glint);
    (this.star.material as SpriteMaterial).opacity = 0.55 + Math.min(0.45, glint * 12);
    (this.star.material as SpriteMaterial).rotation = t * 0.2 + (this.state === 'glint' ? t * 2 : 0);

    if (this.beamCore.visible) {
      this.beamT += dt;
      const bt = this.beamT;
      const intensity = bt < 0.12 ? bt / 0.12 : bt < 0.7 ? 1 : Math.max(0, 1 - (bt - 0.7) / 0.9);
      this.beamMat.uniforms.uIntensity!.value = intensity * 2.2;
      this.haloMat.uniforms.uIntensity!.value = intensity;
      this.beamMat.uniforms.uTime!.value = bt;
      this.haloMat.uniforms.uTime!.value = bt;
      this.flash.intensity = intensity * 380;
      const rr = 1 + bt * 22;
      this.ring.scale.setScalar(rr);
      (this.ring.material as MeshBasicMaterial).opacity = Math.max(0, 0.9 - bt * 1.1);
      if (intensity <= 0) {
        this.beamCore.visible = false;
        this.beamHalo.visible = false;
        this.flash.intensity = 0;
      }
    }
    if (this.scorchT < 12) {
      this.scorchT += dt;
      const m = this.scorch.material as MeshBasicMaterial;
      m.opacity = this.scorchT < 0.3 ? this.scorchT / 0.3 : Math.max(0, 1 - (this.scorchT - 4) / 8);
    }
  }

  private updateHud(onFlats: boolean, hidden: boolean): void {
    const show = this.knowsMovement && onFlats;
    this.hud.classList.toggle('visible', show);
    if (!show) return;
    this.hudFill.setAttribute('stroke-dasharray', `${(this.exposure * 100).toFixed(1)} 100`);
    const glinting = this.state === 'glint' && this.targetKind === 'player';
    this.hud.classList.toggle('alarm', glinting && this.knowsGlint);
    this.hud.classList.toggle('hidden', hidden);
    this.hud.querySelector('.lbl')!.textContent = glinting && this.knowsGlint ? 'It sees you — get to cover!' : hidden ? 'Hidden' : this.exposure > 0.05 ? 'Exposed' : 'Still';
  }
}

const _d = new Vector3();
const _v = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();

function beamMaterial(strength: number, color: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uIntensity: { value: 0 }, uTime: { value: 0 }, uColor: { value: color }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform float uTime;
      uniform float uStrength;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      varying vec2 vUv;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(facing, 2.5);
        float ripple = 0.85 + 0.15 * sin(vUv.y * 180.0 - uTime * 60.0);
        float a = core * ripple * uIntensity * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

function starTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,248,230,0.9)');
  g.addColorStop(0.4, 'rgba(255,230,190,0.18)');
  g.addColorStop(1, 'rgba(255,220,180,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'lighter';
  for (const [w, h] of [
    [2, 64],
    [64, 2],
  ]) {
    const lg = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    lg.addColorStop(0, 'rgba(255,255,255,0.95)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = lg;
    x.fillRect(64 - w, 64 - h, w * 2, h * 2);
  }
  return new CanvasTexture(c);
}

function scorchTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,190,110,0.95)');
  g.addColorStop(0.25, 'rgba(160,70,30,0.8)');
  g.addColorStop(0.55, 'rgba(25,20,24,0.75)');
  g.addColorStop(1, 'rgba(10,10,14,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
