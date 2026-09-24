/* Gems.

   A card has GEM_SLOTS sockets. A gem set into one adds its effects to that
   card instance whenever it is played — the instance, not the card type, so
   socketing a ruby into one Strike leaves the other three alone. */

import type { Effect } from './effects';

export const GEM_SLOTS = 3;

export interface GemDefinition {
  id: string;
  name: string;
  /** Rendered as the socket's colour. */
  colour: string;
  text: string;
  effects: Effect[];
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
