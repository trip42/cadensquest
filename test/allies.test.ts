import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, isValidTarget, nearestFoe, playCard, playerMoveOptions, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, cellDistance, reachable } from '~/game/map/navigation';
import { allies, createGame, type Game, makeCard, makeEntity, player, resetUids, stat } from '~/game/state';
import { writeCardText } from '~/utils/contentText';
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

/** Walkable cells at exactly `steps` from the player, nearest first. */
function cellsAt(game: Game, steps: number, from = entityCell(player(game.state))): Cell[] {
  return [...reachable(game.world, from, steps).values()].filter((entry) => entry.cost === steps).map((entry) => entry.cell);
}

function place(game: Game, defId: string, cell: Cell, intent: string | null = null) {
  const creature = makeEntity(defId, cell.row, cell.col);
  creature.intent = intent ? { cardId: intent, label: intent } : null;
  game.state.entities.push(creature);
  return creature;
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'enemy', range: 3, text: '', effects, ...extra };
  return id;
}

function play(game: Game, cardId: string, target: Cell | null): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, target);
}

function runEnemyPhase(game: Game): void {
  endPlayerPhase(game);
  for (let i = 0; i < 30000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
}

const TAME: Effect = { kind: 'tame', amount: 8 };

describe('Tame', () => {
  it('turns a weak enough enemy, which gives up its reward and acts for you', () => {
    const game = quiet();
    const bug = place(game, 'bug', cellsAt(game, 2)[0]!);
    bug.hp = 6;
    bug.reward = { kind: 'gem', gemId: 'ruby' };
    define('tame_a', [TAME]);
    expect(play(game, 'tame_a', entityCell(bug))).toBe(true);
    expect(bug.faction).toBe('ally');
    expect(bug.reward).toBeNull();
    expect(bug.intent?.cardId).toMatch(/^bug_/);
    expect(game.state.events.filter((event) => event.type === 'enemy_tamed')).toEqual([
      expect.objectContaining({ enemy: 'bug', health: 6 }),
    ]);
  });

  it('only lights up enemies it can turn', () => {
    const game = quiet();
    const [near, far] = cellsAt(game, 2);
    const weak = place(game, 'bug', near!);
    weak.hp = 5;
    const strong = place(game, 'wolf', far!);
    define('tame_b', [TAME]);
    const card = makeCard('tame_b');
    game.state.hand.push(card);
    expect(isValidTarget(game, card.uid, entityCell(weak))).toBe(true);
    expect(isValidTarget(game, card.uid, entityCell(strong))).toBe(false);   // 16 health
  });

  it('never turns a guardian, and stops at the ally limit', () => {
    const game = quiet();
    const [a, b, c] = cellsAt(game, 2);
    const warden = place(game, 'warden', a!);
    warden.hp = 1;
    const first = place(game, 'bug', b!);
    const second = place(game, 'bug', c!);
    first.hp = second.hp = 1;
    define('tame_c', [TAME]);
    play(game, 'tame_c', entityCell(warden));
    expect(warden.faction).toBe('enemy');
    play(game, 'tame_c', entityCell(first));
    play(game, 'tame_c', entityCell(second));
    expect(allies(game.state)).toHaveLength(stat(game.state, 'maxAllies'));
    expect(second.faction).toBe('enemy');
  });

  it('then Mend heals the one it just tamed', () => {
    const game = quiet();
    const bug = place(game, 'bug', cellsAt(game, 2)[0]!);
    bug.hp = 3;
    define('tame_d', [TAME, { kind: 'mend', amount: 4 }]);
    play(game, 'tame_d', entityCell(bug));
    expect(bug.faction).toBe('ally');
    expect(bug.hp).toBe(7);
  });

  it('Mend heals an ally, but never an enemy', () => {
    const game = quiet();
    const [a, b] = cellsAt(game, 2);
    const friend = place(game, 'bug', a!);
    friend.faction = 'ally';
    friend.hp = 2;
    const foe = place(game, 'bug', b!);
    foe.hp = 2;
    define('patch', [{ kind: 'mend', amount: 5 }], { targeting: 'ally' });
    play(game, 'patch', entityCell(friend));
    expect(friend.hp).toBe(7);
    const card = makeCard('patch');
    game.state.hand.push(card);
    expect(isValidTarget(game, card.uid, entityCell(foe))).toBe(false);
  });
});

describe('allies in the fight', () => {
  it('attack the nearest enemy, before the enemies act', () => {
    const game = quiet();
    const here = entityCell(player(game.state));
    const allyCell = cellsAt(game, 3)[0]!;
    const friend = place(game, 'wolf', allyCell, 'wolf_lunge');
    friend.faction = 'ally';
    const foe = place(game, 'bug', cellsAt(game, 2, allyCell).find((cell) => cellDistance(cell, here) > 2)!, null);
    foe.hp = foe.maxHp = 30;
    const self = player(game.state);
    const hp = self.hp;
    endPlayerPhase(game);
    expect(game.state.queue[0]?.entityId).toBe(friend.id);
    for (let i = 0; i < 30000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(foe.hp).toBe(30 - 6);
    expect(self.hp).toBe(hp);
  });

  it('draw the enemies’ attacks when they are nearer', () => {
    const game = quiet();
    const here = entityCell(player(game.state));
    const allyCell = cellsAt(game, 4)[0]!;
    const friend = place(game, 'wolf', allyCell);
    friend.faction = 'ally';
    const foeCell = cellsAt(game, 1, allyCell).find((cell) => cellDistance(cell, here) > 3)!;
    const foe = place(game, 'bug', foeCell, 'bug_bite');
    expect(nearestFoe(game.state, foe)).toBe(friend);
    const self = player(game.state);
    const hp = self.hp;
    const friendHp = friend.hp;
    runEnemyPhase(game);
    expect(self.hp).toBe(hp);
    expect(friend.hp).toBeLessThan(friendHp);
  });

  it('come back to the player when there is nobody to fight', () => {
    const game = quiet();
    const here = entityCell(player(game.state));
    const friend = place(game, 'wolf', cellsAt(game, 6)[0]!, 'wolf_lunge');
    friend.faction = 'ally';
    runEnemyPhase(game);
    expect(cellDistance(entityCell(friend), here)).toBeLessThan(6);
  });

  it('do not hem the player in, the way enemies do', () => {
    const game = quiet();
    const here = entityCell(player(game.state));
    const next = cellsAt(game, 1);
    const friend = place(game, 'bug', next[0]!);
    friend.faction = 'ally';
    const away = next[1]!;
    expect(playerMoveOptions(game).stepCost!(here, away)).toBe(1);
  });

  it('credit a kill to whoever made it, and are mourned when they fall', () => {
    const game = quiet();
    const allyCell = cellsAt(game, 3)[0]!;
    const friend = place(game, 'wolf', allyCell, 'wolf_lunge');
    friend.faction = 'ally';
    const foe = place(game, 'bug', cellsAt(game, 1, allyCell)[0]!);
    foe.hp = 1;
    foe.reward = { kind: 'gem', gemId: 'ruby' };
    runEnemyPhase(game);
    expect(game.state.events.find((event) => event.type === 'enemy_killed')).toMatchObject({ enemy: 'bug', by: 'wolf' });
    expect(game.state.pendingRewards).toHaveLength(1);   // a kill by an ally still pays

    INTENTS.maul_it = { id: 'maul_it', name: 'Maul', cost: 0, rarity: 'normal', targeting: 'enemy', range: 1, text: '', effects: [{ kind: 'damage', amount: 99 }] };
    const brute = place(game, 'wolf', cellsAt(game, 1, entityCell(friend)).find((cell) => !game.state.entities.some((e) => e.row === cell.row && e.col === cell.col))!, 'maul_it');
    brute.hp = brute.maxHp = 99;
    game.state.phase = 'player';
    runEnemyPhase(game);
    expect(friend.dead).toBe(true);
    expect(game.state.events.some((event) => event.type === 'ally_fell' && event.ally === 'wolf')).toBe(true);
  });
});

describe('writing it', () => {
  it('reads as taming and then healing the one tamed', () => {
    expect(writeCardText([TAME, { kind: 'mend', amount: 5 }], 2, 'player', 'enemy'))
      .toBe('Tame an enemy within 2 with 8 health or less and heal it 5.');
    expect(writeCardText([{ kind: 'mend', amount: 6 }], 3, 'player', 'ally')).toBe('Heal an ally within 3 for 6.');
  });
});

describe('trying Tame', () => {
  it('puts something tameable within the card’s reach', async () => {
    const { applyTrial } = await import('~/game/sandbox');
    const game = quiet();
    define('tame_try', [TAME], { range: 2 });
    expect(applyTrial(game, { kind: 'card', id: 'tame_try' })).toBe(true);
    const card = game.state.hand.at(-1)!;
    const prey = game.state.entities.find((entity) => entity.faction === 'enemy')!;
    expect(isValidTarget(game, card.uid, entityCell(prey))).toBe(true);
  });
});

describe('enemy card text', () => {
  it('reads right on an ally too, so it never says "you"', async () => {
    const { validateContent } = await import('~/game/content');
    const content = structuredClone(readContentFiles()) as never as { 'enemy-cards': Array<{ id: string; text: string }> };
    expect(content['enemy-cards'].filter((card) => /\byour?\b/i.test(card.text))).toEqual([]);
    content['enemy-cards'][0]!.text = 'Runs toward you.';
    expect(validateContent(content as never).issues).toContainEqual(
      expect.objectContaining({ level: 'warning', file: 'enemy-cards', field: 'text' }),
    );
  });
});
