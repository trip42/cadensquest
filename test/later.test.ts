import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, enterFloor, MIN_DECK, playCard, removeCardReward, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { loadContent } from '~/game/content';
import type { Effect } from '~/game/effects';
import { entityDef, GUARDIAN_IDS } from '~/game/entities/definitions';
import { rollReward } from '~/game/rewards';
import { createRng } from '~/game/rng';
import { createGame, type Game, makeCard, makeEntity, player, resetUids, stat, wholeDeck } from '~/game/state';
import { printedText } from '~/game/text';
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

function play(game: Game, cardId: string): boolean {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  return playCard(game, card.uid, null);
}

function define(id: string, effects: Effect[], extra: Partial<CardDefinition> = {}): string {
  CARDS[id] = { id, name: id, rarity: 'rare', cost: 0, targeting: 'self', range: 0, text: '', effects, ...extra };
  return id;
}

describe('a Later', () => {
  it('gives power for a while: Battle Fury is +2 now, still +2 next round, and gone the round after', () => {
    const game = quiet();
    const self = player(game.state);
    play(game, 'battle_fury');
    expect(self.power).toBe(2);
    beginTurn(game);
    expect(self.power).toBe(2);
    beginTurn(game);
    expect(self.power).toBe(0);
    expect(game.state.later).toEqual([]);
    expect(game.state.cues.some((item) => item.type === 'gain' && item.stat === 'power' && item.amount === -2)).toBe(true);
  });

  it('fixes its amounts when played: Frenzy X takes back exactly the X it gave', () => {
    const game = quiet();
    const self = player(game.state);
    game.state.energy = 3;
    play(game, 'frenzy_x');
    expect(self.power).toBe(3);
    self.power += 1; // some other power in the meantime
    beginTurn(game);
    beginTurn(game);
    expect(self.power).toBe(1);
  });

  it('can make you pay later: Blood Pact hurts in two rounds', () => {
    const game = quiet();
    const self = player(game.state);
    const hp = self.hp;
    play(game, 'blood_pact');
    beginTurn(game);
    expect(self.hp).toBe(hp);
    beginTurn(game);
    // What the card says it costs, whatever that is tuned to.
    const bill = CARDS.blood_pact!.effects.flatMap((effect) => (effect.kind === 'later' ? effect.effects : []))
      .find((effect) => effect.kind === 'damage')!.amount as number;
    expect(self.hp).toBe(hp - bill);
    expect(self.power).toBe(3);
  });

  it('lands after the refresh, so a delayed draw or block is not wiped by it', () => {
    const game = quiet();
    const self = player(game.state);
    self.hp -= 10;
    const hp = self.hp;
    play(game, 'second_wind');
    beginTurn(game);
    expect(self.hp).toBe(hp + 5);
    expect(game.state.hand).toHaveLength(stat(game.state, 'handSize') + 1);

    define('brace_later', [{ kind: 'later', rounds: 1, effects: [{ kind: 'block', amount: 5 }] }]);
    play(game, 'brace_later');
    beginTurn(game);
    expect(self.block).toBe(5);
  });

  it('lands at once at 0 rounds', () => {
    const game = quiet();
    define('now', [{ kind: 'later', rounds: 0, effects: [{ kind: 'power', amount: 1 }] }]);
    play(game, 'now');
    expect(player(game.state).power).toBe(1);
    expect(game.state.later).toEqual([]);
  });

  it('goes with its maker: a fallen creature\'s promises are dropped', () => {
    const game = quiet();
    const wolf = makeEntity('wolf', player(game.state).row + 2, player(game.state).col);
    game.state.entities.push(wolf);
    game.state.later.push({ id: 'x', actorId: wolf.id, due: game.state.turn + 1, effects: [{ kind: 'power', amount: 5 }] });
    wolf.dead = true;
    beginTurn(game);
    expect(wolf.power).toBe(0);
    expect(game.state.later).toEqual([]);
  });

  it('follows the player down to the next floor', () => {
    const game = quiet();
    play(game, 'battle_fury');
    enterFloor(game, 1);
    expect(game.state.later).toHaveLength(1);
    beginTurn(game);
    beginTurn(game);
    expect(player(game.state).power).toBe(0);
  });

  it('works for an enemy too', () => {
    const game = quiet();
    const self = player(game.state);
    const wolf = makeEntity('wolf', self.row + 1, self.col);
    game.state.entities.push(wolf);
    INTENTS.rage_later = {
      id: 'rage_later', name: 'Rage', cost: 0, rarity: 'normal', targeting: 'enemy', range: 1, text: '',
      effects: [{ kind: 'power', amount: 4 }, { kind: 'later', rounds: 1, effects: [{ kind: 'losePower', amount: 4 }] }],
    };
    wolf.intent = { cardId: 'rage_later', label: 'Rage' };
    game.state.hand = [];
    endPlayerPhase(game);
    for (let i = 0; i < 3000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 30);
    // The enemy phase ended and a new round began: its rage has passed.
    expect(game.state.phase).toBe('player');
    expect(wolf.power).toBe(0);
  });
});

