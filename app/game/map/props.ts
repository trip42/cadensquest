/* Props: things standing on the map — trees, a barn, a shop.

   Each is content (`content/props.json`): a name, a picture from a sheet,
   and a type that says what it does. An `obstacle` blocks the tile, like a
   wall; a `shop` is walked onto to trade. Zones say which props stand in
   each of their chunks, and how often (`ZoneChunk.props`).

   Props are part of the map, not of the run: `generateChunk` places them,
   on a random stream of their own, so a chunk is still a pure function of
   (seed, index) and adding props moved no ground in any seed. The world
   answers for them (`World.propAt`), and `World.walkable` refuses an
   obstacle — which is how walking, paths, knockback, spawning and marks all
   know a tree is there without a line of their own.

   An obstacle can wall the map off, so placing one is checked, not hoped:
   never on the trail, never on a chunk's first or last row (the seams,
   where chunks meet, stay open), and only where every tile that could be
   walked to before can still be walked to after (`placeProps`). */

import type { SpriteStyle } from '../entities/types';
import { chance, createRng, hashSeed, shuffle } from '../rng';
import { surfaceKind, type Stack } from './tiles';

export type PropType = 'obstacle' | 'shop';
export const PROP_TYPES: readonly PropType[] = ['obstacle', 'shop'];

export interface PropDefinition {
  id: string;
  name: string;
  type: PropType;
  sprite: SpriteStyle;
}

/** One kind of prop in a chunk: the chance each tile it may stand on gets
 *  one, and at most how many the chunk gets. */
export interface ChunkProp {
  prop: string;
  /** 0..1, per tile. */
  frequency: number;
  /** No more than this many in the chunk. None: no limit. */
  max?: number;
}

/** Every prop, by id. The same object for the life of the page:
 *  `installContent` empties and refills it. */
export const PROPS: Record<string, PropDefinition> = {};

export const propDef = (id: string): PropDefinition | undefined => PROPS[id];

/** Salt for the props' own random stream. */
const PROP_STREAM = 0x9a0b;

/** The props in one chunk, row by row, parallel to its stacks: a prop id or
 *  null. Pure: same rows, entries and seed in, same props out. */
export function placeProps(rows: Stack[][], entries: readonly ChunkProp[], seed: number, index: number): (string | null)[][] {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const props: (string | null)[][] = rows.map((row) => row.map(() => null));
  if (!entries.length || height < 3) return props;

  const rng = createRng(hashSeed(seed, index, PROP_STREAM));
  const stack = (row: number, col: number): Stack => rows[row]?.[col] ?? '';
  const kind = (row: number, col: number) => surfaceKind(stack(row, col));
  const ground = (row: number, col: number) => kind(row, col) === 'ground' || kind(row, col) === 'trail';
  const blocked = (row: number, col: number) => {
    const id = props[row]?.[col];
    return !!id && PROPS[id]?.type === 'obstacle';
  };

  /* Every tile that can be walked to from the trail, by walking's rule: a
     neighbour four ways, ground or trail, not blocked, at most a layer up
     or down. The trail itself is continuous and never blocked, so this is
     everything a character can reach in the chunk. */
  const reach = (): Set<number> => {
    const seen = new Set<number>();
    const queue: Array<[number, number]> = [];
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (kind(row, col) !== 'trail') continue;
        seen.add(row * width + col);
        queue.push([row, col]);
      }
    }
    while (queue.length) {
      const [row, col] = queue.pop()!;
      for (const [nr, nc] of [[row + 1, col], [row - 1, col], [row, col + 1], [row, col - 1]] as const) {
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const key = nr * width + nc;
        if (seen.has(key) || !ground(nr, nc) || blocked(nr, nc)) continue;
        if (Math.abs(stack(nr, nc).length - stack(row, col).length) > 1) continue;
        seen.add(key);
        queue.push([nr, nc]);
      }
    }
    return seen;
  };
  let reached = reach();

  for (const entry of entries) {
    const def = PROPS[entry.prop];
    if (!def || entry.frequency <= 0) continue;
    // Where it may stand: ground or trail, not a seam row, nothing there yet.
    const spots: Array<[number, number]> = [];
    for (let row = 1; row < height - 1; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (ground(row, col) && !props[row]![col]) spots.push([row, col]);
      }
    }
    // In a random order, so a chunk that reaches its max has not filled up
    // from the top.
    let placed = 0;
    for (const [row, col] of shuffle(rng, spots)) {
      if (entry.max !== undefined && placed >= entry.max) break;
      if (!chance(rng, entry.frequency)) continue;
      if (def.type === 'obstacle') {
        // Never on the trail, and never cutting anything off.
        if (kind(row, col) === 'trail') continue;
        const key = row * width + col;
        props[row]![col] = def.id;
        const after = reach();
        if (reached.has(key) && after.size !== reached.size - 1) {
          props[row]![col] = null;
          continue;
        }
        reached = after;
      } else {
        props[row]![col] = def.id;
      }
      placed += 1;
    }
  }
  return props;
}
