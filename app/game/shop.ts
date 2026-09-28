/* Shops, and the coins spent in them.

   Every enemy carries coins (`coins` on its definition) and drops them when
   it falls. Each floor has one shop, on the trail a little before its
   guardian wakes: step on to trade, step off and back on to trade again.

   A shop sells unlike things side by side — three cards, a gem, a talisman,
   and taking a card out of the deck — because the fun of a shop is weighing
   one against another, not picking the best of one kind.

   What a shop stocks is a function of the seed and the floor, rolled on a
   stream of its own (`hashSeed`), so adding shops left every seed's world,
   enemies and drops exactly as they were. `SHOP_PRICES` is the dial. */

import { cardDef } from './cards/definitions';
import type { Rarity } from './cards/types';
import { rollReward } from './rewards';
import { createRng, hashSeed } from './rng';
import { gateRowOf } from './map/tiles';

export type ShopKind = 'card' | 'gem' | 'talisman' | 'removal';

export interface ShopItem {
  kind: ShopKind;
  /** The card, gem or talisman on offer; none for a removal. */
  id?: string;
  sold: boolean;
}

export interface Shop {
  floor: number;
  row: number;
  col: number;
  items: ShopItem[];
  /** Opened at least once — the bot's cue to stop heading for it. */
  visited: boolean;
}

export const SHOP_PRICES = {
  card: { starter: 0, normal: 25, rare: 45, mythic: 75 } as Record<Rarity, number>,
  gem: 35,
  talisman: 70,
  /** A removal costs more each time one is bought, run-wide. */
  removal: 40,
  removalStep: 20,
};

/** The tile's colour: gold, like the coins. */
export const SHOP_COLOUR = '#feae34';

/** How many rows before a floor's end its shop stands: clear of the
 *  guardian's waking line, so shopping never wakes it. */
export const SHOP_ROWS_FROM_END = 10;

export const shopRowOf = (floor: number): number => gateRowOf(floor) - SHOP_ROWS_FROM_END;

/** What an item costs now. A removal's price rises with each bought. */
export function priceOf(item: ShopItem, removalsBought: number): number {
  switch (item.kind) {
    case 'card': return SHOP_PRICES.card[cardDef(item.id!).rarity];
    case 'gem': return SHOP_PRICES.gem;
    case 'talisman': return SHOP_PRICES.talisman;
    case 'removal': return SHOP_PRICES.removal + SHOP_PRICES.removalStep * removalsBought;
  }
}

/** A floor's stock: three cards, a gem, a talisman and a removal. */
export function rollStock(seed: number, floor: number): ShopItem[] {
  const rng = createRng(hashSeed(seed, 0x5709, floor));
  const only = (kind: ShopKind) => ({ card: 0, gem: 0, talisman: 0, removal: 0, [kind]: 1 });
  const items: ShopItem[] = [];

  const cards = rollReward(rng, { weights: only('card'), cardChoices: 3 });
  if (cards.kind === 'card') for (const id of cards.options) items.push({ kind: 'card', id, sold: false });
  const gem = rollReward(rng, { weights: only('gem') });
  if (gem.kind === 'gem') items.push({ kind: 'gem', id: gem.gemId, sold: false });
  // With no talismans enabled, a talisman roll falls back to cards: skip it.
  const talisman = rollReward(rng, { weights: only('talisman') });
  if (talisman.kind === 'talisman') items.push({ kind: 'talisman', id: talisman.talismanId, sold: false });
  items.push({ kind: 'removal', sold: false });
  return items;
}
