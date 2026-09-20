/* Talismans: treasures that stay with you for the rest of the run.

   Two ways to matter, and most use only one. `modifiers` change a stat for
   as long as you hold the talisman — nothing has to check for them, because
   every value already comes through `resolveStat`. `triggers` fire effects
   at a named point in the loop. */

import type { Effect, Trigger, TriggerPoint } from './effects';
import type { StatModifier } from './stats';

export interface TalismanDefinition {
  id: string;
  name: string;
  text: string;
  /** Glyph key, drawn by the HUD. */
  icon: string;
  modifiers?: StatModifier[];
  triggers?: Trigger[];
}

export const TALISMANS: Record<string, TalismanDefinition> = {
  satchel: {
    id: 'satchel',
    name: 'Worn Satchel',
    text: 'Draw one more card each turn.',
    icon: 'bag',
    modifiers: [{ stat: 'handSize', add: 1 }],
  },
  heartstone: {
    id: 'heartstone',
    name: 'Heartstone',
    text: 'Raise your maximum health by 10.',
    icon: 'heart',
    modifiers: [{ stat: 'maxHp', add: 10 }],
  },
  aegis: {
    id: 'aegis',
    name: 'Aegis Shard',
    text: 'Begin every turn with 3 block.',
    icon: 'shield',
    modifiers: [{ stat: 'blockPerRefresh', add: 3 }],
  },
  lodestone: {
    id: 'lodestone',
    name: 'Lodestone',
    text: 'Every card discarded is worth one more step.',
    icon: 'compass',
    modifiers: [{ stat: 'movementBonus', add: 1 }],
  },
  emberwick: {
    id: 'emberwick',
    name: 'Emberwick',
    text: 'Heal 2 whenever an enemy falls.',
    icon: 'flame',
    triggers: [{ on: 'enemyDefeated', effects: [{ kind: 'heal', amount: 2 }] }],
  },
  whetstone: {
    id: 'whetstone',
    name: 'Whetstone',
    text: 'Cards deal one more damage.',
    icon: 'blade',
    modifiers: [{ stat: 'damageBonus', add: 1 }],
  },
  tidecharm: {
    id: 'tidecharm',
    name: 'Tidecharm',
    text: 'Draw an extra card at the end of the enemy phase.',
    icon: 'wave',
    triggers: [{ on: 'enemyPhaseEnd', effects: [{ kind: 'draw', amount: 1 }] }],
  },
};

export const TALISMAN_IDS = Object.keys(TALISMANS);

export const talismanDef = (id: string): TalismanDefinition => {
  const def = TALISMANS[id];
  if (!def) throw new Error(`unknown talisman: ${id}`);
  return def;
};

/** Every modifier the held talismans contribute. */
export function talismanModifiers(held: readonly string[]): StatModifier[] {
  return held.flatMap((id) => talismanDef(id).modifiers ?? []);
}

/** Every effect the held talismans fire at this point in the loop. */
export function talismanEffects(held: readonly string[], point: TriggerPoint): Effect[] {
  return held.flatMap((id) =>
    (talismanDef(id).triggers ?? [])
      .filter((trigger) => trigger.on === point)
      .flatMap((trigger) => trigger.effects),
  );
}
