/* What heats, lengthens, wards, prolongs, pulses and counts an aura names
   the aura it is about — nothing about any type is in code. The fire tests
   (fire.test.ts) pin that Fire still behaves exactly as it did; these pin
   that it is per type: what is said of Fire leaves Poison alone, and the
   same works for Poison. */
import { afterEach, describe, expect, it } from 'vitest';
import { amountValues, beginTurn, layerEffects, playCard, aurasAt } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids, stat } from '~/game/state';
import { describeModifier, type StatModifier } from '~/game/stats';
import { TALISMANS } from '~/game/talismans';
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

function cellAt(game: Game, steps: number, skip = 0): Cell {
  const here = entityCell(player(game.state));
  return [...reachable(game.world, here, steps).values()].filter((entry) => entry.cost === steps)[skip]!.cell;
}

function play(game: Game, effects: Effect[], target: Cell | null = null): void {
  const id = `card_${Object.keys(CARDS).length}`;
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: target ? 'cell' : 'self', range: 4, text: '', effects } as CardDefinition;
  const card = makeCard(id);
  game.state.hand.push(card);
  expect(playCard(game, card.uid, target)).toBe(true);
}

const mark = (type: string, damage: number, rounds = 3): Effect => ({ kind: 'aura', rounds, type, effects: [{ kind: 'damage', amount: damage }] });

function hold(game: Game, modifiers: StatModifier[]): void {
  TALISMANS.test_charm = { id: 'test_charm', name: 'Charm', text: '', icon: 'gem', modifiers };
  game.state.talismans.push('test_charm');
}

describe('aura stats', () => {
  it('are kept per aura type: heat for Fire leaves Poison as it is', () => {
    const game = quiet();
    const [a, b] = [cellAt(game, 2, 0), cellAt(game, 2, 1)];
    play(game, [mark('fire', 2)], a);
    play(game, [mark('poison', 2)], b);
    hold(game, [{ stat: 'auraDamage', aura: 'fire', add: 3 }, { stat: 'auraDamage', aura: 'poison', add: 1 }, { stat: 'auraMultiplier', aura: 'poison', mul: 2 }]);
    expect(stat(game.state, 'auraDamage', 'fire')).toBe(3);
    expect(stat(game.state, 'auraDamage', 'poison')).toBe(1);
    expect(stat(game.state, 'auraDamage')).toBe(0);
    expect(layerEffects(game.state, aurasAt(game.state, a)[0]!)).toEqual([{ kind: 'damage', amount: 5 }]);
    expect(layerEffects(game.state, aurasAt(game.state, b)[0]!)).toEqual([{ kind: 'damage', amount: 6 }]);
  });

  it('lengthen and ward one type only', () => {
    const game = quiet();
    hold(game, [{ stat: 'auraRounds', aura: 'poison', add: 2 }, { stat: 'auraWard', aura: 'poison', add: 1 }]);
    const here = entityCell(player(game.state));
    const hp = player(game.state).hp;
    play(game, [mark('poison', 4)], here);
    expect(aurasAt(game.state, here).map((layer) => layer.rounds)).toEqual([5]);
    expect(player(game.state).hp).toBe(hp);
    play(game, [mark('fire', 4)], here);
    expect(player(game.state).hp).toBe(hp - 4);
  });

  it('read in the aura\'s own name', () => {
    expect(describeModifier({ stat: 'auraDamage', aura: 'poison', add: 1 })).toBe('+1 poison damage');
    expect(describeModifier({ stat: 'auraRounds', aura: 'fire', add: 1 })).toBe('+1 rounds every fire lasts');
  });
});

describe('Prolong, Pulse and counting aura tiles', () => {
  it('Prolong and Pulse touch only the aura they name', () => {
    const game = quiet();
    const [a, b] = [cellAt(game, 2, 0), cellAt(game, 2, 1)];
    for (const cell of [a, b]) {
      const enemy = makeEntity('bug', cell.row, cell.col);
      enemy.hp = enemy.maxHp = 99;
      game.state.entities.push(enemy);
    }
    play(game, [mark('fire', 2)], a);
    play(game, [mark('poison', 2)], b);
    const hp = (cell: Cell) => game.state.entities.find((entity) => entity.row === cell.row && entity.col === cell.col)!.hp;
    const before = [hp(a), hp(b)];
    play(game, [{ kind: 'prolong', amount: 4, aura: 'poison' }, { kind: 'pulse', amount: 1, aura: 'poison' }]);
    expect(aurasAt(game.state, a)[0]!.rounds).toBe(3);
    expect(aurasAt(game.state, b)[0]!.rounds).toBe(7);
    expect(hp(a)).toBe(before[0]);
    expect(hp(b)).toBe(before[1]! - 3);
  });

  it('count only the named aura\'s tiles nearby', () => {
    const game = quiet();
    play(game, [mark('fire', 1)], cellAt(game, 1, 0));
    play(game, [mark('fire', 1)], cellAt(game, 2, 0));
    play(game, [mark('poison', 1)], cellAt(game, 2, 1));
    const values = amountValues(game.state, player(game.state));
    expect(values.auras).toEqual({ fire: 2, poison: 1 });
  });
});

describe('content that names an aura', () => {
  const issuesOf = (edit: (content: Content) => void) => {
    const content = structuredClone(readContentFiles()) as unknown as Content;
    edit(content);
    return validateContent(content as never).issues.filter((issue) => issue.level === 'error').map((issue) => issue.message);
  };

  it('must name one when it is about one, and one that exists', () => {
    expect(issuesOf((c) => { c.cards[0]!.effects = [{ kind: 'boon', stat: 'auraDamage', add: 1, rounds: 2 }]; }).join()).toContain('needs an aura type');
    expect(issuesOf((c) => { c.cards[0]!.effects = [{ kind: 'pulse', amount: 1 }]; }).join()).toContain('needs an aura type');
    expect(issuesOf((c) => { c.cards[0]!.effects = [{ kind: 'block', amount: { of: 'auras' } }]; }).join()).toContain('needs an aura type');
    expect(issuesOf((c) => { c.talismans[0]!.modifiers = [{ stat: 'auraWard', aura: 'lava', add: 1 }]; }).join()).toContain('"lava" is not an aura type');
  });

  it('may not name one when it is not', () => {
    expect(issuesOf((c) => { c.cards[0]!.effects = [{ kind: 'damage', amount: 2, aura: 'fire' }]; }).join()).toContain('only Prolong, Pulse');
    expect(issuesOf((c) => { c.cards[0]!.effects = [{ kind: 'boon', stat: 'maxHp', aura: 'fire', add: 1, rounds: 2 }]; }).join()).toContain('only Prolong, Pulse');
  });

  it('is clean in the committed content', () => {
    expect(issuesOf(() => {})).toEqual([]);
  });
});
