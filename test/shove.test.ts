import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { GUARDIAN_IDS } from '~/game/entities/definitions';
import { entityCell } from '~/game/entities/types';
import { type Cell, canEnter } from '~/game/map/navigation';
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
  game.state.energy = 9;
  return game;
}

/** `length` tiles in a straight line, each a legal step from the last —
 *  and, with `edge`, running into the side of the map. */
function line(game: Game, length: number, along: 'row' | 'col', edge = false): Cell[] {
  const { world } = game;
  for (let row = 2; row < 40; row += 1) {
    for (let col = 0; col < world.width; col += 1) {
      const cells = Array.from({ length }, (_, i) => (along === 'row' ? { row: row + i, col } : { row, col: col + i }));
      if (!world.walkable(cells[0]!.row, cells[0]!.col)) continue;
      if (!cells.slice(1).every((cell, i) => canEnter(world, cells[i]!, cell.row, cell.col))) continue;
      if (edge && cells.at(-1)!.col !== world.width - 1) continue;
      return cells;
    }
  }
  throw new Error('no straight run found');
}

function stand(game: Game, cell: Cell, defId = 'wolf', hp = 30) {
  const creature = makeEntity(defId, cell.row, cell.col);
  creature.maxHp = creature.hp = hp;
  creature.intent = null;
  game.state.entities.push(creature);
  return creature;
}

function place(game: Game, cell: Cell): void {
  const self = player(game.state);
  self.row = cell.row;
  self.col = cell.col;
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'enemy', range: 1, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

const settle = (game: Game) => {
  for (let i = 0; i < 120; i += 1) tick(game, 1 / 60);
};

describe('knockback', () => {
  it('knocks the target straight back, at once as far as the rules know', () => {
    const game = quiet();
    const run = line(game, 4, 'row');
    place(game, run[0]!);
    const wolf = stand(game, run[1]!);
    define('shove', [{ kind: 'push', amount: 2 }]);
    expect(play(game, 'shove', run[1]!)).toBe(true);
    expect(entityCell(wolf)).toEqual(run[3]);
    // The picture still has to get there.
    expect(wolf.motion).toMatchObject({ from: run[1], to: run[3] });
    expect(wolf.hp).toBe(30);
    expect(game.state.cues.find((item) => item.type === 'shove')).toMatchObject({ from: run[1], to: run[3], pull: false, slam: 0 });
  });

  it('slams the target and whatever stopped it, for the knockback left', () => {
    const game = quiet();
    const run = line(game, 4, 'row');
    place(game, run[0]!);
    const wolf = stand(game, run[1]!);
    const behind = stand(game, run[3]!);
    define('heave', [{ kind: 'push', amount: 3 }]);
    play(game, 'heave', run[1]!);
    // One tile, then the wolf behind: two tiles short, 2 damage a tile.
    expect(entityCell(wolf)).toEqual(run[2]);
    expect(wolf.hp).toBe(26);
    expect(behind.hp).toBe(26);
    const slams = game.state.cues.filter((item) => item.type === 'hit' && item.via === 'slam');
    expect(slams).toHaveLength(2);
  });

  it('slams into the edge of the map', () => {
    const game = quiet();
    const run = line(game, 3, 'col', true);
    place(game, run[0]!);
    const wolf = stand(game, run[1]!);
    define('heave', [{ kind: 'push', amount: 4 }]);
    play(game, 'heave', run[1]!);
    expect(entityCell(wolf)).toEqual(run[2]);
    expect(wolf.hp).toBe(30 - 3 * 2);
  });

  it('sets off the marks where it lands, when it gets there', () => {
    const game = quiet();
    const run = line(game, 4, 'row');
    place(game, run[0]!);
    const wolf = stand(game, run[1]!);
    game.state.terrain[`${run[3]!.row},${run[3]!.col}`] = [
      { id: 'fire', effects: [{ kind: 'damage', amount: 5 }], colour: '#e43b44', rounds: 2, ownerId: player(game.state).id },
    ];
    define('shove', [{ kind: 'push', amount: 2 }]);
    play(game, 'shove', run[1]!);
    expect(wolf.hp).toBe(30);
    settle(game);
    expect(wolf.hp).toBe(25);
    expect(terrainAt(game.state, run[3]!)).toHaveLength(1);
  });

  it('moves guardians like anything else', () => {
    const game = quiet();
    const run = line(game, 4, 'row');
    place(game, run[0]!);
    const guardian = stand(game, run[1]!, GUARDIAN_IDS[0]!);
    define('shove', [{ kind: 'push', amount: 2 }]);
    play(game, 'shove', run[1]!);
    expect(entityCell(guardian)).toEqual(run[3]);
  });

  it('can be played by an enemy, on the player', () => {
    const game = quiet();
    const run = line(game, 4, 'row');
    place(game, run[1]!);
    const wolf = stand(game, run[0]!);
    INTENTS.test_shove = { id: 'test_shove', name: 'Shove', cost: 0, rarity: 'normal', targeting: 'enemy', range: 1, text: '', effects: [{ kind: 'push', amount: 2 }] };
    wolf.intent = { cardId: 'test_shove', label: 'Shove' };
    game.state.hand = [];
    endPlayerPhase(game);
    settle(game);
    expect(entityCell(player(game.state))).toEqual(run[3]);
  });
});

describe('pull', () => {
  it('drags the target in beside the puller, and the rest of the card follows it', () => {
    const game = quiet();
    const run = line(game, 5, 'row');
    place(game, run[0]!);
    const wolf = stand(game, run[4]!);
    // Grapple Hook, from content: pull 3, then 3 damage.
    expect(play(game, 'grapple_hook', run[4]!)).toBe(true);
    expect(entityCell(wolf)).toEqual(run[1]);
    expect(wolf.hp).toBe(27);
    expect(game.state.cues.find((item) => item.type === 'shove')).toMatchObject({ pull: true, slam: 0, origin: run[0] });
  });

  it('stops short without a slam', () => {
    const game = quiet();
    const run = line(game, 5, 'row');
    place(game, run[0]!);
    const wolf = stand(game, run[4]!);
    stand(game, run[2]!);
    define('yank', [{ kind: 'pull', amount: 3 }], { range: 4 });
    play(game, 'yank', run[4]!);
    expect(entityCell(wolf)).toEqual(run[3]);
    expect(wolf.hp).toBe(30);
  });
});

describe('the sample cards', () => {
  const ids = ['knockback', 'knockback_x', 'bull_rush', 'grapple_hook', 'yank'];

  it('read the way the editor would write them', () => {
    for (const id of ids) {
      const card = CARDS[id]!;
      expect(writeCardText(card.effects as never, card.range, 'player', card.targeting), id).toBe(card.text);
    }
  });

  it('Knockback X knocks back as far as the energy spent, for three times that', () => {
    const game = quiet();
    const run = line(game, 5, 'row');
    place(game, run[0]!);
    const wolf = stand(game, run[1]!);
    game.state.energy = 3;
    play(game, 'knockback_x', run[1]!);
    expect(entityCell(wolf)).toEqual(run[4]);
    expect(wolf.hp).toBe(21);
  });
});
