import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginTurn,
  discardForMovement,
  endPlayerPhase,
  isBusy,
  movePlayerTo,
  movementRange,
  playCard,
  tick,
} from '~/game/actions';
import { cardDef, MOVEMENT_BY_RARITY } from '~/game/cards/definitions';
import { entityDef } from '~/game/entities/definitions';
import { entityCell } from '~/game/entities/types';
import { createGame, enemies, type Game, player, resetUids, stat } from '~/game/state';

const settle = (game: Game, limit = 4000): void => {
  for (let i = 0; i < limit && isBusy(game.state); i += 1) tick(game, 1 / 60);
};

/** Run one whole turn: end the player phase and let the enemies play out. */
const runEnemyPhase = (game: Game, limit = 20000): void => {
  endPlayerPhase(game);
  for (let i = 0; i < limit && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
};

describe('the turn loop', () => {
  beforeEach(() => resetUids());

  it('refreshes into the player phase with a hand, energy and movement', () => {
    const game = createGame(4242);
    beginTurn(game);
    const { state } = game;

    expect(state.phase).toBe('player');
    expect(state.turn).toBe(1);
    expect(state.hand).toHaveLength(stat(state, 'handSize'));
    expect(state.energy).toBe(stat(state, 'maxEnergy'));
    // No allowance any more: every step has to be bought with a card.
    expect(state.movement).toBe(0);
  });

  it('gives no movement at the start of any turn', () => {
    const game = createGame(808);
    beginTurn(game);
    for (let turn = 0; turn < 3; turn += 1) {
      expect(game.state.movement).toBe(0);
      runEnemyPhase(game);
    }
  });

  it('buys movement by discarding, priced by rarity', () => {
    const game = createGame(7);
    beginTurn(game);
    const { state } = game;

    // Read the prices from the table rather than pinning them, so retuning
    // the balance does not break the rule this test is about.
    const priced = ['strike', 'bolt', 'vault'] as const;
    for (const defId of priced) {
      const expected = MOVEMENT_BY_RARITY[cardDef(defId).rarity];
      state.hand = [{ uid: `d_${defId}`, defId }];
      state.movement = 0;
      state.energy = 3;
      const before = state.discardPile.length;

      expect(discardForMovement(game, `d_${defId}`)).toBe(true);
      expect(state.movement).toBe(expected);
      // It costs a card, not energy.
      expect(state.energy).toBe(3);
      expect(state.hand).toHaveLength(0);
      expect(state.discardPile).toHaveLength(before + 1);
    }
  });

  it('will not discard outside the player phase', () => {
    const game = createGame(7);
    beginTurn(game);
    const uid = game.state.hand[0]!.uid;
    endPlayerPhase(game);
    expect(discardForMovement(game, uid)).toBe(false);
  });

  it('spends energy on a card and puts it in the discard pile', () => {
    const game = createGame(7);
    beginTurn(game);
    const { state } = game;

    const card = state.hand.find((item) => cardDef(item.defId).targeting === 'self');
    expect(card).toBeDefined();
    const before = state.energy;

    expect(playCard(game, card!.uid)).toBe(true);
    expect(state.energy).toBe(before - cardDef(card!.defId).cost);
    expect(state.hand.find((item) => item.uid === card!.uid)).toBeUndefined();
    expect(state.discardPile.map((item) => item.uid)).toContain(card!.uid);
  });

  it('refuses a card there is no energy for', () => {
    const game = createGame(7);
    beginTurn(game);
    game.state.energy = 0;
    const card = game.state.hand[0]!;
    expect(playCard(game, card.uid)).toBe(false);
  });

  it('walks the player along a path and spends movement', () => {
    const game = createGame(31337);
    beginTurn(game);
    const { state } = game;

    // Nowhere to go until a card is given up for it.
    expect(movementRange(game).size).toBe(0);
    while (state.movement < 3 && state.hand.length) {
      discardForMovement(game, state.hand[0]!.uid);
    }
    expect(state.movement).toBeGreaterThanOrEqual(2);

    const range = [...movementRange(game).values()].filter((entry) => entry.cost === 2);
    expect(range.length).toBeGreaterThan(0);

    const target = range[0]!.cell;
    const spent = state.movement;
    expect(movePlayerTo(game, target)).toBe(true);
    settle(game);

    expect(entityCell(player(state))).toEqual(target);
    expect(state.movement).toBe(spent - 2);
    // The log has to agree with what actually happened: `startStep` mutates
    // the same array the caller counted, which once made this read "1 cell".
    expect(state.log.at(-1)).toBe('Moved 2 cells.');
  });

  it('will not walk further than the movement left', () => {
    const game = createGame(31337);
    beginTurn(game);
    game.state.movement = 1;
    const far = [...movementRange(game).values()];
    expect(far.every((entry) => entry.cost <= 1)).toBe(true);
  });

  it('ends the phase by itself once there is nothing left to spend', () => {
    const game = createGame(4242);
    beginTurn(game);
    const { state } = game;

    state.hand = [];
    state.movement = 0;
    tick(game, 1 / 60);

    expect(state.phase).toBe('enemy');
    expect(state.log.some((line) => line.includes('Nothing left to spend'))).toBe(true);
  });

  it('stays in the player phase while there is still movement banked', () => {
    const game = createGame(4242);
    beginTurn(game);
    game.state.hand = [];
    game.state.movement = 2;

    for (let i = 0; i < 30; i += 1) tick(game, 1 / 60);
    expect(game.state.phase).toBe('player');
  });

  it('stays in the player phase while cards remain, even with no movement', () => {
    const game = createGame(4242);
    beginTurn(game);
    game.state.movement = 0;
    expect(game.state.hand.length).toBeGreaterThan(0);

    for (let i = 0; i < 30; i += 1) tick(game, 1 / 60);
    expect(game.state.phase).toBe('player');
  });

  it('waits for a reward to be claimed before ending the phase', () => {
    const game = createGame(4242);
    beginTurn(game);
    game.state.hand = [];
    game.state.movement = 0;
    game.state.pendingRewards.push({ kind: 'gem', gemId: 'ruby' });

    for (let i = 0; i < 30; i += 1) tick(game, 1 / 60);
    expect(game.state.phase).toBe('player');
    expect(game.state.activeReward).not.toBeNull();
  });

  it('waits for the last animation before ending the phase', () => {
    const game = createGame(4242);
    beginTurn(game);
    const self = player(game.state);
    game.state.hand = [];
    game.state.movement = 0;
    self.anim = { state: 'attack', frame: 0, elapsed: 0, done: false };

    tick(game, 1 / 60);
    expect(game.state.phase).toBe('player');

    const clip = entityDef('caden').animations.attack;
    for (let t = 0; t < clip.frames / clip.fps + 0.2; t += 1 / 60) tick(game, 1 / 60);
    expect(game.state.phase).toBe('enemy');
  });

  it('runs enemy turns and comes back round to the player', () => {
    const game = createGame(555);
    beginTurn(game);
    expect(enemies(game.state).length).toBeGreaterThan(0);

    runEnemyPhase(game);

    expect(game.state.phase).toBe('player');
    expect(game.state.turn).toBe(2);
    expect(game.state.hand).toHaveLength(stat(game.state, 'handSize'));
  });

  it('keeps enemies coming as the player moves down the map', () => {
    const game = createGame(2024);
    beginTurn(game);
    const first = enemies(game.state).length;

    // Teleport ahead, as a long run would.
    player(game.state).row += 40;
    beginTurn(game);

    expect(game.state.spawnedChunks.length).toBeGreaterThan(3);
    expect(enemies(game.state).length).toBeGreaterThan(first);
  });

  it('ends the run when the player reaches the far end', () => {
    const game = createGame(11);
    beginTurn(game);
    player(game.state).row = game.state.goalRow;
    tick(game, 1 / 60);
    expect(game.state.phase).toBe('victory');
  });

  it('ends the run when the player falls', () => {
    const game = createGame(11);
    beginTurn(game);
    player(game.state).hp = 0;
    tick(game, 1 / 60);
    expect(game.state.phase).toBe('defeat');
  });

  it('swings for an adjacent enemy and throws at a distant one', () => {
    const game = createGame(4242);
    beginTurn(game);
    const { state } = game;
    const self = player(state);

    // Put an enemy next door and hit it with a melee card.
    const foe = state.entities.find((entity) => entity.faction === 'enemy')!;
    foe.row = self.row + 1;
    foe.col = self.col;
    foe.motion = null;
    foe.path = [];

    state.hand = [{ uid: 'melee', defId: 'strike' }, { uid: 'far', defId: 'bolt' }];
    state.energy = 3;

    expect(playCard(game, 'melee', { row: foe.row, col: foe.col })).toBe(true);
    expect(self.anim.state).toBe('attack');

    // Now the same enemy from further off, with a ranged card.
    foe.row = self.row + 3;
    self.anim = { state: 'idle', frame: 0, elapsed: 0, done: false };
    expect(playCard(game, 'far', { row: foe.row, col: foe.col })).toBe(true);
    expect(self.anim.state).toBe('ranged');
  });

  it('waits for an attack animation before moving the turn on', () => {
    const game = createGame(4242);
    beginTurn(game);
    const self = player(game.state);
    const clip = entityDef('caden').animations.attack;

    self.anim = { state: 'attack', frame: 0, elapsed: 0, done: false };
    expect(isBusy(game.state)).toBe(true);

    // Eight frames at its own rate: long enough to read, and the loop holds.
    const duration = clip.frames / clip.fps;
    for (let t = 0; t < duration + 0.1; t += 1 / 60) tick(game, 1 / 60);
    expect(self.anim.state).toBe('idle');
    expect(isBusy(game.state)).toBe(false);
  });

  it('is deterministic: same seed, same script, same run', () => {
    const script = (seed: number) => {
      resetUids();
      const game = createGame(seed);
      beginTurn(game);
      for (let turn = 0; turn < 4; turn += 1) {
        const playable = game.state.hand.find(
          (item) => cardDef(item.defId).targeting === 'self' && cardDef(item.defId).cost <= game.state.energy,
        );
        if (playable) playCard(game, playable.uid);
        runEnemyPhase(game);
      }
      return JSON.stringify(game.state);
    };

    expect(script(90210)).toEqual(script(90210));
    expect(script(90210)).not.toEqual(script(90211));
  });
});
