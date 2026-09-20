import { describe, expect, it } from 'vitest';
import { auditRows, strandedTiles, traversable } from '~/game/map/audit';
import { CHUNK_ROWS, generateChunk, MAP_WIDTH, MIN_GAP, MIN_STRAND } from '~/game/map/generate';
import {
  LAST_ROW,
  MAP_ROWS,
  MAX_STACK_HEIGHT,
  surfaceKind,
  ZONE_ROWS,
  ZONES,
  zoneForRow,
} from '~/game/map/tiles';
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

  it('can be walked from the first row to the last of every chunk', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      for (let index = 0; index < 6; index += 1) {
        const rows = generateChunk(seed, index).rows;
        if (!traversable(rows, MAP_WIDTH)) failures.push(`seed ${seed} chunk ${index}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('can be walked across chunk seams, where a height mismatch would wall it off', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      const world = new World(seed);
      const rows = [0, 1, 2, 3].flatMap((index) => world.chunk(index).rows);
      if (!traversable(rows, MAP_WIDTH)) failures.push(`seed ${seed}`);
    }
    expect(failures).toEqual([]);
  });

  it('never asks for a climb along the trail itself', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const rows = [0, 1].flatMap((index) => generateChunk(seed, index).rows);
      for (let row = 1; row < rows.length; row += 1) {
        for (let col = 0; col < MAP_WIDTH; col += 1) {
          const here = rows[row]![col]!;
          const above = rows[row - 1]![col]!;
          if (!here || !above) continue;
          if (surfaceKind(here) !== 'trail' || surfaceKind(above) !== 'trail') continue;
          expect(Math.abs(here.length - above.length), `seed ${seed} at ${row},${col}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('raises real peaks where a zone calls for them', () => {
    // The highlands start at row 96 — chunk 6 onward.
    const tall = SEEDS.slice(0, 40).map((seed) => auditRows(generateChunk(seed, 7).rows, MAP_WIDTH).tallestStack);
    const highest = Math.max(...tall);
    expect(highest).toBeGreaterThan(ZONES[0]!.gen.maxHeight);
    expect(highest).toBeLessThanOrEqual(MAX_STACK_HEIGHT);
  });

  it('can be walked the whole way, first row to the winning one', () => {
    const chunks = Math.ceil(MAP_ROWS / CHUNK_ROWS);
    const failures: string[] = [];

    for (const seed of SEEDS.slice(0, 60)) {
      const world = new World(seed);
      const rows = Array.from({ length: chunks }, (_, i) => world.chunk(i).rows).flat();
      expect(rows.length).toBeGreaterThanOrEqual(MAP_ROWS);
      // The run ends on LAST_ROW, so that is as far as it has to go.
      if (!traversable(rows.slice(0, LAST_ROW + 1), MAP_WIDTH)) failures.push(`seed ${seed}`);
    }
    expect(failures).toEqual([]);
  });

  it('strands no tile more than a layer above all of its neighbours', () => {
    const failures: string[] = [];
    for (const seed of SEEDS) {
      for (let index = 0; index < 6; index += 1) {
        const count = strandedTiles(generateChunk(seed, index).rows, MAP_WIDTH);
        if (count) failures.push(`seed ${seed} chunk ${index}: ${count}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('opens voids worth going round, and narrows further than before', () => {
    let forkedRows = 0;
    let narrowest = Infinity;
    let widestGap = 0;

    for (const seed of SEEDS) {
      const rows = [0, 1, 2].flatMap((index) => generateChunk(seed, index).rows);
      const audit = auditRows(rows, MAP_WIDTH);
      forkedRows += audit.forkedRows;
      narrowest = Math.min(narrowest, audit.narrowestStrand);

      for (const row of rows) {
        let gap = 0;
        for (let col = 0; col < MAP_WIDTH; col += 1) {
          // Only voids with land either side count as a split.
          if (!row[col]) gap += 1;
          else {
            if (gap && col - gap - 1 >= 0 && row[col - gap - 1]) widestGap = Math.max(widestGap, gap);
            gap = 0;
          }
        }
      }
    }

    expect(narrowest).toBe(MIN_STRAND);
    expect(widestGap).toBeGreaterThanOrEqual(MIN_GAP);
    // Splits are common now, not a rarity.
    expect(forkedRows / SEEDS.length).toBeGreaterThan(6);
  });

  it('has two ends: nothing before row 0, nothing past the last row', () => {
    const world = new World(2024);

    for (const row of [-1, -5, -16, -40]) {
      for (let col = 0; col < MAP_WIDTH; col += 1) {
        expect(world.stackAt(row, col), `row ${row}`).toBe('');
        expect(world.walkable(row, col)).toBe(false);
      }
    }
    for (const row of [LAST_ROW + 1, LAST_ROW + 20]) {
      for (let col = 0; col < MAP_WIDTH; col += 1) {
        expect(world.stackAt(row, col), `row ${row}`).toBe('');
      }
    }

    expect(world.contains(0)).toBe(true);
    expect(world.contains(LAST_ROW)).toBe(true);
    expect(world.contains(-1)).toBe(false);
    expect(world.contains(LAST_ROW + 1)).toBe(false);

    // The first and last rows are real ground, not just in range.
    const solid = (row: number) =>
      Array.from({ length: MAP_WIDTH }, (_, col) => world.walkable(row, col)).some(Boolean);
    expect(solid(0)).toBe(true);
    expect(solid(LAST_ROW)).toBe(true);
  });

  it('is finite: zones run once, in order, and then it is over', () => {
    expect(zoneForRow(0).id).toBe(ZONES[0]!.id);
    expect(zoneForRow(ZONE_ROWS).id).toBe(ZONES[1]!.id);
    expect(zoneForRow(ZONE_ROWS * 2).id).toBe(ZONES[2]!.id);
    // Past the end it stays at the last zone rather than starting again.
    expect(zoneForRow(MAP_ROWS).id).toBe(ZONES[ZONES.length - 1]!.id);
    expect(zoneForRow(MAP_ROWS * 4).id).toBe(ZONES[ZONES.length - 1]!.id);
    expect(LAST_ROW).toBe(MAP_ROWS - 1);
  });

  it('puts different zones at different depths', () => {
    const world = new World(99);
    expect(world.zoneAt(0).id).not.toEqual(world.zoneAt(60).id);
    expect(world.zoneAt(0).id).toEqual(world.zoneAt(10).id);
  });
});
