import { afterEach, describe, expect, it } from 'vitest';
import { beginTurn, endPlayerPhase, playCard, tick } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import { INTENTS } from '~/game/cards/intents';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, loadContent, validateContent } from '~/game/content';
import { amountOf, type AmountValues, type Effect, nowText, previewAmounts } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids, stat } from '~/game/state';
import { GEMS } from '~/game/gems';
import { TALISMANS } from '~/game/talismans';
import { writeCardText } from '~/utils/contentText';
import { readContentFiles } from './setup';

const VALUES: AmountValues = { block: 8, health: 30, missingHealth: 10, energy: 2, hand: 4, power: 0, x: 0 };

// Tests here add cards and talismans to the registries; put the real
// content back after each.
afterEach(() => loadContent(readContentFiles()));

/** A fresh first turn with nobody else on the board. */
function quiet(): Game {
  resetUids();
  const game = createGame(4242);
  beginTurn(game);
  game.state.entities = [player(game.state)];
  game.state.gates = [];
  return game;
}

function adjacentFoe(game: Game, defId = 'wolf') {
  const here = entityCell(player(game.state));
  const cell = [...reachable(game.world, here, 1).values()].find((entry) => entry.cost === 1)!.cell;
  const foe = makeEntity(defId, cell.row, cell.col);
  foe.maxHp = foe.hp = 99;
  game.state.entities.push(foe);
  return foe;
}

function define(card: Partial<CardDefinition> & { id: string; effects: Effect[] }): string {
  CARDS[card.id] = {
    name: card.id, rarity: 'rare', cost: 0, targeting: 'enemy', range: 1, text: '', ...card,
  };
  return card.id;
}

function play(game: Game, cardId: string, target = entityCell(player(game.state))): void {
  const card = makeCard(cardId);
  game.state.hand.push(card);
  expect(playCard(game, card.uid, target)).toBe(true);
}

describe('working out an amount', () => {
  it('is the number itself when fixed', () => {
    expect(amountOf(6, VALUES)).toBe(6);
  });

  it('scales, adds, rounds down and never goes below zero', () => {
    expect(amountOf({ of: 'block' }, VALUES)).toBe(8);
    expect(amountOf({ of: 'block', times: 0.5 }, { ...VALUES, block: 5 })).toBe(2);
    expect(amountOf({ of: 'missingHealth', times: 2, plus: 1 }, VALUES)).toBe(21);
    expect(amountOf({ of: 'block', plus: -20 }, VALUES)).toBe(0);
  });

  it('reads each effect after the ones before it', () => {
    const effects: Effect[] = [
      { kind: 'block', amount: 5 },
      { kind: 'damage', amount: { of: 'block' } },
      { kind: 'loseBlock', amount: { of: 'block' } },
      { kind: 'damage', amount: { of: 'block' } },
    ];
    expect(previewAmounts(effects, VALUES)).toEqual([5, 13, 13, 0]);
  });
});

describe('Shield Slam: damage equal to your block, then lose it', () => {
  it('hits for the block and spends all of it', () => {
    const game = quiet();
    const foe = adjacentFoe(game);
    const self = player(game.state);
    self.block = 8;
    play(game, 'shield_slam', entityCell(foe));
    expect(foe.hp).toBe(99 - 8 - stat(game.state, 'damageBonus'));
    expect(self.block).toBe(0);
  });

  it('counts block gained earlier on the same card', () => {
    const game = quiet();
    const foe = adjacentFoe(game);
    player(game.state).block = 0;
    define({ id: 'brace_and_bash', effects: [{ kind: 'block', amount: 6 }, { kind: 'damage', amount: { of: 'block' } }] });
    play(game, 'brace_and_bash', entityCell(foe));
    expect(foe.hp).toBe(99 - 6);
  });

  it('can spend half', () => {
    const game = quiet();
    const self = player(game.state);
    self.block = 9;
    define({ id: 'half_drain', targeting: 'self', range: 0, effects: [{ kind: 'loseBlock', amount: { of: 'block', times: 0.5 } }] });
    play(game, 'half_drain');
    expect(self.block).toBe(5);   // 9 - floor(4.5)
  });

  it('takes no block bonus when losing block', () => {
    const game = quiet();
    TALISMANS.bulwark_charm = { id: 'bulwark_charm', name: 'Charm', text: '', icon: 'shield', modifiers: [{ stat: 'blockBonus', add: 3 }] };
    game.state.talismans.push('bulwark_charm');
    const self = player(game.state);
    self.block = 8;
    define({ id: 'drop_guard', targeting: 'self', range: 0, effects: [{ kind: 'loseBlock', amount: 5 }] });
    play(game, 'drop_guard');
    expect(self.block).toBe(3);
  });
});

