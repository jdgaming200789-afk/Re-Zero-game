import { Rng } from '../../core/math/MathUtil';

/** Seeded 2D Perlin noise with fBm and ridged variants (deterministic terrain). */
export class Noise2D {
  private readonly perm = new Uint8Array(512);
  private readonly grads: Float32Array;

  constructor(seed: number) {
    const rng = new Rng(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [p[i], p[j]] = [p[j]!, p[i]!];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
    this.grads = new Float32Array(512);
    for (let i = 0; i < 256; i++) {
      const a = rng.next() * Math.PI * 2;
      this.grads[i * 2] = Math.cos(a);
      this.grads[i * 2 + 1] = Math.sin(a);
    }
  }

  noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const g = (ix: number, iy: number, dx: number, dy: number) => {
      const h = this.perm[ix + this.perm[iy]!]! * 2;
      return this.grads[h]! * dx + this.grads[h + 1]! * dy;
    };
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const n00 = g(X, Y, xf, yf);
    const n10 = g(X + 1, Y, xf - 1, yf);
    const n01 = g(X, Y + 1, xf, yf - 1);
    const n11 = g(X + 1, Y + 1, xf - 1, yf - 1);
    const a = n00 + u * (n10 - n00);
    const b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.414;
  }

  fbm(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * f + i * 17.3, y * f - i * 9.1) * amp;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged noise in [0,1]: sharp crests like dune ridges. */
  ridged(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let prev = 1;
    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(this.noise(x * f + i * 31.7, y * f + i * 5.3));
      n *= n;
      sum += n * amp * prev;
      prev = n;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum;
  }
}
