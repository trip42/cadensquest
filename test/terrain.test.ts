import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, isValidTarget, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
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

const burn = (damage: number, rounds = 3): Effect => ({ kind: 'terrain', rounds, colour: '#e43b44', effects: [{ kind: 'damage', amount: damage }] });

/** Walk the player one step onto a cell and let the step finish. */
function stepOnto(game: Game, cell: Cell): void {
  const self = player(game.state);
  self.path = [cell];
  self.motion = { from: entityCell(self), to: self.path.shift()!, t: 0, speed: 4 };
  for (let i = 0; i < 120 && self.motion; i += 1) tick(game, 1 / 60);
}

describe('marking a tile', () => {
  it('stacks marks on a tile as separate layers', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('fire_a', [burn(3)]);
    define('spring_a', [{ kind: 'terrain', rounds: 1, colour: '#63c74d', effects: [{ kind: 'heal', amount: 2 }] }]);
    expect(play(game, 'fire_a', cell)).toBe(true);
    expect(play(game, 'spring_a', cell)).toBe(true);
    const layers = terrainAt(game.state, cell);
    expect(layers.map((layer) => layer.colour)).toEqual(['#e43b44', '#63c74d']);
    expect(layers.map((layer) => layer.rounds)).toEqual([3, 1]);
  });

  it('fixes its amounts from the one who marked it — X included', () => {
    const game = quiet();
    game.state.energy = 3;
    const cell = cellAt(game, 2);
    define('fire_x', [{ kind: 'terrain', rounds: { of: 'x' }, colour: '#e43b44', effects: [{ kind: 'damage', amount: { of: 'x', times: 2 } }] }], { cost: 'X' });
    play(game, 'fire_x', cell);
    expect(terrainAt(game.state, cell)[0]).toMatchObject({ rounds: 3, effects: [{ kind: 'damage', amount: 6 }] });
  });

  it('hits whoever is already standing there, at once', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    const foe = makeEntity('wolf', cell.row, cell.col);
    game.state.entities.push(foe);
    define('fire_b', [burn(4)]);
    expect(isValidTarget(game, (game.state.hand.push(makeCard('fire_b')), game.state.hand.at(-1)!.uid), cell)).toBe(true);
    game.state.hand.pop();
    play(game, 'fire_b', cell);
    expect(foe.hp).toBe(foe.maxHp - 4);
  });

  it('with no target, marks the actor’s own tile', () => {
    const game = quiet();
    const self = player(game.state);
    self.hp = 20;
    define('spring_self', [{ kind: 'terrain', rounds: 2, colour: '#63c74d', effects: [{ kind: 'heal', amount: 5 }] }], { targeting: 'self', range: 0 });
    play(game, 'spring_self', null);
    expect(terrainAt(game.state, entityCell(self))).toHaveLength(1);
    expect(self.hp).toBe(25);
  });
});

describe('when a tile hits', () => {
  it('hits on stepping onto it, but only once a round', () => {
    const game = quiet();
    const self = player(game.state);
    const start = entityCell(self);
    const cell = cellAt(game, 1);
    define('fire_c', [burn(2)]);
    play(game, 'fire_c', cell);
    self.block = 0;
    const hp = self.hp;
    stepOnto(game, cell);
    expect(self.hp).toBe(hp - 2);
    stepOnto(game, start);
    stepOnto(game, cell);
    expect(self.hp).toBe(hp - 2);   // pacing does not hit again this round
  });

  it('hits again as each turn begins while standing on it, and runs out', () => {
    const game = quiet();
    const self = player(game.state);
    const cell = cellAt(game, 1);
    define('fire_d', [burn(1, 2)]);
    play(game, 'fire_d', cell);
    stepOnto(game, cell);
    const afterStep = self.hp;
    self.block = 0;
    game.state.entities = [self];
    endPlayerPhase(game);
    for (let i = 0; i < 2000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    // New round: one round left, and it burns him where he stands.
    expect(terrainAt(game.state, cell)[0]?.rounds).toBe(1);
    expect(self.hp).toBe(afterStep - 1);
    endPlayerPhase(game);
    for (let i = 0; i < 2000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(terrainAt(game.state, cell)).toEqual([]);
  });

  it('hits an enemy standing on it as the enemy phase begins', () => {
    const game = quiet();
    const cell = cellAt(game, 3);
    const foe = makeEntity('wolf', cell.row, cell.col);
    foe.intent = null;
    game.state.entities.push(foe);
    define('fire_e', [burn(3)]);
    play(game, 'fire_e', cell);          // immediate: 3
    const afterMark = foe.hp;
    game.state.turn += 1;                // a new round, without the refresh
    game.state.terrainHits = {};
    endPlayerPhase(game);
    expect(foe.hp).toBe(afterMark - 3);
  });

  it('lets an enemy mark the player’s tile, within its reach', () => {
    const game = quiet();
    const self = player(game.state);
    const cell = cellAt(game, 1);
    const foe = makeEntity('wolf', cell.row, cell.col);
    game.state.entities.push(foe);
    INTENTS.scorch = { id: 'scorch', name: 'Scorch', cost: 0, rarity: 'normal', targeting: 'enemy', range: 2, text: '', effects: [burn(2)] };
    foe.intent = { cardId: 'scorch', label: 'Scorch' };
    self.block = 0;
    const hp = self.hp;
    endPlayerPhase(game);
    for (let i = 0; i < 3000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(terrainAt(game.state, entityCell(self)).length).toBeGreaterThan(0);
    expect(self.hp).toBeLessThanOrEqual(hp - 2);
  });
});

describe('terrain in content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;
  const check = (content: Content) => validateContent(content as never);

  it('accepts the example cards', () => {
    expect(check(draft()).issues).toEqual([]);
  });

  it('refuses Leap or Advance on a tile', () => {
    const content = draft();
    const fire = content.cards.find((card) => card.id === 'fire')!;
    (fire.effects[0] as { effects: unknown[] }).effects.push({ kind: 'advance', amount: 2 });
    expect(check(content).issues[0]).toMatchObject({ level: 'error', id: 'fire', field: 'effects[0].effects[1].kind' });
  });

  it('refuses terrain inside terrain', () => {
    const content = draft();
    const fire = content.cards.find((card) => card.id === 'fire')!;
    (fire.effects[0] as { effects: unknown[] }).effects.push(burn(1));
    expect(check(content).content).toBeNull();
  });

  it('writes the text the way the cards say it', () => {
    expect(writeCardText([burn(3)], 3, 'player', 'cell')).toBe('Mark a tile within 3: for 3 rounds, whoever is on it takes 3 damage.');
  });
});
