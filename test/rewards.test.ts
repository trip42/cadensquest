import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginTurn,
  chooseCardReward,
  endPlayerPhase,
  isBusy,
  playCard,
  socketGemReward,
  takeTalismanReward,
  tick,
} from '~/game/actions';
import { cardDef, REWARD_POOL } from '~/game/cards/definitions';
import { GEM_SLOTS } from '~/game/gems';
import {
  DEFAULT_REWARD_CONFIG,
  rewardConfig,
  rollReward,
  type RewardKind,
} from '~/game/rewards';
import { createRng } from '~/game/rng';
import { BASE_STATS, resolveStat } from '~/game/stats';
import {
  createGame,
  enemies,
  findCard,
  type Game,
  gemsOf,
  makeCard,
  player,
  resetUids,
  stat,
  wholeDeck,
} from '~/game/state';
import { talismanDef, TALISMAN_IDS } from '~/game/talismans';

const settle = (game: Game, limit = 4000): void => {
  for (let i = 0; i < limit && isBusy(game.state); i += 1) tick(game, 1 / 60);
};

/** Kill the nearest enemy outright and let the reward come up. */
function slay(game: Game): void {
  const foe = enemies(game.state)[0]!;
  const self = player(game.state);
  foe.row = self.row + 1;
  foe.col = self.col;
  foe.motion = null;
  foe.path = [];
  foe.hp = 1;
  foe.block = 0;

  game.state.hand = [makeCard('strike')];
  game.state.energy = 3;
  playCard(game, game.state.hand[0]!.uid, { row: foe.row, col: foe.col });
  settle(game);
  tick(game, 1 / 60);
}

describe('reward rolling', () => {
  it('follows the configured frequencies', () => {
    const rng = createRng(4242);
    const tally: Record<RewardKind, number> = { card: 0, gem: 0, talisman: 0 };
    for (let i = 0; i < 20000; i += 1) tally[rollReward(rng).kind] += 1;

    const { weights } = DEFAULT_REWARD_CONFIG;
    const total = weights.card + weights.gem + weights.talisman;
    for (const kind of ['card', 'gem', 'talisman'] as RewardKind[]) {
      const share = tally[kind] / 20000;
      expect(Math.abs(share - weights[kind] / total)).toBeLessThan(0.02);
    }
  });

  it('honours a table that switches a kind off', () => {
    const rng = createRng(11);
    for (let i = 0; i < 500; i += 1) {
      const reward = rollReward(rng, { weights: { card: 1, gem: 0, talisman: 0 } });
      expect(reward.kind).toBe('card');
    }
  });

  it('offers the configured number of distinct cards', () => {
    const rng = createRng(99);
    for (let i = 0; i < 200; i += 1) {
      const reward = rollReward(rng, { weights: { card: 1, gem: 0, talisman: 0 }, cardChoices: 3 });
      if (reward.kind !== 'card') continue;
      expect(reward.options).toHaveLength(3);
      expect(new Set(reward.options).size).toBe(3);
      for (const id of reward.options) expect(REWARD_POOL).toContain(id);
    }
  });

  it('never offers a starter card, even when asked for one', () => {
    const rng = createRng(31337);
    for (let i = 0; i < 400; i += 1) {
      const reward = rollReward(rng, {
        weights: { card: 1, gem: 0, talisman: 0 },
        // Weighted entirely towards starters: the pool must still refuse.
        cardRarity: { starter: 100, normal: 1, rare: 0, mythic: 0 },
      });
      if (reward.kind !== 'card') continue;
      for (const id of reward.options) expect(cardDef(id).rarity).not.toBe('starter');
    }
  });

  it('respects a rarity table', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i += 1) {
      const reward = rollReward(rng, {
        weights: { card: 1, gem: 0, talisman: 0 },
        cardRarity: { normal: 0, rare: 0, mythic: 1 },
      });
      if (reward.kind !== 'card') continue;
      for (const id of reward.options) expect(cardDef(id).rarity).toBe('mythic');
    }
  });

  it('merges partial overrides over the defaults', () => {
    const config = rewardConfig({ cardChoices: 9 });
    expect(config.cardChoices).toBe(9);
    expect(config.weights).toEqual(DEFAULT_REWARD_CONFIG.weights);
  });

  it('is deterministic for a seed', () => {
    const a = Array.from({ length: 20 }, (() => { const r = createRng(5); return () => rollReward(r); })());
    const b = Array.from({ length: 20 }, (() => { const r = createRng(5); return () => rollReward(r); })());
    expect(a).toEqual(b);
  });
});

