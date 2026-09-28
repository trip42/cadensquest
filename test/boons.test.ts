import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, handText, playCard, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { createGame, type Game, makeCard, player, resetUids, stat } from '~/game/state';
import { joinText } from '~/game/text';
import { writeCardText } from '~/utils/contentText';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  return game;
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'self', range: 0, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, null);
}

/** End the turn and play out the enemies' until it is the player's again. */
function nextTurn(game: Game): void {
  const turn = game.state.turn;
  endPlayerPhase(game);
  for (let i = 0; i < 3000 && game.state.turn === turn; i += 1) tick(game, 1 / 60);
}

describe('boons', () => {
  it('raise a stat for this round and the next, then go', () => {
    const game = quiet();
    define('stoke_t', [{ kind: 'boon', stat: 'fireDamage', add: 2, rounds: 2 }]);
    play(game, 'stoke_t');
    expect(stat(game.state, 'fireDamage')).toBe(2);
    nextTurn(game);
    expect(stat(game.state, 'fireDamage')).toBe(2);
    nextTurn(game);
    expect(stat(game.state, 'fireDamage')).toBe(0);
    expect(game.state.boons).toEqual([]);
  });

  it('multiply, after every add', () => {
    const game = quiet();
    define('inferno_t', [{ kind: 'boon', stat: 'slamDamage', mul: 2, rounds: 1 }]);
    define('plus_t', [{ kind: 'boon', stat: 'slamDamage', add: 1, rounds: 1 }]);
    play(game, 'inferno_t');
    play(game, 'plus_t');
    expect(stat(game.state, 'slamDamage')).toBe((2 + 1) * 2);
  });

  it('fix a scaled amount when played', () => {
    const game = quiet();
    const self = player(game.state);
    self.power = 3;
    define('fury_t', [{ kind: 'boon', stat: 'fireDamage', add: { of: 'power' }, rounds: 2 }]);
    play(game, 'fury_t');
    self.power = 0;
    expect(stat(game.state, 'fireDamage')).toBe(3);
  });

  it('are counted down before the refresh reads them', () => {
    const game = quiet();
    define('hand_t', [{ kind: 'boon', stat: 'handSize', add: 2, rounds: 1 }]);
    play(game, 'hand_t');
    game.state.hand = [];
    // It lasted this round only, so the refresh deals the usual hand.
    nextTurn(game);
    expect(game.state.hand).toHaveLength(stat(game.state, 'handSize'));
    expect(stat(game.state, 'handSize')).toBe(5);
  });

  it('hand over health when max health goes up, and take the room back after', () => {
    const game = quiet();
    const self = player(game.state);
    define('vigour_t', [{ kind: 'boon', stat: 'maxHp', add: 10, rounds: 1 }]);
    const hp = self.hp;
    play(game, 'vigour_t');
    expect(self.maxHp).toBe(50);
    expect(self.hp).toBe(hp + 10);
    nextTurn(game);
    expect(self.maxHp).toBe(40);
    expect(self.hp).toBeLessThanOrEqual(40);
  });

  it('show their amount through a {1} token, live in hand', () => {
    const game = quiet();
    player(game.state).power = 4;
    const def = CARDS[define('fury_t', [{ kind: 'boon', stat: 'fireDamage', add: { of: 'power' }, rounds: 2 }], { text: 'Fire deals {1} more.' })]!;
    expect(joinText(handText(game.state, def))).toBe('Fire deals 4 more.');
  });

  it('read well from the editor\'s "write it for me"', () => {
    expect(writeCardText([{ kind: 'boon', stat: 'fireDamage', add: 2, rounds: 2 }, { kind: 'draw', amount: 1 }], 0, 'player', 'self'))
      .toBe('For 2 rounds, every fire deals 2 more damage and draw a card.');
  });
});

describe('boons in content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;

  it('need something to add or multiply by', () => {
    const content = draft();
    content.cards[0]!.effects = [{ kind: 'boon', stat: 'fireDamage', rounds: 2 }];
    expect(validateContent(content as never).issues.some((issue) => issue.level === 'error' && /boon needs/.test(issue.message))).toBe(true);
  });

  it('warn on an enemy card, which has no stats to raise', () => {
    const content = draft();
    content['enemy-cards'][0]!.effects.push({ kind: 'boon', stat: 'fireDamage', add: 1, rounds: 2 });
    expect(validateContent(content as never).issues.some((issue) => issue.level === 'warning' && /Boon does nothing/.test(issue.message))).toBe(true);
  });
});
