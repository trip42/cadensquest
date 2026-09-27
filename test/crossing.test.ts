import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, enterFloor, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
import { writeCardText } from '~/utils/contentText';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  game.state.terrain = {};
  return game;
}

/** A walkable cell `steps` from the player. */
function cellAt(game: Game, steps: number): Cell {
  const here = entityCell(player(game.state));
  return [...reachable(game.world, here, steps).values()].find((entry) => entry.cost === steps)!.cell;
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'cell', range: 4, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

/** +1 power on entering, lose it on leaving, for `rounds` rounds. */
const rally = (rounds = 3): Effect => ({
  kind: 'terrain', rounds, colour: '#fee761', effects: [],
  enter: [{ kind: 'power', amount: 1 }], exit: [{ kind: 'losePower', amount: 1 }],
});

/** Walk the player one step onto a cell and let the step finish. */
function stepOnto(game: Game, cell: Cell): void {
  const self = player(game.state);
  self.path = [];
  self.motion = { from: entityCell(self), to: cell, t: 0, speed: 4 };
  for (let i = 0; i < 120 && self.motion; i += 1) tick(game, 1 / 60);
}

describe('entering and leaving a mark', () => {
  it('enters once, however many rounds it stands there', () => {
    const game = quiet();
    const self = player(game.state);
    define('rally', [rally(5)], { targeting: 'self', range: 0 });
    play(game, 'rally', null);
    expect(self.power).toBe(1);
    beginTurn(game);
    beginTurn(game);
    expect(self.power).toBe(1);
  });

  it('takes it back on walking off, and gives it again on coming back', () => {
    const game = quiet();
    const self = player(game.state);
    const home = entityCell(self);
    const next = cellAt(game, 1);
    define('rally', [rally()], { targeting: 'self', range: 0 });
    play(game, 'rally', null);
    stepOnto(game, next);
    expect(self.power).toBe(0);
    stepOnto(game, home);
    expect(self.power).toBe(1);
  });

  it('enters as a creature steps on', () => {
    const game = quiet();
    const self = player(game.state);
    const next = cellAt(game, 1);
    define('rally_at', [rally()]);
    play(game, 'rally_at', next);
    expect(self.power).toBe(0);
    stepOnto(game, next);
    expect(self.power).toBe(1);
  });

  it('takes it back when the mark runs out underneath', () => {
    const game = quiet();
    const self = player(game.state);
    define('rally', [rally(2)], { targeting: 'self', range: 0 });
    play(game, 'rally', null);
    beginTurn(game);
    expect(self.power).toBe(1);
    beginTurn(game);
    expect(self.power).toBe(0);
    expect(game.state.terrain).toEqual({});
  });

  it('takes it back on leaving the floor', () => {
    const game = quiet();
    define('rally', [rally()], { targeting: 'self', range: 0 });
    play(game, 'rally', null);
    enterFloor(game, 1);
    expect(player(game.state).power).toBe(0);
  });

  it('works on enemies too, and each layer keeps its own list', () => {
    const game = quiet();
    const spot = cellAt(game, 2);
    const wolf = makeEntity('wolf', spot.row, spot.col);
    game.state.entities.push(wolf);
    define('rally_at', [rally(), rally()]);
    play(game, 'rally_at', spot);
    expect(wolf.power).toBe(2);
    const layers = terrainAt(game.state, spot);
    expect(layers.map((layer) => layer.inside)).toEqual([[wolf.id], [wolf.id]]);
  });

  it('can reset power on leaving', () => {
    const game = quiet();
    const self = player(game.state);
    self.power = 4;
    define('drain', [{ kind: 'terrain', rounds: 3, colour: '#5a6988', effects: [], exit: [{ kind: 'losePower', amount: { of: 'power' } }] }], { targeting: 'self', range: 0 });
    play(game, 'drain', null);
    stepOnto(game, cellAt(game, 1));
    // Fixed from its maker when marked: the power it had then.
    expect(self.power).toBe(0);
  });

  it('leaves plain marks alone: no one is tracked', () => {
    const game = quiet();
    define('fire', [{ kind: 'terrain', rounds: 3, colour: '#e43b44', effects: [{ kind: 'damage', amount: 1 }] }], { targeting: 'self', range: 0 });
    play(game, 'fire', null);
    const [layer] = terrainAt(game.state, entityCell(player(game.state)));
    expect(layer!.inside).toBeUndefined();
  });
});

describe('enter and exit in content', () => {
  it('Rallying Ground reads the way the editor writes it', () => {
    const card = CARDS.rallying_ground!;
    expect(writeCardText(card.effects as never, card.range, 'player', card.targeting)).toBe(card.text);
  });

  it('refuses a mark with nothing in it, and verbs that cannot go on a tile', () => {
    const content = structuredClone(readContentFiles()) as unknown as Content;
    const card = content.cards.find((item) => item.id === 'rallying_ground')!;
    card.effects = [{ kind: 'terrain', rounds: 3, colour: '#fee761', effects: [] }];
    expect(validateContent(content as never).issues.some((issue) => issue.message.includes('at least one effect'))).toBe(true);
    card.effects = [{ kind: 'terrain', rounds: 3, colour: '#fee761', effects: [], enter: [{ kind: 'tame', amount: 3 }] }];
    expect(validateContent(content as never).issues.some((issue) => issue.field?.endsWith('enter[0].kind'))).toBe(true);
  });
});
