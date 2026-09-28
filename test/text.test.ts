import { describe, expect, it } from 'vitest';
import { beginTurn, handText, intentText, playCard } from '~/game/actions';
import { CARDS } from '~/game/cards/definitions';
import type { CardDefinition } from '~/game/cards/types';
import { type Content, validateContent } from '~/game/content';
import { cuesSince } from '~/game/cues';
import { type AmountValues, type Effect, isArea } from '~/game/effects';
import { entityCell } from '~/game/entities/types';
import { cellDistance, reachable } from '~/game/map/navigation';
import { createGame, type Game, makeCard, makeEntity, player, resetUids, syncStats } from '~/game/state';
import { joinText, liveText, printedParts, printedText, tokenProblems } from '~/game/text';
import { readContentFiles } from './setup';

const VALUES: AmountValues = { block: 0, health: 30, missingHealth: 10, energy: 0, hand: 3, power: 0, x: 0 };
const live = (text: string, effects: Effect[], values: Partial<AmountValues> = {}, damage = 0, block = 0) =>
  liveText(text, effects, { ...VALUES, ...values }, { damage, block });

describe('numbers in rules text', () => {
  it('prints each token as the card\'s own number', () => {
    const effects: Effect[] = [
      { kind: 'damage', amount: 5 },
      { kind: 'terrain', rounds: 3, colour: '#e43b44', effects: [{ kind: 'damage', amount: 2 }] },
    ];
    expect(printedText('Deal {1} damage. For {2} rounds, {2.1} a round.', effects)).toBe('Deal 5 damage. For 3 rounds, 2 a round.');
    // X reads the way cards print it; other scaled amounts name their source.
    expect(printedText('Deal {1} damage', [{ kind: 'damage', amount: { of: 'x', times: 5 } }])).toBe('Deal 5X damage');
    expect(printedText('Hits for {1}', [{ kind: 'damage', amount: { of: 'block' } }], 'its')).toBe('Hits for its block');
    // Text with no tokens is left alone, braces and all.
    expect(printedText('Deal 6 damage.', effects)).toBe('Deal 6 damage.');
  });

  it('counts power and the damage bonus on a blow, and says it went up', () => {
    const parts = live('Deal {1} damage.', [{ kind: 'damage', amount: 5 }], { power: 3 }, 1);
    expect(joinText(parts)).toBe('Deal 9 damage.');
    expect(parts.find((part) => part.text === '9')?.change).toBe('up');
    // Nothing added: a plain number, not marked.
    expect(live('Deal {1} damage.', [{ kind: 'damage', amount: 5 }])).toEqual([{ text: 'Deal ' }, { text: '5', unit: 'damage' }, { text: ' damage.' }]);
  });

  it('counts the block bonus on block, and nothing on heals or draws', () => {
    const effects: Effect[] = [{ kind: 'block', amount: 5 }, { kind: 'heal', amount: 4 }, { kind: 'draw', amount: 1 }];
    expect(joinText(live('{1} block, heal {2}, draw {3}', effects, { power: 3 }, 2, 2))).toBe('7 block, heal 4, draw 1');
  });

  it('counts power gained earlier on the card, as resolving it would', () => {
    const effects: Effect[] = [{ kind: 'power', amount: 2 }, { kind: 'damage', amount: 4 }];
    expect(joinText(live('+{1} power, then {2}', effects, { power: 1 }))).toBe('+2 power, then 7');
  });

  it('adds power to a burst but not to a tile or a Later', () => {
    const effects: Effect[] = [
      { kind: 'area', radius: 1, colour: '#feae34', effects: [{ kind: 'damage', amount: 4 }] },
      { kind: 'terrain', rounds: 2, colour: '#e43b44', effects: [{ kind: 'damage', amount: 3 }] },
      { kind: 'later', rounds: 2, effects: [{ kind: 'damage', amount: 8 }] },
    ];
    expect(joinText(live('{1.1} / {2.1} / {3.1}', effects, { power: 2 }, 1))).toBe('7 / 3 / 8');
  });

  it('says what each number measures, so the screen can colour it', () => {
    const effects: Effect[] = [
      { kind: 'damage', amount: 5 }, { kind: 'heal', amount: 2 }, { kind: 'block', amount: 3 }, { kind: 'push', amount: 2 },
      { kind: 'later', rounds: 2, effects: [{ kind: 'losePower', amount: 1 }] }, { kind: 'draw', amount: 1 },
    ];
    const units = printedParts('{1} {2} {3} {4} {5} {5.1} {6}', effects).filter((part) => part.unit).map((part) => part.unit);
    expect(units).toEqual(['damage', 'health', 'block', 'movement', 'plain', 'power', 'plain']);
  });

  it('works out X from what the card would spend', () => {
    expect(joinText(live('Deal {1} damage', [{ kind: 'damage', amount: { of: 'x', times: 5 } }], { x: 3 }))).toBe('Deal 15 damage');
  });

  it('reads an enemy\'s intent with its power', () => {
    resetUids();
    const game = createGame(7);
    const wolf = makeEntity('wolf', 5, 5);
    wolf.power = 2;
    const card: CardDefinition = {
      id: 'bite', name: 'Bite', cost: 0, rarity: 'normal', targeting: 'enemy', range: 1,
      text: 'Closes up to {1} and bites for {2}.', effects: [{ kind: 'advance', amount: 4 }, { kind: 'damage', amount: 5 }],
    };
    expect(joinText(intentText(game.state, wolf, card))).toBe('Closes up to 4 and bites for 7.');
  });

  it('says what is wrong with a token', () => {
    const effects: Effect[] = [
      { kind: 'damage', amount: 5 },
      { kind: 'later', rounds: 2, effects: [{ kind: 'losePower', amount: 2 }] },
    ];
    expect(tokenProblems('Deal {1}, then {2.1}', effects)).toEqual([]);
    expect(tokenProblems('Deal {damage}', effects)[0]).toMatch(/not a number token/);
    expect(tokenProblems('Deal {3}', effects)[0]).toMatch(/points at effect 3, but there are only 2/);
    expect(tokenProblems('Deal {1.1}', effects)[0]).toMatch(/nothing inside it/);
    expect(tokenProblems('Deal {2.2}', effects)[0]).toMatch(/only 1 effect inside it/);
  });

  it('refuses content with a broken token, and tokens where they would show as braces', () => {
    const raw = readContentFiles() as unknown as Content;
    raw.cards[0]!.text = 'Deal {9} damage.';
    raw.gems[0]!.text = 'Heal {1}.';
    const { issues } = validateContent(raw as unknown as Parameters<typeof validateContent>[0]);
    const errors = issues.filter((issue) => issue.level === 'error');
    expect(errors.some((issue) => issue.file === 'cards' && issue.field === 'text')).toBe(true);
    expect(errors.some((issue) => issue.file === 'gems' && issue.field === 'text')).toBe(true);
  });
});

