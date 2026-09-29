import type { MusicState } from '../core/events/GameEvents';
import { Synth } from './Synth';

type Layer = 'pad' | 'arp' | 'bass' | 'drums' | 'lead' | 'bells';

interface Style {
  bpm: number;
  /** Chords as MIDI notes (root position voicings around middle C). */
  chords: number[][];
  /** Bars per chord. */
  barsPerChord: number;
  layers: Partial<Record<Layer, number>>;
  /** Chance an arp step sounds. */
  arpDensity: number;
  padBright: number;
}

// D minor is home: the dunes at night. Chords: [bass root, ...upper voices].
const Dm = [50, 62, 65, 69];
const Bb = [46, 62, 65, 70];
const F = [41, 60, 65, 69];
const C = [48, 60, 64, 67];
const A = [45, 61, 64, 69];
const Eb = [51, 63, 67, 70];
const Gm = [43, 62, 67, 70];
const Am = [45, 60, 64, 69];
const E = [40, 59, 64, 68];

const STYLES: Record<Exclude<MusicState, 'silence'>, Style> = {
  exploration: { bpm: 72, chords: [Dm, Bb, F, C], barsPerChord: 2, layers: { pad: 1, arp: 0.7, bass: 0.6, bells: 0.25 }, arpDensity: 0.45, padBright: 0.8 },
  safe: { bpm: 66, chords: [F, C, Dm, Bb], barsPerChord: 2, layers: { pad: 0.9, arp: 0.9, bells: 0.5, bass: 0.4 }, arpDensity: 0.6, padBright: 1 },
  mystery: { bpm: 60, chords: [Am, F, Dm, E], barsPerChord: 2, layers: { pad: 0.8, bells: 1, bass: 0.5 }, arpDensity: 0.35, padBright: 0.7 },
  tension: { bpm: 96, chords: [Dm, Eb, Dm, Gm], barsPerChord: 1, layers: { pad: 0.8, bass: 1, arp: 0.5 }, arpDensity: 0.8, padBright: 0.6 },
  combat: { bpm: 140, chords: [Dm, Bb, C, A], barsPerChord: 1, layers: { pad: 0.7, bass: 1, drums: 1, lead: 0.8, arp: 0.5 }, arpDensity: 0.7, padBright: 1.1 },
  boss: { bpm: 150, chords: [Dm, Eb, Bb, A], barsPerChord: 1, layers: { pad: 0.8, bass: 1, drums: 1, lead: 1, arp: 0.6 }, arpDensity: 0.8, padBright: 1.2 },
  cinematic: { bpm: 56, chords: [Dm, Bb, Gm, A], barsPerChord: 2, layers: { pad: 1, bells: 0.4, bass: 0.5 }, arpDensity: 0.2, padBright: 0.9 },
};

/** The combat motif (scale degrees over the chord root, 8th-note grid; null = rest). */
const MOTIF: Array<number | null> = [0, null, 3, 5, 7, null, 5, 3, 2, null, 0, null, 3, 2, 0, null];

/**
 * Adaptive score, synthesized live. The game names a mood ("exploration",
 * "combat", "cinematic"...); the director keeps one continuous piece going
 * and reshapes it — tempo, harmony and which layers play — crossfading
 * layers at bar boundaries so transitions never cut. Scheduling uses the
 * audio clock with a short lookahead, so timing is sample-accurate.
 */
export class MusicDirector {
  private readonly layerGain = new Map<Layer, GainNode>();
  private state: MusicState = 'silence';
  private style: Style | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private chordIndex = 0;
  private barsOnChord = 0;

  constructor(
    private readonly synth: Synth,
    out: AudioNode,
  ) {
    const c = synth.ctx;
    const wet = c.createGain();
    wet.gain.value = 0.32;
    synth.reverb.connect(wet);
    wet.connect(out);
    for (const l of ['pad', 'arp', 'bass', 'drums', 'lead', 'bells'] as Layer[]) {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(out);
      if (l === 'pad' || l === 'arp' || l === 'lead' || l === 'bells') g.connect(synth.reverb);
      this.layerGain.set(l, g);
    }
  }

