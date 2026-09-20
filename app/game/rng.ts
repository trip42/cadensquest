/* Deterministic, serialisable randomness.
   The whole world comes from a seed: the same seed always produces the
   same map, the same shuffles and the same enemy intents, which makes a
   run reproducible from its seed alone. `Rng` is a plain object so it
   drops straight into game state and into a save file. */

export interface Rng {
  /** Current position in the stream. */
  s: number;
}

export const createRng = (seed: number): Rng => ({ s: seed >>> 0 });

/** mulberry32 — small, fast, good enough for a game, and easy to port. */
export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = Math.imul(rng.s ^ (rng.s >>> 15), 1 | rng.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const nextInt = (rng: Rng, maxExclusive: number): number =>
  Math.floor(nextFloat(rng) * maxExclusive);

export const range = (rng: Rng, min: number, maxInclusive: number): number =>
  min + nextInt(rng, maxInclusive - min + 1);

export const chance = (rng: Rng, probability: number): boolean =>
  nextFloat(rng) < probability;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (!items.length) throw new Error('pick from an empty list');
  return items[nextInt(rng, items.length)]!;
}

/** Pick by relative weight. Entries with a weight of zero never come up,
 *  which is how a reward table turns a kind off entirely. */
export function pickWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (total <= 0) throw new Error('pickWeighted needs at least one positive weight');

  let roll = nextFloat(rng) * total;
  for (const [value, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll < 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/** Fisher-Yates, returning a new array. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = nextInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/* A stateless hash, for deriving an independent stream from coordinates.
   Chunk N is generated from hashSeed(seed, N), so chunks can be built in
   any order — or thrown away and rebuilt — and always come out the same. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h ^= part | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
