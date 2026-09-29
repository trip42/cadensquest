import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, enterFloor, ensureSpawns } from '~/game/actions';
import { type Content, loadContent, validateContent } from '~/game/content';
import { ENTITIES, entityDef } from '~/game/entities/definitions';
import { CHUNK_ROWS } from '~/game/map/generate';
import { CHUNKS_PER_FLOOR, floorRows, ZONE_ROWS, ZONES } from '~/game/map/tiles';
import { chunkIndexForRow } from '~/game/map/world';
import { createGame, type Game, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

/** A fresh floor 0 with every chunk spawned, walking the player down it. */
function spawnWholeFloor(seed = 4242): Game {
  resetUids();
  const game = createGame(seed);
  beginTurn(game);
  const self = player(game.state);
  const { last } = floorRows(0);
  for (let row = self.row; row <= last; row += CHUNK_ROWS) {
    self.row = row;
    ensureSpawns(game);
  }
  return game;
}

/** Which chunk of floor 0 (from 1) a row is in. */
const chunkOf = (row: number) => chunkIndexForRow(row) - chunkIndexForRow(floorRows(0).first) + 1;

const enemiesOf = (game: Game, defId: string) =>
  game.state.entities.filter((entity) => entity.defId === defId && !entity.dead);

describe('spawning by chunk', () => {
  it('knows how many chunks a floor is', () => {
    expect(CHUNKS_PER_FLOOR).toBe(ZONE_ROWS / CHUNK_ROWS);
  });

  it('places a sub-boss in its chunk, once, for certain', () => {
    ZONES[0]!.chunks = [{ chunk: 3, enemies: [], placed: ['wolf'] }];
    const game = spawnWholeFloor();
    const wolves = enemiesOf(game, 'wolf');
    expect(wolves).toHaveLength(1);
    expect(chunkOf(wolves[0]!.row)).toBe(3);
  });

  it('adds an enemy to the random mix in its chunk only', () => {
    ZONES[0]!.enemies = ['slime'];
    ZONES[0]!.density = 12;
    ZONES[0]!.chunks = [{ chunk: 2, enemies: ['wolf', 'wolf', 'wolf', 'wolf'], placed: [] }];
    const game = spawnWholeFloor();
    const wolves = enemiesOf(game, 'wolf');
    expect(wolves.length).toBeGreaterThan(0);
    expect(wolves.every((wolf) => chunkOf(wolf.row) === 2)).toBe(true);
  });

  it('spawns a unique enemy at most once a run, however often it is drawn', () => {
    ENTITIES.wolf = { ...entityDef('wolf'), unique: true };
    ZONES[0]!.enemies = ['wolf'];
    ZONES[0]!.density = 12;
    ZONES[0]!.chunks = [{ chunk: 1, enemies: [], placed: ['wolf'] }];
    const game = spawnWholeFloor();
    expect(enemiesOf(game, 'wolf')).toHaveLength(1);
    // And not on the next floor either.
    ZONES[1]!.enemies = ['wolf'];
    enterFloor(game, 1);
    ensureSpawns(game);
    expect(enemiesOf(game, 'wolf')).toHaveLength(0);
  });
});

describe('chunks in content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;
  const errors = (content: Content) => validateContent(content as never).issues.filter((issue) => issue.level === 'error');

  it('refuses a chunk past the end of the floor, one listed twice, or a guardian placed', () => {
    const content = draft();
    content.zones[0]!.chunks = [
      { chunk: CHUNKS_PER_FLOOR + 1, placed: ['slime'] },
      { chunk: 2, placed: ['warden'] },
      { chunk: 2, enemies: ['nobody'] },
    ];
    const found = errors(content).map((issue) => issue.message).join(' | ');
    expect(found).toMatch(/only 3 chunks/);
    expect(found).toMatch(/listed twice/);
    expect(found).toMatch(/guardian/);
    expect(found).toMatch(/does not exist/);
  });

  it('accepts a chunk that adds to the mix and places a sub-boss', () => {
    const content = draft();
    content.zones[0]!.chunks = [{ chunk: 3, enemies: ['chicken'], placed: ['slime'] }];
    expect(errors(content)).toEqual([]);
  });
});
