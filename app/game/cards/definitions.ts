import type { CardDefinition, Rarity } from "./types";

/* Movement is no longer handed out each turn: the only way to cover ground
   is to give up a card for it. Rarer cards are worth more strides, which
   is the whole tension — the better the card, the more it costs to walk. */
export const MOVEMENT_BY_RARITY: Record<Rarity, number> = {
  starter: 2,
  normal: 2,
  rare: 3,
  mythic: 4,
};

/** What discarding this card is worth, unless it says otherwise. */
export const cardMovement = (def: CardDefinition): number =>
  def.movement ?? MOVEMENT_BY_RARITY[def.rarity];

export const CARDS: Record<string, CardDefinition> = {
  strike: {
    id: "strike",
    rarity: "starter",
    art: "slash",
    name: "Strike",
    cost: 1,
    targeting: "enemy",
    range: 1,
    text: "Deal 6 damage to an adjacent enemy.",
    effects: [{ kind: "damage", amount: 6 }],
  },
  bolt: {
    id: "bolt",
    rarity: "rare",
    art: "bolt",
    name: "Bolt",
    cost: 1,
    targeting: "enemy",
    range: 4,
    text: "Deal 4 damage at range.",
    effects: [{ kind: "damage", amount: 4 }],
  },
  guard: {
    id: "guard",
    rarity: "starter",
    art: "shield",
    name: "Guard",
    cost: 1,
    targeting: "self",
    range: 0,
    text: "Gain 5 block.",
    effects: [{ kind: "block", amount: 5 }],
  },
  survey: {
    id: "survey",
    rarity: "rare",
    art: "eye",
    name: "Survey",
    cost: 0,
    targeting: "self",
    range: 0,
    text: "Draw 2 cards.",
    effects: [{ kind: "draw", amount: 2 }],
  },
  jab: {
    id: 'jab', rarity: 'normal', art: 'slash', name: 'Jab', cost: 1, targeting: 'enemy', range: 1,
    text: 'Deal 4 damage to an adjacent enemy.',
    effects: [{ kind: 'damage', amount: 4 }],
  },
  shrug: {
    id: 'shrug', rarity: 'normal', art: 'shield', name: 'Shrug', cost: 0, targeting: 'self', range: 0,
    text: 'Gain 3 block.',
    effects: [{ kind: 'block', amount: 3 }],
  },
  scout: {
    id: 'scout', rarity: 'normal', art: 'eye', name: 'Scout', cost: 0, targeting: 'self', range: 0,
    text: 'Draw a card.',
    effects: [{ kind: 'draw', amount: 1 }],
  },
  cleave: {
    id: "cleave",
    rarity: "rare",
    art: "slash",
    name: "Cleave",
    cost: 2,
    targeting: "enemy",
    range: 1,
    text: "Deal 11 damage to an adjacent enemy.",
    effects: [{ kind: "damage", amount: 11 }],
  },
  mend: {
    id: "mend",
    rarity: "normal",
    art: "heart",
    name: "Mend",
    cost: 1,
    targeting: "self",
    range: 0,
    text: "Heal 5.",
    effects: [{ kind: "heal", amount: 5 }],
  },
  harry: {
    id: "harry",
    rarity: "rare",
    art: "bolt",
    name: "Harry",
    cost: 1,
    targeting: "enemy",
    range: 3,
    text: "Deal 3 damage and draw a card.",
    effects: [
      { kind: "damage", amount: 3 },
      { kind: "draw", amount: 1 },
    ],
  },
  surge: {
    id: "surge",
    rarity: "mythic",
    art: "bolt",
    name: "Surge",
    cost: 0,
    targeting: "self",
    range: 0,
    text: "Gain 2 energy and draw a card.",
    effects: [
      { kind: "energy", amount: 2 },
      { kind: "draw", amount: 1 },
    ],
  },
  bulwark: {
    id: "bulwark",
    rarity: "mythic",
    art: "shield",
    name: "Bulwark",
    cost: 2,
    targeting: "self",
    range: 0,
    text: "Gain 14 block.",
    effects: [{ kind: "block", amount: 14 }],
  },
  vault: {
    id: "vault",
    rarity: "mythic",
    art: "arc",
    name: "Vault",
    cost: 1,
    targeting: "cell",
    range: 3,
    text: "Leap to a cell within 3.",
    effects: [{ kind: "step", amount: 0 }],
  },
};

/* Enemy intents. The same shape, drawn from the enemy's own deck — kept
   apart from CARDS so a reward can never offer you an enemy's intention. */
export const INTENTS: Record<string, CardDefinition> = {
  approach: {
    id: "approach",
    rarity: "normal",
    name: "Approach",
    cost: 0,
    targeting: "none",
    range: 0,
    text: "Moves toward you.",
    effects: [],
  },
  strike_intent: {
    id: "strike_intent",
    rarity: "normal",
    name: "Strike",
    cost: 0,
    targeting: "none",
    range: 0,
    text: "Attacks if you are in reach.",
    effects: [],
  },
  brace: {
    id: "brace",
    rarity: "normal",
    name: "Brace",
    cost: 0,
    targeting: "none",
    range: 0,
    text: "Gains block.",
    effects: [{ kind: "block", amount: 4 }],
  },
  empower: {
    id: "empower",
    rarity: "normal",
    name: "Empower",
    cost: 0,
    targeting: "none",
    range: 0,
    text: "Grows stronger.",
    effects: [],
  },
};

export const cardDef = (id: string): CardDefinition => {
  const def = CARDS[id] ?? INTENTS[id] ?? INTENTS[`${id}_intent`];
  if (!def) throw new Error(`unknown card: ${id}`);
  return def;
};

/** Every player card. */
export const CARD_POOL = Object.keys(CARDS);

/* What a reward may offer. Starter cards are filtered out here rather than
   by giving them a weight of zero, so no enemy's reward table can ask for
   one by accident. */
export const REWARD_POOL = CARD_POOL.filter((id) => CARDS[id]!.rarity !== 'starter');

/** What the player starts a run with. */
export const STARTING_DECK: string[] = [
  "strike",
  "strike",
  "strike",
  "strike",
  "guard",
  "guard",
  "guard",
  "guard",
  "bolt",
  "bolt",
  "survey",
  "vault",
];
