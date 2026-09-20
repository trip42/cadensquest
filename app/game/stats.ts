/* Every number the run is built from, and how anything can change it.

   Nothing reads a bare constant: `handSize`, `maxEnergy`, even the damage a
   card deals, all come through `resolveStat`. A talisman that says
   `{ stat: 'handSize', add: 1 }` therefore works without a single branch
   anywhere else, and a new stat is one entry in this table. */

export const BASE_STATS = {
  /** Player health. */
  maxHp: 40,
  /** Cards drawn at refresh. */
  handSize: 5,
  /** Energy restored at refresh. */
  maxEnergy: 3,
  /** Block granted automatically each refresh. */
  blockPerRefresh: 0,
  /** Health restored each refresh. */
  healPerRefresh: 0,
  /** Added to every point of damage a card deals. */
  damageBonus: 0,
  /** Added to the movement gained from discarding a card. */
  movementBonus: 0,
  /** Added to the block a card grants. */
  blockBonus: 0,
} as const;

export type StatKey = keyof typeof BASE_STATS;

export interface StatModifier {
  stat: StatKey;
  /** Applied first, summed across every source. */
  add?: number;
  /** Applied to the sum, multiplied across every source. */
  mul?: number;
}

/** Base value, plus every `add`, times every `mul`. Rounded down, never
 *  below zero — no stat in this game is usefully negative. */
export function resolveStat(key: StatKey, modifiers: readonly StatModifier[]): number {
  let value: number = BASE_STATS[key];
  let factor = 1;

  for (const modifier of modifiers) {
    if (modifier.stat !== key) continue;
    value += modifier.add ?? 0;
    factor *= modifier.mul ?? 1;
  }

  return Math.max(0, Math.floor(value * factor));
}

/** How a modifier reads on a talisman card. */
export function describeModifier(modifier: StatModifier): string {
  const name = STAT_NAMES[modifier.stat];
  const parts: string[] = [];
  if (modifier.add) parts.push(`${modifier.add > 0 ? '+' : ''}${modifier.add} ${name}`);
  if (modifier.mul && modifier.mul !== 1) parts.push(`${name} x${modifier.mul}`);
  return parts.join(', ');
}

const STAT_NAMES: Record<StatKey, string> = {
  maxHp: 'max health',
  handSize: 'hand size',
  maxEnergy: 'energy',
  blockPerRefresh: 'block each turn',
  healPerRefresh: 'heal each turn',
  damageBonus: 'card damage',
  movementBonus: 'movement per discard',
  blockBonus: 'block from cards',
};
