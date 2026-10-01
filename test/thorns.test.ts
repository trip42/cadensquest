import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, playCard, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell, type Entity } from '~/game/entities/types';
import { type Cell, reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  game.state.terrain = {};
  game.state.energy = 9;
  return game;
}

/** A walkable cell `steps` from the player. */
function cellAt(game: Game, steps: number): Cell {
  const here = entityCell(player(game.state));
  return [...reachable(game.world, here, steps).values()].find((entry) => entry.cost === steps)!.cell;
}

function wolfAt(game: Game, steps: number): Entity {
  const cell = cellAt(game, steps);
  const wolf = makeEntity('wolf', cell.row, cell.col);
  game.state.entities.push(wolf);
  return wolf;
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'enemy', range: 1, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

/** End the player's phase and let the enemies play theirs out. */
function enemyPhase(game: Game): void {
  game.state.hand = [];
  endPlayerPhase(game);
  for (let i = 0; i < 6000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
}

describe('thorns', () => {
  it('is gained like block: Briar Guard gives 4 block and 3 thorns', () => {
    const game = quiet();
    const self = player(game.state);
    play(game, 'briar_guard', null);
    expect(self.block).toBe(4);
    expect(self.thorns).toBe(3);
  });

  it('strikes an adjacent attacker back, once per hit, even when block takes it all', () => {
    const game = quiet();
    const wolf = wolfAt(game, 1);
    wolf.thorns = 3;
    wolf.block = 50;
    const self = player(game.state);
    const hp = self.hp;
    define('twice', [{ kind: 'damage', amount: 2 }, { kind: 'damage', amount: 2 }]);
    play(game, 'twice', entityCell(wolf));
    expect(wolf.hp).toBe(wolf.maxHp);
    // Two hits, two pricks — and no power or bonus on them.
    expect(self.hp).toBe(hp - 6);
    expect(game.state.cues.filter((item) => item.type === 'hit' && item.via === 'thorns')).toHaveLength(2);
  });

  it('does not reach an attacker further off', () => {
    const game = quiet();
    const wolf = wolfAt(game, 2);
    wolf.thorns = 3;
    const hp = player(game.state).hp;
    define('shot', [{ kind: 'damage', amount: 2 }], { range: 3 });
    play(game, 'shot', entityCell(wolf));
    expect(wolf.hp).toBe(wolf.maxHp - 2);
    expect(player(game.state).hp).toBe(hp);
  });

  it('pricks a caster whose burst catches it from beside it', () => {
    const game = quiet();
    const wolf = wolfAt(game, 1);
    wolf.thorns = 4;
    const hp = player(game.state).hp;
    define('nova', [{ kind: 'area', radius: 1, colour: '#ffffff', affects: 'foes', effects: [{ kind: 'damage', amount: 1 }] }], { targeting: 'self', range: 0 });
    play(game, 'nova', null);
    expect(player(game.state).hp).toBe(hp - 4);
  });

  it('is not set off by a marked tile, even one its maker stands beside', () => {
    const game = quiet();
    const wolf = wolfAt(game, 1);
    wolf.thorns = 3;
    const hp = player(game.state).hp;
    define('scorch', [{ kind: 'terrain', rounds: 2, colour: '#e43b44', effects: [{ kind: 'damage', amount: 2 }] }], { targeting: 'cell', range: 1 });
    play(game, 'scorch', entityCell(wolf));
    expect(wolf.hp).toBe(wolf.maxHp - 2);
    expect(player(game.state).hp).toBe(hp);
  });

  it('works for an enemy too, against the player\'s blow — and still pricks on the killing blow', () => {
    const game = quiet();
    const wolf = wolfAt(game, 1);
    wolf.thorns = 2;
    wolf.hp = 1;
    const hp = player(game.state).hp;
    define('poke', [{ kind: 'damage', amount: 5 }]);
    play(game, 'poke', entityCell(wolf));
    expect(wolf.dead).toBe(true);
    expect(player(game.state).hp).toBe(hp - 2);
  });

  it('pricks an enemy that hits the player; thorns never answer thorns', () => {
    const game = quiet();
    const self = player(game.state);
    const wolf = wolfAt(game, 1);
    self.thorns = 3;
    // Both bristling: the wolf is pricked once, and its thorns do not answer.
    INTENTS.test_bite = { id: 'test_bite', name: 'Bite', enabled: true, range: 1, text: '', effects: [{ kind: 'damage', amount: 4 }] } as never;
    wolf.engaged = true;
    wolf.intent = { cardId: 'test_bite', label: 'Bite' };
    const wolfHp = wolf.hp;
    enemyPhase(game);
    expect(wolf.hp).toBe(wolfHp - 3);
  });

  it('falls away like block: the player\'s at his next turn, an enemy\'s as it acts', () => {
    const game = quiet();
    const self = player(game.state);
    self.thorns = 3;
    beginTurn(game);
    expect(self.thorns).toBe(0);

    const wolf = wolfAt(game, 4);
    wolf.thorns = 3;
    wolf.engaged = true;
    wolf.intent = { cardId: 'wolf_circle', label: 'Circle' };
    enemyPhase(game);
    expect(wolf.thorns).toBe(0);
  });
});
