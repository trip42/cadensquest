import type { CardDefinition, Rarity } from "./types";

/* Base movement now comes from the `movePerTurn` stat every turn. Discarding
   a card is the fallback for when that runs short, so it is worth a flat
   step regardless of rarity — otherwise a mythic would be more use thrown
   away than played. Still a dial, per rarity and per card. */
export const MOVEMENT_BY_RARITY: Record<Rarity, number> = {
  starter: 1,
  normal: 1,
  rare: 1,
  mythic: 1,
};

/** The energy playing this card spends: its cost, or for an X card all of
 *  it. An X card is playable at 0 energy — X is just 0. */
export const energySpent = (def: CardDefinition, energy: number): number =>
  def.cost === 'X' ? energy : def.cost;

/** The least energy it can be played with. */
export const minimumCost = (def: CardDefinition): number => (def.cost === 'X' ? 0 : def.cost);

/** What discarding this card is worth, unless it says otherwise. */
export const cardMovement = (def: CardDefinition): number =>
  def.movement ?? MOVEMENT_BY_RARITY[def.rarity];

/* The cards themselves are content — `content/cards.json` — and are put
   here by `installContent`. These are the same objects for the life of the
   page, refilled in place, so a module that imported them early still sees
   what is current. */

/** Every player card, enabled or not. */
export const CARDS: Record<string, CardDefinition> = {};

export const cardDef = (id: string): CardDefinition => {
  const def = CARDS[id];
  if (!def) throw new Error(`unknown card: ${id}`);
  return def;
};

/** Every enabled player card. */
export const CARD_POOL: string[] = [];

/* What a reward may offer: enabled, and not a starter. Starter cards are
   filtered out here rather than by giving them a weight of zero, so no
   enemy's reward table can ask for one by accident. */
export const REWARD_POOL: string[] = [];

/** What the player starts a run with — `content/run.json`. */
export const STARTING_DECK: string[] = [];
