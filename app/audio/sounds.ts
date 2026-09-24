/* Every sound in the game, by name, as a recipe for the synthesiser.

   Placeholders in the same sense as the procedural sprites: good enough to
   play with, and each one replaceable by a recorded file without touching
   anything that plays it — put the file in SOUND_FILES under the same name.

   The comment on each says what it is meant to sound like; tune by ear on
   the sound board (/sounds, in dev), which plays these and lets you edit a
   copy. Levels: every sound peaks at its `gain`, so loudness between sounds
   is set here, not by how many layers a recipe happens to have. */

import type { Recipe } from './synth';

export const SOUNDS = {
  /* ------------------------------ blows -------------------------------- */

  /** A bat or claw cutting the air: noise through a filter that sweeps up. */
  swing: {
    layers: [
      { wave: 'noise', freq: 60000, attack: 0.045, decay: 0.12, curve: 1.6, lowpass: [900, 3400], highpass: [250, 900], resonance: 0.4 },
    ],
    gain: 0.5,
  },
  /** A blow landing: a low thump that drops in pitch, a crack of noise, and
   *  a click on the front for bite. */
  hit: {
    layers: [
      { wave: 'sine', freq: 170, to: 55, decay: 0.16, curve: 2.5, drive: 0.8 },
      { wave: 'noise', freq: 60000, attack: 0.001, decay: 0.045, lowpass: 3500, gain: 0.7 },
      { wave: 'square', freq: 900, to: 300, attack: 0.001, decay: 0.02, gain: 0.25 },
    ],
    gain: 0.8,
    seed: 2,
  },
  /** A heavy or killing blow: deeper, longer, driven harder. */
  smash: {
    layers: [
      { wave: 'sine', freq: 140, to: 38, decay: 0.32, curve: 2.2, drive: 1.5 },
      { wave: 'noise', freq: 60000, attack: 0.001, decay: 0.14, lowpass: [4000, 700], gain: 0.9 },
      { wave: 'noise', freq: 900, decay: 0.09, lowpass: 2400, gain: 0.4 },
    ],
    gain: 0.95,
    seed: 3,
  },
  /** Caden taking a hit: a thump with a falling square "oof" on top, the
   *  classic sound of losing health. */
  hurt: {
    layers: [
      { wave: 'sine', freq: 150, to: 60, decay: 0.14, drive: 1 },
      { wave: 'square', freq: 520, to: 180, duty: 0.4, attack: 0.003, decay: 0.16, curve: 1.6, lowpass: 3000, gain: 0.45 },
      { wave: 'noise', freq: 60000, decay: 0.05, lowpass: 3000, gain: 0.5 },
    ],
    gain: 0.9,
    seed: 4,
  },
  /** A blow turned by block: a metallic ping — partials that are not in
   *  harmony, which is what makes metal — and a tick of noise. */
  clank: {
    layers: [
      { wave: 'triangle', freq: 620, decay: 0.22, curve: 3, gain: 0.5 },
      { wave: 'sine', freq: 1245, decay: 0.28, curve: 3.5, gain: 0.45 },
      { wave: 'sine', freq: 1873, decay: 0.2, curve: 4, gain: 0.3 },
      { wave: 'noise', freq: 60000, decay: 0.025, highpass: 2500, gain: 0.6 },
    ],
    gain: 0.6,
    seed: 5,
  },
  /** Caden's energy blast leaving his hands — a falling "pew". Allies' ranged
   *  blows use it too. */
  zap: {
    layers: [
      { wave: 'square', freq: 1400, to: 260, duty: 0.3, decay: 0.16, curve: 1.2, lowpass: 5000, gain: 0.6 },
      { wave: 'sine', freq: 700, to: 200, decay: 0.12, gain: 0.4 },
    ],
    gain: 0.5,
  },
  /** Something thrown or breathed by an enemy — spit, fire — whooshing
   *  over: filtered noise that swells, with a low undertone. */
  hurl: {
    layers: [
      { wave: 'noise', freq: 60000, attack: 0.03, decay: 0.22, curve: 1.5, lowpass: [1200, 3000], highpass: 400 },
      { wave: 'sine', freq: 220, to: 110, attack: 0.02, decay: 0.2, gain: 0.3 },
    ],
    gain: 0.5,
    seed: 6,
  },
  /** Standing in something that hurts: hiss and crackle. */
  sizzle: {
    layers: [
      { wave: 'noise', freq: 60000, attack: 0.01, decay: 0.28, curve: 1.2, highpass: 2000, lowpass: 7000, gain: 0.5 },
      { wave: 'noise', freq: 400, decay: 0.2, lowpass: 1500, gain: 0.35 },
    ],
    gain: 0.45,
    seed: 7,
  },

  /* ------------------------------ falls -------------------------------- */

  /** A crystal creature breaking apart: bright glassy pings, one after
   *  another, over a burst of noise and a small thump. */
  shatter: {
    layers: [
      { wave: 'noise', freq: 60000, decay: 0.12, highpass: 1500, gain: 0.7 },
      { wave: 'sine', freq: 180, to: 60, decay: 0.12, gain: 0.6 },
      { wave: 'sine', freq: 2100, decay: 0.3, curve: 3, gain: 0.35 },
      { wave: 'sine', freq: 2750, at: 0.02, decay: 0.25, curve: 3, gain: 0.3 },
      { wave: 'sine', freq: 3300, at: 0.045, decay: 0.2, curve: 3, gain: 0.25 },
      { wave: 'sine', freq: 1650, at: 0.07, decay: 0.28, curve: 3, gain: 0.3 },
      { wave: 'triangle', freq: 1600, to: 500, decay: 0.35, gain: 0.25 },
    ],
    gain: 0.7,
    seed: 8,
  },
  /** Caden falling, or an ally: a slow, sad slide down with a wobble. */
  fall: {
    layers: [
      { wave: 'square', freq: 440, to: 110, attack: 0.01, hold: 0.1, decay: 0.8, curve: 1, vibrato: { depth: 0.03, rate: 7 }, lowpass: 2400, gain: 0.5 },
      { wave: 'triangle', freq: 220, to: 55, attack: 0.01, hold: 0.1, decay: 0.8, curve: 1, gain: 0.5 },
    ],
    gain: 0.7,
  },

  /* ------------------------------ gains -------------------------------- */

  /** Raising a guard: a scrape and a rising "ting". */
  guard: {
    layers: [
      { wave: 'noise', freq: 60000, decay: 0.06, highpass: 1200, lowpass: 6000, gain: 0.6 },
      { wave: 'triangle', freq: 440, to: 660, attack: 0.005, decay: 0.18, gain: 0.6 },
      { wave: 'sine', freq: 1320, at: 0.03, decay: 0.2, curve: 3, gain: 0.3 },
    ],
    gain: 0.55,
    seed: 9,
  },
  /** Healing: a quick rising arpeggio, C E G C, with a sparkle an octave up. */
  heal: {
    layers: [
      { wave: 'triangle', freq: 523, steps: [[0.06, 1.26], [0.12, 1.19], [0.18, 1.335]], attack: 0.005, hold: 0.2, decay: 0.25, curve: 1.5, vibrato: { depth: 0.01, rate: 6 }, gain: 0.6 },
      { wave: 'sine', freq: 1046, steps: [[0.06, 1.26], [0.12, 1.19], [0.18, 1.335]], at: 0.02, attack: 0.005, hold: 0.18, decay: 0.25, gain: 0.25 },
    ],
    gain: 0.5,
  },
  /** Growing stronger: a rising sweep that opens up as it climbs. */
  power: {
    layers: [
      { wave: 'saw', freq: 180, to: 720, attack: 0.01, hold: 0.05, decay: 0.3, curve: 1.3, lowpass: [800, 4000], resonance: 0.5, vibrato: { depth: 0.02, rate: 12 }, gain: 0.5 },
      { wave: 'square', freq: 90, to: 360, duty: 0.25, attack: 0.01, hold: 0.05, decay: 0.3, lowpass: 1500, gain: 0.25 },
    ],
    gain: 0.55,
  },

  /* ------------------------------ creatures ---------------------------- */

  /** A creature joining Caden: a gentle chime rising a fifth. */
  tame: {
    layers: [
      { wave: 'sine', freq: 660, attack: 0.01, hold: 0.08, decay: 0.45, gain: 0.6 },
      { wave: 'sine', freq: 990, at: 0.1, attack: 0.01, hold: 0.08, decay: 0.45, vibrato: { depth: 0.006, rate: 5 }, gain: 0.6 },
      { wave: 'triangle', freq: 1320, at: 0.2, decay: 0.4, gain: 0.25 },
    ],
    gain: 0.55,
  },
  /** A creature appearing: a whoosh that rises into a chime. */
  summon: {
    layers: [
      { wave: 'noise', freq: 60000, attack: 0.18, decay: 0.12, curve: 1, lowpass: [400, 5000], highpass: 200, gain: 0.6 },
      { wave: 'sine', freq: 440, to: 880, at: 0.12, attack: 0.01, decay: 0.35, gain: 0.45 },
      { wave: 'triangle', freq: 1320, at: 0.2, decay: 0.3, curve: 3, gain: 0.25 },
    ],
    gain: 0.55,
    seed: 10,
  },

  /* ------------------------------ magic -------------------------------- */

  /** Ground marked with something: a soft whump and a shimmer. */
  mark: {
    layers: [
      { wave: 'sine', freq: 120, to: 70, decay: 0.2, drive: 0.5, gain: 0.7 },
      { wave: 'noise', freq: 60000, decay: 0.25, lowpass: [3000, 600], gain: 0.5 },
      { wave: 'triangle', freq: 880, to: 660, at: 0.02, decay: 0.25, curve: 2.5, gain: 0.2 },
    ],
    gain: 0.55,
    seed: 11,
  },
  /** An area burst: a deep boom, a blast of noise closing down, and a
   *  crunchy rumble under it. */
  boom: {
    layers: [
      { wave: 'sine', freq: 90, to: 30, attack: 0.004, decay: 0.6, drive: 2 },
      { wave: 'noise', freq: 60000, decay: 0.5, curve: 1.6, lowpass: [5000, 300], gain: 0.9 },
      { wave: 'noise', freq: 250, decay: 0.45, lowpass: 900, gain: 0.5 },
    ],
    gain: 1,
    seed: 12,
  },

  /* ------------------------------ cards -------------------------------- */

  /** A card snapped down, dealt or picked up: a short paper flick. Played
   *  at different pitches for each. */
  card: {
    layers: [
      { wave: 'noise', freq: 60000, attack: 0.001, decay: 0.04, highpass: 2500, lowpass: 9000, gain: 0.8 },
      { wave: 'sine', freq: 1800, to: 900, decay: 0.03, gain: 0.2 },
    ],
    gain: 0.4,
    seed: 13,
  },
  /** Cards thrown away for movement: a whoosh falling away. */
  discard: {
    layers: [
      { wave: 'noise', freq: 60000, attack: 0.015, decay: 0.14, curve: 1.4, lowpass: [3500, 700], highpass: 300, gain: 0.8 },
      { wave: 'triangle', freq: 600, to: 300, decay: 0.1, gain: 0.2 },
    ],
    gain: 0.4,
    seed: 14,
  },

  /* ------------------------------ moving ------------------------------- */

  /** A footstep: a dull scuff. */
  step: {
    layers: [
      { wave: 'noise', freq: 1500, decay: 0.05, lowpass: 900, gain: 1 },
      { wave: 'sine', freq: 110, to: 70, decay: 0.04, gain: 0.5 },
    ],
    gain: 0.3,
    seed: 15,
  },
  /** The way down opening: an airy chord that swells up, with a shimmer. */
  portal: {
    layers: [
      { wave: 'triangle', freq: 261, attack: 0.3, decay: 0.9, gain: 0.3 },
      { wave: 'sine', freq: 523, attack: 0.35, hold: 0.2, decay: 0.7, vibrato: { depth: 0.01, rate: 5 }, gain: 0.5 },
      { wave: 'sine', freq: 784, at: 0.05, attack: 0.35, hold: 0.2, decay: 0.7, vibrato: { depth: 0.012, rate: 5.5 }, gain: 0.4 },
      { wave: 'sine', freq: 1046, at: 0.1, attack: 0.35, hold: 0.15, decay: 0.7, gain: 0.3 },
      { wave: 'noise', freq: 60000, attack: 0.4, decay: 0.6, highpass: [2000, 6000], gain: 0.15 },
    ],
    gain: 0.6,
    seed: 16,
  },
  /** Going down: a falling whoosh over a tone that sinks away. */
  descend: {
    layers: [
      { wave: 'noise', freq: 60000, attack: 0.05, decay: 0.7, curve: 1.2, lowpass: [4000, 300], gain: 0.6 },
      { wave: 'sine', freq: 330, to: 82, attack: 0.02, decay: 0.8, curve: 1.3, vibrato: { depth: 0.02, rate: 4 }, gain: 0.6 },
      { wave: 'triangle', freq: 165, to: 55, decay: 0.9, gain: 0.3 },
    ],
    gain: 0.65,
    seed: 17,
  },

  /* ------------------------------ the run ------------------------------ */

  /** Your turn: two bright notes, up a fourth. */
  turn: {
    layers: [
      { wave: 'triangle', freq: 784, attack: 0.005, decay: 0.18, gain: 0.6 },
      { wave: 'triangle', freq: 1046, at: 0.09, attack: 0.005, decay: 0.3, gain: 0.6 },
      { wave: 'sine', freq: 2093, at: 0.09, decay: 0.2, curve: 3, gain: 0.15 },
    ],
    gain: 0.4,
  },
  /** A reward coming up: a short fanfare arpeggio, D F# A D. */
  reward: {
    layers: [
      { wave: 'square', freq: 587, steps: [[0.07, 1.26], [0.14, 1.19], [0.21, 1.335]], duty: 0.25, attack: 0.005, hold: 0.25, decay: 0.3, curve: 1.5, lowpass: 4000, gain: 0.45 },
      { wave: 'triangle', freq: 293, steps: [[0.07, 1.26], [0.14, 1.19], [0.21, 1.335]], attack: 0.005, hold: 0.25, decay: 0.3, gain: 0.4 },
      { wave: 'noise', freq: 60000, at: 0.2, decay: 0.3, highpass: 5000, gain: 0.1 },
    ],
    gain: 0.5,
    seed: 18,
  },
  /** Taking something: the old coin pickup, B then E. */
  pickup: {
    layers: [
      { wave: 'square', freq: 988, steps: [[0.07, 1.335]], attack: 0.002, hold: 0.05, decay: 0.25, curve: 1.5, lowpass: 6000, gain: 0.5 },
      { wave: 'triangle', freq: 494, steps: [[0.07, 1.335]], attack: 0.002, hold: 0.05, decay: 0.25, gain: 0.3 },
    ],
    gain: 0.45,
  },
  /** Out into the light: a rising major arpeggio and a held top note. */
  victory: {
    layers: [
      { wave: 'square', freq: 523, steps: [[0.12, 1.26], [0.24, 1.19], [0.36, 1.335]], attack: 0.005, hold: 0.55, decay: 0.5, lowpass: 3500, gain: 0.4 },
      { wave: 'triangle', freq: 262, steps: [[0.12, 1.26], [0.24, 1.19], [0.36, 1.335]], attack: 0.005, hold: 0.55, decay: 0.5, gain: 0.45 },
      { wave: 'sine', freq: 1046, at: 0.36, attack: 0.01, hold: 0.3, decay: 0.6, vibrato: { depth: 0.01, rate: 6 }, gain: 0.3 },
    ],
    gain: 0.6,
  },
  /** Game over: four notes sinking a semitone at a time, wobbling. */
  defeat: {
    layers: [
      { wave: 'square', freq: 392, steps: [[0.2, 0.944], [0.4, 0.944], [0.6, 0.944]], attack: 0.01, hold: 0.6, decay: 0.6, vibrato: { depth: 0.02, rate: 6 }, lowpass: 2000, gain: 0.45 },
      { wave: 'triangle', freq: 196, steps: [[0.2, 0.944], [0.4, 0.944], [0.6, 0.944]], attack: 0.01, hold: 0.6, decay: 0.6, gain: 0.45 },
    ],
    gain: 0.6,
  },

  /* ------------------------------ interface ---------------------------- */

  /** Not allowed: two low buzzes. */
  deny: {
    layers: [
      { wave: 'square', freq: 140, attack: 0.003, hold: 0.05, decay: 0.05, lowpass: 1500, gain: 0.7 },
      { wave: 'square', freq: 140, at: 0.12, attack: 0.003, hold: 0.05, decay: 0.05, lowpass: 1500, gain: 0.7 },
    ],
    gain: 0.35,
  },
  /** A button pressed. */
  click: {
    layers: [
      { wave: 'square', freq: 1400, to: 900, decay: 0.025, lowpass: 5000, gain: 0.6 },
      { wave: 'noise', freq: 60000, decay: 0.01, highpass: 4000, gain: 0.3 },
    ],
    gain: 0.3,
    seed: 19,
  },
} satisfies Record<string, Recipe>;

export type SoundName = keyof typeof SOUNDS;

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

/* Recorded files, when there are any: a sound named here plays the file
   instead of its recipe, and nothing else changes. Import the file so the
   bundler gives it a URL, as sprites.ts does with its sheets:

     import hitFile from '~/assets/sounds/hit.ogg';
     export const SOUND_FILES = { hit: hitFile };                            */
export const SOUND_FILES: Partial<Record<SoundName, string>> = {};
