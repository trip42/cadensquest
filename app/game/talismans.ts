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
  /** Off: no reward offers it. One already held keeps working. */
  enabled?: boolean;
}

/** Every talisman, enabled or not. Content — `content/talismans.json` —
 *  put here by `installContent`. */
export const TALISMANS: Record<string, TalismanDefinition> = {};

/** The talismans a reward may offer: the enabled ones. */
export const TALISMAN_IDS: string[] = [];

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
