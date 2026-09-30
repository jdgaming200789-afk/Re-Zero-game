import { Vector3 } from 'three';
import type { CharacterVisual } from '../../characters/CharacterVisual';
import { createLogger } from '../../core/Log';
import type { GameMode } from '../../core/events/GameEvents';
import type { GameContext, GameSystem } from '../../game/GameContext';
import { evaluate, type ConditionContext } from '../Conditions';
import { applyEffects } from '../Effects';
import type { CinematicDef, CineStep, PlaceRef, ShotSpec } from './Cinematic';

const log = createLogger('Cinematic');
const SKIP_HOLD = 0.8;

interface Running {
  def: CinematicDef;
  skipping: boolean;
  hold: number;
  prevMode: GameMode;
  endsBlack: boolean;
  skipSignal: Promise<void>;
  signalSkip: () => void;
}

/**
 * Plays authored scenes: a list of steps (camera shots and blends, fades,
 * letterbox, title cards, characters placed, walked, turned, animated and
 * given expressions, dialogue, story effects), run in order or in
 * parallel. Holding Skip fast-forwards: every remaining step resolves
 * instantly — characters land where they were going, effects still apply —
 * so skipping never leaves the story in a different state.
 */
export class CinematicPlayer implements GameSystem {
  readonly name = 'cinematics';
  private readonly defs = new Map<string, CinematicDef>();
  private running: Running | null = null;
  private readonly ctx: ConditionContext;

  constructor(private readonly game: GameContext) {
    this.ctx = {
      get: (k) => game.state.get(k),
      resolve: (k) => {
        if (k === 'area') return game.scenes.current?.id ?? '';
        if (k.startsWith('party.')) return game.party.isMember(k.slice(6));
        if (k === 'loop') return game.state.num('meta.loop');
        return undefined;
      },
    };
  }

