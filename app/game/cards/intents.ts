/* Enemy cards.

   An enemy's behaviour is a deck of these, listed on its definition. Each
   turn it plays the top card, resolving the effects in order — so
   `[advance 3, damage 4]` walks in, then strikes — and a new card is drawn
   at refresh and shown above its head, so you can see it coming.

   A card's `range` is its reach: `advance` stops as soon as the target is
   within it, and `damage` only lands if it still is when the blow comes.
   Damage adds the enemy's `power`, which `power` effects raise.

   The cards themselves are content — `content/enemy-cards.json` — and are
   put here by `installContent`. A new behaviour is a new card and a line in
   some enemy's deck; the rules never need to hear about it. */

import type { CardDefinition } from './types';

/** Every enemy card, enabled or not. Filled by `installContent`. */
export const INTENTS: Record<string, CardDefinition> = {};

export const intentDef = (id: string): CardDefinition => {
  const def = INTENTS[id];
  if (!def) throw new Error(`unknown enemy card: ${id}`);
  return def;
};
