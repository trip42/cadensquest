import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, enterFloor, isBusy, movePlayerTo, movementRange, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { loadContent } from '~/game/content';
import { entityCell } from '~/game/entities/types';
import { type Cell, cellDistance } from '~/game/map/navigation';
import { CHUNK_ROWS } from '~/game/map/generate';
import { FLOORS, floorRows, gateRowOf, START_ROW, ZONE_ROWS, ZONES } from '~/game/map/tiles';
import { allies, createGame, enemies, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
import { readContentFiles } from './setup';

afterEach(() => loadContent(readContentFiles()));

/** A game on `floor`, with the player a couple of rows short of its end and
 *  the floor populated — its guardian (or open portal) in place. Other
 *  enemies are cleared so nothing gets in the way. */
function nearTheEnd(floor: number): Game {
  resetUids();
  const game = createGame(90210);
  enterFloor(game, floor);
  const self = player(game.state);
  const row = gateRowOf(floor) - 2;
  self.row = row;
  self.col = Array.from({ length: game.world.width }, (_, c) => c).find((c) => game.world.walkable(row, c))!;
  beginTurn(game);
  const gate = game.state.gates[0];
  game.state.entities = game.state.entities.filter(
    (entity) => entity.faction !== 'enemy' || entity.id === gate?.guardianId,
  );
  return game;
}

function guardianOf(game: Game) {
  const gate = game.state.gates[0]!;
  return game.state.entities.find((entity) => entity.id === gate.guardianId)!;
}

/** Strike the floor's guardian down with a card that cannot miss. */
function fell(game: Game): Cell {
  CARDS.smite = {
    id: 'smite', name: 'Smite', rarity: 'rare', cost: 0, targeting: 'enemy', range: 20, text: '',
    effects: [{ kind: 'damage', amount: 999 }],
  };
  const guardian = guardianOf(game);
  const card = makeCard('smite');
  game.state.hand.push(card);
  expect(playCard(game, card.uid, entityCell(guardian))).toBe(true);
  expect(guardian.dead).toBe(true);
  // Its talisman would come up first and hold the board; not what we test.
  game.state.pendingRewards = [];
  return entityCell(guardian);
}

function portalAt(game: Game): Cell | null {
  for (const [key, layers] of Object.entries(game.state.terrain)) {
    if (layers.some((layer) => layer.portal)) {
      const [row, col] = key.split(',').map(Number);
      return { row: row!, col: col! };
    }
  }
  return null;
}

/** Walk the player onto a cell and let the step — and a descent — finish.
 *  Waits first for anything still animating (a guardian falling), as the
 *  game makes a player wait. */
function walkOnto(game: Game, cell: Cell): void {
  for (let i = 0; i < 600 && isBusy(game.state); i += 1) tick(game, 1 / 60);
  game.state.movement = 30;
  expect(movePlayerTo(game, cell)).toBe(true);
  const floor = game.state.floor;
  for (let i = 0; i < 2000 && game.state.floor === floor && game.state.phase !== 'victory'; i += 1) tick(game, 1 / 60);
}

describe('a floor', () => {
  it('holds whole chunks, so none is split between two floors', () => {
    // A chunk straddling floors would be populated for the first and then
    // never again: part of the next floor would arrive empty.
    expect(ZONE_ROWS % CHUNK_ROWS).toBe(0);
  });

  it('is all the map there is: it ends at its first and last rows', () => {
    const game = nearTheEnd(1);
    const { first, last } = floorRows(1);
    expect(game.world.contains(first)).toBe(true);
    expect(game.world.contains(last)).toBe(true);
    expect(game.world.contains(first - 1)).toBe(false);
    expect(game.world.contains(last + 1)).toBe(false);
    game.state.movement = 40;
    const rows = [...movementRange(game).values()].map((entry) => entry.cell.row);
    expect(Math.max(...rows)).toBeLessThanOrEqual(last);
  });

  it('is guarded at its end, and the guardian’s fall opens a white way down on its tile', () => {
    const game = nearTheEnd(0);
    expect(guardianOf(game).row).toBe(floorRows(0).last);
    expect(portalAt(game)).toBeNull();
    const where = fell(game);
    const [portal] = terrainAt(game.state, where);
    expect(portal).toMatchObject({ portal: 'down', colour: '#ffffff' });
  });

  it('with no guardian, has its way off open from the start', () => {
    // Whatever the content names — a final boss is one edit away — a floor
    // without a guardian has its way out waiting. afterEach restores it.
    delete ZONES[FLOORS - 1]!.guardian;
    const game = nearTheEnd(FLOORS - 1);
    const portal = portalAt(game);
    expect(portal?.row).toBe(floorRows(FLOORS - 1).last);
    expect(terrainAt(game.state, portal!)[0]?.portal).toBe('out');
  });

  it('keeps its portal round after round', () => {
    const game = nearTheEnd(0);
    const where = fell(game);
    beginTurn(game);
    beginTurn(game);
    expect(terrainAt(game.state, where)[0]?.portal).toBe('down');
  });
});

describe('going down', () => {
  it('starts the next floor afresh: its first rows, a new turn, the old floor gone', () => {
    const game = nearTheEnd(0);
    const where = fell(game);
    const self = player(game.state);
    const hp = self.hp;
    const turn = game.state.turn;

    walkOnto(game, where);

    expect(game.state.floor).toBe(1);
    expect(self.row).toBe(floorRows(1).first + START_ROW);
    expect(self.hp).toBe(hp);
    expect(game.state.turn).toBe(turn + 1);
    expect(game.state.phase).toBe('player');
    expect(game.world.contains(where.row)).toBe(false);
    expect(portalAt(game)).toBeNull();
    expect(enemies(game.state).every((enemy) => enemy.row >= floorRows(1).first && enemy.row <= floorRows(1).last)).toBe(true);
    expect(enemies(game.state).length).toBeGreaterThan(0);
    expect(game.state.events.some((event) => event.type === 'zone_entered' && event.zone === ZONES[1]!.id)).toBe(true);
  });

  it('brings allies along, standing beside the player', () => {
    const game = nearTheEnd(0);
    const where = fell(game);
    const self = player(game.state);
    const spot = [{ row: self.row, col: self.col - 1 }, { row: self.row, col: self.col + 1 }, { row: self.row - 1, col: self.col }]
      .find((cell) => game.world.walkable(cell.row, cell.col) && cellDistance(cell, where) > 0)!;
    const pet = makeEntity('wolf', spot.row, spot.col);
    pet.faction = 'ally';
    game.state.entities.push(pet);

    walkOnto(game, where);

    expect(game.state.floor).toBe(1);
    expect(allies(game.state)).toEqual([pet]);
    expect(cellDistance(entityCell(pet), entityCell(self))).toBeLessThanOrEqual(4);
  });

  it('takes only the player: nobody else steps through', () => {
    const game = nearTheEnd(0);
    const where = fell(game);
    const self = player(game.state);
    const next = [{ row: where.row - 1, col: where.col }, { row: where.row, col: where.col - 1 }, { row: where.row, col: where.col + 1 }]
      .find((cell) => game.world.walkable(cell.row, cell.col) && (cell.row !== self.row || cell.col !== self.col))!;
    const wolf = makeEntity('wolf', next.row, next.col);
    game.state.entities.push(wolf);
    wolf.motion = { from: next, to: where, t: 0, speed: 4 };
    for (let i = 0; i < 60; i += 1) tick(game, 1 / 60);
    expect(entityCell(wolf)).toEqual(where);
    expect(game.state.floor).toBe(0);
    expect(game.state.descending).toBe(false);
  });

  it('out of the last floor wins the run', () => {
    const game = nearTheEnd(FLOORS - 1);
    // Through a final guardian if the content names one; open if not.
    const way = game.state.gates.length ? fell(game) : portalAt(game)!;
    expect(terrainAt(game.state, way).find((layer) => layer.portal)?.portal).toBe('out');
    walkOnto(game, way);
    expect(game.state.phase).toBe('victory');
    expect(game.state.events.filter((event) => event.type === 'run_won')).toHaveLength(1);
    expect(game.state.events.find((event) => event.type === 'run_ended')).toMatchObject({ outcome: 'won' });
  });
});
