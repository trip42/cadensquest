import { describe, expect, it } from 'vitest';
import { EXAMPLE_CUES, INTERFACE_SOUNDS, soundsFor } from '~/audio/cues';
import { SOUND_NAMES, SOUNDS } from '~/audio/sounds';
import { lengthOf, render } from '~/audio/synth';
import type { Cue, CueType } from '~/game/cues';

const RATE = 44100;
const cell = { row: 3, col: 4 };

const peakOf = (samples: Float32Array): number => samples.reduce((peak, x) => Math.max(peak, Math.abs(x)), 0);
const rmsOf = (samples: Float32Array): number => Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);

/** How often the signal crosses zero, per second — for a tone, twice its
 *  pitch. Enough to tell rising from falling without hearing it. */
function crossings(samples: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let i = Math.floor(from * RATE) + 1; i < Math.floor(to * RATE); i += 1) {
    if ((samples[i - 1]! < 0) !== (samples[i]! < 0)) count += 1;
  }
  return count / (to - from);
}

describe('every sound', () => {
  it.each(SOUND_NAMES)('%s renders cleanly: finite, at its level, silent at both ends', (name) => {
    const recipe = SOUNDS[name];
    const samples = render(recipe, RATE);
    expect(samples.length).toBe(Math.ceil(lengthOf(recipe) * RATE));
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(peakOf(samples)).toBeCloseTo(recipe.gain ?? 0.8, 2);
    // Starting or stopping away from zero is a click.
    expect(Math.abs(samples[0]!)).toBeLessThan(0.001);
    expect(Math.abs(samples.at(-1)!)).toBeLessThan(0.001);
    // Loud enough to hear, and nothing is a wall of noise.
    expect(rmsOf(samples)).toBeGreaterThan(0.01);
    expect(rmsOf(samples)).toBeLessThan(0.5);
  });

  it('comes out the same every time', () => {
    for (const name of SOUND_NAMES) {
      expect(render(SOUNDS[name], RATE)).toEqual(render(SOUNDS[name], RATE));
    }
  });

  it('is short where it is heard often, and nothing drags on', () => {
    for (const name of SOUND_NAMES) expect(lengthOf(SOUNDS[name]), name).toBeLessThan(2);
    for (const name of ['step', 'card', 'click', 'hit', 'swing'] as const) {
      expect(lengthOf(SOUNDS[name]), name).toBeLessThan(0.25);
    }
  });

  it('lasts as long at any sample rate', () => {
    const at48 = render(SOUNDS.portal, 48000).length / 48000;
    const at44 = render(SOUNDS.portal, 44100).length / 44100;
    expect(Math.abs(at48 - at44)).toBeLessThan(0.001);
  });

  it('moves the way its description says', () => {
    // Rising: healing's arpeggio, growing stronger. Falling: the zap, a
    // fall, going down.
    const rising = (name: keyof typeof SOUNDS, a: number, b: number) => {
      const samples = render(SOUNDS[name], RATE);
      return crossings(samples, b, b + 0.05) > crossings(samples, a, a + 0.05);
    };
    expect(rising('heal', 0.01, 0.2)).toBe(true);
    expect(rising('power', 0.02, 0.25)).toBe(true);
    expect(rising('zap', 0.1, 0.01)).toBe(true);
    expect(rising('fall', 0.7, 0.05)).toBe(true);
    expect(rising('descend', 0.6, 0.05)).toBe(true);
  });
});

describe('the sound of each cue', () => {
  const every: Cue[] = EXAMPLE_CUES.map((example) => example.cue);
  const find = (label: string): Cue => EXAMPLE_CUES.find((example) => example.label === label)!.cue;

  it('is a sound that exists, for every kind of cue', () => {
    // A new kind of cue fails to typecheck here until it is added — and
    // then fails this test until it makes a sound.
    const KINDS: Record<CueType, true> = {
      hit: true, gain: true, fall: true, tame: true, summon: true, mark: true, burst: true, play: true,
      discard: true, step: true, portal: true, descend: true, turn: true, reward: true, claim: true, end: true,
    };
    expect(new Set(every.map((item) => item.type))).toEqual(new Set(Object.keys(KINDS)));
    for (const item of every) {
      const calls = soundsFor(item, { impact: 0.1 });
      expect(calls.length, item.type).toBeGreaterThan(0);
      for (const call of calls) expect(SOUNDS, `${item.type} → ${call.name}`).toHaveProperty(call.name);
    }
  });

  it('lands a blow when the screen does, and clanks when block takes it', () => {
    const [swing, thud] = soundsFor(find('a blow on an enemy'), { impact: 0.09 });
    expect(swing).toMatchObject({ name: 'swing' });
    expect(swing!.delay ?? 0).toBe(0);
    expect(thud).toMatchObject({ name: 'hit', delay: 0.09 });
    const spit = find('a spit or breath on Caden, partly blocked');
    expect(soundsFor(spit, { impact: 0.2 }).map((call) => call.name)).toEqual(['hurl', 'hurt', 'clank']);
    expect(soundsFor(find('a burst, all blocked'), { impact: 0 }).map((call) => call.name)).toEqual(['clank']);
  });

  it('leaves no sound unused', () => {
    const used = new Set([
      ...every.flatMap((item) => soundsFor(item, { impact: 0 }).map((call) => call.name)),
      ...Object.keys(INTERFACE_SOUNDS),
    ]);
    expect(SOUND_NAMES.filter((name) => !used.has(name))).toEqual([]);
  });

  it('makes one flick a card for a big discard, up to a handful', () => {
    const calls = soundsFor({ type: 'discard', count: 9 });
    expect(calls.filter((call) => call.name === 'card')).toHaveLength(5);
  });
});
