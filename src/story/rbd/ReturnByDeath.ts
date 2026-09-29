import { Vector3 } from 'three';
import { SubaruCombat } from '../../combat/SubaruCombat';
import { createLogger } from '../../core/Log';
import { deathDef } from '../../data/deaths';
import type { GameContext, GameSystem } from '../../game/GameContext';
import type { ColorGrade } from '../../render/effects/ColorGradeEffect';
import { el } from '../../ui/dom';
import { WitchOverlay } from '../../ui/overlay/WitchOverlay';
import { learn } from '../Effects';

const log = createLogger('RbD');

const DEATH_GRADE: ColorGrade = { lift: [0.02, 0, 0.035], gamma: [1.05, 1.05, 1], gain: [0.95, 0.92, 1], saturation: 0.12, contrast: 1.25, temperature: -0.15, tint: 0.05 };
const FROZEN_GRADE: ColorGrade = { lift: [0.01, 0, 0.02], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 0, contrast: 1.35, temperature: -0.05, tint: 0.04 };

/**
 * Return by Death. When Subaru dies the world drains, the Witch's shadow
 * closes in and whispers over the black; then everything rewinds to the
 * last return point — world state, quests, the party, the area — while
 * Subaru keeps what he learned (and learns from how he died). He wakes
 * with a gasp, and the people around him have no idea.
 *
 * Also the taboo: trying to tell anyone stops time and the Witch's hand
 * closes around his heart.
 */
export class ReturnByDeath implements GameSystem {
  readonly name = 'rbd';
  readonly overlay: WitchOverlay;
  private readonly card: HTMLElement;
  private busy: 'death' | 'punish' | null = null;

  constructor(private readonly game: GameContext) {
    this.overlay = new WitchOverlay(game.ui.layers.overlay);
    this.card = game.ui.layers.overlay.appendChild(el('div', { class: 'rz-rbd-card' }, [el('div', { class: 'title', text: 'Return by Death' }), el('div', { class: 'sub' })]));
  }

  get dying(): boolean {
    return this.busy === 'death';
  }

  get punishing(): boolean {
    return this.busy === 'punish';
  }

  update(): void {
    this.overlay.update(this.game.time.unscaledDt);
  }

  die(cause: string): void {
    if (this.busy === 'death') return;
    void this.sequence(cause).catch((err) => {
      log.error('Return by Death failed', err);
      this.busy = null;
    });
  }

  private wait(seconds: number): Promise<void> {
    return this.game.scheduler.wait(seconds, false);
  }