  get current(): MusicState {
    return this.state;
  }

  set(state: MusicState): void {
    if (state === this.state) return;
    this.state = state;
    const c = this.synth.ctx;
    const style = state === 'silence' ? null : STYLES[state];
    const now = c.currentTime;
    for (const [l, g] of this.layerGain) {
      const target = style?.layers[l] ?? 0;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(target, now + (state === 'combat' || state === 'boss' ? 1.2 : 2.8));
    }
    if (style) {
      const wasPlaying = this.style !== null;
      this.style = style;
      if (!wasPlaying) {
        this.nextTime = now + 0.1;
        this.step = 0;
        this.chordIndex = 0;
        this.barsOnChord = 0;
      }
      this.chordIndex %= style.chords.length;
      this.start();
    } else {
      // Let the tails ring out, then stop scheduling.
      window.setTimeout(() => {
        if (this.state === 'silence') {
          this.style = null;
          this.stop();
        }
      }, 3200);
    }
  }

  private start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const c = this.synth.ctx;
    const style = this.style;
    if (!style || c.state !== 'running') return;
    const sixteenth = 60 / style.bpm / 4;
    // Never fall far behind (a backgrounded tab): skip ahead instead of bursting.
    if (this.nextTime < c.currentTime - 0.2) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.14) {
      this.playStep(style, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.barsOnChord++;
        if (this.barsOnChord >= style.barsPerChord) {
          this.barsOnChord = 0;
          this.chordIndex = (this.chordIndex + 1) % style.chords.length;
        }
      }
    }
  }

  private playStep(style: Style, step: number, t: number, sixteenth: number): void {
    const s = this.synth;
    const chord = style.chords[this.chordIndex % style.chords.length]!;
    const [root, ...upper] = chord;
    const bar = sixteenth * 16;
    const L = (l: Layer) => this.layerGain.get(l)!;
    // Pad: a chord at the start of each chord change.
    if (step === 0 && this.barsOnChord === 0 && style.layers.pad) s.pad(L('pad'), upper, t, bar * style.barsPerChord, 0.09, style.padBright);
    // Bass
    if (style.layers.bass) {
      if (style.layers.drums) {
        if (step % 2 === 0) s.bass(L('bass'), root! + (step % 8 === 6 ? 7 : 0), t, sixteenth * 1.6, 0.14);
      } else if (step === 0) s.bass(L('bass'), root!, t, bar * 0.9, 0.12);
    }
    // Arpeggio: chord tones up and down, sparse at low density.
    if (style.layers.arp && step % 2 === 0 && Math.random() < style.arpDensity) {
      const tones = [...upper, upper[0]! + 12, upper[1]! + 12];
      const k = (step / 2) % tones.length;
      s.pluck(L('arp'), tones[k]!, t, 0.07, 0.9);
    }
    // Bells: a slow, high melody note now and then.
    if (style.layers.bells && step % 8 === 0 && Math.random() < 0.45) {
      const tones = upper.map((n) => n + 12);
      s.bell(L('bells'), tones[Math.floor(Math.random() * tones.length)]!, t, 0.05, 2.6);
    }
    // Drums
    if (style.layers.drums) {
      if (step % 8 === 0 || step === 10) s.thump(L('drums'), t, 130, 42, 0.32, 0.5);
      if (step % 8 === 4) {
        s.noiseHit(L('drums'), t, { type: 'bandpass', freq: 1900, q: 0.9, level: 0.22, decay: 0.16 });
        s.thump(L('drums'), t, 220, 160, 0.1, 0.12);
      }
      if (step % 2 === 1) s.noiseHit(L('drums'), t, { type: 'highpass', freq: 7200, level: 0.05, decay: 0.04 });
    }
    // Lead motif (combat)
    if (style.layers.lead && step % 2 === 0) {
      const deg = MOTIF[(step / 2 + (this.barsOnChord % 2) * 8) % MOTIF.length];
      if (deg !== null && deg !== undefined) s.lead(L('lead'), root! + 24 + deg, t, sixteenth * 1.8, 0.05);
    }
  }
}
