/* Aura reactions and spreading: what happens when marks of two types
   meet on a tile, and marks that creep each round. All of it is content —
   these tests add their own types to it. (Fire spreading through oil, the
   first reaction, is pinned in engines.test.ts.) */
import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, playCard, aurasAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, player, resetUids } from '~/game/state';
import { DEFAULT_LOOK } from '~/game/auras';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

type TypeData = Content['auras'][number];

/** The committed content, plus these aura types. */
function withTypes(...types: Array<Partial<TypeData> & { id: string }>): void {
  const content = structuredClone(readContentFiles()) as unknown as Content;
  for (const type of types) content.auras.push({ name: type.id, look: { ...DEFAULT_LOOK }, ...type } as TypeData);
  loadContent(content as never);
}

function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  game.state.energy = 9;
  return game;
}

/** Lay a mark of this type, for this many rounds, on a cell. */
function lay(game: Game, type: string, cell: Cell, rounds = 3, radius = 0): void {
  const id = `lay_${type}_${rounds}_${radius}`;
  const effect: Effect = { kind: 'aura', rounds, type, effects: [{ kind: 'damage', amount: 1 }], radius };
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'cell', range: 99, text: '', effects: [effect] } as CardDefinition;
  const card = makeCard(id);
  game.state.hand.push(card);
  expect(playCard(game, card.uid, cell)).toBe(true);
}

const typesAt = (game: Game, cell: Cell) => aurasAt(game.state, cell).map((layer) => layer.type);

/** A walkable cell this many steps from the player. */
function away(game: Game, steps = 3): Cell {
  const here = entityCell(player(game.state));
  return [...reachable(game.world, here, steps).values()].find((entry) => entry.cost === steps)!.cell;
}

/** End the turn and play it out, so a new round begins. */
function nextRound(game: Game): void {
  const turn = game.state.turn;
  game.state.hand = [];
  endPlayerPhase(game);
  for (let i = 0; i < 3000 && game.state.turn === turn; i += 1) tick(game, 1 / 60);
}

describe('reactions', () => {
  it('remove: water laid on fire puts it out, and fire laid on water never catches', () => {
    withTypes({ id: 'water', reactions: [{ does: 'removes', with: 'fire' }] });
    const game = quiet();
    const cell = away(game);
    lay(game, 'fire', cell);
    lay(game, 'water', cell);
    expect(typesAt(game, cell)).toEqual(['water']);
    lay(game, 'fire', cell);
    expect(typesAt(game, cell)).toEqual(['water']);
  });

  it('cancel: both go, whichever was laid first', () => {
    withTypes({ id: 'frost', reactions: [{ does: 'cancels', with: 'fire' }] });
    const game = quiet();
    const cell = away(game);
    lay(game, 'fire', cell);
    lay(game, 'frost', cell);
    expect(typesAt(game, cell)).toEqual([]);
    lay(game, 'frost', cell);
    lay(game, 'fire', cell);
    expect(typesAt(game, cell)).toEqual([]);
  });

  it('refuse: it is not laid where the other is, and the other stays', () => {
    withTypes({ id: 'ash', reactions: [{ does: 'refuses', with: 'spring' }] });
    const game = quiet();
    const cell = away(game);
    lay(game, 'spring', cell);
    lay(game, 'ash', cell);
    expect(typesAt(game, cell)).toEqual(['spring']);
  });

  it('spread through: works for any pair of types, not just fire and oil', () => {
    withTypes({ id: 'tar' }, { id: 'spark', reactions: [{ does: 'spreadsThrough', with: 'tar' }] });
    const game = quiet();
    const cell = away(game);
    lay(game, 'tar', cell, 4, 1);
    const patch = Object.keys(game.state.auras).filter((key) => game.state.auras[key]!.some((layer) => layer.type === 'tar'));
    expect(patch.length).toBeGreaterThan(1);
    lay(game, 'spark', cell);
    for (const key of patch) expect(game.state.auras[key]!.map((layer) => layer.type), key).toEqual(['spark']);
  });

  it('are checked: a reaction names a type that exists, and not its own', () => {
    const content = structuredClone(readContentFiles()) as unknown as Content;
    content.auras[0]!.reactions = [{ does: 'removes', with: 'nowhere' }, { does: 'cancels', with: content.auras[0]!.id }];
    const errors = validateContent(content as never).issues.filter((issue) => issue.level === 'error').map((issue) => issue.message);
    expect(errors.some((message) => message.includes('nowhere'))).toBe(true);
    expect(errors.some((message) => message.includes('itself'))).toBe(true);
  });
});

describe('spreading', () => {
  it('creeps onto neighbouring tiles each round, a round shorter, and dies out', () => {
    withTypes({ id: 'blight', spread: 1 });
    const game = quiet();
    const cell = away(game, 4);
    lay(game, 'blight', cell, 3);
    const count = () => Object.values(game.state.auras).flat().filter((layer) => layer.type === 'blight').length;
    expect(count()).toBe(1);
    nextRound(game);
    // It had 2 rounds left: each neighbour gets a copy with 1.
    expect(count()).toBeGreaterThan(1);
    const copies = Object.values(game.state.auras).flat().filter((layer) => layer.type === 'blight' && layer.rounds === 1);
    expect(copies.length).toBe(count() - 1);
    nextRound(game);
    nextRound(game);
    expect(count()).toBe(0);
  });

  it('never at a chance of 0, and the same way every time for a seed', () => {
    withTypes({ id: 'still', spread: 0 }, { id: 'creep', spread: 0.5 });
    const run = () => {
      const game = quiet();
      lay(game, 'still', away(game, 4), 5);
      lay(game, 'creep', away(game, 2), 5);
      nextRound(game);
      nextRound(game);
      return Object.entries(game.state.auras)
        .map(([key, layers]) => `${key}:${layers.map((layer) => layer.type).join('+')}`).sort();
    };
    const first = run();
    expect(first.filter((entry) => entry.includes('still'))).toHaveLength(1);
    expect(run()).toEqual(first);
  });
});
