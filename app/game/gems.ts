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
}

export const GEMS: Record<string, GemDefinition> = {
  ruby: {
    id: 'ruby',
    name: 'Ruby',
    colour: '#d9544d',
    text: 'Heal 1 when this card is played.',
    effects: [{ kind: 'heal', amount: 1 }],
  },
  sapphire: {
    id: 'sapphire',
    name: 'Sapphire',
    colour: '#4d8fd9',
    text: 'Gain 1 movement when this card is played.',
    effects: [{ kind: 'movement', amount: 1 }],
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    colour: '#4db97a',
    text: 'Gain 1 energy when this card is played.',
    effects: [{ kind: 'energy', amount: 1 }],
  },
};

export const GEM_IDS = Object.keys(GEMS);

export const gemDef = (id: string): GemDefinition => {
  const def = GEMS[id];
  if (!def) throw new Error(`unknown gem: ${id}`);
  return def;
};
