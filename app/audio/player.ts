/* The sound player: Web Audio, and nothing about the game.

   Browsers keep audio locked until the page has been pressed or typed in,
   so nothing plays before that — `unlock` is called on the first press or
   key (plugins/audio.ts), and anything asked for earlier is simply dropped.
   Each sound is rendered from its recipe the first time it plays, and the
   rest are rendered a few at a time in the background once sound starts.

   Safe to import anywhere: without `window` (under test) it does nothing. */

import { SOUND_FILES, SOUND_NAMES, SOUNDS, type SoundName } from './sounds';
import { type Recipe, render } from './synth';

export interface PlayOptions {
  /** 0..1, relative to the sound's own level. */
  volume?: number;
  /** Playback speed, which is pitch too: 1.2 is higher and shorter. */
  rate?: number;
  /** How far the rate may wander at random, so a sound heard ten times in a
   *  row does not sound like a machine: 0.05 is ±5%. */
  vary?: number;
  /** Left -1 .. right 1. */
  pan?: number;
  /** Seconds from now. */
  delay?: number;
}

/** The overall level, under the compressor. */
const VOLUME = 0.6;
/** The most sounds at once; past this, new ones are dropped. */
const MAX_VOICES = 24;
/** The least time between two of the same sound — a burst that hits five
 *  creatures thuds once or twice, not five times on top of itself. */
const MIN_GAP: Partial<Record<SoundName, number>> = {
  step: 0.07, hit: 0.035, smash: 0.05, clank: 0.05, card: 0.025, sizzle: 0.08, shatter: 0.05, hurt: 0.08,
};
const DEFAULT_GAP = 0.02;
/** Where the player's mute choice is remembered, in this browser only. */
const STORAGE_KEY = 'cq-sound';

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, muted ? 'off' : 'on');
  } catch {
    // Private windows and blocked storage: the choice lasts this visit.
  }
}

export class SoundPlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly loading = new Set<SoundName>();
  /** When each sound was last scheduled to start, recent ones only. */
  private readonly scheduled = new Map<SoundName, number[]>();
  private voices = 0;
  private muted = readMuted();

  /** The last sounds started, newest last — so a browser check can see
   *  which sounds an action set off without hearing them. */
  readonly history: Array<{ name: SoundName; at: number }> = [];

  get isMuted(): boolean {
    return this.muted;
  }

  /** Is sound actually running — unlocked, and not suspended? */
  get running(): boolean {
    return this.context?.state === 'running';
  }

  /** Start sound, from inside a press or key handler. Safe to call often. */
  unlock(): void {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return;
    if (!this.context) {
      const context = new window.AudioContext();
      // A gentle compressor on the way out, so a pile-up of sounds is held
      // together rather than clipping.
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : VOLUME;
      master.connect(compressor);
      compressor.connect(context.destination);
      this.context = context;
      this.master = master;
      this.warm();
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  /** Unlock, and wait for sound to be running — for a caller that wants
   *  its very first sound heard. */
  async start(): Promise<boolean> {
    this.unlock();
    try {
      await this.context?.resume();
    } catch {
      // Still locked: no press has reached the page yet.
    }
    return this.running;
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    const { context, master } = this;
    if (!context || !master || this.muted || context.state !== 'running') return;
    const when = context.currentTime + Math.max(0, options.delay ?? 0);

    // Too close to another of the same sound — before or after it, since a
    // sound can be scheduled for later than one asked for after it.
    const gap = MIN_GAP[name] ?? DEFAULT_GAP;
    const times = (this.scheduled.get(name) ?? []).filter((time) => time > context.currentTime - 1);
    if (times.some((time) => Math.abs(time - when) < gap)) return;
    if (this.voices >= MAX_VOICES) return;
    const buffer = this.buffer(name);
    if (!buffer) return;
    times.push(when);
    this.scheduled.set(name, times);

    const source = context.createBufferSource();
    source.buffer = buffer;
    const vary = options.vary ?? 0.05;
    source.playbackRate.value = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * vary);

    const gain = context.createGain();
    gain.gain.value = Math.max(0, options.volume ?? 1);
    source.connect(gain);
    let out: AudioNode = gain;
    if (options.pan && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      gain.connect(panner);
      out = panner;
    }
    out.connect(master);

    this.voices += 1;
    source.onended = () => {
      this.voices -= 1;
      source.disconnect();
      out.disconnect();
      if (out !== gain) gain.disconnect();
    };
    source.start(when);

    this.history.push({ name, at: when });
    if (this.history.length > 60) this.history.shift();
  }

  /** Play a recipe that is not one of the named sounds — the sound board's
   *  edited copies. Rendered afresh every time, never kept. */
  playRecipe(recipe: Recipe, options: PlayOptions = {}): void {
    const { context, master } = this;
    if (!context || !master || context.state !== 'running') return;
    const samples = render(recipe, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.rate ?? 1;
    const gain = context.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain);
    gain.connect(master);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(context.currentTime + (options.delay ?? 0));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeMuted(muted);
    const { context, master } = this;
    if (context && master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, context.currentTime, 0.02);
  }

  /** A sound's samples: from its file if it has one and it has loaded,
   *  otherwise rendered from its recipe now. */
  private buffer(name: SoundName): AudioBuffer | null {
    const ready = this.buffers.get(name);
    if (ready) return ready;
    const context = this.context;
    if (!context) return null;
    if (SOUND_FILES[name]) {
      this.load(name);
      // Until the file arrives, the recipe stands in.
    }
    const samples = render(SOUNDS[name], context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    if (!SOUND_FILES[name]) this.buffers.set(name, buffer);
    return buffer;
  }

  private load(name: SoundName): void {
    const url = SOUND_FILES[name];
    const context = this.context;
    if (!url || !context || this.loading.has(name)) return;
    this.loading.add(name);
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => this.buffers.set(name, buffer))
      .catch((error) => console.warn(`[sound] could not load ${name}`, error));
  }

  /** Render the rest in the background, one per tick, so the first time a
   *  sound is needed it is already there and no single frame pays for all
   *  of them. */
  private warm(): void {
    const queue = SOUND_NAMES.filter((name) => !this.buffers.has(name));
    const next = (): void => {
      const name = queue.shift();
      if (!name) return;
      this.buffer(name);
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }
}

/** The one player for the page. */
export const sfx = new SoundPlayer();