describe('enemies', () => {
  it('read their own values, starting their move with no block', () => {
    const game = quiet();
    const foe = adjacentFoe(game);
    foe.block = 20;   // left over from last turn: falls as it acts
    INTENTS.shield_bash = {
      id: 'shield_bash', name: 'Shield bash', cost: 0, rarity: 'normal', targeting: 'enemy', range: 1, text: '',
      effects: [{ kind: 'block', amount: 4 }, { kind: 'damage', amount: { of: 'block' } }],
    };
    foe.intent = { cardId: 'shield_bash', label: 'Shield bash' };
    const self = player(game.state);
    self.block = 0;
    const before = self.hp;
    endPlayerPhase(game);
    for (let i = 0; i < 30000 && game.state.phase === 'enemy'; i += 1) tick(game, 1 / 60);
    expect(before - self.hp).toBe(4 + foe.power);
  });
});

describe('the live number', () => {
  it('says what the moment-dependent effects come to', () => {
    const effects: Effect[] = [{ kind: 'damage', amount: { of: 'block' } }, { kind: 'loseBlock', amount: { of: 'block' } }];
    expect(nowText(effects, VALUES)).toBe('8 damage, −8 block');
  });

  it('has a short form for the band across the art', () => {
    const effects: Effect[] = [{ kind: 'damage', amount: { of: 'block' } }, { kind: 'loseBlock', amount: { of: 'block' } }];
    expect(nowText(effects, { ...VALUES, block: 18 }, 'short')).toBe('18 DMG −18 BLK');
  });

  it('stays quiet for a card of fixed numbers', () => {
    expect(nowText([{ kind: 'damage', amount: 6 }], VALUES)).toBeNull();
  });
});

describe('content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;
  const check = (content: Content) => validateContent(content as never);

  it('accepts a scaled amount and refuses one based on something that does not exist', () => {
    const content = draft();
    const card = content.cards.find((item) => item.id === 'strike')!;
    card.effects[0]!.amount = { of: 'block', times: 0.5, plus: 2 };
    expect(check(content).content).not.toBeNull();

    (card.effects[0] as { amount: unknown }).amount = { of: 'luck' };
    expect(check(content).issues[0]).toMatchObject({ level: 'error', id: 'strike', field: 'effects[0].amount' });
  });

  it('refuses a formula string — content is never evaluated', () => {
    const content = draft();
    (content.cards[0]!.effects[0] as { amount: unknown }).amount = '-1 * block';
    expect(check(content).content).toBeNull();
  });

  it("warns when an enemy card leans on block it cannot have", () => {
    const content = draft();
    content['enemy-cards'][0]!.effects = [{ kind: 'damage', amount: { of: 'block' } }];
    expect(check(content).issues).toContainEqual(expect.objectContaining({ level: 'warning', field: 'effects[0].amount' }));
  });
});

