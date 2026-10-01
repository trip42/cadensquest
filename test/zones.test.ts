import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, ensureSpawns } from '~/game/actions';
import { type Content, loadContent } from '~/game/content';
import { CHUNK_ROWS } from '~/game/map/generate';
import { chunkOfFloor, floorRows, gateRowOf, LAYOUT, START_ROW, ZONES, zoneForRow } from '~/game/map/tiles';
import { shopRowOf } from '~/game/shop';
import { createGame, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

/** The committed zones with each floor cut to this many chunks — the
 *  last one keeping its guardians. */
function withChunks(...counts: number[]): void {
  const content = structuredClone(readContentFiles()) as unknown as Content;
  content.zones = counts.map((count, i) => {
    const zone = structuredClone(content.zones[i % content.zones.length]!);
    zone.id = `zone${i}`;
    zone.name = `Zone ${i}`;
    const last = zone.chunks.at(-1)!;
    zone.chunks = [...Array.from({ length: count - 1 }, () => ({ ...zone.chunks[0]!, guardians: undefined })), last];
    return zone;
  });
  loadContent(content as never);
}

describe('floors of any length', () => {
  it('lays floors out back to back, each as long as its chunks', () => {
    withChunks(1, 5, 2);
    expect(LAYOUT.floors).toBe(3);
    expect(floorRows(0)).toEqual({ first: 0, last: CHUNK_ROWS - 1 });
    expect(floorRows(1)).toEqual({ first: CHUNK_ROWS, last: 6 * CHUNK_ROWS - 1 });
    expect(floorRows(2)).toEqual({ first: 6 * CHUNK_ROWS, last: 8 * CHUNK_ROWS - 1 });
    expect(gateRowOf(1)).toBe(6 * CHUNK_ROWS - 1);
    expect(LAYOUT.lastRow).toBe(8 * CHUNK_ROWS - 1);
  });

  it('knows which zone and which of its chunks a row lies in', () => {
    withChunks(1, 5, 2);
    expect(zoneForRow(0)).toBe(ZONES[0]);
    expect(zoneForRow(CHUNK_ROWS)).toBe(ZONES[1]);
    expect(zoneForRow(6 * CHUNK_ROWS - 1)).toBe(ZONES[1]);
    expect(zoneForRow(6 * CHUNK_ROWS)).toBe(ZONES[2]);
    // Past the end is the last zone: the map does not cycle.
    expect(zoneForRow(1000)).toBe(ZONES[2]);
    expect(chunkOfFloor(0)).toEqual({ floor: 0, k: 0 });
    expect(chunkOfFloor(3)).toEqual({ floor: 1, k: 2 });
    expect(chunkOfFloor(6)).toEqual({ floor: 2, k: 0 });
  });

  it('fits a whole floor into one chunk: arrival, shop and guardian in order', () => {
    withChunks(1, 3, 3);
    resetUids();
    const game = createGame(4242);
    beginTurn(game);
    ensureSpawns(game);
    const { first, last } = floorRows(0);
    expect(player(game.state).row).toBe(first + START_ROW);
    expect(game.state.shop?.row).toBe(shopRowOf(0));
    expect(shopRowOf(0)).toBeGreaterThan(first + START_ROW);
    expect(game.state.gates.at(-1)).toMatchObject({ row: last, final: true });
  });
});
