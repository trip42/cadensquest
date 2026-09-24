/* A small sound synthesiser, in the spirit of sfxr.

   Every sound effect in the game is a recipe: a few layers of tone or
   noise, each with a pitch that slides, a volume envelope and a filter,
   mixed and rendered to samples the first time the sound is needed. There
   are no audio files and nothing to license, and every sound is a few lines
   of data that can be tuned by ear on the sound board (/sounds, in dev).

   Pure maths — no Web Audio, no DOM — so it runs under test, where every
   recipe is rendered and checked for level, length and clicks. */

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';

/** A cutoff in Hz: fixed, or swept from the first value to the second over
 *  the layer's life. */
export type Cutoff = number | [number, number];

export interface Layer {
  wave: Wave;
  /** Pitch in Hz at the start. For noise, how often it picks a new value:
   *  low is crunchy and bitty, above the sample rate is plain hiss. */
  freq: number;
  /** Pitch at the end, glided to exponentially over the layer's life. */
  to?: number;
  /** Seconds after the sound starts that this layer comes in. */
  at?: number;
  /** Seconds to full volume, seconds held there, then seconds to fall away. */
  attack?: number;
  hold?: number;
  decay: number;
  /** How the fall-off bends: 1 is a straight line, higher drops away faster
   *  and leaves a longer, quieter tail. */
  curve?: number;
  /** An arpeggio: at each [seconds, ratio], the pitch is multiplied by the
   *  ratio — cumulatively, so [[0.06, 1.26], [0.12, 1.19]] climbs C, E, G. */
  steps?: Array<[number, number]>;
  /** Wobble: depth as a fraction of the pitch, rate in Hz. */
  vibrato?: { depth: number; rate: number };
  /** Pulse width of a square wave, 0..1. */
  duty?: number;
  /** This layer's share of the mix. */
  gain?: number;
  lowpass?: Cutoff;
  highpass?: Cutoff;
  /** Low-pass resonance: 0 is none, 0.9 rings. */
  resonance?: number;
  /** Soft clipping, for grit and punch: 0 is clean. */
  drive?: number;
}

export interface Recipe {
  layers: Layer[];
  /** Peak level after mixing, 0..1. Every sound is normalised to this. */
  gain?: number;
  /** Seed for the noise, so a recipe sounds the same every time. */
  seed?: number;
}

const DEFAULT_ATTACK = 0.002;
/** Silence left after the last layer ends, so nothing is cut off. */
const TAIL = 0.01;
/** Every sound fades in and out over this long at its very edges: a sound
 *  that starts or stops away from zero clicks. */
const EDGE = 0.002;

export const layerLength = (layer: Layer): number =>
  (layer.at ?? 0) + (layer.attack ?? DEFAULT_ATTACK) + (layer.hold ?? 0) + layer.decay;

/** How long a recipe lasts, in seconds. */
export const lengthOf = (recipe: Recipe): number =>
  Math.max(0, ...recipe.layers.map(layerLength)) + TAIL;

/** Mulberry32: small, seeded, and the same everywhere. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A state-variable filter in the "topology-preserving" form, which stays
   stable at any cutoff below Nyquist — so a sweep can go anywhere. One
   instance gives low-pass and high-pass outputs; a layer uses one each. */
class Filter {
  private ic1 = 0;
  private ic2 = 0;
  private cutoff = -1;
  private k = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;

  constructor(private readonly sampleRate: number, resonance = 0) {
    this.k = Math.max(0.05, Math.SQRT2 * (1 - Math.min(0.97, Math.max(0, resonance))));
  }

