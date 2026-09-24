/* Who is on the map. Stats and looks only — behaviour lives in the cards
   each one draws from.

   The player is defined here. Enemies are content: `content/enemies.json`,
   installed into ENTITIES alongside him. Their artwork comes from the
   enemies sheet and all faces left, which is what `faces: -1` tells the
   renderer, so it knows when to flip rather than assuming a direction. */

import type { AnimationSet, EntityDefinition } from './types';

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

  // Every enemy and guardian is content — `content/enemies.json` — added
  // here by `installContent`. Only the player is defined in code.
};

export const entityDef = (id: string): EntityDefinition => {
  const def = ENTITIES[id];
  if (!def) throw new Error(`unknown entity: ${id}`);
  return def;
};

/** Enemies that may spawn: enabled, and not guardians. Zone tables are
 *  filtered through this, so disabling an enemy takes it off the map. */
export const ENEMY_IDS: string[] = [];

/** The zone guardians that stand: enabled ones. A zone whose guardian is
 *  disabled has no gate. */
export const GUARDIAN_IDS: string[] = [];