  register(defs: CinematicDef[]): void {
    for (const d of defs) {
      if (this.defs.has(d.id)) throw new Error(`Duplicate cinematic "${d.id}"`);
      this.defs.set(d.id, d);
    }
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  all(): CinematicDef[] {
    return Array.from(this.defs.values());
  }

  get playing(): string | null {
    return this.running?.def.id ?? null;
  }

  get skipping(): boolean {
    return this.running?.skipping ?? false;
  }

  async play(id: string): Promise<{ skipped: boolean }> {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Unknown cinematic "${id}"`);
    if (this.running?.def.id === id) {
      log.warn(`Cinematic "${id}" is already playing`);
      return { skipped: false };
    }
    if (this.running) throw new Error(`Cinematic "${id}" requested while "${this.running.def.id}" plays`);
    const g = this.game;
    // Let an open conversation finish first.
    while (g.dialogue.playing) await g.scheduler.wait(0.1, false);
    let signalSkip!: () => void;
    const skipSignal = new Promise<void>((r) => (signalSkip = r));
    const run: Running = { def, skipping: false, hold: 0, prevMode: g.mode === 'cinematic' ? 'exploration' : g.mode, endsBlack: false, skipSignal, signalSkip };
    this.running = run;
    log.info(`Cinematic ${id}`);
    g.chatter.stop();
    g.setMode('cinematic');
    g.player?.lock('cinematic');
    g.interaction.suppress('cinematic', true);
    if (def.letterbox ?? true) g.ui.letterbox(true);
    g.events.emit('cinematic:started', { cinematicId: id });
    try {
      await this.steps(def.steps, run);
    } catch (err) {
      log.error(`Cinematic "${id}" failed`, err);
    }
    // ---- wrap up (identical whether watched or skipped)
    g.dialogue.fastForward = false;
    await applyEffects(g, def.onEnd);
    g.ui.letterbox(false);
    g.ui.skipHold(null);
    g.ui.titleCardHide();
    if (!g.camera.isFollowing) g.camera.release(run.skipping ? 0 : 0.9, g.player?.followTarget);
    g.camera.shake.sway = 0;
    if (run.skipping && !run.endsBlack) void g.ui.fade(0, 0.5);
    g.interaction.suppress('cinematic', false);
    g.player?.unlock('cinematic');
    this.running = null;
    g.setMode(run.prevMode);
    g.events.emit('cinematic:ended', { cinematicId: id, skipped: run.skipping });
    return { skipped: run.skipping };
  }

  /** Fast-forward the rest of the scene. */
  skip(): void {
    const r = this.running;
    if (!r || r.skipping || r.def.skippable === false) return;
    r.skipping = true;
    this.game.ui.skipHold(null);
    this.game.dialogue.fastForward = true;
    void this.game.ui.fade(1, 0.2);
    r.signalSkip();
    log.info(`Skipped ${r.def.id}`);
  }

  update(_dt: number): void {
    const r = this.running;
    if (!r || r.skipping || r.def.skippable === false) return;
    const dt = this.game.time.unscaledDt;
    const input = this.game.input;
    // In a choice, the button belongs to the dialogue.
    if (input.held('skip') && this.game.dialogue.state?.phase !== 'choice') r.hold += dt;
    else r.hold = Math.max(0, r.hold - dt * 2);
    this.game.ui.skipHold(r.hold > 0.05 ? Math.min(1, r.hold / SKIP_HOLD) : null);
    if (r.hold >= SKIP_HOLD) this.skip();
  }

  // ------------------------------------------------------------------ steps
  private async steps(list: CineStep[], r: Running): Promise<void> {
    for (const s of list) await this.step(s, r);
  }

  /** Await something unless (or until) the scene is skipped. */
  private until(p: Promise<unknown>, r: Running): Promise<unknown> {
    return r.skipping ? Promise.resolve() : Promise.race([p, r.skipSignal]);
  }

  private async step(s: CineStep, r: Running): Promise<void> {
    const g = this.game;
    switch (s.do) {
      case 'fade': {
        if (r.skipping) {
          r.endsBlack = s.to >= 1;
          return;
        }
        const p = g.ui.fade(s.to, s.seconds ?? 0.8, s.color);
        if (s.wait !== false) await this.until(p, r);
        return;
      }
      case 'letterbox':
        g.ui.letterbox(s.on);
        return;
      case 'title': {
        if (r.skipping) return;
        const p = g.ui.titleCardShow(s.title, s.sub, s.kicker, s.seconds);
        if (s.wait !== false) await this.until(p, r);
        return;
      }
      case 'shot': {
        const shot = this.shot(s.shot);
        if (r.skipping || !s.blend) g.camera.cut(shot);
        else g.camera.blendTo(shot, s.blend, s.ease);
        return;
      }
      case 'follow':
        g.camera.release(r.skipping ? 0 : (s.blend ?? 0.9), g.player?.followTarget);
        return;
      case 'wait':
        if (!r.skipping) await this.until(g.scheduler.wait(s.seconds), r);
        return;
      case 'place': {
        const at = this.point(s.at, 'feet');
        this.ground(at);
        // Without a facing, a marker's own yaw applies (else keep theirs).
        const yaw = s.face === undefined ? (this.markerYaw(s.at) ?? this.yawOf(s.who)) : typeof s.face === 'number' ? (s.face * Math.PI) / 180 : yawTowards(at, this.point(s.face, 'feet'));
        this.placeWho(s.who, at, yaw);
        return;
      }
      case 'move': {
        const to = this.point(s.to, 'feet');
        this.ground(to);
        if (r.skipping) {
          const from = this.feet(s.who);
          this.placeWho(s.who, to, from ? yawTowards(from, to) : this.yawOf(s.who));
          return;
        }
        const p = this.moveWho(s.who, to, s.speed ?? 'walk');
        if (s.wait !== false) await this.until(p, r);
        if (r.skipping) this.placeWho(s.who, to, this.yawOf(s.who));
        return;
      }
      case 'face': {
        const target = this.point(s.to, 'feet');
        const p = this.faceWho(s.who, target, r.skipping ? 100000 : undefined);
        if (s.wait !== false && !r.skipping) await this.until(p, r);
        return;
      }
      case 'look':
        this.visual(s.who)?.lookAt(s.at === null ? null : this.point(s.at, 'head'), 0.9);
        return;
      case 'anim': {
        const v = this.visual(s.who);
        // 'none' releases a held pose (standing up from a chair).
        if (s.clip === 'none') return v?.stopAction();
        if (!v || (r.skipping && !s.hold)) return;
        const p = v.play(s.clip, { holdEnd: s.hold });
        if (s.wait && !s.hold) await this.until(p, r);
        return;
      }
      case 'expr':
        this.visual(s.who)?.setExpression(s.expression, 1, s.seconds ?? 600);
        return;
      case 'say':
        await g.dialogue.say(s.lines, { camera: s.camera ?? 'keep', releaseCamera: false });
        return;
      case 'dialogue':
        await g.dialogue.play(s.id, { camera: s.camera ?? 'auto', releaseCamera: false });
        return;
      case 'effects':
        await applyEffects(g, s.effects);
        return;
      case 'party':
        await g.party.settled();
        return;
      case 'spawn': {
        const at = this.point(s.at, 'feet');
        this.ground(at);
        const yaw = s.face === undefined ? (this.markerYaw(s.at) ?? 0) : typeof s.face === 'number' ? (s.face * Math.PI) / 180 : yawTowards(at, this.point(s.face, 'feet'));
        const actor = await g.actors.spawn(s.who, { position: at, yaw, scope: g.scenes.current?.scope, physics: !s.lying });
        if (s.lying) actor.setLying(true, 0.06);
        return;
      }
      case 'despawn':
        g.actors.despawn(s.who);
        return;
      case 'carry': {
        const v = this.visual(s.who);
        if (!s.whom) {
          v?.stopAction();
          if (this.carried) g.actors.despawn(this.carried);
          this.carried = null;
          return;
        }
        void v?.play('carryBride', { holdEnd: true });
        const feet = this.feet(s.who);
        if (!feet) return;
        const yaw = this.yawOf(s.who);
        // Her hips rest on his forearms, just in front of his waist; she lies
        // across his arms (head to his right), reclined as if sitting back.
        const hold = new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.34).add(feet).add(new Vector3(0, 1.04, 0));
        const herYaw = yaw + Math.PI / 2;
        const recline = (50 * Math.PI) / 180;
        const hips = 0.74;
        const off = new Vector3(-hips * Math.sin(recline) * Math.sin(herYaw), hips * Math.cos(recline), -hips * Math.sin(recline) * Math.cos(herYaw));
        const root = hold.clone().sub(off);
        const actor = await g.actors.spawn(s.whom, { position: root, yaw: herYaw, scope: g.scenes.current?.scope, physics: false });
        actor.setLying(true, 0, recline);
        actor.position.copy(root);
        void actor.visual.play('carried', { holdEnd: true });
        this.carried = s.whom;
        return;
      }
      case 'music':
        g.events.emit('audio:musicState', { state: s.state });
        return;
      case 'shake':
        if (!r.skipping) g.camera.shake.add(s.strength);
        return;
      case 'if':
        await this.steps(evaluate(s.cond, this.ctx) ? s.then : (s.else ?? []), r);
        return;
      case 'parallel':
        await Promise.all(s.steps.map((x) => this.step(x, r)));
        return;
    }
  }

  // ------------------------------------------------------------------ actors
  private visual(id: string): CharacterVisual | null {
    const g = this.game;
    if (g.player?.characterId === id) return g.player.visual;
    return g.actors.get(id)?.visual ?? null;
  }

  private feet(id: string): Vector3 | null {
    const g = this.game;
    if (g.player?.characterId === id) return g.player.entity.object3D.position.clone();
    return g.actors.get(id)?.position.clone() ?? null;
  }

  private yawOf(id: string): number {
    const g = this.game;
    if (g.player?.characterId === id) return g.player.yaw;
    return g.actors.get(id)?.yaw ?? 0;
  }

  private placeWho(id: string, at: Vector3, yaw: number): void {
    const g = this.game;
    if (g.player?.characterId === id) g.player.placeAt(at, yaw);
    else g.actors.get(id)?.placeAt(at, yaw);
  }

  private moveWho(id: string, to: Vector3, speed: 'walk' | 'run' | number): Promise<unknown> {
    const g = this.game;
    const p = g.player;
    if (p?.characterId === id) {
      const v = speed === 'walk' ? p.movement.walkSpeed : speed === 'run' ? p.movement.runSpeed : speed;
      return p.moveTo(to, v, 0.15, 12);
    }
    return g.actors.get(id)?.moveTo(to, speed, 0.2, 12) ?? Promise.resolve();
  }

  private faceWho(id: string, target: Vector3, rate?: number): Promise<void> {
    const g = this.game;
    if (g.player?.characterId === id) return g.player.faceTowards(target, rate);
    return g.actors.get(id)?.faceTowards(target, rate) ?? Promise.resolve();
  }

  // ------------------------------------------------------------------ places
  /** The facing stored with an area marker (`'@camp.fire'`), if `ref` is one. */
  private markerYaw(ref: PlaceRef): number | null {
    if (typeof ref !== 'string' || !ref.startsWith('@')) return null;
    return this.game.scenes.current?.spawns.get(ref.slice(1))?.yaw ?? null;
  }

  /** Who is being carried right now (set down at the end of the scene). */
  private carried: string | null = null;

  point(ref: PlaceRef, mode: 'feet' | 'head'): Vector3 {
    if (Array.isArray(ref)) return new Vector3(ref[0], ref[1], ref[2]);
    if (typeof ref === 'string') {
      if (ref.startsWith('@')) {
        const sp = this.game.scenes.current?.spawns.get(ref.slice(1));
        if (!sp) throw new Error(`No marker "${ref}" in ${this.game.scenes.current?.id}`);
        return sp.position.clone();
      }
      return this.characterPoint(ref, mode === 'head' ? 'head' : 'feet');
    }
    const base = this.characterPoint(ref.of, ref.socket ?? mode);
    if (ref.offset) {
      const yaw = this.yawOf(ref.of);
      const [x, y, z] = ref.offset;
      base.x += Math.cos(yaw) * x + Math.sin(yaw) * z;
      base.z += -Math.sin(yaw) * x + Math.cos(yaw) * z;
      base.y += y;
    }
    return base;
  }

  private characterPoint(id: string, socket: 'head' | 'chest' | 'feet'): Vector3 {
    if (socket === 'feet') {
      const f = this.feet(id);
      if (f) return f;
    }
    const v = this.visual(id);
    if (!v) throw new Error(`Character "${id}" is not in the scene`);
    return v.socketPosition(socket === 'feet' ? 'head' : socket, new Vector3());
  }

  private ground(p: Vector3): void {
    const h = this.game.physics.groundHeight(p.x, p.y + 2, p.z, 8);
    if (h !== null) p.y = h;
  }

  private shot(s: ShotSpec): { position: Vector3; lookAt: Vector3; fov: number; drift?: Vector3; sway?: number; focusDistance?: number; focusRange?: number } {
    const from = this.point(s.from, 'head');
    const at = this.point(s.at, 'head');
    return {
      position: from,
      lookAt: at,
      fov: s.fov ?? 40,
      drift: s.drift ? new Vector3(...s.drift) : undefined,
      sway: s.sway,
      focusDistance: s.dof ? from.distanceTo(at) : undefined,
      focusRange: s.dof ? 1.4 : undefined,
    };
  }
}

function yawTowards(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
