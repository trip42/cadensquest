import { describe, expect, it } from 'vitest';
import { auditRows } from '~/game/map/audit';
import { CHUNK_ROWS, generateChunk, MAP_WIDTH, MIN_STRAND } from '~/game/map/generate';
import { World } from '~/game/map/world';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);

describe('chunk generation', () => {
  it('is pure: the same seed and index give the same chunk', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const index of [0, 1, 5, 42]) {
        expect(generateChunk(seed, index).rows).toEqual(generateChunk(seed, index).rows);
      }
    }
  });

  it('builds chunks in any order with the same result', () => {
    const forwards = new World(1234);
    const backwards = new World(1234);
    for (let i = 0; i < 6; i += 1) forwards.chunk(i);
    for (let i = 5; i >= 0; i -= 1) backwards.chunk(i);
    for (let i = 0; i < 6; i += 1) {
      expect(backwards.chunk(i).rows).toEqual(forwards.chunk(i).rows);
    }
  });

  it('holds the braid invariants on every chunk of every seed', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      for (let index = 0; index < 6; index += 1) {
        const audit = auditRows(generateChunk(seed, index).rows, MAP_WIDTH);
        if (!audit.ok) failures.push(`seed ${seed} chunk ${index}: ${JSON.stringify(audit)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('never lets a strand fall below the minimum width', () => {
    for (const seed of SEEDS) {
      const audit = auditRows(generateChunk(seed, 3).rows, MAP_WIDTH);
      expect(audit.narrowestStrand).toBeGreaterThanOrEqual(MIN_STRAND);
    }
  });

  it('joins chunk to chunk without a seam', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const world = new World(seed);
      const rows = [0, 1, 2, 3].flatMap((index) => world.chunk(index).rows);
      const audit = auditRows(rows, MAP_WIDTH);
      if (!audit.ok) failures.push(`seed ${seed}: ${JSON.stringify(audit)}`);
      expect(rows).toHaveLength(CHUNK_ROWS * 4);
    }
    expect(failures).toEqual([]);
  });

  it('actually forks somewhere — the braid is not just a straight ribbon', () => {
    let forked = 0;
    for (const seed of SEEDS) {
      const rows = [0, 1, 2].flatMap((index) => generateChunk(seed, index).rows);
      if (auditRows(rows, MAP_WIDTH).forkedRows > 0) forked += 1;
    }
    // Not every short stretch forks, but most should.
    expect(forked).toBeGreaterThan(SEEDS.length * 0.5);
  });

  it('puts different zones at different depths', () => {
    const world = new World(99);
    expect(world.zoneAt(0).id).not.toEqual(world.zoneAt(60).id);
    expect(world.zoneAt(0).id).toEqual(world.zoneAt(10).id);
  });
});
