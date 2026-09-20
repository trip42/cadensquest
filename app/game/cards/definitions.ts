import type { CardDefinition, Rarity } from './types';

/* Movement is no longer handed out each turn: the only way to cover ground
   is to give up a card for it. Rarer cards are worth more strides, which
   is the whole tension — the better the card, the more it costs to walk. */
export const MOVEMENT_BY_RARITY: Record<Rarity, number> = {
  normal: 1,
  rare: 2,
  mythic: 3,
};

/** What discarding this card is worth, unless it says otherwise. */
export const cardMovement = (def: CardDefinition): number =>
  def.movement ?? MOVEMENT_BY_RARITY[def.rarity];

export const CARDS: Record<string, CardDefinition> = {
  strike: {
    id: 'strike', rarity: 'normal', art: 'slash', name: 'Strike', cost: 1, targeting: 'enemy', range: 1,
    text: 'Deal 6 damage to an adjacent enemy.',
    effects: [{ kind: 'damage', amount: 6 }],
  },
  bolt: {
    id: 'bolt', rarity: 'rare', art: 'bolt', name: 'Bolt', cost: 1, targeting: 'enemy', range: 4,
    text: 'Deal 4 damage at range.',
    effects: [{ kind: 'damage', amount: 4 }],
  },
  guard: {
    id: 'guard', rarity: 'normal', art: 'shield', name: 'Guard', cost: 1, targeting: 'self', range: 0,
    text: 'Gain 5 block.',
    effects: [{ kind: 'block', amount: 5 }],
  },
  survey: {
    id: 'survey', rarity: 'rare', art: 'eye', name: 'Survey', cost: 0, targeting: 'self', range: 0,
    text: 'Draw 2 cards.',
    effects: [{ kind: 'draw', amount: 2 }],
  },
  vault: {
    id: 'vault', rarity: 'mythic', art: 'arc', name: 'Vault', cost: 1, targeting: 'cell', range: 3,
    text: 'Leap to a cell within 3.',
    effects: [{ kind: 'step', amount: 0 }],
  },

  /* Enemy intents. Same shape, drawn from the enemy's own deck. */
  approach: {
    id: 'approach', rarity: 'normal', name: 'Approach', cost: 0, targeting: 'none', range: 0,
    text: 'Moves toward you.',
    effects: [],
  },
  strike_intent: {
    id: 'strike_intent', rarity: 'normal', name: 'Strike', cost: 0, targeting: 'none', range: 0,
    text: 'Attacks if you are in reach.',
    effects: [],
  },
  brace: {
    id: 'brace', rarity: 'normal', name: 'Brace', cost: 0, targeting: 'none', range: 0,
    text: 'Gains block.',
    effects: [{ kind: 'block', amount: 4 }],
  },
  empower: {
    id: 'empower', rarity: 'normal', name: 'Empower', cost: 0, targeting: 'none', range: 0,
    text: 'Grows stronger.',
    effects: [],
  },
};

export const cardDef = (id: string): CardDefinition => {
  const def = CARDS[id] ?? CARDS[`${id}_intent`];
  if (!def) throw new Error(`unknown card: ${id}`);
  return def;
};

/** What the player starts a run with. */
export const STARTING_DECK: string[] = [
  'strike', 'strike', 'strike', 'strike',
  'guard', 'guard', 'guard', 'guard',
  'bolt', 'bolt',
  'survey', 'vault',
];
