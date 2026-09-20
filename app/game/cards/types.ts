import type { Effect } from '../effects';

/* Cards — the player's hand and the enemies' intents are the same shape.

   An effect is data, not a closure, so a card is serialisable, can come
   from an API, and can be logged and replayed. `resolveEffect` in
   actions.ts is the only place that knows what each one does. */

export type Targeting = 'none' | 'self' | 'cell' | 'enemy';

/** How hard a card is to come by. Drives the colour of its frame: grey for
 *  starter, black for normal, blue for rare, gold for mythic.
 *
 *  `starter` is the basic stock you begin with. It is never offered as a
 *  reward — winning another Strike is not a prize. */
export type Rarity = 'starter' | 'normal' | 'rare' | 'mythic';

/** Cards speak the same effect language as gems and talismans. */
export type CardEffect = Effect;

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity;
  targeting: Targeting;
  /** Cells away the target may be, for `cell` and `enemy` targeting. */
  range: number;
  text: string;
  effects: CardEffect[];
  /** Movement gained by discarding this card instead of playing it.
   *  Defaults to a value per rarity; set it to override that. */
  movement?: number;
  /** Key for the card's artwork. The render layer resolves it, and falls
   *  back to a drawn placeholder while there is no art. */
  art?: string;
}

/** A card in a pile. Duplicates of the same definition need distinct ids —
 *  and gems are socketed into the instance, so one Strike can carry a ruby
 *  while the other three stay plain. */
export interface CardInstance {
  uid: string;
  defId: string;
  gems?: string[];
}
