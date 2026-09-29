/**
 * Small WebAudio synthesis toolkit: every sound in the game is generated,
 * so there are no audio assets to load and nothing to license. Each voice
 * builds a short node graph, schedules its envelope on the audio clock and
 * cleans itself up when it ends.
 */
export class Synth {
  readonly noise: AudioBuffer;
  readonly reverb: ConvolverNode;

  constructor(readonly ctx: AudioContext) {
    this.noise = makeNoise(ctx, 2);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 2.8, 2.2);
  }

  /** Frequency of a MIDI note. */
  static hz(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number, sustain: number, release: number, length: number): number {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + attack);
    p.setTargetAtTime(peak * sustain, t + attack, decay / 3);
    const end = t + Math.max(length, attack + 0.01);
    p.setTargetAtTime(0.0001, end, release / 4);
    return end + release;
  }

  private done(nodes: AudioScheduledSourceNode[], stopAt: number, cleanup: AudioNode[]): void {
    for (const n of nodes) n.stop(stopAt);
    nodes[0]!.onended = () => {
      for (const n of cleanup) n.disconnect();
    };
  }

  /** Warm string pad: detuned saws through a slowly opening low-pass. */
  pad(out: AudioNode, midi: number[], t: number, length: number, level = 0.08, bright = 1): void {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(300 * bright, t);
    f.frequency.linearRampToValueAtTime(1400 * bright, t + Math.min(2, length * 0.6));
    f.connect(g);
    g.connect(out);
    const oscs: OscillatorNode[] = [];
    for (const m of midi) {
      for (const det of [-7, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = Synth.hz(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        oscs.push(o);
      }
    }
    const end = this.env(g, t, level / Math.sqrt(midi.length), 1.2, 1, 0.85, 1.6, length);
    this.done(oscs, end, [g, f, ...oscs]);
  }

  /** Plucked tone (harp / piano-ish): triangle plus a soft octave. */
  pluck(out: AudioNode, midi: number, t: number, level = 0.12, decay = 0.9): void {
    const c = this.ctx;
    const g = c.createGain();
    g.connect(out);
    const a = c.createOscillator();
    a.type = 'triangle';
    a.frequency.value = Synth.hz(midi);
    const b = c.createOscillator();
    b.type = 'sine';
    b.frequency.value = Synth.hz(midi + 12);
    const bg = c.createGain();
    bg.gain.value = 0.35;
    a.connect(g);
    b.connect(bg);
    bg.connect(g);
    a.start(t);
    b.start(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    this.done([a, b], t + decay + 0.05, [g, bg, a, b]);
  }

  /** Bell / celesta: inharmonic partials with a long ring. */
  bell(out: AudioNode, midi: number, t: number, level = 0.1, decay = 2.2): void {
    const c = this.ctx;
    const g = c.createGain();
    g.connect(out);
    const oscs: OscillatorNode[] = [];
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.4],
      [5.4, 0.18],
      [8.9, 0.08],
    ] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = Synth.hz(midi) * ratio;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      oscs.push(o);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    this.done(oscs, t + decay + 0.05, [g, ...oscs]);
  }

  /** Round bass note. */
  bass(out: AudioNode, midi: number, t: number, length: number, level = 0.16): void {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.connect(g);
    g.connect(out);
    const a = c.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = Synth.hz(midi);
    const b = c.createOscillator();
    b.type = 'sine';
    b.frequency.value = Synth.hz(midi);
    a.connect(f);
    b.connect(f);
    a.start(t);
    b.start(t);
    const end = this.env(g, t, level, 0.01, 0.25, 0.6, 0.12, length);
    this.done([a, b], end, [g, f, a, b]);
  }

  /** Sustained lead with vibrato (the combat motif). */
  lead(out: AudioNode, midi: number, t: number, length: number, level = 0.07): void {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    f.connect(g);
    g.connect(out);
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = Synth.hz(midi);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = c.createGain();
    lg.gain.value = 9;
    lfo.connect(lg);
    lg.connect(o.detune);
    o.connect(f);
    o.start(t);
    lfo.start(t);
    const end = this.env(g, t, level, 0.04, 0.3, 0.7, 0.2, length);
    this.done([o, lfo], end, [g, f, o, lfo, lg]);
  }

  /** Filtered noise burst (footsteps, hats, wind gusts, impacts). */
  noiseHit(out: AudioNode, t: number, opts: { type: BiquadFilterType; freq: number; q?: number; level: number; attack?: number; decay: number; sweepTo?: number }): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = opts.type;
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.decay);
    f.Q.value = opts.q ?? 0.8;
    const g = c.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.level, t + (opts.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.attack ?? 0.003) + opts.decay);
    src.start(t, Math.random() * 1.5);
    this.done([src], t + (opts.attack ?? 0) + opts.decay + 0.05, [src, f, g]);
  }

  /** Pitched thump (kick drums, heartbeats, booms). */
  thump(out: AudioNode, t: number, from: number, to: number, decay: number, level: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay * 0.8);
    const g = c.createGain();
    o.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.start(t);
    this.done([o], t + decay + 0.05, [o, g]);
  }

  /** A gliding tone (howls, shimmer, whines). */
  glide(out: AudioNode, t: number, freqs: number[], length: number, level: number, type: OscillatorType = 'sine', vibrato = 0): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freqs[0]!, t);
    freqs.slice(1).forEach((fr, i) => o.frequency.linearRampToValueAtTime(fr, t + (length * (i + 1)) / (freqs.length - 1 || 1)));
    const g = c.createGain();
    const nodes: AudioNode[] = [o, g];
    const srcs: AudioScheduledSourceNode[] = [o];
    if (vibrato) {
      const lfo = c.createOscillator();
      lfo.frequency.value = 6;
      const lg = c.createGain();
      lg.gain.value = vibrato;
      lfo.connect(lg);
      lg.connect(o.detune);
      lfo.start(t);
      srcs.push(lfo);
      nodes.push(lfo, lg);
    }
    o.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + Math.min(0.15, length * 0.2));
    g.gain.setTargetAtTime(0.0001, t + length * 0.75, length * 0.08);
    o.start(t);
    this.done(srcs, t + length + 0.3, nodes);
  }

  /** One syllable of a character's voice. */
  blip(out: AudioNode, t: number, freq: number, timbre: 'soft' | 'bright' | 'breathy' | 'crisp' | 'deep', level = 0.05): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = timbre === 'soft' ? 'sine' : timbre === 'bright' ? 'triangle' : timbre === 'crisp' ? 'square' : timbre === 'deep' ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * (0.92 + Math.random() * 0.1), t + 0.07);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = timbre === 'crisp' ? 1800 : timbre === 'deep' ? 900 : 2600;
    const g = c.createGain();
    o.connect(f);
    f.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    o.start(t);
    this.done([o], t + 0.1, [o, f, g]);
    if (timbre === 'breathy') this.noiseHit(out, t, { type: 'bandpass', freq: freq * 4, q: 2, level: level * 0.4, decay: 0.06 });
  }
}

function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** A synthetic hall: decaying stereo noise. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}
