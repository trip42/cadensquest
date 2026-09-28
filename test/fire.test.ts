import { afterEach, describe, expect, it } from 'vitest';
import { amountValues, beginTurn, endPlayerPhase, layerEffects, playCard, terrainAt, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { type Cell, reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids } from '~/game/state';
import { GEMS } from '~/game/gems';
import { type TalismanDefinition, TALISMANS } from '~/game/talismans';
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

describe('the fire stats', () => {
  /** Hold a talisman made of these modifiers. */
  function hold(game: Game, modifiers: TalismanDefinition['modifiers']): void {
    TALISMANS.test_charm = { id: 'test_charm', name: 'Charm', text: '', icon: 'gem', modifiers };
    game.state.talismans.push('test_charm');
  }

  it('heat every fire as it hits, including fires already burning', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('fire_t', [fire(3)]);
    play(game, 'fire_t', cell);
    const enemy = dummy(game, cell);
    hold(game, [{ stat: 'fireDamage', add: 2 }, { stat: 'fireMultiplier', mul: 2 }]);
    endPlayerPhase(game);
    expect(enemy.hp).toBe(99 - (3 + 2) * 2);
  });

  it('heat an enemy\'s fire under the player too', () => {
    const game = quiet();
    const self = player(game.state);
    const whelp = dummy(game, cellAt(game, 2));
    INTENTS.scorch_t = { id: 'scorch_t', name: 'Scorch', cost: 0, rarity: 'normal', targeting: 'enemy', range: 3, text: '', effects: [fire(3)] };
    whelp.intent = { cardId: 'scorch_t', label: 'Scorch' };
    hold(game, [{ stat: 'fireDamage', add: 1 }]);
    self.block = 0;
    const hp = self.hp;
    // Lit by the whelp, under the player's feet: it hits him at once.
    endPlayerPhase(game);
    for (let i = 0; i < 3000 && self.hp === hp; i += 1) tick(game, 1 / 60);
    expect(self.hp).toBe(hp - 4);
    expect(terrainAt(game.state, entityCell(self))[0]!.ownerId).toBe(whelp.id);
  });

  it('leave marks that are not fire alone', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('mark_t', [{ kind: 'terrain', rounds: 3, colour: '#e43b44', effects: [{ kind: 'damage', amount: 3 }] }]);
    hold(game, [{ stat: 'fireDamage', add: 5 }]);
    const enemy = dummy(game, cell);
    play(game, 'mark_t', cell);
    expect(enemy.hp).toBe(96);
  });

  it('make every fire lit burn fireRounds longer', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('fire_t', [fire(3, 2)]);
    hold(game, [{ stat: 'fireRounds', add: 1 }]);
    play(game, 'fire_t', cell);
    expect(terrainAt(game.state, cell)[0]!.rounds).toBe(3);
  });

  it('keep the player out of the fire with fireWard, but not the enemies', () => {
    const game = quiet();
    const self = player(game.state);
    define('fire_self', [fire(3)], { targeting: 'self', range: 0 });
    hold(game, [{ stat: 'fireWard', add: 1 }]);
    const hp = self.hp;
    play(game, 'fire_self');
    expect(self.hp).toBe(hp);
    const enemy = dummy(game, cellAt(game, 1));
    define('fire_t', [fire(3)]);
    play(game, 'fire_t', entityCell(enemy));
    expect(enemy.hp).toBe(96);
  });

  it('show on the tile as they would land', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('fire_t', [fire(3)]);
    play(game, 'fire_t', cell);
    hold(game, [{ stat: 'fireDamage', add: 2 }]);
    const [layer] = terrainAt(game.state, cell);
    expect(layerEffects(game.state, layer!)).toEqual([{ kind: 'damage', amount: 5 }]);
  });
});

