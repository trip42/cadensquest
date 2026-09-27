/* Design experiments: content the game does not have yet, built only from
   verbs it already has, to see what each does to the scorecard.

   The enemies borrow existing sprites — the simulator never draws them.
   Anything worth keeping needs art and a place in content/. */

import { addEnemies, all, type Raw, scaleDensity, scaleEnemyDamage, startingDeck } from './content';

/** The best plain setup from the tuning search: the lean deck, enemies
 *  hitting a fifth softer, a fifth fewer of them. */
export const TUNED = all(
  startingDeck(['strike', 'strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'guard']),
  scaleEnemyDamage(0.8),
  scaleDensity(0.8),
);

/** A starting deck of different basics, so a hand holds different options. */
export const VARIED_DECK = ['strike', 'strike', 'jab', 'guard', 'guard', 'shrug', 'knockback', 'grapple_hook', 'bolt', 'scout'];

const sprite = (row: number) => ({ sheet: 'enemies', col: 0, row, faces: -1, footprint: { width: 96, height: 84 } });

const enemy = (id: string, name: string, maxHp: number, row: number, deck: string[]): Raw => ({
  id, name, enabled: true, maxHp, sprite: sprite(row), deck,
});

const card = (id: string, name: string, range: number, text: string, effects: Raw[]): Raw => ({
  id, name, enabled: true, range, text, effects,
});

/** Knocks its target back — into walls, hazards and other enemies. */
export const BRUTE = {
  enemies: [enemy('brute', 'Brute', 18, 0, ['brute_charge', 'brute_charge', 'brute_stomp', 'brute_stomp'])],
  cards: [
    card('brute_charge', 'Charge', 1, 'Runs up to 3 closer, hits for 4 and knocks its target back 2.', [
      { kind: 'advance', amount: 3 }, { kind: 'damage', amount: 4 }, { kind: 'push', amount: 2 },
    ]),
    card('brute_stomp', 'Stomp', 1, 'Closes up to 2 and hits for 6.', [{ kind: 'advance', amount: 2 }, { kind: 'damage', amount: 6 }]),
  ],
};

/** Sets its target's tile burning — the ground itself becomes the threat. */
export const HEXER = {
  enemies: [enemy('hexer', 'Hexer', 10, 3, ['hexer_scorch', 'hexer_scorch', 'hexer_drift'])],
  cards: [
    card('hexer_scorch', 'Scorch', 3, "Closes up to 2 and sets its target's tile burning: 3 damage a round for 2 rounds.", [
      { kind: 'advance', amount: 2 },
      { kind: 'terrain', rounds: 2, colour: '#e43b44', effects: [{ kind: 'damage', amount: 3 }] },
    ]),
    card('hexer_drift', 'Drift', 3, 'Closes up to 3.', [{ kind: 'advance', amount: 3 }]),
  ],
};

/** A telegraphed blast that catches everyone near its target — its own
 *  side too, so it can be baited into hitting them. */
export const BOMBARDIER = {
  enemies: [enemy('bombardier', 'Bombardier', 12, 1, ['bomb_lob', 'bomb_lob', 'bomb_walk'])],
  cards: [
    card('bomb_lob', 'Lob', 3, "Closes up to 1 and bursts on its target's tile: everyone within 1 takes 5.", [
      { kind: 'advance', amount: 1 },
      { kind: 'area', radius: 1, colour: '#feae34', effects: [{ kind: 'damage', amount: 5 }] },
    ]),
    card('bomb_walk', 'Walk', 3, 'Closes up to 3.', [{ kind: 'advance', amount: 3 }]),
  ],
};

/** Drags its target in, out of a safe spot and into the pack. */
export const GRAPPLER = {
  enemies: [enemy('grappler', 'Grappler', 12, 5, ['grappler_hook', 'grappler_hook', 'grappler_walk'])],
  cards: [
    card('grappler_hook', 'Hook', 4, 'Pulls its target up to 3 closer and hits for 3.', [{ kind: 'pull', amount: 3 }, { kind: 'damage', amount: 3 }]),
    card('grappler_walk', 'Walk', 4, 'Closes up to 3.', [{ kind: 'advance', amount: 3 }]),
  ],
};

export const withEnemy = (design: { enemies: Raw[]; cards: Raw[] }, zones: Record<string, string[]>) =>
  addEnemies(design.enemies, design.cards, zones);

/* The floor-2 wall: the marsh's Wyrm hits for 11 and can grow 3 stronger a
   turn, and brood spiders stack power. Softer versions of both. */
export const SOFTER_MARSH = (raw: Raw): void => {
  for (const card of raw['enemy-cards']) {
    if (card.id === 'wyrm_fire') card.effects = card.effects.map((e: Raw) => (e.kind === 'damage' ? { ...e, amount: 8 } : e));
    if (card.id === 'wyrm_fury') card.effects = card.effects.map((e: Raw) => (e.kind === 'power' ? { ...e, amount: 2 } : e));
    if (card.id === 'spider_brood') card.effects = card.effects.map((e: Raw) => (e.kind === 'power' ? { ...e, amount: 1 } : e));
  }
};

/* Cards the card study found out of line, brought back towards the pack.
   Wildfire's own text says it burns; its effects hand out power and cards
   instead, for twice X rounds — the strongest thing in the game by far. */
export const CARD_FIXES = (raw: Raw): void => {
  const set = (id: string, change: (card: Raw) => void) => {
    const found = raw.cards.find((card: Raw) => card.id === id);
    if (found) change(found);
  };
  set('wildfire', (card) => {
    card.effects = [{ kind: 'terrain', rounds: { of: 'x' }, colour: '#970af5', radius: 1, effects: [{ kind: 'power', amount: 1 }] }];
    card.text = 'Mark a tile within 3 and every tile within 1 of it: for X rounds, whoever is on it gains 1 power.';
  });
  set('surge', (card) => {
    card.effects = [{ kind: 'energy', amount: 1 }, { kind: 'draw', amount: 2 }];
    card.text = 'Gain 1 energy and draw 2 cards.';
  });
  set('knockback_x', (card) => {
    card.effects = [{ kind: 'damage', amount: { of: 'x', times: 3 } }, { kind: 'push', amount: { of: 'x' } }];
    card.text = 'Deal 3X damage to an adjacent enemy and knock it back X.';
  });
  set('flurry', (card) => {
    card.effects = [{ kind: 'damage', amount: { of: 'x', times: 5 } }];
    card.text = 'Deal 5X damage to an adjacent enemy.';
  });
  set('yank', (card) => {
    card.effects = [{ kind: 'pull', amount: 2 }, { kind: 'draw', amount: 1 }];
    card.text = 'Pull an enemy within 3 up to 2 closer and draw a card.';
  });
  set('patch_up', (card) => {
    card.cost = 0;
  });
};

export const HEXER_ZONES = { marsh: ['hexer'], highlands: ['hexer'] };

/** Basics with a way to use the board from the first turn. */
export const TACTICAL_DECK = ['strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'knockback', 'fire'];
export const TACTICAL_VARIED_DECK = ['strike', 'strike', 'strike', 'jab', 'guard', 'guard', 'guard', 'shrug', 'knockback', 'fire'];
