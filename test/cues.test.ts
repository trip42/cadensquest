import { afterEach, describe, expect, it } from 'vitest';
import {
  beginTurn, discardAllForMovement, discardForMovement, enterFloor, movePlayerTo, playCard, skipReward, tick,
} from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import { type Cue, cue, type CueFeed, type CueType, cuesSince, MAX_CUES } from '~/game/cues';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, cellDistance, reachable } from '~/game/map/navigation';
import { FLOORS, gateRowOf } from '~/game/map/tiles';
import { createGame, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
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
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'enemy', range: 1, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

/** A cell `steps` away from the player. */
function away(game: Game, steps: number): Cell {
  const from = entityCell(player(game.state));
  return [...reachable(game.world, from, steps).values()].find((entry) => entry.cost === steps)!.cell;
}

function foe(game: Game, cell: Cell, hp = 20) {
  const creature = makeEntity('wolf', cell.row, cell.col);
  creature.maxHp = creature.hp = hp;
  game.state.entities.push(creature);
  return creature;
}

/** Cues pushed while `run` runs. */
function during(game: Game, run: () => void): Cue[] {
  const before = game.state.cueSeq;
  run();
  return cuesSince(game.state, before).map(({ seq: _seq, ...rest }) => rest as Cue);
}

const types = (cues: Cue[]): CueType[] => cues.map((item) => item.type);

describe('cues', () => {
  it('are numbered, and only the recent ones are kept', () => {
    const feed: CueFeed = { cues: [], cueSeq: 0 };
    for (let i = 0; i < MAX_CUES + 10; i += 1) cue(feed, { type: 'discard', count: i });
    expect(feed.cues).toHaveLength(MAX_CUES);
    expect(feed.cueSeq).toBe(MAX_CUES + 10);
    expect(feed.cues.at(-1)!.seq).toBe(MAX_CUES + 10);
    expect(cuesSince(feed, MAX_CUES + 8).map((item) => item.seq)).toEqual([MAX_CUES + 9, MAX_CUES + 10]);
  });

  it('follow a blow: the card, the hit — with what block took — and the fall', () => {
    const game = quiet();
    const wolf = foe(game, away(game, 1), 5);
    wolf.block = 3;
    define('whack', [{ kind: 'damage', amount: 10 }]);
    const cues = during(game, () => play(game, 'whack', entityCell(wolf)));
    expect(types(cues)).toEqual(['play', 'hit', 'fall']);
    expect(cues[0]).toMatchObject({ card: 'whack', attack: true, ranged: false });
    expect(cues[1]).toMatchObject({
      target: wolf.id, side: 'enemy', amount: 7, blocked: 3, fatal: true, via: 'blow',
      by: player(game.state).id, from: entityCell(player(game.state)),
    });
    expect(cues[1]).not.toHaveProperty('ranged');
    expect(cues[2]).toMatchObject({ target: wolf.id, guardian: false, faded: false });
  });

  it('mark a blow from a card that reaches further as ranged', () => {
    const game = quiet();
    const wolf = foe(game, away(game, 3));
    define('bolt', [{ kind: 'damage', amount: 2 }], { range: 4 });
    const cues = during(game, () => play(game, 'bolt', entityCell(wolf)));
    expect(cues.find((item) => item.type === 'hit')).toMatchObject({ ranged: true, fatal: false });
  });

  it('report gains as they land, and nothing for a heal at full health', () => {
    const game = quiet();
    const self = player(game.state);
    define('brace', [{ kind: 'block', amount: 5 }, { kind: 'heal', amount: 4 }, { kind: 'power', amount: 1 }], { targeting: 'self' });
    let cues = during(game, () => play(game, 'brace', null));
    expect(types(cues)).toEqual(['play', 'gain', 'gain']);
    expect(cues[1]).toMatchObject({ target: self.id, stat: 'block', amount: 5 });
    expect(cues[2]).toMatchObject({ stat: 'power', amount: 1 });

    self.hp = self.maxHp - 2;
    cues = during(game, () => play(game, 'brace', null));
    expect(cues.find((item) => item.type === 'gain' && item.stat === 'heal')).toMatchObject({ amount: 2 });
  });

  it('greet a tamed creature, and a summoned one', () => {
    const game = quiet();
    const wolf = foe(game, away(game, 1), 4);
    define('tame', [{ kind: 'tame', amount: 8 }], { range: 2 });
    expect(during(game, () => play(game, 'tame', entityCell(wolf)))).toContainEqual({ type: 'tame', target: wolf.id, cell: entityCell(wolf) });

    game.state.entities = [player(game.state)];
    const spot = away(game, 2);
    define('call', [{ kind: 'summon', entity: 'wolf', amount: 6 }], { targeting: 'cell', range: 3 });
    const summoned = during(game, () => play(game, 'call', spot)).find((item) => item.type === 'summon');
    expect(summoned).toMatchObject({ side: 'ally', cell: spot });
  });

  it('tell a marked tile’s damage and a burst’s apart, with the burst before its hits', () => {
    const game = quiet();
    const spot = away(game, 2);
    const wolf = foe(game, spot);
    define('fire', [{ kind: 'terrain', rounds: 2, colour: '#e43b44', effects: [{ kind: 'damage', amount: 3 }] }], { targeting: 'cell', range: 3 });
    const marked = during(game, () => play(game, 'fire', spot));
    expect(types(marked)).toEqual(['play', 'mark', 'hit']);
    expect(marked[1]).toMatchObject({ cells: [spot], colour: '#e43b44' });
    expect(marked[2]).toMatchObject({ target: wolf.id, via: 'tile', amount: 3 });

    define('blast', [{ kind: 'area', radius: 1, colour: '#feae34', effects: [{ kind: 'damage', amount: 4 }] }], { targeting: 'cell', range: 3 });
    const burst = during(game, () => play(game, 'blast', spot));
    expect(types(burst)).toEqual(['play', 'burst', 'hit']);
    expect(burst[1]).toMatchObject({ center: spot, colour: '#feae34' });
    expect(burst[2]).toMatchObject({ target: wolf.id, via: 'burst' });
  });

  it('mark each step of a walk, and each discard', () => {
    const game = quiet();
    game.state.movement = 5;
    const target = away(game, 2);
    const steps = during(game, () => {
      expect(movePlayerTo(game, target)).toBe(true);
      for (let i = 0; i < 120; i += 1) tick(game, 1 / 30);
    }).filter((item) => item.type === 'step');
    expect(steps).toHaveLength(2);
    expect(steps.at(-1)).toMatchObject({ target: player(game.state).id, side: 'player', cell: target });

    const one = game.state.hand[0]!;
    expect(during(game, () => discardForMovement(game, one.uid))).toEqual([{ type: 'discard', count: 1 }]);
    const left = game.state.hand.length;
    expect(during(game, () => discardAllForMovement(game))).toEqual([{ type: 'discard', count: left }]);
  });

  it('open each turn, and each floor', () => {
    const game = quiet();
    expect(during(game, () => beginTurn(game))).toContainEqual({ type: 'turn', turn: game.state.turn });

    // Down through the way off the first floor.
    const self = player(game.state);
    const row = gateRowOf(0);
    const col = [...Array(game.world.width).keys()].find((c) => game.world.walkable(row, c))!;
    game.state.terrain[`${row},${col}`] = [{ id: 'p', effects: [], colour: '#ffffff', rounds: 0, ownerId: self.id, portal: 'down' }];
    self.row = row - 1;
    self.col = col;
    game.state.descending = true;
    const cues = during(game, () => tick(game, 1 / 60));
    expect(cues).toContainEqual({ type: 'descend', floor: 1 });
    expect(types(cues).indexOf('descend')).toBeLessThan(types(cues).indexOf('turn'));
  });

  it('bring up a reward and what was done with it', () => {
    const game = quiet();
    game.state.pendingRewards.push({ kind: 'talisman', talismanId: 'heartstone' });
    expect(during(game, () => tick(game, 1 / 60))).toContainEqual({ type: 'reward', kind: 'talisman' });
    expect(during(game, () => skipReward(game))).toEqual([{ type: 'claim', kind: 'skip' }]);
  });

  it('close the run, either way', () => {
    const game = quiet();
    player(game.state).hp = 0;
    expect(during(game, () => tick(game, 1 / 60))).toContainEqual({ type: 'end', outcome: 'died' });

    const won = quiet();
    enterFloor(won, FLOORS - 1);
    won.state.descending = true;
    expect(during(won, () => tick(won, 1 / 60))).toContainEqual({ type: 'end', outcome: 'won' });
  });

  it('carry what a listener needs even once the creature is gone', () => {
    const game = quiet();
    const wolf = foe(game, away(game, 1), 1);
    define('whack', [{ kind: 'damage', amount: 5 }]);
    const cues = during(game, () => play(game, 'whack', entityCell(wolf)));
    for (let i = 0; i < 120; i += 1) tick(game, 1 / 30);
    expect(game.state.entities.some((entity) => entity.id === wolf.id)).toBe(false);
    const fall = cues.find((item) => item.type === 'fall');
    expect(fall).toMatchObject({ cell: entityCell(wolf) });
    expect(cellDistance(entityCell(wolf), entityCell(player(game.state)))).toBe(1);
  });
});
