/* Who is on the map. Stats and looks only — behaviour lives in the intent
   cards each one draws from.

   The six enemies come from the first column of the enemies sheet, one per
   row: slime, dragon, bug, spider, chicken, wolf. That artwork all faces
   left, which is what `faces: -1` tells the renderer, so it knows when to
   flip rather than assuming a direction. */

import { type AnimationSet, type EntityDefinition, STATIC_ANIMATIONS } from './types';

/* Caden's sheet is a real 8 by 4 grid: a row per cycle, eight frames each.
   The two attack rows are why `ranged` exists as a state of its own — a
   card thrown from across the map should not swing a bat.

   `hurt` and `die` have no art yet, so they sit on the standing row as
   single frames; the renderer gives a one-frame clip its movement, which
   is how those still read as a recoil and a fall. */
const CADEN_ANIMATIONS: AnimationSet = {
  idle: { frames: 8, fps: 8, loop: true, sheetRow: 0 },
  walk: { frames: 8, fps: 13, loop: true, sheetRow: 1 },
  attack: { frames: 8, fps: 15, loop: false, sheetRow: 2 },
  ranged: { frames: 8, fps: 15, loop: false, sheetRow: 3 },
  hurt: { frames: 1, fps: 4, loop: false, sheetRow: 0 },
  die: { frames: 1, fps: 2, loop: false, sheetRow: 0 },
};

/** Column of the enemies sheet these definitions draw from. */
const ENEMY_COLUMN = 0;

export const ENTITIES: Record<string, EntityDefinition> = {
  caden: {
    id: 'caden',
    name: 'Caden',
    faction: 'player',
    maxHp: 40,
    moveRange: 4,
    attackRange: 1,
    attackDamage: 6,
    // The artwork faces right, so `faces: 1` and the renderer flips the
    // other way. Row and column are the origin of Caden's block in the
    // sheet; each clip picks its row from there.
    sprite: {
      kind: 'sheet',
      sheet: 'caden',
      col: 0,
      row: 0,
      faces: 1,
      footprint: { width: 74, height: 102 },
      offsetY: 10,
    },
    animations: CADEN_ANIMATIONS,
    intents: [],
  },

  slime: {
    id: 'slime',
    name: 'Slime',
    faction: 'enemy',
    maxHp: 14,
    moveRange: 1,
    attackRange: 1,
    attackDamage: 3,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 0, faces: -1, footprint: { width: 50, height: 36 } },
    animations: STATIC_ANIMATIONS,
    intents: ['approach', 'strike', 'brace', 'brace'],
    reward: { cardRarity: { normal: 85, rare: 15, mythic: 0 } },
  },

  dragon: {
    id: 'dragon',
    name: 'Dragon',
    faction: 'enemy',
    maxHp: 30,
    moveRange: 2,
    attackRange: 3,
    attackDamage: 8,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 1, faces: -1, footprint: { width: 94, height: 70 } },
    animations: STATIC_ANIMATIONS,
    intents: ['strike', 'strike', 'empower', 'approach'],
    // The zone's centrepiece: more choices, better odds, and the only one
    // that leans towards talismans.
    reward: {
      weights: { card: 45, gem: 25, talisman: 30 },
      cardChoices: 4,
      cardRarity: { normal: 20, rare: 45, mythic: 35 },
    },
  },

  bug: {
    id: 'bug',
    name: 'Bug',
    faction: 'enemy',
    maxHp: 9,
    moveRange: 3,
    attackRange: 1,
    attackDamage: 3,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 2, faces: -1, footprint: { width: 64, height: 40 } },
    animations: STATIC_ANIMATIONS,
    intents: ['approach', 'approach', 'approach', 'strike'],
  },

  spider: {
    id: 'spider',
    name: 'Spider',
    faction: 'enemy',
    maxHp: 12,
    moveRange: 3,
    attackRange: 2,
    attackDamage: 4,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 3, faces: -1, footprint: { width: 70, height: 50 } },
    animations: STATIC_ANIMATIONS,
    intents: ['approach', 'strike', 'strike', 'empower'],
  },

  chicken: {
    id: 'chicken',
    name: 'Chicken',
    faction: 'enemy',
    maxHp: 6,
    moveRange: 4,
    attackRange: 1,
    attackDamage: 2,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 4, faces: -1, footprint: { width: 42, height: 48 } },
    animations: STATIC_ANIMATIONS,
    intents: ['approach', 'approach', 'strike', 'approach'],
    // Barely a threat, barely a prize.
    reward: {
      weights: { card: 80, gem: 20, talisman: 0 },
      cardChoices: 2,
      cardRarity: { normal: 95, rare: 5, mythic: 0 },
    },
  },

  wolf: {
    id: 'wolf',
    name: 'Wolf',
    faction: 'enemy',
    maxHp: 16,
    moveRange: 4,
    attackRange: 1,
    attackDamage: 6,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 5, faces: -1, footprint: { width: 76, height: 50 } },
    animations: STATIC_ANIMATIONS,
    intents: ['approach', 'strike', 'strike', 'brace'],
    reward: { weights: { card: 60, gem: 30, talisman: 10 } },
  },
};

export const entityDef = (id: string): EntityDefinition => {
  const def = ENTITIES[id];
  if (!def) throw new Error(`unknown entity: ${id}`);
  return def;
};

/** Every enemy, for zone tables and tests to check against. */
export const ENEMY_IDS = Object.values(ENTITIES)
  .filter((def) => def.faction === 'enemy')
  .map((def) => def.id);
