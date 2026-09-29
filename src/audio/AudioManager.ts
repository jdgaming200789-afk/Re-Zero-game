import { Vector3 } from 'three';
import { CHARACTERS } from '../data/characters';
import { createLogger } from '../core/Log';
import type { GameContext, GameSystem } from '../game/GameContext';
import type { VoiceProvider } from '../story/dialogue/DialogueSystem';
import { MusicDirector } from './MusicDirector';
import { Synth } from './Synth';

const log = createLogger('Audio');

type Bus = 'music' | 'sfx' | 'ambient' | 'voice' | 'ui';

const VOWEL_PITCH: Record<string, number> = { a: 1, e: 1.12, i: 1.25, o: 0.9, u: 0.84 };

/**
 * A synthetic room impulse: decaying stereo noise, darker as `bright` falls
 * (a one-pole low-pass that closes over the tail, as real rooms do).
 */
function impulseResponse(ctx: BaseAudioContext, seconds: number, bright: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const env = Math.pow(1 - u, 2.4) * Math.exp(-u * 3);
      const k = Math.max(0.03, bright * (1 - u * 0.8));
      lp += (Math.random() * 2 - 1 - lp) * k;
      data[i] = lp * env * (i < rate * 0.004 ? i / (rate * 0.004) : 1);
    }
  }
  return buf;
}

/**
 * All sound. Mixer buses follow the audio settings; the music director
 * scores the current mood; sound effects answer game events (stingers,
 * hits, notifications, story moments, footsteps); ambience follows the
 * area; characters speak in voice blips shaped by their voice data.
 *
 * Browsers only let audio start after a user gesture; until then the
 * context waits suspended and everything silently no-ops.
 */
export class AudioManager implements GameSystem, VoiceProvider {
  readonly name = 'audio';
  readonly ctx: AudioContext | null;
  private readonly synth: Synth | null = null;
  private readonly master: GainNode | null = null;
  private readonly duck: GainNode | null = null;
  private readonly reverbIn: GainNode | null = null;
  private readonly reverb: ConvolverNode | null = null;
  private readonly reverbWet: GainNode | null = null;
  /** Which room the reverb is shaped like (tests and debugging). */
  room = 'none';
  private crackleT = 0;
  private readonly buses = new Map<Bus, GainNode>();
  readonly music: MusicDirector | null = null;
  private ambient: { stop(): void } | null = null;
  private lastBlip = 0;
  private stepDistance = 0;
  private readonly lastPos = new Vector3();
  private blipCount = 0;
  /** Subaru's pulse (0 off .. 1 pounding) and when the next beat falls. */
  private heartLevel = 0;
  private nextBeat = 0;
  private beats = 0;

