/* The later engines of COMBOS.md: oil, Echo, triggers that aim where an
   enemy fell, momentum, Entrench and Command. */
import { afterEach, describe, expect, it } from 'vitest';
import { amountValues, beginTurn, endPlayerPhase, movePlayerTo, playCard, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, reachable } from '~/game/map/navigation';
import { createGame, entityAt, type Game, makeCard, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  game.state.energy = 9;
  return game;
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'self', range: 0, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null = null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

/** End the turn and play the enemies' out until it is the player's again. */
function nextTurn(game: Game): void {
  const turn = game.state.turn;
  endPlayerPhase(game);
  for (let i = 0; i < 3000 && game.state.turn === turn; i += 1) tick(game, 1 / 60);
}

describe('Entrench: keepBlock', () => {
  it('keeps block through the refresh while it lasts, then clears as usual', () => {
    const game = quiet();
    const self = player(game.state);
    play(game, define('entrench_t', [{ kind: 'block', amount: 5 }, { kind: 'boon', stat: 'keepBlock', add: 1, rounds: 2 }]));
    expect(self.block).toBe(5);
    nextTurn(game);
    expect(self.block).toBe(5);
    nextTurn(game);
    expect(self.block).toBe(0);
  });
});


describe('momentum: tiles walked this turn', () => {
  it('counts steps walked, not leaps, and starts again each turn', () => {
    const game = quiet();
    const self = player(game.state);
    const here = entityCell(self);
    const far = [...reachable(game.world, here, 2).values()].find((entry) => entry.cost === 2)!.cell;
    game.state.movement = 5;
    expect(movePlayerTo(game, far)).toBe(true);
    for (let i = 0; i < 600; i += 1) tick(game, 1 / 60);
    expect(amountValues(game.state, self).moved).toBe(2);
    const land = [...reachable(game.world, far, 2).values()].find((entry) => entry.cost === 2 && !entityAt(game.state, entry.cell.row, entry.cell.col))!.cell;
    play(game, define('leap_t', [{ kind: 'step', amount: 0 }], { targeting: 'cell', range: 3 }), land);
    for (let i = 0; i < 600; i += 1) tick(game, 1 / 60);
    expect(game.state.moved).toBe(2);
    nextTurn(game);
    expect(game.state.moved).toBe(0);
  });
});
