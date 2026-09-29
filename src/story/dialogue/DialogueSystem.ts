import { Vector3 } from 'three';
import type { CharacterVisual } from '../../characters/CharacterVisual';
import { createLogger } from '../../core/Log';
import type { GameMode } from '../../core/events/GameEvents';
import type { GameContext, GameSystem } from '../../game/GameContext';
import { DialogueBox, DialogueLog, TEXT_CPS, type HistoryEntry } from '../../ui/dialogue/DialogueBox';
import type { ConditionContext } from '../Conditions';
import { applyEffect } from '../Effects';
import { ConversationCamera, type ShotKind } from './ConversationCamera';
import { DialogueRunner, type DialogueDef, type DialogueLine, type DialogueStep } from './Dialogue';

const log = createLogger('Dialogue');

/**
 * Voice-over hook. The audio layer implements it: recorded lines when a
 * file exists for the line id, procedural voice blips otherwise.
 */
export interface VoiceProvider {
  /** Start the voice for a line; returns its length in seconds, or null if unvoiced. */
  line(lineId: string, speakerId: string | null, text: string): number | null;
  /** Called per revealed letter of unvoiced lines. */
  letter?(speakerId: string | null, ch: string): void;
  stop(): void;
}

export interface DialoguePlayOptions {
  /** 'auto' composes conversation shots; 'keep' leaves the camera where it is. */
  camera?: 'auto' | 'keep';
  letterbox?: boolean;
  /** Hand the camera back to gameplay at the end (default: yes, unless inside a cinematic). */
  releaseCamera?: boolean;
}

interface Active {
  def: DialogueDef;
  runner: DialogueRunner;
  camera: 'auto' | 'keep';
  releaseCamera: boolean;
  phase: 'line' | 'choice';
  line: DialogueLine | null;
  speaker: string | null;
  prevSpeaker: string | null;
  /** Seconds since the line finished revealing. */
  readTime: number;
  voiceLeft: number;
  shotSpeaker: string | null;
  sameSpeakerLines: number;
  shots: number;
  prevMode: GameMode;
  prevLetterbox: boolean;
  guard: number;
  touched: Set<CharacterVisual>;
  resolve: () => void;
}

/**
 * Plays conversations: drives the DialogueRunner, the dialogue window, the
 * backlog, text speed / auto / skip, speaker staging (who looks at whom,
 * expressions, gestures, lip flap) and camera coverage. Everything a line
 * says or does is data (src/data/dialogues).
 */
export class DialogueSystem implements GameSystem {
  readonly name = 'dialogue';
  private readonly defs = new Map<string, DialogueDef>();
  readonly history: HistoryEntry[] = [];
  /** Line ids already shown (skip-read support; persisted with saves). */
  readonly seen = new Set<string>();
  voice: VoiceProvider | null = null;
  auto: boolean;
  skipping = false;
  /** Set by cinematics being skipped: lines fly past, choices still wait. */
  fastForward = false;
  private active: Active | null = null;
  private readonly box: DialogueBox;
  private readonly logView: DialogueLog;
  private readonly conv: ConversationCamera;
  private readonly conditions: ConditionContext;

  constructor(private readonly game: GameContext) {
    const glyph = (a: 'advance' | 'autoAdvance' | 'skip' | 'history' | 'cancel') => game.ui.actionGlyph(a);
    this.box = new DialogueBox(game.ui.layers.dialogue, glyph);
    this.logView = new DialogueLog(game.ui.layers.screens, glyph);
    this.conv = new ConversationCamera(game.physics);
    this.auto = game.settings.gameplay.autoAdvance;
    this.box.onLetter = (ch) => this.voice?.letter?.(this.active?.speaker ?? null, ch);
    this.box.onChoose = (i) => {
      if (this.active?.phase === 'choice') this.choose(i);
    };
    this.box.onControl = (which) => {
      if (which === 'auto') this.setAuto(!this.auto);
      else if (which === 'skip') this.setSkipping(!this.skipping);
      else this.openLog();
      if (this.active) this.active.guard = 0.15;
    };
    this.conditions = {
      get: (k) => game.state.get(k),
      resolve: (k) => {
        if (k === 'area') return game.scenes.current?.id ?? '';
        if (k.startsWith('party.')) return game.party.isMember(k.slice(6));
        if (k === 'loop') return game.state.num('meta.loop');
        return undefined;
      },
    };
  }

