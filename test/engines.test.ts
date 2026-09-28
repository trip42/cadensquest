/* The later engines of COMBOS.md: oil, Echo, triggers that aim where an
   enemy fell, momentum, Entrench and Command. */
import { afterEach, describe, expect, it } from 'vitest';
import { amountValues, beginTurn, endPlayerPhase, movePlayerTo, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, reachable } from '~/game/map/navigation';
import { createGame, entityAt, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
import { GEMS } from '~/game/gems';
import { TALISMANS } from '~/game/talismans';
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

describe('triggers aim where an enemy fell', () => {
  it('a mark from enemyDefeated lands on the fallen one\'s tile, not the player\'s', () => {
    const game = quiet();
    const self = player(game.state);
    TALISMANS.test_pyre = {
      id: 'test_pyre', name: 'Pyre', text: '', icon: 'flame',
      triggers: [{ on: 'enemyDefeated', effects: [{ kind: 'terrain', rounds: 2, colour: '#e43b44', element: 'fire', effects: [{ kind: 'damage', amount: 2 }] }] }],
    };
    game.state.talismans.push('test_pyre');
    const here = entityCell(self);
    const cell = [...reachable(game.world, here, 1).values()].find((entry) => entry.cost === 1)!.cell;
    const foe = makeEntity('bug', cell.row, cell.col);
    foe.hp = 1;
    game.state.entities.push(foe);
    play(game, define('hit_t', [{ kind: 'damage', amount: 5 }], { targeting: 'enemy', range: 1 }), cell);
    expect(foe.dead).toBe(true);
    expect(terrainAt(game.state, cell).map((layer) => layer.element)).toEqual(['fire']);
    expect(terrainAt(game.state, here)).toEqual([]);
  });
});

describe('Echo', () => {
  it('makes the next card happen twice, gems and all, and only the next', () => {
    const game = quiet();
    const self = player(game.state);
    self.block = 0;
    GEMS.test_gem = { id: 'test_gem', name: 'Gem', colour: '#ffffff', text: '', effects: [{ kind: 'block', amount: 1 }] };
    play(game, define('echo_t', [{ kind: 'echo', amount: 1 }]));
    const guard = makeCard(define('guard_t', [{ kind: 'block', amount: 3 }]));
    guard.gems = ['test_gem'];
    game.state.hand.push(guard);
    playCard(game, guard.uid, null);
    expect(self.block).toBe(8);
    play(game, 'guard_t');
    expect(self.block).toBe(11);
  });

  it('spends X once and reads it twice', () => {
    const game = quiet();
    const self = player(game.state);
    self.block = 0;
    game.state.energy = 3;
    play(game, define('echo_t', [{ kind: 'echo', amount: 1 }]));
    play(game, define('guard_x', [{ kind: 'block', amount: { of: 'x' } }], { cost: 'X' }));
    expect(game.state.energy).toBe(0);
    expect(self.block).toBe(6);
  });

  it('is gone at the end of the turn', () => {
    const game = quiet();
    play(game, define('echo_t', [{ kind: 'echo', amount: 1 }]));
    nextTurn(game);
    expect(game.state.echo).toBe(0);
  });
});

describe('oil', () => {
  it('does nothing alone, and fire lit on it spreads across the connected slick', () => {
    const game = quiet();
    const self = player(game.state);
    const here = entityCell(self);
    const near = [...reachable(game.world, here, 3).values()].filter((entry) => entry.cost === 2).map((entry) => entry.cell);
    const target = near[0]!;
    const oil: Effect = { kind: 'terrain', rounds: 4, colour: '#3e2731', element: 'oil', effects: [], radius: 1 };
    play(game, define('oil_t', [oil], { targeting: 'cell', range: 3 }), target);
    const slick = Object.entries(game.state.terrain).filter(([, layers]) => layers.some((layer) => layer.element === 'oil')).map(([key]) => key);
    expect(slick.length).toBeGreaterThan(1);
    // Light the one tile: the whole slick burns, and the oil is gone.
    play(game, define('fire_t', [{ kind: 'terrain', rounds: 2, colour: '#e43b44', element: 'fire', effects: [{ kind: 'damage', amount: 2 }] }], { targeting: 'cell', range: 3 }), target);
    for (const key of slick) {
      const layers = game.state.terrain[key]!;
      expect(layers.map((layer) => layer.element), key).toEqual(['fire']);
    }
    expect(terrainAt(game.state, target)).toHaveLength(1);
  });

  it('may be an empty mark in content', () => {
    const content = structuredClone(readContentFiles()) as unknown as Content;
    content.cards[0]!.effects = [{ kind: 'terrain', rounds: 4, colour: '#3e2731', element: 'oil', effects: [] }];
    expect(validateContent(content as never).issues.filter((issue) => issue.level === 'error')).toEqual([]);
  });
});
