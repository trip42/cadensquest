import { describe, expect, it } from 'vitest';
import { chance, createRng, hashSeed, nextFloat, nextInt, pick, shuffle } from '~/game/rng';

describe('seeded randomness', () => {
  it('repeats exactly for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const rollsA = Array.from({ length: 50 }, () => nextFloat(a));
    const rollsB = Array.from({ length: 50 }, () => nextFloat(b));
    expect(rollsA).toEqual(rollsB);
  });

  it('diverges for different seeds', () => {
    expect(nextFloat(createRng(1))).not.toEqual(nextFloat(createRng(2)));
  });

  it('spreads across the unit interval', () => {
    const rng = createRng(777);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i += 1) buckets[Math.floor(nextFloat(rng) * 10)]! += 1;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(9000);
      expect(count).toBeLessThan(11000);
    }
  });

  it('picks each option about equally often', () => {
    const rng = createRng(31337);
    const options = ['approach', 'approach', 'strike', 'brace'];
    const tally: Record<string, number> = {};
    for (let i = 0; i < 40000; i += 1) {
      const choice = pick(rng, options);
      tally[choice] = (tally[choice] ?? 0) + 1;
    }
    // 'approach' appears twice in the list, so it should come up twice as often.
    expect(tally.approach! / 40000).toBeGreaterThan(0.46);
    expect(tally.approach! / 40000).toBeLessThan(0.54);
    expect(tally.brace! / 40000).toBeGreaterThan(0.22);
    expect(tally.brace! / 40000).toBeLessThan(0.28);
  });

  it('does not correlate across nearby seeds', () => {
    // Chunk N is seeded by hashSeed(seed, N); adjacent chunks must not
    // produce near-identical streams or the map would visibly repeat.
    const first = Array.from({ length: 20 }, (_, i) => nextFloat(createRng(hashSeed(999, i))));
    const unique = new Set(first.map((value) => value.toFixed(4)));
    expect(unique.size).toBe(first.length);
  });

  it('shuffles without losing or duplicating cards', () => {
    const rng = createRng(4);
    const deck = Array.from({ length: 12 }, (_, i) => `card${i}`);
    const shuffled = shuffle(rng, deck);
    expect(shuffled).toHaveLength(deck.length);
    expect([...shuffled].sort()).toEqual([...deck].sort());
    expect(shuffled).not.toEqual(deck);
  });

  it('honours the odds given to chance()', () => {
    const rng = createRng(2024);
    let hits = 0;
    for (let i = 0; i < 40000; i += 1) if (chance(rng, 0.25)) hits += 1;
    expect(hits / 40000).toBeGreaterThan(0.235);
    expect(hits / 40000).toBeLessThan(0.265);
  });

  it('keeps nextInt inside range', () => {
    const rng = createRng(8);
    for (let i = 0; i < 5000; i += 1) {
      const value = nextInt(rng, 7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });
});
