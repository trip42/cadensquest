/* Props: trees, a barn, a shop — content, placed by the generator.

   The guarantee that matters is that an obstacle never walls anything off:
   with obstacles allowed on every tile they may stand on, everything that
   could be walked to without them can still be walked to. */
import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, enterFloor, ensureSpawns } from '~/game/actions';
import { type Content, loadContent, validateContent } from '~/game/content';
import { generateChunk } from '~/game/map/generate';
import { LAYOUT, floorRows, surfaceKind, ZONES } from '~/game/map/tiles';
import { World } from '~/game/map/world';
import { createGame, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

type Entry = { prop: string; frequency: number; max?: number };

/** The committed content with every chunk's props replaced by these. */
function withProps(entries: Entry[]): void {
  const content = structuredClone(readContentFiles()) as unknown as Content;
  for (const zone of content.zones) for (const chunk of zone.chunks) chunk.props = entries.map((entry) => ({ ...entry }));
  loadContent(content as never);
}

/** Every tile walkable from the floor's arrival, by walking's rule, where
 *  `open` says which tiles may be stood on. */
function walkFrom(world: World, floor: number, open: (row: number, col: number) => boolean): Set<string> {
  const { first, last } = floorRows(floor);
  const start = { row: first + 1, col: [...Array(world.width).keys()].find((col) => surfaceKind(world.stackAt(first + 1, col)) === 'trail')! };
  const seen = new Set([`${start.row},${start.col}`]);
  const queue = [start];
  while (queue.length) {
    const { row, col } = queue.pop()!;
    for (const [nr, nc] of [[row + 1, col], [row - 1, col], [row, col + 1], [row, col - 1]] as const) {
      if (nr < first || nr > last || nc < 0 || nc >= world.width) continue;
      const key = `${nr},${nc}`;
      if (seen.has(key) || !open(nr, nc)) continue;
      if (Math.abs(world.heightAt(nr, nc) - world.heightAt(row, col)) > 1) continue;
      seen.add(key);
      queue.push({ row: nr, col: nc });
    }
  }
  return seen;
}

const ground = (world: World) => (row: number, col: number) => {
  const kind = surfaceKind(world.stackAt(row, col));
  return kind === 'ground' || kind === 'trail';
};

describe('props', () => {
  it('are valid content, and every chunk names props that exist', () => {
    const { issues } = validateContent(readContentFiles() as never);
    expect(issues).toEqual([]);
    const bad = structuredClone(readContentFiles()) as unknown as Content;
    bad.zones[0]!.chunks[0]!.props = [{ prop: 'nothing_here', frequency: 0.5 }];
    expect(validateContent(bad as never).issues.some((issue) => issue.level === 'error' && issue.message.includes('nothing_here'))).toBe(true);
  });

  it('never wall anything off, even standing on every tile they may', () => {
    withProps([{ prop: 'oak', frequency: 1 }]);
    let blocked = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const world = new World(seed);
      for (let floor = 0; floor < LAYOUT.floors; floor += 1) {
        const { first, last } = floorRows(floor);
        world.setBounds(first, last);
        const before = walkFrom(world, floor, ground(world));
        const after = walkFrom(world, floor, (row, col) => world.walkable(row, col));
        for (const key of before) {
          const [row, col] = key.split(',').map(Number) as [number, number];
          if (world.propAt(row, col)?.type === 'obstacle') {
            blocked += 1;
            continue;
          }
          expect(after.has(key), `seed ${seed}, floor ${floor}: ${key} cut off`).toBe(true);
        }
      }
    }
    // And they really did stand somewhere: plenty of ground was planted.
    expect(blocked).toBeGreaterThan(1000);
  });

  it('keep off the trail and the seams, and leave the ground as it was', () => {
    withProps([{ prop: 'pine', frequency: 1 }, { prop: 'shop', frequency: 1, max: 1 }]);
    for (let index = 0; index < 12; index += 1) {
      const chunk = generateChunk(7, index);
      chunk.props.forEach((row, r) => row.forEach((id, c) => {
        if (!id) return;
        expect(r, `chunk ${index}`).toBeGreaterThan(0);
        expect(r, `chunk ${index}`).toBeLessThan(chunk.rows.length - 1);
        const kind = surfaceKind(chunk.rows[r]![c]!);
        if (id === 'pine') expect(kind).toBe('ground');
        else expect(['ground', 'trail']).toContain(kind);
      }));
    }
    const planted = generateChunk(7, 3).rows;
    withProps([]);
    expect(generateChunk(7, 3).rows).toEqual(planted);
  });

  it('come out the same for a seed, and keep to their chunk\'s max', () => {
    withProps([{ prop: 'birch', frequency: 1, max: 3 }, { prop: 'barn', frequency: 0 }]);
    for (let index = 0; index < 8; index += 1) {
      const props = generateChunk(11, index).props.flat();
      expect(props.filter((id) => id === 'birch').length).toBeLessThanOrEqual(3);
      expect(props).not.toContain('barn');
      expect(generateChunk(11, index).props).toEqual(generateChunk(11, index).props);
    }
  });

  it('block their tile, but a shop does not', () => {
    resetUids();
    const game = createGame(90210);
    for (let floor = 0; floor < ZONES.length; floor += 1) {
      enterFloor(game, floor);
      const { first, last } = floorRows(floor);
      for (let row = first; row <= last; row += 1) {
        for (let col = 0; col < game.world.width; col += 1) {
          const prop = game.world.propAt(row, col);
          if (prop?.type === 'obstacle') expect(game.world.walkable(row, col)).toBe(false);
          if (prop?.type === 'shop') expect(game.world.walkable(row, col)).toBe(true);
        }
      }
    }
  });

  it('give a floor as many shops as its chunks put there, each with its own stock', () => {
    withProps([{ prop: 'shop', frequency: 1, max: 2 }]);
    resetUids();
    const game = createGame(4242);
    beginTurn(game);
    const self = player(game.state);
    const { first, last } = floorRows(0);
    for (let row = first; row <= last; row += 16) {
      self.row = row;
      ensureSpawns(game);
    }
    expect(game.state.shops).toHaveLength(2 * ZONES[0]!.chunks.length);
    const [a, b] = game.state.shops;
    expect(a!.items).not.toEqual(b!.items);
    // Nobody spawned on one.
    for (const shop of game.state.shops) {
      expect(game.state.entities.some((entity) => entity.row === shop.row && entity.col === shop.col && entity.faction === 'enemy')).toBe(false);
    }
  });
});