describe('Lose power', () => {
  it('stops at nothing, and all of your power is a reset', () => {
    const game = quiet();
    const self = player(game.state);
    self.power = 2;
    define('drain', [{ kind: 'losePower', amount: 5 }]);
    play(game, 'drain');
    expect(self.power).toBe(0);
    self.power = 7;
    define('reset', [{ kind: 'losePower', amount: { of: 'power' } }]);
    play(game, 'reset');
    expect(self.power).toBe(0);
  });
});

describe('the new cards', () => {
  it('read the way the editor would write them', () => {
    for (const id of ['battle_fury', 'frenzy_x', 'blood_pact', 'second_wind', 'wildfire']) {
      const card = CARDS[id]!;
      expect(writeCardText(card.effects as never, card.range, 'player', card.targeting), id).toBe(printedText(card.text, card.effects));
    }
  });

  it('Wildfire now only burns: no power, no cards', () => {
    const [mark] = CARDS.wildfire!.effects;
    expect(mark).toMatchObject({ kind: 'terrain', radius: 1, effects: [{ kind: 'damage', amount: 2 }] });
  });
});

describe('a removal', () => {
  function offered(game: Game): void {
    game.state.activeReward = { reward: { kind: 'removal' } };
  }

  it('takes the chosen card out of the deck for good, wherever it is', () => {
    const game = quiet();
    const before = wholeDeck(game.state).length;
    const target = game.state.discardPile[0] ?? game.state.drawPile[0]!;
    offered(game);
    expect(removeCardReward(game, target.uid)).toBe(true);
    expect(wholeDeck(game.state)).toHaveLength(before - 1);
    expect(wholeDeck(game.state).some((card) => card.uid === target.uid)).toBe(false);
    expect(game.state.activeReward).toBeNull();
    expect(game.state.tally.cardsRemoved[target.defId]).toBe(1);
    expect(game.state.events.find((event) => event.type === 'card_removed')).toMatchObject({ card: target.defId, deckSize: before - 1 });
  });

  it('never thins a deck below a hand', () => {
    const game = quiet();
    const keep = wholeDeck(game.state).slice(0, MIN_DECK);
    game.state.drawPile = keep;
    game.state.hand = [];
    game.state.discardPile = [];
    offered(game);
    expect(removeCardReward(game, keep[0]!.uid)).toBe(false);
    expect(wholeDeck(game.state)).toHaveLength(MIN_DECK);
  });

  it('turns up among rewards, but never from a guardian', () => {
    const rng = createRng(5);
    let removals = 0;
    for (let i = 0; i < 2000; i += 1) if (rollReward(rng).kind === 'removal') removals += 1;
    expect(removals).toBeGreaterThan(0);
    for (const id of GUARDIAN_IDS) {
      for (let i = 0; i < 200; i += 1) expect(rollReward(rng, entityDef(id).reward).kind).toBe('talisman');
    }
  });
});

describe('a Later inside a burst', () => {
  const CRY: Effect = {
    kind: 'area', radius: 2, colour: '#feae34', affects: 'friends',
    effects: [{ kind: 'power', amount: 2 }, { kind: 'later', rounds: 2, effects: [{ kind: 'losePower', amount: 2 }] }],
  };

  it('is scheduled on each one caught, so every ally has power that lasts', () => {
    const game = quiet();
    const self = player(game.state);
    const friend = makeEntity('wolf', self.row + 1, self.col);
    friend.faction = 'ally';
    const foe = makeEntity('wolf', self.row, self.col + 1);
    game.state.entities.push(friend, foe);
    play(game, define('cry_t', [CRY]));
    expect([self.power, friend.power, foe.power]).toEqual([2, 2, 0]);
    expect(game.state.later.map((entry) => entry.actorId).sort()).toEqual([friend.id, self.id].sort());
    endPlayerPhase(game);
    for (let i = 0; i < 3000 && game.state.turn < 3; i += 1) {
      tick(game, 1 / 60);
      if (game.state.phase === 'player' && game.state.turn < 3) endPlayerPhase(game);
    }
    expect(self.power).toBe(0);
    if (!friend.dead) expect(friend.power).toBe(0);
  });

  it('reads as power for a while', () => {
    expect(writeCardText([CRY], 0, 'player', 'self'))
      .toBe('Burst around you: each of your side within 2 deals 2 more damage for 2 rounds.');
  });
});
