import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginTurn,
  enterFloor,
  endPlayerPhase,
  isValidTarget,
  movePlayerTo,
  movementRange,
  playerMoveOptions,
  tick,
} from '~/game/actions';
import { entityCell } from '~/game/entities/types';
import { type Cell, cellDistance, reachable } from '~/game/map/navigation';
import { gateRowOf, ZONES } from '~/game/map/tiles';
import { createGame, type Game, makeEntity, player, resetUids, stat } from '~/game/state';

/** A board with only the player on it, so each test places its own enemies. */
function quiet(seed: number): Game {
  resetUids();
  const game = createGame(seed);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  return game;
}

/** A walkable cell exactly `steps` of walking from the player. */
function cellAt(game: Game, steps: number): Cell {
  const from = entityCell(player(game.state));
  const found = [...reachable(game.world, from, steps).values()].find((entry) => entry.cost === steps);
  if (!found) throw new Error(`nothing ${steps} steps away`);
  return found.cell;
}

function place(game: Game, defId: string, cell: Cell, intent = 'bug_bite') {
  const enemy = makeEntity(defId, cell.row, cell.col);
  enemy.intent = { cardId: intent, label: intent };
  game.state.entities.push(enemy);
  return enemy;
}

function runEnemyPhase(game: Game): void {
  endPlayerPhase(game);
  for (let i = 0; i < 30000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
}

describe('zone of control', () => {
  it('charges extra to step away from an adjacent enemy', () => {
    const game = quiet(4242);
    const here = entityCell(player(game.state));
    const options = playerMoveOptions(game);
    const somewhere = cellAt(game, 1);

    expect(options.stepCost!(here, somewhere)).toBe(1);
    place(game, 'bug', cellAt(game, 1));
    expect(playerMoveOptions(game).stepCost!(here, somewhere))
      .toBe(1 + stat(game.state, 'disengageCost'));
  });

  it('leaves you pinned when you cannot afford to break away', () => {
    const game = quiet(4242);
    place(game, 'bug', cellAt(game, 1));
    game.state.movement = 1;
    expect(movementRange(game).size).toBe(0);
  });

  it('bills the toll when you walk away', () => {
    const game = quiet(4242);
    const foe = place(game, 'bug', cellAt(game, 1));
    const away = [...movementRange(game).values()]
      .map((entry) => entry.cell)
      .find((cell) => cellDistance(cell, entityCell(foe)) > 1 && cellDistance(cell, entityCell(player(game.state))) === 1);
    expect(away).toBeDefined();

    game.state.movement = 5;
    expect(movePlayerTo(game, away!)).toBe(true);
    expect(game.state.movement).toBe(5 - 1 - stat(game.state, 'disengageCost'));
    expect(game.state.log.at(-1)).toContain('Breaking away cost');
  });

  it('costs nothing extra away from enemies', () => {
    const game = quiet(4242);
    game.state.movement = 5;
    const target = cellAt(game, 2);
    expect(movePlayerTo(game, target)).toBe(true);
    expect(game.state.movement).toBe(3);
  });
});

describe('enemies play their own cards', () => {
  it('closes the distance and strikes in the same turn', () => {
    const game = quiet(4242);
    const self = player(game.state);
    place(game, 'bug', cellAt(game, 3), 'bug_bite');   // advance 3, reach 1
    const before = self.hp;

    runEnemyPhase(game);
    expect(self.hp).toBeLessThan(before);
  });

  it('stops at its own reach rather than walking into melee', () => {
    const game = quiet(4242);
    const spider = place(game, 'spider', cellAt(game, 4), 'spider_spit');   // advance 3, reach 2
    runEnemyPhase(game);
    expect(cellDistance(entityCell(spider), entityCell(player(game.state)))).toBe(2);
  });

  it('walks as far as its card says', () => {
    const far = 8;
    const striking = quiet(4242);
    const s = place(striking, 'bug', cellAt(striking, far), 'bug_bite');   // advance 3
    runEnemyPhase(striking);

    const charging = quiet(4242);
    const c = place(charging, 'bug', cellAt(charging, far), 'bug_skitter');   // advance 6
    runEnemyPhase(charging);

    const gap = (game: Game, enemy: { row: number; col: number }) =>
      cellDistance(enemy, entityCell(player(game.state)));
    expect(gap(charging, c)).toBeLessThan(gap(striking, s));
  });

  it('misses when the card leaves it short', () => {
    const game = quiet(4242);
    const self = player(game.state);
    place(game, 'slime', cellAt(game, 5), 'slime_ooze');   // advance 1, reach 1
    const before = self.hp;
    runEnemyPhase(game);
    expect(self.hp).toBe(before);
  });

  it('raises block and power on itself, and block falls next time it acts', () => {
    const game = quiet(4242);
    const guard = place(game, 'warden', cellAt(game, 6), 'warden_stand');
    runEnemyPhase(game);
    expect(guard.block).toBe(8);

    guard.intent = { cardId: 'warden_roar', label: 'Roar' };
    game.state.phase = 'player';
    runEnemyPhase(game);
    expect(guard.block).toBe(0);
    expect(guard.power).toBe(2);
  });

  it('hits harder once empowered', () => {
    const plain = quiet(4242);
    place(plain, 'bug', cellAt(plain, 1), 'bug_bite');
    runEnemyPhase(plain);

    const angry = quiet(4242);
    place(angry, 'bug', cellAt(angry, 1), 'bug_bite').power = 4;
    runEnemyPhase(angry);

    const lost = (game: Game) => player(game.state).maxHp - player(game.state).hp;
    expect(lost(angry) - lost(plain)).toBe(4);
  });

  it('draws its whole deck before reshuffling', () => {
    const game = quiet(4242);
    const wolf = place(game, 'wolf', cellAt(game, 12));
    wolf.intent = null;
    const drawn: string[] = [];
    for (let turn = 0; turn < 4; turn += 1) {
      beginTurn(game);
      drawn.push(wolf.intent!.cardId);
    }
    expect(drawn.sort()).toEqual(['wolf_circle', 'wolf_circle', 'wolf_lunge', 'wolf_lunge']);
  });
});

describe('guardians', () => {
  const guarded = ZONES.map((zone, index) => ({ zone, index })).filter(({ zone }) => zone.guardian);

  /** Stand the player a little before a zone's last row and populate it. */
  function nearGate(zoneIndex: number): Game {
    resetUids();
    const game = createGame(90210);
    enterFloor(game, zoneIndex);
    const self = player(game.state);
    const row = gateRowOf(zoneIndex) - 6;
    const col = Array.from({ length: game.world.width }, (_, c) => c).find((c) => game.world.walkable(row, c))!;
    self.row = row;
    self.col = col;
    beginTurn(game);
    return game;
  }

  it('holds the last row of every zone that has one', () => {
    for (const { zone, index } of guarded) {
      const game = nearGate(index);
      const gate = game.state.gates.find((g) => g.row === gateRowOf(index));
      expect(gate, zone.id).toBeDefined();
      const guardian = game.state.entities.find((e) => e.id === gate!.guardianId)!;
      expect(guardian.defId).toBe(zone.guardian);
      expect(guardian.row).toBe(gateRowOf(index));
    }
  });

  it('keeps its post instead of chasing', () => {
    const game = nearGate(0);
    const gate = game.state.gates[0]!;
    const guardian = game.state.entities.find((e) => e.id === gate.guardianId)!;
    const post = entityCell(guardian);
    runEnemyPhase(game);
    expect(entityCell(guardian)).toEqual(post);
  });

  it('always carries a talisman', () => {
    for (const { index } of guarded) {
      const game = nearGate(index);
      const gate = game.state.gates.find((g) => g.row === gateRowOf(index))!;
      const guardian = game.state.entities.find((e) => e.id === gate.guardianId)!;
      expect(guardian.reward?.kind).toBe('talisman');
    }
  });
});

describe('the log', () => {
  it('keeps quiet about enemies far away, and still reports ones nearby', () => {
    const game = quiet(4242);
    const self = player(game.state);
    const far = [...reachable(game.world, entityCell(self), 20).values()]
      .find((entry) => cellDistance(entry.cell, entityCell(self)) > 10)!.cell;
    place(game, 'slime', far, 'slime_harden');          // braces, far off
    place(game, 'warden', cellAt(game, 5), 'warden_maul');   // reach 2, and a guardian never walks
    const before = game.state.log.length;
    runEnemyPhase(game);
    const lines = game.state.log.slice(before).join(' | ');
    expect(lines).not.toContain('Slime');
    expect(lines).toContain('Warden cannot reach');
  });
});
