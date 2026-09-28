import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
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
  return game;
}

/** A walkable cell `steps` from the player. */
function cellAt(game: Game, steps: number, skip = 0): Cell {
  const here = entityCell(player(game.state));
  return [...reachable(game.world, here, steps).values()].filter((entry) => entry.cost === steps)[skip]!.cell;
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'cell', range: 4, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null = null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

const fire = (damage: number, rounds = 3): Effect =>
  ({ kind: 'terrain', rounds, colour: '#e43b44', element: 'fire', effects: [{ kind: 'damage', amount: damage }] });

/** A sturdy enemy standing on a cell. */
function dummy(game: Game, cell: Cell) {
  const enemy = makeEntity('bug', cell.row, cell.col);
  enemy.hp = enemy.maxHp = 99;
  game.state.entities.push(enemy);
  return enemy;
}

describe('fire', () => {
  it('carries its element onto the tile', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('fire_t', [fire(3)]);
    define('mark_t', [{ kind: 'terrain', rounds: 3, colour: '#e43b44', effects: [{ kind: 'damage', amount: 3 }] }]);
    play(game, 'fire_t', cell);
    play(game, 'mark_t', cell);
    expect(terrainAt(game.state, cell).map((layer) => layer.element)).toEqual(['fire', undefined]);
  });

  it('is what Fire, Wildfire and the Whelp\'s Scorch make', () => {
    for (const card of [CARDS.fire!, CARDS.wildfire!, INTENTS.whelp_scorch!]) {
      expect(card.effects.some((effect) => effect.kind === 'terrain' && effect.element === 'fire'), card.id).toBe(true);
    }
  });
});
