/* The later engines of COMBOS.md: oil, Echo, triggers that aim where an
   enemy fell, momentum, Entrench and Command. */
import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, playCard, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import type { Cell } from '~/game/map/navigation';
import { createGame, type Game, makeCard, player, resetUids } from '~/game/state';
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