  constructor(private readonly game: GameContext) {
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    let ctx: AudioContext | null = null;
    try {
      ctx = Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
    } catch (err) {
      log.warn('WebAudio unavailable', err);
    }
    this.ctx = ctx;
    if (!ctx) return;
    this.synth = new Synth(ctx);
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // Music runs through a ducker (dialogue lowers it); sound effects and
    // voices also feed the room's reverb.
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.reverbIn.connect(this.reverb);
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.master);
    for (const b of ['music', 'sfx', 'ambient', 'voice', 'ui'] as Bus[]) {
      const g = ctx.createGain();
      g.connect(b === 'music' ? this.duck : this.master);
      if (b === 'sfx' || b === 'voice') g.connect(this.reverbIn);
      this.buses.set(b, g);
    }
    this.music = new MusicDirector(this.synth, this.bus('music'));
    this.applyVolumes();
    // Unlock on the first gesture.
    const resume = () => {
      if (ctx.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('pointerdown', resume, { capture: true });
    window.addEventListener('keydown', resume, { capture: true });
    this.listen();
  }

  private bus(b: Bus): GainNode {
    return this.buses.get(b)!;
  }

  private get now(): number {
    return this.ctx ? this.ctx.currentTime + 0.01 : 0;
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const a = this.game.settings.audio;
    const t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(a.master, t, 0.05);
    this.bus('music').gain.setTargetAtTime(a.music * 0.8, t, 0.05);
    this.bus('sfx').gain.setTargetAtTime(a.sfx, t, 0.05);
    this.bus('ambient').gain.setTargetAtTime(a.ambient * 0.7, t, 0.05);
    this.bus('voice').gain.setTargetAtTime(a.voice, t, 0.05);
    this.bus('ui').gain.setTargetAtTime(a.ui, t, 0.05);
  }

  // ------------------------------------------------------------------ events
  private listen(): void {
    const ev = this.game.events;
    ev.on('settings:changed', ({ key }) => {
      if (key === '*' || key.startsWith('audio')) this.applyVolumes();
    });
    ev.on('audio:musicState', ({ state }) => this.music?.set(state));
    ev.on('audio:stinger', ({ id }) => this.stinger(id));
    ev.on('audio:heartbeat', ({ level }) => {
      this.heartLevel = Math.max(0, Math.min(1, level));
    });
    ev.on('area:entered', ({ areaId }) => {
      this.setAmbience(areaId);
      this.setRoom(areaId);
    });
    // Dialogue sits on top of the score: duck it while people talk.
    ev.on('dialogue:started', () => this.setDuck(0.5, 0.35));
    ev.on('dialogue:ended', () => this.setDuck(1, 1.2));
    ev.on('story:event', ({ id }) => this.storyCue(id));
    ev.on('combat:hit', ({ critical, damageType }) => this.hit(damageType, critical));
    ev.on('ui:notify', ({ kind }) => this.chime(kind ?? 'info'));
    ev.on('quest:completed', () => this.fanfare());
    ev.on('knowledge:learned', () => this.chime('knowledge'));
    ev.on('checkpoint:reached', () => this.stinger('return_point'));
    ev.on('rbd:returned', () => this.stinger('rbd_return'));
    ev.on('interaction:started', () => this.click());
    ev.on('bark:play', ({ speakerId, text }) => this.babble(speakerId, text));
    ev.on('game:modeChanged', ({ to }) => {
      if (to === 'death') this.music?.set('silence');
    });
  }

  // ------------------------------------------------------------------ voice (VoiceProvider)
  line(): number | null {
    // No recorded voice-over; letters speak as blips.
    return null;
  }

  letter(speakerId: string | null, ch: string): void {
    if (!this.ready || !speakerId) return;
    const v = CHARACTERS[speakerId]?.voice;
    if (!v) return;
    const t = this.ctx!.currentTime;
    if (t - this.lastBlip < 1 / v.rate) return;
    if (!/[a-z0-9]/i.test(ch)) return;
    this.lastBlip = t;
    const vowel = VOWEL_PITCH[ch.toLowerCase()] ?? 1 + ((ch.charCodeAt(0) * 37) % 7) / 40 - 0.08;
    this.synth!.blip(this.bus('voice'), t + 0.005, v.pitch * vowel, v.timbre, 0.045);
    this.blipCount++;
  }

  stop(): void {
    /* blips are short; nothing to cut */
  }

  /** A bark: a quick run of syllables. */
  private babble(speakerId: string, text: string): void {
    if (!this.ready) return;
    const v = CHARACTERS[speakerId]?.voice;
    if (!v) return;
    const letters = text.replace(/[^a-z]/gi, '').slice(0, Math.max(3, Math.min(14, Math.round(text.length / 4))));
    let t = this.now;
    for (const ch of letters) {
      const vowel = VOWEL_PITCH[ch.toLowerCase()] ?? 1;
      this.synth!.blip(this.bus('voice'), t, v.pitch * vowel, v.timbre, 0.03);
      t += 1 / v.rate;
    }
  }

  // ------------------------------------------------------------------ effects
  private stinger(id: string): void {
    if (!this.ready) return;
    const s = this.synth!;
    const t = this.now;
    const sfx = this.bus('sfx');
    switch (id) {
      case 'rbd_death':
        s.thump(sfx, t, 70, 40, 0.5, 0.6);
        s.thump(sfx, t + 0.28, 64, 38, 0.5, 0.45);
        s.noiseHit(sfx, t + 0.2, { type: 'lowpass', freq: 300, level: 0.25, attack: 1.6, decay: 1.4, sweepTo: 2400 });
        s.glide(sfx, t, [220, 207], 3, 0.05, 'sawtooth', 12);
        s.glide(sfx, t, [233, 246], 3, 0.04, 'sawtooth', 12);
        break;
      case 'witch_punish':
        for (let i = 0; i < 7; i++) s.thump(sfx, t + i * (0.7 - i * 0.07), 68, 40, 0.3, 0.55);
        s.glide(sfx, t, [55, 52], 3.4, 0.12, 'sawtooth');
        s.glide(sfx, t + 0.5, [2400, 3100], 2.6, 0.02, 'sine', 30);
        break;
      case 'rbd_return':
        for (let i = 0; i < 5; i++) s.noiseHit(sfx, t + i * 0.03, { type: 'highpass', freq: 4000 + i * 900, level: 0.12, decay: 0.35 });
        s.bell(sfx, 86, t, 0.06, 1.8);
        s.noiseHit(sfx, t + 0.4, { type: 'bandpass', freq: 900, q: 1.2, level: 0.08, attack: 0.1, decay: 0.5 }); // the gasp
        break;
      case 'heliosphere_glint':
        for (const f of [2637, 3136, 3520]) s.glide(sfx, t, [f, f * 1.01], 1.4, 0.025, 'sine', 25);
        s.bell(sfx, 100, t, 0.05, 1.5);
        break;
      case 'heliosphere_strike':
        s.thump(sfx, t, 90, 28, 2.2, 0.9);
        s.noiseHit(sfx, t, { type: 'lowpass', freq: 5000, level: 0.5, decay: 1.8, sweepTo: 200 });
        s.noiseHit(sfx, t + 0.05, { type: 'highpass', freq: 3000, level: 0.2, decay: 0.9 });
        break;
      case 'earthworm_tremor':
        s.noiseHit(this.bus('sfx'), t, { type: 'lowpass', freq: 140, level: 0.6, attack: 0.3, decay: 1.4 });
        s.thump(sfx, t + 0.2, 45, 30, 1.2, 0.35);
        break;
      case 'witchbeast_howl':
        s.glide(sfx, t, [310, 620, 560, 400], 1.6, 0.06, 'sawtooth', 20);
        s.glide(sfx, t + 0.25, [290, 580, 520, 380], 1.5, 0.04, 'sawtooth', 24);
        break;
      case 'return_point':
        s.bell(this.bus('ui'), 81, t, 0.05, 2.4);
        s.bell(this.bus('ui'), 88, t + 0.18, 0.035, 2.4);
        break;
      case 'star_burn':
        // A wrong star: white-hot sizzle and a falling whine.
        s.noiseHit(sfx, t, { type: 'highpass', freq: 5200, level: 0.3, decay: 0.7, sweepTo: 1400 });
        s.glide(sfx, t, [2200, 1400, 520], 0.8, 0.05, 'sawtooth', 14);
        s.thump(sfx, t, 110, 45, 0.35, 0.4);
        break;
      default:
        break;
    }
  }

  /** Musical punctuation for story moments that have no stinger of their own. */
  private storyCue(id: string): void {
    if (!this.ready) return;
    const s = this.synth!;
    const t = this.now;
    const sfx = this.bus('sfx');
    switch (id) {
      case 'tay.sky':
        // The white room opens into the night: a rising shimmer.
        [72, 76, 79, 84, 88, 91].forEach((n, i) => s.bell(sfx, n, t + i * 0.22, 0.035, 3.2));
        s.noiseHit(sfx, t, { type: 'highpass', freq: 6000, level: 0.08, attack: 1.2, decay: 2.4 });
        break;
      case 'tay.touch.orion.rigel':
        s.bell(sfx, 93, t, 0.07, 3.6);
        s.bell(sfx, 100, t + 0.05, 0.04, 3.6);
        break;
      case 'tay.library':
        // Shelves rising from the floor, then a warm chord.
        s.noiseHit(sfx, t, { type: 'lowpass', freq: 140, level: 0.45, attack: 0.6, decay: 3.6 });
        s.thump(sfx, t + 0.2, 50, 32, 2.5, 0.35);
        [62, 66, 69, 74, 78].forEach((n, i) => s.pluck(sfx, n, t + 2.4 + i * 0.12, 0.07, 2.2));
        s.bell(sfx, 86, t + 3.1, 0.05, 3.2);
        break;
      case 'alc.rem_laid':
        [79, 83, 86].forEach((n, i) => s.bell(sfx, n, t + i * 0.35, 0.03, 3.4));
        break;
      default:
        break;
    }
  }

  /** Lower (or restore) the score under dialogue. */
  private setDuck(level: number, seconds: number): void {
    if (!this.ctx || !this.duck) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(level, t, seconds / 3);
  }

  /** Shape the reverb like the room Subaru is in. */
  private setRoom(areaId: string): void {
    if (!this.ctx || !this.reverb || !this.reverbWet) return;
    const rooms: Record<string, { wet: number; seconds: number; bright: number }> = {
      tower_foot: { wet: 0.05, seconds: 1.4, bright: 0.55 },
      celaeno: { wet: 0.4, seconds: 3.8, bright: 0.45 },
      alcyone: { wet: 0.14, seconds: 0.9, bright: 0.3 },
      taygeta: { wet: 0.32, seconds: 2.8, bright: 0.85 },
    };
    const r = rooms[areaId] ?? { wet: 0.1, seconds: 1.2, bright: 0.5 };
    this.reverb.buffer = impulseResponse(this.ctx, r.seconds, r.bright);
    const t = this.ctx.currentTime;
    this.reverbWet.gain.cancelScheduledValues(t);
    this.reverbWet.gain.setTargetAtTime(r.wet, t, 0.4);
    this.room = areaId in rooms ? areaId : 'default';
  }

  private hit(type: string, critical: boolean): void {
    if (!this.ready) return;
    const s = this.synth!;
    const t = this.now;
    const sfx = this.bus('sfx');
    s.thump(sfx, t, critical ? 180 : 140, 60, 0.16, critical ? 0.4 : 0.28);
    const freq = type === 'ice' ? 5200 : type === 'yin' ? 900 : type === 'wind' ? 3000 : type === 'light' ? 6500 : 2200;
    s.noiseHit(sfx, t, { type: 'bandpass', freq, q: 1.1, level: critical ? 0.3 : 0.2, decay: critical ? 0.22 : 0.12 });
  }

  private chime(kind: string): void {
    if (!this.ready) return;
    const s = this.synth!;
    const t = this.now;
    const ui = this.bus('ui');
    if (kind === 'quest') [74, 78, 81].forEach((n, i) => s.pluck(ui, n, t + i * 0.09, 0.08, 1.2));
    else if (kind === 'knowledge') {
      s.bell(ui, 83, t, 0.06, 2.4);
      s.bell(ui, 90, t + 0.22, 0.04, 2.4);
    } else if (kind === 'item') [79, 86].forEach((n, i) => s.pluck(ui, n, t + i * 0.08, 0.07, 0.8));
    else if (kind === 'warning') s.glide(ui, t, [180, 150], 0.25, 0.05, 'square');
    else s.pluck(ui, 81, t, 0.05, 0.6);
  }

  private fanfare(): void {
    if (!this.ready) return;
    const s = this.synth!;
    const t = this.now;
    const ui = this.bus('ui');
    [62, 66, 69, 74].forEach((n, i) => s.pluck(ui, n, t + i * 0.11, 0.09, 1.6));
    s.bell(ui, 86, t + 0.44, 0.05, 2.8);
  }

  private click(): void {
    if (!this.ready) return;
    this.synth!.noiseHit(this.bus('ui'), this.now, { type: 'bandpass', freq: 2600, q: 2, level: 0.06, decay: 0.04 });
  }

  // ------------------------------------------------------------------ ambience
  private setAmbience(areaId: string): void {
    this.ambient?.stop();
    this.ambient = null;
    if (!this.ctx || !this.synth) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.synth.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    if (areaId === 'tower_foot') {
      // Desert wind: a band of noise that swells and sighs.
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 0.6;
      lfo.frequency.value = 0.08;
      lg.gain.value = 260;
      lfo.connect(lg);
      lg.connect(f.frequency);
      g.gain.value = 0.18;
    } else if (areaId === 'celaeno') {
      // A vast stone room: low, still air.
      f.type = 'lowpass';
      f.frequency.value = 160;
      lfo.frequency.value = 0.05;
      lg.gain.value = 30;
      lfo.connect(lg);
      lg.connect(f.frequency);
      g.gain.value = 0.14;
    } else if (areaId === 'alcyone') {
      // A lived-in room: soft, warm air (the hearth crackles on top, per frame).
      f.type = 'lowpass';
      f.frequency.value = 240;
      lfo.frequency.value = 0.07;
      lg.gain.value = 40;
      lfo.connect(lg);
      lg.connect(f.frequency);
      g.gain.value = 0.09;
    } else if (areaId === 'taygeta') {
      // The white room: a thin, high, sourceless tone.
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 6;
      lfo.frequency.value = 0.11;
      lg.gain.value = 500;
      lfo.connect(lg);
      lg.connect(f.frequency);
      g.gain.value = 0.05;
    } else {
      g.gain.value = 0.04;
      f.type = 'lowpass';
      f.frequency.value = 220;
    }
    src.connect(f);
    f.connect(g);
    g.connect(this.bus('ambient'));
    src.start();
    lfo.start();
    const t0 = c.currentTime;
    const level = g.gain.value;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + 2.5);
    this.ambient = {
      stop: () => {
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 1.5);
        src.stop(t + 1.6);
        lfo.stop(t + 1.6);
        src.onended = () => [src, f, g, lfo, lg].forEach((n) => n.disconnect());
      },
    };
  }

  // ------------------------------------------------------------------ frame
  update(dt = 1 / 60): void {
    this.heartbeat();
    this.hearth(dt);
    // Footsteps from how far Subaru actually travelled.
    const p = this.game.player;
    if (!p || !this.ready) return;
    const pos = p.entity.object3D.position;
    const moved = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
    this.lastPos.copy(pos);
    if (moved > 2 || !p.motor.grounded || p.followTarget.speed < 0.3) return;
    this.stepDistance += moved;
    const stride = p.followTarget.speed > 5 ? 1.35 : p.followTarget.speed > 2.5 ? 1.05 : 0.72;
    if (this.stepDistance < stride) return;
    this.stepDistance = 0;
    const surface = this.game.scenes.current?.surfaceAt?.(pos.x, pos.z) ?? 'stone';
    this.footstep(surface, Math.min(1, p.followTarget.speed / 6));
  }

  /** One footfall on a surface; `loud` 0..1 with speed. */
  private footstep(surface: string, loud: number): void {
    const s = this.synth!;
    const t = this.now;
    const sfx = this.bus('sfx');
    this.steps++;
    this.lastSurface = surface;
    switch (surface) {
      case 'sand':
        s.noiseHit(sfx, t, { type: 'lowpass', freq: 900 + loud * 500, level: 0.05 + loud * 0.06, decay: 0.09 });
        break;
      case 'glass':
        // Fused sand: a hard, faintly ringing click that carries.
        s.noiseHit(sfx, t, { type: 'bandpass', freq: 3400, q: 3, level: 0.05 + loud * 0.07, decay: 0.05 });
        s.glide(sfx, t, [2600 + loud * 400, 2550], 0.18, 0.006 + loud * 0.01, 'sine');
        break;
      case 'wood':
        s.noiseHit(sfx, t, { type: 'bandpass', freq: 520, q: 1.3, level: 0.06 + loud * 0.06, decay: 0.07 });
        s.thump(sfx, t, 130, 90, 0.07, 0.05 + loud * 0.05);
        break;
      case 'soft':
        s.noiseHit(sfx, t, { type: 'lowpass', freq: 600, level: 0.03 + loud * 0.03, decay: 0.07 });
        break;
      default:
        s.noiseHit(sfx, t, { type: 'bandpass', freq: 1600, q: 1.4, level: 0.04 + loud * 0.05, decay: 0.05 });
        break;
    }
  }

  /** The hearth in Alcyone: pops and crackles, louder near the fire. */
  private hearth(dt: number): void {
    if (!this.ready || this.game.scenes.current?.id !== 'alcyone') return;
    this.crackleT -= dt;
    if (this.crackleT > 0) return;
    this.crackleT = 0.08 + Math.random() * 0.45;
    const p = this.game.player?.entity.object3D.position;
    // The hearth sits against the outer wall, 60° round from the stair.
    const d = p ? Math.hypot(p.x - 16.5, p.z - 9.5) : 20;
    const near = Math.max(0, 1 - d / 16);
    if (near <= 0.02) return;
    this.synth!.noiseHit(this.bus('ambient'), this.now, { type: 'highpass', freq: 1800 + Math.random() * 2400, level: (0.02 + Math.random() * 0.05) * near, decay: 0.02 + Math.random() * 0.05 });
  }

  /** Footsteps played so far and on what (tests). */
  steps = 0;
  lastSurface = '';

  /** A low lub-dub that quickens with the threat; silent below a whisper of it. */
  private heartbeat(): void {
    if (!this.ready || this.heartLevel < 0.1 || this.game.mode === 'death') return;
    const t = this.ctx!.currentTime;
    if (t < this.nextBeat) return;
    const lvl = this.heartLevel;
    const s = this.synth!;
    const sfx = this.bus('sfx');
    s.thump(sfx, t + 0.01, 62, 38, 0.16, 0.12 + lvl * 0.3);
    s.thump(sfx, t + 0.17, 54, 34, 0.18, 0.08 + lvl * 0.22);
    this.nextBeat = t + 60 / (64 + lvl * 86);
    this.beats++;
  }

  /** Heartbeats played so far (tests). */
  get heartbeats(): number {
    return this.beats;
  }

  /** Blips spoken so far (tests). */
  get voiced(): number {
    return this.blipCount;
  }
}