  private tune(cutoff: number): void {
    if (cutoff === this.cutoff) return;
    this.cutoff = cutoff;
    const g = Math.tan((Math.PI * Math.min(Math.max(cutoff, 10), this.sampleRate * 0.45)) / this.sampleRate);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  /** The outputs for the last sample run. */
  low = 0;
  high = 0;

  run(x: number, cutoff: number): void {
    this.tune(cutoff);
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.high = x - this.k * v1 - v2;
  }
}

/** Where a cutoff is at `u` (0..1) through the layer — swept exponentially,
 *  which is how pitch is heard. */
function cutoffAt(cutoff: Cutoff, u: number): number {
  if (typeof cutoff === 'number') return cutoff;
  const [from, to] = cutoff;
  return from * (to / from) ** u;
}

function renderLayer(layer: Layer, out: Float32Array, sampleRate: number, noise: () => number): void {
  const start = Math.round((layer.at ?? 0) * sampleRate);
  const attack = layer.attack ?? DEFAULT_ATTACK;
  const hold = layer.hold ?? 0;
  const { decay } = layer;
  const life = attack + hold + decay;
  const count = Math.min(out.length - start, Math.ceil(life * sampleRate));
  if (count <= 0) return;

  const curve = layer.curve ?? 2;
  const gain = layer.gain ?? 1;
  const duty = layer.duty ?? 0.5;
  const drive = layer.drive ?? 0;
  const driveNorm = drive > 0 ? Math.tanh(1 + drive) : 1;
  // Exponential glide, applied a sample at a time.
  const glide = (layer.to ?? layer.freq) / layer.freq;
  const perSample = glide ** (1 / (life * sampleRate));
  const steps = layer.steps ?? [];

  const lowFilter = layer.lowpass !== undefined ? new Filter(sampleRate, layer.resonance) : null;
  const highFilter = layer.highpass !== undefined ? new Filter(sampleRate) : null;
  let lowCut = 0;
  let highCut = 0;

  let base = layer.freq;
  let phase = 0;
  let held = noise() * 2 - 1;

  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const u = t / life;

    let freq = base;
    base *= perSample;
    for (const [when, ratio] of steps) if (t >= when) freq *= ratio;
    if (layer.vibrato) freq *= 1 + layer.vibrato.depth * Math.sin(2 * Math.PI * layer.vibrato.rate * t);

    phase += freq / sampleRate;
    if (phase >= 1) {
      phase -= Math.floor(phase);
      if (layer.wave === 'noise') held = noise() * 2 - 1;
    }

    let x: number;
    switch (layer.wave) {
      case 'sine': x = Math.sin(2 * Math.PI * phase); break;
      case 'triangle': x = 1 - 4 * Math.abs(phase - 0.5); break;
      case 'square': x = phase < duty ? 1 : -1; break;
      case 'saw': x = 2 * phase - 1; break;
      case 'noise': x = held; break;
      default: x = 0;
    }

    // A swept cutoff moves every 16 samples: plenty for the ear, and it
    // spares the filter a tan() every sample.
    if (i % 16 === 0) {
      if (layer.lowpass !== undefined) lowCut = cutoffAt(layer.lowpass, u);
      if (layer.highpass !== undefined) highCut = cutoffAt(layer.highpass, u);
    }
    if (lowFilter) {
      lowFilter.run(x, lowCut);
      x = lowFilter.low;
    }
    if (highFilter) {
      highFilter.run(x, highCut);
      x = highFilter.high;
    }
    if (drive > 0) x = Math.tanh(x * (1 + drive)) / driveNorm;

    let envelope: number;
    if (t < attack) envelope = t / attack;
    else if (t < attack + hold) envelope = 1;
    else envelope = Math.max(0, 1 - (t - attack - hold) / decay) ** curve;

    out[start + i]! += x * envelope * gain;
  }
}

/** Render a recipe to mono samples at this rate. The same recipe and rate
 *  always give the same samples. */
export function render(recipe: Recipe, sampleRate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.ceil(lengthOf(recipe) * sampleRate));
  const noise = random(recipe.seed ?? 1);
  for (const layer of recipe.layers) renderLayer(layer, out, sampleRate, noise);

  // Take out any DC offset — an uneven square wave has some — which would
  // otherwise thump as the sound starts and stops.
  let previousIn = 0;
  let previousOut = 0;
  for (let i = 0; i < out.length; i += 1) {
    const x = out[i]!;
    previousOut = x - previousIn + 0.995 * previousOut;
    previousIn = x;
    out[i] = previousOut;
  }

  // Every sound peaks at its recipe's level, so levels are set by recipe
  // rather than by however loud the layers happened to add up.
  let peak = 0;
  for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]!));
  const scale = peak > 0 ? (recipe.gain ?? 0.8) / peak : 0;

  const edge = Math.max(1, Math.round(EDGE * sampleRate));
  for (let i = 0; i < out.length; i += 1) {
    const fade = Math.min(1, i / edge, (out.length - 1 - i) / edge);
    out[i] = out[i]! * scale * fade;
  }
  return out;
}
