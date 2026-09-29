/* Gems.

   A card has GEM_SLOTS sockets. A gem set into one changes that card
   instance — the instance, not the card type, so socketing a ruby into one
   Strike leaves the other three alone. It can do it two ways, and one gem
   may do both:

   - effects, which happen after the card's own whenever it is played
     (Emerald: heal 5);
   - modifiers on the card itself: `cost` is added to its energy cost, never
     below 0 (Sapphire: −1); `damage` and `block` multiply the damage it
     deals and the block it gives (Ruby: ×1.5, Diamond: ×2). Several gems
     multiply together. */

import type { CardDefinition, CardInstance } from './cards/types';
import type { Effect } from './effects';

export const GEM_SLOTS = 3;

export interface GemDefinition {
  id: string;
  name: string;
  /** Rendered as the socket's colour. */
  colour: string;
  text: string;
  /** What happens after the card's own effects. May be empty for a gem
   *  that only changes the card. */
  effects: Effect[];
  /** Added to the card's energy cost, never below 0. An X card spends what
   *  it spends. */
  cost?: number;
  /** Multiplies the damage the card deals: its blows, its bursts and the
   *  fire it lights. Rounded down. */
  damage?: number;
  /** Multiplies the block the card gives. Rounded down. */
  block?: number;
  /** Off: no reward offers it. A gem already socketed keeps working. */
  enabled?: boolean;
}

/** Every gem, enabled or not. Content — `content/gems.json` — put here by
 *  `installContent`. */
export const GEMS: Record<string, GemDefinition> = {};

/** The gems a reward may offer: the enabled ones. */
export const GEM_IDS: string[] = [];

export const gemDef = (id: string): GemDefinition => {
  const def = GEMS[id];
  if (!def) throw new Error(`unknown gem: ${id}`);
  return def;
};

/** What a card's gems do to the card itself, all together. */
export interface GemMods {
  cost: number;
  damage: number;
  block: number;
}

export function gemMods(card: CardInstance): GemMods {
  const mods: GemMods = { cost: 0, damage: 1, block: 1 };
  for (const id of card.gems ?? []) {
    const gem = gemDef(id);
    mods.cost += gem.cost ?? 0;
    mods.damage *= gem.damage ?? 1;
    mods.block *= gem.block ?? 1;
  }
  return mods;
}

/** The card as this instance plays: its cost changed by its gems. Everything
 *  that asks what a card in hand costs goes through here. */
export function gemmedDef(def: CardDefinition, card: CardInstance): CardDefinition {
  const { cost } = gemMods(card);
  if (!cost || def.cost === 'X') return def;
  return { ...def, cost: Math.max(0, def.cost + cost) };
}