  private async sequence(cause: string): Promise<void> {
    const g = this.game;
    const player = g.player;
    const def = deathDef(cause);
    this.busy = 'death';
    const loop = g.state.num('meta.loop', 1);
    log.info(`Death (${cause}) in loop ${loop}`);
    g.events.emit('rbd:deathBegan', { cause, loop });
    g.events.emit('audio:stinger', { id: 'rbd_death' });
    g.chatter.stop();
    g.dialogue.abort();
    g.interaction.suppress('rbd', true);
    player?.lock('rbd');
    g.setMode('death');

    // ---- The moment of death.
    if (def.style === 'light') {
      await g.ui.fade(1, 0.1, '#ffffff');
      if (player) player.visual.root.visible = false;
      await this.wait(0.7);
      this.overlay.start();
      this.overlay.closeIn(1, 0.8);
      this.overlay.whisperRate = 2;
      await g.ui.fade(0.25, 1.4, '#ffffff');
      await this.wait(0.5);
    } else {
      g.time.slowMotion(0.25, 3);
      g.render.setGrade(DEATH_GRADE, 1.2);
      if (player) {
        void player.visual.play('collapse', { fadeIn: 0.05, holdEnd: true });
        const chest = player.visual.socketPosition('chest', new Vector3());
        const side = new Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
        const fwd = new Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
        const from = chest.clone().addScaledVector(side, 1.7).addScaledVector(fwd, 0.9).add(new Vector3(0, 0.55, 0));
        g.camera.blendTo({ position: from, lookAt: chest.clone().add(new Vector3(0, -0.35, 0)), fov: 40, sway: 1.2, drift: new Vector3(0, 0, -0.08) }, 1.4, 'outCubic');
      }
      this.overlay.start();
      this.overlay.closeIn(1, 0.42);
      this.overlay.whisperRate = 2.5;
      await this.wait(1.4);
      this.overlay.whisperRate = 6;
      await this.wait(1.1);
    }
    this.overlay.whisperRate = 7;
    await g.ui.fade(1, 1.0, '#000000');
    const rp = g.checkpoints.current;
    this.card.querySelector('.sub')!.textContent = rp?.name ?? '';
    this.card.classList.add('visible');
    await this.wait(1.2);
    this.overlay.whisperRate = 3;

    // ---- The world rewinds. Subaru's knowledge and the loop count do not.
    g.state.add('meta.deaths', 1);
    g.state.set('meta.loop', loop + 1);
    g.state.set('meta.last_death', cause);
    g.state.add(`meta.death_count.${cause.replace(/[^a-z0-9_]/gi, '_')}`, 1);
    g.time.slowMotion(1, 0);
    g.combat.reset();
    if (rp) g.state.restore(rp.flags, ['world']);
    const area = rp?.area ?? g.scenes.current?.id ?? 'dev_gym';
    await g.scenes.goto(area, rp?.spawn ?? 'default', { reload: true, reveal: false, fadeSeconds: 0 });
    if (player) {
      player.visual.root.visible = true;
      player.entity.get(SubaruCombat)?.restore();
    }
    await g.party.respawnAll();
    if (g.scenes.current) g.scenes.applyAtmosphere(g.scenes.current, 0);
    g.events.emit('rbd:returned', { checkpointId: rp?.id ?? 'none', loop: loop + 1 });
    await this.wait(0.6);
    this.card.classList.remove('visible');
    this.overlay.whisperRate = 0;
    this.overlay.stop(0.2);
    this.overlay.hush();

    // ---- He wakes: a gasp, a face that has just seen its own death.
    if (player) {
      // Facing the people who are about to ask if he's all right.
      const someone = g.party.follower('emilia') ?? g.party.active[0];
      if (someone) {
        const p = player.entity.object3D.position;
        player.yaw = Math.atan2(someone.position.x - p.x, someone.position.z - p.z);
        player.entity.object3D.rotation.set(0, player.yaw, 0);
        await g.scheduler.nextFrame();
      }
      const head = player.visual.socketPosition('head', new Vector3());
      const fwd = new Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      g.camera.cut({ position: head.clone().addScaledVector(fwd, 1.25).add(new Vector3(0, 0.02, 0)), lookAt: head.clone().add(new Vector3(0, -0.06, 0)), fov: 30, sway: 0.8, drift: new Vector3(0, 0, -0.04) });
      void player.visual.play('gasp');
      player.visual.setExpression('fear', 1, 5);
    }
    g.render.setChromaticBase(0.012);
    await g.ui.fade(1, 0, '#ffffff');
    void g.ui.fade(0, 0.9, '#ffffff');
    await this.wait(0.5);
    g.render.setChromaticBase(0);
    await this.wait(1.4);
    for (const k of def.learn) learn(g, k);

    // ---- Back in the world; nobody else remembers.
    g.interaction.suppress('rbd', false);
    player?.unlock('rbd');
    g.setMode('exploration');
    this.busy = null;
    if (g.dialogue.has('rbd.return')) await g.dialogue.play('rbd.return');
    else g.camera.release(0.8, player?.followTarget);
  }

  /**
   * The taboo. Speaking of Return by Death stops time; the Witch's hand
   * closes on his heart. Resolves once Subaru can breathe again.
   */
  async punish(): Promise<void> {
    if (this.busy) return;
    const g = this.game;
    this.busy = 'punish';
    log.info('The Witch punishes the attempt');
    g.events.emit('audio:stinger', { id: 'witch_punish' });
    const scale = g.time.timeScale;
    g.time.setBaseScale(0);
    // Close on Subaru: the hands are coming for his heart.
    const player0 = g.player;
    if (player0) {
      const chest = player0.visual.socketPosition('chest', new Vector3());
      const fwd = new Vector3(Math.sin(player0.yaw), 0, Math.cos(player0.yaw));
      g.camera.cut({ position: chest.clone().addScaledVector(fwd, 1.45).add(new Vector3(0, 0.22, 0)), lookAt: chest.clone().add(new Vector3(0, 0.12, 0)), fov: 34, drift: new Vector3(0, 0, -0.05) });
    }
    g.render.setGrade(FROZEN_GRADE, 0.25);
    this.overlay.start(['I love you', 'I love you', 'I love you', 'Don’t']);
    this.overlay.closeIn(0.6, 0.7);
    this.overlay.whisperRate = 4;
    this.overlay.reachForHeart();
    await this.wait(2.4);
    this.overlay.squeeze();
    this.overlay.whisperRate = 14;
    g.camera.shake.add(0.8);
    await this.wait(1.0);
    this.overlay.whisperRate = 0;
    this.overlay.stop(0.5);
    g.time.setBaseScale(scale > 0 ? 1 : 0);
    if (g.scenes.current) g.scenes.applyAtmosphere(g.scenes.current, 0.5);
    const player = g.player;
    if (player) {
      void player.visual.play('gasp');
      player.visual.setExpression('pain', 1, 3);
    }
    g.state.add('meta.punishments', 1);
    await this.wait(1.1);
    this.overlay.hush();
    this.busy = null;
  }
}