describe('Rekindle and Flare', () => {
  it('Rekindle makes every fire burn longer, whoever lit it', () => {
    const game = quiet();
    const mine = cellAt(game, 2);
    const theirs = cellAt(game, 2, 1);
    define('fire_t', [fire(3, 2)]);
    play(game, 'fire_t', mine);
    play(game, 'fire_t', theirs);
    terrainAt(game.state, theirs)[0]!.ownerId = 'someone_else';
    define('spring_t', [{ kind: 'terrain', rounds: 2, colour: '#63c74d', effects: [{ kind: 'heal', amount: 1 }] }]);
    play(game, 'spring_t', mine);
    define('rekindle_t', [{ kind: 'rekindle', amount: 3 }], { targeting: 'self', range: 0 });
    play(game, 'rekindle_t');
    expect(terrainAt(game.state, mine).map((layer) => layer.rounds)).toEqual([5, 2]);
    expect(terrainAt(game.state, theirs)[0]!.rounds).toBe(5);
  });

  it('Flare burns whoever stands in a fire again, without using up its hit for the round', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('fire_t', [fire(3)]);
    play(game, 'fire_t', cell);
    const enemy = dummy(game, cell);
    define('flare_t', [{ kind: 'flare', amount: 1 }], { targeting: 'self', range: 0 });
    play(game, 'flare_t');
    expect(enemy.hp).toBe(99 - 4);
    // Its turn begins in the fire: burned as usual.
    endPlayerPhase(game);
    expect(enemy.hp).toBe(99 - 4 - 3);
  });

  it('Flare is heated by the fire stats, and credits whoever lit the fire', () => {
    const game = quiet();
    const cell = cellAt(game, 2);
    define('fire_t', [fire(3)]);
    play(game, 'fire_t', cell);
    const enemy = dummy(game, cell);
    enemy.hp = 7;
    TALISMANS.test_charm = { id: 'test_charm', name: 'Charm', text: '', icon: 'gem', modifiers: [{ stat: 'fireMultiplier', mul: 2 }] };
    game.state.talismans.push('test_charm');
    define('flare_t', [{ kind: 'flare', amount: 1 }], { targeting: 'self', range: 0 });
    play(game, 'flare_t');
    expect(enemy.dead).toBe(true);
    const kill = game.state.events.find((event) => event.type === 'enemy_killed');
    expect(kill && 'by' in kill ? kill.by : null).toBe('caden');
  });

  it('Flare leaves the player alone under fireWard', () => {
    const game = quiet();
    const self = player(game.state);
    define('fire_self', [fire(3)], { targeting: 'self', range: 0 });
    play(game, 'fire_self');
    TALISMANS.test_charm = { id: 'test_charm', name: 'Charm', text: '', icon: 'gem', modifiers: [{ stat: 'fireWard', add: 1 }] };
    game.state.talismans.push('test_charm');
    const hp = self.hp;
    define('flare_t', [{ kind: 'flare', amount: 0 }], { targeting: 'self', range: 0 });
    play(game, 'flare_t');
    expect(self.hp).toBe(hp);
  });
});

describe('counting fires and allies', () => {
  it('fires counts burning tiles within 3, whoever lit them, and nothing else', () => {
    const game = quiet();
    const self = player(game.state);
    define('fire_t', [fire(3)]);
    define('spring_t', [{ kind: 'terrain', rounds: 2, colour: '#63c74d', effects: [{ kind: 'heal', amount: 1 }] }]);
    play(game, 'fire_t', cellAt(game, 1));
    play(game, 'fire_t', cellAt(game, 3));
    play(game, 'spring_t', cellAt(game, 2));
    // Far off: out of reach.
    game.state.terrain[`${self.row + 9},${self.col}`] = [{ ...terrainAt(game.state, cellAt(game, 1))[0]!, id: 'far' }];
    define('shield_t', [{ kind: 'block', amount: { of: 'fires', times: 2 } }], { targeting: 'self', range: 0 });
    self.block = 0;
    play(game, 'shield_t');
    expect(self.block).toBe(4);
  });

  it('allies counts the player\'s living allies, and is 0 for an enemy', () => {
    const game = quiet();
    const self = player(game.state);
    const friend = dummy(game, cellAt(game, 1));
    friend.faction = 'ally';
    const foe = dummy(game, cellAt(game, 2));
    expect(amountValues(game.state, self).allies).toBe(1);
    expect(amountValues(game.state, foe).allies).toBe(0);
  });
});

describe('a gem that marks', () => {
  it('marks the card\'s target, and does nothing on a card with no target', () => {
    const game = quiet();
    const self = player(game.state);
    GEMS.test_cinder = { id: 'test_cinder', name: 'Cinder', colour: '#e43b44', text: '', effects: [fire(2, 2)] };
    const enemy = dummy(game, cellAt(game, 1));
    define('hit_t', [{ kind: 'damage', amount: 1 }], { targeting: 'enemy', range: 1 });
    define('guard_t', [{ kind: 'block', amount: 1 }], { targeting: 'self', range: 0 });
    for (const [id, target] of [['hit_t', entityCell(enemy)], ['guard_t', null]] as const) {
      const card = makeCard(id);
      card.gems = ['test_cinder'];
      game.state.hand.push(card);
      expect(playCard(game, card.uid, target)).toBe(true);
    }
    expect(terrainAt(game.state, entityCell(enemy)).map((layer) => layer.element)).toEqual(['fire']);
    expect(terrainAt(game.state, entityCell(self))).toEqual([]);
  });
});
