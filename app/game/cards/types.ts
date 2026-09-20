/* Cards — the player's hand and the enemies' intents are the same shape.

   An effect is data, not a closure, so a card is serialisable, can come
   from an API, and can be logged and replayed. `resolveEffect` in
   actions.ts is the only place that knows what each one does. */

export type Targeting = 'none' | 'self' | 'cell' | 'enemy';

/** How hard a card is to come by. Drives the colour of its frame:
 *  black for normal, blue for rare, gold for mythic. */
export type Rarity = 'normal' | 'rare' | 'mythic';

export type CardEffect =
  | { kind: 'damage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'movement'; amount: number }
  | { kind: 'energy'; amount: number }
  | { kind: 'draw'; amount: number }
  | { kind: 'step'; amount: number }
  | { kind: 'heal'; amount: number };

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

/** A card in a pile. Duplicates of the same definition need distinct ids. */
export interface CardInstance {
  uid: string;
  defId: string;
}
