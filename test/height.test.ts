import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, playCard } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { loadContent } from '~/game/content';
import { type Cell, canEnter } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
import { TALISMANS } from '~/game/talismans';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

/** Two neighbouring tiles a layer apart, the higher first. */
function slope(game: Game): [Cell, Cell] {
  const { world } = game;
  for (let row = 2; row < 45; row += 1) {
    for (let col = 0; col < world.width - 1; col += 1) {
      for (const [a, b] of [[{ row, col }, { row, col: col + 1 }], [{ row, col: col + 1 }, { row, col }]] as Array<[Cell, Cell]>) {
        if (!world.walkable(a.row, a.col) || !canEnter(world, a, b.row, b.col)) continue;
        if (world.heightAt(a.row, a.col) === world.heightAt(b.row, b.col) + 1) return [a, b];
      }
    }
  }
  throw new Error('no slope');
}

function setUp(highGround: number): { game: Game; wolf: ReturnType<typeof makeEntity>; high: Cell; low: Cell } {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  const [high, low] = slope(game);
  const self = player(game.state);
  game.state.entities = [self];
  self.row = high.row;
  self.col = high.col;
  const wolf = makeEntity('wolf', low.row, low.col);
  wolf.maxHp = wolf.hp = 40;
  game.state.entities.push(wolf);
  if (highGround) {
    TALISMANS.perch = { id: 'perch', name: 'Perch', enabled: true, text: '', icon: 'default', modifiers: [{ stat: 'highGround', add: highGround }] };
    game.state.talismans.push('perch');
  }
  CARDS.poke = { id: 'poke', name: 'Poke', rarity: 'rare', cost: 0, targeting: 'enemy', range: 1, text: '', effects: [{ kind: 'damage', amount: 5 }] };
  return { game, wolf, high, low };
}

function poke(game: Game, at: Cell): void {
  const card = makeCard('poke');
  game.state.hand.push(card);
  expect(playCard(game, card.uid, at)).toBe(true);
}

describe('high ground', () => {
  it('is off unless raised: height is scenery', () => {
    const { game, wolf, low } = setUp(0);
    poke(game, low);
    expect(wolf.hp).toBe(35);
  });

  it('adds its bonus for each layer above the target, and nothing from below', () => {
    const { game, wolf, low, high } = setUp(2);
    poke(game, low);
    expect(wolf.hp).toBe(40 - 5 - 2);
    // Swap places: now the wolf is above, and the blow gets nothing.
    const self = player(game.state);
    self.row = low.row;
    self.col = low.col;
    wolf.row = high.row;
    wolf.col = high.col;
    poke(game, high);
    expect(wolf.hp).toBe(40 - 5 - 2 - 5);
  });
});
