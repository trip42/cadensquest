import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, enterFloor, ensureSpawns, playCard } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { type Content, loadContent, validateContent } from '~/game/content';
import { entityCell } from '~/game/entities/types';
import { CHUNK_ROWS } from '~/game/map/generate';
import { floorRows } from '~/game/map/tiles';
import { chunkIndexForRow } from '~/game/map/world';
import { createGame, type Game, makeCard, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

const draft = () => structuredClone(readContentFiles()) as unknown as Content;
const install = (content: Content) => loadContent(content as never);
const errors = (content: Content) => validateContent(content as never).issues.filter((issue) => issue.level === 'error');

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

const guardianOf = (game: Game, gate: { guardianId: string }) =>
  game.state.entities.find((entity) => entity.id === gate.guardianId)!;

function hasPortal(game: Game): boolean {
  return Object.values(game.state.terrain).some((layers) => layers.some((layer) => layer.portal));
}

/** Strike a creature down with a card that cannot miss. */
function fell(game: Game, target: { row: number; col: number }): void {
  CARDS.smite = {
    id: 'smite', name: 'Smite', rarity: 'rare', cost: 0, targeting: 'enemy', range: 99, text: '',
    effects: [{ kind: 'damage', amount: 999 }],
  };
  const card = makeCard('smite');
  game.state.hand.push(card);
  expect(playCard(game, card.uid, target)).toBe(true);
  game.state.pendingRewards = [];
}

describe('spawning by chunk', () => {
  it('spawns each chunk from its own roster, as many as its density', () => {
    const content = draft();
    content.zones[0]!.chunks = [
      { enemies: ['slime'], density: 12 },
      { enemies: ['wolf'], density: 12 },
      { enemies: ['slime'], density: 0, guardians: ['warden'] },
    ];
    install(content);
    const game = spawnWholeFloor();
    const wolves = enemiesOf(game, 'wolf');
    expect(wolves.length).toBeGreaterThan(0);
    expect(wolves.every((wolf) => chunkOf(wolf.row) === 2)).toBe(true);
    expect(enemiesOf(game, 'slime').every((slime) => chunkOf(slime.row) === 1)).toBe(true);
  });

  it('spawns a unique enemy at most once a run, however often it is drawn', () => {
    const content = draft();
    content.enemies.find((enemy) => enemy.id === 'wolf')!.unique = true;
    for (const zone of content.zones) {
      for (const chunk of zone.chunks) {
        chunk.enemies = ['wolf'];
        chunk.density = 12;
      }
    }
    install(content);
    const game = spawnWholeFloor();
    expect(enemiesOf(game, 'wolf')).toHaveLength(1);
    // And not on the next floor either.
    enterFloor(game, 1);
    ensureSpawns(game);
    expect(enemiesOf(game, 'wolf')).toHaveLength(0);
  });
});

describe('guardians by chunk', () => {
  it('stands one on the last row of its chunk; a sub-boss falling opens nothing', () => {
    const content = draft();
    content.zones[0]!.chunks[0]!.guardians = ['wyrm'];
    install(content);
    const game = spawnWholeFloor();
    const [mid, last] = game.state.gates;
    expect(mid).toMatchObject({ row: floorRows(0).first + CHUNK_ROWS - 1, final: false });
    expect(guardianOf(game, mid!).defId).toBe('wyrm');
    expect(last).toMatchObject({ row: floorRows(0).last, final: true });

    fell(game, entityCell(guardianOf(game, mid!)));
    expect(guardianOf(game, mid!).dead).toBe(true);
    expect(hasPortal(game)).toBe(false);

    fell(game, entityCell(guardianOf(game, last!)));
    expect(hasPortal(game)).toBe(true);
  });

  it('chooses among several at random: the same for a seed, always from the list', () => {
    const content = draft();
    content.zones[0]!.chunks[2]!.guardians = ['warden', 'wyrm'];
    install(content);
    const chosen = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const a = spawnWholeFloor(seed);
      const b = spawnWholeFloor(seed);
      const pick = guardianOf(a, a.state.gates.at(-1)!).defId;
      expect(guardianOf(b, b.state.gates.at(-1)!).defId).toBe(pick);
      chosen.add(pick);
    }
    expect([...chosen].sort()).toEqual(['warden', 'wyrm']);
  });

  it('leaves the way down open when the last chunk has nobody to stand there', () => {
    const content = draft();
    delete content.zones[0]!.chunks.at(-1)!.guardians;
    install(content);
    const game = spawnWholeFloor();
    expect(game.state.gates).toEqual([]);
    expect(hasPortal(game)).toBe(true);
  });
});

describe('zones in content', () => {
  it('accepts the committed zones', () => {
    expect(errors(draft())).toEqual([]);
  });

  it('refuses a guardian spawning at random, a roamer guarding, and unknown names', () => {
    const content = draft();
    content.zones[0]!.chunks = [
      { enemies: ['warden', 'nobody'], density: 4 },
      { enemies: ['slime'], density: 4, guardians: ['slime', 'ghost'] },
    ];
    const found = errors(content).map((issue) => issue.message).join(' | ');
    expect(found).toMatch(/"warden" is a guardian, so it cannot spawn at random/);
    expect(found).toMatch(/spawns "nobody", which does not exist/);
    expect(found).toMatch(/"slime" guards chunk 2, so it must be marked as a guardian/);
    expect(found).toMatch(/guarded by "ghost", which does not exist/);
  });

  it('refuses no zones, no chunks, two zones of one name, and ground upside down', () => {
    const none = draft();
    none.zones = [];
    expect(errors(none).map((issue) => issue.message).join()).toMatch(/at least one zone/);

    // A shape error stops the cross-checks, so the empty floor goes alone.
    const empty = draft();
    empty.zones[0]!.chunks = [];
    expect(errors(empty).map((issue) => issue.message).join()).toMatch(/at least one chunk/);

    const content = draft();
    content.zones[1]!.name = content.zones[2]!.name;
    content.zones[2]!.terrain.minHeight = 5;
    content.zones[2]!.terrain.maxHeight = 2;
    const found = errors(content).map((issue) => issue.message).join(' | ');
    expect(found).toMatch(/also called/);
    expect(found).toMatch(/lowest ground is higher than its highest/);
  });
});
