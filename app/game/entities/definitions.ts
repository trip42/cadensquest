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
/** The dark column of the same sheet: guardians. */
const GUARDIAN_COLUMN = 1;

export const ENTITIES: Record<string, EntityDefinition> = {
  caden: {
    id: 'caden',
    name: 'Caden',
    faction: 'player',
    maxHp: 40,
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
    deck: [],
  },

  slime: {
    id: 'slime',
    name: 'Slime',
    faction: 'enemy',
    maxHp: 14,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 0, faces: -1, footprint: { width: 50, height: 36 } },
    animations: STATIC_ANIMATIONS,
    deck: ['slime_ooze', 'slime_ooze', 'slime_harden', 'slime_harden'],
    reward: { cardRarity: { normal: 85, rare: 15, mythic: 0 } },
  },

  dragon: {
    id: 'dragon',
    name: 'Dragon',
    faction: 'enemy',
    maxHp: 30,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 1, faces: -1, footprint: { width: 94, height: 70 } },
    animations: STATIC_ANIMATIONS,
    deck: ['dragon_breath', 'dragon_breath', 'dragon_rage', 'dragon_wingbeat'],
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
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 2, faces: -1, footprint: { width: 64, height: 40 } },
    animations: STATIC_ANIMATIONS,
    deck: ['bug_skitter', 'bug_skitter', 'bug_bite', 'bug_bite'],
  },

  spider: {
    id: 'spider',
    name: 'Spider',
    faction: 'enemy',
    maxHp: 12,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 3, faces: -1, footprint: { width: 70, height: 50 } },
    animations: STATIC_ANIMATIONS,
    deck: ['spider_spit', 'spider_spit', 'spider_scuttle', 'spider_brood'],
  },

  chicken: {
    id: 'chicken',
    name: 'Chicken',
    faction: 'enemy',
    maxHp: 6,
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 4, faces: -1, footprint: { width: 42, height: 48 } },
    animations: STATIC_ANIMATIONS,
    deck: ['chicken_flap', 'chicken_flap', 'chicken_peck', 'chicken_peck'],
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
    sprite: { kind: 'sheet', sheet: 'enemies', col: ENEMY_COLUMN, row: 5, faces: -1, footprint: { width: 76, height: 50 } },
    animations: STATIC_ANIMATIONS,
    deck: ['wolf_lunge', 'wolf_lunge', 'wolf_circle', 'wolf_circle'],
    reward: { weights: { card: 60, gem: 30, talisman: 10 } },
  },

  /* Guardians. Each holds the last row of a zone, and the way on stays shut
     until it falls. They are drawn from the dark column of the enemies sheet —
     the same creatures, gone wrong. They keep their post rather than chase,
     and always carry a talisman: the crossing is the prize. */
  warden: {
    id: 'warden',
    name: 'Warden',
    faction: 'enemy',
    maxHp: 44,
    sprite: { kind: 'sheet', sheet: 'enemies', col: GUARDIAN_COLUMN, row: 5, faces: -1, footprint: { width: 96, height: 64 } },
    animations: STATIC_ANIMATIONS,
    deck: ['warden_maul', 'warden_maul', 'warden_stand', 'warden_roar'],
    reward: { weights: { card: 0, gem: 0, talisman: 1 } },
    guardian: true,
  },
  wyrm: {
    id: 'wyrm',
    name: 'Wyrm',
    faction: 'enemy',
    maxHp: 64,
    sprite: { kind: 'sheet', sheet: 'enemies', col: GUARDIAN_COLUMN, row: 1, faces: -1, footprint: { width: 116, height: 86 } },
    animations: STATIC_ANIMATIONS,
    deck: ['wyrm_fire', 'wyrm_fire', 'wyrm_scales', 'wyrm_fury'],
    reward: { weights: { card: 0, gem: 0, talisman: 1 } },
    guardian: true,
  },
};


export const entityDef = (id: string): EntityDefinition => {
  const def = ENTITIES[id];
  if (!def) throw new Error(`unknown entity: ${id}`);
  return def;
};

/** Every enemy, for zone tables and tests to check against. */
export const ENEMY_IDS = Object.values(ENTITIES)
  .filter((def) => def.faction === 'enemy' && !def.guardian)
  .map((def) => def.id);

/** The zone guardians, kept apart from the enemies that roam. */
export const GUARDIAN_IDS = Object.values(ENTITIES)
  .filter((def) => def.guardian)
  .map((def) => def.id);
