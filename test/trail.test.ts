import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, movePlayerTo, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect, TerrainEffect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, cellDistance, reachable } from '~/game/map/navigation';
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

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'self', range: 0, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null = null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

/** Let everything moving finish moving. */
function settle(game: Game): void {
  for (let i = 0; i < 600; i += 1) tick(game, 1 / 60);
}

const embers: TerrainEffect = { kind: 'terrain', rounds: 2, colour: '#e43b44', element: 'fire', effects: [{ kind: 'damage', amount: 1 }], radius: 2 };
const TRAIL: Effect = { kind: 'trail', rounds: 3, mark: embers };

/** A walk of two steps from the player: the cell after one, and after two. */
function straightWalk(game: Game): [Cell, Cell] {
  const here = entityCell(player(game.state));
  const steps = (from: Cell) => [...reachable(game.world, from, 1).values()].filter((entry) => entry.cost === 1).map((entry) => entry.cell);
  for (const first of steps(here)) {
    const second = steps(first).find((cell) => cellDistance(cell, here) === 2);
    if (second) return [first, second];
  }
  throw new Error('no walk here');
}

describe('trails', () => {
  it('mark every tile left, one tile each, and not the tile arrived on', () => {
    const game = quiet();
    const start = entityCell(player(game.state));
    const [first, second] = straightWalk(game);
    play(game, define('trail_t', [TRAIL]));
    game.state.movement = 5;
    expect(movePlayerTo(game, second)).toBe(true);
    settle(game);
    expect(terrainAt(game.state, start).map((layer) => layer.element)).toEqual(['fire']);
    expect(terrainAt(game.state, first).map((layer) => layer.element)).toEqual(['fire']);
    expect(terrainAt(game.state, second)).toEqual([]);
    // The radius is ignored: only the tiles walked from.
    const marked = Object.values(game.state.terrain).filter((layers) => layers.some((layer) => layer.element === 'fire'));
    expect(marked).toHaveLength(2);
  });

  it('last this round and the ones after, then stop', () => {
    const game = quiet();
    play(game, define('trail_t', [{ ...TRAIL, rounds: 2 } as Effect]));
    expect(game.state.trails).toHaveLength(1);
    endPlayerPhase(game);
    settle(game);
    expect(game.state.trails).toHaveLength(1);
    endPlayerPhase(game);
    settle(game);
    expect(game.state.trails).toHaveLength(0);
  });

  it('burn the one laying it if he doubles back', () => {
    const game = quiet();
    const self = player(game.state);
    const start = entityCell(self);
    const [first] = straightWalk(game);
    play(game, define('trail_t', [TRAIL]));
    game.state.movement = 5;
    movePlayerTo(game, first);
    settle(game);
    self.block = 0;
    const hp = self.hp;
    movePlayerTo(game, start);
    settle(game);
    expect(self.hp).toBe(hp - 1);
  });

  it('are laid by an enemy as it walks, too', () => {
    const game = quiet();
    const self = player(game.state);
    // Put the enemy a few steps off and give it a trail and a walk.
    const spot = [...reachable(game.world, entityCell(self), 4).values()].find((entry) => entry.cost === 4)!.cell;
    const wolf = makeEntity('wolf', spot.row, spot.col);
    game.state.entities.push(wolf);
    game.state.trails.push({ id: 't1', actorId: wolf.id, rounds: 2, mark: { ...embers, radius: undefined } });
    wolf.intent = { cardId: 'wolf_lunge', label: 'Lunge' };
    endPlayerPhase(game);
    for (let i = 0; i < 3000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(terrainAt(game.state, spot).some((layer) => layer.ownerId === wolf.id)).toBe(true);
  });

  it('write themselves out in the editor', () => {
    expect(writeCardText([TRAIL], 0, 'player', 'self'))
      .toBe('For 3 rounds, every tile you leave is marked for 2 rounds: whoever is on it takes 1 damage.');
  });
});
