import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, enterFloor, GUARDIAN_WAKE_ROWS, playCard, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { loadContent } from '~/game/content';
import { entityCell } from '~/game/entities/types';
import { cellDistance } from '~/game/map/navigation';
import { gateRowOf } from '~/game/map/tiles';
import { createGame, type Game, makeCard, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

/** The first floor, the player `rowsShort` rows from its end, and nothing
 *  on it but its guardian. */
function floor(rowsShort: number): Game {
  resetUids();
  const game = createGame(90210);
  enterFloor(game, 0);
  const self = player(game.state);
  const row = gateRowOf(0) - rowsShort;
  self.row = row;
  self.col = Array.from({ length: game.world.width }, (_, c) => c).find((c) => game.world.walkable(row, c))!;
  beginTurn(game);
  const gate = game.state.gates[0]!;
  game.state.entities = game.state.entities.filter((entity) => entity.faction !== 'enemy' || entity.id === gate.guardianId);
  game.state.hand = [];
  return game;
}

const gateOf = (game: Game) => game.state.gates[0]!;
const guardianOf = (game: Game) => game.state.entities.find((entity) => entity.id === gateOf(game).guardianId)!;
const wakings = (game: Game) => game.state.cues.filter((item) => item.type === 'guardian').length;

/** Its next card is its maul (close up to 2, then hit at range 2), and the
 *  enemy phase plays out. */
function mauls(game: Game): void {
  guardianOf(game).intent = { cardId: 'warden_maul', label: 'Maul' };
  endPlayerPhase(game);
  for (let i = 0; i < 6000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
}

describe('a guardian', () => {
  it('keeps its post while the player is far off', () => {
    const game = floor(20);
    const guardian = guardianOf(game);
    const post = entityCell(guardian);
    expect(gateOf(game).awake).toBe(false);
    mauls(game);
    expect(entityCell(guardian)).toEqual(post);
    expect(wakings(game)).toBe(0);
  });

  it(`wakes, once, when the player comes within ${GUARDIAN_WAKE_ROWS} rows of the end`, () => {
    const game = floor(GUARDIAN_WAKE_ROWS);
    expect(gateOf(game).awake).toBe(true);
    expect(game.state.cues.find((item) => item.type === 'guardian')).toMatchObject({ target: guardianOf(game).id, name: 'Warden' });
    beginTurn(game);
    expect(wakings(game)).toBe(1);
  });

  it('closes in once awake', () => {
    const game = floor(GUARDIAN_WAKE_ROWS);
    const guardian = guardianOf(game);
    const before = cellDistance(entityCell(guardian), entityCell(player(game.state)));
    expect(before).toBeGreaterThan(2);
    mauls(game);
    expect(cellDistance(entityCell(guardian), entityCell(player(game.state)))).toBeLessThan(before);
  });

  it('wakes when something hits it from afar', () => {
    const game = floor(20);
    CARDS.long_shot = {
      id: 'long_shot', name: 'Long Shot', rarity: 'rare', cost: 0, targeting: 'enemy', range: 30, text: '',
      effects: [{ kind: 'damage', amount: 1 }],
    };
    const card = makeCard('long_shot');
    game.state.hand.push(card);
    expect(playCard(game, card.uid, entityCell(guardianOf(game)))).toBe(true);
    expect(gateOf(game).awake).toBe(true);
    expect(wakings(game)).toBe(1);
  });

  it('can be pulled off its post, which wakes it', () => {
    const game = floor(GUARDIAN_WAKE_ROWS + 3);
    CARDS.long_hook = {
      id: 'long_hook', name: 'Long Hook', rarity: 'rare', cost: 0, targeting: 'enemy', range: 30, text: '',
      effects: [{ kind: 'pull', amount: 2 }],
    };
    const guardian = guardianOf(game);
    const post = entityCell(guardian);
    const card = makeCard('long_hook');
    game.state.hand.push(card);
    expect(playCard(game, card.uid, post)).toBe(true);
    expect(entityCell(guardian)).not.toEqual(post);
    expect(gateOf(game).awake).toBe(true);
  });
});
