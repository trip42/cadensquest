/* The world: an endless map streamed as chunks.

   Everything that reads terrain goes through `stackAt`, exactly as the
   prototype did — which is why swapping a hand-authored literal for a
   generator touched one function and nothing else. Chunks are memoised on
   demand and can be pruned behind the player; because `generateChunk` is
   pure, a pruned chunk regenerates identically if it is ever needed again. */

import { CHUNK_ROWS, MAP_WIDTH, type Chunk, generateChunk } from './generate';
import { isWalkable, type Stack, stackHeight, VOID, type Zone, zoneForRow } from './tiles';

export const chunkIndexForRow = (row: number): number => Math.floor(row / CHUNK_ROWS);

export class World {
  readonly seed: number;
  readonly width = MAP_WIDTH;
  private readonly chunks = new Map<number, Chunk>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  chunk(index: number): Chunk {
    let chunk = this.chunks.get(index);
    if (!chunk) {
      chunk = generateChunk(this.seed, index);
      this.chunks.set(index, chunk);
    }
    return chunk;
  }

  stackAt(row: number, col: number): Stack {
    if (col < 0 || col >= MAP_WIDTH) return VOID;
    const index = chunkIndexForRow(row);
    const local = row - index * CHUNK_ROWS;
    return this.chunk(index).rows[local]?.[col] ?? VOID;
  }

  /** Height of the surface in layers; 0 where there is no tile. */
  heightAt(row: number, col: number): number {
    return stackHeight(this.stackAt(row, col));
  }

  walkable(row: number, col: number): boolean {
    return isWalkable(this.stackAt(row, col));
  }

  zoneAt(row: number): Zone {
    return zoneForRow(row);
  }

  /** Forget chunks far from the player. Cheap to undo: they regenerate. */
  prune(centerRow: number, keepChunks = 4): void {
    const center = chunkIndexForRow(centerRow);
    for (const index of this.chunks.keys()) {
      if (Math.abs(index - center) > keepChunks) this.chunks.delete(index);
    }
  }

  get chunkCount(): number {
    return this.chunks.size;
  }
}
