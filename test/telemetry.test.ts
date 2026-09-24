import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginTurn,
  chooseCardReward,
  discardAllForMovement,
  discardForMovement,
  endPlayerPhase,
  isBusy,
  playCard,
  skipReward,
  socketGemReward,
  takeTalismanReward,
  tick,
} from '~/game/actions';
import { entityCell } from '~/game/entities/types';
import { reachable } from '~/game/map/navigation';
import { ZONE_ROWS } from '~/game/map/tiles';
import { createGame, type Game, makeCard, makeEntity, player, resetUids, wholeDeck } from '~/game/state';
import type { Reward } from '~/game/rewards';
import type { GameEvent, GameEventType } from '~/game/telemetry';

const of = <T extends GameEventType>(game: Game, type: T) =>
  game.state.events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);

const settle = (game: Game): void => {
  for (let i = 0; i < 4000 && isBusy(game.state); i += 1) tick(game, 1 / 60);
};

function fresh(seed = 4242): Game {
  resetUids();
  const game = createGame(seed);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  return game;
}

/** A foe standing next to the player, one hit from death. */
function adjacentFoe(game: Game, defId = 'bug') {
  const from = entityCell(player(game.state));
  const cell = [...reachable(game.world, from, 1).values()][0]!.cell;
  const foe = makeEntity(defId, cell.row, cell.col);
  game.state.entities.push(foe);
  return foe;
}

describe('run events', () => {
  beforeEach(() => resetUids());

  it('announces the run with its seed', () => {
    const game = createGame(90210);
    expect(of(game, 'run_started')).toEqual([{ type: 'run_started', seed: 90210, startRow: player(game.state).row }]);
  });

  it('records plays and discards, and counts them per card', () => {
    const game = fresh();
    game.state.hand = [makeCard('guard'), makeCard('guard'), makeCard('mend')];
    game.state.hand[0]!.gems = ['ruby'];
    game.state.energy = 5;

    playCard(game, game.state.hand[0]!.uid);
    discardForMovement(game, game.state.hand[0]!.uid);
    discardAllForMovement(game);

    expect(of(game, 'card_played')).toEqual([
      { type: 'card_played', card: 'guard', rarity: 'starter', gems: ['ruby'], energy: 1 },
    ]);
    const discards = of(game, 'card_discarded');
    expect(discards.map((event) => [event.card, event.bulk])).toEqual([['guard', false], ['mend', true]]);
    expect(game.state.tally.cardsPlayed).toEqual({ guard: 1 });
    expect(game.state.tally.cardsDiscarded).toEqual({ guard: 1, mend: 1 });
  });

  it('records a kill, and who did the killing when the player falls', () => {
    const game = fresh();
    const foe = adjacentFoe(game);
    foe.hp = 1;
    game.state.hand = [makeCard('strike')];
    playCard(game, game.state.hand[0]!.uid, entityCell(foe));
    settle(game);

    expect(of(game, 'enemy_killed')).toEqual([
      { type: 'enemy_killed', enemy: 'bug', guardian: false, row: foe.row },
    ]);
    expect(game.state.tally.kills).toEqual({ bug: 1 });

    // Now let a wolf finish him.
    const wolf = adjacentFoe(game, 'wolf');
    wolf.intent = { cardId: 'wolf_lunge', label: 'Lunge' };
    player(game.state).hp = 1;
    player(game.state).block = 0;
    endPlayerPhase(game);
    for (let i = 0; i < 20000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);

    expect(game.state.phase).toBe('defeat');
    const [death] = of(game, 'player_died');
    expect(death?.killedBy).toBe('wolf');
  });

  it('reports a death and its summary exactly once', () => {
    const game = fresh();
    player(game.state).hp = 0;
    for (let i = 0; i < 30; i += 1) tick(game, 1 / 60);

    expect(of(game, 'player_died')).toHaveLength(1);
    const ended = of(game, 'run_ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]!.outcome).toBe('died');
    expect(ended[0]!.summary.deckSize).toBe(wholeDeck(game.state).length);
  });

  it('reports a win and its summary', () => {
    const game = fresh();
    player(game.state).row = game.state.goalRow;
    tick(game, 1 / 60);
    expect(of(game, 'run_won')).toHaveLength(1);
    expect(of(game, 'run_ended')[0]!.outcome).toBe('won');
  });

  it('records each row the first time it is reached, and never again', () => {
    const game = fresh();
    const self = player(game.state);
    const start = self.row;

    self.row = start + 3;
    tick(game, 1 / 60);
    self.row = start + 1;             // walking back over old ground
    tick(game, 1 / 60);
    self.row = start + 4;
    tick(game, 1 / 60);

    expect(of(game, 'row_reached').map((event) => event.row))
      .toEqual([start + 1, start + 2, start + 3, start + 4]);
    expect(game.state.tally.maxRow).toBe(start + 4);
  });

  it('notes crossing into a new zone', () => {
    const game = fresh();
    const self = player(game.state);
    game.state.gates = [];
    self.row = ZONE_ROWS - 2;
    tick(game, 1 / 60);
    self.row = ZONE_ROWS + 1;
    tick(game, 1 / 60);
    const crossings = of(game, 'zone_entered');
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.row).toBe(ZONE_ROWS);
  });

  it('records what was collected from rewards, and what was left', () => {
    const game = fresh();
    const claim = (reward: Reward) => {
      game.state.pendingRewards.push(reward);
      tick(game, 1 / 60);
    };

    claim({ kind: 'card', options: ['cleave', 'mend'] });
    chooseCardReward(game, game.state.activeReward!.offered![0]!.uid);
    claim({ kind: 'gem', gemId: 'sapphire' });
    socketGemReward(game, wholeDeck(game.state)[0]!.uid);
    claim({ kind: 'talisman', talismanId: 'boots' });
    takeTalismanReward(game);
    claim({ kind: 'gem', gemId: 'ruby' });
    skipReward(game);

    expect(of(game, 'card_collected')[0]).toMatchObject({ card: 'cleave', deckSize: wholeDeck(game.state).length });
    expect(of(game, 'gem_collected')[0]!.gem).toBe('sapphire');
    expect(of(game, 'talisman_collected')[0]!.talisman).toBe('boots');
    expect(of(game, 'reward_skipped')[0]!.kind).toBe('gem');
    expect(game.state.tally).toMatchObject({
      cardsCollected: { cleave: 1 },
      gemsCollected: { sapphire: 1 },
      talismansCollected: { boots: 1 },
      rewardsSkipped: { gem: 1 },
    });
  });
});