  register(defs: DialogueDef[]): void {
    for (const d of defs) {
      if (this.defs.has(d.id)) throw new Error(`Duplicate dialogue "${d.id}"`);
      this.defs.set(d.id, d);
    }
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  get(id: string): DialogueDef | undefined {
    return this.defs.get(id);
  }

  all(): DialogueDef[] {
    return Array.from(this.defs.values());
  }

  /** Id of the conversation on screen, if any. */
  get playing(): string | null {
    return this.active?.def.id ?? null;
  }

  /** What the player is looking at right now (tests, debug). */
  get state(): { id: string; phase: 'line' | 'choice'; speaker: string | null; text: string; options: string[] } | null {
    const a = this.active;
    if (!a) return null;
    const step = a.runner.step;
    return {
      id: a.def.id,
      phase: a.phase,
      speaker: a.speaker,
      text: a.line?.text ?? '',
      options: step?.kind === 'choice' ? step.options.map((o) => `${o.enabled ? '' : '[locked] '}${o.choice.text}`) : [],
    };
  }

  play(id: string, opts: DialoguePlayOptions = {}): Promise<void> {
    const def = this.defs.get(id);
    if (!def) return Promise.reject(new Error(`Unknown dialogue "${id}"`));
    return this.run(def, opts);
  }

  /** A few lines without authoring a whole dialogue (cinematic asides). */
  say(lines: DialogueLine[], opts: DialoguePlayOptions & { id?: string } = {}): Promise<void> {
    const cast = Array.from(new Set(lines.map((l) => l.speaker).filter((s): s is string => !!s)));
    const def: DialogueDef = { id: opts.id ?? 'inline', cast, start: 'main', nodes: { main: { lines } }, camera: opts.camera ?? 'keep' };
    return this.run(def, opts);
  }

  setAuto(on: boolean): void {
    this.auto = on;
    this.box.setControl('auto', on);
  }

  setSkipping(on: boolean): void {
    this.skipping = on;
    this.box.setControl('skip', on);
  }

  // ------------------------------------------------------------------ run
  private run(def: DialogueDef, opts: DialoguePlayOptions): Promise<void> {
    if (this.active) return Promise.reject(new Error(`Dialogue "${def.id}" requested while "${this.active.def.id}" is playing`));
    const g = this.game;
    g.chatter.stop();
    const prevMode = g.mode === 'dialogue' ? 'exploration' : g.mode;
    g.setMode('dialogue');
    g.player?.lock('dialogue');
    g.interaction.suppress('dialogue', true);
    const prevLetterbox = g.ui.letterboxed;
    if (opts.letterbox ?? def.letterbox) g.ui.letterbox(true);
    this.box.cps = TEXT_CPS[g.settings.gameplay.textSpeed];
    this.box.setControl('auto', this.auto);
    this.setSkipping(false);
    this.box.show();
    g.events.emit('dialogue:started', { dialogueId: def.id });
    log.info(`Dialogue ${def.id}`);

    const camera = opts.camera ?? def.camera ?? 'auto';
    const runner = new DialogueRunner(def, {
      conditions: this.conditions,
      apply: (e) => applyEffect(g, e),
      remember: (k) => g.state.set(`dlg.${k}`, true),
      remembers: (k) => g.state.bool(`dlg.${k}`),
    });
    return new Promise<void>((resolve) => {
      this.active = {
        def,
        runner,
        camera,
        releaseCamera: opts.releaseCamera ?? prevMode !== 'cinematic',
        phase: 'line',
        line: null,
        speaker: null,
        prevSpeaker: null,
        readTime: 0,
        voiceLeft: 0,
        shotSpeaker: null,
        sameSpeakerLines: 0,
        shots: 0,
        prevMode,
        prevLetterbox,
        guard: 0.2,
        touched: new Set(),
        resolve,
      };
      this.stageStart(def, camera);
      this.handle(() => runner.start());
    });
  }

  private handle(next: () => DialogueStep): void {
    const a = this.active;
    if (!a) return;
    let step: DialogueStep;
    try {
      step = next();
    } catch (err) {
      log.error(`Dialogue "${a.def.id}" failed`, err);
      this.finish();
      return;
    }
    if (step.kind === 'end') this.finish();
    else if (step.kind === 'line') this.presentLine(step.line, step.lineId);
    else this.presentChoice(step);
  }

  private presentLine(line: DialogueLine, lineId: string): void {
    const a = this.active!;
    const g = this.game;
    a.phase = 'line';
    a.prevSpeaker = a.speaker ?? a.prevSpeaker;
    a.line = line;
    a.speaker = line.speaker;
    a.readTime = 0;
    const info = line.speaker ? g.ui.speaker(line.speaker) : null;
    this.box.showLine({ name: info?.name ?? null, color: info?.color, text: line.text, thought: line.thought });
    if (this.skipping || this.fastForward) this.box.revealAll();
    this.pushHistory({ name: info?.name ?? null, color: info?.color, text: line.text, thought: line.thought });
    this.seen.add(lineId);
    g.events.emit('dialogue:line', { dialogueId: a.def.id, lineId, speakerId: line.speaker });
    a.voiceLeft = this.skipping || this.fastForward ? 0 : (this.voice?.line(lineId, line.speaker, line.text) ?? 0);
    this.stageLine(line);
    if (a.camera === 'auto') this.frameLine(line);
  }

  private presentChoice(step: Extract<DialogueStep, { kind: 'choice' }>): void {
    const a = this.active!;
    a.phase = 'choice';
    this.setSkipping(false);
    this.speakerVisual()?.setSpeaking(false);
    this.box.showChoices(
      step.options.map((o) => ({ text: o.choice.text, enabled: o.enabled, insight: o.choice.insight, chosen: o.chosen, hint: o.choice.lockedHint })),
      0,
    );
    a.guard = 0.25;
  }

  private choose(i: number): void {
    const a = this.active;
    if (!a || a.phase !== 'choice') return;
    const step = a.runner.step;
    if (step?.kind !== 'choice') return;
    const opt = step.options[i];
    if (!opt?.enabled) return;
    this.pushHistory({ name: null, text: opt.choice.text, choice: true });
    this.box.hideChoices();
    a.guard = 0.15;
    this.handle(() => a.runner.choose(opt.index));
  }

  private advance(): void {
    const a = this.active;
    if (!a) return;
    this.voice?.stop();
    this.speakerVisual()?.setSpeaking(false);
    this.handle(() => a.runner.advance());
  }

  private finish(): void {
    const a = this.active;
    if (!a) return;
    const g = this.game;
    this.active = null;
    this.box.hide();
    this.logView.hide();
    this.voice?.stop();
    this.setSkipping(false);
    for (const v of a.touched) {
      v.setSpeaking(false);
      v.lookAt(null);
    }
    if (a.camera === 'auto' && a.shots > 0 && a.releaseCamera) g.camera.release(0.8, g.player?.followTarget);
    if (!a.prevLetterbox) g.ui.letterbox(false);
    g.interaction.suppress('dialogue', false);
    g.player?.unlock('dialogue');
    g.setMode(a.prevMode);
    g.events.emit('dialogue:ended', { dialogueId: a.def.id });
    a.resolve();
  }

  private pushHistory(e: HistoryEntry): void {
    this.history.push(e);
    if (this.history.length > 400) this.history.splice(0, this.history.length - 400);
  }

  private openLog(): void {
    if (!this.active || this.logView.open) return;
    this.logView.show(this.history);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number): void {
    const a = this.active;
    if (!a || dt <= 0) return;
    const input = this.game.input;
    a.guard = Math.max(0, a.guard - dt);

    if (this.logView.open) {
      if (input.pressed('history') || input.pressed('cancel')) {
        input.consume('history');
        input.consume('cancel');
        this.logView.hide();
        a.guard = 0.15;
      } else if (input.pressed('navUp')) this.logView.scroll(-1);
      else if (input.pressed('navDown')) this.logView.scroll(1);
      input.consume('advance');
      input.consume('confirm');
      return;
    }
    if (input.pressed('history')) {
      input.consume('history');
      this.openLog();
      return;
    }
    if (input.pressed('autoAdvance')) {
      input.consume('autoAdvance');
      this.setAuto(!this.auto);
    }
    if (input.pressed('skip')) {
      input.consume('skip');
      if (a.phase === 'line') this.setSkipping(!this.skipping);
    }

    this.box.update(dt);
    const advancePressed = (input.pressed('advance') || input.pressed('confirm')) && a.guard <= 0;
    if (advancePressed) {
      input.consume('advance');
      input.consume('confirm');
    }

    if (a.phase === 'choice') {
      if (input.pressed('navUp')) this.box.move(-1);
      if (input.pressed('navDown')) this.box.move(1);
      if (advancePressed) this.choose(this.box.selection);
      return;
    }

    // ---- line
    a.voiceLeft = Math.max(0, a.voiceLeft - dt);
    const speaking = this.box.revealing || a.voiceLeft > 0;
    if (!speaking) {
      this.speakerVisual()?.setSpeaking(false);
      a.readTime += dt;
    }
    if (this.skipping || this.fastForward) {
      this.box.revealAll();
      if (a.readTime >= 0.07) this.advance();
      return;
    }
    if (advancePressed) {
      if (this.box.revealing) this.box.revealAll();
      else this.advance();
      return;
    }
    if (this.auto && !speaking) {
      const len = a.line?.text.length ?? 0;
      if (a.readTime >= this.game.settings.gameplay.autoAdvanceDelay * 0.6 + len * 0.018) this.advance();
    }
  }

  // ------------------------------------------------------------------ staging
  private visualOf(id: string | null): CharacterVisual | null {
    if (!id) return null;
    const g = this.game;
    if (g.player?.characterId === id) return g.player.visual;
    return g.actors.get(id)?.visual ?? null;
  }

  private speakerVisual(): CharacterVisual | null {
    const a = this.active;
    return a && !a.line?.thought ? this.visualOf(a.speaker) : null;
  }

  private head(id: string | null, out: Vector3): Vector3 | null {
    const v = this.visualOf(id);
    return v ? v.socketPosition('head', out) : null;
  }

  /** The person Subaru is mostly talking to. */
  private partner(def: DialogueDef): string | null {
    const player = this.game.player?.characterId ?? 'subaru';
    return def.cast.find((c) => c !== player && this.visualOf(c)) ?? null;
  }

  private stageStart(def: DialogueDef, camera: 'auto' | 'keep'): void {
    const g = this.game;
    const player = g.player;
    const partnerId = this.partner(def);
    if (!player || !partnerId) return;
    const partnerHead = this.head(partnerId, new Vector3());
    if (!partnerHead) return;
    // Face each other (cinematics place people themselves and use 'keep').
    if (camera === 'auto') {
      void player.faceTowards(partnerHead);
      const pa = g.actors.get(partnerId);
      if (pa && pa.position.distanceTo(player.entity.object3D.position) < 6) void pa.faceTowards(player.entity.object3D.position);
      const mine = player.visual.socketPosition('head', new Vector3());
      this.conv.begin(mine, partnerHead, g.camera.camera.position);
    }
  }

  private stageLine(line: DialogueLine): void {
    const a = this.active!;
    const v = this.visualOf(line.speaker);
    if (v) {
      a.touched.add(v);
      if (line.expression) v.setExpression(line.expression, 1, 600);
      if (line.anim) void v.play(line.anim);
      if (!line.thought && !this.skipping && !this.fastForward) v.setSpeaking(true);
    }
    if (line.thought || !line.speaker) return;
    // The speaker addresses someone; everyone else watches the speaker.
    const addressee = this.addressee(line);
    const speakerHead = this.head(line.speaker, _h1);
    const addrHead = this.head(addressee, _h2);
    if (v && addrHead) v.lookAt(addrHead, 0.9);
    if (!speakerHead) return;
    for (const id of a.def.cast) {
      if (id === line.speaker) continue;
      const w = this.visualOf(id);
      if (!w) continue;
      a.touched.add(w);
      w.lookAt(speakerHead, 0.85);
    }
  }

  private addressee(line: DialogueLine): string | null {
    const a = this.active!;
    const player = this.game.player?.characterId ?? 'subaru';
    if (line.to) return line.to;
    if (a.prevSpeaker && a.prevSpeaker !== line.speaker) return a.prevSpeaker;
    return line.speaker === player ? this.partner(a.def) : player;
  }

  /** Does a cast member other than `except` stand between the camera and the subject? */
  private blocked(from: Vector3, to: Vector3, except: Array<string | null>): boolean {
    const a = this.active!;
    const seg = _seg.subVectors(to, from);
    const len = seg.length();
    seg.divideScalar(len);
    for (const id of a.def.cast) {
      if (except.includes(id)) continue;
      const v = this.visualOf(id);
      if (!v) continue;
      for (const socket of ['head', 'chest']) {
        const p = v.socketPosition(socket, _pt);
        const t = _h2.subVectors(p, from).dot(seg);
        if (t < 0.3 || t > len - 0.3) continue;
        if (p.distanceTo(_h2.copy(from).addScaledVector(seg, t)) < 0.32) return true;
      }
    }
    return false;
  }

  private frameLine(line: DialogueLine): void {
    const a = this.active!;
    const g = this.game;
    let kind: ShotKind | 'keep' = 'keep';
    const hint = line.shot ?? 'auto';
    const newSpeaker = line.speaker !== a.shotSpeaker;
    if (hint !== 'auto') kind = hint;
    else if (!line.speaker || line.thought) kind = a.shots === 0 ? 'wide' : 'keep';
    else if (newSpeaker) {
      a.sameSpeakerLines = 0;
      kind = 'ots';
    } else {
      a.sameSpeakerLines++;
      kind = a.sameSpeakerLines === 1 ? 'single' : 'keep';
    }
    if (kind === 'keep') return;
    const group = a.def.cast.map((id) => this.head(id, new Vector3())).filter((p): p is Vector3 => !!p);
    const speakerHead = this.head(line.speaker, new Vector3()) ?? group[0];
    if (!speakerHead) return;
    const listenerId = line.speaker ? this.addressee(line) : null;
    const listenerHead = this.head(listenerId, new Vector3());
    let shot = this.conv.compose(kind, speakerHead, listenerHead, group);
    // Someone else standing in the way? Try other coverage before settling.
    if (kind !== 'wide' && this.blocked(shot.position, speakerHead, [line.speaker, listenerId])) {
      for (const alt of ['single', 'two', 'wide'] as ShotKind[]) {
        if (alt === kind) continue;
        const s2 = this.conv.compose(alt, speakerHead, listenerHead, group);
        if (alt === 'wide' || !this.blocked(s2.position, speakerHead, [line.speaker, listenerId])) {
          shot = s2;
          break;
        }
      }
    }
    if (a.shots === 0) g.camera.blendTo(shot, 0.9, 'inOutCubic');
    else g.camera.cut(shot);
    a.shots++;
    a.shotSpeaker = line.speaker;
  }
}

const _h1 = new Vector3();
const _seg = new Vector3();
const _pt = new Vector3();
const _h2 = new Vector3();
