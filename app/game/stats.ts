/* Every number the run is built from, and how anything can change it.

   Nothing reads a bare constant: `handSize`, `maxEnergy`, even the damage a
   card deals, all come through `resolveStat`. A talisman that says
   `{ stat: 'handSize', add: 1 }` therefore works without a single branch
   anywhere else, and a new stat is one entry in this table.

   The four aura stats (`AURA_STATS`) are kept per aura type: a modifier of
   one names its aura (`{ stat: 'auraDamage', aura: 'fire', add: 1 }`), and
   counts only when that aura is asked about. Nothing about any aura is
   written in code — Fire is just the aura these modifiers name. */

import { auraType } from './auras';

export const BASE_STATS = {
  /** Player health. */
  maxHp: 40,
  /** Cards drawn at refresh. */
  handSize: 5,
  /** Energy restored at refresh. */
  maxEnergy: 3,
  /** Movement restored at refresh — the player's base speed. */
  movePerTurn: 3,
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
  /** How many tamed or summoned creatures can fight beside you at once. */
  maxAllies: 2,
  /** Damage for each tile of knockback left when a wall or a creature
   *  stops the one knocked back — to it, and to whatever it hit. */
  slamDamage: 2,
  /** Extra damage a blow deals for each layer the attacker stands above its
   *  target. 0 is off: height is scenery. Enemies use the base value. */
  highGround: 0,
  /** Per aura type: added to every point of damage a mark of it deals —
   *  every one, whoever laid it, worked out as it hits, so it reaches marks
   *  already down. */
  auraDamage: 0,
  /** Per aura type: what its damage is multiplied by, after `auraDamage`. */
  auraMultiplier: 1,
  /** Per aura type: rounds added to every mark of it as it is laid,
   *  whoever lays it. */
  auraRounds: 0,
  /** Per aura type: at 1 or more, its damage does not hurt the player. */
  auraWard: 0,
  /** At 1 or more, the refresh keeps the player's block rather than
   *  clearing it; block from `blockPerRefresh` goes on top. */
  keepBlock: 0,
} as const;

export type StatKey = keyof typeof BASE_STATS;

/** The stats kept per aura type. A modifier of one names its aura. */
export const AURA_STATS = ['auraDamage', 'auraMultiplier', 'auraRounds', 'auraWard'] as const satisfies readonly StatKey[];
export const isAuraStat = (key: StatKey): boolean => (AURA_STATS as readonly StatKey[]).includes(key);

export interface StatModifier {
  stat: StatKey;
  /** For an aura stat: the aura type it is about. Left out for any other. */
  aura?: string;
  /** Applied first, summed across every source. */
  add?: number;
  /** Applied to the sum, multiplied across every source. */
  mul?: number;
}

/** Base value, plus every `add`, times every `mul`. Rounded down, never
 *  below zero — no stat in this game is usefully negative. An aura stat is
 *  asked about one aura type, and only that type's modifiers count. */
export function resolveStat(key: StatKey, modifiers: readonly StatModifier[], aura?: string): number {
  let value: number = BASE_STATS[key];
  let factor = 1;

  for (const modifier of modifiers) {
    if (modifier.stat !== key || modifier.aura !== aura) continue;
    value += modifier.add ?? 0;
    factor *= modifier.mul ?? 1;
  }

  return Math.max(0, Math.floor(value * factor));
}

/** A stat's name, as the player reads it — an aura stat in its aura's own
 *  name: "fire damage", "rounds every poison lasts". */
export function statName(key: StatKey, aura?: string): string {
  const named = aura ? (auraType(aura)?.name ?? aura).toLowerCase() : null;
  if (!named || !isAuraStat(key)) return STAT_NAMES[key];
  switch (key) {
    case 'auraDamage': return `${named} damage`;
    case 'auraMultiplier': return `${named} damage multiplier`;
    case 'auraRounds': return `rounds every ${named} lasts`;
    default: return `protection from ${named}`;
  }
}

/** How a modifier reads on a talisman card. */
export function describeModifier(modifier: StatModifier): string {
  const name = statName(modifier.stat, modifier.aura);
  const parts: string[] = [];
  if (modifier.add) parts.push(`${modifier.add > 0 ? '+' : ''}${modifier.add} ${name}`);
  if (modifier.mul && modifier.mul !== 1) parts.push(`${name} x${modifier.mul}`);
  return parts.join(', ');
}

export const STAT_NAMES: Record<StatKey, string> = {
  maxHp: 'max health',
  handSize: 'hand size',
  maxEnergy: 'energy',
  movePerTurn: 'movement each turn',
  blockPerRefresh: 'block each turn',
  healPerRefresh: 'heal each turn',
  damageBonus: 'card damage',
  movementBonus: 'movement per discard',
  blockBonus: 'block from cards',
  maxAllies: 'allies you can keep',
  slamDamage: 'knockback slam damage',
  highGround: 'damage per layer of high ground',
  auraDamage: 'aura damage',
  auraMultiplier: 'aura damage multiplier',
  auraRounds: 'rounds an aura lasts',
  auraWard: 'protection from an aura',
  keepBlock: 'block kept between turns',
};

export const STAT_KEYS = Object.keys(BASE_STATS) as StatKey[];