describe('writing the text', () => {
  it('reads naturally for a scaled amount', () => {
    expect(writeCardText([
      { kind: 'damage', amount: { of: 'block' } },
      { kind: 'loseBlock', amount: { of: 'block' } },
    ], 1, 'player')).toBe('Deal damage equal to your block to an adjacent enemy and lose all your block.');
    expect(writeCardText([{ kind: 'heal', amount: { of: 'block', times: 0.5, plus: 2 } }], 0, 'player'))
      .toBe('Heal equal to half your block + 2.');
  });
});

describe('X cost', () => {
  it('spends all the energy and hits for X', () => {
    const game = quiet();
    const foe = adjacentFoe(game);
    game.state.energy = 3;
    play(game, 'flurry', entityCell(foe));
    expect(game.state.energy).toBe(0);
    expect(foe.hp).toBe(99 - 4 * 3 - stat(game.state, 'damageBonus'));
  });

  it('can be played with nothing left, for an X of 0', () => {
    const game = quiet();
    const foe = adjacentFoe(game);
    game.state.energy = 0;
    play(game, 'flurry', entityCell(foe));
    expect(foe.hp).toBe(99 - stat(game.state, 'damageBonus'));
  });

  it("lets the card's gems read X too", () => {
    const game = quiet();
    game.state.energy = 2;
    const self = player(game.state);
    self.block = 0;
    define({ id: 'x_guard', cost: 'X', targeting: 'self', range: 0, effects: [{ kind: 'block', amount: { of: 'x' } }] });
    const card = makeCard('x_guard');
    card.gems = ['x_gem'];
    GEMS.x_gem = { id: 'x_gem', name: 'X gem', colour: '#ffffff', text: '', effects: [{ kind: 'heal', amount: { of: 'x', times: 2 } }] };
    self.hp = 20;
    game.state.hand.push(card);
    expect(playCard(game, card.uid)).toBe(true);
    expect(self.block).toBe(2 + stat(game.state, 'blockBonus'));
    expect(self.hp).toBe(24);
  });

  it('records how big X was', () => {
    const game = quiet();
    const foe = adjacentFoe(game);
    game.state.energy = 3;
    play(game, 'flurry', entityCell(foe));
    expect(game.state.events.filter((event) => event.type === 'card_played').at(-1)).toMatchObject({ card: 'flurry', energy: 3 });
  });

  it('shows the live X in hand', () => {
    expect(nowText([{ kind: 'damage', amount: { of: 'x', times: 4 } }], { ...VALUES, energy: 0, x: 3 }, 'short')).toBe('12 DMG');
  });

  it('writes its text the way cards print X', () => {
    expect(writeCardText([{ kind: 'damage', amount: { of: 'x', times: 4 } }], 1, 'player'))
      .toBe('Deal 4X damage to an adjacent enemy.');
    expect(writeCardText([{ kind: 'draw', amount: { of: 'x', plus: 1 } }], 0, 'player')).toBe('Draw X + 1 cards.');
  });
});

describe('X in content', () => {
  const draft = () => structuredClone(readContentFiles()) as unknown as Content;
  const check = (content: Content) => validateContent(content as never);

  it('accepts "X" as a cost and nothing else that is not a number', () => {
    const content = draft();
    expect(check(content).content).not.toBeNull();
    (content.cards[0] as { cost: unknown }).cost = 'Y';
    expect(check(content).issues[0]).toMatchObject({ level: 'error', field: 'cost' });
  });

  it('warns about an X card that never uses X, and X on a card that does not cost it', () => {
    const content = draft();
    const flurry = content.cards.find((card) => card.id === 'flurry')!;
    flurry.effects = [{ kind: 'damage', amount: 5 }];
    const strike = content.cards.find((card) => card.id === 'strike')!;
    strike.effects = [{ kind: 'damage', amount: { of: 'x' } }];
    const warnings = check(content).issues.filter((issue) => issue.level === 'warning');
    expect(warnings).toContainEqual(expect.objectContaining({ id: 'flurry', field: 'cost' }));
    expect(warnings).toContainEqual(expect.objectContaining({ id: 'strike', field: 'effects[0].amount' }));
  });
});