/* The number a card shows in hand is the number it deals. Every card is
   played at an enemy beside the player, with power and a damage bonus, and
   the blows and bursts that land are added up against what its tokens say. */
describe('what a card shows in hand', () => {
  function arena(): { game: Game; foeCell: { row: number; col: number } } {
    resetUids();
    const game = createGame(4242);
    beginTurn(game);
    const self = player(game.state);
    game.state.entities = [self];
    game.state.gates = [];
    game.state.terrain = {};
    game.state.energy = 3;
    self.power = 3;
    game.state.talismans = ['whetstone'];
    syncStats(game.state);
    const foeCell = [...reachable(game.world, entityCell(self), 1).values()].find((entry) => entry.cost === 1)!.cell;
    const foe = makeEntity('slime', foeCell.row, foeCell.col);
    foe.maxHp = foe.hp = 999;
    game.state.entities.push(foe);
    return { game, foeCell };
  }

  for (const def of Object.values(CARDS)) {
    if (def.targeting === 'ally') continue;
    it(`${def.id} deals what it shows`, () => {
      const { game, foeCell } = arena();
      const self = player(game.state);
      const aimed = def.targeting === 'enemy' || def.targeting === 'cell';
      const centre = aimed ? foeCell : entityCell(self);

      // A token for each number that lands on the enemy as a blow or a burst.
      const keys = def.effects.flatMap((effect, i): string[] => {
        if (isArea(effect)) {
          const caught = effect.affects !== 'friends' && cellDistance(centre, foeCell) <= effect.radius;
          return caught ? effect.effects.flatMap((inner, j) => (inner.kind === 'damage' ? [`${i + 1}.${j + 1}`] : [])) : [];
        }
        return aimed && effect.kind === 'damage' ? [`${i + 1}`] : [];
      });
      const shown = joinText(handText(game.state, { ...def, text: keys.map((key) => `{${key}}`).join(' ') }))
        .split(' ').filter(Boolean).reduce((sum, n) => sum + Number(n), 0);

      const card = makeCard(def.id);
      game.state.hand.push(card);
      const before = game.state.cueSeq;
      const played = playCard(game, card.uid, aimed ? foeCell : null);
      const foe = game.state.entities.find((entity) => entity.faction === 'enemy')!;
      const dealt = cuesSince(game.state, before)
        .filter((item) => item.type === 'hit' && item.target === foe.id && (item.via === 'blow' || item.via === 'burst'))
        .reduce((sum, item) => sum + (item.type === 'hit' ? item.amount + item.blocked : 0), 0);

      // A card that cannot be played at it (a Tame at a strong enemy, a leap
      // onto an occupied tile) must not have promised any damage either.
      expect(dealt, `${def.id}: shown ${shown}, dealt ${dealt}${played ? '' : ' (not played)'}`).toBe(played ? shown : 0);
      if (!played) expect(shown).toBe(0);
    });
  }
});