describe('claiming rewards', () => {
  beforeEach(() => resetUids());

  it('decides what an enemy carries when it spawns', () => {
    const game = createGame(2024);
    beginTurn(game);
    for (const foe of enemies(game.state)) {
      expect(foe.reward).not.toBeNull();
      expect(['card', 'gem', 'talisman']).toContain(foe.reward!.kind);
    }
  });

  it('queues the reward when the enemy falls, and offers it in the player phase', () => {
    const game = createGame(2024);
    beginTurn(game);
    const carried = enemies(game.state)[0]!.reward!;
    slay(game);
    expect(game.state.activeReward?.reward).toEqual(carried);
  });

  it('puts a chosen card on top of the draw pile', () => {
    const game = createGame(2024);
    beginTurn(game);
    game.state.pendingRewards.push({ kind: 'card', options: ['cleave', 'mend', 'surge'] });
    tick(game, 1 / 60);

    const offered = game.state.activeReward!.offered!;
    expect(offered).toHaveLength(3);

    const wanted = offered[1]!;
    expect(chooseCardReward(game, wanted.uid)).toBe(true);
    expect(game.state.activeReward).toBeNull();
    expect(game.state.drawPile.at(-1)!.uid).toBe(wanted.uid);
  });

  it('sets a gem into one card instance and no other', () => {
    const game = createGame(2024);
    beginTurn(game);
    const strikes = wholeDeck(game.state).filter((card) => card.defId === 'strike');
    expect(strikes.length).toBeGreaterThan(1);

    game.state.pendingRewards.push({ kind: 'gem', gemId: 'ruby' });
    tick(game, 1 / 60);
    expect(socketGemReward(game, strikes[0]!.uid)).toBe(true);

    expect(gemsOf(findCard(game.state, strikes[0]!.uid)!)).toEqual(['ruby']);
    expect(gemsOf(findCard(game.state, strikes[1]!.uid)!)).toEqual([]);
  });

  it('will not overfill a card with gems', () => {
    const game = createGame(2024);
    beginTurn(game);
    const card = wholeDeck(game.state)[0]!;
    card.gems = new Array(GEM_SLOTS).fill('ruby');

    game.state.pendingRewards.push({ kind: 'gem', gemId: 'emerald' });
    tick(game, 1 / 60);
    expect(socketGemReward(game, card.uid)).toBe(false);
    expect(game.state.activeReward).not.toBeNull();
  });

  it('holds play while a reward is waiting', () => {
    const game = createGame(2024);
    beginTurn(game);
    game.state.pendingRewards.push({ kind: 'gem', gemId: 'ruby' });
    tick(game, 1 / 60);

    const uid = game.state.hand[0]!.uid;
    expect(playCard(game, uid)).toBe(false);
    endPlayerPhase(game);
    expect(game.state.phase).toBe('player');
  });
});

describe('gems change the instance that carries them', () => {
  beforeEach(() => resetUids());

  it('adds the gem effect when that card is played', () => {
    const game = createGame(77);
    beginTurn(game);
    const self = player(game.state);
    self.hp = self.maxHp - 5;

    const plain = makeCard('guard');
    const gemmed = makeCard('guard');
    gemmed.gems = ['ruby', 'emerald'];
    game.state.hand = [plain, gemmed];
    game.state.energy = 3;

    playCard(game, plain.uid);
    expect(self.hp).toBe(self.maxHp - 5);

    const energyBefore = game.state.energy;
    playCard(game, gemmed.uid);
    expect(self.hp).toBe(self.maxHp - 4);           // ruby healed 1
    expect(game.state.energy).toBe(energyBefore);   // emerald refunded the cost
  });
});

describe('talismans', () => {
  beforeEach(() => resetUids());

  it('changes a stat for as long as it is held', () => {
    const game = createGame(5);
    beginTurn(game);
    const before = stat(game.state, 'handSize');

    game.state.pendingRewards.push({ kind: 'talisman', talismanId: 'satchel' });
    tick(game, 1 / 60);
    expect(takeTalismanReward(game)).toBe(true);

    expect(stat(game.state, 'handSize')).toBe(before + 1);
    endPlayerPhase(game);
    for (let i = 0; i < 20000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(game.state.hand).toHaveLength(before + 1);
  });

  it('hands over the extra health when maximum health rises', () => {
    const game = createGame(5);
    beginTurn(game);
    const self = player(game.state);
    const before = self.maxHp;
    self.hp = before;

    game.state.talismans.push('heartstone');
    // syncStats runs through the reward path; call it the same way.
    game.state.pendingRewards.push({ kind: 'talisman', talismanId: 'aegis' });
    tick(game, 1 / 60);
    takeTalismanReward(game);

    expect(self.maxHp).toBe(before + 10);
    expect(self.hp).toBe(self.maxHp);
  });

  it('fires triggered effects at the named point', () => {
    const game = createGame(5);
    beginTurn(game);
    const self = player(game.state);
    self.hp = 10;

    game.state.talismans.push('emberwick');
    slay(game);
    expect(self.hp).toBeGreaterThan(10);
  });

  it('grants block every refresh', () => {
    const game = createGame(5);
    beginTurn(game);
    game.state.talismans.push('aegis');
    endPlayerPhase(game);
    for (let i = 0; i < 20000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(player(game.state).block).toBe(3);
  });

  it('stacks duplicates through the same modifier maths', () => {
    const game = createGame(5);
    beginTurn(game);
    const before = stat(game.state, 'handSize');
    game.state.talismans.push('satchel', 'satchel');
    expect(stat(game.state, 'handSize')).toBe(before + 2);
  });

  it('describes every talisman it defines', () => {
    for (const id of TALISMAN_IDS) {
      const def = talismanDef(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.text.length).toBeGreaterThan(0);
      expect((def.modifiers?.length ?? 0) + (def.triggers?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});

describe('the stat table', () => {
  it('starts every stat at its base with nothing held', () => {
    for (const key of Object.keys(BASE_STATS) as (keyof typeof BASE_STATS)[]) {
      expect(resolveStat(key, [])).toBe(BASE_STATS[key]);
    }
  });

  it('adds before it multiplies', () => {
    const mods = [{ stat: 'maxHp' as const, add: 10 }, { stat: 'maxHp' as const, mul: 2 }];
    expect(resolveStat('maxHp', mods)).toBe((BASE_STATS.maxHp + 10) * 2);
  });

  it('never goes below zero', () => {
    expect(resolveStat('handSize', [{ stat: 'handSize', add: -100 }])).toBe(0);
  });
});
